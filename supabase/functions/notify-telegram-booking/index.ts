const SLOT_LABELS: Record<string, string> = {
	"08-10": "8:00 – 10:00 AM",
	"12-14": "12:00 – 2:00 PM",
	"14-16": "2:00 – 4:00 PM",
	"20-22": "8:00 – 10:00 PM",
};

function formatDisplayDate(dateStr: string): string {
	return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-SG", {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function buildMessage(booking: Record<string, unknown>): string {
	const slotLabel = SLOT_LABELS[booking.slot_key as string] || (booking.slot_key as string);
	const dateLabel = formatDisplayDate(booking.booking_date as string);

	const lines = [
		"New booking from your website",
		"",
		`Name: ${booking.client_name}`,
		`Contact: ${booking.contact}`,
		`Date: ${dateLabel}`,
		`Time: ${slotLabel} (SGT)`,
	];

	if (booking.notes) {
		lines.push("", `Notes: ${booking.notes}`);
	}

	return lines.join("\n");
}

Deno.serve(async (request) => {
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	const botToken = Deno.env.get("BOT_TOKEN");
	const adminTelegramId = Deno.env.get("ADMIN_TELEGRAM_ID");

	if (!botToken || !adminTelegramId) {
		return Response.json({ error: "Missing function configuration" }, { status: 500 });
	}

	let payload: { type?: string; table?: string; record?: Record<string, unknown> };
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

	const message = buildMessage(booking);

	const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: adminTelegramId, text: message }),
	});

	if (!response.ok) {
		const body = await response.text();
		return Response.json({ error: `Telegram ${response.status}: ${body}` }, { status: 502 });
	}

	return Response.json({ notified: true });
});
