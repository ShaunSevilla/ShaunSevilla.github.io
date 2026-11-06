// "Is SRS worth it for me?" Tax saved now vs tax paid on the way out, and
// SRS vs simply investing the same out-of-pocket money yourself.
// Uses TaxRelief (js/shared/taxRelief.js) for this year's tax, so it always
// agrees with the Tax calculator.
//
// Rules (IRAS, Nov 2026):
//   • Cap: $15,300 a year (citizens, PRs), $35,700 (foreigners). Each dollar in
//     comes off chargeable income, within the $80,000 personal relief cap.
//   • Withdrawals from the statutory retirement age locked in at your first
//     contribution: 64 if you first contribute from 1 Jul 2026, 63 if before.
//     Only 50% of each withdrawal is taxed; spread over up to 10 years.
//   • Withdraw before that: 100% taxed plus a 5% penalty.
//   • Foreigners (not citizens or PRs) who've had the account 10 years can take
//     it all out with no penalty, 50% taxed. Gone from Singapore by then: 15%
//     withheld on that half (about 7.5% overall, if under $200,000 a year).
//   • Gains inside or outside SRS aren't taxed in Singapore, so the only tax
//     difference is relief now vs half-taxed withdrawals later.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("./taxRelief.js"));
	} else {
		root.SrsPlan = factory(root.TaxRelief);
	}
})(typeof self !== "undefined" ? self : this, function (TaxRelief) {
	const DEFAULT_RETURN = 4; // % a year, a balanced portfolio
	const DEFAULT_WITHDRAW_AGE = 64;
	const WITHDRAW_YEARS = 10;
	const EARLY_PENALTY = 0.05;
	const FOREIGNER_WITHHOLDING = 0.075; // 15% on the taxable half
	const FOREIGNER_MIN_YEARS = 10;

	const fv = (perYear, rate, years) => {
		// Paid at the end of each year, grown at `rate`.
		if (years <= 0) return 0;
		return rate === 0 ? perYear * years : perYear * ((Math.pow(1 + rate, years) - 1) / rate);
	};

	// input: { monthlyPay, bonus, age, residency ('local'|'foreigner'),
	//          perYear?, returnPercent?, withdrawAge?, otherIncomeLater?, yearsInSg? }
	function calculate(input) {
		const residency = input.residency === "foreigner" ? "foreigner" : "local";
		const isLocal = residency === "local";
		const cap = isLocal ? TaxRelief.SRS_CAP_LOCAL : TaxRelief.SRS_CAP_FOREIGNER;
		const base = {
			monthlyPay: Number(input.monthlyPay) || 0,
			bonus: Number(input.bonus) || 0,
			age: Number(input.age) || 30,
			residency,
		};
		const without = TaxRelief.calculate({ ...base, srsSoFar: 0 });
		// Blank = the most that still lowers your tax (past that, SRS saves nothing more).
		const useful = (without.opportunities.find((o) => o.key === "srs") || { amount: 0 }).amount;
		const blank = input.perYear === "" || input.perYear === undefined;
		const perYear = Math.min(cap, Math.max(0, blank ? useful : Number(input.perYear) || 0));
		const withSrs = TaxRelief.calculate({ ...base, srsSoFar: perYear });
		const saving = Math.max(0, without.tax - withSrs.tax);
		// Relief beyond the $80k cap, or tax already at $0, saves nothing.
		const reliefRoom = Math.max(0, TaxRelief.RELIEF_CAP - without.reliefsBeforeCap);
		const effective = perYear > 0 ? saving / perYear : 0;

		const rate = (input.returnPercent === "" || input.returnPercent === undefined ? DEFAULT_RETURN : Number(input.returnPercent)) / 100;
		const withdrawAge = isLocal ? Math.max(base.age + 1, Number(input.withdrawAge) || DEFAULT_WITHDRAW_AGE) : null;
		const years = isLocal
			? Math.max(1, withdrawAge - base.age)
			: Math.max(FOREIGNER_MIN_YEARS, Number(input.yearsInSg) || FOREIGNER_MIN_YEARS);

		// SRS route: put in `perYear` every year; the tax saved comes back to you.
		const pot = fv(perYear, rate, years);
		const contributed = perYear * years;
		let exitTax = 0;
		let perWithdrawal = 0;
		if (isLocal) {
			// 10 equal yearly withdrawals, half of each taxed on top of other income.
			const other = Math.max(0, Number(input.otherIncomeLater) || 0);
			perWithdrawal = pot / WITHDRAW_YEARS;
			const yearly = TaxRelief.taxOn(other + perWithdrawal * 0.5) - TaxRelief.taxOn(other);
			exitTax = yearly * WITHDRAW_YEARS;
		} else {
			perWithdrawal = pot;
			exitTax = pot * FOREIGNER_WITHHOLDING;
		}
		const srsNet = pot - exitTax;

		// Same out-of-pocket money invested yourself: perYear minus the tax saved.
		const outside = fv(perYear - saving, rate, years);
		const advantage = srsNet - outside;
		const exitRate = pot > 0 ? exitTax / pot : 0;

		// What it costs to take this year's contribution out early.
		const earlyCost = Math.round(perYear * (without.marginalRate + EARLY_PENALTY));

		return {
			residency,
			isLocal,
			cap,
			perYear,
			taxWithout: without.tax,
			taxWith: withSrs.tax,
			saving,
			effective,
			marginalRate: without.marginalRate,
			reliefRoom,
			capBites: perYear > reliefRoom,
			years,
			withdrawAge,
			ratePercent: rate * 100,
			contributed,
			pot,
			perWithdrawal,
			exitTax,
			exitRate,
			srsNet,
			outside,
			advantage,
			totalSaved: saving * years,
			earlyCost,
			useful,
			usedDefault: blank,
			// Strong / small / no: small = the gain is under 3% of what you'd have anyway.
			verdict: saving <= 0 || advantage <= 0 ? "no" : advantage < outside * 0.03 ? "small" : "strong",
		};
	}

	return { calculate, DEFAULT_RETURN, DEFAULT_WITHDRAW_AGE, WITHDRAW_YEARS };
});
