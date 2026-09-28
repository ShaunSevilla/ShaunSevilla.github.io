(function () {
	// Keep this in sync with the ProsperityPath bot's cpfCalculatorService.js.
	//
	// CPF contribution, allocation and interest rules, effective 1 January 2026.
	// Sources: cpf.gov.sg "CPF Contribution Rates from 1 Jan 2026" and "CPF
	// Allocation Rates from 1 Jan 2026" (official PDFs), cpf.gov.sg "How much
	// extra interest can I earn on my CPF savings?", and the CPF Board's Jan
	// 2026 Basic Healthcare Sum announcement.
	const CPF_OW_CEILING = 8000;
	const CPF_BHS = 79000;
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

			const redirectToRa = ageNow >= 55;
			if (redirectToRa && sa > 0) {
				ra += sa;
				sa = 0;
			}

			const extra = computeMonthlyExtraInterest({ ra, oa, sa, ma }, ageNow);

			oa += oa * (CPF_OA_INTEREST_RATE / 12);
			ma += ma * (CPF_SA_MA_RA_INTEREST_RATE / 12) + extra.ma;
			if (redirectToRa) {
				ra += ra * (CPF_SA_MA_RA_INTEREST_RATE / 12) + extra.ra + extra.oa;
			} else {
				sa += sa * (CPF_SA_MA_RA_INTEREST_RATE / 12) + extra.sa + extra.oa;
			}

			if (ma > CPF_BHS) {
				const overflow = ma - CPF_BHS;
				ma = CPF_BHS;
				if (redirectToRa) {
					ra += overflow;
				} else {
					sa += overflow;
				}
			}

			if (month % 12 === 0) {
				const age = currentAge + month / 12;
				yearly.push({ age, oa, sa, ra, ma, total: oa + sa + ra + ma });
			}
		}

		return { yearly };
	}

	function pickSnapshotIndices(count) {
		const indices = [];
		for (let i = 0; i < Math.min(count, 10); i += 1) indices.push(i);
		for (let i = 14; i < count - 1; i += 5) indices.push(i);
		if (count - 1 >= 10 && indices[indices.length - 1] !== count - 1) indices.push(count - 1);
		return indices;
	}

	function resultRow(label, value) {
		return `<div class="calculator-result-row"><span>${label}</span><strong>${value}</strong></div>`;
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
			const { yearly } = projection;
			const indices = pickSnapshotIndices(yearly.length);

			let rows = "";
			for (const idx of indices) {
				const snapshot = yearly[idx];
				rows += resultRow(`Age ${Math.round(snapshot.age)}`, `OA ${formatCurrency(snapshot.oa)} · SA/RA ${formatCurrency(snapshot.sa + snapshot.ra)} · MA ${formatCurrency(snapshot.ma)} · Total ${formatCurrency(snapshot.total)}`);
			}

			const final = yearly[yearly.length - 1];
			rows += resultRow(`At age ${targetAge}`, `Total ${formatCurrency(final.total)}`);
			rows += `<p class="calculator-note">Wage used: ${formatCurrency(Math.min(monthlyWage, CPF_OW_CEILING))}/month (capped at the $${CPF_OW_CEILING.toLocaleString("en-SG")} OW ceiling). Assumes CPF contribution &amp; allocation rates effective 1 Jan 2026; OA 2.5% p.a., SA/RA/MA 4% p.a.; extra interest of 1% on the first $60,000 combined balances (2%/1% tiers from age 55); your SA is assumed to move fully into RA at 55 (doesn't model the Full Retirement Sum cap); MediSave capped at the $79,000 Basic Healthcare Sum; based only on your stated wage (bonuses/AWS excluded). Educational estimate only, not financial advice.</p>`;

			resultBox.innerHTML = rows;
			resultBox.hidden = false;
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		initCpfCalculator();
	});
})();
