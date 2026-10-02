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

	// input: { monthlyIncome, existingDeathTpd (optional), existingCi (optional) }
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
		const notes = [
			askedAboutCover
				? "Count all of it: your own policies, any cover from work, and CPF's Dependants' Protection Scheme (up to $70,000 until 65). MediShield Life and CareShield Life pay hospital bills and disability income, not these lump sums, so they don't count here."
				: "Do you know how much you already have? Add your existing cover to see your gap. CPF's Dependants' Protection Scheme (up to $70,000 until 65) and cover from work count too.",
			`Aim to keep premiums within about ${money(r.premiumCeiling)}/month, 10% of your income.`,
			"The benchmark is 10x annual income for death and disability and 5x for critical illness, a little above LIA Singapore's 9x and 4x guide to leave room for debts and inflation. A starting point, not personalised advice; your real needs depend on dependants, debts, health and budget.",
		];
		return { lead, rows, notes, askedAboutCover };
	}

	return { calculate, summary };
});
