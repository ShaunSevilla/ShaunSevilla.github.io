// CPF growth projection: OA, SA/RA and MediSave month by month.
// Shared, unchanged, by the Telegram bot and the website. Keep both copies
// identical:
//   Prosperity_Bot/src/shared/cpfProjection.js
//   ShaunSevilla.github.io/js/shared/cpfProjection.js
//
// Rules (CPF Board, 2026):
//   • Contribution and allocation rates from 1 Jan 2026; from 1 Jan 2027
//     ages 55-60 go to 35.5% and 60-65 to 26%, the extra going to the RA up
//     to the Full Retirement Sum (Budget 2026).
//   • Ordinary Wage ceiling $8,000/month.
//   • Interest: OA 2.5%, SA/MA/RA 4%; extra 1% on the first $60,000 (up to
//     $20,000 from OA), 55+: extra 2% on the first $30,000 and 1% on the
//     next $30,000. Worked out monthly, credited once a year; a month's
//     contribution earns interest from the next month.
//   • MediSave is capped at that year's Basic Healthcare Sum (BHS, $79,000
//     in 2026, ~5% a year, fixed from 65). Overflow goes to SA (RA from 55)
//     up to that year's Full Retirement Sum (FRS, $220,400 in 2026, ~3.5% a
//     year), then to OA.
//   • At 55 the SA closes: SA then OA move to the RA up to the FRS; the rest
//     stays in OA. RA contributions after 55 go to the RA only up to the FRS,
//     then to OA.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.CpfProjection = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	const OW_CEILING = 8000;
	const BHS = 79000;
	const BHS_GROWTH = 0.05;
	const FRS = 220400;
	const FRS_GROWTH = 0.035;
	const OA_RATE = 0.025;
	const SMRA_RATE = 0.04;
	const EXTRA_OA_CAP = 20000;
	const EXTRA_BELOW_55 = [{ cap: 60000, rate: 0.01 }];
	const EXTRA_55_PLUS = [
		{ cap: 30000, rate: 0.02 },
		{ cap: 30000, rate: 0.01 },
	];
	const BASE_YEAR = 2026;
	const CONTRIBUTION_2026 = [
		{ maxAge: 55, total: 0.37 },
		{ maxAge: 60, total: 0.34 },
		{ maxAge: 65, total: 0.25 },
		{ maxAge: 70, total: 0.165 },
		{ maxAge: Infinity, total: 0.125 },
	];
	// Budget 2026: extra rate from 1 Jan 2027, all to the RA (up to the FRS).
	const EXTRA_FROM_2027 = [
		{ maxAge: 55, extra: 0 },
		{ maxAge: 60, extra: 0.015 },
		{ maxAge: 65, extra: 0.01 },
		{ maxAge: Infinity, extra: 0 },
	];
	const ALLOCATION = [
		{ maxAge: 35, oa: 0.6217, middle: 0.1621, ma: 0.2162 },
		{ maxAge: 45, oa: 0.5677, middle: 0.1891, ma: 0.2432 },
		{ maxAge: 50, oa: 0.5136, middle: 0.2162, ma: 0.2702 },
		{ maxAge: 55, oa: 0.4055, middle: 0.3108, ma: 0.2837 },
		{ maxAge: 60, oa: 0.353, middle: 0.3382, ma: 0.3088 },
		{ maxAge: 65, oa: 0.14, middle: 0.44, ma: 0.42 },
		{ maxAge: 70, oa: 0.0607, middle: 0.303, ma: 0.6363 },
		{ maxAge: Infinity, oa: 0.08, middle: 0.08, ma: 0.84 },
	];
	// Rough split of an existing OA balance into SA and MA for someone who
	// leaves those blank (from the age-band allocation ratios).
	const band = (list, age) => list.find((b) => age <= b.maxAge) || list[list.length - 1];

	function extraInterest({ ra, oa, sa, ma }, age) {
		const tiers = (age >= 55 ? EXTRA_55_PLUS : EXTRA_BELOW_55).map((t) => ({ ...t }));
		const order = [["ra", ra], ["oa", Math.min(oa, EXTRA_OA_CAP)], ["sa", sa], ["ma", ma]];
		const out = { ra: 0, oa: 0, sa: 0, ma: 0 };
		let i = 0;
		for (const [key, amount] of order) {
			let left = amount;
			while (left > 0 && i < tiers.length) {
				const take = Math.min(left, tiers[i].cap);
				out[key] += (take * tiers[i].rate) / 12;
				tiers[i].cap -= take;
				left -= take;
				if (tiers[i].cap <= 0) i += 1;
			}
			if (i >= tiers.length) break;
		}
		return out;
	}

	// input: { currentAge, targetAge, monthlyWage, oaBalance, saOrRaBalance,
	//          maBalance, salaryGrowth (optional, e.g. 0.03), start (Date) }
	function project(input) {
		const currentAge = Number(input.currentAge);
		const targetAge = Number(input.targetAge);
		const growth = Math.max(0, Number(input.salaryGrowth) || 0);
		const start = input.start || new Date();
		const startMonth = start.getMonth(); // 0-11
		const startYear = start.getFullYear();
		let oa = Math.max(0, Number(input.oaBalance) || 0);
		let ma = Math.max(0, Number(input.maBalance) || 0);
		let sa = currentAge < 55 ? Math.max(0, Number(input.saOrRaBalance) || 0) : 0;
		let ra = currentAge >= 55 ? Math.max(0, Number(input.saOrRaBalance) || 0) : 0;
		const yearsTo55 = Math.max(0, 55 - currentAge);
		const yearsTo65 = Math.max(0, 65 - currentAge);
		const yearsFromBase = startYear - BASE_YEAR;
		const frsAt55 = FRS * Math.pow(1 + FRS_GROWTH, yearsFromBase + yearsTo55);
		const bhsAt55 = BHS * Math.pow(1 + BHS_GROWTH, yearsFromBase + yearsTo55);
		const acc = { oa: 0, sa: 0, ra: 0, ma: 0 };
		const months = Math.round((targetAge - currentAge) * 12);
		const yearly = [];
		let wage = Number(input.monthlyWage) || 0;

		for (let m = 1; m <= months; m += 1) {
			const t = (m - 1) / 12; // years since start
			const age = currentAge + t;
			const calYear = startYear + Math.floor((startMonth + m - 1) / 12);
			if (m > 1 && (m - 1) % 12 === 0) wage *= 1 + growth;
			const bhsNow = BHS * Math.pow(1 + BHS_GROWTH, yearsFromBase + Math.min(t, yearsTo65));
			const frsNow = age >= 55 ? frsAt55 : FRS * Math.pow(1 + FRS_GROWTH, yearsFromBase + t);

			// Interest on this month's opening balances (credited yearly).
			const extra = extraInterest({ ra, oa, sa, ma }, age);
			acc.oa += (oa * OA_RATE) / 12;
			acc.ma += (ma * SMRA_RATE) / 12 + extra.ma;
			if (age >= 55) acc.ra += (ra * SMRA_RATE) / 12 + extra.ra + extra.oa;
			else acc.sa += (sa * SMRA_RATE) / 12 + extra.sa + extra.oa;

			// Contributions.
			const capped = Math.min(wage, OW_CEILING);
			const base = band(CONTRIBUTION_2026, age).total * capped;
			const alloc = band(ALLOCATION, age);
			oa += base * alloc.oa;
			ma += base * alloc.ma;
			let toRetirement = base * alloc.middle + (calYear >= 2027 ? band(EXTRA_FROM_2027, age).extra * capped : 0);
			if (age >= 55) {
				const space = Math.max(0, frsAt55 - ra);
				const toRa = Math.min(toRetirement, space);
				ra += toRa;
				oa += toRetirement - toRa;
			} else {
				sa += toRetirement;
			}

			// SA closes at 55: SA then OA into the RA, up to the FRS.
			if (age >= 55 && sa > 0) {
				const fromSa = Math.min(sa, Math.max(0, frsAt55 - ra));
				ra += fromSa;
				oa += sa - fromSa;
				sa = 0;
				const fromOa = Math.min(oa, Math.max(0, frsAt55 - ra));
				ra += fromOa;
				oa -= fromOa;
			}

			// Credit interest every 12 months.
			if (m % 12 === 0) {
				oa += acc.oa;
				ma += acc.ma;
				ra += acc.ra;
				sa += acc.sa;
				acc.oa = acc.sa = acc.ra = acc.ma = 0;
			}

			// MediSave above this year's BHS overflows to SA/RA, then OA.
			if (ma > bhsNow) {
				const overflow = ma - bhsNow;
				ma = bhsNow;
				if (age >= 55) {
					const toRa = Math.min(overflow, Math.max(0, frsAt55 - ra));
					ra += toRa;
					oa += overflow - toRa;
				} else {
					const toSa = Math.min(overflow, Math.max(0, frsNow - sa));
					sa += toSa;
					oa += overflow - toSa;
				}
			}

			if (m % 12 === 0) {
				yearly.push({ age: currentAge + m / 12, oa, sa, ra, ma, total: oa + sa + ra + ma, wage });
			}
		}
		const years = months / 12;
		return {
			yearly,
			frsCap: frsAt55,
			bhsCap: bhsAt55,
			// Final total in today's money, at 2% inflation.
			todayDollars: yearly.length ? yearly[yearly.length - 1].total / Math.pow(1.02, years) : 0,
		};
	}

	// For people who leave SA/MA blank: a rough split of their OA balance by
	// the allocation ratios for their age.
	function guessFromOa(oaBalance, age) {
		const a = band(ALLOCATION, Math.min(age, 54));
		return { sa: Math.round((oaBalance * a.middle) / a.oa), ma: Math.round((oaBalance * a.ma) / a.oa) };
	}

	return { project, guessFromOa, OW_CEILING, BHS, FRS };
});
