// When you pay for an HDB flat, how much, and whether it can come from CPF.
// Shared, unchanged, by the Telegram bot and the website. Keep both copies
// identical:
//   Prosperity_Bot/src/shared/hdbPayments.js
//   ShaunSevilla.github.io/js/shared/hdbPayments.js
//
// Rules (HDB / CPF Board, Sep 2026):
//   BTO, HDB loan:  booking option fee (cash) → 10% at Agreement for Lease
//                   → 15% at key collection (HDB's standard split; young
//                   couples on the Staggered Downpayment Scheme can pay 5%
//                   at AFL and 20% at keys instead)
//   BTO, bank loan: option fee (cash) → 20% at AFL, at least 5% of the price
//                   in cash → 5% at key collection
//   Resale:         Option to Purchase fees (cash, up to $5,000, often ~1%)
//                   → rest of the 25% at completion. Bank loans need at least
//                   5% of the price in cash in total.
//   Stamp duty and legal fees are paid at AFL (BTO) or completion (resale)
//   and can come from CPF OA. Grants are credited to CPF OA at key
//   collection (BTO) or completion (resale), so they only help at that stage.
// CPF OA is used first for anything CPF can pay; cash covers the rest.
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
	// Share of the price due by signing the Agreement for Lease (BTO).
	const AFL_SHARE = { hdb: 0.1, bank: 0.2 };
	const LEGAL_FEES = { hdb: 1000, bank: 3000 }; // rough, conveyancing + admin
	const BSD_TIERS = [
		[180000, 0.01],
		[360000, 0.02],
		[1000000, 0.03],
		[1500000, 0.04],
		[3000000, 0.05],
		[Infinity, 0.06],
	];

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
	//          collection), grants }
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
			const aflShare = AFL_SHARE[bank ? "bank" : "hdb"];
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
			stage.parts = stage.parts.map(([label, amount]) => [label, Math.round(amount)]);
			totalCash += stage.cash;
			totalOa += stage.oa;
			totalGrants += stage.grants;
		});

		return {
			type: bto ? "bto" : "resale",
			loanType: bank ? "bank" : "hdb",
			price: Math.round(price),
			downpayment: Math.round(downpayment),
			loan: Math.round(price * LTV),
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
		const cashStages = plan.stages.filter((stage) => stage.cash > 0).map((stage) => `${k(stage.cash)} ${short[stage.key]}`);
		return [
			["Cash you'll need", `${money(plan.totalCash)}${cashStages.length > 1 ? ` (${cashStages.join(", ")})` : ""}`],
			["CPF OA you'll need", `${money(plan.totalOa)}${plan.type === "bto" ? " by keys" : ""}`],
		];
	}

	return { schedule, sourceLine, summaryRows, bsd, money, BTO_OPTION_FEE, OTP_CAP };
});
