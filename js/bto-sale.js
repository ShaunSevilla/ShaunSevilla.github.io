// "Selling my flat: what do I get back?" Uses js/shared/btoSale.js for the maths.
(function () {
	const $ = (id) => document.getElementById(id);
	const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString("en-SG")}`;
	const raw = (id) => ($(id) && !$(id).closest(".calc-detail[hidden], [hidden]") ? $(id).value.trim() : "");
	const num = (id) => (raw(id) === "" ? "" : Number(raw(id)));

	function headline(label, value, sub) {
		return `<div class="calculator-result-headline"><span>${label}</span><strong>${value}</strong>${sub ? `<em>${sub}</em>` : ""}</div>`;
	}
	function row(label, value) {
		return `<div class="calculator-result-row"><span>${label}</span><strong>${value}</strong></div>`;
	}
	function note(html, extra) {
		return `<p class="calculator-note${extra ? ` ${extra}` : ""}">${html}</p>`;
	}

	function init() {
		const form = $("bto-sale-form");
		const box = $("bto-sale-result");
		const status = $("bto-sale-status");
		if (!form || !window.BtoSale) return;

		const scheme = $("bto-sale-scheme");
		const clawField = $("bto-sale-clawback-field");
		const syncScheme = () => { if (clawField) clawField.hidden = scheme.value === "standard"; };
		scheme.addEventListener("change", syncScheme);
		syncScheme();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			status.textContent = "";
			status.classList.remove("error");
			const price = num("bto-sale-price");
			const salePrice = num("bto-sale-sell");
			const years = num("bto-sale-years");
			if (!(price > 0) || !(salePrice > 0) || !(years > 0)) {
				status.textContent = "Add the price you paid, the price you'd sell at and how many years you'll live there.";
				status.classList.add("error");
				box.hidden = true;
				return;
			}
			const share = num("bto-sale-share");
			const r = window.BtoSale.calculate({
				price,
				salePrice,
				yearsLived: years,
				grants: num("bto-sale-grants") || 0,
				scheme: scheme.value,
				clawbackPercent: scheme.value === "standard" ? 0 : num("bto-sale-clawback") || 0,
				cpfUpfront: num("bto-sale-cpf-upfront"),
				loan: num("bto-sale-loan"),
				cpfShare: share === "" ? "" : share / 100,
				waitYears: num("bto-sale-wait"),
				agentPercent: num("bto-sale-agent"),
				nextFlat: $("bto-sale-next").value,
				singles: $("bto-sale-singles").checked,
			});

			let html = headline(
				"Cash in your hand after the sale",
				money(r.cash),
				r.cpfBack > 0 ? `Plus ${money(r.cpfBack)} goes back into your own CPF OA, ready for your next home.` : "",
			);
			if (window.CalcViz) {
				html += window.CalcViz.stack(`Where the ${money(r.salePrice)} goes`, [
					{ label: "Cash to you", value: r.cash },
					{ label: "Back to your CPF", value: r.cpfBack },
					{ label: "Loan paid off", value: r.loanLeft },
					{ label: r.clawback > 0 ? "Fees and clawback" : "Fees", value: r.agentFee + r.legalFees + r.clawback },
				]);
			}
			html += row("HDB loan still owed, paid off first", money(r.loanLeft));
			html += row("Your CPF used, refunded to your OA", money(r.cpfUpfront + r.instalmentsFromCpf));
			if (r.grants > 0) html += row("Grants, refunded to your OA", money(r.grants));
			html += row(`Accrued interest (2.5% a year), refunded to your OA`, money(r.interest));
			html += row(`Agent fee and legal fees`, money(r.agentFee + r.legalFees));
			if (r.clawback > 0) html += row("Subsidy clawback (Plus / Prime)", money(r.clawback));
			if (r.levy > 0) {
				html += row("Resale levy for your next subsidised flat", money(r.levy));
				html += row("Cash left after the levy", money(r.cashAfterLevy));
			}

			const notes = [];
			if (r.loanShortfall > 0) {
				notes.push(`<strong>The sale doesn't cover the loan.</strong> You'd need about ${money(r.loanShortfall)} in cash to clear it, and nothing comes back to your CPF.`);
			} else if (r.cpfWrittenOff > 0) {
				notes.push(`<strong>Not all of your CPF comes back.</strong> After the loan and fees, ${money(r.cpfBack)} returns to your OA. Because it's sold at market value, CPF doesn't ask you to top up the other ${money(r.cpfWrittenOff)} in cash, but that's retirement money you won't see again.`);
			} else {
				notes.push(`<strong>The ${money(r.interest)} of accrued interest isn't a fee.</strong> It's what your CPF would have earned had it stayed in the OA, and it goes back into your own account. It just isn't cash in hand.`);
			}
			if (r.beforeMop) notes.push(`You can only sell after the ${r.mop}-year Minimum Occupation Period, counted from key collection.`);
			notes.push(`Assumes an HDB loan at ${(window.BtoSale.HDB_RATE * 100).toFixed(1)}% over 25 years, the 25% downpayment and stamp duty paid from CPF, and every instalment from CPF${r.waitYears ? `, with the 10% signing payment made ${r.waitYears} years before key collection` : ""}. Change any of it in Detailed.`);
			notes.push("CPF works out the exact refund when you sell. Check yours anytime in the CPF app under Home Ownership.");
			notes.forEach((text, i) => { html += note(text, i === 0 ? "calculator-note-callout" : ""); });

			box.innerHTML = html;
			box.hidden = false;
		});
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
