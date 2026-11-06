// "Is SRS worth it for me?" Uses js/shared/srsPlan.js (which uses taxRelief.js).
(function () {
	const $ = (id) => document.getElementById(id);
	const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString("en-SG")}`;
	const pct = (r) => `${Math.round(r * 1000) / 10}%`;
	const val = (id) => {
		const el = $(id);
		return !el || el.closest("[hidden]") ? "" : el.value.trim();
	};
	const headline = (label, value, sub) => `<div class="calculator-result-headline"><span>${label}</span><strong>${value}</strong>${sub ? `<em>${sub}</em>` : ""}</div>`;
	const row = (label, value) => `<div class="calculator-result-row"><span>${label}</span><strong>${value}</strong></div>`;
	const note = (html, callout) => `<p class="calculator-note${callout ? " calculator-note-callout" : ""}">${html}</p>`;

	function init() {
		const form = $("srs-form");
		const box = $("srs-result");
		const status = $("srs-status");
		if (!form || !window.SrsPlan || !window.TaxRelief) return;

		const residency = $("srs-residency");
		const syncResidency = () => {
			const foreigner = residency.value === "foreigner";
			$("srs-withdraw-field").hidden = foreigner;
			$("srs-other-field").hidden = foreigner;
			$("srs-years-field").hidden = !foreigner;
			$("srs-amount-cap").textContent = foreigner ? "up to $35,700" : "up to $15,300";
			const amount = $("srs-amount");
			amount.max = foreigner ? 35700 : 15300;
			if (amount._syncSlider) amount._syncSlider();
		};
		residency.addEventListener("change", syncResidency);
		syncResidency();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			status.textContent = "";
			status.classList.remove("error");
			const pay = Number(val("srs-pay"));
			const age = Number(val("srs-age"));
			if (!(pay > 0) || !(age >= 18)) {
				status.textContent = "Add your monthly salary and age.";
				status.classList.add("error");
				box.hidden = true;
				return;
			}
			const r = window.SrsPlan.calculate({
				monthlyPay: pay,
				bonus: val("srs-bonus"),
				age,
				residency: residency.value,
				perYear: val("srs-amount"),
				returnPercent: val("srs-return"),
				withdrawAge: val("srs-withdraw"),
				otherIncomeLater: val("srs-other"),
				yearsInSg: val("srs-years"),
			});

			if (r.saving <= 0) {
				box.innerHTML =
					headline("Tax you'd save this year", "$0", r.taxWithout <= 0 ? "You don't pay income tax at this pay, so SRS has nothing to save." : "Your reliefs already reach the $80,000 cap, so SRS can't lower your tax.") +
					note("<strong>Skip SRS for now.</strong> Your money does more in an emergency fund and ordinary investments you can reach anytime. Come back to this when your pay goes up.", true);
				box.hidden = false;
				return;
			}

			const days = window.TaxRelief.daysLeftInYear();
			const per1000 = Math.round((r.saving / r.perYear) * 1000);
			let html = headline(
				"Tax you save this year",
				money(r.saving),
				`By putting ${money(r.perYear)} into SRS by 31 Dec (${days} ${days === 1 ? "day" : "days"} left). That's ${money(per1000)} back for every $1,000.`,
			);

			const when = r.isLocal ? `at ${r.withdrawAge}` : `after ${r.years} years`;
			if (window.CalcViz) {
				html += window.CalcViz.bars(`What you'd have ${when}, at ${r.ratePercent}% a year`, [
					{ label: "Through SRS, after withdrawal tax", value: r.srsNet, strong: r.advantage > 0 },
					{ label: "Same money invested yourself", value: r.outside, strong: r.advantage <= 0 },
				]);
			}

			html += row("Your top tax rate", pct(r.marginalRate));
			html += row("Tax this year: without SRS / with SRS", `${money(r.taxWithout)} / ${money(r.taxWith)}`);
			html += row(`SRS ${when} (${money(r.perYear)} a year for ${r.years} years)`, money(r.pot));
			html += row(
				r.isLocal ? `Tax on the way out (10 yearly withdrawals of ${money(r.perWithdrawal)}, half taxed)` : "Tax on the way out (15% withheld on half, if you've left Singapore)",
				`${money(r.exitTax)} (${pct(r.exitRate)})`,
			);
			html += row(`Without SRS: investing ${money(r.perYear - r.saving)} a year yourself`, money(r.outside));
			html += row(r.advantage >= 0 ? "SRS comes out ahead by" : "Investing yourself comes out ahead by", money(Math.abs(r.advantage)));

			const notes = [];
			const lock = r.isLocal ? `you won't need this money before ${r.withdrawAge}` : `you'll keep the account for at least 10 years`;
			if (r.verdict === "strong") {
				notes.push(`<strong>Worth it, as long as ${lock}.</strong> You save ${pct(r.marginalRate)} tax going in and pay about ${pct(r.exitRate)} coming out, so SRS beats investing the same money yourself by ${money(r.advantage)}.`);
			} else if (r.verdict === "small") {
				notes.push(`<strong>Only slightly better than investing yourself</strong> (${money(r.advantage)} more over ${r.years} years), and the money is locked away. At a ${pct(r.marginalRate)} tax rate, sort out your emergency fund and flexible investing first. SRS gets much better from the 11.5% bracket.`);
			} else {
				notes.push(`<strong>Not worth it at these numbers.</strong> The tax you'd pay on the way out is more than you save going in, so invest the money yourself and keep it within reach.`);
			}
			notes.push(`<strong>Need it early?</strong> Taking this year's ${money(r.perYear)} out ${r.isLocal ? `before ${r.withdrawAge}` : "within 10 years"} means it's all taxed plus a 5% penalty: about ${money(r.earlyCost)} lost.`);
			if (r.usedDefault && r.perYear < r.cap) notes.push(`${money(r.perYear)} is the most that still lowers your tax this year. Putting in more (up to ${money(r.cap)}) saves nothing extra.`);
			if (r.capBites) notes.push("Your reliefs are close to the $80,000 a year cap, so part of the SRS top-up won't count.");
			notes.push("Don't leave it as cash: idle SRS money earns about 0.05%. Invest it (ETFs, unit trusts, Singapore Savings Bonds) or the comparison above doesn't hold.");
			notes.push(`Assumes the same pay every year, a ${r.ratePercent}% return inside and outside SRS${r.isLocal ? ", and no other income when you withdraw unless you add it in Detailed" : ""}.`);
			notes.forEach((text, i) => { html += note(text, i === 0); });

			box.innerHTML = html;
			box.hidden = false;
		});
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
