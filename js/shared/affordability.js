// "What can I afford?" for a home, a car and/or a motorbike in Singapore.
// Shared, unchanged, by the Telegram bot and the website. Keep both copies
// identical:
//   Prosperity_Bot/src/shared/affordability.js
//   ShaunSevilla.github.io/js/shared/affordability.js
//
// HOME, using the limits banks and HDB apply (Sep 2026):
//   • MSR: housing instalment <= 30% of gross monthly income (HDB flats/ECs)
//   • TDSR: all debt instalments <= 55% of gross monthly income
//   • both tested at a stress rate, not your real rate: 3% p.a. for the HDB
//     loan, 4% p.a. for bank loans (MAS/HDB, 30 Sep 2022)
//   • LTV 75%: 25% downpayment (CPF or cash); bank loans need >= 5% in cash
//   • tenure: HDB 25 years, bank 30, and loans shouldn't run past age 65
//   • HDB loan / BTO income ceiling: $16,000 families, $8,000 singles
//     (raised from $14,000 / $7,000 on 24 Aug 2026)
//   • singles can buy an HDB flat on their own only from age 35
// "Comfortable" on top of that:
//   • instalment within 25% of gross income (CPF Board's own guideline)
//   • if spending is known, still saving at least 20% of take-home pay after
//     the part of the instalment CPF doesn't cover
//   • long-run planning rates: 2.6% (HDB loan), 3% (bank; today's ~1.6%
//     packages only last 2 to 3 years)
//   • an emergency buffer left untouched in the bank: 6 months of expenses,
//     or 6 months of pay if people depend on you
// BTO vs resale: BTO is the default. Ticking a resale grant (CPF Housing
// Grant / Proximity Housing Grant) switches the answer to resale. For BTO,
// most of the downpayment is due at key collection (taken as 3 years away),
// so the CPF OA contributions until then count.
// Grants (HDB/CPF, Sep 2026): EHG up to $120,000 (income <= $9,000;
// singles half, <= $4,500), BTO or resale. CPF Housing Grant (Family Grant)
// for resale: $80,000 couples / $40,000 singles (2- to 4-room). Proximity
// Housing Grant for resale: $30,000 living with parents / $20,000 within
// 4 km (singles $15,000 / $10,000). HDB confirms the exact EHG in the HFE
// letter; the per-band amounts below are the published indicative table.
//
// CAR (Shaun's guide): the loan instalment stays under 10% of take-home
// pay (stretch: 15%), and owning the car all in costs about 1.3x to 1.5x the
// instalment. MAS caps car loans at 70% of the price if the OMV is $20,000
// or less, 60% if it's above, over at most 7 years. Most buyers don't know
// their car's OMV yet, so both are shown.
// MOTORBIKE: MAS's loan caps don't apply to motorcycles; lenders set their
// own. Planned at 80% financing (20% down) over 5 years at 2.5% flat, with
// the same 10% / 15% of take-home rule, and roughly $150 to $300 a month
// for insurance, road tax, petrol and parking on top.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.Affordability = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	const MSR = 0.3;
	const TDSR = 0.55;
	// Shaun's guide: keep housing repayments within 30% of gross income (the
	// same line HDB's Mortgage Servicing Ratio draws).
	const COMFORT_SHARE = 0.3;
	const MIN_SAVINGS_RATE = 0.2;
	const TAKE_HOME_SHARE = 0.8; // after 20% employee CPF
	const DEFAULT_SPEND_SHARE = 0.5; // of take-home, when spending isn't given
	const HDB_STRESS_RATE = 0.03;
	const BANK_STRESS_RATE = 0.04;
	const HDB_RATE = 0.026;
	const BANK_PLANNING_RATE = 0.03;
	const LTV = 0.75;
	const BANK_MIN_CASH = 0.05;
	const HDB_MAX_YEARS = 25;
	// MAS: 75% LTV on an HDB flat only if the bank loan is 25 years or less
	// (and ends by 65); longer loans drop to 55%. So plan at 25 years.
	const BANK_MAX_YEARS = 25;
	const MAX_LOAN_AGE = 65;
	const HDB_INCOME_CEILING_FAMILY = 16000;
	const HDB_INCOME_CEILING_SINGLE = 8000;
	const SINGLES_MIN_AGE = 35;
	const LEGAL_AND_FEES = 3000;
	const OTP_RATE = 0.01;
	const OTP_CAP = 5000;
	const BTO_KEY_YEARS = 3;
	// Due by signing the Agreement for Lease: 10% of the price with an HDB
	// loan, 20% with a bank loan (HDB's standard split).
	const BTO_SIGNING_SHARE = { hdb: 0.1, bank: 0.2 };
	const BTO_OPTION_FEE = 2000;
	const CPF_OW_CEILING = 8000;
	const BSD_TIERS = [
		[180000, 0.01],
		[360000, 0.02],
		[1000000, 0.03],
		[1500000, 0.04],
		[3000000, 0.05],
		[Infinity, 0.06],
	];
	// EHG (families), by average monthly household income.
	const EHG_FAMILY = [
		[1500, 120000], [2000, 110000], [2500, 105000], [3000, 95000],
		[3500, 90000], [4000, 80000], [4500, 70000], [5000, 65000],
		[5500, 55000], [6000, 50000], [6500, 40000], [7000, 30000],
		[7500, 25000], [8000, 20000], [8500, 10000], [9000, 5000],
	];
	const FAMILY_GRANT = { couple: 80000, single: 40000 };
	const PROXIMITY_GRANT = { couple: { with: 30000, near: 20000 }, single: { with: 15000, near: 10000 } };

	// Vehicles. Shaun's guide: keep the loan instalment under 10% of
	// take-home pay (15% is a stretch).
	const VEHICLE_COMFORT_SHARE = 0.1; // of take-home
	const VEHICLE_STRETCH_SHARE = 0.15; // of take-home
	const CAR_COMFORT_SHARE = VEHICLE_COMFORT_SHARE;
	const CAR_ALL_IN_LOW = 1.3;
	const CAR_ALL_IN_HIGH = 1.5;
	const CAR_FLAT_RATE = 0.0248;
	const CAR_LOAN_YEARS = 7;
	const OMV_THRESHOLD = 20000;
	// MAS: 70% of the price if OMV <= $20,000, 60% above.
	const CAR_TIERS = [
		{ key: "low", label: `OMV $20,000 or less`, ltv: 0.7 },
		{ key: "high", label: `OMV above $20,000`, ltv: 0.6 },
	];
	const CAR_EXAMPLE_PRICE = 120000;
	const CAR_MIN_REALISTIC = 80000;
	const BIKE_LTV = 0.8;
	const BIKE_FLAT_RATE = 0.025;
	const BIKE_LOAN_YEARS = 5;
	const BIKE_RUNNING_LOW = 150;
	const BIKE_RUNNING_HIGH = 300;
	const BIKE_EXAMPLE_PRICE = 20000;
	const BIKE_MIN_REALISTIC = 8000;

	// Monthly instalment per $1 of vehicle price, flat-rate loan.
	function perDollar(ltv, rate, years) {
		return (ltv * (1 + rate * years)) / (years * 12);
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

	function presentValue(monthly, annualRate, years) {
		if (monthly <= 0 || years <= 0) return 0;
		const r = annualRate / 12;
		const n = years * 12;
		return (monthly * (1 - Math.pow(1 + r, -n))) / r;
	}

	function instalment(loan, annualRate, years) {
		if (loan <= 0 || years <= 0) return 0;
		const r = annualRate / 12;
		const n = years * 12;
		return (loan * r) / (1 - Math.pow(1 + r, -n));
	}

	function roundDown(value, step) {
		return Math.max(0, Math.floor(value / step) * step);
	}

	// Share of wages that goes into the Ordinary Account, 2026 rates.
	function oaRate(age) {
		if (age <= 35) return 0.23;
		if (age <= 45) return 0.21;
		if (age <= 50) return 0.19;
		if (age <= 55) return 0.15;
		if (age <= 60) return 0.12;
		if (age <= 65) return 0.035;
		return 0.01;
	}

	function ehgAmount(income, alone) {
		// Singles: half the family amount, at half the income.
		const lookup = alone ? income * 2 : income;
		const band = EHG_FAMILY.find(([upTo]) => lookup <= upTo);
		if (!band) return 0;
		return alone ? band[1] / 2 : band[1];
	}

	function grantsFor({ income, alone, ehg, familyGrant, proximity }) {
		const who = alone ? "single" : "couple";
		const items = [];
		if (ehg) items.push({ key: "ehg", label: "Enhanced CPF Housing Grant", amount: ehgAmount(income, alone) });
		if (familyGrant) items.push({ key: "family", label: "CPF Housing Grant (resale)", amount: FAMILY_GRANT[who] });
		if (proximity === "with" || proximity === "near") {
			items.push({
				key: "phg",
				label: `Proximity Housing Grant (${proximity === "with" ? "living with parents" : "within 4 km of parents"})`,
				amount: PROXIMITY_GRANT[who][proximity],
			});
		}
		return { items, total: items.reduce((sum, item) => sum + item.amount, 0) };
	}

	// Highest price that passes every check. Binary search, since stamp duty
	// depends on the price.
	function searchPrice(fits) {
		let low = 0;
		let high = 5000000;
		for (let i = 0; i < 60; i += 1) {
			const mid = (low + high) / 2;
			if (fits(mid)) low = mid;
			else high = mid;
		}
		return low;
	}

	// One loan type (HDB or bank) for one scenario (BTO or resale).
	function homeOption(o) {
		const bank = o.loan === "bank";
		const years = Math.max(0, Math.min(bank ? BANK_MAX_YEARS : HDB_MAX_YEARS, MAX_LOAN_AGE - o.ageAtLoan));
		const stressCap = Math.max(0, Math.min(o.income * MSR, o.income * TDSR - o.otherDebt));
		const maxLoanAllowed = presentValue(stressCap, bank ? BANK_STRESS_RATE : HDB_STRESS_RATE, years);
		const planningRate = bank ? BANK_PLANNING_RATE : HDB_RATE;

		let comfortMonthly = Math.min(stressCap, o.income * COMFORT_SHARE);
		if (o.expensesKnown) {
			// Keep saving at least 20% of take-home after the part of the
			// instalment that CPF OA contributions don't cover.
			const cashRoom = Math.max(0, o.takeHome * (1 - MIN_SAVINGS_RATE) - o.expenses);
			comfortMonthly = Math.min(comfortMonthly, o.oaInflow + cashRoom);
		}
		const comfortLoan = Math.min(maxLoanAllowed, presentValue(comfortMonthly, planningRate, years));

		const fitsFunds = (price, cash) => {
			const due = price * (1 - LTV) + bsd(price) + LEGAL_AND_FEES;
			if (o.bto) {
				// The option fee is the one BTO cost that must be cash. It's small
				// and one-off, so it may come out of the emergency buffer (the
				// result says so) rather than blocking the flat altogether.
				if (cash < BTO_OPTION_FEE && o.cashAll < BTO_OPTION_FEE) return false;
				// Signing the Agreement for Lease: 10% (HDB loan) or 20% (bank
				// loan) plus stamp duty, from today's cash + CPF.
				if (cash + o.cpfNow < price * BTO_SIGNING_SHARE[bank ? "bank" : "hdb"] + bsd(price)) return false;
			} else {
				// Resale option fees (up to $5,000) are cash-only too; same rule.
				const otp = Math.min(price * OTP_RATE, OTP_CAP);
				if (cash < otp && o.cashAll < otp) return false;
			}
			if (bank && cash < price * BANK_MIN_CASH) return false;
			return cash + o.cpfAtKeys + o.grants >= due;
		};

		// The loan is only what savings, CPF OA and grants don't cover (never
		// more than 75% of the price), so bigger savings mean a bigger flat.
		const loanNeeded = (price, cash) => Math.max(0, price + bsd(price) + LEGAL_AND_FEES - cash - o.cpfAtKeys - o.grants);
		const priceFor = (loanLimit, cash) => searchPrice((price) => {
			const need = loanNeeded(price, cash);
			return need <= loanLimit && need <= price * LTV && fitsFunds(price, cash);
		});
		const comfortable = priceFor(comfortLoan, o.cashComfort);
		const max = priceFor(maxLoanAllowed, o.cashAll);
		const loan = loanNeeded(comfortable, o.cashComfort);
		const monthly = instalment(loan, planningRate, years);
		// Income-limited if the loan is up against the comfortable limit;
		// otherwise it's the downpayment (savings) holding things back.
		const incomeBound = comfortLoan > 0 && loan >= comfortLoan - 5000;
		// With no loan at all (age), what cash + CPF + grants alone can buy.
		const fundsOnly = searchPrice((price) => loanNeeded(price, o.cashAll) <= 0 && fitsFunds(price, o.cashAll));

		return {
			loan: bank ? "bank" : "hdb",
			years,
			ratePercent: planningRate * 100,
			price: roundDown(comfortable, 1000),
			maxPrice: roundDown(max, 1000),
			monthly: Math.round(monthly),
			cpfCovers: Math.round(Math.min(monthly, o.oaInflow)),
			limitedBy: incomeBound ? "income" : "savings",
			loanAmount: Math.round(loan),
			fundsOnlyPrice: roundDown(fundsOnly, 1000),
			comfortMonthly: Math.round(comfortMonthly),
		};
	}

	function home(input) {
		const { age, income, incomes, alone, cash, cashAll, cpf, otherDebt, expenses, expensesKnown } = input;
		const ceiling = alone ? HDB_INCOME_CEILING_SINGLE : HDB_INCOME_CEILING_FAMILY;
		// Above the ceiling: no BTO, no HDB loan, no CPF Housing Grant (EHG is
		// already $0 above $9,000). Resale with a bank loan still works, and the
		// Proximity Housing Grant has no income ceiling.
		const hdbEligible = income <= ceiling;
		const grants = grantsFor({
			income,
			alone,
			ehg: input.ehg && hdbEligible,
			familyGrant: input.familyGrant && hdbEligible,
			proximity: input.proximity,
		});
		const bto = hdbEligible && !input.resale && !grants.items.some((item) => item.key === "family" || item.key === "phg");
		const oaInflow = incomes.reduce((sum, pay) => sum + Math.min(pay, CPF_OW_CEILING) * oaRate(age), 0);
		const cpfAtKeys = cpf + (bto ? oaInflow * 12 * BTO_KEY_YEARS : 0);
		const base = {
			income,
			takeHome: income * TAKE_HOME_SHARE,
			expenses,
			expensesKnown,
			oaInflow,
			otherDebt,
			bto,
			ageAtLoan: age + (bto ? BTO_KEY_YEARS : 0),
			cpfNow: cpf,
			cpfAtKeys,
			grants: grants.total,
			cashComfort: cash,
			cashAll,
		};
		const options = [];
		if (hdbEligible) options.push(homeOption({ ...base, loan: "hdb" }));
		options.push(homeOption({ ...base, loan: "bank" }));
		const best = options.reduce((a, b) => (b.price > a.price ? b : a));
		const savingsRateAfter = expensesKnown
			? (base.takeHome - expenses - Math.max(0, best.monthly - oaInflow)) / base.takeHome
			: null;
		return {
			type: bto ? "bto" : "resale",
			price: best.price,
			maxPrice: Math.max(...options.map((option) => option.maxPrice)),
			best,
			options,
			grants,
			oaInflow: Math.round(oaInflow),
			cpfAtKeys: Math.round(cpfAtKeys),
			cpfNow: Math.round(cpf),
			keyYears: BTO_KEY_YEARS,
			hdbEligible,
			ceiling,
			singleUnder35: alone && age < SINGLES_MIN_AGE,
			savingsRateAfter,
		};
	}

	// One vehicle loan setup: the most you can pay at the comfortable and
	// stretch instalment, capped by cash for the downpayment and by TDSR.
	function vehicleTier({ takeHome, income, cash, otherDebt, ltv, rate, years }) {
		const k = perDollar(ltv, rate, years);
		const byIncome = (share) => Math.max(0, (takeHome * share) / k);
		const byCash = cash / (1 - ltv);
		const byTdsr = Math.max(0, (income * TDSR - otherDebt) / k);
		const comfortable = roundDown(Math.min(byIncome(VEHICLE_COMFORT_SHARE), byCash, byTdsr), 1000);
		const stretch = roundDown(Math.min(byIncome(VEHICLE_STRETCH_SHARE), byCash, byTdsr), 1000);
		return {
			ltv,
			price: comfortable,
			stretchPrice: stretch,
			downpayment: Math.round(comfortable * (1 - ltv)),
			stretchDownpayment: Math.round(stretch * (1 - ltv)),
			instalment: Math.round(comfortable * k),
			stretchInstalment: Math.round(stretch * k),
			limitedBy: byCash < byIncome(VEHICLE_COMFORT_SHARE) ? "savings" : "income",
		};
	}

	// Gross pay whose take-home keeps an instalment under the comfortable share.
	function payFor(monthly) {
		return Math.ceil(monthly / VEHICLE_COMFORT_SHARE / TAKE_HOME_SHARE / 100) * 100;
	}

	function car({ income, cash, otherDebt }) {
		const takeHome = income * TAKE_HOME_SHARE;
		const tiers = CAR_TIERS.map((tier) => ({
			key: tier.key,
			label: tier.label,
			...vehicleTier({ takeHome, income, cash, otherDebt, ltv: tier.ltv, rate: CAR_FLAT_RATE, years: CAR_LOAN_YEARS }),
		}));
		// Headline on the lower of the two, so it holds whatever the OMV.
		const base = tiers.reduce((a, b) => (b.price < a.price ? b : a));
		return {
			kind: "car",
			tiers,
			price: base.price,
			downpayment: base.downpayment,
			instalment: base.instalment,
			realistic: tiers.some((tier) => tier.price >= CAR_MIN_REALISTIC),
			limitedBy: tiers.every((tier) => tier.limitedBy === "savings") ? "savings" : "income",
			instalmentCap: Math.round(takeHome * VEHICLE_COMFORT_SHARE),
			allInLow: Math.round(base.instalment * CAR_ALL_IN_LOW),
			allInHigh: Math.round(base.instalment * CAR_ALL_IN_HIGH),
			monthlyAllIn: Math.round(base.instalment * (CAR_ALL_IN_LOW + CAR_ALL_IN_HIGH) / 2),
			examplePrice: CAR_EXAMPLE_PRICE,
			examples: CAR_TIERS.map((tier) => ({
				label: tier.label,
				downpayment: Math.round(CAR_EXAMPLE_PRICE * (1 - tier.ltv)),
				pay: payFor(CAR_EXAMPLE_PRICE * perDollar(tier.ltv, CAR_FLAT_RATE, CAR_LOAN_YEARS)),
			})),
		};
	}

	function bike({ income, cash, otherDebt }) {
		const takeHome = income * TAKE_HOME_SHARE;
		const t = vehicleTier({ takeHome, income, cash, otherDebt, ltv: BIKE_LTV, rate: BIKE_FLAT_RATE, years: BIKE_LOAN_YEARS });
		return {
			kind: "bike",
			...t,
			realistic: t.price >= BIKE_MIN_REALISTIC,
			instalmentCap: Math.round(takeHome * VEHICLE_COMFORT_SHARE),
			allInLow: t.instalment + BIKE_RUNNING_LOW,
			allInHigh: t.instalment + BIKE_RUNNING_HIGH,
			monthlyAllIn: t.instalment + (BIKE_RUNNING_LOW + BIKE_RUNNING_HIGH) / 2,
			examplePrice: BIKE_EXAMPLE_PRICE,
			exampleDownpayment: Math.round(BIKE_EXAMPLE_PRICE * (1 - BIKE_LTV)),
			examplePay: payFor(BIKE_EXAMPLE_PRICE * perDollar(BIKE_LTV, BIKE_FLAT_RATE, BIKE_LOAN_YEARS)),
		};
	}

	// Plain-language car result, shared by the bot and the website.
	function carSummary(result) {
		const c = result.car;
		const money = (value) => `$${Math.round(value).toLocaleString("en-SG")}`;
		const pct = (ltv) => `${Math.round((1 - ltv) * 100)}% down`;
		if (c.realistic) {
			const rows = [];
			c.tiers.forEach((tier) => {
				rows.push([`${tier.label} (${pct(tier.ltv)}): comfortable`, `${money(tier.price)} · ${money(tier.downpayment)} down · ${money(tier.instalment)}/month`]);
				rows.push([`${tier.label}: stretch`, `${money(tier.stretchPrice)} · ${money(tier.stretchDownpayment)} down · ${money(tier.stretchInstalment)}/month`]);
			});
			rows.push(["All-in monthly cost (comfortable)", `${money(c.allInLow)} to ${money(c.allInHigh)} (1.3 to 1.5x the instalment)`]);
			const high = Math.max(...c.tiers.map((tier) => tier.price));
			return {
				ok: true,
				headlineLabel: high > c.price ? "Car: comfortable, depending on the OMV" : "Car: comfortable up to",
				headline: high > c.price ? `${money(c.price)} to ${money(high)}` : money(c.price),
				sub: `Instalment about ${money(c.instalment)}/month, under 10% of your take-home pay. How much you can borrow depends on the car's OMV, so both are shown.`,
				rows,
				notes: [],
			};
		}
		return {
			ok: false,
			headlineLabel: "Car",
			headline: "Not comfortably yet",
			sub: c.limitedBy === "savings"
				? "After your emergency buffer, there isn't enough for the downpayment (30% to 40% of the price, in cash)."
				: `Keeping the instalment under 10% of take-home means about ${money(c.instalmentCap)}/month for you, which covers a car of about ${money(c.price)}.`,
			rows: [],
			notes: [`A ${money(c.examplePrice)} car needs ${c.examples.map((e) => `${money(e.downpayment)} down and pay of about ${money(e.pay)}/month (${e.label.replace("OMV", "OMV")})`).join(", or ")} to keep its instalment under 10% of take-home.`],
		};
	}

	function bikeSummary(result) {
		const b = result.bike;
		const money = (value) => `$${Math.round(value).toLocaleString("en-SG")}`;
		if (b.realistic) {
			return {
				ok: true,
				headlineLabel: "Motorbike: comfortable up to",
				headline: money(b.price),
				sub: `Instalment about ${money(b.instalment)}/month, under 10% of your take-home pay.`,
				rows: [
					["Downpayment (20%)", money(b.downpayment)],
					["Stretch (instalment at 15% of take-home)", `${money(b.stretchPrice)} · ${money(b.stretchDownpayment)} down · ${money(b.stretchInstalment)}/month`],
					["All-in monthly cost (comfortable)", `${money(b.allInLow)} to ${money(b.allInHigh)} (instalment plus insurance, road tax, petrol, parking)`],
				],
				notes: [],
			};
		}
		return {
			ok: false,
			headlineLabel: "Motorbike",
			headline: "Not comfortably yet",
			sub: b.limitedBy === "savings"
				? "After your emergency buffer, there isn't enough for the 20% downpayment."
				: `Keeping the instalment under 10% of take-home means about ${money(b.instalmentCap)}/month for you, which covers a bike of about ${money(b.price)}.`,
			rows: [],
			notes: [`A ${money(b.examplePrice)} bike needs about ${money(b.exampleDownpayment)} down, and pay of about ${money(b.examplePay)}/month to keep its instalment under 10% of take-home.`],
		};
	}

	// input: { plan: ["home","car","bike"] (or legacy want: house|car|both), age, monthlyPay, alone, partnerPay,
	//          savings, cpfOa, hasDependants, monthlyExpenses (optional),
	//          otherDebt, ehg, familyGrant, proximity: none|near|with }
	function calculate(input) {
		const age = Math.max(18, Number(input.age) || 30);
		const alone = input.alone !== false;
		const pay = Math.max(0, Number(input.monthlyPay) || 0);
		const partnerPay = alone ? 0 : Math.max(0, Number(input.partnerPay) || 0);
		const incomes = alone ? [pay] : [pay, partnerPay];
		const income = pay + partnerPay;
		const savings = Math.max(0, Number(input.savings) || 0);
		const cpf = Math.max(0, Number(input.cpfOa) || 0);
		const otherDebt = Math.max(0, Number(input.otherDebt) || 0);
		const expensesKnown = Number(input.monthlyExpenses) > 0;
		const expenses = expensesKnown ? Number(input.monthlyExpenses) : income * TAKE_HOME_SHARE * DEFAULT_SPEND_SHARE;
		const buffer = Math.round(input.hasDependants ? income * 6 : expenses * 6);
		const spare = Math.max(0, savings - buffer);
		const legacy = { house: ["home"], car: ["car"], both: ["home", "car"], bike: ["bike"] };
		let plan = Array.isArray(input.plan) ? input.plan : legacy[input.want] || ["home", "car"];
		plan = ["home", "car", "bike"].filter((item) => plan.includes(item));
		if (!plan.length) plan = ["home"];
		const want = plan.includes("home") && plan.includes("car") ? "both" : plan.includes("home") ? "house" : plan.includes("car") ? "car" : "bike";

		const result = {
			age,
			income,
			buffer,
			bufferBasis: input.hasDependants ? "pay" : expensesKnown ? "expenses" : "estimated",
			expenses: Math.round(expenses),
			spare,
			want,
			plan,
		};

		const vehicles = [];
		if (plan.includes("car")) {
			result.car = car({ income, cash: spare, otherDebt });
			vehicles.push(result.car);
		}
		if (plan.includes("bike")) {
			result.bike = bike({ income, cash: spare, otherDebt });
			vehicles.push(result.bike);
		}
		const owned = vehicles.filter((v) => v.realistic);
		if (owned.length > 1) {
			const monthly = owned.reduce((sum, v) => sum + v.instalment, 0);
			result.vehiclesTogether = { monthly, share: monthly / (income * TAKE_HOME_SHARE) };
		}
		if (plan.includes("home")) {
			const homeInput = {
				age,
				income,
				incomes,
				alone,
				cash: spare,
				cashAll: savings,
				cpf,
				otherDebt,
				expenses,
				expensesKnown,
				ehg: Boolean(input.ehg),
				familyGrant: Boolean(input.familyGrant),
				proximity: input.proximity || "none",
				resale: Boolean(input.resale),
			};
			const withoutVehicles = home(homeInput);
			result.home = withoutVehicles;
			if (owned.length) {
				const down = owned.reduce((sum, v) => sum + v.downpayment, 0);
				const withVehicles = home({
					...homeInput,
					cash: Math.max(0, spare - down),
					cashAll: Math.max(0, savings - down),
					otherDebt: otherDebt + owned.reduce((sum, v) => sum + v.instalment, 0),
					expenses: expenses + owned.reduce((sum, v) => sum + v.monthlyAllIn, 0),
				});
				result.homeWithCar = withVehicles;
				result.vehicleCostsYouOfHome = Math.max(0, withoutVehicles.price - withVehicles.price);
				result.vehicleWords = owned.map((v) => (v.kind === "car" ? "car" : "bike")).join(" and ");
				if (plan.includes("car") && result.car.realistic) result.carCostsYouOfHome = result.vehicleCostsYouOfHome;
			}
		}
		return result;
	}

	function money(value) {
		return `$${Math.round(Number(value) || 0).toLocaleString("en-SG")}`;
	}

	// Plain-language summary of the home result, shared by the bot (text)
	// and the website (HTML) so both say exactly the same thing.
	function homeSummary(result) {
		const home = result.home;
		const best = home.best;
		const flat = home.type === "bto" ? "BTO flat" : "resale flat";
		const summary = {
			title: home.type === "bto" ? "Home (BTO)" : "Home (resale)",
			headlineLabel: `Comfortable: a ${flat} up to`,
			headline: money(home.price),
			sub: "",
			rows: [],
			notes: [],
		};
		if (home.price <= 0) {
			summary.headlineLabel = "Home";
			summary.headline = "Not yet";
			summary.sub = "Once your emergency buffer is set aside, there isn't enough left for the downpayment.";
		} else {
			const loanName = best.loan === "hdb" ? "HDB loan" : "Bank loan";
			const cpfLine = best.cpfCovers >= best.monthly
				? `your CPF OA (about ${money(home.oaInflow)}/month) covers all of it`
				: `your CPF OA covers about ${money(best.cpfCovers)}, cash ${money(best.monthly - best.cpfCovers)}`;
			summary.sub = `${loanName} over ${best.years} years: about ${money(best.monthly)}/month at ${best.ratePercent}%, and ${cpfLine}.`;
			const other = home.options.find((option) => option !== best);
			if (other) {
				summary.rows.push([
					other.loan === "hdb" ? "With an HDB loan instead" : "With a bank loan instead",
					other.loan === "bank" && other.price < best.price ? `${money(other.price)} (banks need 5% of the price in cash)` : money(other.price),
				]);
			}
			if (home.grants.items.length) {
				home.grants.items.forEach((item) => summary.rows.push([item.label, item.amount > 0 ? money(item.amount) : "$0 at your income"]));
			}
			if (home.type === "bto") {
				summary.rows.push(["Your CPF OA by key collection (~3 years)", `about ${money(home.cpfAtKeys)}`]);
			}
			summary.rows.push([
				"What's holding you back",
				best.limitedBy === "savings" ? "Savings for the downpayment" : `Your income (instalment kept within 30% of pay, ${money(best.comfortMonthly)}/month)`,
			]);
			if (home.maxPrice > home.price) {
				summary.rows.push(["Stretch (the most the loan rules allow, using every dollar)", money(home.maxPrice)]);
			}
			if (home.savingsRateAfter !== null) {
				summary.notes.push(`After the instalment you'd still save about ${Math.max(0, Math.round(home.savingsRateAfter * 100))}% of your take-home pay.`);
			}
			if (home.type === "resale" && home.grants.items.some((item) => item.key === "ehg" && item.amount > 0)) {
				summary.notes.push("Enhanced CPF Housing Grant on resale: at least one of you needs to have been working for the 12 months before you apply.");
			}
			const optionFee = home.type === "bto" ? BTO_OPTION_FEE : Math.min(home.price * OTP_RATE, OTP_CAP);
			if (home.type !== "bto" && result.spare < optionFee) {
				summary.notes.push(`The option fee (about ${money(optionFee)}) has to be paid in cash before CPF can be used, so it comes out of your emergency buffer. Top the buffer back up afterwards.`);
			}
			if (home.type === "bto" && result.spare < BTO_OPTION_FEE) {
				summary.notes.push(`The ${money(BTO_OPTION_FEE)} BTO option fee has to be paid in cash, so it comes out of your emergency buffer. Top the buffer back up before key collection.`);
			}
			if (home.type === "bto") {
				summary.notes.push("BTO: with an HDB loan you pay 10% of the price when you sign the Agreement for Lease and 15% at key collection, so the CPF you build up while waiting counts. Young couples on the Staggered Downpayment Scheme can pay 5% at signing instead. Buying resale instead? Pick a resale option (and its grants) to compare.");
			}
		}
		if (home.singleUnder35) {
			summary.notes.push("Singles can only buy an HDB flat on their own from age 35. Before that, it's with a partner or family, or private property.");
		}
		if (!home.hdbEligible) {
			summary.notes.push(`Your household income is above HDB's ${money(home.ceiling)} ceiling, so no BTO, HDB loan or CPF Housing Grant. This is a resale flat with a bank loan.`);
		}
		if (home.price > 1000000) {
			summary.notes.push("That's above most HDB resale prices, so you're into condo territory.");
		}
		return summary;
	}

	// The small print under a result, shared by the bot and the website.
	function footnote(result) {
		const parts = [];
		if (result.home) {
			parts.push("Comfortable keeps the home loan instalment within 30% of gross pay, the limit HDB itself uses. Loans are stress-tested at 3% (HDB) or 4% (bank), and bank loans are planned at 3% since today's ~1.6% packages only last 2 to 3 years.");
		}
		if (result.car) {
			parts.push("Car loans: 7 years at 2.48% flat; MAS lets you borrow 70% of the price if the OMV is $20,000 or less, 60% if above. All-in costs cover insurance, road tax, petrol, parking and servicing.");
		}
		if (result.bike) {
			parts.push("Motorbike loans aren't capped by MAS; planned at 80% financing over 5 years at 2.5% flat, typical of bank bike loans.");
		}
		parts.push("Estimates only, not personalised advice.");
		return parts.join(" ");
	}

	return { calculate, homeSummary, carSummary, bikeSummary, footnote, bsd, ehgAmount, CAR_COMFORT_SHARE, MSR, TDSR, HDB_INCOME_CEILING_FAMILY, HDB_INCOME_CEILING_SINGLE };
});
