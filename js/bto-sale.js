// "Selling my flat: how much goes back to CPF?" Uses js/shared/btoSale.js.
(function () {
	const $ = (id) => document.getElementById(id);
	const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString("en-SG")}`;
	const val = (id) => {
		const el = $(id);
		if (!el || el.closest("[hidden]")) return "";
		return el.value.trim();
	};

	const headline = (label, value, sub) => `<div class="calculator-result-headline"><span>${label}</span><strong>${value}</strong>${sub ? `<em>${sub}</em>` : ""}</div>`;
	const row = (label, value) => `<div class="calculator-result-row"><span>${label}</span><strong>${value}</strong></div>`;
	const note = (html, callout) => `<p class="calculator-note${callout ? " calculator-note-callout" : ""}">${html}</p>`;

	function init() {
		const form = $("bto-sale-form");
		const box = $("bto-sale-result");
		const status = $("bto-sale-status");
		if (!form || !window.BtoSale) return;

		const scheme = $("bto-sale-scheme");
		const syncScheme = () => { $("bto-sale-clawback-field").hidden = scheme.value === "standard"; };
		scheme.addEventListener("change", syncScheme);
		syncScheme();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			status.textContent = "";
			status.classList.remove("error");
			const cpfUsed = val("bto-sale-cpf");
			const flatAge = val("bto-sale-age");
			if (!(Number(cpfUsed) > 0) || !(Number(flatAge) > 0)) {
				status.textContent = "Add the CPF you've used and how old the flat is.";
				status.classList.add("error");
				box.hidden = true;
				return;
			}
			const r = window.BtoSale.calculate({
				cpfUsed,
				grants: val("bto-sale-grants"),
				flatAge,
				salePrice: val("bto-sale-sell"),
				loanLeft: val("bto-sale-loan"),
				upfront: val("bto-sale-upfront"),
				interestKnown: val("bto-sale-interest"),
				scheme: scheme.value,
				clawbackPercent: scheme.value === "standard" ? "" : val("bto-sale-clawback"),
				agentPercent: val("bto-sale-agent"),
				nextFlat: $("bto-sale-next").value,
				singles: $("bto-sale-singles").checked,
			});

			const parts = [`${money(r.cpfUsed)} CPF`];
			if (r.grants) parts.push(`${money(r.grants)} grants`);
			parts.push(`${money(r.interest)} accrued interest`);
			let html = headline(
				"Goes back into your CPF when you sell",
				money(r.refund),
				`${parts.join(" + ")}. It returns to your own CPF OA for your next home. It isn't a fee.`,
			);

			if (window.CalcViz) {
				const s = r.sale;
				html += s
					? window.CalcViz.stack(`Where the ${money(s.salePrice)} goes`, [
						{ label: "Cash to you", value: s.cash },
						{ label: "Back to your CPF", value: s.cpfBack },
						{ label: "HDB loan paid off", value: s.loanLeft },
						{ label: s.clawback ? "Fees and clawback" : "Fees", value: s.fees + s.clawback },
					])
					: window.CalcViz.stack("What goes back to CPF", [
						{ label: "Your CPF", value: r.cpfUsed },
						{ label: "Grants", value: r.grants },
						{ label: "Accrued interest", value: r.interest },
					]);
			}

			html += row("Your CPF used on the flat", money(r.cpfUsed));
			if (r.grants) html += row("Housing grants used", money(r.grants));
			html += row(r.interestEstimated ? `Accrued interest after ${r.flatAge} ${r.flatAge === 1 ? "year" : "years"} (estimate, 2.5% a year)` : "Accrued interest (your figure)", money(r.interest));
			html += row("Total back to your CPF", money(r.refund));

			const s = r.sale;
			if (s) {
				html += row("Sale price", money(s.salePrice));
				if (s.loanLeft) html += row("HDB loan paid off first", money(s.loanLeft));
				html += row("Agent and legal fees", money(s.fees));
				if (s.clawback) html += row("Subsidy clawback (Plus / Prime)", money(s.clawback));
				html += row("Cash you keep", money(s.cash));
				if (s.levy) html += row("Less the resale levy for your next subsidised flat", `${money(s.cashAfterLevy)} left`);
			}

			const notes = [];
			if (!s) {
				notes.push("<strong>Add the price you'd sell at</strong> (and any loan left) to see the cash you'd keep after this goes back to CPF.");
			} else if (s.loanShortfall > 0) {
				notes.push(`<strong>The sale doesn't cover the loan.</strong> You'd need about ${money(s.loanShortfall)} in cash to clear it, and nothing goes back to your CPF.`);
			} else if (s.cpfWrittenOff > 0) {
				notes.push(`<strong>Only ${money(s.cpfBack)} can go back to CPF.</strong> Sold at market value, CPF doesn't ask you to top up the other ${money(s.cpfWrittenOff)} in cash, but that's retirement money you won't see again. No cash comes to you.`);
			} else {
				notes.push(`<strong>You keep ${money(s.cash)} in cash</strong>, and ${money(s.cpfBack)} lands back in your CPF OA, so ${money(s.cash + s.cpfBack)} of the sale is still yours.`);
			}
			if (r.beforeMop) notes.push(`You can only sell after the ${r.mop}-year Minimum Occupation Period, counted from key collection.`);
			if (r.interestEstimated) {
				notes.push(`The interest is an estimate: it assumes ${r.upfrontAssumed ? "about a third" : money(r.upfront)} of your CPF went into the downpayment at key collection and the rest into monthly instalments since. Your exact figure is in the CPF app under Home Ownership. Put it in Detailed to use it.`);
			}
			notes.forEach((text, i) => { html += note(text, i === 0); });

			box.innerHTML = html;
			box.hidden = false;
		});
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
