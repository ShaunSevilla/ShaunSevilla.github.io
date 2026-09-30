// Vehicle loan: monthly instalment, MAS loan caps and the real (effective)
// interest rate. Shared, unchanged, by the Telegram bot and the website. Keep
// both copies identical:
//   Prosperity_Bot/src/shared/vehicleLoan.js
//   ShaunSevilla.github.io/js/shared/vehicleLoan.js
//
// Rules (MAS, 2026):
//   Cars: loan up to 70% of the price if the OMV is $20,000 or less, 60% if
//   it's above; at most 7 years.
//   Motorcycles, commercial vehicles (including private-hire cars) are exempt
//   from those caps; the lender decides. Planned here at up to 10 years.
// Vehicle loans are quoted as a FLAT rate: interest = loan x rate x years,
// spread evenly. The effective rate (EIR) is what that really costs as a
// reducing-balance loan, usually about 1.8 to 2x the flat rate.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.VehicleLoan = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	const OMV_THRESHOLD = 20000;
	const LTV_LOW_OMV = 0.7;
	const LTV_HIGH_OMV = 0.6;
	const MAX_YEARS = { car: 7, bike: 10, commercial: 10 };
	const TYPICAL_FLAT_RATE = 2.48;
	const MAX_FLAT_RATE = 15;
	const TYPES = {
		car: "Car",
		bike: "Motorbike",
		commercial: "Commercial or private-hire vehicle",
	};

	// Effective annual rate of a flat-rate loan, found by solving the
	// reducing-balance rate that gives the same monthly instalment.
	function effectiveRate(flatPercent, years) {
		const n = Math.round(years * 12);
		if (!(flatPercent > 0) || !(n > 0)) return 0;
		const payment = (1 + (flatPercent / 100) * years) / n;
		let low = 0;
		let high = 1;
		for (let i = 0; i < 100; i += 1) {
			const r = (low + high) / 2;
			const pay = r / (1 - Math.pow(1 + r, -n));
			if (pay < payment) low = r;
			else high = r;
		}
		return (Math.pow(1 + low, 12) - 1) * 100;
	}

	// input: { type: car|bike|commercial, price, omv (optional),
	//          downpayment, years, ratePercent }
	// Returns { ok: false, error } for impossible inputs, { ok: true,
	// sufficient: false, ... } when the downpayment is below the MAS minimum.
	function calculate(input) {
		const type = TYPES[input.type] ? input.type : "car";
		const capped = type === "car";
		const price = Number(input.price);
		const downpayment = Math.max(0, Number(input.downpayment) || 0);
		const hasOmv = capped && input.omv !== null && input.omv !== undefined && input.omv !== "" && Number(input.omv) > 0;
		const omv = hasOmv ? Number(input.omv) : null;
		const maxYears = MAX_YEARS[type];
		const years = Number(input.years) || maxYears;
		const ratePercent = input.ratePercent === null || input.ratePercent === undefined || input.ratePercent === "" ? TYPICAL_FLAT_RATE : Number(input.ratePercent);

		if (!(price > 0)) return { ok: false, error: "Please enter the price." };
		if (downpayment >= price) return { ok: false, error: "Your downpayment already covers the whole price, so there's no loan to work out." };
		if (!(years > 0) || years > maxYears) return { ok: false, error: capped ? "MAS caps car loans at 7 years." : `Please pick up to ${maxYears} years.` };
		if (!(ratePercent >= 0) || ratePercent > MAX_FLAT_RATE) return { ok: false, error: `Please enter the flat rate as a percentage, like ${TYPICAL_FLAT_RATE}.` };

		// Which MAS limits apply: the one for the OMV given, or both if the
		// OMV isn't known yet.
		const tiers = !capped
			? []
			: hasOmv
				? [{ label: omv <= OMV_THRESHOLD ? "OMV $20,000 or less" : "OMV above $20,000", ltv: omv <= OMV_THRESHOLD ? LTV_LOW_OMV : LTV_HIGH_OMV }]
				: [
					{ label: "OMV $20,000 or less", ltv: LTV_LOW_OMV },
					{ label: "OMV above $20,000", ltv: LTV_HIGH_OMV },
				];
		tiers.forEach((tier) => {
			tier.minDownpayment = Math.round(price * (1 - tier.ltv));
			tier.fits = downpayment >= tier.minDownpayment;
		});
		const fitsAny = !capped || tiers.some((tier) => tier.fits);
		const base = { ok: true, type, typeLabel: TYPES[type], capped, price: Math.round(price), omv, hasOmv, downpayment: Math.round(downpayment), tiers, maxYears };
		if (!fitsAny) {
			const need = Math.min(...tiers.map((tier) => tier.minDownpayment));
			return { ...base, sufficient: false, shortfall: need - Math.round(downpayment) };
		}

		const loanAmount = price - downpayment;
		const totalInterest = loanAmount * (ratePercent / 100) * years;
		const totalRepayment = loanAmount + totalInterest;
		return {
			...base,
			sufficient: true,
			// Downpayment is enough only if the OMV turns out to be $20,000 or less.
			onlyIfLowOmv: capped && !hasOmv && tiers.some((tier) => !tier.fits),
			loanAmount: Math.round(loanAmount),
			loanPercent: Math.round((loanAmount / price) * 100),
			ratePercent,
			rateIsTypical: input.ratePercent === null || input.ratePercent === undefined || input.ratePercent === "",
			years,
			monthlyPayment: Math.round(totalRepayment / (years * 12)),
			totalRepayment: Math.round(totalRepayment),
			totalInterest: Math.round(totalInterest),
			eirPercent: Math.round(effectiveRate(ratePercent, years) * 100) / 100,
		};
	}

	// Plain-language notes under a result, shared by the bot and the website.
	function notes(result) {
		const out = [];
		if (result.rateIsTypical) {
			out.push(`No rate given, so this uses ${TYPICAL_FLAT_RATE}% flat, where most bank vehicle loans sit in 2026. Used vehicles are often higher; your lender will confirm.`);
		}
		out.push(`${result.ratePercent}% flat works out to about ${result.eirPercent}% a year on a reducing balance (the effective rate), because you pay interest on the full loan even as you repay it.`);
		if (result.capped && result.hasOmv) {
			out.push(`MAS lets you borrow up to ${Math.round(result.tiers[0].ltv * 100)}% on a car with an ${result.tiers[0].label}, over at most 7 years.`);
		} else if (result.capped) {
			out.push(result.onlyIfLowOmv
				? `Heads up: your downpayment is enough only if the car's OMV is $20,000 or less (70% loan). Above that, MAS caps the loan at 60%, so you'd need ${"$" + result.tiers[1].minDownpayment.toLocaleString("en-SG")} down. Ask the dealer for the OMV.`
				: "No OMV given: your downpayment clears both MAS limits (70% loan if the OMV is $20,000 or less, 60% above).");
		} else {
			out.push(`${result.typeLabel} loans aren't covered by MAS's car-loan caps, so the lender sets the downpayment and tenure.`);
		}
		out.push("Paying off early usually costs a fee (often 20% of the interest you'd save, worked out by the Rule of 78). Estimates only, not personalised advice.");
		return out;
	}

	return { calculate, notes, effectiveRate, TYPES, MAX_YEARS, TYPICAL_FLAT_RATE, OMV_THRESHOLD };
});
