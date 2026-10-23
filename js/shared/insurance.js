// Insurance benchmark: how much cover someone on this income should have,
// what they already have, and the gap. Shared, unchanged, by the Telegram bot
// and the website. Keep both copies identical:
//   Prosperity_Bot/src/shared/insurance.js
//   ShaunSevilla.github.io/js/shared/insurance.js
//
// Shaun's planning benchmarks (a little above LIA Singapore / MoneySense's
// 9x and 4x, to leave room for debts and inflation):
//   death and total permanent disability (TPD): 10x annual income
//   critical illness (CI): 5x annual income
//   premiums: within about 10% of income
//
// Hospital bill split (hospitalShare), Integrated Shield Plan rules (MOH,
// Nov 2025 announcement; new riders from 1 Apr 2026):
//   minimum deductible per policy year: Private/A $3,500, B1 $2,500,
//     B2 $2,000, C $1,500
//   no rider: you pay the deductible, then 10% of the rest
//   rider bought before 1 Apr 2026: typically covers the deductible; you pay
//     5% of the bill, capped at $3,000 a year (panel / pre-authorised claims)
//   rider bought from 1 Apr 2026: can't cover the deductible; then 5% of the
//     rest, capped at $6,000 a year (panel / pre-authorised claims)
// Assumes the whole bill is claimable and within the plan's limits.
//
// Foreigners (EP, S Pass, Work Permit, Dependant's Pass): no MediShield Life,
// no Shield plans, no subsidised wards, no CPF Dependants' Protection Scheme.
// Their hospital cover is a company or private plan with a yearly limit
// (employers must insure S Pass and Work Permit holders for at least $60,000
// a year, MOM, since 1 Jul 2023; there's no such rule for EP holders), so
// foreignerShare() is simply what's above that limit.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.Insurance = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	const DEATH_TPD_X = 10;
	const CI_X = 5;
	const PREMIUM_SHARE = 0.1; // of monthly income

	function money(value) {
		return `$${Math.round(Number(value) || 0).toLocaleString("en-SG")}`;
	}

	// input: { monthlyIncome, existingDeathTpd (optional), existingCi (optional), foreigner (optional) }
	function calculate(input) {
		const monthly = Math.max(0, Number(input.monthlyIncome) || 0);
		const annual = monthly * 12;
		const has = (v) => v !== null && v !== undefined && v !== "" && Number(v) >= 0;
		const existingDeathTpd = has(input.existingDeathTpd) ? Number(input.existingDeathTpd) : null;
		const existingCi = has(input.existingCi) ? Number(input.existingCi) : null;
		const deathTpd = annual * DEATH_TPD_X;
		const ci = annual * CI_X;
		return {
			monthlyIncome: Math.round(monthly),
			annualIncome: Math.round(annual),
			deathTpd: Math.round(deathTpd),
			ci: Math.round(ci),
			premiumCeiling: Math.round(monthly * PREMIUM_SHARE),
			existingDeathTpd,
			existingCi,
			gapDeathTpd: existingDeathTpd === null ? null : Math.max(0, Math.round(deathTpd - existingDeathTpd)),
			gapCi: existingCi === null ? null : Math.max(0, Math.round(ci - existingCi)),
			foreigner: Boolean(input.foreigner),
		};
	}

	// Plain-language result, shared by the bot (text) and the website (HTML).
	function summary(r) {
		const lead = `On ${money(r.monthlyIncome)} a month, the benchmark says you should be insured for at least ${money(r.deathTpd)} in case you pass away or can never work again, and ${money(r.ci)} for critical illness.`;
		const rows = [];
		if (r.existingDeathTpd !== null) {
			rows.push(["Death & TPD you have", money(r.existingDeathTpd)]);
			rows.push(["Death & TPD gap to the benchmark", r.gapDeathTpd > 0 ? money(r.gapDeathTpd) : "None, you're at or above it"]);
		}
		if (r.existingCi !== null) {
			rows.push(["Critical illness you have", money(r.existingCi)]);
			rows.push(["Critical illness gap to the benchmark", r.gapCi > 0 ? money(r.gapCi) : "None, you're at or above it"]);
		}
		const askedAboutCover = r.existingDeathTpd !== null || r.existingCi !== null;
		const countIt = r.foreigner
			? (askedAboutCover
				? "Count all of it: your own policies, cover from work, and any policy back home that still pays out if you live in Singapore."
				: "Do you know how much you already have? Add your existing cover to see your gap, including cover from work and any policy back home.")
			: (askedAboutCover
				? "Count all of it: your own policies, any cover from work, and CPF's Dependants' Protection Scheme (up to $70,000 until 65). MediShield Life and CareShield Life pay hospital bills and disability income, not these lump sums, so they don't count here."
				: "Do you know how much you already have? Add your existing cover to see your gap. CPF's Dependants' Protection Scheme (up to $70,000 until 65) and cover from work count too.");
		const notes = [
			countIt,
			`Aim to keep premiums within about ${money(r.premiumCeiling)}/month, 10% of your income.`,
			"The benchmark is 10x annual income for death and disability and 5x for critical illness, a little above LIA Singapore's 9x and 4x guide to leave room for debts and inflation. A starting point, not personalised advice; your real needs depend on dependants, debts, health and budget.",
		];
		return { lead, rows, notes, askedAboutCover };
	}

	const DEDUCTIBLE = { private: 3500, b1: 2500, b2: 2000, c: 1500 };
	const COVER = {
		none: { label: "Shield plan, no rider" },
		old: { label: "Shield plan + rider bought before Apr 2026" },
		new: { label: "Shield plan + rider bought from Apr 2026" },
	};

	// input: { bill, ward: private|b1|b2|c, cover: none|old|new }
	function hospitalShare(input) {
		const bill = Math.max(0, Number(input.bill) || 0);
		const deductible = DEDUCTIBLE[input.ward] || DEDUCTIBLE.private;
		const cover = COVER[input.cover] ? input.cover : "none";
		const ded = Math.min(bill, deductible);
		const rest = Math.max(0, bill - deductible);
		let you;
		let parts;
		if (cover === "old") {
			const copay = Math.min(bill * 0.05, 3000);
			you = copay;
			parts = [["5% co-payment (capped at $3,000)", copay]];
		} else if (cover === "new") {
			const copay = Math.min(rest * 0.05, 6000);
			you = ded + copay;
			parts = [["Deductible", ded], ["5% of the rest (capped at $6,000)", copay]];
		} else {
			const coins = rest * 0.1;
			you = ded + coins;
			parts = [["Deductible", ded], ["10% of the rest", coins]];
		}
		return {
			bill: Math.round(bill),
			you: Math.round(you),
			insurer: Math.round(bill - you),
			parts: parts.map(([label, amount]) => [label, Math.round(amount)]),
			deductible,
			cover,
			coverLabel: COVER[cover].label,
		};
	}

	// Foreigners: the part of the bill above the plan's yearly limit.
	// input: { bill, limit } (limit 0 = no health insurance)
	function foreignerShare(input) {
		const bill = Math.max(0, Number(input.bill) || 0);
		const limit = Math.max(0, Number(input.limit) || 0);
		const you = Math.max(0, bill - limit);
		return { bill: Math.round(bill), you: Math.round(you), insurer: Math.round(bill - you), limit };
	}

	// How long a lump sum replaces income, in months.
	function runwayMonths(cover, monthlyIncome) {
		const m = Number(monthlyIncome) || 0;
		return m > 0 ? Math.floor((Number(cover) || 0) / m) : 0;
	}

	return { calculate, summary, hospitalShare, foreignerShare, runwayMonths, DEDUCTIBLE, COVER, DEATH_TPD_X, CI_X };
});
