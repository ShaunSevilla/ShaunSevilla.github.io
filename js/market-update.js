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

// Bullish or bearish: did the figure come in above or below what was expected
// (or the last reading when there's no forecast), and is higher good news?
// Higher inflation and joblessness weigh on stocks; growth and spending help.
const SENTIMENT_RULES = [
	{ test: /fed funds|interest rate|policy rate/i, kind: "rate" },
	{ test: /cpi|pce|ppi|inflation|price/i, higherIs: "bearish", up: "Hotter than", down: "Cooler than" },
	{ test: /unemployment|jobless|claims/i, higherIs: "bearish", up: "Higher than", down: "Lower than" },
	{ test: /payroll|gdp|sentiment|confidence|pmi|retail|spending|income/i, higherIs: "bullish", up: "Stronger than", down: "Weaker than" },
];

const NUMBER = /([+\-−]?\d[\d,]*(?:\.\d+)?)/;

function toNumber(text) {
	return Number(String(text).replace(/,/g, "").replace("−", "-"));
}

// The number tagged with a unit (YoY or MoM), or the first number in the cell.
function readFigure(text, unit) {
	const s = String(text || "");
	if (unit) {
		const tagged = s.match(new RegExp(`${NUMBER.source}\\s*%?\\s*${unit}`, "i"));
		return tagged ? toNumber(tagged[1]) : null;
	}
	const first = s.match(NUMBER);
	return first ? toNumber(first[1]) : null;
}

// Compare like with like: YoY with YoY, MoM with MoM, else the headline numbers.
function compareFigures(current, target) {
	if (DASH_ONLY.test(String(target || "").trim())) return null;
	for (const unit of ["YoY", "MoM"]) {
		const t = readFigure(target, unit);
		const c = readFigure(current, unit);
		if (t !== null && c !== null) return c - t;
		if (t !== null) return null;
	}
	const t = readFigure(target);
	const c = readFigure(current);
	return t === null || c === null || Number.isNaN(t) || Number.isNaN(c) ? null : c - t;
}

function sentimentFor(row) {
	const rule = SENTIMENT_RULES.find((r) => r.test.test(row.name || ""));
	if (!rule || DASH_ONLY.test(String(row.current || "").trim())) return null;
	if (rule.kind === "rate") {
		const change = compareFigures(row.current, row.previous);
		if (change === null) return null;
		if (/hike/i.test(row.current) || change > 0) return { tone: "bearish", reason: "Rate hike" };
		if (/cut/i.test(row.current) || change < 0) return { tone: "bullish", reason: "Rate cut" };
		return { tone: "neutral", reason: "Rate held" };
	}
	let diff = compareFigures(row.current, row.consensus);
	let versus = "expected";
	if (diff === null) {
		diff = compareFigures(row.current, row.previous);
		versus = "before";
	}
	if (diff === null) return null;
	if (Math.abs(diff) < 1e-9) return { tone: "neutral", reason: versus === "expected" ? "In line with expected" : "Same as before" };
	const higher = diff > 0;
	const tone = higher === (rule.higherIs === "bullish") ? "bullish" : "bearish";
	return { tone, reason: `${higher ? rule.up : rule.down} ${versus}` };
}

const TONE_LABEL = { bullish: "Bullish", bearish: "Bearish", neutral: "Neutral" };

function buildSignal(signal) {
	const cell = el("td", "mu-signal");
	cell.setAttribute("data-label", "Signal");
	if (!signal) {
		cell.textContent = "—";
		return cell;
	}
	cell.appendChild(el("span", `mu-tone is-${signal.tone}`, TONE_LABEL[signal.tone]));
	cell.appendChild(el("span", "mu-tone-why", signal.reason));
	return cell;
}

function buildSection(section) {
	const wrapper = el("section", "mu-section");
	const signals = section.rows.map(sentimentFor);
	const title = el("h2", "mu-section-title", section.title);
	const bulls = signals.filter((x) => x && x.tone === "bullish").length;
	const bears = signals.filter((x) => x && x.tone === "bearish").length;
	if (bulls || bears) {
		const overall = bulls > bears ? "bullish" : bears > bulls ? "bearish" : "neutral";
		const label = overall === "neutral" ? "Mixed" : `Mostly ${overall}`;
		title.appendChild(el("span", `mu-tone mu-tone-overall is-${overall}`, `${label} · ${bulls} bullish, ${bears} bearish`));
	}
	wrapper.appendChild(title);

	const table = el("table", "mu-table");
	const head = el("thead");
	const headRow = el("tr");
	headRow.appendChild(el("th", "", "Indicator"));
	for (const column of MARKET_COLUMNS) headRow.appendChild(el("th", "", column.label));
	headRow.appendChild(el("th", "", "Signal"));
	head.appendChild(headRow);
	table.appendChild(head);

	const body = el("tbody");
	section.rows.forEach((row, index) => {
		const tr = el("tr");
		tr.appendChild(el("th", "mu-name", row.name));
		for (const column of MARKET_COLUMNS) {
			const cell = el("td", column.key === "current" ? "mu-current" : "", row[column.key] || "—");
			// Phones show each row as a card, with the column name before the value.
			cell.setAttribute("data-label", column.label);
			tr.appendChild(cell);
		}
		tr.appendChild(buildSignal(signals[index]));
		body.appendChild(tr);
	});
	table.appendChild(body);
	wrapper.appendChild(table);
	return wrapper;
}

const DAILY_BLOCKS = [
	{ key: "drivers", title: "What's driving the market", max: 6, ordered: false },
	{ key: "growth", title: "Growth to watch", max: 3, ordered: true },
	{ key: "value", title: "Value to watch", max: 3, ordered: true },
	{ key: "etfs", title: "ETFs to watch", max: 3, ordered: true },
	{ key: "startups", title: "Startups to watch (high risk, often unlisted)", max: 3, ordered: true },
];

// Today's watchlist: sector drivers plus the top 3 of each list. Text only.
function buildDaily(daily) {
	const wrapper = el("section", "mu-section mu-daily");
	wrapper.appendChild(el("h2", "mu-section-title", "☀️ Today's watchlist"));
	const grid = el("div", "mu-daily-grid");
	for (const block of DAILY_BLOCKS) {
		const items = Array.isArray(daily[block.key]) ? daily[block.key].slice(0, block.max) : [];
		if (!items.length) continue;
		const card = el("div", "mu-daily-card");
		card.appendChild(el("h3", "mu-daily-title", block.title));
		const list = el(block.ordered ? "ol" : "ul", "mu-daily-list");
		for (const item of items) list.appendChild(el("li", "", String(item).replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "")));
		card.appendChild(list);
		grid.appendChild(card);
	}
	wrapper.appendChild(grid);
	wrapper.appendChild(el("p", "mu-daily-note", "Research ideas for learning, not recommendations."));
	return grid.children.length ? wrapper : null;
}

// Market Pulse: index ETFs and gauges, each with what it tells you.
const PULSE_INFO = [
	[/s&p|spy/i, "The whole US market: the general mood"],
	[/nasdaq|qqq/i, "Big tech"],
	[/russell|iwm/i, "Small companies, the most sensitive to interest rates"],
	[/dow|dia\b/i, "30 old-economy blue chips"],
	[/sti\b|straits|es3/i, "Singapore's top 30 companies"],
	[/treasur|tlt|bond/i, "Long-term bonds: rise when markets expect rate cuts"],
	[/gold|gld/i, "The safe haven"],
	[/vix|fear/i, "The fear gauge: higher means more nervous"],
];

const DASH_ONLY = /^(?:[—–-]+|n\/a)?$/i;

// Green for good, red for bad. For the VIX (fear) a fall is the good news.
function changeTone(value, name) {
	const s = String(value || "").trim();
	if (DASH_ONLY.test(s) || /^\+?0(?:\.0+)?%?$/.test(s)) return "is-flat";
	const down = /^[-−–]/.test(s);
	const fear = /vix|fear/i.test(name || "");
	return down !== fear ? "is-down" : "is-up";
}

function buildPulse(pulse) {
	const wrapper = el("section", "mu-section mu-pulse");
	wrapper.appendChild(el("h2", "mu-section-title", "📊 Market pulse"));
	const grid = el("div", "mu-pulse-grid");
	for (const g of pulse) {
		const card = el("div", "mu-pulse-card");
		const head = el("div", "mu-pulse-head");
		head.appendChild(el("span", "mu-pulse-name", g.name));
		head.appendChild(el("span", `mu-pulse-day ${changeTone(g.day, g.name)}`, g.day || "—"));
		card.appendChild(head);
		card.appendChild(el("strong", "mu-pulse-price", g.price));
		if (g.ytd && !DASH_ONLY.test(g.ytd.trim())) card.appendChild(el("span", `mu-pulse-ytd ${changeTone(g.ytd, g.name)}`, `${g.ytd} this year`));
		const info = PULSE_INFO.find(([pattern]) => pattern.test(g.name));
		if (info) card.appendChild(el("p", "mu-pulse-info", info[1]));
		grid.appendChild(card);
	}
	wrapper.appendChild(grid);
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

	if (Array.isArray(result.data.pulse) && result.data.pulse.length) {
		container.appendChild(buildPulse(result.data.pulse));
	}
	if (result.data.daily) {
		const daily = buildDaily(result.data.daily);
		if (daily) container.appendChild(daily);
	}
	for (const section of sections) container.appendChild(buildSection(section));

	const published = formatPublished(result.published_at);
	document.getElementById("mu-asof").textContent = `As of ${result.as_of || "the latest run"}${published ? ` · Published ${published}` : ""}`;
}

initMarketUpdate();
