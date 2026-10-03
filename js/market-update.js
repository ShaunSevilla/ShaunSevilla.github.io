// Market Update page. Reads the one snapshot Shaun has approved on Telegram
// (Supabase function get_published_market_update). Nothing here ever sees
// unapproved figures: the function only returns the published row.
const MARKET_SUPABASE_URL = "https://rubfkxwhieqwqjeaoszi.supabase.co";
const MARKET_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4njA-v1tihYv3JdxLAbVMQ_AhOZiicx";

const MARKET_COLUMNS = [
	{ key: "current", label: "Now" },
	{ key: "previous", label: "Before" },
	{ key: "consensus", label: "Expected" },
];

async function loadPublishedMarketUpdate() {
	const response = await fetch(`${MARKET_SUPABASE_URL}/rest/v1/rpc/get_published_market_update`, {
		method: "POST",
		cache: "no-store",
		headers: {
			apikey: MARKET_SUPABASE_PUBLISHABLE_KEY,
			Authorization: `Bearer ${MARKET_SUPABASE_PUBLISHABLE_KEY}`,
			"Content-Type": "application/json",
		},
		body: "{}",
	});
	if (!response.ok) {
		throw new Error(`Request failed (${response.status})`);
	}
	return response.json();
}

function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function buildSection(section) {
	const wrapper = el("section", "mu-section");
	wrapper.appendChild(el("h2", "mu-section-title", section.title));

	const table = el("table", "mu-table");
	const head = el("thead");
	const headRow = el("tr");
	headRow.appendChild(el("th", "", "Indicator"));
	for (const column of MARKET_COLUMNS) headRow.appendChild(el("th", "", column.label));
	head.appendChild(headRow);
	table.appendChild(head);

	const body = el("tbody");
	for (const row of section.rows) {
		const tr = el("tr");
		tr.appendChild(el("th", "mu-name", row.name));
		for (const column of MARKET_COLUMNS) {
			const cell = el("td", column.key === "current" ? "mu-current" : "", row[column.key] || "—");
			// Phones show each row as a card, with the column name before the value.
			cell.setAttribute("data-label", column.label);
			tr.appendChild(cell);
		}
		body.appendChild(tr);
	}
	table.appendChild(body);
	wrapper.appendChild(table);
	return wrapper;
}

function formatPublished(value) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
}

function showMarketError() {
	document.getElementById("mu-asof").textContent = "";
	document.getElementById("mu-error").hidden = false;
}

async function initMarketUpdate() {
	const container = document.getElementById("mu-sections");
	if (!container) return;

	let result;
	try {
		result = await loadPublishedMarketUpdate();
	} catch (error) {
		console.error("Market update failed to load:", error);
		showMarketError();
		return;
	}

	const sections = result?.data?.sections;
	if (!Array.isArray(sections) || !sections.length) {
		showMarketError();
		return;
	}

	for (const section of sections) container.appendChild(buildSection(section));

	const published = formatPublished(result.published_at);
	document.getElementById("mu-asof").textContent = `As of ${result.as_of || "the latest run"}${published ? ` · Published ${published}` : ""}`;
}

initMarketUpdate();
