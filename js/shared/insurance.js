// Insurance benchmark: how much cover someone on this income should have,
// what they already have, and the gap. Shared, unchanged, by the Telegram bot
// and the website. Keep both copies identical:
//   Prosperity_Bot/src/shared/insurance.js
//   ShaunSevilla.github.io/js/shared/insurance.js
//
// Benchmarks (LIA Singapore / MoneySense Basic Financial Planning Guide):
//   death and total permanent disability (TPD): 9x annual income
//   critical illness (CI): 4x annual income
//   premiums: at most 15% of take-home pay
// Shaun's buffer for debts and inflation: 10x and 5x.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.Insurance = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	const DEATH_TPD_X = 9;
	const CI_X = 4;
	const BUFFER_DEATH_TPD_X = 10;
	const BUFFER_CI_X = 5;
	const PREMIUM_CEILING = 0.15; // of take-home
	const TAKE_HOME_SHARE = 0.8; // after 20% employee CPF

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
			bufferDeathTpd: Math.round(annual * BUFFER_DEATH_TPD_X),
			bufferCi: Math.round(annual * BUFFER_CI_X),
			premiumCeiling: Math.round(monthly * TAKE_HOME_SHARE * PREMIUM_CEILING),
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
		rows.push(["With debts or people depending on you, more makes sense", `${money(r.bufferDeathTpd)} death & TPD (10x), ${money(r.bufferCi)} CI (5x)`]);
		const askedAboutCover = r.existingDeathTpd !== null || r.existingCi !== null;
		const notes = [
			askedAboutCover
				? "Count all of it: your own policies, any cover from work, and CPF's Dependants' Protection Scheme (up to $70,000 until 65). MediShield Life and CareShield Life pay hospital bills and disability income, not these lump sums, so they don't count here."
				: "Do you know how much you already have? Add your existing cover to see your gap. CPF's Dependants' Protection Scheme (up to $70,000 until 65) and cover from work count too.",
			`Keep premiums under about ${money(r.premiumCeiling)}/month, 15% of your take-home pay (the MoneySense guide's ceiling, not a target).`,
			"The benchmarks are LIA Singapore's and MoneySense's guide for people starting work: 9x annual income for death and disability, 4x for critical illness. A simple benchmark, not personalised advice; your real needs depend on dependants, debts, health and budget.",
		];
		return { lead, rows, notes, askedAboutCover };
	}

	return { calculate, summary };
});
