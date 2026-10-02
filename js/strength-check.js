// "How strong are you?" form on the Fitness page (maths in
// js/shared/strengthStandards.js).
(function () {
	function pct(v) {
		return `${v.toFixed(1)}%`;
	}

	function init() {
		const form = document.getElementById("strength-form");
		const box = document.getElementById("strength-result");
		const status = document.getElementById("strength-status");
		if (!form || !box || !window.StrengthStandards) return;
		const val = (id) => document.getElementById(id).value;

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			status.textContent = "";
			const bodyweightKg = Number(val("strength-bw"));
			if (!(bodyweightKg >= 35 && bodyweightKg <= 200)) {
				status.textContent = "Please enter your bodyweight in kg.";
				box.hidden = true;
				return;
			}
			const input = { sex: val("strength-sex"), bodyweightKg };
			["bench", "squat", "deadlift", "pushups", "pullups"].forEach((k) => { input[k] = val(`strength-${k}`); });
			const r = window.StrengthStandards.assess(input);
			if (!r.overall && r.overall !== 0) {
				status.textContent = "Fill in at least one lift or exercise.";
				box.hidden = true;
				return;
			}
			let html = `<div class="calculator-result-headline"><span>You're stronger than about</span><strong>${pct(r.world)} of adults</strong><em>Top ${pct(r.worldTop)} of the world (estimate) · top ${pct(r.top)} of people who lift</em></div>`;
			html += `<div class="strength-rows">`;
			r.results.forEach((x) => {
				const fill = Math.max(2, Math.min(100, x.percentile));
				html += `<div class="strength-row"><div class="strength-row-head"><span>${x.label} · ${x.value} ${x.unit}</span> <strong>${x.level}</strong></div>` +
					`<div class="strength-bar"><i style="width:${fill}%"></i></div>` +
					`<p>Stronger than ${pct(x.percentile)} of lifters, about ${pct(x.world)} of adults.${x.next !== null ? ` ${x.nextLevel} at ${x.next} ${x.unit}.` : " That's Elite."}</p></div>`;
			});
			html += `</div>`;
			if (r.results.length > 1) {
				html += `<p class="calculator-note">Strongest: <strong>${r.best.label}</strong>. Most room to grow: <strong>${r.weakest.label}</strong>.</p>`;
			}
			html += `<p class="calculator-note">How this works: lift levels come from Strength Level's standards, built from millions of lifts logged by its users (Beginner beats 5% of lifters, Novice 20%, Intermediate 50%, Advanced 80%, Elite 95%), adjusted for your bodyweight. "Of the world" is an estimate: only about 23% of adults strength train twice a week (a 2024 review of 2.6 million people), and we assume everyone else sits around the Beginner-to-Novice level. It doesn't adjust for age. Just for fun, not a fitness assessment.</p>`;
			box.innerHTML = html;
			box.hidden = false;
			if (box.getBoundingClientRect().top > window.innerHeight * 0.6) box.scrollIntoView({ behavior: "smooth", block: "start" });
		});
	}

	document.addEventListener("DOMContentLoaded", init);
})();
