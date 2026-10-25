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
		const ptrField = document.getElementById("tax-ptr-field");
		const reliefFields = form.querySelectorAll(".tax-relief-field");

		function updateVisibility() {
			// Non-residents get no reliefs, so none of the relief questions apply.
			const nonResident = value("tax-residency") === "nonresident";
			reliefFields.forEach(function (field) {
				field.hidden = nonResident;
			});
			const children = nonResident ? 0 : numberValue("tax-children") || 0;
			motherFields.hidden = !(children > 0);
			motherExtra.hidden = motherFields.hidden || value("tax-working-mother") !== "yes";
			ptrField.hidden = !(children > 0);
			const cpf = window.TaxRelief.employeeCpf({
				monthlyPay: numberValue("tax-pay") || 0,
				bonus: numberValue("tax-bonus") || 0,
				age: numberValue("tax-age") || 30,
				residency: value("tax-residency"),
			});
			lifeField.hidden = nonResident || !(numberValue("tax-pay") > 0) || cpf >= 5000;
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
			const children = value("tax-residency") === "nonresident" ? 0 : numberValue("tax-children") || 0;
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
				parenthoodRebate: ptrField.hidden ? 0 : numberValue("tax-ptr") || 0,
			});

			if (result.isNonResident) {
				let nr = headline(
					"You'll probably pay",
					formatCurrency(result.tax),
					`in tax, ${percent(result.effectiveRate)} of your ${formatCurrency(result.income)} income.`,
				);
				nr += resultRow("How it's worked out", result.flatApplies
					? "15% flat on your whole income (higher than resident rates at your pay)"
					: "Resident rates on your whole income, with no reliefs (higher than 15% flat at your pay)");
				nr += note("Under 183 days in Singapore this year, you're a non-resident: no reliefs, and SRS or CPF top-ups don't lower your tax. Stay or work here 183+ days in the year (IRAS also counts a continuous stay across two years) and you're taxed as a resident, usually for a lot less.");
				nr += note("Working here 60 days or less in the year? That job's pay is usually tax-free (not for company directors, entertainers or professionals). Estimate only, not personalised advice.");
				resultBox.innerHTML = nr;
				resultBox.hidden = false;
				return;
			}

			let html = headline(
				"You'll probably pay",
				formatCurrency(result.tax),
				result.tax > 0
					? `in tax, ${percent(result.effectiveRate)} of your ${formatCurrency(result.income)} income. The bill comes next year, and IRAS lets you spread it over up to 12 interest-free GIRO payments (about ${formatCurrency(result.tax / 12)}/month).`
					: `in tax on ${formatCurrency(result.income)} of income.`,
			);
			if (window.CalcViz && result.taxWithoutReliefs > 0) {
				const items = [
					{ label: "No reliefs", value: result.taxWithoutReliefs },
					{ label: "Your tax", value: result.tax, strong: true },
				];
				if (result.opportunities.length && result.taxAfterOpportunities < result.tax) items.push({ label: "With top-ups", value: result.taxAfterOpportunities });
				html += window.CalcViz.bars("Your tax bill", items);
			}
			html += `<p class="calculator-note"><strong>Your reliefs: ${formatCurrency(result.totalRelief)}</strong>${result.capped ? " (capped at $80,000)" : ""}</p><ul class="calculator-note-list">`;
			result.items.forEach(function (item) {
				html += `<li>${item.label}: <strong>${formatCurrency(item.amount)}</strong>${item.auto ? " (automatic)" : ""}</li>`;
			});
			html += "</ul>";
			html += resultRow("Taxable after reliefs", `${formatCurrency(result.chargeable)} (top rate ${percent(result.marginalRate)})`);
			html += note(`Without reliefs you'd pay ${formatCurrency(result.taxWithoutReliefs)}, so they already save you <strong>${formatCurrency(result.reliefSaved)}</strong>.`);
			if (result.rebateAvailable > 0 && result.taxBeforeRebate > 0) {
				html += resultRow("Parenthood Tax Rebate used", `${formatCurrency(result.rebateUsed)} of ${formatCurrency(result.taxBeforeRebate)} tax${result.rebateLeft > 0 ? `, ${formatCurrency(result.rebateLeft)} left for next year` : ""}`);
			}
			if (result.prYear) {
				html += note(`In your ${result.prYear === 1 ? "1st" : "2nd"} year as a PR you pay less CPF, so your CPF relief is smaller than a citizen's on the same pay. Full rates start from your 3rd year.`);
			}

			if (result.rebateCoversTax) {
				html += note(`Your Parenthood Tax Rebate covers all of this year's tax${result.rebateLeft > 0 ? `, with ${formatCurrency(result.rebateLeft)} still left for later years` : ""}. Topping up SRS or CPF won't lower this year's bill; it would only leave more rebate for later.`);
			} else if (result.tax <= 0) {
				html += note("You pay no income tax. Topping up SRS or CPF won't save you anything this year.");
			} else if (result.opportunities.length) {
				const days = window.TaxRelief.daysLeftInYear(new Date());
				html += `<div class="tax-savings"><p class="calculator-note"><strong>${days} days left to save more.</strong> Top-ups must be in by 31 Dec.</p><ul class="calculator-note-list">`;
				result.opportunities.forEach(function (option) {
					html += `<li>${option.label} with ${formatCurrency(option.amount)} → save <strong>${formatCurrency(option.saving)}</strong></li>`;
				});
				html += `</ul>${result.marginalRate >= 0.07 && result.opportunities.length > 1 ? `<p class="calculator-note">Do all of it and your tax drops from ${formatCurrency(result.tax)} to <strong>${formatCurrency(result.taxAfterOpportunities)}</strong>. Each saving counts the ones above it first.</p>` : ""}</div>`;
				const take = window.TaxRelief.srsHonestTake(result);
				if (take) {
					html += note(take, "calculator-note-callout");
				}
			} else {
				html += note("You've already used the big ones (SRS and CPF top-ups).");
			}
			html += note(result.isLocal
				? "CPF top-ups stay in CPF for good. Estimate only, not personalised advice."
				: "Assumes you're a tax resident (in Singapore 183+ days this year). Estimate only, not personalised advice.");
			resultBox.innerHTML = html;
			resultBox.hidden = false;
		});
	}


	// Cash / CPF OA needed for the suggested flat (see shared/hdbPayments.js).
	function paymentRows(home, Pay) {
		if (!Pay || !home || home.price <= 0) return [];
		const plan = Pay.schedule({ price: home.price, type: home.type, loan: home.best.loan, oa: home.cpfNow, oaAtKeys: home.cpfAtKeys, grants: home.grants.total });
		return Pay.summaryRows(plan);
	}

	// How a flat gets paid for: loan, grants, CPF OA, cash (price plus stamp
	// duty and about $3,000 of fees).
	function homeFundingViz(price, loan, grants, cpfAvailable) {
		if (!window.CalcViz || !(price > 0)) return "";
		const total = price + window.Affordability.bsd(price) + 3000;
		const rest = Math.max(0, total - loan - grants);
		const cpf = Math.min(Math.max(0, cpfAvailable), rest);
		return window.CalcViz.stack(`How ${formatCurrency(price)} gets paid (with stamp duty and fees)`, [
			{ label: "Loan", value: loan },
			{ label: "CPF OA", value: cpf },
			{ label: "Grants", value: grants },
			{ label: "Cash", value: rest - cpf },
		]);
	}

	// -------------------------------------------------------------- Afford
	function initAfford() {
		const form = document.getElementById("afford-form");
		if (!form || !window.Affordability) return;
		const resultBox = document.getElementById("afford-result");
		const status = document.getElementById("afford-status");

		const planBoxes = ["home", "car", "bike"].map(function (key) { return document.getElementById("afford-plan-" + key); });
		function plan() {
			return planBoxes.filter(function (box) { return box.checked; }).map(function (box) { return box.value; });
		}
		function updateVisibility() {
			const wantsHome = plan().includes("home");
			form.closest(".calculator-card").querySelectorAll(".afford-home-fields").forEach(function (el) {
				el.hidden = !wantsHome;
			});
			form.closest(".calculator-card").querySelectorAll(".afford-car-note").forEach(function (el) {
				el.hidden = !plan().includes("car") && !plan().includes("bike");
			});
			const together = wantsHome && value("afford-with") === "partner";
			document.getElementById("afford-pay-label").textContent = together ? "Combined monthly income before CPF, both of you ($)" : "Monthly salary before CPF ($)";
			document.getElementById("afford-pay").placeholder = together ? "9500" : "5000";
			document.getElementById("afford-proximity-field").hidden = value("afford-flat") !== "resale";
			document.getElementById("afford-expenses-field").hidden = value("afford-dependants") === "yes";
			const pay = numberValue("afford-pay") || 0;
			const hint = document.getElementById("afford-ehg-hint");
			if (value("afford-first") !== "yes") {
				hint.textContent = "";
			} else if (pay > 0) {
				const amount = window.Affordability.ehgAmount(pay, !together);
				hint.textContent = amount > 0
					? `Enhanced CPF Housing Grant: about ${formatCurrency(amount)} at this income.${value("afford-flat") === "resale" ? " Resale also gets the CPF Housing Grant ($80,000 couples, $40,000 singles)." : ""}`
					: `Enhanced CPF Housing Grant: $0 at this income (it stops at $9,000 for couples, $4,500 for singles).${value("afford-flat") === "resale" ? " The CPF Housing Grant still counts if you're under HDB's income ceiling." : ""}`;
			} else {
				hint.textContent = "Enhanced CPF Housing Grant: up to $120,000, household income up to $9,000.";
			}
		}

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
			const picked = plan();
			if (!picked.length) {
				setStatus(status, "Tick at least one thing to plan for: a home, a car or a motorbike.");
				resultBox.hidden = true;
				return;
			}
			const wantsHome = picked.includes("home");
			const together = wantsHome && value("afford-with") === "partner";
			const first = value("afford-first") === "yes";
			const resale = value("afford-flat") === "resale";
			const r = window.Affordability.calculate({
				plan: picked,
				age,
				// Couples enter one combined figure, split evenly for CPF.
				monthlyPay: together ? monthlyPay / 2 : monthlyPay,
				alone: !together,
				partnerPay: together ? monthlyPay / 2 : 0,
				savings,
				cpfOa: wantsHome ? numberValue("afford-cpf") || 0 : 0,
				hasDependants: value("afford-dependants") === "yes",
				monthlyExpenses: numberValue("afford-expenses") || 0,
				otherDebt: numberValue("afford-debt") || 0,
				ehg: wantsHome && first,
				familyGrant: wantsHome && first && resale,
				proximity: wantsHome && resale ? value("afford-proximity") : "none",
				resale: wantsHome && resale,
			});

			const bufferBasis = {
				pay: "pay, since people depend on you",
				expenses: `your ${formatCurrency(r.expenses)} monthly spending`,
				estimated: `spending, estimated at ${formatCurrency(r.expenses)}/month. Enter your real spending for a sharper number`,
			}[r.bufferBasis];
			let html = note(`Kept aside first: <strong>${formatCurrency(r.buffer)}</strong> emergency buffer (6 months of ${bufferBasis}). Everything below leaves it untouched.`);

			if (r.home) {
				const summary = window.Affordability.homeSummary(r);
				summary.rows.unshift(...paymentRows(r.home, window.HdbPayments));
				html += headline(summary.headlineLabel, summary.headline, summary.sub);
				if (window.CalcViz && r.home.price > 0) {
					html += window.CalcViz.bars("Flat price", [
						{ label: "Comfortable", value: r.home.price, strong: true },
						{ label: "Stretch", value: Math.max(r.home.price, r.home.maxPrice) },
					]);
					html += homeFundingViz(r.home.price, r.home.best.loanAmount, r.home.grants.total, r.home.cpfAtKeys);
				}
				summary.rows.forEach(function (row) {
					html += resultRow(row[0], row[1]);
				});
				summary.notes.forEach(function (text) {
					html += note(text, "calculator-note-callout");
				});
			}

			if (r.car) {
				const cs = window.Affordability.carSummary(r);
				html += `<div class="afford-car">` + headline(cs.headlineLabel, cs.headline, cs.sub);
				if (window.CalcViz && r.car.realistic) {
					html += window.CalcViz.bars("Car price", r.car.tiers.flatMap(function (tier) {
						const tag = tier.key === "low" ? "OMV ≤$20k" : "OMV >$20k";
						return [{ label: `${tag}`, value: tier.price, strong: true }, { label: `${tag} stretch`, value: tier.stretchPrice }];
					}));
				}
				cs.rows.forEach(function (row) { html += resultRow(row[0], row[1]); });
				cs.notes.forEach(function (text) { html += note(text); });
				html += `</div>`;
			}

			if (r.bike) {
				const bs = window.Affordability.bikeSummary(r);
				html += `<div class="afford-car">` + headline(bs.headlineLabel, bs.headline, bs.sub);
				if (window.CalcViz && r.bike.realistic) {
					html += window.CalcViz.bars("Bike price", [
						{ label: "Comfortable", value: r.bike.price, strong: true },
						{ label: "Stretch", value: r.bike.stretchPrice },
					]);
				}
				bs.rows.forEach(function (row) { html += resultRow(row[0], row[1]); });
				bs.notes.forEach(function (text) { html += note(text); });
				html += `</div>`;
			}

			if (r.vehiclesTogether) {
				html += note(`<strong>Car and bike together: about ${formatCurrency(r.vehiclesTogether.monthly)}/month in instalments, ${Math.round(r.vehiclesTogether.share * 100)}% of your take-home pay.</strong> Each is worked out on its own above, so the downpayments come from the same savings.`, "calculator-note-callout");
			}

			if (r.vehicleCostsYouOfHome > 0) {
				html += note(`<strong>Buying the ${r.vehicleWords} first shrinks your home budget by ${formatCurrency(r.vehicleCostsYouOfHome)}.</strong>`, "calculator-note-callout");
			}
			html += note(window.Affordability.footnote(r));
			resultBox.innerHTML = html;
			resultBox.hidden = false;
		});
	}

	// ------------------------------------------- How much do I need to earn
	function initEarn() {
		const form = document.getElementById("earn-form");
		if (!form || !window.Affordability || !window.Affordability.need) return;
		const resultBox = document.getElementById("earn-result");
		const status = document.getElementById("earn-status");

		function updateVisibility() {
			const item = value("earn-item");
			const home = item === "bto" || item === "resale";
			form.querySelectorAll(".earn-home-field").forEach(function (el) { el.hidden = !home; });
			form.querySelectorAll(".earn-car-field").forEach(function (el) { el.hidden = item !== "car"; });
			document.getElementById("earn-proximity-field").hidden = item !== "resale";
			document.getElementById("earn-expenses-field").hidden = value("earn-dependants") === "yes";
			document.getElementById("earn-price").placeholder = { bto: "450000", resale: "600000", car: "120000", bike: "20000" }[item];
		}
		form.addEventListener("change", updateVisibility);
		updateVisibility();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "");
			const item = value("earn-item");
			const home = item === "bto" || item === "resale";
			const price = numberValue("earn-price");
			const savings = numberValue("earn-savings");
			const age = numberValue("earn-age");
			if (!(price > 0) || savings === null || !(savings >= 0) || (home && !(age >= 18))) {
				setStatus(status, home ? "Please fill in the price, your age and cash in the bank." : "Please fill in the price and cash in the bank.");
				resultBox.hidden = true;
				return;
			}
			const n = window.Affordability.need({
				item,
				price,
				age,
				alone: value("earn-with") !== "partner",
				savings,
				cpfOa: home ? numberValue("earn-cpf") || 0 : 0,
				firstTimer: value("earn-first") === "yes",
				proximity: value("earn-proximity"),
				hasDependants: value("earn-dependants") === "yes",
				monthlyExpenses: numberValue("earn-expenses") || 0,
				otherDebt: numberValue("earn-debt") || 0,
				omv: value("earn-omv"),
			});
			const s = window.Affordability.needSummary(n);
			let html = headline(s.headlineLabel, s.headline, s.sub);
			if (window.CalcViz && n.kind === "home" && n.found) {
				html += window.CalcViz.bars("Monthly pay needed", [
					{ label: "Comfortable", value: n.income, strong: true },
					...(n.stretchIncome && n.stretchIncome < n.income ? [{ label: "Stretch", value: n.stretchIncome }] : []),
				]);
				html += homeFundingViz(n.price, n.loanAmount, n.grants.total, n.cpfAtKeys || 0);
			} else if (window.CalcViz && n.kind !== "home") {
				html += window.CalcViz.bars("Monthly pay needed", n.tiers.flatMap(function (t) {
					const tag = n.tiers.length > 1 ? (t.key === "low" ? "OMV ≤$20k" : "OMV >$20k") : "";
					return [{ label: tag || "Comfortable", value: t.income, strong: true }, { label: tag ? `${tag} stretch` : "Stretch", value: t.stretchIncome }];
				}));
			}
			if (s.stretch && !window.CalcViz) html += `<div class="earn-stretch">${headline(s.stretchLabel, s.stretch, s.stretchSub)}</div>`;
			s.rows.forEach(function (row) { html += resultRow(row[0], row[1]); });
			s.notes.forEach(function (text, index) { html += note(text, index === 0 ? "calculator-note-callout" : ""); });
			html += note("Comfortable means the emergency buffer (6 months of spending, or of pay if people depend on you) stays untouched. Estimates only, not personalised advice.");
			resultBox.innerHTML = html;
			resultBox.hidden = false;
		});
	}

	// "What if it happens?" under the insurance result: drag a hospital bill,
	// a critical illness payout or a death/disability payout and see what it
	// means in dollars and months, live. Hospital rules live in shared/insurance.js.
	function insuranceScenarios(r) {
		const I = window.Insurance;
		if (!I || !I.hospitalShare) return "";
		const ciStart = r.existingCi !== null ? r.existingCi : r.ci;
		const lifeStart = r.existingDeathTpd !== null ? r.existingDeathTpd : r.deathTpd;
		const ciMax = Math.max(r.ci * 2, ciStart, 100000);
		const lifeMax = Math.max(r.deathTpd * 2, lifeStart, 200000);
		const step = (max) => (max > 1000000 ? 10000 : 5000);
		return `
		<div class="ins-sim" data-monthly="${r.monthlyIncome}" data-foreigner="${r.foreigner ? "1" : ""}">
			<h4 class="ins-sim-title">What if it happens?</h4>
			<p class="ins-sim-lead">Drag the numbers. See what your cover actually does.</p>
			<div class="ins-tabs" role="tablist">
				<button type="button" role="tab" class="is-on" data-tab="hosp">🏥 Hospital</button>
				<button type="button" role="tab" data-tab="ci">🎗️ Illness</button>
				<button type="button" role="tab" data-tab="life">🕊️ Death &amp; TPD</button>
			</div>

			<div class="ins-pane" data-pane="hosp">
				${r.foreigner ? `
				<label class="ins-slider"><span>Your health insurance covers up to</span><select data-k="limit"><option value="0">Nothing, I don't have any</option><option value="60000" selected>$60,000 a year (S Pass / Work Permit minimum)</option><option value="150000">$150,000 a year</option><option value="500000">$500,000 a year</option></select></label>` : `
				<div class="ins-row">
					<label><span>Ward</span><select data-k="ward"><option value="private">Private / A</option><option value="b1">B1</option><option value="b2">B2</option><option value="c">C</option></select></label>
					<label><span>Your hospital cover</span><select data-k="cover"><option value="none">Shield plan, no rider</option><option value="old">Shield + rider before Apr 2026</option><option value="new">Shield + rider from Apr 2026</option></select></label>
				</div>`}
				<label class="ins-slider"><span>Hospital bill <strong data-o="bill"></strong></span><input type="range" data-k="bill" min="2000" max="150000" step="1000" value="20000" /></label>
				<div class="ins-out"><span>You pay</span><strong data-o="you"></strong><em data-o="youSub"></em></div>
				<div class="ins-bar" aria-hidden="true"><i class="ins-bar-you" data-o="barYou"></i><i class="ins-bar-ins" data-o="barIns"></i></div>
				<div class="ins-legend"><span><i class="ins-dot-you"></i>You</span><span><i class="ins-dot-ins"></i>Insurer</span></div>
				<p class="ins-compare" data-o="compare"></p>
				<p class="calculator-note">${r.foreigner
					? "As a foreigner you pay full, non-subsidised hospital rates and aren't covered by MediShield Life, so your plan's yearly limit is what matters. Check yours: Employment Pass holders aren't required to have any, and many plans also have a deductible or co-pay."
					: "Assumes the whole bill is claimable, within your plan's limits, and done by a panel or pre-approved doctor. MediSave can pay part of your share, within its limits."}</p>
			</div>

			<div class="ins-pane" data-pane="ci" hidden>
				<label class="ins-slider"><span>Critical illness payout <strong data-o="ciAmt"></strong></span><input type="range" data-k="ci" min="0" max="${ciMax}" step="${step(ciMax)}" value="${ciStart}" /></label>
				<div class="ins-out"><span>Time off you can afford</span><strong data-o="ciRun"></strong><em>Your pay replaced while you get treated and recover, without touching savings.</em></div>
				<div class="ins-meter" aria-hidden="true"><i data-o="ciFill"></i><b style="left:50%"></b></div>
				<div class="ins-legend"><span>0</span><span>Benchmark: 5 years</span><span>10 years</span></div>
				<p class="ins-compare" data-o="ciNote"></p>
			</div>

			<div class="ins-pane" data-pane="life" hidden>
				<label class="ins-slider"><span>Death &amp; TPD payout <strong data-o="lifeAmt"></strong></span><input type="range" data-k="life" min="0" max="${lifeMax}" step="${step(lifeMax)}" value="${lifeStart}" /></label>
				<div class="ins-out"><span>Your family gets</span><strong data-o="lifeRun"></strong><em>Of your income, if you pass away or can never work again.</em></div>
				<div class="ins-meter" aria-hidden="true"><i data-o="lifeFill"></i><b style="left:50%"></b></div>
				<div class="ins-legend"><span>0</span><span>Benchmark: 10 years</span><span>20 years</span></div>
				<p class="ins-compare" data-o="lifeNote"></p>
			</div>

			<div class="ins-ask">
				<h5>5 questions worth asking about your policies</h5>
				<ol>
					<li>${r.foreigner ? "What's my health insurance's yearly limit, and does it still cover me if I change jobs?" : "Is my hospital rider on the old rules or the new April 2026 ones?"}</li>
					<li>Does my critical illness cover pay at an early stage, or only when it's severe?</li>
					<li>Does any of my cover stop or drop at 65 or 70?</li>
					<li>Are my premiums guaranteed, or can they go up?</li>
					<li>Is anything excluded because of my health history?</li>
				</ol>
				<p>Not sure of the answers? Bring your policies to a chat and I'll go through them with you.</p>
			</div>
		</div>`;
	}

	function bindInsuranceScenarios(box) {
		const sim = box.querySelector(".ins-sim");
		if (!sim) return;
		const I = window.Insurance;
		const monthly = Number(sim.dataset.monthly) || 0;
		const k = (name) => sim.querySelector(`[data-k="${name}"]`);
		const o = (name) => sim.querySelector(`[data-o="${name}"]`);
		const years = (months) => {
			if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
			const y = Math.floor(months / 12);
			const m = months % 12;
			return `${y} year${y === 1 ? "" : "s"}${m ? `, ${m} month${m === 1 ? "" : "s"}` : ""}`;
		};
		const pct = (part, whole) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;

		const foreigner = sim.dataset.foreigner === "1";

		function update() {
			const bill = Number(k("bill").value);
			o("bill").textContent = formatCurrency(bill);
			let h;
			if (foreigner) {
				h = I.foreignerShare({ bill, limit: Number(k("limit").value) });
				o("youSub").textContent = `Insurer pays ${formatCurrency(h.insurer)}.${h.you > 0 && h.limit > 0 ? " Everything above your plan's limit is yours." : ""}`;
				const all = [0, 60000, 150000].map((limit) => I.foreignerShare({ bill, limit }).you);
				o("compare").innerHTML = `Same bill: no insurance <strong>${formatCurrency(all[0])}</strong> · $60k plan <strong>${formatCurrency(all[1])}</strong> · $150k plan <strong>${formatCurrency(all[2])}</strong>`;
			} else {
				const ward = k("ward").value;
				h = I.hospitalShare({ bill, ward, cover: k("cover").value });
				o("youSub").textContent = `Insurer pays ${formatCurrency(h.insurer)}. ` + h.parts.map((p) => `${p[0]}: ${formatCurrency(p[1])}`).join(" · ");
				const all = ["none", "old", "new"].map((cover) => I.hospitalShare({ bill, ward, cover }).you);
				o("compare").innerHTML = `Same bill: no rider <strong>${formatCurrency(all[0])}</strong> · old rider <strong>${formatCurrency(all[1])}</strong> · new rider <strong>${formatCurrency(all[2])}</strong>`;
			}
			o("you").textContent = formatCurrency(h.you);
			o("barYou").style.width = pct(h.you, bill);
			o("barIns").style.width = pct(h.insurer, bill);

			const ci = Number(k("ci").value);
			const ciMonths = I.runwayMonths(ci, monthly);
			o("ciAmt").textContent = formatCurrency(ci);
			o("ciRun").textContent = ci > 0 ? years(ciMonths) : "None";
			o("ciFill").style.width = pct(ciMonths, 120);
			o("ciNote").textContent = ci <= 0
				? "With no payout, treatment and time off come out of savings, or someone else's pocket."
				: ciMonths >= 60 ? "At or above the benchmark: room to recover properly." : `${years(60 - ciMonths)} short of the 5-year benchmark.`;

			const life = Number(k("life").value);
			const lifeMonths = I.runwayMonths(life, monthly);
			o("lifeAmt").textContent = formatCurrency(life);
			o("lifeRun").textContent = life > 0 ? years(lifeMonths) : "Nothing";
			o("lifeFill").style.width = pct(lifeMonths, 240);
			o("lifeNote").textContent = life <= 0
				? (foreigner ? "Count any cover from work, and policies back home that still pay out while you live here." : "Count CPF's Dependants' Protection Scheme (up to $70,000 until 65) and any cover from work.")
				: lifeMonths >= 120 ? "At or above the benchmark: debts cleared and time for your family to adjust." : `${years(120 - lifeMonths)} short of the 10-year benchmark.`;
		}

		sim.querySelectorAll("[data-tab]").forEach(function (tab) {
			tab.addEventListener("click", function () {
				sim.querySelectorAll("[data-tab]").forEach((t) => t.classList.toggle("is-on", t === tab));
				sim.querySelectorAll("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
			});
		});
		sim.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("input", update));
		update();
	}

	// ----------------------------------------------------------- Insurance
	// Same benchmark as the bot's Insurance Calculator (calculatorService.js).
	// Quick: income only, two answers. Detailed: existing cover, the gap and
	// the "What if it happens?" scenarios.
	function initInsurance() {
		const form = document.getElementById("insurance-form");
		if (!form) return;
		const card = form.closest(".calculator-card");
		const resultBox = document.getElementById("insurance-result");
		const status = document.getElementById("insurance-status");
		const modeNote = document.getElementById("insurance-mode-note");
		const NOTES = {
			quick: "Two answers in 10 seconds: how much cover you need, and what it should cost.",
			detailed: "Add what you already have to see your gap, then see what your cover actually does in a hospital stay, a critical illness or worse.",
		};

		function setMode(mode, rerun) {
			form.dataset.mode = mode;
			card.querySelectorAll(".calc-mode button").forEach(function (btn) {
				const on = btn.dataset.mode === mode;
				btn.classList.toggle("is-on", on);
				btn.setAttribute("aria-pressed", on ? "true" : "false");
			});
			form.querySelectorAll(".ins-detail-only").forEach(function (el) { el.hidden = mode !== "detailed"; });
			modeNote.textContent = NOTES[mode];
			if (rerun && !resultBox.hidden) form.requestSubmit();
		}
		card.querySelectorAll(".calc-mode button").forEach(function (btn) {
			btn.addEventListener("click", function () { setMode(btn.dataset.mode, true); });
		});
		setMode("quick", false);

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "");
			const monthly = numberValue("insurance-income");
			if (!(monthly > 0)) {
				setStatus(status, "Please enter your monthly income.");
				resultBox.hidden = true;
				return;
			}
			const detailed = form.dataset.mode === "detailed";
			const foreigner = value("insurance-residency") === "foreigner";
			const raw = (id) => (detailed ? document.getElementById(id).value : "");
			const r = window.Insurance.calculate({ monthlyIncome: monthly, existingDeathTpd: raw("insurance-have-life"), existingCi: raw("insurance-have-ci"), foreigner });
			let html;
			if (!detailed) {
				html = `<div class="ins-quick">
					<div><span>Life &amp; disability cover</span><strong>${formatCurrency(r.deathTpd)}</strong><em>10 years of your income</em></div>
					<div><span>Critical illness cover</span><strong>${formatCurrency(r.ci)}</strong><em>5 years to recover</em></div>
					<div><span>Keep premiums under</span><strong>${formatCurrency(r.premiumCeiling)}<small>/month</small></strong><em>10% of your income</em></div>
				</div>`;
				html += note(`Already have some cover? <button type="button" class="ins-to-detailed">Switch to Detailed</button> to see your gap and what your cover does in a hospital stay.`, "calculator-note-callout");
				html += note(`A starting point, not personalised advice: 10x and 5x your yearly income, a little above the industry's 9x and 4x guide.${foreigner ? " Foreigners: cover from home may not pay out while you live here, so check." : ""}`);
			} else {
				const sum = window.Insurance.summary(r);
				html = `<div class="insurance-alarm"><p>${sum.lead.replace(formatCurrency(r.deathTpd), `<strong>${formatCurrency(r.deathTpd)}</strong>`).replace(formatCurrency(r.ci) + " for", `<strong>${formatCurrency(r.ci)}</strong> for`)}</p></div>`;
				sum.rows.forEach(function (row) { html += resultRow(row[0], row[1]); });
				sum.notes.forEach(function (text, index) { html += note(text, index === 0 && !sum.askedAboutCover ? "calculator-note-callout" : ""); });
				html += insuranceScenarios(r);
			}
			resultBox.innerHTML = html;
			const toDetailed = resultBox.querySelector(".ins-to-detailed");
			if (toDetailed) toDetailed.addEventListener("click", function () { setMode("detailed", true); });
			bindInsuranceScenarios(resultBox);
			resultBox.hidden = false;
		});
	}

	function init() {
		initTax();
		initAfford();
		initEarn();
		initInsurance();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
