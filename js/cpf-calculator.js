(function () {
	// Keep this in sync with the ProsperityPath bot's cpfCalculatorService.js.
	//
	// CPF contribution, allocation and interest rules, effective 1 January 2026.
	// Sources: cpf.gov.sg "CPF Contribution Rates from 1 Jan 2026" and "CPF
	// Allocation Rates from 1 Jan 2026" (official PDFs), cpf.gov.sg "How much
	// extra interest can I earn on my CPF savings?", cpf.gov.sg's Jan 2026
	// Basic Healthcare Sum announcement, and cpf.gov.sg's Full Retirement Sum
	// and "closure of the Special Account" pages.
	const CPF_OW_CEILING = 8000;

	function formatCurrency(value) {
		return `$${Math.round(Number(value) || 0).toLocaleString("en-SG")}`;
	}

	// The projection itself lives in js/shared/cpfProjection.js (same file
	// as the bot's), so both give the same answer.
	function projectCpf(input) {
		return window.CpfProjection.project(input);
	}

	function setStatus(el, message, isError) {
		el.textContent = message || "";
		el.classList.toggle("error", Boolean(isError));
	}

	function updateSaRaLabel() {
		const ageEl = document.getElementById("cpf-age");
		const label = document.getElementById("cpf-sa-label");
		if (!ageEl || !label) return;
		const age = Number(ageEl.value);
		label.innerHTML = (age >= 55
			? "Current CPF Retirement Account (RA) balance ($)"
			: "Current CPF Special Account (SA) balance ($)") + " <em>Optional</em>";
	}

	// What paying for a home from OA does to the projection.
	function housingHtml(projection, targetAge, currentAge) {
		const h = projection.housing;
		if (!h) return "";
		const plan = [
			h.lumpSum > 0 ? `${formatCurrency(h.lumpSum)} downpayment` : "",
			h.monthly > 0 ? `${formatCurrency(h.monthly)}/month for ${h.years} years` : "",
		].filter(Boolean).join(" then ");
		let html = `<p class="calculator-note"><strong>Your home: ${plan}${h.fromAge > currentAge ? `, from age ${Math.round(h.fromAge)}` : ""}</strong></p><ul class="calculator-note-list">`;
		html += `<li>Paid from CPF OA: <strong>${formatCurrency(h.fromOa)}</strong></li>`;
		if (h.cash > 0) html += `<li>OA runs short, so paid in cash: <strong>${formatCurrency(h.cash)}</strong></li>`;
		html += `<li>Your CPF at ${targetAge} without the home: ${formatCurrency(h.totalWithout)}, so it costs about <strong>${formatCurrency(h.costToTotal)}</strong> of your CPF at ${targetAge}, counting the interest that money would have earned</li>`;
		if (projection.raAt55 !== null) {
			html += `<li>Retirement Account at 55: about ${formatCurrency(projection.raAt55)} (without the home, ${formatCurrency(h.raAt55Without)}; Full Retirement Sum &asymp; ${formatCurrency(projection.frsCap)})</li>`;
		}
		html += "</ul>";
		html += `<p class="calculator-note">That's the trade-off, not a loss: you get the home for it. If you sell, what you used plus the 2.5% interest it would have earned goes back into your CPF.${projection.raAt55 !== null && projection.raAt55 < projection.frsCap - 1 ? " Owning a home lets you set aside as little as the Basic Retirement Sum (half the full sum) at 55, but less in the RA means smaller CPF LIFE payouts from 65." : ""}</p>`;
		return html;
	}

	let cpfChartInstance = null;

	function renderChart(yearly) {
		const canvas = document.getElementById("cpf-chart-canvas");
		if (!canvas || typeof Chart === "undefined") return;

		const labels = yearly.map((y) => Math.round(y.age));
		const oaData = yearly.map((y) => Math.round(y.oa));
		const saRaData = yearly.map((y) => Math.round(y.sa + y.ra));
		const maData = yearly.map((y) => Math.round(y.ma));

		if (cpfChartInstance) {
			cpfChartInstance.destroy();
		}

		cpfChartInstance = new Chart(canvas.getContext("2d"), {
			type: "line",
			data: {
				labels,
				datasets: [
					{ label: "OA", data: oaData, borderColor: "#c9a84c", backgroundColor: "rgba(201, 168, 76, 0.16)", fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 },
					{ label: "SA / RA", data: saRaData, borderColor: "#6fae9c", backgroundColor: "rgba(111, 174, 156, 0.16)", fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 },
					{ label: "MediSave", data: maData, borderColor: "#b0764c", backgroundColor: "rgba(176, 118, 76, 0.16)", fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 },
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: "index", intersect: false },
				plugins: {
					legend: { labels: { color: "#c9c4b4", boxWidth: 12, font: { family: "inherit" } } },
					tooltip: {
						callbacks: {
							title: (items) => `Age ${items[0].label}`,
							label: (item) => `${item.dataset.label}: ${formatCurrency(item.parsed.y)}`,
						},
					},
				},
				scales: {
					x: {
						title: { display: true, text: "Age", color: "#888888" },
						ticks: { color: "#888888" },
						grid: { color: "rgba(255, 255, 255, 0.06)" },
					},
					y: {
						ticks: {
							color: "#888888",
							callback: (v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`),
						},
						grid: { color: "rgba(255, 255, 255, 0.06)" },
					},
				},
			},
		});
	}

	function initCpfCalculator() {
		const form = document.getElementById("cpf-form");
		const resultBox = document.getElementById("cpf-result");
		const status = document.getElementById("cpf-status");
		if (!form) return;

		const ageEl = document.getElementById("cpf-age");
		if (ageEl) ageEl.addEventListener("input", updateSaRaLabel);
		updateSaRaLabel();
		const houseMore = document.getElementById("cpf-house-more");
		const optional = (id) => {
			const el = document.getElementById(id);
			return el && el.value !== "" ? Number(el.value) : null;
		};
		function updateHousing() {
			if (houseMore) houseMore.hidden = !(optional("cpf-house-monthly") > 0 || optional("cpf-house-lump") > 0);
		}
		form.addEventListener("input", updateHousing);
		updateHousing();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "", false);

			const currentAge = Number(document.getElementById("cpf-age").value);
			const monthlyWage = Number(document.getElementById("cpf-wage").value);
			const oaBalance = Number(document.getElementById("cpf-oa").value) || 0;
			const growthRaw = document.getElementById("cpf-growth") ? document.getElementById("cpf-growth").value : "";
			const salaryGrowth = growthRaw === "" ? 0 : Number(growthRaw) / 100;
			const saOrRaBalance = Number(document.getElementById("cpf-sa").value);
			const maBalance = Number(document.getElementById("cpf-ma").value);
			// Standardised projection horizon: always to age 65, or 10 years
			// out for anyone who's already past 65.
			const targetAge = currentAge < 65 ? 65 : currentAge + 10;

			if (!(currentAge >= 16 && currentAge <= 90) || !(monthlyWage > 0) || oaBalance < 0 || saOrRaBalance < 0 || maBalance < 0 || !(salaryGrowth >= 0 && salaryGrowth <= 0.15)) {
				setStatus(status, "Please fill in every field with a valid number.", true);
				resultBox.hidden = true;
				return;
			}

			const housingMonthly = optional("cpf-house-monthly") || 0;
			const housingLump = optional("cpf-house-lump") || 0;
			const housingFrom = optional("cpf-house-from");
			const housingYears = optional("cpf-house-years");
			if (housingMonthly < 0 || housingLump < 0 || (housingFrom !== null && !(housingFrom >= 16 && housingFrom <= 90)) || (housingYears !== null && !(housingYears >= 1 && housingYears <= 35))) {
				setStatus(status, "Please check the home loan fields.", true);
				resultBox.hidden = true;
				return;
			}
			const housing = housingMonthly > 0 || housingLump > 0 ? { monthly: housingMonthly, lumpSum: housingLump, fromAge: housingFrom, years: housingYears } : null;

			const projection = projectCpf({ currentAge, targetAge, monthlyWage, oaBalance, saOrRaBalance, maBalance, salaryGrowth, housing });
			const { yearly, frsCap, bhsCap } = projection;
			const final = yearly[yearly.length - 1];

			const yearsUntil55 = Math.max(0, 55 - currentAge);
			const age55Year = new Date().getFullYear() + yearsUntil55;
			const age55Heading = `In ${age55Year}, when you turn 55`;

			resultBox.innerHTML =
				`<div class="calculator-result-headline"><span>At age ${targetAge}</span><strong>${formatCurrency(final.total)}</strong></div>` +
				`<div class="cpf-chart-wrap"><canvas id="cpf-chart-canvas" height="240"></canvas></div>` +
				`<div class="calculator-result-row"><span>OA · SA/RA · MediSave</span><strong>${formatCurrency(final.oa)} · ${formatCurrency(final.sa + final.ra)} · ${formatCurrency(final.ma)}</strong></div>` +
				`<div class="calculator-result-row"><span>In today's money (2% inflation)</span><strong>about ${formatCurrency(projection.todayDollars)}</strong></div>` +
				`<p class="calculator-note">Most of this isn't cash you can take out: the RA pays you monthly for life through CPF LIFE from 65, and MediSave is for healthcare.</p>` +
				`<p class="calculator-note">${monthlyWage > CPF_OW_CEILING ? `CPF counts pay up to $${CPF_OW_CEILING.toLocaleString("en-SG")} a month, so ${formatCurrency(CPF_OW_CEILING)} is used. ` : ""}${salaryGrowth > 0 ? `Pay grows ${Math.round(salaryGrowth * 1000) / 10}% a year. ` : "Pay stays flat; add a yearly pay rise for a truer picture. "}Uses 2026 CPF rates plus the 2027 increase for ages 55 to 65.${projection.housing ? "" : " Doesn't take out anything you use for housing; add your home loan above to see that."}</p>` +
				housingHtml(projection, targetAge, currentAge) +
				(currentAge >= 55
					? `<p class="calculator-note">Your Full Retirement Sum was set in the year you turned 55 and your Basic Healthcare Sum is fixed at 65. Check your exact figures in your CPF account.</p>`
					: `<p class="calculator-note">${age55Heading}:</p>` +
						`<ul class="calculator-note-list">` +
						`<li>Full Retirement Sum &asymp; ${formatCurrency(frsCap)}</li>` +
						`<li>Basic Healthcare Sum &asymp; ${formatCurrency(bhsCap)}</li>` +
						`</ul>`) +
				(saOrRaBalance === 0 || maBalance === 0
					? `<p class="calculator-note">SA/RA and/or MediSave started from $0 since they were left blank — only their share of your wage contribution is projected, not any existing savings there.</p>`
					: "") +
				`<p class="calculator-note">Educational estimate only, not financial advice.</p>`;

			resultBox.hidden = false;
			renderChart(yearly);
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		initCpfCalculator();
	});
})();
