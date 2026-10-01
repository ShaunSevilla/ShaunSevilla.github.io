// Singapore personal income tax + reliefs for an employee: tax residents
// (citizens, PRs, foreigners here 183+ days) and non-resident foreigners.
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
	// NSman Relief: key command/staff appointment holders get more.
	const NSMAN = { active: 3000, inactive: 1500, keyActive: 5000, keyInactive: 3500, family: 750, none: 0 };
	// Non-residents (foreigners here under 183 days): employment income taxed
	// at the higher of 15% flat or resident rates, with no reliefs (IRAS).
	const NON_RESIDENT_FLAT = 0.15;
	// local = citizen or PR from the 3rd year; pr1/pr2 = PR in the 1st/2nd
	// year (lower, graduated CPF); foreigner = here 183+ days (tax resident);
	// nonresident = foreigner here under 183 days.
	const RESIDENCY = ["local", "pr1", "pr2", "foreigner", "nonresident"];
	function residencyInfo(residency) {
		const value = RESIDENCY.includes(residency) ? residency : "local";
		return {
			residency: value,
			isLocal: value === "local" || value === "pr1" || value === "pr2",
			isNonResident: value === "nonresident",
			prYear: value === "pr1" ? 1 : value === "pr2" ? 2 : 0,
		};
	}

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

	// Employee share of compulsory CPF, 2026 (CPF Board rate tables). Citizens
	// and 3rd-year+ PRs pay full rates; PRs in their 1st and 2nd year pay the
	// graduated rates (the default unless they opted into full rates).
	function employeeCpfRate(age, prYear) {
		if (prYear === 1) return 0.05;
		if (prYear === 2) {
			if (age <= 55) return 0.15;
			if (age <= 60) return 0.125;
			if (age <= 65) return 0.075;
			return 0.05;
		}
		if (age <= 55) return 0.2;
		if (age <= 60) return 0.18;
		if (age <= 65) return 0.125;
		if (age <= 70) return 0.075;
		return 0.05;
	}

	// Pass `residency` (preferred), or `isLocal` for a citizen/3rd-year+ PR.
	function employeeCpf({ monthlyPay, bonus, age, isLocal, residency }) {
		const info = residency !== undefined ? residencyInfo(residency) : { isLocal: Boolean(isLocal), prYear: 0 };
		const pay = Number(monthlyPay) || 0;
		if (!info.isLocal || pay <= 500) return 0;
		const rate = employeeCpfRate(age, info.prYear);
		// $500 to $750 a month: the employee share phases in at 3x the rate on
		// pay above $500 (CPF's graduated rates for lower-wage workers).
		if (pay <= 750) return Math.round(3 * rate * (pay - 500) * 12);
		const ordinary = Math.min(pay, CPF_OW_CEILING_MONTHLY) * 12;
		const additional = Math.min(Number(bonus) || 0, Math.max(0, CPF_ANNUAL_SALARY_CEILING - ordinary));
		return Math.round((ordinary + additional) * rate);
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
		const { residency, isLocal, isNonResident, prYear } = residencyInfo(input.residency);
		const income = monthlyPay * 12 + bonus;
		// Parenthood Tax Rebate still unused: comes off the tax itself, after
		// reliefs, and whatever isn't used carries forward to later years.
		const rebateAvailable = isNonResident ? 0 : Math.max(0, Math.round(Number(input.parenthoodRebate) || 0));

		if (isNonResident) {
			const flat = income * NON_RESIDENT_FLAT;
			const progressive = taxOn(income);
			const flatApplies = flat >= progressive;
			const tax = Math.round(Math.max(flat, progressive));
			return {
				income: Math.round(income),
				residency,
				isLocal: false,
				isNonResident: true,
				flatApplies,
				prYear: 0,
				children: 0,
				items: [],
				reliefsBeforeCap: 0,
				totalRelief: 0,
				capped: false,
				chargeable: Math.round(income),
				taxBeforeRebate: tax,
				rebateAvailable: 0,
				rebateUsed: 0,
				rebateLeft: 0,
				tax,
				taxWithoutReliefs: tax,
				reliefSaved: 0,
				effectiveRate: income > 0 ? tax / income : 0,
				marginalRate: flatApplies ? NON_RESIDENT_FLAT : marginalRate(income),
				opportunities: [],
				potentialSaving: 0,
				taxAfterOpportunities: tax,
				lowTax: false,
			};
		}
		const children = Math.max(0, Math.floor(Number(input.children) || 0));
		const parentsWith = Math.max(0, Math.floor(Number(input.parentsLivingWith) || 0));
		const parentsApart = Math.max(0, Math.floor(Number(input.parentsNotLivingWith) || 0));
		const srsCap = isLocal ? SRS_CAP_LOCAL : SRS_CAP_FOREIGNER;
		const srsSoFar = Math.min(srsCap, Math.max(0, Number(input.srsSoFar) || 0));
		const topUpSelfSoFar = isLocal ? Math.min(CPF_TOPUP_SELF_CAP, Math.max(0, Number(input.topUpSelfSoFar) || 0)) : 0;
		const topUpFamilySoFar = Math.min(CPF_TOPUP_FAMILY_CAP, Math.max(0, Number(input.topUpFamilySoFar) || 0));

		const cpf = employeeCpf({ monthlyPay, bonus, age, residency });
		const items = [];
		const add = (key, label, amount, auto) => {
			if (amount > 0) items.push({ key, label, amount: Math.round(amount), auto: Boolean(auto) });
		};

		add("cpf", prYear ? `CPF contributions (from your pay, at the lower rate for year ${prYear} of PR)` : "CPF contributions (from your pay)", cpf, true);
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
		const taxBeforeRebate = taxOn(chargeable);
		const rebateUsed = Math.min(rebateAvailable, taxBeforeRebate);
		const tax = taxBeforeRebate - rebateUsed;
		const taxWithoutReliefs = taxOn(income);
		// What you actually pay on a given chargeable income, after the rebate.
		const payable = (amount) => Math.max(0, taxOn(amount) - rebateAvailable);

		// What's still on the table before 31 Dec, applied in this order:
		// SRS, your own CPF top-up, then family. Each saving is the extra tax
		// it removes on top of the ones before it.
		const options = [
			{ key: "srs", label: "Top up your SRS", room: srsCap - srsSoFar },
			{ key: "topup_self", label: "Top up your own CPF (SA/RA or MediSave)", room: isLocal ? CPF_TOPUP_SELF_CAP - topUpSelfSoFar : 0 },
			// Recipients must be Singapore Citizens/PRs; for simplicity only locals
			// are shown this one.
			{ key: "topup_family", label: "Top up a family member's CPF (parent, grandparent, spouse or sibling)", room: isLocal ? CPF_TOPUP_FAMILY_CAP - topUpFamilySoFar : 0 },
		];
		let reliefSoFar = reliefsBeforeCap;
		let taxSoFar = tax;
		const opportunities = [];
		for (const option of options) {
			const capRoom = Math.max(0, RELIEF_CAP - reliefSoFar);
			// Never suggest more than it takes to bring tax to $0 (the first
			// $20,000 of chargeable income is taxed at 0%).
			const toZero = Math.max(0, income - Math.min(RELIEF_CAP, reliefSoFar) - TAX_BANDS[0][0]);
			const most = Math.min(option.room, capRoom, toZero);
			if (most <= 0) continue;
			const taxWith = (x) => payable(Math.max(0, income - Math.min(RELIEF_CAP, reliefSoFar + x)));
			const newTax = taxWith(most);
			// With a rebate, a smaller top-up may already bring the bill to the
			// same place: suggest only what still lowers it.
			let low = 0;
			let high = Math.ceil(most);
			while (low < high) {
				const mid = Math.floor((low + high) / 2);
				if (taxWith(mid) <= newTax) high = mid;
				else low = mid + 1;
			}
			const usable = Math.min(most, high);
			const saving = Math.round(taxSoFar - newTax);
			// Nothing left to save (tax already $0, or the rebate covers it):
			// don't suggest it.
			if (saving <= 0) continue;
			opportunities.push({ key: option.key, label: option.label, amount: Math.round(usable), saving });
			reliefSoFar += usable;
			taxSoFar = newTax;
		}
		const potentialSaving = Math.round(tax - taxSoFar);

		return {
			income: Math.round(income),
			residency,
			isLocal,
			isNonResident: false,
			prYear,
			children,
			items,
			reliefsBeforeCap: Math.round(reliefsBeforeCap),
			totalRelief: Math.round(totalRelief),
			capped: reliefsBeforeCap > RELIEF_CAP,
			chargeable: Math.round(chargeable),
			taxBeforeRebate: Math.round(taxBeforeRebate),
			rebateAvailable,
			rebateUsed: Math.round(rebateUsed),
			rebateLeft: Math.round(rebateAvailable - rebateUsed),
			// The rebate wipes out this year's tax (top-ups can't lower it further).
			rebateCoversTax: rebateAvailable > 0 && taxBeforeRebate > 0 && tax <= 0,
			tax: Math.round(tax),
			taxWithoutReliefs: Math.round(taxWithoutReliefs),
			reliefSaved: Math.round(taxWithoutReliefs - taxBeforeRebate),
			effectiveRate: income > 0 ? tax / income : 0,
			marginalRate: marginalRate(chargeable),
			opportunities,
			potentialSaving,
			taxAfterOpportunities: Math.round(taxSoFar),
			lowTax: marginalRate(chargeable) <= 0.035,
		};
	}

	// Plain-English verdict on SRS for this person, or null when there's
	// nothing worth flagging. Foreigners get their own version: they can
	// withdraw everything penalty-free after 10 years (only half taxed, with
	// 15% withheld on that half if they've left and take out <= $200k a
	// year), so SRS works differently for them (IRAS, smartwealth.sg).
	function srsHonestTake(result) {
		const srs = result.opportunities.find((option) => option.key === "srs");
		if (!srs || result.tax <= 0) return null;
		const rate = result.marginalRate;
		const pct = `${Math.round(rate * 1000) / 10}%`;
		const perThousand = Math.round(rate * 1000);
		if (!result.isLocal) {
			return (
				`Honest take for foreigners: at your ${pct} top rate, every $1,000 into SRS saves about $${perThousand} of tax now. The catch is getting it out. ` +
				"Once you've had the account for 10 years (and aren't a citizen or PR), you can withdraw everything with no penalty and only half of it taxed. " +
				"If you've left Singapore by then, the bank withholds 15% on that half, about 7.5% of what you take out (if it's under $200,000 a year and you have no other Singapore income). " +
				"Take it out before 10 years and it's fully taxed plus a 5% penalty. " +
				(rate <= 0.07
					? "At your rate that's roughly break-even, so only do it if you're sure you can leave the money invested for 10+ years."
					: "At your rate you save more now than you'd likely pay later, as long as you can leave it for 10+ years.")
			);
		}
		if (rate <= 0.035) {
			return `Honest take: your top tax rate is only ${pct}, so locking money away saves you little. An emergency fund and investing come first. SRS starts to make sense once you're in the 7%+ bracket, and really pays off at 11.5% and up.`;
		}
		if (rate <= 0.07) {
			return "Honest take: at a 7% top rate, every $1,000 into SRS saves about $70 of tax, and the money is locked until retirement age. Worth it only once your emergency fund is sorted and you won't need that money for decades.";
		}
		return null;
	}

	// Days until 31 Dec of `now`'s year (top-ups count for the year they're made).
	// Counted in Singapore time (UTC+8) so a server in another time zone
	// agrees with the website.
	function daysLeftInYear(now) {
		const date = now || new Date();
		const sgOffset = 8 * 3600000;
		const year = new Date(date.getTime() + sgOffset).getUTCFullYear();
		const end = Date.UTC(year, 11, 31, 23, 59, 59) - sgOffset;
		return Math.max(0, Math.ceil((end - date.getTime()) / 86400000));
	}

	return {
		RELIEF_CAP,
		NSMAN,
		NON_RESIDENT_FLAT,
		RESIDENCY,
		SRS_CAP_LOCAL,
		SRS_CAP_FOREIGNER,
		CPF_TOPUP_SELF_CAP,
		CPF_TOPUP_FAMILY_CAP,
		taxOn,
		marginalRate,
		employeeCpf,
		calculate,
		srsHonestTake,
		daysLeftInYear,
	};
});
