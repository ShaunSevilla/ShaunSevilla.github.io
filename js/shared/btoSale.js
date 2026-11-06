// Selling your HDB flat: how much goes back into CPF, and the cash you keep.
// Kept free of the page so the Telegram bot can reuse it.
//
// Rules (CPF Board / HDB, Nov 2026):
//   • Sale price pays, in order: the outstanding housing loan, then a refund of
//     the CPF you used (principal + accrued interest) into your own CPF OA.
//     What's left is cash.
//   • Housing grants (EHG, CPF Housing Grant, PHG…) were paid into your CPF OA
//     and spent on the flat, so they're refunded with accrued interest too.
//   • Accrued interest: what that CPF would have earned in the OA, 2.5% a year,
//     compounded, from the month each dollar left the OA. The CPF app shows the
//     exact figure under Home Ownership.
//   • Sold at market value: if the sale can't cover the full refund, CPF doesn't
//     ask you to top up the rest in cash.
//   • Minimum Occupation Period: 5 years from key collection (10 for Plus and
//     Prime flats). Plus/Prime also pay back a subsidy clawback of 6–9% of the
//     resale price, as stated in the sales brochure.
//   • Resale levy: only if your next flat is also subsidised; paid in cash or
//     from the sale proceeds.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.BtoSale = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	const OA_RATE = 0.025;
	const UPFRONT_SHARE = 1 / 3; // of CPF used, assumed paid upfront when not given
	const MOP_YEARS = { standard: 5, plus: 10, prime: 10 };
	const RESALE_LEVY = { none: 0, "2-room": 15000, "3-room": 30000, "4-room": 40000, "5-room": 45000, executive: 50000 };

	// Interest a dollar would have earned in the OA over m months.
	const grow = (months) => Math.pow(1 + OA_RATE, Math.max(0, months) / 12) - 1;
	const num = (v) => (v === undefined || v === null || v === "" ? null : Math.max(0, Number(v) || 0));

	// input: { cpfUsed, grants, flatAge (years since keys), upfront?, interestKnown?,
	//          salePrice?, loanLeft?, scheme?, clawbackPercent?, agentPercent?,
	//          legalFees?, nextFlat?, singles? }
	function calculate(input) {
		const cpfUsed = num(input.cpfUsed) || 0;
		const grants = num(input.grants) || 0;
		const flatAge = num(input.flatAge) || 0;
		const months = Math.round(flatAge * 12);

		// Accrued interest: the figure from the CPF app if given, else an estimate.
		// Upfront CPF (downpayment, stamp duty) has been out since key collection;
		// the rest went out bit by bit with each monthly instalment.
		const upfrontGiven = num(input.upfront);
		const upfront = Math.min(cpfUsed, upfrontGiven === null ? cpfUsed * UPFRONT_SHARE : upfrontGiven);
		const monthlyPart = cpfUsed - upfront;
		let estimate = upfront * grow(months) + grants * grow(months);
		if (months > 0) {
			const perMonth = monthlyPart / months;
			for (let m = 1; m <= months; m++) estimate += perMonth * grow(months - m);
		}
		const interestKnown = num(input.interestKnown);
		const interest = interestKnown === null ? estimate : interestKnown;
		const refund = cpfUsed + grants + interest;

		const out = {
			cpfUsed,
			grants,
			flatAge,
			upfront,
			upfrontAssumed: upfrontGiven === null,
			interest,
			interestEstimated: interestKnown === null,
			refund,
			mop: MOP_YEARS[input.scheme] || 5,
			beforeMop: flatAge < (MOP_YEARS[input.scheme] || 5),
			sale: null,
		};

		const salePrice = num(input.salePrice);
		if (salePrice) {
			const loanLeft = num(input.loanLeft) || 0;
			const clawback = (salePrice * (num(input.clawbackPercent) || 0)) / 100;
			const agentPct = num(input.agentPercent);
			const agentFee = (salePrice * (agentPct === null ? 2 : agentPct)) / 100 * 1.09; // + 9% GST
			const legalFees = num(input.legalFees) === null ? 2000 : num(input.legalFees);
			const afterLoan = salePrice - loanLeft - clawback - agentFee - legalFees;
			const proceeds = Math.max(0, afterLoan);
			const cpfBack = Math.min(refund, proceeds);
			const levyBase = RESALE_LEVY[input.nextFlat] || 0;
			const levy = input.singles ? levyBase / 2 : levyBase;
			const cash = proceeds - cpfBack;
			out.sale = {
				salePrice,
				loanLeft,
				clawback,
				agentFee,
				legalFees,
				fees: agentFee + legalFees,
				loanShortfall: Math.max(0, -afterLoan),
				cpfBack,
				cpfWrittenOff: refund - cpfBack,
				cash,
				levy,
				cashAfterLevy: cash - levy,
			};
		}
		return out;
	}

	return { calculate, RESALE_LEVY, MOP_YEARS, OA_RATE, UPFRONT_SHARE };
});
