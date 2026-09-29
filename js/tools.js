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

			let html = headline("Estimated tax", formatCurrency(result.tax), `${percent(result.effectiveRate)} of your ${formatCurrency(result.income)} income`);
			result.items.forEach(function (item) {
				html += resultRow(item.label, formatCurrency(item.amount));
			});
			html += resultRow("Total reliefs", formatCurrency(result.totalRelief) + (result.capped ? " (capped at $80,000)" : ""));
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
				if (result.lowTax) {
					html += note(`Honest take: your top tax rate is only ${percent(result.marginalRate)}, so locking money away saves you little. An emergency fund and investing come first. SRS starts to make sense once you're in the 7%+ bracket, and really pays off at 11.5% and up.`, "calculator-note-callout");
				} else if (result.marginalRate <= 0.07) {
					html += note("Honest take: at a 7% top rate, every $1,000 into SRS saves about $70 of tax, and the money is locked until retirement age. Worth it only once your emergency fund is sorted and you won't need that money for decades.", "calculator-note-callout");
				}
			} else {
				html += note("You've already used the big ones (SRS and CPF top-ups).");
			}
			html += note("SRS money is locked until retirement age and 50% taxable when you withdraw. CPF top-ups stay in CPF for good. No tax rebate has been announced for this year. Not personalised advice.");
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
		}
		form.addEventListener("change", updateVisibility);
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
			});

			let html = note(`Kept aside first: <strong>${formatCurrency(r.buffer)}</strong> emergency buffer (6 months of ${r.bufferBasis === "pay" ? "pay, since people depend on you" : "expenses"}). Everything below leaves it untouched.`);

			if (r.home) {
				const home = r.home;
				if (home.price > 0) {
					const loan = home.best.type === "hdb"
						? `HDB loan over ${home.best.years} years, about ${formatCurrency(home.best.monthly)}/month at 2.6%`
						: `Bank loan over ${home.best.years} years, about ${formatCurrency(home.best.monthly)}/month at today's ~1.6%`;
					html += headline("Home: comfortable up to", formatCurrency(home.price), loan);
					html += resultRow("What's holding you back", home.best.limitedBy === "savings" ? "Savings for the downpayment, not your income" : `Your income (banks cap your instalment at ${formatCurrency(home.monthlyCap)}/month)`);
					if (r.homeStretch && r.homeStretch.price > home.price) {
						html += resultRow("If you used every dollar you have", `${formatCurrency(r.homeStretch.price)} (not recommended)`);
					}
				} else {
					html += headline("Home", "Not yet", "Once your emergency buffer is set aside, there isn't enough left for the 25% downpayment.");
				}
				if (home.singleUnder35) {
					html += note("Singles can only buy an HDB flat on their own from age 35. Before that, it's with a partner or family, or private property.", "calculator-note-callout");
				}
				if (!home.hdbEligible) {
					html += note("Your income is above the HDB loan ceiling, so this uses a bank loan.");
				}
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
			html += note("Car costs include value lost over 10 years, loan interest, insurance, road tax, petrol and parking. Estimates only, not personalised advice.");
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
