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
	const CPF_BHS = 79000;
	// BHS has risen roughly 2.7%-6.6% a year over the past decade (2020:
	// $60,000 to 2026: $79,000 is a ~4.7% CAGR); 5% p.a. projects it forward
	// to the year each member turns 55.
	const CPF_BHS_GROWTH_RATE = 0.05;
	// Full Retirement Sum for the 2026 cohort. Used as the base year to cap
	// (a) the one-time SA-to-RA transfer at 55 (SA first, then OA; excess
	// parks in OA) and (b) MediSave-overflow that's redirected to SA/RA "to
	// help set aside your FRS" before it spills into OA. Because the FRS
	// keeps rising most years, it's projected forward (at CPF_FRS_GROWTH_RATE)
	// to estimate the cap that will actually apply in the year each member
	// turns 55, rather than holding today's figure fixed.
	const CPF_FRS = 220400;
	// FRS has been officially announced through the 2027 cohort ($228,200,
	// up from $220,400 for 2026 — a confirmed 3.5% increase). Source: cpf.gov.sg.
	const CPF_FRS_GROWTH_RATE = 0.035;
	const CPF_OA_INTEREST_RATE = 0.025;
	const CPF_SA_MA_RA_INTEREST_RATE = 0.04;
	const CPF_EXTRA_INTEREST_OA_CAP = 20000;
	const CPF_EXTRA_INTEREST_BELOW_55 = [{ cap: 60000, rate: 0.01 }];
	const CPF_EXTRA_INTEREST_55_PLUS = [
		{ cap: 30000, rate: 0.02 },
		{ cap: 30000, rate: 0.01 },
	];

	const CPF_CONTRIBUTION_BANDS = [
		{ maxAge: 55, total: 0.37 },
		{ maxAge: 60, total: 0.34 },
		{ maxAge: 65, total: 0.25 },
		{ maxAge: 70, total: 0.165 },
		{ maxAge: Infinity, total: 0.125 },
	];

	const CPF_ALLOCATION_BANDS = [
		{ maxAge: 35, oa: 0.6217, middle: 0.1621, ma: 0.2162, middleAccount: "SA" },
		{ maxAge: 45, oa: 0.5677, middle: 0.1891, ma: 0.2432, middleAccount: "SA" },
		{ maxAge: 50, oa: 0.5136, middle: 0.2162, ma: 0.2702, middleAccount: "SA" },
		{ maxAge: 55, oa: 0.4055, middle: 0.3108, ma: 0.2837, middleAccount: "SA" },
		{ maxAge: 60, oa: 0.3530, middle: 0.3382, ma: 0.3088, middleAccount: "RA" },
		{ maxAge: 65, oa: 0.14, middle: 0.44, ma: 0.42, middleAccount: "RA" },
		{ maxAge: 70, oa: 0.0607, middle: 0.3030, ma: 0.6363, middleAccount: "RA" },
		{ maxAge: Infinity, oa: 0.08, middle: 0.08, ma: 0.84, middleAccount: "RA" },
	];

	function formatCurrency(value) {
		return `$${Math.round(Number(value) || 0).toLocaleString("en-SG")}`;
	}

	function getContributionRate(age) {
		return CPF_CONTRIBUTION_BANDS.find((band) => age <= band.maxAge) || CPF_CONTRIBUTION_BANDS[CPF_CONTRIBUTION_BANDS.length - 1];
	}

	function getAllocation(age) {
		return CPF_ALLOCATION_BANDS.find((band) => age <= band.maxAge) || CPF_ALLOCATION_BANDS[CPF_ALLOCATION_BANDS.length - 1];
	}

	// The FRS and BHS both rise most years, so using today's figures for
	// someone still years away from 55 would understate the caps that will
	// actually apply. Projects both sums forward to the year the member
	// turns 55 (immediately, if they already have).
	function estimateFrsAndBhsAt55(currentAge) {
		const yearsUntil55 = Math.max(0, 55 - currentAge);
		const frsAt55 = CPF_FRS * Math.pow(1 + CPF_FRS_GROWTH_RATE, yearsUntil55);
		const bhsAt55 = CPF_BHS * Math.pow(1 + CPF_BHS_GROWTH_RATE, yearsUntil55);
		return { yearsUntil55, frsAt55, bhsAt55 };
	}

	function computeMonthlyExtraInterest({ ra, oa, sa, ma }, age) {
		const tiers = (age >= 55 ? CPF_EXTRA_INTEREST_55_PLUS : CPF_EXTRA_INTEREST_BELOW_55).map((tier) => ({ ...tier }));
		const order = [
			{ key: "ra", amount: ra },
			{ key: "oa", amount: Math.min(oa, CPF_EXTRA_INTEREST_OA_CAP) },
			{ key: "sa", amount: sa },
			{ key: "ma", amount: ma },
		];

		const extra = { ra: 0, oa: 0, sa: 0, ma: 0 };
		let tierIndex = 0;

		for (const { key, amount } of order) {
			let remaining = amount;
			while (remaining > 0 && tierIndex < tiers.length) {
				const tier = tiers[tierIndex];
				const take = Math.min(remaining, tier.cap);
				extra[key] += (take * tier.rate) / 12;
				tier.cap -= take;
				remaining -= take;
				if (tier.cap <= 0) tierIndex += 1;
			}
			if (tierIndex >= tiers.length) break;
		}

		return extra;
	}

	function projectCpf({ currentAge, targetAge, monthlyWage, oaBalance, saOrRaBalance, maBalance }) {
		let oa = oaBalance;
		let ma = maBalance;
		let sa = currentAge < 55 ? saOrRaBalance : 0;
		let ra = currentAge >= 55 ? saOrRaBalance : 0;

		// Use the FRS/BHS projected forward to the year this member turns
		// 55, rather than today's figures, as the caps applied throughout.
		const { frsAt55: frsCap, bhsAt55: bhsCap } = estimateFrsAndBhsAt55(currentAge);

		const totalMonths = Math.round((targetAge - currentAge) * 12);
		const yearly = [];

		for (let month = 1; month <= totalMonths; month += 1) {
			const ageNow = currentAge + (month - 1) / 12;
			const cappedWage = Math.min(monthlyWage, CPF_OW_CEILING);
			const { total: contributionRate } = getContributionRate(ageNow);
			const contribution = cappedWage * contributionRate;
			const allocation = getAllocation(ageNow);

			oa += contribution * allocation.oa;
			ma += contribution * allocation.ma;
			const middleAdd = contribution * allocation.middle;
			if (allocation.middleAccount === "SA") {
				sa += middleAdd;
			} else {
				ra += middleAdd;
			}

			// SA closure at 55: SA is transferred into RA first, then OA
			// tops it up, capped at the Full Retirement Sum — anything
			// above that stays in / moves to OA instead of RA.
			const redirectToRa = ageNow >= 55;
			if (redirectToRa && sa > 0) {
				const spaceInRa = Math.max(frsCap - ra, 0);
				const fromSa = Math.min(sa, spaceInRa);
				ra += fromSa;
				oa += sa - fromSa;
				sa = 0;

				const remainingSpace = Math.max(frsCap - ra, 0);
				if (remainingSpace > 0 && oa > 0) {
					const fromOa = Math.min(oa, remainingSpace);
					ra += fromOa;
					oa -= fromOa;
				}
			}

			const extra = computeMonthlyExtraInterest({ ra, oa, sa, ma }, ageNow);

			oa += oa * (CPF_OA_INTEREST_RATE / 12);
			ma += ma * (CPF_SA_MA_RA_INTEREST_RATE / 12) + extra.ma;
			if (redirectToRa) {
				ra += ra * (CPF_SA_MA_RA_INTEREST_RATE / 12) + extra.ra + extra.oa;
			} else {
				sa += sa * (CPF_SA_MA_RA_INTEREST_RATE / 12) + extra.sa + extra.oa;
			}

			// MediSave is capped at the Basic Healthcare Sum; overflow is
			// redirected to SA/RA to help set aside the Full Retirement
			// Sum, then spills into OA once that's reached.
			if (ma > bhsCap) {
				const overflow = ma - bhsCap;
				ma = bhsCap;
				if (redirectToRa) {
					const space = Math.max(frsCap - ra, 0);
					const toRa = Math.min(overflow, space);
					ra += toRa;
					oa += overflow - toRa;
				} else {
					const space = Math.max(frsCap - sa, 0);
					const toSa = Math.min(overflow, space);
					sa += toSa;
					oa += overflow - toSa;
				}
			}

			if (month % 12 === 0) {
				const age = currentAge + month / 12;
				yearly.push({ age, oa, sa, ra, ma, total: oa + sa + ra + ma });
			}
		}

		return { yearly, frsCap, bhsCap };
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
		label.textContent = age >= 55
			? "Current CPF Retirement Account (RA) balance ($)"
			: "Current CPF Special Account (SA) balance ($)";
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

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "", false);

			const currentAge = Number(document.getElementById("cpf-age").value);
			const monthlyWage = Number(document.getElementById("cpf-wage").value);
			const oaBalance = Number(document.getElementById("cpf-oa").value);
			const saOrRaBalance = Number(document.getElementById("cpf-sa").value);
			const maBalance = Number(document.getElementById("cpf-ma").value);
			const targetAge = Number(document.getElementById("cpf-target-age").value);

			if (!(currentAge >= 16 && currentAge <= 90) || !(monthlyWage > 0) || oaBalance < 0 || saOrRaBalance < 0 || maBalance < 0) {
				setStatus(status, "Please fill in every field with a valid number.", true);
				resultBox.hidden = true;
				return;
			}

			if (!Number.isInteger(targetAge) || targetAge <= currentAge) {
				setStatus(status, "Please enter a target age older than your current age.", true);
				resultBox.hidden = true;
				return;
			}

			if (targetAge - currentAge > 60) {
				setStatus(status, "Please project 60 years or fewer ahead.", true);
				resultBox.hidden = true;
				return;
			}

			const projection = projectCpf({ currentAge, targetAge, monthlyWage, oaBalance, saOrRaBalance, maBalance });
			const { yearly, frsCap, bhsCap } = projection;
			const final = yearly[yearly.length - 1];

			const allocation = getAllocation(currentAge);
			const middleLabel = allocation.middleAccount === "RA" ? "RA" : "SA";
			const yearsUntil55 = Math.max(0, 55 - currentAge);
			const age55Label = currentAge >= 55 ? "now (55+)" : `age 55, in ${yearsUntil55} year${yearsUntil55 === 1 ? "" : "s"}`;

			resultBox.innerHTML =
				`<div class="cpf-chart-wrap"><canvas id="cpf-chart-canvas" height="240"></canvas></div>` +
				`<div class="calculator-result-row"><span>At age ${targetAge}</span><strong>${formatCurrency(final.total)}</strong></div>` +
				`<div class="calculator-result-row"><span>OA · SA/RA · MediSave</span><strong>${formatCurrency(final.oa)} · ${formatCurrency(final.sa + final.ra)} · ${formatCurrency(final.ma)}</strong></div>` +
				`<p class="calculator-note">Wage used: ${formatCurrency(Math.min(monthlyWage, CPF_OW_CEILING))}/month (capped at the $${CPF_OW_CEILING.toLocaleString("en-SG")} OW ceiling). Assumes CPF contribution &amp; allocation rates effective 1 Jan 2026; OA 2.5% p.a., SA/RA/MA 4% p.a.; extra interest of 1% on the first $60,000 combined balances (2%/1% tiers from age 55). At your current age, monthly contributions split roughly ${Math.round(allocation.oa * 100)}% to OA, ${Math.round(allocation.middle * 100)}% to ${middleLabel}, and ${Math.round(allocation.ma * 100)}% to MediSave. Estimated at ${age55Label}: Full Retirement Sum &asymp; ${formatCurrency(frsCap)} (projected at 3.5% p.a. from the 2026 figure) and Basic Healthcare Sum &asymp; ${formatCurrency(bhsCap)} (projected at 5% p.a.). At 55, SA moves into RA (SA first, then OA) up to that projected Full Retirement Sum, with the rest parked in OA. MediSave is capped at the projected Basic Healthcare Sum, with any excess flowing to SA/RA up to the FRS, then to OA. Based only on your stated wage (bonuses/AWS excluded). Educational estimate only, not financial advice.</p>`;

			resultBox.hidden = false;
			renderChart(yearly);
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		initCpfCalculator();
	});
})();
