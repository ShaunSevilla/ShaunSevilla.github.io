const NOTION_VERSION = "2025-09-03";

const SLOT_LABELS = {
	"08-10": "8–10am",
	"12-14": "12–2pm",
	"14-16": "2–4pm",
	"20-22": "8–10pm",
};

const STATUS_LABELS = {
	confirmed: "Confirmed",
	cancelled: "Cancelled",
	completed: "Completed",
	"no-show": "No-show",
};

function notionHeaders(apiKey) {
	return {
		Authorization: `Bearer ${apiKey}`,
		"Content-Type": "application/json",
		"Notion-Version": NOTION_VERSION,
	};
}

async function notionRequest(path, options, apiKey) {
	const response = await fetch(`https://api.notion.com/v1${path}`, {
		...options,
		headers: notionHeaders(apiKey),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Notion ${response.status}: ${body}`);
	}

	return response.json();
}

async function findExistingNotionPage(dataSourceId, bookingId, apiKey) {
	const result = await notionRequest(
		`/data_sources/${dataSourceId}/query`,
		{
			method: "POST",
			body: JSON.stringify({
				filter: {
					property: "Supabase ID",
					rich_text: { equals: bookingId },
				},
				page_size: 1,
			}),
		},
		apiKey,
	);

	return result.results?.[0] || null;
}

function buildNotionProperties(booking) {
	const slotLabel = SLOT_LABELS[booking.slot_key] || booking.slot_key;
	const statusLabel = STATUS_LABELS[booking.status] || booking.status;
	const start = `${booking.booking_date}T${booking.start_time}+08:00`;
	const end = `${booking.booking_date}T${booking.end_time}+08:00`;

	return {
		Booking: {
			title: [{ text: { content: `${booking.client_name} — ${slotLabel}` } }],
		},
		Date: { date: { start, end } },
		"Time Slot": { select: { name: slotLabel } },
		Status: { select: { name: statusLabel } },
		Name: { rich_text: [{ text: { content: booking.client_name } }] },
		Contact: { rich_text: [{ text: { content: booking.contact } }] },
		Notes: {
			rich_text: booking.notes
				? [{ text: { content: booking.notes.slice(0, 2000) } }]
				: [],
		},
		"Supabase ID": {
			rich_text: [{ text: { content: booking.id } }],
		},
		"Submitted At": { date: { start: booking.created_at } },
	};
}

async function createNotionPage(dataSourceId, booking, apiKey) {
	return notionRequest(
		"/pages",
		{
			method: "POST",
			body: JSON.stringify({
				parent: { type: "data_source_id", data_source_id: dataSourceId },
				properties: buildNotionProperties(booking),
			}),
		},
		apiKey,
	);
}

async function updateSupabaseSyncState(bookingId, values, supabaseUrl, serviceKey) {
	const response = await fetch(
		`${supabaseUrl}/rest/v1/consultation_bookings?id=eq.${encodeURIComponent(bookingId)}`,
		{
			method: "PATCH",
			headers: {
				apikey: serviceKey,
				Authorization: `Bearer ${serviceKey}`,
				"Content-Type": "application/json",
				Prefer: "return=minimal",
			},
			body: JSON.stringify(values),
		},
	);

	if (!response.ok) {
		throw new Error(`Supabase sync-state update failed: ${await response.text()}`);
	}
}

Deno.serve(async (request) => {
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	const notionApiKey = Deno.env.get("NOTION_API_KEY");
	const notionDataSourceId = Deno.env.get("NOTION_DATA_SOURCE_ID");
	const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
	const supabaseUrl = Deno.env.get("SUPABASE_URL");
	const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

	if (!notionApiKey || !notionDataSourceId || !webhookSecret || !supabaseUrl || !serviceKey) {
		return Response.json({ error: "Missing function configuration" }, { status: 500 });
	}

	if (request.headers.get("x-webhook-secret") !== webhookSecret) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	let payload;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	if (payload.type !== "INSERT" || payload.table !== "consultation_bookings") {
		return Response.json({ ignored: true });
	}

	const booking = payload.record;
	if (!booking?.id) {
		return Response.json({ error: "Missing booking record" }, { status: 400 });
	}

	try {
		const existing = await findExistingNotionPage(
			notionDataSourceId,
			booking.id,
			notionApiKey,
		);
		const notionPage = existing || (await createNotionPage(
			notionDataSourceId,
			booking,
			notionApiKey,
		));

		await updateSupabaseSyncState(
			booking.id,
			{
				notion_page_id: notionPage.id,
				notion_sync_status: "synced",
				notion_sync_error: null,
			},
			supabaseUrl,
			serviceKey,
		);

		return Response.json({ synced: true, notion_page_id: notionPage.id });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		try {
			await updateSupabaseSyncState(
				booking.id,
				{
					notion_sync_status: "failed",
					notion_sync_error: message.slice(0, 1000),
				},
				supabaseUrl,
				serviceKey,
			);
		} catch {
			// Preserve the original Notion error in the function response.
		}

		return Response.json({ error: message }, { status: 500 });
	}
});
