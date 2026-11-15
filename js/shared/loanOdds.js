// "Will my loan be approved?" Indicative odds, not a lender's decision.
// Shared (UMD) so the Telegram bot can use it too.
//
// The hard rules are MAS's and HDB's (Nov 2026):
//   • TDSR: all loan repayments <= 55% of gross monthly income (property loans),
//     tested at 4% for bank home loans, 3% for the HDB loan
//   • MSR: HDB flat / EC instalment <= 30% of gross monthly income
//   • HDB loan: household income <= $16,000 ($8,000 singles)
//   • LTV: 75% for a home; car 70% (OMV <= $20,000) or 60%, up to 7 years
//   • unsecured credit: under $30,000 a year, 2 months' pay per lender; once
//     interest-bearing unsecured debt passes 12 months' pay (annual income
//     under $120,000) for 3 months, no new unsecured credit
// Banks' own habits (not law): most want $20,000+ a year for a personal loan
// and lend about 4 to 6 months' pay; car and personal loans are usually kept
// within the same 55% of pay overall.
// Credit Bureau Singapore score 1000-2000, grades AA (1911+) to HH (<1724).
(function (root, factory) {
	if (typeof module === "object" && module.exports) module.exports = factory();
	else root.LoanOdds = factory();
})(typeof self !== "undefined" ? self : this, function () {
	const GRADES = [
		{ grade: "AA", min: 1911, base: 0.93, words: "lowest risk" },
		{ grade: "BB", min: 1844, base: 0.87, words: "low risk" },
		{ grade: "CC", min: 1825, base: 0.78, words: "fairly low risk" },
		{ grade: "DD", min: 1813, base: 0.68, words: "average risk" },
		{ grade: "EE", min: 1782, base: 0.55, words: "higher risk" },
		{ grade: "FF", min: 1755, base: 0.42, words: "high risk" },
		{ grade: "GG", min: 1724, base: 0.3, words: "very high risk" },
		{ grade: "HH", min: 1000, base: 0.15, words: "highest risk" },
	];
	const TDSR = 0.55;
	const MSR = 0.3;
	const CEILING = { couple: 16000, single: 8000 };
	const TYPES = {
		hdb: { name: "HDB loan", rate: 0.03, flat: false, msr: true, maxYears: 25, ltv: 0.75 },
		// 75% LTV on an HDB flat only up to 25 years (longer drops to 55%).
		bankHdb: { name: "Bank loan for an HDB flat or EC", rate: 0.04, flat: false, msr: true, maxYears: 25, ltv: 0.75 },
		private: { name: "Bank loan for private property", rate: 0.04, flat: false, msr: false, maxYears: 30, ltv: 0.75 },
		car: { name: "Car loan", rate: 0.0248, flat: true, msr: false, maxYears: 7 },
		personal: { name: "Personal loan", rate: 0.035, flat: true, msr: false, maxYears: 5 },
		// No type given (the website): a big loan is planned like a home loan,
		// a smaller one like a car or personal loan.
		big: { name: "Loan", rate: 0.04, flat: false, msr: false, maxYears: 30, defaultYears: 25 },
		small: { name: "Loan", rate: 0.03, flat: true, msr: false, maxYears: 10 },
	};
	const BIG_LOAN = 150000;

	function gradeFor(score) {
		const s = Math.max(1000, Math.min(2000, Number(score) || 0));
		return GRADES.find((g) => s >= g.min);
	}

	function monthly(type, amount, years) {
		const t = TYPES[type];
		const n = years * 12;
		if (t.flat) return (amount * (1 + t.rate * years)) / n;
		const r = t.rate / 12;
		return (amount * r) / (1 - Math.pow(1 + r, -n));
	}

	// The biggest loan that keeps this repayment at or under `cap` a month.
	function amountFor(type, cap, years) {
		if (cap <= 0) return 0;
		return cap / monthly(type, 1, years);
	}

	// input: { type, score, amount, income (gross monthly), otherDebt (monthly
	// repayments now), years?, price?, omv?: "low"|"high", alone?, unsecured?
	// (interest-bearing unsecured debt owed now) }
	function assess(input) {
		const given = TYPES[input.type] && input.type !== "big" && input.type !== "small";
		const type = given ? input.type : Number(input.amount) >= BIG_LOAN ? "big" : "small";
		const t = TYPES[type];
		const g = gradeFor(input.score);
		const amount = Math.max(0, Number(input.amount) || 0);
		const income = Math.max(0, Number(input.income) || 0);
		const otherDebt = Math.max(0, Number(input.otherDebt) || 0);
		const unsecured = Math.max(0, Number(input.unsecured) || 0);
		const fallbackYears = t.defaultYears || (type === "small" ? (amount >= 30000 ? 7 : 5) : t.maxYears);
		const years = Math.max(1, Math.min(t.maxYears, Number(input.years) || fallbackYears));
		const price = Math.max(0, Number(input.price) || 0);
		const pay = monthly(type, amount, years);
		const checks = [];
		const caps = [];
		const add = (ok, title, detail, hard) => checks.push({ status: ok === true ? "pass" : ok === "tight" ? "tight" : "fail", title, detail, hard });
		const share = (v) => `${Math.round(v * 100)}%`;
		const money = (v) => `$${Math.round(v).toLocaleString("en-SG")}`;

		// Overall debt (TDSR, or the same 55% banks use for car/personal loans).
		const tdsr = income > 0 ? (pay + otherDebt) / income : Infinity;
		const tdsrCap = income * TDSR - otherDebt;
		caps.push(amountFor(type, tdsrCap, years));
		const soft = type === "car" || type === "personal" || type === "small";
		const tdsrName = soft ? "All your repayments (banks keep this under 55% of pay)" : "All your repayments (max 55% of pay)";
		add(tdsr <= TDSR * 0.85 ? true : tdsr <= TDSR ? "tight" : false, tdsrName, `${share(tdsr)} of your pay: ${money(pay)} for this loan${otherDebt ? ` + ${money(otherDebt)} you already pay` : ""}.`, !soft);

		if (t.msr) {
			const msr = income > 0 ? pay / income : Infinity;
			caps.push(amountFor(type, income * MSR, years));
			add(msr <= MSR * 0.85 ? true : msr <= MSR ? "tight" : false, "Home instalment (MSR, max 30% of pay)", `${share(msr)} of your pay, tested at ${t.rate * 100}%.`, true);
		}

		if (type === "hdb") {
			const cap = input.alone ? CEILING.single : CEILING.couple;
			if (income > cap) caps.push(0);
			add(income <= cap, `HDB income ceiling (${money(cap)} household)`, income <= cap ? "Within it." : `Your income is above it, so no HDB loan. A bank loan still works.`, true);
		}

		if (t.ltv && price > 0) {
			caps.push(price * t.ltv);
			add(amount <= price * t.ltv, `Loan limit (${share(t.ltv)} of the price)`, `Up to ${money(price * t.ltv)} on a ${money(price)} home.`, true);
		}
		if (type === "car" && price > 0) {
			const ltv = input.omv === "high" ? 0.6 : 0.7;
			caps.push(price * ltv);
			add(amount <= price * ltv, `Car loan limit (${share(ltv)} of the price)`, `Up to ${money(price * ltv)} on a ${money(price)} car${input.omv ? "" : " (60% if the OMV is above $20,000)"}.`, true);
		}

		if (type === "personal") {
			const yearly = income * 12;
			if (yearly < 20000) {
				add(false, "Minimum income for a bank personal loan", "Most banks want at least $20,000 a year.", true);
				caps.push(0);
			} else {
				const perLender = yearly < 30000 ? income * 2 : income * 6;
				caps.push(perLender);
				add(amount <= perLender ? (amount <= perLender * 0.7 ? true : "tight") : false, yearly < 30000 ? "Per-lender limit (2 months' pay under $30,000 a year)" : "What banks usually lend (about 4 to 6 months' pay)", `Up to about ${money(perLender)} at your pay.`, yearly < 30000);
				if (yearly < 120000) {
					const room = income * 12 - unsecured;
					caps.push(Math.max(0, room));
					add(amount <= room, "All unsecured debt (max 12 months' pay)", `${money(unsecured + amount)} of ${money(income * 12)} with this loan.`, true);
				}
			}
		}

		// Odds: the credit grade sets the starting point; a broken rule all but
		// ends it, a tight one trims it.
		const hdbWeight = type === "hdb" ? 0.4 : 1; // HDB looks at the grade less than banks do
		let odds = 1 - (1 - g.base) * hdbWeight;
		const failed = checks.filter((c) => c.status === "fail");
		const tight = checks.filter((c) => c.status === "tight");
		if (failed.some((c) => c.hard)) odds = Math.min(odds, 0.04);
		else if (failed.length) odds *= 0.35;
		odds *= Math.pow(0.82, tight.length);
		if (income <= 0 || amount <= 0) odds = 0;
		odds = Math.max(0.01, Math.min(0.97, odds));

		const verdict = odds >= 0.75 ? "Likely" : odds >= 0.5 ? "Possible" : odds >= 0.25 ? "Unlikely" : "Very unlikely";
		let best = Math.min(...caps);
		// Without a type, a big loan is planned over 25 years, a small one over
		// 5 to 7, so the most you could borrow is worked out on whichever fits.
		if (type === "small" && best >= BIG_LOAN) best = Math.max(BIG_LOAN, amountFor("big", tdsrCap, TYPES.big.defaultYears));
		if (type === "big" && best < BIG_LOAN) best = Math.min(BIG_LOAN - 1000, amountFor("small", tdsrCap, 7));
		const maxLoan = Math.max(0, Math.floor(best / 1000) * 1000);
		// What would turn the red checks green, most useful first.
		const tips = [];
		if (failed.length && maxLoan > 0 && maxLoan < amount) tips.push(`Borrow ${money(maxLoan)} or less and every check passes.`);
		if (tdsr > TDSR && otherDebt > 0) {
			const cut = pay + otherDebt - income * TDSR;
			if (cut < otherDebt) tips.push(`Or keep this amount and cut about ${money(cut)} a month from the loans you already pay.`);
		}
		if (g.base < 0.5 && type !== "hdb") tips.push("Lifting your credit grade helps most: pay every bill on time and bring card balances down for 6 to 12 months.");
		return {
			type,
			name: t.name,
			score: Number(input.score),
			grade: g.grade,
			gradeWords: g.words,
			odds,
			verdict,
			monthly: Math.round(pay),
			years,
			rate: t.rate,
			flat: t.flat,
			tdsr,
			checks,
			maxLoan,
			tips,
			gradeNote: type === "hdb"
				? "HDB also checks your credit report, but your income and debts matter more than the grade."
				: g.base >= 0.8
					? "Your grade helps: banks see you as low risk."
					: g.base >= 0.5
						? "Your grade is middling: expect closer checks or a slightly higher rate."
						: "Your grade is the main drag. Pay every bill on time and cut card balances for 6 to 12 months to lift it.",
		};
	}

	return { assess, gradeFor, GRADES, TYPES };
});
