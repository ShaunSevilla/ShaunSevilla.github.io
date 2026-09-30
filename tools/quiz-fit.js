// Tunes Quiz.WEIGHTS so the simulated crowd matches TARGET shares.
const Quiz = require("../js/shared/moneyQuiz.js");
const { simulate } = require("./quiz-sim.js");
const TARGET = { monk: 6 };
const others = ["grabfood", "cpf", "crypto", "yolo", "hoarder", "ostrich"];
for (let it = 0; it < 14; it += 1) {
	const res = simulate(120000, 7 + it);
	const share = {}; res.forEach((r) => { share[r.key] = (share[r.key] || 0) + 1; });
	Object.keys(share).forEach((k) => { share[k] = 100 * share[k] / res.length; });
	const rest = 100 - (share.quiet || 0) - TARGET.monk;
	const want = { monk: TARGET.monk }; others.forEach((k) => { want[k] = rest / others.length; });
	for (const k of Object.keys(want)) Quiz.WEIGHTS[k] *= Math.pow(want[k] / Math.max(0.01, share[k] || 0.01), 0.35);
	console.log(it, Object.entries(share).sort().map(([k, v]) => `${k}:${v.toFixed(1)}`).join(" "));
}
const round = {}; Object.entries(Quiz.WEIGHTS).forEach(([k, v]) => { round[k] = Math.round(v * 100) / 100; });
console.log(JSON.stringify(round));
