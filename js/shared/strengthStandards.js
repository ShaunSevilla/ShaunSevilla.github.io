// "How strong are you?" — where your lifts sit among people who lift.
// Data: Strength Level strength standards (strengthlevel.com, Oct 2026),
// built from millions of lifts logged by its users. Its levels mark the
// share of those lifters you're stronger than: Beginner 5%, Novice 20%,
// Intermediate 50%, Advanced 80%, Elite 95%. Lifts are one-rep max in kg by
// bodyweight (kg); push-ups and pull-ups are max reps by bodyweight (lb).
// Between those points we interpolate on a bell curve, so results are
// estimates.
//
// "Of the world" is a modelled estimate on top of that: only 22.8% of adults
// do muscle-strengthening exercise at least twice a week (systematic review
// of 2.6 million adults, J Exerc Sci Fit 2024). We assume the other 77.2%
// sit about one standard deviation below people who train (around the
// Beginner-to-Novice line) and blend the two groups.
(function (root, factory) {
	if (typeof module === "object" && module.exports) module.exports = factory();
	else root.StrengthStandards = factory();
})(typeof self !== "undefined" ? self : this, function () {
	const LEVELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
	const LEVEL_PCT = [5, 20, 50, 80, 95];
	const KG_TO_LB = 2.20462;

	// [bodyweight, beginner, novice, intermediate, advanced, elite]
	const DATA = {
		male: {
			bench: { unit: "kg", rows: [[50,27,41,58,78,101],[55,32,47,65,87,110],[60,37,53,72,95,119],[65,42,59,79,102,128],[70,47,64,85,110,136],[75,51,70,92,117,144],[80,56,75,98,124,151],[85,60,80,104,130,158],[90,65,85,109,137,165],[95,69,90,115,143,172],[100,73,95,120,149,179],[105,77,99,125,155,185],[110,81,104,131,160,191],[115,85,108,135,166,197],[120,89,113,140,171,203],[125,93,117,145,176,209],[130,97,121,150,181,214],[135,100,125,154,186,220],[140,104,129,158,191,225]] },
			squat: { unit: "kg", rows: [[50,36,55,78,106,137],[55,43,63,88,118,150],[60,49,71,98,129,162],[65,56,79,107,139,174],[70,62,86,116,149,185],[75,69,94,124,159,196],[80,75,101,132,168,206],[85,81,108,140,177,216],[90,87,115,148,186,226],[95,93,121,156,194,235],[100,98,128,163,203,244],[105,104,134,170,211,253],[110,109,140,177,218,261],[115,115,147,184,226,270],[120,120,152,191,233,278],[125,125,158,197,240,285],[130,130,164,203,247,293],[135,135,169,209,254,300],[140,140,175,215,261,307]] },
			deadlift: { unit: "kg", rows: [[50,46,68,96,129,164],[55,54,77,107,141,178],[60,61,86,117,153,191],[65,68,95,127,164,204],[70,75,103,137,175,216],[75,82,111,146,186,228],[80,89,119,155,196,239],[85,96,127,164,205,250],[90,102,134,172,215,260],[95,108,141,180,224,270],[100,114,148,188,232,279],[105,120,155,195,241,289],[110,126,161,203,249,298],[115,132,168,210,257,306],[120,137,174,217,265,315],[125,143,180,224,272,323],[130,148,186,231,280,331],[135,153,192,237,287,339],[140,159,198,243,294,346]] },
			pushups: { unit: "lb", rows: [[110,0,18,42,70,102],[120,2,19,42,69,99],[130,3,19,41,67,96],[140,4,20,41,66,93],[150,5,20,40,64,91],[160,5,20,40,63,88],[170,6,20,39,61,85],[180,6,20,38,60,83],[190,6,20,37,58,81],[200,6,19,37,57,78],[210,6,19,36,55,76],[220,6,19,35,54,74],[230,6,18,34,53,73],[240,6,18,34,52,71],[250,6,18,33,50,69],[260,6,17,32,49,67],[270,6,17,32,48,66],[280,6,17,31,47,64],[290,6,16,30,46,63],[300,6,16,30,45,61],[310,6,16,29,44,60]] },
			pullups: { unit: "lb", rows: [[110,0,6,14,24,34],[120,0,7,14,24,34],[130,0,7,14,23,33],[140,0,7,14,23,32],[150,0,7,14,22,31],[160,0,7,14,22,30],[170,0,7,13,21,29],[180,1,7,13,21,28],[190,1,7,13,20,28],[200,1,7,12,19,27],[210,1,7,12,19,26],[220,0,6,11,18,25],[230,0,6,11,18,24],[240,0,6,11,17,24],[250,0,6,10,16,23],[260,0,5,10,16,22],[270,0,5,10,15,21],[280,0,5,9,15,21],[290,0,5,9,14,20],[300,0,4,9,14,19],[310,0,4,9,13,19]] },
		},
		female: {
			bench: { unit: "kg", rows: [[40,10,19,33,49,68],[45,12,22,36,54,74],[50,14,25,40,58,79],[55,17,28,44,62,84],[60,19,31,47,66,88],[65,21,33,50,70,92],[70,22,36,53,74,96],[75,24,38,56,77,100],[80,26,40,59,80,104],[85,28,43,61,83,107],[90,30,45,64,86,111],[95,31,47,66,89,114],[100,33,49,69,92,117],[105,35,51,71,94,120],[110,36,53,73,97,123],[115,38,54,75,99,126],[120,39,56,77,102,128]] },
			squat: { unit: "kg", rows: [[40,19,34,53,76,102],[45,23,38,58,82,110],[50,26,42,63,88,116],[55,29,46,68,94,123],[60,32,49,72,99,129],[65,35,53,76,104,134],[70,37,56,80,109,140],[75,40,59,84,113,145],[80,42,62,88,117,149],[85,45,65,91,121,154],[90,47,68,94,125,158],[95,49,71,98,129,162],[100,52,74,101,132,166],[105,54,76,104,136,170],[110,56,79,107,139,174],[115,58,81,109,142,177],[120,60,83,112,145,181]] },
			deadlift: { unit: "kg", rows: [[40,26,43,65,92,121],[45,30,48,71,99,129],[50,34,52,76,105,136],[55,37,56,81,111,143],[60,40,60,86,116,149],[65,43,64,90,121,155],[70,46,68,95,126,160],[75,49,71,99,131,166],[80,52,74,102,135,170],[85,54,77,106,139,175],[90,57,80,109,143,180],[95,59,83,113,147,184],[100,61,86,116,151,188],[105,64,89,119,154,192],[110,66,91,122,158,196],[115,68,94,125,161,200],[120,70,96,128,164,203]] },
			pushups: { unit: "lb", rows: [[90,0,5,19,36,55],[100,0,6,19,35,53],[110,0,7,19,34,51],[120,0,7,19,33,49],[130,0,7,18,32,48],[140,0,7,18,31,46],[150,0,7,17,30,44],[160,0,7,17,29,43],[170,0,7,16,28,41],[180,0,7,16,27,40],[190,0,6,15,26,38],[200,0,6,15,25,37],[210,0,6,14,25,36],[220,0,6,14,24,34],[230,0,5,13,23,33],[240,0,5,12,22,32],[250,0,5,12,21,31],[260,0,5,11,21,30]] },
			pullups: { unit: "lb", rows: [[90,0,0,6,14,23],[100,0,0,6,13,22],[110,0,0,6,13,22],[120,0,0,6,13,21],[130,0,0,6,12,20],[140,0,0,6,12,19],[150,0,0,6,11,18],[160,0,0,5,11,17],[170,0,0,5,10,16],[180,0,0,5,10,16],[190,0,0,4,9,15],[200,0,0,4,9,14],[210,0,0,3,8,13],[220,0,0,3,8,13],[230,0,0,3,8,12],[240,0,0,2,7,11],[250,0,0,2,7,11],[260,0,0,1,6,10]] },
		},
	};

	const LIFTS = {
		bench: "Bench press",
		squat: "Squat",
		deadlift: "Deadlift",
		pushups: "Push-ups",
		pullups: "Pull-ups",
	};

	// Standard normal: z -> percentile and percentile -> z.
	function cdf(z) {
		const t = 1 / (1 + 0.2316419 * Math.abs(z));
		const d = 0.3989423 * Math.exp((-z * z) / 2);
		const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
		return z > 0 ? 1 - p : p;
	}
	const Z_AT = [-1.6449, -0.8416, 0, 0.8416, 1.6449];
	const TRAINING_SHARE = 0.228;
	const NON_TRAINER_SHIFT = 1; // SDs below people who train

	function zOf(pct) {
		const p = Math.min(0.999, Math.max(0.001, pct / 100));
		let lo = -4;
		let hi = 4;
		for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (cdf(mid) < p) lo = mid; else hi = mid; }
		return lo;
	}

	// Lifter percentile -> estimated percentile among all adults.
	function worldPercentile(lifterPct) {
		const z = zOf(lifterPct);
		const world = TRAINING_SHARE * cdf(z) + (1 - TRAINING_SHARE) * cdf(z + NON_TRAINER_SHIFT);
		return Math.min(99.9, Math.round(world * 1000) / 10);
	}

	// The five standards for this bodyweight, interpolated between rows.
	function standardsFor(sex, lift, bodyweightKg) {
		const table = DATA[sex][lift];
		const bw = table.unit === "lb" ? bodyweightKg * KG_TO_LB : bodyweightKg;
		const rows = table.rows;
		if (bw <= rows[0][0]) return rows[0].slice(1);
		if (bw >= rows[rows.length - 1][0]) return rows[rows.length - 1].slice(1);
		for (let i = 1; i < rows.length; i += 1) {
			if (bw <= rows[i][0]) {
				const f = (bw - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]);
				return rows[i].slice(1).map((v, k) => rows[i - 1][k + 1] + f * (v - rows[i - 1][k + 1]));
			}
		}
		return rows[rows.length - 1].slice(1);
	}

	// Where a result sits among lifters (0-100), on a bell curve through
	// the five standards. Capped at 0.1% and 99.9%.
	function percentile(sex, lift, bodyweightKg, value) {
		const s = standardsFor(sex, lift, bodyweightKg);
		const v = Math.max(0, Number(value) || 0);
		// Reps tables start at 0 ("can't do one yet"): everyone at 0 shares
		// the bottom of the range up to the highest level still at 0.
		if (v <= 0) {
			const zeroLevels = s.filter((x) => x <= 0).length;
			return zeroLevels ? LEVEL_PCT[zeroLevels - 1] / 2 : LEVEL_PCT[0] / 2;
		}
		let z;
		const firstPositive = s.findIndex((x) => x > 0);
		if (v <= s[firstPositive]) {
			// Below the first standard: scale down towards 0.
			const lowerZ = firstPositive > 0 ? Z_AT[firstPositive - 1] : -3.09;
			const lowerV = firstPositive > 0 ? 0 : 0;
			z = lowerZ + ((v - lowerV) / (s[firstPositive] - lowerV)) * (Z_AT[firstPositive] - lowerZ);
		} else if (v >= s[4]) {
			z = Z_AT[4] + ((v - s[4]) / (s[4] - s[3])) * (Z_AT[4] - Z_AT[3]);
		} else {
			for (let i = firstPositive + 1; i < 5; i += 1) {
				if (v <= s[i]) {
					z = Z_AT[i - 1] + ((v - s[i - 1]) / (s[i] - s[i - 1])) * (Z_AT[i] - Z_AT[i - 1]);
					break;
				}
			}
		}
		z = Math.max(-3.09, Math.min(3.09, z));
		return Math.round(cdf(z) * 1000) / 10;
	}

	function levelFor(sex, lift, bodyweightKg, value) {
		const s = standardsFor(sex, lift, bodyweightKg);
		let level = "Below beginner";
		s.forEach((x, i) => { if (value >= x && x > 0) level = LEVELS[i]; });
		const next = s.find((x) => x > value);
		return { level, next: next === undefined ? null : Math.ceil(next), nextLevel: next === undefined ? null : LEVELS[s.indexOf(next)] };
	}

	// input: { sex, bodyweightKg, bench, squat, deadlift, pushups, pullups }
	// (lifts optional; blank ones are skipped)
	function assess(input) {
		const sex = input.sex === "female" ? "female" : "male";
		const bw = Number(input.bodyweightKg);
		const results = [];
		Object.keys(LIFTS).forEach((lift) => {
			const raw = input[lift];
			if (raw === null || raw === undefined || raw === "") return;
			const value = Number(raw);
			if (!(value >= 0)) return;
			const pct = percentile(sex, lift, bw, value);
			results.push({ lift, label: LIFTS[lift], value, unit: DATA[sex][lift].unit === "kg" ? "kg" : "reps", percentile: pct, top: Math.round((100 - pct) * 10) / 10, ...levelFor(sex, lift, bw, value) });
		});
		if (!results.length) return { results, overall: null };
		// Overall: average position on the bell curve across what was entered.
		results.forEach((r) => { r.world = worldPercentile(r.percentile); });
		const zs = results.map((r) => zOf(r.percentile));
		const zAvg = zs.reduce((a, b) => a + b, 0) / zs.length;
		const overall = Math.round(cdf(zAvg) * 1000) / 10;
		const best = results.slice().sort((a, b) => b.percentile - a.percentile)[0];
		const weakest = results.slice().sort((a, b) => a.percentile - b.percentile)[0];
		const world = worldPercentile(overall);
		return { results, overall, top: Math.round((100 - overall) * 10) / 10, world, worldTop: Math.round((100 - world) * 10) / 10, best, weakest };
	}

	return { assess, percentile, worldPercentile, standardsFor, LIFTS, LEVELS, TRAINING_SHARE };
});
