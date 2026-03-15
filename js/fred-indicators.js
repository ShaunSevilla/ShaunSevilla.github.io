const FRED_API_KEY = "d7a8896858dcf22e5054692685d97569";
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CORS_PROXIES = [
	"https://api.allorigins.win/raw?url=",
	"https://corsproxy.io/?",
	"https://api.codetabs.com/v1/proxy?quest=",
];
const FETCH_TIMEOUT_MS = 6000;

const INDICATOR_GROUPS = [
	{
		name: "Inflation",
		items: [
			{ label: "CPI", id: "CPIAUCSL", format: "number" },
			{ label: "Core CPI", id: "CPILFESL", format: "number" },
			{ label: "PCE", id: "PCEPI", format: "number" },
			{ label: "Core PCE", id: "PCEPILFE", format: "number" },
			{ label: "PPI", id: "PPIACO", format: "number" },
		],
	},
	{
		name: "Labour Market",
		items: [
			{ label: "Initial Jobless Claims", id: "ICSA", format: "number" },
			{ label: "Continuing Claims", id: "CCSA", format: "number" },
			{ label: "Unemployment Rate", id: "UNRATE", format: "percent" },
			{ label: "Nonfarm Payrolls", id: "PAYEMS", format: "number" },
			{ label: "JOLTS Job Openings", id: "JTSJOL", format: "number" },
		],
	},
	{
		name: "Economic Activity",
		items: [
			{ label: "Michigan Consumer Sentiment", id: "UMCSENT", format: "number" },
			{ label: "Real GDP Growth", id: "A191RL1Q225SBEA", format: "percent" },
			{
				label: "NY Fed Services Activity",
				id: "BACDINA066MNFRBNY",
				format: "number",
			},
			{
				label: "Chicago Fed Mfg Activity",
				id: "CFSBCACTIVITYMFG",
				format: "number",
			},
		],
	},
];

function formatValue(value, format) {
	const n = Number(value);
	if (!Number.isFinite(n)) return "N/A";

	if (format === "percent") {
		return `${n.toFixed(1)}%`;
	}

	if (Math.abs(n) >= 1000) {
		return n.toLocaleString();
	}

	return n.toFixed(1);
}

function formatCompactDate(value) {
	if (!value) return "N/A";

	const parts = value.split("-");
	if (parts.length !== 3) return value;

	const [year, month, day] = parts;
	return `${day}${month}${year.slice(-2)}`;
}

async function fetchSeries(seriesId) {
	const params = new URLSearchParams({
		series_id: seriesId,
		api_key: FRED_API_KEY,
		file_type: "json",
		sort_order: "desc",
		limit: "12",
	});

	const url = `${FRED_BASE}?${params.toString()}`;
	const data = await fetchFredData(url, seriesId);
	const valid = (data.observations || []).filter((o) => o.value !== ".");

	return {
		latest: valid[0] || null,
		previous: valid[1] || null,
	};
}

async function fetchFredData(url, seriesId) {
	// Try direct first (works when CORS is allowed by browser/runtime)
	try {
		const direct = await fetchWithTimeout(url, {
			mode: "cors",
			timeoutMs: FETCH_TIMEOUT_MS,
		});
		if (direct.ok) {
			return await direct.json();
		}
	} catch (error) {
		// Ignore and continue to proxy fallbacks
	}

	// Fallback to proxies for browsers where FRED blocks CORS
	for (const proxy of CORS_PROXIES) {
		try {
			const proxiedUrl = proxy + encodeURIComponent(url);
			const response = await fetchWithTimeout(proxiedUrl, {
				timeoutMs: FETCH_TIMEOUT_MS,
			});
			if (!response.ok) continue;

			const text = await response.text();
			const parsed = JSON.parse(text);

			if (parsed && !parsed.error_code && Array.isArray(parsed.observations)) {
				return parsed;
			}
		} catch (error) {
			continue;
		}
	}

	throw new Error(`FRED request failed for ${seriesId}`);
}

async function fetchWithTimeout(url, options = {}) {
	const { timeoutMs = FETCH_TIMEOUT_MS, ...fetchOptions } = options;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(url, {
			...fetchOptions,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeoutId);
	}
}

function renderDashboard(groupResults) {
	const container = document.getElementById("fred-indicators");
	if (!container) return;

	let html = "";

	groupResults.forEach((group) => {
		html += `
			<section class="fred-group">
				<div class="fred-group-title">${group.name}</div>
				<table class="fred-table">
					<thead>
						<tr>
							<th>Indicator</th>
							<th>Latest</th>
							<th>Previous</th>
							<th>Date</th>
						</tr>
					</thead>
					<tbody>
		`;

		group.rows.forEach((row) => {
			html += `
				<tr>
					<td class="fred-indicator-name">${row.label}</td>
					<td class="fred-current">${row.latest}</td>
					<td>${row.previous}</td>
					<td class="fred-date">${row.date}</td>
				</tr>
			`;
		});

		html += `
					</tbody>
				</table>
			</section>
		`;
	});

	container.innerHTML = html;
}

async function loadIndicators() {
	const container = document.getElementById("fred-indicators");
	if (!container) return;

	try {
		const groupResults = [];

		for (const group of INDICATOR_GROUPS) {
			const rows = await Promise.all(
				group.items.map(async (item) => {
					try {
						const data = await fetchSeries(item.id);
						return {
							label: item.label,
							latest: data.latest
								? formatValue(data.latest.value, item.format)
								: "N/A",
							previous: data.previous
								? formatValue(data.previous.value, item.format)
								: "N/A",
							date: data.latest ? formatCompactDate(data.latest.date) : "N/A",
						};
					} catch (err) {
						return {
							label: item.label,
							latest: "N/A",
							previous: "N/A",
							date: "N/A",
						};
					}
				}),
			);

			groupResults.push({ name: group.name, rows });
		}

		renderDashboard(groupResults);
	} catch (error) {
		container.innerHTML =
			'<p class="fred-error">Unable to load indicators at the moment.</p>';
	}
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", loadIndicators);
} else {
	loadIndicators();
}
