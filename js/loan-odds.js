// "Will my loan be approved?" Uses js/shared/loanOdds.js.
(function () {
	const $ = (id) => document.getElementById(id);
	const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString("en-SG")}`;
	const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
	const val = (id) => {
		const el = $(id);
		return !el || el.closest("[hidden]") ? "" : el.value.trim();
	};
	const AVERAGE_SCORE = 1818; // middle of grade DD
	const ICON = { pass: "✓", tight: "!", fail: "✕" };

	function init() {
		const form = $("loan-odds-form");
		const box = $("loan-odds-result");
		const status = $("loan-odds-status");
		if (!form || !window.LoanOdds) return;
		const type = $("loan-type");

		// Only the questions that matter for this kind of loan.
		const sync = () => {
			const t = type.value;
			const home = t === "hdb" || t === "bankHdb" || t === "private";
			$("loan-with-field").hidden = t !== "hdb";
			$("loan-omv-field").hidden = t !== "car";
			$("loan-unsecured-field").hidden = t !== "personal";
			$("loan-price-field").hidden = !home && t !== "car";
			$("loan-income-label").textContent = home && t !== "private" ? "Household income before CPF ($)" : "Monthly income before CPF ($)";
			const max = window.LoanOdds.TYPES[t].maxYears;
			$("loan-years").max = max;
			$("loan-years-max").textContent = `up to ${max}`;
			$("loan-amount").placeholder = { hdb: "350000", bankHdb: "400000", private: "1000000", car: "80000", personal: "20000" }[t];
			const amount = $("loan-amount");
			if (amount._syncSlider) amount._syncSlider();
		};
		type.addEventListener("change", sync);
		sync();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			status.textContent = "";
			status.classList.remove("error");
			const amount = Number(val("loan-amount"));
			const income = Number(val("loan-income"));
			if (!(amount > 0) || !(income > 0)) {
				status.textContent = "Add how much you want to borrow and your monthly income.";
				status.classList.add("error");
				box.hidden = true;
				return;
			}
			const scoreText = val("loan-score");
			const score = scoreText ? Math.max(1000, Math.min(2000, Number(scoreText))) : AVERAGE_SCORE;
			const r = window.LoanOdds.assess({
				type: type.value,
				score,
				amount,
				income,
				otherDebt: val("loan-debt"),
				years: val("loan-years"),
				price: val("loan-price"),
				omv: val("loan-omv"),
				alone: val("loan-with") === "alone",
				unsecured: val("loan-unsecured"),
			});

			const pct = Math.round(r.odds * 100);
			const tone = r.odds >= 0.75 ? "good" : r.odds >= 0.5 ? "ok" : "low";
			let html = `<div class="calculator-result-headline"><span>Approval odds: ${r.verdict.toLowerCase()}</span><strong>About ${pct}%</strong><em>${scoreText ? `Credit grade ${r.grade} (${r.gradeWords}).` : "Score not given, so taken as an average grade (DD)."} Repayment about ${money(r.monthly)}/month over ${r.years} years${r.flat ? ` at ${(r.rate * 100).toFixed(2)}% flat` : `, tested at ${r.rate * 100}%`}.</em></div>`;
			html += `<div class="odds-meter odds-${tone}" role="img" aria-label="About ${pct}% chance of approval"><span style="width:${pct}%"></span></div>`;
			html += `<ul class="loan-why">${r.checks
				.map((c) => `<li class="is-${c.status}"><b aria-hidden="true">${ICON[c.status]}</b><div><strong>${esc(c.title)}</strong><span>${esc(c.detail)}</span></div></li>`)
				.join("")}</ul>`;
			html += `<div class="calculator-result-row"><span>Most you could borrow (passes every check)</span><strong>${money(r.maxLoan)}</strong></div>`;
			r.tips.forEach((tip, i) => {
				html += `<p class="calculator-note${i === 0 ? " calculator-note-callout" : ""}">${esc(tip)}</p>`;
			});
			html += `<p class="calculator-note">${esc(r.gradeNote)}</p>`;
			html += `<p class="calculator-note">An estimate from MAS and HDB rules and how banks usually treat each credit grade. Each lender has its own policy, and your full report (missed payments, recent applications) counts too.</p>`;
			box.innerHTML = html;
			box.hidden = false;
		});
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
