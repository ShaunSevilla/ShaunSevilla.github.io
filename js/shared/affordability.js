// "What can I afford?" for a home and/or a car in Singapore.
// Shared, unchanged, by the Telegram bot and the website. Keep both copies
// identical:
//   Prosperity_Bot/src/shared/affordability.js
//   ShaunSevilla.github.io/js/shared/affordability.js
//
// Home: the limits banks and HDB actually apply (Sep 2026):
//   • MSR: housing instalment <= 30% of gross monthly income (HDB flats/ECs)
//   • TDSR: all debt instalments <= 55% of gross monthly income
//   • both are tested at a stress rate, not your real rate: 3% p.a. for the
//     HDB concessionary loan, 4% p.a. for bank loans (MAS/HDB, 30 Sep 2022)
//   • LTV 75%: 25% downpayment (CPF or cash); bank loans need >= 5% in cash
//   • tenure: HDB 25 years, bank 30, and loans shouldn't run past age 65
//   • HDB loan income ceiling: $14,000 household / $7,000 singles
//   • singles can buy an HDB flat on their own only from age 35
// Car: "comfortable" means ALL car costs (not just the instalment) stay
// within 15% of gross income; 20% is a stretch (ownershipguide.com, 2026).
// "Comfortable" also leaves an emergency buffer untouched in the bank:
// 6 months of expenses, or 6 months of pay if you have dependants.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.Affordability = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	const MSR = 0.3;
	const TDSR = 0.55;
	const HDB_STRESS_RATE = 0.03;
	const BANK_STRESS_RATE = 0.04;
	const HDB_ACTUAL_RATE = 0.026;
	const LTV = 0.75;
	const BANK_MIN_CASH = 0.05;
	const HDB_MAX_YEARS = 25;
	const BANK_MAX_YEARS = 30;
	const MAX_LOAN_AGE = 65;
	const HDB_INCOME_CEILING_FAMILY = 14000;
	const HDB_INCOME_CEILING_SINGLE = 7000;
	const SINGLES_MIN_AGE = 35;
	const LEGAL_AND_FEES = 3000;
	const OTP_RATE = 0.01;
	const OTP_CAP = 5000;
	const BSD_TIERS = [
		[180000, 0.01],
		[360000, 0.02],
		[1000000, 0.03],
		[1500000, 0.04],
		[3000000, 0.05],
		[Infinity, 0.06],
	];

	const CAR_COMFORT_SHARE = 0.15;
	const CAR_STRETCH_SHARE = 0.2;
	// Insurance ~$150, road tax ~$60, petrol ~$260, parking ~$150,
	// servicing/tyres ~$100, ERP/tolls ~$80 a month for a mass-market car.
	const CAR_RUNNING_COST = 800;
	const CAR_LIFE_MONTHS = 120; // COE is 10 years
	const CAR_LOAN_SHARE = 0.7; // MAS: up to 70% if OMV <= $20,000
	const CAR_FLAT_RATE = 0.0248;
	const CAR_LOAN_YEARS = 7;
	const CAR_DOWNPAYMENT = 1 - CAR_LOAN_SHARE;
	// Monthly cost per $1 of car price: value lost over 10 years plus loan
	// interest spread over the same 10 years.
	const CAR_COST_PER_DOLLAR = 1 / CAR_LIFE_MONTHS + (CAR_LOAN_SHARE * CAR_FLAT_RATE * CAR_LOAN_YEARS) / CAR_LIFE_MONTHS;
	const CAR_INSTALMENT_PER_DOLLAR = (CAR_LOAN_SHARE * (1 + CAR_FLAT_RATE * CAR_LOAN_YEARS)) / (CAR_LOAN_YEARS * 12);
	const CAR_EXAMPLE_PRICE = 120000;
	const CAR_MIN_REALISTIC = 80000;

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

	// Highest price where the loan, the downpayment and the cash-only parts
	// all fit. Binary search, since stamp duty depends on the price.
	function maxHomePrice({ maxLoan, cash, cpf, bank }) {
		const fits = (price) => {
			if (price * LTV > maxLoan) return false;
			const otp = Math.min(price * OTP_RATE, OTP_CAP);
			const cashOnly = bank ? Math.max(price * BANK_MIN_CASH, otp) : otp;
			if (cash < cashOnly) return false;
			return cash + cpf >= price * (1 - LTV) + bsd(price) + LEGAL_AND_FEES;
		};
		let low = 0;
		let high = 5000000;
		for (let i = 0; i < 60; i += 1) {
			const mid = (low + high) / 2;
			if (fits(mid)) low = mid;
			else high = mid;
		}
		return low;
	}

	function homeOption({ bank, monthlyCap, years, cash, cpf }) {
		const stressRate = bank ? BANK_STRESS_RATE : HDB_STRESS_RATE;
		const maxLoan = presentValue(monthlyCap, stressRate, years);
		const price = maxHomePrice({ maxLoan, cash, cpf, bank });
		const byLoanOnly = maxHomePrice({ maxLoan, cash: 1e9, cpf: 0, bank });
		const loan = price * LTV;
		return {
			type: bank ? "bank" : "hdb",
			years,
			maxLoan: Math.round(maxLoan),
			price: roundDown(price, 1000),
			limitedBy: byLoanOnly - price > 1000 ? "savings" : "income",
			monthly: Math.round(instalment(loan, bank ? 0.016 : HDB_ACTUAL_RATE, years)),
		};
	}

	function home({ age, income, cash, cpf, otherDebt, alone }) {
		const years = Math.max(0, MAX_LOAN_AGE - age);
		const monthlyCap = Math.max(0, Math.min(income * MSR, income * TDSR - otherDebt));
		const hdbCeiling = alone ? HDB_INCOME_CEILING_SINGLE : HDB_INCOME_CEILING_FAMILY;
		const hdbEligible = income <= hdbCeiling;
		const options = [];
		if (hdbEligible) options.push(homeOption({ bank: false, monthlyCap, years: Math.min(HDB_MAX_YEARS, years), cash, cpf }));
		options.push(homeOption({ bank: true, monthlyCap, years: Math.min(BANK_MAX_YEARS, years), cash, cpf }));
		const best = options.reduce((a, b) => (b.price > a.price ? b : a));
		return {
			price: best.price,
			best,
			options,
			monthlyCap: Math.round(monthlyCap),
			hdbEligible,
			singleUnder35: alone && age < SINGLES_MIN_AGE,
		};
	}

	function car({ income, cash, otherDebt }) {
		const byIncome = (share) => Math.max(0, (income * share - CAR_RUNNING_COST) / CAR_COST_PER_DOLLAR);
		const byCash = cash / CAR_DOWNPAYMENT;
		const byTdsr = Math.max(0, (income * TDSR - otherDebt) / CAR_INSTALMENT_PER_DOLLAR);
		const comfortable = Math.min(byIncome(CAR_COMFORT_SHARE), byCash, byTdsr);
		const stretch = Math.min(byIncome(CAR_STRETCH_SHARE), byCash, byTdsr);
		const price = roundDown(comfortable, 1000);
		const neededPay = Math.ceil((CAR_RUNNING_COST + CAR_EXAMPLE_PRICE * CAR_COST_PER_DOLLAR) / CAR_COMFORT_SHARE / 100) * 100;
		return {
			price,
			stretchPrice: roundDown(stretch, 1000),
			realistic: price >= CAR_MIN_REALISTIC,
			limitedBy: byCash < byIncome(CAR_COMFORT_SHARE) ? "savings" : "income",
			downpayment: Math.round(price * CAR_DOWNPAYMENT),
			instalment: Math.round(price * CAR_INSTALMENT_PER_DOLLAR),
			monthlyAllIn: Math.round(CAR_RUNNING_COST + price * CAR_COST_PER_DOLLAR),
			runningCost: CAR_RUNNING_COST,
			neededPayForExample: neededPay,
			examplePrice: CAR_EXAMPLE_PRICE,
		};
	}

	// input: { age, monthlyPay, partnerPay, alone, savings, cpfOa,
	//          monthlyExpenses, hasDependants, otherDebt, want: house|car|both }
	function calculate(input) {
		const age = Math.max(18, Number(input.age) || 30);
		const alone = input.alone !== false;
		const income = Math.max(0, Number(input.monthlyPay) || 0) + (alone ? 0 : Math.max(0, Number(input.partnerPay) || 0));
		const savings = Math.max(0, Number(input.savings) || 0);
		const cpf = Math.max(0, Number(input.cpfOa) || 0);
		const otherDebt = Math.max(0, Number(input.otherDebt) || 0);
		const expenses = Number(input.monthlyExpenses) > 0 ? Number(input.monthlyExpenses) : income * 0.5;
		const buffer = Math.round(input.hasDependants ? income * 6 : expenses * 6);
		const spare = Math.max(0, savings - buffer);
		const want = input.want || "both";

		const result = { age, income, buffer, bufferBasis: input.hasDependants ? "pay" : "expenses", spare, want };

		let carResult = null;
		if (want === "car" || want === "both") {
			carResult = car({ income, cash: spare, otherDebt });
			result.car = carResult;
		}
		if (want === "house" || want === "both") {
			const withoutCar = home({ age, income, cash: spare, cpf, otherDebt, alone });
			result.home = withoutCar;
			result.homeStretch = home({ age, income, cash: savings, cpf, otherDebt, alone });
			if (want === "both" && carResult && carResult.realistic) {
				const withCar = home({
					age,
					income,
					cash: Math.max(0, spare - carResult.downpayment),
					cpf,
					otherDebt: otherDebt + carResult.instalment,
					alone,
				});
				result.homeWithCar = withCar;
				result.carCostsYouOfHome = Math.max(0, withoutCar.price - withCar.price);
			}
		}
		return result;
	}

	return { calculate, bsd, CAR_RUNNING_COST, CAR_COMFORT_SHARE, MSR, TDSR };
});
