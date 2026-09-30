// Tax Relief, What Can I Afford? and Insurance calculators on the Financial
// page. The maths is in js/shared/*.js, the same files the Telegram bot uses,
// so both always give the same answer.
(function () {
	function formatCurrency(value) {
		return `$${Math.round(Number(value) || 0).toLocaleString("en-SG")}`;
	}

	function percent(rate) {
		return `${Math.round(rate * 1000) / 10}%`;
	}

	function headline(label, value, sub) {
		return `<div class="calculator-result-headline"><span>${label}</span><strong>${value}</strong>${sub ? `<em>${sub}</em>` : ""}</div>`;
	}

	function resultRow(label, value) {
		return `<div class="calculator-result-row"><span>${label}</span><strong>${value}</strong></div>`;
	}

	function note(html, extraClass) {
		return `<p class="calculator-note${extraClass ? ` ${extraClass}` : ""}">${html}</p>`;
	}

	function numberValue(id) {
		const el = document.getElementById(id);
		if (!el || el.value === "") return null;
		const value = Number(el.value);
		return Number.isFinite(value) ? value : NaN;
	}

	function value(id) {
		const el = document.getElementById(id);
		return el ? el.value : "";
	}

	function setStatus(el, message) {
		el.textContent = message || "";
		el.classList.toggle("error", Boolean(message));
	}

	// ----------------------------------------------------------------- Tax
	function initTax() {
		const form = document.getElementById("tax-form");
		if (!form || !window.TaxRelief) return;
		const resultBox = document.getElementById("tax-result");
		const status = document.getElementById("tax-status");
		const motherFields = document.getElementById("tax-mother-fields");
		const motherExtra = document.getElementById("tax-mother-extra");
		const lifeField = document.getElementById("tax-life-field");

		function updateVisibility() {
			const children = numberValue("tax-children") || 0;
			motherFields.hidden = !(children > 0);
			motherExtra.hidden = motherFields.hidden || value("tax-working-mother") !== "yes";
			const cpf = window.TaxRelief.employeeCpf({
				monthlyPay: numberValue("tax-pay") || 0,
				bonus: numberValue("tax-bonus") || 0,
				age: numberValue("tax-age") || 30,
				isLocal: value("tax-residency") !== "foreigner",
			});
			lifeField.hidden = !(numberValue("tax-pay") > 0) || cpf >= 5000;
		}
		form.addEventListener("input", updateVisibility);
		form.addEventListener("change", updateVisibility);
		updateVisibility();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "");
			const monthlyPay = numberValue("tax-pay");
			const age = numberValue("tax-age");
			if (!(monthlyPay > 0) || !(age >= 16)) {
				setStatus(status, "Please enter your monthly salary and age.");
				resultBox.hidden = true;
				return;
			}
			const [withMe, elsewhere] = value("tax-parents").split("_").map(Number);
			const children = numberValue("tax-children") || 0;
			const workingMother = children > 0 && value("tax-working-mother") === "yes";
			const result = window.TaxRelief.calculate({
				monthlyPay,
				bonus: numberValue("tax-bonus") || 0,
				age,
				residency: value("tax-residency"),
				married: value("tax-marital") !== "single",
				spouseLowIncome: value("tax-marital") === "married_low",
				children,
				workingMother,
				childrenFrom2024: workingMother ? numberValue("tax-children-2024") || 0 : 0,
				grandparentCaregiver: workingMother && value("tax-grandparent") === "yes",
				parentsLivingWith: withMe,
				parentsNotLivingWith: elsewhere,
				nsman: value("tax-nsman"),
				srsSoFar: numberValue("tax-srs") || 0,
				topUpSelfSoFar: numberValue("tax-topup-self") || 0,
				topUpFamilySoFar: numberValue("tax-topup-family") || 0,
				lifePremium: lifeField.hidden ? 0 : numberValue("tax-life") || 0,
			});

			let html = headline(
				"You'll probably pay",
				formatCurrency(result.tax),
				result.tax > 0
					? `in tax, ${percent(result.effectiveRate)} of your ${formatCurrency(result.income)} income. The bill comes next year, and IRAS lets you spread it over up to 12 interest-free GIRO payments (about ${formatCurrency(result.tax / 12)}/month).`
					: `in tax on ${formatCurrency(result.income)} of income.`,
			);
			html += `<p class="calculator-note"><strong>Your reliefs: ${formatCurrency(result.totalRelief)}</strong>${result.capped ? " (capped at $80,000)" : ""}</p><ul class="calculator-note-list">`;
			result.items.forEach(function (item) {
				html += `<li>${item.label}: <strong>${formatCurrency(item.amount)}</strong>${item.auto ? " (automatic)" : ""}</li>`;
			});
			html += "</ul>";
			html += resultRow("Taxable after reliefs", `${formatCurrency(result.chargeable)} (top rate ${percent(result.marginalRate)})`);
			html += note(`Without reliefs you'd pay ${formatCurrency(result.taxWithoutReliefs)}, so they already save you <strong>${formatCurrency(result.reliefSaved)}</strong>.`);

			if (result.tax <= 0) {
				html += note("You pay no income tax. Topping up SRS or CPF won't save you anything this year.");
			} else if (result.opportunities.length) {
				const days = window.TaxRelief.daysLeftInYear(new Date());
				html += `<div class="tax-savings"><p class="calculator-note"><strong>${days} days left to save more.</strong> Top-ups must be in by 31 Dec.</p><ul class="calculator-note-list">`;
				result.opportunities.forEach(function (option) {
					html += `<li>${option.label} with ${formatCurrency(option.amount)} → save <strong>${formatCurrency(option.saving)}</strong></li>`;
				});
				html += `</ul><p class="calculator-note">Do all of it and your tax drops from ${formatCurrency(result.tax)} to <strong>${formatCurrency(result.taxAfterOpportunities)}</strong>.</p></div>`;
				const take = window.TaxRelief.srsHonestTake(result);
				if (take) {
					html += note(take, "calculator-note-callout");
				}
			} else {
				html += note("You've already used the big ones (SRS and CPF top-ups).");
			}
			html += note(result.isLocal
				? "SRS money is locked until retirement age and 50% taxable when you withdraw. CPF top-ups stay in CPF for good. No tax rebate has been announced for this year. Not personalised advice."
				: "Assumes you're a tax resident (in Singapore 183+ days this year). No tax rebate has been announced for this year. Not personalised advice.");
			resultBox.innerHTML = html;
			resultBox.hidden = false;
		});
	}

	// -------------------------------------------------------------- Afford
	function initAfford() {
		const form = document.getElementById("afford-form");
		if (!form || !window.Affordability) return;
		const resultBox = document.getElementById("afford-result");
		const status = document.getElementById("afford-status");

		function updateVisibility() {
			const wantsHome = value("afford-want") !== "car";
			form.querySelectorAll(".afford-home-fields").forEach(function (el) {
				el.hidden = !wantsHome;
			});
			document.getElementById("afford-partner-field").hidden = !wantsHome || value("afford-with") !== "partner";
			document.getElementById("afford-expenses-field").hidden = value("afford-dependants") === "yes";
			const pay = (numberValue("afford-pay") || 0) + (value("afford-with") === "partner" ? numberValue("afford-partner-pay") || 0 : 0);
			const hint = document.getElementById("afford-ehg-hint");
			if (pay > 0) {
				const amount = window.Affordability.ehgAmount(pay, value("afford-with") !== "partner");
				hint.textContent = amount > 0 ? `(about ${formatCurrency(amount)} at your income)` : "($0 at your income, the ceiling is $9,000 for couples, $4,500 for singles)";
			} else {
				hint.textContent = "(up to $120,000, household income up to $9,000)";
			}
		}

		// BTO and resale grants are either/or: ticking one side locks the other.
		const btoTick = document.getElementById("afford-ehg");
		const resaleTick = document.getElementById("afford-family-grant");
		const proximitySelect = document.getElementById("afford-proximity");
		function lockGrants() {
			const resalePicked = resaleTick.checked || proximitySelect.value !== "none";
			resaleTick.disabled = btoTick.checked;
			proximitySelect.disabled = btoTick.checked;
			btoTick.disabled = resalePicked;
			[btoTick, resaleTick, proximitySelect].forEach(function (el) {
				const row = el.closest("label");
				if (row) row.classList.toggle("is-disabled", el.disabled);
			});
		}
		[btoTick, resaleTick, proximitySelect].forEach(function (el) {
			el.addEventListener("change", lockGrants);
		});
		lockGrants();

		form.addEventListener("change", updateVisibility);
		form.addEventListener("input", updateVisibility);
		updateVisibility();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "");
			const age = numberValue("afford-age");
			const monthlyPay = numberValue("afford-pay");
			const savings = numberValue("afford-savings");
			if (!(age >= 18) || !(monthlyPay > 0) || !(savings >= 0) || savings === null) {
				setStatus(status, "Please fill in your age, salary and cash in the bank.");
				resultBox.hidden = true;
				return;
			}
			const want = value("afford-want");
			const wantsHome = want !== "car";
			const r = window.Affordability.calculate({
				want,
				age,
				monthlyPay,
				alone: !wantsHome || value("afford-with") !== "partner",
				partnerPay: numberValue("afford-partner-pay") || 0,
				savings,
				cpfOa: wantsHome ? numberValue("afford-cpf") || 0 : 0,
				hasDependants: value("afford-dependants") === "yes",
				monthlyExpenses: numberValue("afford-expenses") || 0,
				otherDebt: numberValue("afford-debt") || 0,
				// First-timers get the EHG on resale too, so the resale tick carries it.
				ehg: wantsHome && (btoTick.checked || resaleTick.checked),
				familyGrant: wantsHome && document.getElementById("afford-family-grant").checked,
				proximity: wantsHome ? value("afford-proximity") : "none",
			});

			const bufferBasis = {
				pay: "pay, since people depend on you",
				expenses: `your ${formatCurrency(r.expenses)} monthly spending`,
				estimated: `spending, estimated at ${formatCurrency(r.expenses)}/month. Enter your real spending for a sharper number`,
			}[r.bufferBasis];
			let html = note(`Kept aside first: <strong>${formatCurrency(r.buffer)}</strong> emergency buffer (6 months of ${bufferBasis}). Everything below leaves it untouched.`);

			if (r.home) {
				const summary = window.Affordability.homeSummary(r);
				html += headline(summary.headlineLabel, summary.headline, summary.sub);
				summary.rows.forEach(function (row) {
					html += resultRow(row[0], row[1]);
				});
				summary.notes.forEach(function (text) {
					html += note(text, "calculator-note-callout");
				});
			}

			if (r.car) {
				const car = r.car;
				if (car.realistic) {
					html += `<div class="afford-car">` + headline("Car: comfortable up to", formatCurrency(car.price), `All in, about ${formatCurrency(car.monthlyAllIn)}/month`);
					html += resultRow("Loan instalment", `${formatCurrency(car.instalment)}/month`);
					html += resultRow("Downpayment (30%)", formatCurrency(car.downpayment));
					html += resultRow("Stretch (car costs at 20% of pay)", formatCurrency(car.stretchPrice));
					html += `</div>`;
				} else {
					html += `<div class="afford-car">` + headline("Car", "Not comfortably yet", `To own a ${formatCurrency(car.examplePrice)} car comfortably, you'd need about ${formatCurrency(car.neededPayForExample)}/month.`);
					html += note(car.limitedBy === "savings"
						? "After your emergency buffer, there isn't enough for the 30% downpayment."
						: `Comfortable means all car costs within 15% of your pay, which is ${formatCurrency(r.income * 0.15)}/month. Running costs alone are about ${formatCurrency(car.runningCost)}.`);
					html += `</div>`;
				}
			}

			if (r.carCostsYouOfHome > 0) {
				html += note(`<strong>Buying the car first shrinks your home budget by ${formatCurrency(r.carCostsYouOfHome)}.</strong>`, "calculator-note-callout");
			}
			html += note("Comfortable means the instalment stays within 25% of your pay (CPF's own guideline) and within the bank limits: 30% of income for housing and 55% for all debts, tested at 3% (HDB loan) or 4% (bank). Bank loans are planned at 3%, since today's ~1.6% packages only last 2 to 3 years. Grant amounts are HDB's published figures; HDB confirms yours in your HFE letter. Car costs include value lost over 10 years, loan interest, insurance, road tax, petrol and parking. Estimates only, not personalised advice.");
			resultBox.innerHTML = html;
			resultBox.hidden = false;
		});
	}

	// ----------------------------------------------------------- Insurance
	// Same benchmark as the bot's Insurance Calculator (calculatorService.js).
	function initInsurance() {
		const form = document.getElementById("insurance-form");
		if (!form) return;
		const resultBox = document.getElementById("insurance-result");
		const status = document.getElementById("insurance-status");

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "");
			const monthly = numberValue("insurance-income");
			if (!(monthly > 0)) {
				setStatus(status, "Please enter your monthly income.");
				resultBox.hidden = true;
				return;
			}
			const annual = monthly * 12;
			resultBox.innerHTML =
				`<div class="insurance-alarm"><p>On ${formatCurrency(monthly)} a month, you should be insured for at least <strong>${formatCurrency(annual * 9)}</strong> in case you pass away or can never work again, and <strong>${formatCurrency(annual * 4)}</strong> for critical illness.</p><p>Most people your age have a fraction of that. Do you know your number?</p></div>` +
				headline("Suggested budget", `${formatCurrency(monthly * 0.1)}/month`, `About 10% of your income, or ${formatCurrency(annual * 0.1)} a year`) +
				resultRow("Critical illness (5x annual income)", formatCurrency(annual * 5)) +
				resultRow("Total permanent disability (10x)", formatCurrency(annual * 10)) +
				resultRow("Life / term (10x)", formatCurrency(annual * 10)) +
				note(`Baseline: critical illness around ${formatCurrency(annual * 4)}, death and disability around ${formatCurrency(annual * 9)}.`) +
				note("A simple benchmark, not personalised advice. Your real needs depend on dependants, debts, CPF, existing cover and health.");
			resultBox.hidden = false;
		});
	}

	function init() {
		initTax();
		initAfford();
		initInsurance();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
