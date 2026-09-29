// Singapore personal income tax + reliefs for a tax-resident employee.
// Shared, unchanged, by the Telegram bot (require) and the website (<script>),
// so both give the same answer. Keep the two copies identical:
//   Prosperity_Bot/src/shared/taxRelief.js
//   ShaunSevilla.github.io/js/shared/taxRelief.js
//
// Rules for income earned in 2026 (YA2027). Budget 2026 changed no personal
// reliefs, rates or rebates, so YA2026 rules carry forward. Sources: IRAS
// e-Filer Quick Guide YA2026, IRAS relief pages, CPF Board, MOF (Sep 2026).
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.TaxRelief = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	// Resident rates from YA2024: [upper bound of band, rate].
	const TAX_BANDS = [
		[20000, 0],
		[30000, 0.02],
		[40000, 0.035],
		[80000, 0.07],
		[120000, 0.115],
		[160000, 0.15],
		[200000, 0.18],
		[240000, 0.19],
		[280000, 0.195],
		[320000, 0.2],
		[500000, 0.22],
		[1000000, 0.23],
		[Infinity, 0.24],
	];

	const RELIEF_CAP = 80000;
	const SRS_CAP_LOCAL = 15300;
	const SRS_CAP_FOREIGNER = 35700;
	const CPF_TOPUP_SELF_CAP = 8000; // own SA/RA + MediSave, combined
	const CPF_TOPUP_FAMILY_CAP = 8000;
	const CPF_OW_CEILING_MONTHLY = 8000; // from 1 Jan 2026
	const CPF_ANNUAL_SALARY_CEILING = 102000;
	const LIFE_INSURANCE_CPF_LIMIT = 5000;
	const PARENT_LIVING_WITH = 9000;
	const PARENT_NOT_LIVING_WITH = 5500;
	const SPOUSE_RELIEF = 2000;
	const QCR_PER_CHILD = 4000;
	const WMCR_PER_CHILD_CAP = 50000; // QCR + WMCR per child
	const GRANDPARENT_CAREGIVER = 3000;
	const NSMAN = { active: 3000, inactive: 1500, family: 750, none: 0 };

	function taxOn(chargeable) {
		let tax = 0;
		let lower = 0;
		for (const [upper, rate] of TAX_BANDS) {
			if (chargeable <= lower) break;
			tax += (Math.min(chargeable, upper) - lower) * rate;
			lower = upper;
		}
		return Math.round(tax * 100) / 100;
	}

	function marginalRate(chargeable) {
		for (const [upper, rate] of TAX_BANDS) {
			if (chargeable <= upper) return rate;
		}
		return TAX_BANDS[TAX_BANDS.length - 1][1];
	}

	// Employee share of compulsory CPF, Citizens and 3rd-year+ PRs, 2026.
	function employeeCpfRate(age) {
		if (age <= 55) return 0.2;
		if (age <= 60) return 0.18;
		if (age <= 65) return 0.125;
		if (age <= 70) return 0.075;
		return 0.05;
	}

	function employeeCpf({ monthlyPay, bonus, age, isLocal }) {
		if (!isLocal || monthlyPay <= 750) return 0;
		const ordinary = Math.min(monthlyPay, CPF_OW_CEILING_MONTHLY) * 12;
		const additional = Math.min(bonus, Math.max(0, CPF_ANNUAL_SALARY_CEILING - ordinary));
		return Math.round((ordinary + additional) * employeeCpfRate(age));
	}

	function earnedIncomeRelief(age, income) {
		const cap = age >= 60 ? 8000 : age >= 55 ? 6000 : 1000;
		return Math.min(cap, income);
	}

	// Working Mother's Child Relief. Children are ordered oldest first; the
	// ones born before 2024 are the older ones. Pre-2024: 15/20/25% of earned
	// income; born 2024 onwards: $8k/$10k/$12k. QCR + WMCR <= $50k per child,
	// total WMCR <= 100% of earned income.
	function workingMotherRelief({ income, children, childrenFrom2024 }) {
		const later = Math.min(childrenFrom2024 || 0, children);
		const earlier = children - later;
		let total = 0;
		for (let order = 1; order <= children; order += 1) {
			let amount;
			if (order <= earlier) {
				amount = income * (order === 1 ? 0.15 : order === 2 ? 0.2 : 0.25);
			} else {
				amount = order === 1 ? 8000 : order === 2 ? 10000 : 12000;
			}
			total += Math.min(amount, WMCR_PER_CHILD_CAP - QCR_PER_CHILD);
		}
		return Math.round(Math.min(total, income));
	}

	function calculate(input) {
		const monthlyPay = Math.max(0, Number(input.monthlyPay) || 0);
		const bonus = Math.max(0, Number(input.bonus) || 0);
		const age = Math.max(16, Number(input.age) || 30);
		const isLocal = input.residency !== "foreigner";
		const income = monthlyPay * 12 + bonus;
		const children = Math.max(0, Math.floor(Number(input.children) || 0));
		const parentsWith = Math.max(0, Math.floor(Number(input.parentsLivingWith) || 0));
		const parentsApart = Math.max(0, Math.floor(Number(input.parentsNotLivingWith) || 0));
		const srsCap = isLocal ? SRS_CAP_LOCAL : SRS_CAP_FOREIGNER;
		const srsSoFar = Math.min(srsCap, Math.max(0, Number(input.srsSoFar) || 0));
		const topUpSelfSoFar = isLocal ? Math.min(CPF_TOPUP_SELF_CAP, Math.max(0, Number(input.topUpSelfSoFar) || 0)) : 0;
		const topUpFamilySoFar = Math.min(CPF_TOPUP_FAMILY_CAP, Math.max(0, Number(input.topUpFamilySoFar) || 0));

		const cpf = employeeCpf({ monthlyPay, bonus, age, isLocal });
		const items = [];
		const add = (key, label, amount, auto) => {
			if (amount > 0) items.push({ key, label, amount: Math.round(amount), auto: Boolean(auto) });
		};

		add("cpf", "CPF contributions (from your pay)", cpf, true);
		add("earned", "Earned Income Relief", earnedIncomeRelief(age, income), true);
		if (input.married && input.spouseLowIncome) add("spouse", "Spouse Relief", SPOUSE_RELIEF);
		add("qcr", `Qualifying Child Relief (${children} × $4,000)`, children * QCR_PER_CHILD);
		if (input.workingMother && children > 0) {
			add("wmcr", "Working Mother's Child Relief", workingMotherRelief({ income, children, childrenFrom2024: input.childrenFrom2024 }));
			if (input.grandparentCaregiver) add("gcr", "Grandparent Caregiver Relief", GRANDPARENT_CAREGIVER);
		}
		// At most 2 dependants for Parent Relief; living-with ones count first.
		const withCount = Math.min(2, parentsWith);
		const apartCount = Math.min(2 - withCount, parentsApart);
		add("parent", "Parent Relief", withCount * PARENT_LIVING_WITH + apartCount * PARENT_NOT_LIVING_WITH);
		add("nsman", "NSman Relief", NSMAN[input.nsman] || 0, true);
		add("srs", "SRS contributions", srsSoFar);
		add("topup_self", "CPF cash top-up (yourself)", topUpSelfSoFar);
		add("topup_family", "CPF cash top-up (family)", topUpFamilySoFar);
		if (cpf < LIFE_INSURANCE_CPF_LIMIT) {
			add("life", "Life Insurance Relief", Math.min(LIFE_INSURANCE_CPF_LIMIT - cpf, Math.max(0, Number(input.lifePremium) || 0)));
		}

		const reliefsBeforeCap = items.reduce((sum, item) => sum + item.amount, 0);
		const totalRelief = Math.min(RELIEF_CAP, reliefsBeforeCap);
		const chargeable = Math.max(0, income - totalRelief);
		const tax = taxOn(chargeable);
		const taxWithoutReliefs = taxOn(income);

		// What's still on the table before 31 Dec, applied in this order:
		// SRS, your own CPF top-up, then family. Each saving is the extra tax
		// it removes on top of the ones before it.
		const options = [
			{ key: "srs", label: "Top up your SRS", room: srsCap - srsSoFar },
			{ key: "topup_self", label: "Top up your own CPF (SA/RA or MediSave)", room: isLocal ? CPF_TOPUP_SELF_CAP - topUpSelfSoFar : 0 },
			// Recipients must be Singapore Citizens/PRs; for simplicity only locals
			// are shown this one.
			{ key: "topup_family", label: "Top up a parent's or grandparent's CPF", room: isLocal ? CPF_TOPUP_FAMILY_CAP - topUpFamilySoFar : 0 },
		];
		let reliefSoFar = reliefsBeforeCap;
		let taxSoFar = tax;
		const opportunities = [];
		for (const option of options) {
			const capRoom = Math.max(0, RELIEF_CAP - reliefSoFar);
			const usable = Math.min(option.room, capRoom);
			if (usable <= 0) continue;
			const newTax = taxOn(Math.max(0, income - Math.min(RELIEF_CAP, reliefSoFar + usable)));
			const saving = Math.round(taxSoFar - newTax);
			opportunities.push({ key: option.key, label: option.label, amount: Math.round(usable), saving });
			reliefSoFar += usable;
			taxSoFar = newTax;
		}
		const potentialSaving = Math.round(tax - taxSoFar);

		return {
			income: Math.round(income),
			isLocal,
			items,
			reliefsBeforeCap: Math.round(reliefsBeforeCap),
			totalRelief: Math.round(totalRelief),
			capped: reliefsBeforeCap > RELIEF_CAP,
			chargeable: Math.round(chargeable),
			tax: Math.round(tax),
			taxWithoutReliefs: Math.round(taxWithoutReliefs),
			reliefSaved: Math.round(taxWithoutReliefs - tax),
			effectiveRate: income > 0 ? tax / income : 0,
			marginalRate: marginalRate(chargeable),
			opportunities,
			potentialSaving,
			taxAfterOpportunities: Math.round(taxSoFar),
			lowTax: marginalRate(chargeable) <= 0.035,
		};
	}

	// Days until 31 Dec of `now`'s year (top-ups count for the year they're made).
	function daysLeftInYear(now) {
		const date = now || new Date();
		const end = new Date(date.getFullYear(), 11, 31, 23, 59, 59);
		return Math.max(0, Math.ceil((end - date) / 86400000));
	}

	return {
		RELIEF_CAP,
		SRS_CAP_LOCAL,
		SRS_CAP_FOREIGNER,
		CPF_TOPUP_SELF_CAP,
		CPF_TOPUP_FAMILY_CAP,
		taxOn,
		marginalRate,
		employeeCpf,
		calculate,
		daysLeftInYear,
	};
});
