// Telegram alert for a new website booking. Called by the database trigger on
// INSERT into consultation_bookings. The URL is public, so the payload is never
// trusted: the booking is re-read from the database by id, and only a booking
// created in the last 10 minutes is announced. Fake or replayed calls send nothing.
const SLOT_LABELS: Record<string, string> = {
	"08-10": "8:00 – 10:00 AM",
	"12-14": "12:00 – 2:00 PM",
	"14-16": "2:00 – 4:00 PM",
	"20-22": "8:00 – 10:00 PM",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS = 10 * 60 * 1000;

type Booking = { id: string; booking_date: string; slot_key: string; client_name: string; contact: string; notes: string | null; created_at: string };

function formatDisplayDate(dateStr: string): string {
	return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function buildMessage(b: Booking): string {
	const lines = [
		"New booking from your website",
		"",
		`Name: ${b.client_name}`,
		`Contact: ${b.contact}`,
		`Date: ${formatDisplayDate(b.booking_date)}`,
		`Time: ${SLOT_LABELS[b.slot_key] || b.slot_key} (SGT)`,
	];
	if (b.notes) lines.push("", `Notes: ${b.notes}`);
	return lines.join("\n");
}

async function loadBooking(id: string): Promise<Booking | null> {
	const url = Deno.env.get("SUPABASE_URL");
	const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (!url || !key) throw new Error("Missing Supabase configuration");
	const res = await fetch(`${url}/rest/v1/consultation_bookings?id=eq.${id}&select=id,booking_date,slot_key,client_name,contact,notes,created_at`, {
		headers: { apikey: key, Authorization: `Bearer ${key}` },
	});
	if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
	const rows = (await res.json()) as Booking[];
	return rows[0] || null;
}

Deno.serve(async (request) => {
	if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

	const botToken = Deno.env.get("BOT_TOKEN");
	const adminTelegramId = Deno.env.get("ADMIN_TELEGRAM_ID");
	if (!botToken || !adminTelegramId) return Response.json({ error: "Missing function configuration" }, { status: 500 });

	let payload: { type?: string; table?: string; record?: { id?: unknown } };
	try {
		payload = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}
	if (payload.type !== "INSERT" || payload.table !== "consultation_bookings") return Response.json({ ignored: true });

	const id = String(payload.record?.id || "");
	if (!UUID.test(id)) return Response.json({ ignored: true });

	let booking: Booking | null;
	try {
		booking = await loadBooking(id);
	} catch (error) {
		return Response.json({ error: (error as Error).message }, { status: 500 });
	}
	if (!booking || Date.now() - new Date(booking.created_at).getTime() > FRESH_MS) return Response.json({ ignored: true });

	const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: adminTelegramId, text: buildMessage(booking) }),
	});
	if (!response.ok) return Response.json({ error: `Telegram ${response.status}` }, { status: 502 });
	return Response.json({ notified: true });
});
