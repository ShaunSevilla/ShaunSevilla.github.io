(function () {
	// Keep these in sync with the ProsperityPath bot's loanCalculatorService.js.
	//
	// HDB concessionary loan: pegged 0.1% above the CPF Ordinary Account rate
	// (2.5% p.a. as of Q4 2026, per CPF Board), so 2.6% p.a. LTV limit for both
	// HDB and bank loans on HDB flats has been 75% since the 20 Aug 2024
	// cooling measures (25% minimum downpayment).
	// Sources: cpf.gov.sg, hdb.gov.sg, moneysense.gov.sg.
	const HDB_LOAN_ANNUAL_RATE = 0.026;
	const HDB_LOAN_LTV = 0.75;
	const HDB_LOAN_MAX_YEARS = 25;

	// Bank loan on an HDB flat: same 75% LTV, but at least 5% of the price
	// in cash (the other 20% can be CPF or cash), tenure up to 30 years.
	// Blank rate = 1.6% p.a., where 2-year fixed and SORA-floating HDB
	// packages cluster in Sep 2026 (propertynet.sg, misslobang.com). Keep in
	// sync with the bot's calculatorConstants.js.
	const BANK_HOME_LOAN_TYPICAL_RATE = 1.6;
	const BANK_HOME_LOAN_MIN_CASH_RATE = 0.05;
	const BANK_HOME_LOAN_MAX_YEARS = 30;

	// Motor vehicle loans: MAS caps the loan at 70% of purchase price when
	// OMV is $20,000 or below, and 60% when OMV is above $20,000, with a
	// maximum tenure of 7 years.
	// Source: mas.gov.sg/regulation/explainers/motor-vehicle-loans.
	// Vehicle loan rules and maths live in js/shared/vehicleLoan.js.

	// Buyer's Stamp Duty (BSD), residential, effective 15 Feb 2023 — payable
	// via CPF OA or cash. Source: iras.gov.sg.
	const BSD_RESIDENTIAL_TIERS = [
		{ upTo: 180000, rate: 0.01 },
		{ upTo: 360000, rate: 0.02 },
		{ upTo: 1000000, rate: 0.03 },
		{ upTo: 1500000, rate: 0.04 },
		{ upTo: 3000000, rate: 0.05 },
		{ upTo: Infinity, rate: 0.06 },
	];

	function computeBsd(price) {
		let remaining = price;
		let lowerBound = 0;
		let duty = 0;
		for (const tier of BSD_RESIDENTIAL_TIERS) {
			const bandSize = tier.upTo - lowerBound;
			const amountInBand = Math.min(remaining, bandSize);
			if (amountInBand <= 0) break;
			duty += amountInBand * tier.rate;
			remaining -= amountInBand;
			lowerBound = tier.upTo;
			if (remaining <= 0) break;
		}
		return Math.floor(duty);
	}

	function formatCurrency(value) {
		return `$${Math.round(Number(value) || 0).toLocaleString("en-SG")}`;
	}

	function amortisedMonthlyPayment(loanAmount, annualRate, years) {
		const monthlyRate = annualRate / 12;
		const months = years * 12;
		if (monthlyRate === 0) {
			return loanAmount / months;
		}
		const factor = Math.pow(1 + monthlyRate, months);
		return (loanAmount * monthlyRate * factor) / (factor - 1);
	}

	function signedDifference(amount) {
		const rounded = Math.round(amount);
		if (rounded === 0) return "about the same as HDB";
		return `${formatCurrency(Math.abs(rounded))} ${rounded < 0 ? "less" : "more"} than HDB`;
	}

	function buildBankComparison(hdb, bank) {
		// Compare the rounded figures people actually see.
		const monthlyDiff = Math.round(bank.monthlyPayment) - Math.round(hdb.monthlyPayment);
		const interestDiff = Math.round(bank.totalInterest) - Math.round(hdb.totalInterest);
		const cashDiff = Math.round(bank.cash) - Math.round(hdb.cash);
		let html = `<div class="bank-compare">`;
		html += `<p class="calculator-note bank-compare-title"><strong>Same flat with a bank loan</strong><br>${bank.years} years at ${bank.ratePercent}% p.a.${bank.rateIsTypical ? " (typical bank rate today)" : ""}</p>`;
		html += resultRow("Bank monthly payment", `${formatCurrency(bank.monthlyPayment)} (${signedDifference(monthlyDiff)})`);
		html += resultRow("Bank interest paid", `${formatCurrency(bank.totalInterest)} (${signedDifference(interestDiff)})`);
		html += resultRow("Cash you'd need", `${formatCurrency(bank.cash)}${cashDiff > 0 ? ` (${formatCurrency(cashDiff)} more: banks need 5% of the price in cash)` : ""}`);
		html += `<ul class="calculator-note-list">`;
		html += `<li><strong>HDB loan:</strong> 2.6%, pegged to the CPF rate so it rarely moves. The whole 25% can come from CPF, no early repayment penalty, but only if your household earns up to $16,000 a month ($8,000 for singles).</li>`;
		html += `<li><strong>Bank loan:</strong> ${bank.ratePercent < 2.6 ? "cheaper at this rate" : "no cheaper at this rate"}, and up to 25 years for the full 75% loan (MAS cuts it to 55% beyond that), but the rate is only fixed for 2 to 3 years, then it floats. If bank rates average above 2.6% over your loan, HDB ends up cheaper. Once you leave the HDB loan you can't switch back.</li>`;
		html += `</ul></div>`;
		return html;
	}


	// Loan offsetting: how much to invest so the investment's RETURNS alone
	// (not the money put in) add up to the loan's total interest by the end
	// of the loan, at 4% and 6% a year. Keep in sync with the bot's
	// loanCalculatorService.js (calculateLoanOffsetting).
	const LOAN_OFFSET_RATES = [0.04, 0.06];

	function calculateLoanOffsetting(totalInterest, years) {
		const months = Math.round(years * 12);
		return LOAN_OFFSET_RATES.map(function (annualRate) {
			const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
			const growthFactor = (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
			return {
				ratePercent: annualRate * 100,
				monthly: Math.ceil(totalInterest / (growthFactor - months)),
				lumpSum: Math.ceil(totalInterest / (Math.pow(1 + annualRate, years) - 1)),
			};
		});
	}

	// A "Loan offsetting" button under a loan result that reveals the panel.
	// loans: [{ label, totalInterest }] sharing one tenure (HDB vs bank).
	function buildLoanOffsettingBlock(rawTotalInterest, years, loanLabel, loans) {
		// Same rounded figures the result shows (and the bot uses).
		const list = (loans || [{ label: loanLabel, totalInterest: rawTotalInterest }])
			.map(function (loan) { return { label: loan.label, totalInterest: Math.round(loan.totalInterest) }; })
			.filter(function (loan) { return loan.totalInterest > 0; });
		if (!list.length) return "";
		const multi = list.length > 1;
		const scenarios = LOAN_OFFSET_RATES.map(function (rate, index) {
			const lines = list.map(function (loan) {
				const s = calculateLoanOffsetting(loan.totalInterest, years)[index];
				return `<strong>${multi ? `<span class="offset-loan">${loan.label}</span>` : ""}${formatCurrency(s.monthly)}<small>/month</small></strong><em>or ${formatCurrency(s.lumpSum)} once, today</em>`;
			}).join("");
			return `<div class="offset-scenario"><span>At ${rate * 100}% a year</span>${lines}</div>`;
		}).join("");
		const intro = multi
			? `Interest over ${years} years: ${list.map(function (loan) { return `${loan.label} <strong>${formatCurrency(loan.totalInterest)}</strong>`; }).join(", ")}.`
			: `Your ${list[0].label} costs <strong>${formatCurrency(list[0].totalInterest)}</strong> in interest over ${years} years.`;
		return (
			`<div class="loan-offset">` +
			`<button type="button" class="bot-cta-link loan-offset-toggle" aria-expanded="false">Loan offsetting <i class="fas fa-lightbulb" aria-hidden="true"></i></button>` +
			`<div class="loan-offset-panel" hidden>` +
			`<p class="calculator-note">${intro} To have your investment returns cover all of it, invest either:</p>` +
			`<div class="offset-scenarios">${scenarios}</div>` +
			`<p class="calculator-note">Only the returns count toward the interest. The money you put in is still yours. Your loan interest is guaranteed, investment returns aren't. Illustration only, not advice.</p>` +
			`</div></div>`
		);
	}

	// One listener for every offsetting button (results are re-rendered on
	// each calculation).
	document.addEventListener("click", function (event) {
		const toggle = event.target.closest(".loan-offset-toggle");
		if (!toggle) return;
		const panel = toggle.parentElement.querySelector(".loan-offset-panel");
		const open = panel.hidden;
		panel.hidden = !open;
		toggle.setAttribute("aria-expanded", String(open));
	});

	function headline(label, value, sub) {
		return `<div class="calculator-result-headline"><span>${label}</span><strong>${value}</strong>${sub ? `<em>${sub}</em>` : ""}</div>`;
	}

	function resultRow(label, value) {
		return `<div class="calculator-result-row"><span>${label}</span><strong>${value}</strong></div>`;
	}

	function setStatus(el, message, isError) {
		el.textContent = message || "";
		el.classList.toggle("error", Boolean(isError));
	}

	// Live helper text under the price field: the 25% downpayment.
	function updateHdbHints() {
		const priceHint = document.getElementById("hdb-price-hint");
		const cpfHint = document.getElementById("hdb-cpf-hint");
		if (!priceHint || !cpfHint) return;
		const price = Number(document.getElementById("hdb-price").value);
		const isBto = document.getElementById("hdb-type").value === "bto";
		["hdb-pay-field", "hdb-pay-hint", "hdb-staggered-field", "hdb-staggered-hint"].forEach(function (id) { const el = document.getElementById(id); if (el) el.hidden = !isBto; });
		cpfHint.textContent = "";
		priceHint.textContent = price > 0 ? `Downpayment (25%): ${formatCurrency(price * (1 - HDB_LOAN_LTV))}, plus stamp duty ${formatCurrency(computeBsd(price))}` : "";
	}

	// Same idea for the vehicle calculator: OMV decides the LTV tier, so the
	// minimum downpayment can be shown as soon as price + OMV are both typed in.
	function updateVehicleHints() {
		const V = window.VehicleLoan;
		const omvHint = document.getElementById("vehicle-omv-hint");
		const typeEl = document.getElementById("vehicle-type");
		if (!omvHint || !V) return;
		const type = typeEl ? typeEl.value : "car";
		const isCar = type === "car";
		document.getElementById("vehicle-omv-field").hidden = !isCar;
		omvHint.hidden = !isCar;
		const yearsLabel = document.getElementById("vehicle-years-label");
		if (yearsLabel) yearsLabel.innerHTML = `Loan tenure (years, max ${V.MAX_YEARS[type]}) <em>Optional</em>`;
		document.getElementById("vehicle-years").placeholder = `Blank = ${V.MAX_YEARS[type]}`;

		const price = Number(document.getElementById("vehicle-price").value);
		const omv = Number(document.getElementById("vehicle-omv").value);
		if (!isCar || !(price > 0)) {
			omvHint.textContent = "";
			return;
		}
		if (omv > 0) {
			const ltv = omv <= V.OMV_THRESHOLD ? 0.7 : 0.6;
			omvHint.textContent = `Minimum downpayment: ${formatCurrency(price * (1 - ltv))} (max loan ${Math.round(ltv * 100)}% of the price)`;
		} else {
			omvHint.textContent = `Minimum downpayment: ${formatCurrency(price * 0.3)} if the OMV is $20,000 or less, ${formatCurrency(price * 0.4)} if above`;
		}
	}

	function initHdbCalculator() {
		const form = document.getElementById("hdb-loan-form");
		const resultBox = document.getElementById("hdb-result");
		const status = document.getElementById("hdb-status");
		if (!form) return;

		const priceEl = document.getElementById("hdb-price");
		const cpfEl = document.getElementById("hdb-cpf");
		const grantsEl = document.getElementById("hdb-grants");
		if (priceEl) priceEl.addEventListener("input", updateHdbHints);
		if (cpfEl) cpfEl.addEventListener("input", updateHdbHints);
		if (grantsEl) grantsEl.addEventListener("input", updateHdbHints);
		const typeEl = document.getElementById("hdb-type");
		if (typeEl) typeEl.addEventListener("change", updateHdbHints);
		updateHdbHints();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "", false);

			const Pay = window.HdbPayments;
			const type = document.getElementById("hdb-type").value;
			const price = Number(document.getElementById("hdb-price").value);
			const cpfAvailable = Number(document.getElementById("hdb-cpf").value);
			const grantsRaw = document.getElementById("hdb-grants").value;
			const grants = grantsRaw === "" ? 0 : Number(grantsRaw);
			const yearsRaw = document.getElementById("hdb-years").value;
			const years = yearsRaw === "" ? HDB_LOAN_MAX_YEARS : Number(yearsRaw);

			if (!(price > 0) || cpfAvailable < 0 || grants < 0 || !(years > 0)) {
				setStatus(status, "Please fill in the flat price.", true);
				resultBox.hidden = true;
				return;
			}
			if (years > HDB_LOAN_MAX_YEARS) {
				setStatus(status, `HDB loans are capped at ${HDB_LOAN_MAX_YEARS} years.`, true);
				resultBox.hidden = true;
				return;
			}
			const bankRateRaw = document.getElementById("hdb-bank-rate") ? document.getElementById("hdb-bank-rate").value : "";
			const bankRateIsTypical = bankRateRaw === "";
			const bankRatePercent = bankRateIsTypical ? BANK_HOME_LOAN_TYPICAL_RATE : Number(bankRateRaw);
			if (!(bankRatePercent >= 0) || bankRatePercent > 15) {
				setStatus(status, "Please enter the bank's rate as a percentage, or leave it blank.", true);
				resultBox.hidden = true;
				return;
			}

			const payRaw = document.getElementById("hdb-pay") ? document.getElementById("hdb-pay").value : "";
			const monthlyPay = type === "bto" && payRaw !== "" ? Math.max(0, Number(payRaw) || 0) : 0;
			const oaAtKeys = monthlyPay > 0 ? Pay.oaByKeys(cpfAvailable, monthlyPay) : cpfAvailable;
			const staggeredEl = document.getElementById("hdb-staggered");
			const staggered = type === "bto" && Boolean(staggeredEl && staggeredEl.checked);
			const hdbPlan = Pay.schedule({ price, type, loan: "hdb", oa: cpfAvailable, oaAtKeys, grants, staggered });
			const bankPlan = Pay.schedule({ price, type, loan: "bank", oa: cpfAvailable, oaAtKeys, grants, staggered });
			hdbPlan.monthlyPay = monthlyPay;
			const loanAmount = hdbPlan.loan;
			const monthlyPayment = amortisedMonthlyPayment(loanAmount, HDB_LOAN_ANNUAL_RATE, years);
			const totalInterest = monthlyPayment * years * 12 - loanAmount;
			const bankMonthly = amortisedMonthlyPayment(bankPlan.loan, bankRatePercent / 100, years);
			const bankInterest = bankMonthly * years * 12 - bankPlan.loan;

			resultBox.innerHTML =
				headline("HDB loan: monthly payment", formatCurrency(monthlyPayment), `${years} years at ${(HDB_LOAN_ANNUAL_RATE * 100).toFixed(1)}% p.a. on a ${formatCurrency(loanAmount)} loan${loanAmount < hdbPlan.fullLoan ? ` (75% of the price, less ${formatCurrency(hdbPlan.fullLoan - loanAmount)} of grants and CPF OA)` : ""}`) +
				buildPaymentPlan(hdbPlan, cpfAvailable) +
				resultRow("Total interest paid", formatCurrency(totalInterest)) +
				buildBankComparison(
					{ monthlyPayment, totalInterest, cash: hdbPlan.totalCash },
					{ years, ratePercent: bankRatePercent, rateIsTypical: bankRateIsTypical, monthlyPayment: bankMonthly, totalInterest: bankInterest, cash: bankPlan.totalCash },
				) +
				buildLoanOffsettingBlock(null, years, null, [
					{ label: "HDB loan", totalInterest },
					{ label: "Bank loan", totalInterest: bankInterest },
				]);
			resultBox.hidden = false;
		});
	}

	// Each payment stage, and how much of it is cash vs CPF OA vs grants.
	function buildPaymentPlan(plan, oaToday) {
		const Pay = window.HdbPayments;
		let html = `<div class="pay-plan"><p class="pay-plan-title">What you pay, and when</p><ol class="pay-plan-stages">`;
		plan.stages.forEach(function (stage) {
			const parts = stage.parts.length > 1 ? `<span class="pay-plan-parts">${stage.parts.map(function (part) { return `${part[0]} ${formatCurrency(part[1])}`; }).join(" + ")}</span>` : "";
			html += `<li><div class="pay-plan-head"><strong>${stage.label}</strong><span>${formatCurrency(stage.total)}</span></div><span class="pay-plan-when">${stage.when}</span>${parts}<span class="pay-plan-source">${Pay.sourceLine(stage)}</span></li>`;
		});
		html += `</ol>`;
		const grantsBox = `<div><span>Covered by grants</span><strong>${formatCurrency(plan.totalGrants)}</strong>${plan.totalGrants > 0 ? "" : `<em class="pay-plan-sub">None entered</em>`}</div>`;
		html += plan.noOa
			? `<div class="pay-plan-totals"><div><span>Must be cash</span><strong>${formatCurrency(plan.mustBeCash)}</strong></div><div><span>CPF OA could pay</span><strong>up to ${formatCurrency(plan.oaCouldCover)}</strong></div><div><span>All in cash, if you don't use CPF</span><strong>${formatCurrency(plan.totalCash)}</strong></div>${grantsBox}</div>`
			: `<div class="pay-plan-totals"><div><span>Must be cash</span><strong>${formatCurrency(plan.mustBeCash)}</strong></div><div><span>Paid from CPF OA</span><strong>${formatCurrency(plan.totalOa)}</strong></div><div><span>Extra cash where OA runs short</span><strong>${formatCurrency(plan.extraCash)}</strong></div>${grantsBox}</div>`;
		if (plan.grantsToLoan > 0) html += `<p class="calculator-note calculator-note-callout">Your grants are bigger than the downpayment they can go towards, so the other <strong>${formatCurrency(plan.grantsToLoan)}</strong> cuts your loan instead.</p>`;
		if (plan.oaToLoan > 0) html += `<p class="calculator-note calculator-note-callout">With an HDB loan you can only keep $20,000 in CPF OA; the other <strong>${formatCurrency(plan.oaToLoan)}</strong> goes into the flat and cuts your loan.</p>`;
		html += `<p class="calculator-note">CPF OA is used first for everything it can pay. Only ${plan.loanType === "bank" ? "5% of the price (banks need it in cash)" : plan.type === "bto" ? "the option fee" : "the option fees"} must be cash; the rest is cash only where your OA runs out.</p>`;
		if (plan.type === "bto") {
			const oaNote = plan.noOa
				? "No CPF OA entered, so each step shows what CPF OA could pay (\"CPF OA or cash\"). Only the must-be-cash part has to come from your bank account."
				: plan.monthlyPay > 0
				? `Counts about ${formatCurrency(window.HdbPayments.oaPerMonth(plan.monthlyPay))}/month of new CPF OA from your salary until key collection (~3 years, 23% of pay, age 35 and under).`
				: "Only counts the CPF OA you have today. Add your salary to count the OA you'll build up before key collection, so less cash is needed at the keys.";
			html += `<p class="calculator-note">${oaNote} The $2,000 booking fee is for 4-room and bigger ($1,000 for 3-room, $500 for 2-room). ${plan.staggered ? `On the Staggered Downpayment Scheme: ${plan.loanType === "bank" ? "10% at signing (5% in cash), 15% at key collection" : "5% at signing, 20% at key collection"}. Less up front, but more due at the keys.` : "First-timer couples where the younger one got the HFE letter before 30 may qualify for the Staggered Downpayment Scheme: 5% at signing, 20% at key collection. Tick it above to see the difference."}</p>`;
		} else {
			html += `<p class="calculator-note">The option fees must be cash, because CPF can't be used until HDB accepts the resale application. They're negotiable with the seller but capped at $5,000. Any Cash-Over-Valuation (COV) is extra and cash only.</p>`;
		}
		if (plan.oaLeft > 0) {
			html += `<p class="calculator-note">${formatCurrency(plan.oaLeft)} of your CPF OA is left over${plan.loanType === "hdb" ? " (with an HDB loan you can keep up to $20,000)" : ". With a bank loan you choose how much to use; keeping some as a buffer is sensible"}.</p>`;
		}
		html += `</div>`;
		return html;
	}

	function initVehicleCalculator() {
		const form = document.getElementById("vehicle-loan-form");
		const resultBox = document.getElementById("vehicle-result");
		const status = document.getElementById("vehicle-status");
		const V = window.VehicleLoan;
		if (!form || !V) return;

		["vehicle-price", "vehicle-omv"].forEach(function (id) {
			const el = document.getElementById(id);
			if (el) el.addEventListener("input", updateVehicleHints);
		});
		const typeEl = document.getElementById("vehicle-type");
		if (typeEl) typeEl.addEventListener("change", updateVehicleHints);
		updateVehicleHints();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "", false);
			const type = typeEl ? typeEl.value : "car";
			const value = (id) => document.getElementById(id).value;
			const result = V.calculate({
				type,
				price: value("vehicle-price"),
				omv: type === "car" ? value("vehicle-omv") : "",
				downpayment: value("vehicle-downpayment"),
				years: value("vehicle-years"),
				ratePercent: value("vehicle-rate"),
			});
			if (!result.ok) {
				setStatus(status, result.error, true);
				resultBox.hidden = true;
				return;
			}

			if (!result.sufficient) {
				let html = headline("Downpayment too low", formatCurrency(result.shortfall), "short of the MAS minimum for a car");
				result.tiers.forEach(function (tier) {
					html += resultRow(`Minimum down (${tier.label}, ${Math.round(tier.ltv * 100)}% loan)`, formatCurrency(tier.minDownpayment));
				});
				html += resultRow("Your downpayment", formatCurrency(result.downpayment));
				html += `<p class="calculator-note">MAS caps car loans at 70% of the price if the OMV is $20,000 or less, and 60% if it's higher.</p>`;
				resultBox.innerHTML = html;
				resultBox.hidden = false;
				return;
			}

			let html = headline("Monthly payment", formatCurrency(result.monthlyPayment), `${result.years} years at ${result.ratePercent}% p.a. flat${result.rateIsTypical ? " (typical bank rate)" : ""}`);
			html += resultRow("Real (effective) rate", `about ${result.eirPercent}% a year`);
			html += resultRow("Downpayment", formatCurrency(result.downpayment));
			html += resultRow("Loan amount", `${formatCurrency(result.loanAmount)} (${result.loanPercent}% of the price)`);
			html += resultRow("Total repayment", formatCurrency(result.totalRepayment));
			html += resultRow("Total interest paid", formatCurrency(result.totalInterest));
			V.notes(result).forEach(function (text, index) {
				html += `<p class="calculator-note${result.onlyIfLowOmv && index === (result.rateIsTypical ? 2 : 1) ? " calculator-note-callout" : ""}">${text}</p>`;
			});
			html += buildLoanOffsettingBlock(result.totalInterest, result.years, `${result.type === "car" ? "car" : result.type === "bike" ? "bike" : "vehicle"} loan`);
			resultBox.innerHTML = html;
			resultBox.hidden = false;
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		initHdbCalculator();
		initVehicleCalculator();
	});
})();
