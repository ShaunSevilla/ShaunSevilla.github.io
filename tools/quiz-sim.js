// Simulates realistic quiz-takers to estimate how common each result is.
// Model: each person has a "true" money style drawn from PRIOR (our guess at
// a young Singapore TikTok/IG audience). On each question they pick the
// answer that fits their style with probability CONSISTENCY, otherwise any
// answer at random. Seeded, so the numbers are reproducible.
const Quiz = require("../js/shared/moneyQuiz.js");

const PRIOR = { grabfood: 16, yolo: 14, ostrich: 15, cpf: 11, hoarder: 15, crypto: 12, monk: 11, quiet: 6 };
const CONSISTENCY = 0.6;

function rng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function simulate(n = 400000, seed = 42) {
	const rand = rng(seed);
	const keys = Object.keys(PRIOR);
	const total = keys.reduce((s, k) => s + PRIOR[k], 0);
	const pickType = () => {
		let r = rand() * total;
		for (const k of keys) { r -= PRIOR[k]; if (r < 0) return k; }
		return keys[keys.length - 1];
	};
	const results = [];
	for (let i = 0; i < n; i += 1) {
		const type = pickType();
		const answers = Quiz.QUESTIONS.map(([, options]) => {
			if (rand() < CONSISTENCY) {
				const best = Math.max(...options.map((o) => o[1][type] || 0));
				if (best > 0) {
					const fits = options.map((o, j) => ((o[1][type] || 0) === best ? j : -1)).filter((j) => j >= 0);
					return fits[Math.floor(rand() * fits.length)];
				}
			}
			return Math.floor(rand() * options.length);
		});
		results.push(Quiz.score(answers));
	}
	return results;
}

module.exports = { simulate, PRIOR, CONSISTENCY };

if (require.main === module) {
	const results = simulate();
	const count = {};
	results.forEach((r) => { count[r.key] = (count[r.key] || 0) + 1; });
	Object.entries(count).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(k.padEnd(9), (100 * v / results.length).toFixed(2) + "%"));
}
