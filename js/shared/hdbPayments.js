// When you pay for an HDB flat, how much, and whether it can come from CPF.
// Shared, unchanged, by the Telegram bot and the website. Keep both copies
// identical:
//   Prosperity_Bot/src/shared/hdbPayments.js
//   ShaunSevilla.github.io/js/shared/hdbPayments.js
//
// Rules (HDB / CPF Board, Sep 2026):
//   BTO, HDB loan:  booking option fee (cash) → 10% at Agreement for Lease
//                   → 15% at key collection
//   BTO, bank loan: option fee (cash) → 20% at AFL, at least 5% of the price
//                   in cash → 5% at key collection
//   Staggered Downpayment Scheme (BTO; first-timer couple, younger one got
//   the HFE letter before 30, 5-room or smaller): HDB loan 5% at AFL and 20%
//   at keys; bank loan 10% at AFL (5% of it cash) and 15% at keys.
//   Resale:         Option to Purchase fees (cash, up to $5,000, often ~1%)
//                   → rest of the 25% at completion. Bank loans need at least
//                   5% of the price in cash in total.
//   Stamp duty and legal fees are paid at AFL (BTO) or completion (resale)
//   and can come from CPF OA. Grants are credited to CPF OA at key
//   collection (BTO) or completion (resale), so they only help at that stage.
// CPF OA is used first for anything CPF can pay; cash covers the rest.
// Grants left over after the downpayment, and (HDB loans) CPF OA above
// $20,000, go towards the flat and make the loan smaller.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.HdbPayments = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	const LTV = 0.75;
	const OTP_RATE = 0.01;
	const OTP_CAP = 5000;
	const BTO_OPTION_FEE = 2000; // 4-room and bigger ($1,000 3-room, $500 2-room)
	const BANK_MIN_CASH = 0.05;
	// HDB loan: you may keep up to $20,000 in CPF OA; the rest must be used.
	const OA_RETAIN_HDB = 20000;
	// Share of the price due by signing the Agreement for Lease (BTO).
	const AFL_SHARE = { hdb: 0.1, bank: 0.2 };
	const AFL_SHARE_STAGGERED = { hdb: 0.05, bank: 0.1 };
	const LEGAL_FEES = { hdb: 1000, bank: 3000 }; // rough, conveyancing + admin
	const BSD_TIERS = [
		[180000, 0.01],
		[360000, 0.02],
		[1000000, 0.03],
		[1500000, 0.04],
		[3000000, 0.05],
		[Infinity, 0.06],
	];

	// Rough CPF OA added each month from salary: 23% of wages (age 35 and
	// under, 2026 rates), wages counted up to the $8,000 ceiling per person.
	// Combined pay is capped at two ceilings.
	const OA_SHARE = 0.23;
	const CPF_OW_CEILING = 8000;
	const BTO_KEY_YEARS = 3;
	function oaPerMonth(monthlyPay) {
		const pay = Math.max(0, Number(monthlyPay) || 0);
		return Math.round(Math.min(pay, CPF_OW_CEILING * 2) * OA_SHARE);
	}
	// CPF OA expected by key collection (BTO) from today's balance + salary.
	function oaByKeys(oaToday, monthlyPay) {
		return Math.round(Math.max(0, Number(oaToday) || 0) + oaPerMonth(monthlyPay) * 12 * BTO_KEY_YEARS);
	}

	function bsd(price) {
		let tax = 0;
		let lower = 0;
		for (const [upper, rate] of BSD_TIERS) {
			if (price <= lower) break;
			tax += (Math.min(price, upper) - lower) * rate;
			lower = upper;
		}
		return Math.floor(tax);
	}

	// input: { price, type: "bto" | "resale", loan: "hdb" | "bank",
	//          oa (CPF OA today), oaAtKeys (optional, BTO: OA expected by key
	//          collection), grants, staggered (BTO: Staggered Downpayment
	//          Scheme) }
	function schedule(input) {
		const price = Math.max(0, Number(input.price) || 0);
		const bto = input.type === "bto";
		const bank = input.loan === "bank";
		const grants = Math.max(0, Number(input.grants) || 0);
		const oaNow = Math.max(0, Number(input.oa) || 0);
		const oaLater = Math.max(oaNow, Number(input.oaAtKeys) || oaNow);
		const downpayment = price * (1 - LTV);
		const stampDuty = bsd(price);
		const legal = LEGAL_FEES[bank ? "bank" : "hdb"];
		const bankCash = price * BANK_MIN_CASH;

		const stages = [];
		if (bto) {
			const fee = Math.min(BTO_OPTION_FEE, downpayment);
			const aflShare = (input.staggered ? AFL_SHARE_STAGGERED : AFL_SHARE)[bank ? "bank" : "hdb"];
			const signing = price * aflShare - fee;
			stages.push({ key: "booking", label: "Booking the flat", when: "when you pick your flat", parts: [["Option fee", fee]], cashOnly: fee });
			stages.push({
				key: "afl",
				label: "Signing the Agreement for Lease",
				when: "about 9 months after booking",
				parts: [["Downpayment", signing], ["Stamp duty", stampDuty], ["Legal fees (about)", legal]],
				cashOnly: bank ? Math.max(0, bankCash - fee) : 0,
			});
			stages.push({ key: "keys", label: "Key collection", when: "about 3 to 4 years later", parts: [["Downpayment", downpayment - price * aflShare]], cashOnly: 0, grantsHere: true, oaTopUp: oaLater - oaNow });
		} else {
			const otp = Math.min(price * OTP_RATE, OTP_CAP);
			stages.push({ key: "otp", label: "Option to Purchase", when: "when the seller grants you the option", parts: [["Option fees", otp]], cashOnly: otp });
			stages.push({
				key: "completion",
				label: "Completion (you get the keys)",
				when: "about 8 to 10 weeks after HDB accepts the resale application",
				parts: [["Downpayment", downpayment - otp], ["Stamp duty", stampDuty], ["Legal fees (about)", legal]],
				cashOnly: bank ? Math.max(0, bankCash - otp) : 0,
				grantsHere: true,
			});
		}

		// No CPF OA entered at all: show where OA could come in instead.
		const noOa = oaLater <= 0;
		let oaLeft = oaNow;
		let grantsLeft = grants;
		let totalCash = 0;
		let totalOa = 0;
		let totalGrants = 0;
		stages.forEach((stage) => {
			if (stage.oaTopUp) oaLeft += stage.oaTopUp;
			stage.total = Math.round(stage.parts.reduce((sum, part) => sum + part[1], 0));
			let flexible = stage.total - stage.cashOnly;
			// Grants go to the downpayment only (not stamp duty or fees).
			const downpaymentPart = stage.parts.find((part) => part[0] === "Downpayment");
			const grantRoom = stage.grantsHere && downpaymentPart ? Math.max(0, Math.min(downpaymentPart[1] - stage.cashOnly, flexible)) : 0;
			stage.grants = Math.round(Math.min(grantsLeft, grantRoom));
			grantsLeft -= stage.grants;
			flexible -= stage.grants;
			stage.oa = Math.round(Math.min(oaLeft, flexible));
			oaLeft -= stage.oa;
			stage.cash = Math.round(stage.cashOnly + flexible - stage.oa);
			// What CPF OA is allowed to pay at this stage (everything except the
			// cash-only part and what grants already cover).
			stage.oaEligible = Math.max(0, Math.round(stage.total - stage.cashOnly - stage.grants));
			if (noOa) stage.noOaHint = true;
			stage.parts = stage.parts.map(([label, amount]) => [label, Math.round(amount)]);
			totalCash += stage.cash;
			totalOa += stage.oa;
			totalGrants += stage.grants;
		});

		// Grants bigger than the downpayment they can go towards aren't lost:
		// HDB credits them to CPF OA and they cut the loan instead.
		const grantsToLoan = Math.round(Math.max(0, grantsLeft));
		totalGrants += grantsToLoan;
		// HDB loans: CPF OA above $20,000 must go into the flat (you can keep
		// up to $20,000), which also cuts the loan.
		const oaToLoan = bank ? 0 : Math.round(Math.max(0, oaLeft - OA_RETAIN_HDB));
		oaLeft -= oaToLoan;
		totalOa += oaToLoan;
		const fullLoan = price * LTV;
		const loan = Math.max(0, fullLoan - grantsToLoan - oaToLoan);

		const mustBeCash = Math.round(stages.reduce((sum, stage) => sum + stage.cashOnly, 0));
		return {
			type: bto ? "bto" : "resale",
			staggered: bto && Boolean(input.staggered),
			loanType: bank ? "bank" : "hdb",
			// Only this has to be cash; CPF OA (and grants) can pay the rest.
			mustBeCash,
			noOa,
			oaCouldCover: Math.round(stages.reduce((sum, stage) => sum + stage.oaEligible, 0)),
			extraCash: Math.max(0, Math.round(totalCash - mustBeCash)),
			price: Math.round(price),
			downpayment: Math.round(downpayment),
			loan: Math.round(loan),
			fullLoan: Math.round(fullLoan),
			grantsToLoan,
			oaToLoan,
			stampDuty,
			legal,
			stages,
			totalCash: Math.round(totalCash),
			totalOa: Math.round(totalOa),
			totalGrants: Math.round(totalGrants),
			oaLeft: Math.round(oaLeft),
			oaAtKeysAssumed: bto && oaLater > oaNow,
		};
	}

	function money(value) {
		return `$${Math.round(value).toLocaleString("en-SG")}`;
	}

	// "From CPF OA $x · grants $y · cash $z" for one stage.
	function sourceLine(stage) {
		const bits = [];
		if (stage.noOaHint) {
			// No CPF OA entered: show what could come from CPF instead of
			// calling it all cash.
			if (stage.grants > 0) bits.push(`grants ${money(stage.grants)}`);
			if (stage.cashOnly > 0) bits.push(`cash ${money(stage.cashOnly)} (must be cash)`);
			if (stage.oaEligible > 0) bits.push(`CPF OA or cash ${money(stage.oaEligible)}`);
			return bits.join(" · ") || "$0";
		}
		if (stage.oa > 0) bits.push(`CPF OA ${money(stage.oa)}`);
		if (stage.grants > 0) bits.push(`grants ${money(stage.grants)}`);
		if (stage.cash > 0) bits.push(`cash ${money(stage.cash)}${stage.cashOnly > 0 && stage.cash <= stage.cashOnly + 1 ? " (must be cash)" : ""}`);
		return bits.join(" · ") || "$0";
	}

	// Two short lines for other calculators: total cash and CPF OA needed,
	// with where the cash goes.
	function summaryRows(plan) {
		const short = { booking: "booking", afl: "signing", keys: "keys", otp: "OTP", completion: "completion" };
		const k = (value) => (value >= 1000 ? `$${Math.round(value / 1000)}k` : money(value));
		const extraStages = plan.stages.filter((stage) => stage.cash - stage.cashOnly > 0).map((stage) => `${k(stage.cash - stage.cashOnly)} ${short[stage.key]}`);
		if (plan.noOa) {
			return [
				["Must be cash", `${money(plan.mustBeCash)}${plan.loanType === "bank" ? " (5% of the price: banks need it in cash)" : plan.type === "bto" ? " (the option fee)" : " (the option fees)"}`],
				["CPF OA could pay", `up to ${money(plan.oaCouldCover)} (no CPF OA counted yet)`],
				["All in cash, if you don't use CPF", money(plan.totalCash)],
				...(plan.grantsToLoan > 0 ? [["Grants beyond the downpayment", `cut the loan by ${money(plan.grantsToLoan)}`]] : []),
			];
		}
		const rows = [
			["Must be cash", `${money(plan.mustBeCash)}${plan.loanType === "bank" ? " (5% of the price: banks need it in cash)" : plan.type === "bto" ? " (the option fee)" : " (the option fees)"}`],
			["Paid from CPF OA", money(plan.totalOa)],
		];
		if (plan.grantsToLoan > 0) rows.push(["Grants beyond the downpayment", `cut the loan by ${money(plan.grantsToLoan)}`]);
		if (plan.oaToLoan > 0) rows.push(["CPF OA above $20,000 (must be used with an HDB loan)", `cuts the loan by ${money(plan.oaToLoan)}`]);
		if (plan.extraCash > 0) {
			rows.push(["Extra cash where your CPF OA runs short", `${money(plan.extraCash)}${extraStages.length ? ` (${extraStages.join(", ")})` : ""}`]);
		}
		return rows;
	}

	return { schedule, sourceLine, summaryRows, bsd, money, oaPerMonth, oaByKeys, BTO_OPTION_FEE, OTP_CAP, BTO_KEY_YEARS };
});
