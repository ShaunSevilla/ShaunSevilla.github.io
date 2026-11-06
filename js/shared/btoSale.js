// Selling your HDB flat: where the sale price goes, and what you actually get back.
// Kept free of the page so the Telegram bot can reuse it.
//
// Rules (CPF Board / HDB, Nov 2026):
//   • Sale price pays, in order: the outstanding housing loan, then a refund of
//     the CPF you used (principal + accrued interest) into your own CPF OA.
//     What's left is cash.
//   • Housing grants (EHG, CPF Housing Grant, PHG…) are paid into your CPF OA
//     and spent on the flat, so they're refunded with accrued interest too.
//   • Accrued interest: what the CPF you withdrew would have earned in the OA,
//     2.5% a year, compounded, from the month each dollar left the OA.
//   • Sold at market value: if the sale proceeds can't cover the full refund,
//     CPF doesn't ask you to top up the rest in cash.
//   • Minimum Occupation Period: 5 years from key collection (10 for Plus and
//     Prime flats). Plus/Prime also pay back a subsidy clawback of 6–9% of the
//     resale price, as stated in the sales brochure.
//   • Resale levy: only if your next flat is also subsidised (BTO, EC, or a
//     resale flat with grants); paid from cash or the sale proceeds.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.BtoSale = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	const OA_RATE = 0.025;
	const HDB_RATE = 0.026;
	const HDB_LTV = 0.75;
	const BTO_SIGNING_SHARE = 0.1; // of the price, at the Agreement for Lease
	const MOP_YEARS = { standard: 5, plus: 10, prime: 10 };
	const RESALE_LEVY = { none: 0, "2-room": 15000, "3-room": 30000, "4-room": 40000, "5-room": 45000, executive: 50000 };

	function money(value) {
		const v = Math.round(Number(value) || 0);
		return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-SG")}`;
	}

	// Buyer's stamp duty (residential, Feb 2023 rates).
	function bsd(price) {
		const bands = [[180000, 0.01], [180000, 0.02], [640000, 0.03], [500000, 0.04], [1500000, 0.05], [Infinity, 0.06]];
		let left = price;
		let duty = 0;
		for (const [size, rate] of bands) {
			const part = Math.min(left, size);
			duty += part * rate;
			left -= part;
			if (left <= 0) break;
		}
		return duty;
	}

	function instalment(loan, rate, years) {
		const n = years * 12;
		const i = rate / 12;
		if (loan <= 0 || n <= 0) return 0;
		return i === 0 ? loan / n : (loan * i) / (1 - Math.pow(1 + i, -n));
	}

	function balanceAfter(loan, rate, years, monthsPaid) {
		const i = rate / 12;
		const pay = instalment(loan, rate, years);
		const k = Math.min(monthsPaid, years * 12);
		if (loan <= 0) return 0;
		if (i === 0) return Math.max(0, loan - pay * k);
		return Math.max(0, loan * Math.pow(1 + i, k) - pay * ((Math.pow(1 + i, k) - 1) / i));
	}

	// Interest a dollar would have earned in the OA over m months.
	const grow = (months) => Math.pow(1 + OA_RATE, months / 12) - 1;

	// input: { price, salePrice, yearsLived, grants, cpfUpfront?, loan?, loanYears?,
	//          loanRate?, cpfShare? (0–1 of each instalment from CPF), waitYears?,
	//          clawbackPercent?, agentPercent?, legalFees?, nextFlat? (levy key),
	//          singles? (levy at half), scheme? (standard|plus|prime) }
	function calculate(input) {
		const price = Math.max(0, Number(input.price) || 0);
		const salePrice = Math.max(0, Number(input.salePrice) || 0);
		const yearsLived = Math.max(0, Number(input.yearsLived) || 0);
		const waitYears = Math.max(0, input.waitYears === undefined || input.waitYears === "" ? 3 : Number(input.waitYears) || 0);
		const grants = Math.max(0, Number(input.grants) || 0);
		const stampDuty = bsd(price);
		const loanRate = input.loanRate > 0 ? Number(input.loanRate) / 100 : HDB_RATE;
		const loanYears = Math.max(1, Math.min(35, Number(input.loanYears) || 25));
		const cpfShare = input.cpfShare === undefined || input.cpfShare === "" ? 1 : Math.max(0, Math.min(1, Number(input.cpfShare)));

		// Downpayment: 25% of the price plus stamp duty, less the grants that
		// land at key collection. Unless told otherwise, all from CPF OA.
		const downpayment = price * (1 - HDB_LTV);
		const grantsOnDown = Math.min(grants, downpayment);
		const grantsOnLoan = grants - grantsOnDown;
		const cpfUpfront = input.cpfUpfront === undefined || input.cpfUpfront === "" ? Math.max(0, downpayment - grantsOnDown) + stampDuty : Math.max(0, Number(input.cpfUpfront));
		const loan = input.loan === undefined || input.loan === "" ? Math.max(0, price * HDB_LTV - grantsOnLoan) : Math.max(0, Number(input.loan));

		const months = Math.round(yearsLived * 12);
		const monthly = instalment(loan, loanRate, loanYears);
		const monthsPaid = Math.min(months, loanYears * 12);
		const loanLeft = balanceAfter(loan, loanRate, loanYears, monthsPaid);
		const cpfMonthly = monthly * cpfShare;

		// When each CPF dollar left the OA. Signing part (10% + stamp duty) goes
		// while you wait for the flat; the rest at key collection.
		const signingPart = Math.min(cpfUpfront, price * BTO_SIGNING_SHARE + stampDuty);
		const keysPart = cpfUpfront - signingPart;
		const monthsSinceSigning = months + Math.round(waitYears * 12);
		let interest = signingPart * grow(monthsSinceSigning) + keysPart * grow(months) + grants * grow(months);
		let instalmentsFromCpf = 0;
		for (let m = 1; m <= monthsPaid; m++) {
			instalmentsFromCpf += cpfMonthly;
			interest += cpfMonthly * grow(months - m);
		}
		const principal = cpfUpfront + grants + instalmentsFromCpf;
		const cpfDue = principal + interest;

		const scheme = MOP_YEARS[input.scheme] ? input.scheme : "standard";
		const clawback = salePrice * Math.max(0, Number(input.clawbackPercent) || 0) / 100;
		const agentFee = salePrice * (input.agentPercent === undefined || input.agentPercent === "" ? 2 : Math.max(0, Number(input.agentPercent))) / 100 * 1.09; // + 9% GST
		const legalFees = input.legalFees === undefined || input.legalFees === "" ? 2000 : Math.max(0, Number(input.legalFees));
		const afterLoan = salePrice - loanLeft - clawback - agentFee - legalFees;
		const loanShortfall = Math.max(0, -afterLoan);
		const proceeds = Math.max(0, afterLoan);
		// Market-value sale: CPF takes back what's there and writes off the rest.
		const cpfBack = Math.min(cpfDue, proceeds);
		const cpfWrittenOff = cpfDue - cpfBack;
		const cash = proceeds - cpfBack;
		const levyBase = RESALE_LEVY[input.nextFlat] || 0;
		const levy = input.singles ? levyBase / 2 : levyBase;

		return {
			price,
			salePrice,
			yearsLived,
			waitYears,
			stampDuty,
			loan,
			monthly,
			cpfMonthly,
			loanLeft,
			grants,
			cpfUpfront,
			instalmentsFromCpf,
			principal,
			interest,
			cpfDue,
			cpfBack,
			cpfWrittenOff,
			clawback,
			agentFee,
			legalFees,
			loanShortfall,
			cash,
			levy,
			cashAfterLevy: cash - levy,
			mop: MOP_YEARS[scheme],
			beforeMop: yearsLived < MOP_YEARS[scheme],
			gain: salePrice - price,
		};
	}

	return { calculate, bsd, instalment, balanceAfter, money, RESALE_LEVY, MOP_YEARS, OA_RATE, HDB_RATE };
});
