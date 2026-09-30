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
	const VEHICLE_LOAN_OMV_THRESHOLD = 20000;
	const VEHICLE_LOAN_LTV_LOW_OMV = 0.70;
	const VEHICLE_LOAN_LTV_HIGH_OMV = 0.60;
	const VEHICLE_LOAN_MAX_YEARS = 7;
	// Used when the rate is left blank (most people only know their monthly
	// instalment). 2.48% flat is where most bank car loans cluster in 2026;
	// source: moneysmart.sg/car-loan, Sep 2026. Keep in sync with the bot's
	// calculatorConstants.js.
	const VEHICLE_LOAN_TYPICAL_FLAT_RATE = 2.48;

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
		html += `<li><strong>Bank loan:</strong> ${bank.ratePercent < 2.6 ? "cheaper at this rate" : "no cheaper at this rate"}, and up to ${BANK_HOME_LOAN_MAX_YEARS} years, but the rate is only fixed for 2 to 3 years, then it floats. If bank rates average above 2.6% over your loan, HDB ends up cheaper. Once you leave the HDB loan you can't switch back.</li>`;
		html += `</ul></div>`;
		return html;
	}

	// OMV is optional: dealers selling from stock don't always disclose it,
	// and it isn't needed for the loan math itself — only to check it
	// against MAS's LTV cap. When omv is null, that check is skipped.
	function calculateVehicleLoan({ price, omv, downpayment, years, ratePercent }) {
		const hasOmv = omv !== null && omv !== undefined;
		const maxLoanPercent = hasOmv ? (omv <= VEHICLE_LOAN_OMV_THRESHOLD ? VEHICLE_LOAN_LTV_LOW_OMV : VEHICLE_LOAN_LTV_HIGH_OMV) : null;
		const minDownpayment = hasOmv ? price - (price * maxLoanPercent) : null;

		if (hasOmv && downpayment < minDownpayment) {
			return {
				sufficient: false,
				maxLoanPercent: maxLoanPercent * 100,
				minDownpayment,
				downpayment,
				shortfall: minDownpayment - downpayment,
			};
		}

		const loanAmount = price - downpayment;
		const totalInterest = loanAmount * (ratePercent / 100) * years;
		const totalRepayment = loanAmount + totalInterest;
		const monthlyPayment = totalRepayment / (years * 12);

		return {
			sufficient: true,
			hasOmv,
			maxLoanPercent: hasOmv ? maxLoanPercent * 100 : null,
			minDownpayment,
			downpayment,
			loanAmount,
			ratePercent,
			years,
			monthlyPayment,
			totalRepayment,
			totalInterest,
		};
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
		["hdb-pay-field", "hdb-pay-hint"].forEach(function (id) { const el = document.getElementById(id); if (el) el.hidden = !isBto; });
		cpfHint.textContent = "";
		priceHint.textContent = price > 0 ? `Downpayment (25%): ${formatCurrency(price * (1 - HDB_LOAN_LTV))}, plus stamp duty ${formatCurrency(computeBsd(price))}` : "";
	}

	// Same idea for the vehicle calculator: OMV decides the LTV tier, so the
	// minimum downpayment can be shown as soon as price + OMV are both typed in.
	function updateVehicleHints() {
		const omvHint = document.getElementById("vehicle-omv-hint");
		if (!omvHint) return;

		const price = Number(document.getElementById("vehicle-price").value);
		const omv = Number(document.getElementById("vehicle-omv").value);

		if (!(price > 0) || !(omv > 0)) {
			omvHint.textContent = "";
			return;
		}

		const maxLoanPercent = omv <= VEHICLE_LOAN_OMV_THRESHOLD ? VEHICLE_LOAN_LTV_LOW_OMV : VEHICLE_LOAN_LTV_HIGH_OMV;
		const minDownpayment = price - price * maxLoanPercent;
		omvHint.textContent = `Minimum downpayment required: ${formatCurrency(minDownpayment)} (max loan ${(maxLoanPercent * 100).toFixed(0)}% of price)`;
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
				setStatus(status, "Please fill in the price and your CPF OA.", true);
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
			const hdbPlan = Pay.schedule({ price, type, loan: "hdb", oa: cpfAvailable, oaAtKeys, grants });
			const bankPlan = Pay.schedule({ price, type, loan: "bank", oa: cpfAvailable, oaAtKeys, grants });
			hdbPlan.monthlyPay = monthlyPay;
			const loanAmount = hdbPlan.loan;
			const monthlyPayment = amortisedMonthlyPayment(loanAmount, HDB_LOAN_ANNUAL_RATE, years);
			const totalInterest = monthlyPayment * years * 12 - loanAmount;
			const bankMonthly = amortisedMonthlyPayment(loanAmount, bankRatePercent / 100, years);
			const bankInterest = bankMonthly * years * 12 - loanAmount;

			resultBox.innerHTML =
				headline("HDB loan: monthly payment", formatCurrency(monthlyPayment), `${years} years at ${(HDB_LOAN_ANNUAL_RATE * 100).toFixed(1)}% p.a. on a ${formatCurrency(loanAmount)} loan`) +
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
		html += `<div class="pay-plan-totals"><div><span>Must be cash</span><strong>${formatCurrency(plan.mustBeCash)}</strong></div><div><span>Paid from CPF OA</span><strong>${formatCurrency(plan.totalOa)}</strong></div>${plan.totalGrants > 0 ? `<div><span>Covered by grants</span><strong>${formatCurrency(plan.totalGrants)}</strong></div>` : ""}<div><span>Extra cash where OA runs short</span><strong>${formatCurrency(plan.extraCash)}</strong></div></div>`;
		html += `<p class="calculator-note">CPF OA is used first for everything it can pay. Only ${plan.loanType === "bank" ? "5% of the price (banks need it in cash)" : plan.type === "bto" ? "the option fee" : "the option fees"} must be cash; the rest is cash only where your OA runs out.</p>`;
		if (plan.type === "bto") {
			const oaNote = plan.monthlyPay > 0
				? `Counts about ${formatCurrency(window.HdbPayments.oaPerMonth(plan.monthlyPay))}/month of new CPF OA from your salary until key collection (~3 years, 23% of pay, age 35 and under).`
				: "Only counts the CPF OA you have today. Add your salary to count the OA you'll build up before key collection, so less cash is needed at the keys.";
			html += `<p class="calculator-note">${oaNote} The $2,000 booking fee is for 4-room and bigger ($1,000 for 3-room, $500 for 2-room). Young couples on HDB's Staggered Downpayment Scheme can pay 5% at signing and 20% at key collection instead.</p>`;
		} else {
			html += `<p class="calculator-note">The option fees must be cash, because CPF can't be used until HDB accepts the resale application. They're negotiable with the seller but capped at $5,000. Any Cash-Over-Valuation (COV) is extra and cash only.</p>`;
		}
		if (plan.oaLeft > 0) {
			html += `<p class="calculator-note">${formatCurrency(plan.oaLeft)} of your CPF OA is left over. CPF suggests keeping some as a buffer (you can keep up to $20,000 when taking an HDB loan).</p>`;
		}
		html += `</div>`;
		return html;
	}

	function initVehicleCalculator() {
		const form = document.getElementById("vehicle-loan-form");
		const resultBox = document.getElementById("vehicle-result");
		const status = document.getElementById("vehicle-status");
		if (!form) return;

		const priceEl = document.getElementById("vehicle-price");
		const omvEl = document.getElementById("vehicle-omv");
		if (priceEl) priceEl.addEventListener("input", updateVehicleHints);
		if (omvEl) omvEl.addEventListener("input", updateVehicleHints);
		updateVehicleHints();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "", false);

			const price = Number(document.getElementById("vehicle-price").value);
			const omvRaw = document.getElementById("vehicle-omv").value;
			const omv = omvRaw === "" ? null : Number(omvRaw);
			const downpayment = Number(document.getElementById("vehicle-downpayment").value);
			// Blank tenure = the 7-year maximum.
			const yearsRaw = document.getElementById("vehicle-years").value;
			const years = yearsRaw === "" ? VEHICLE_LOAN_MAX_YEARS : Number(yearsRaw);
			const rateRaw = document.getElementById("vehicle-rate").value;
			const rateIsTypical = rateRaw === "";
			const ratePercent = rateIsTypical ? VEHICLE_LOAN_TYPICAL_FLAT_RATE : Number(rateRaw);

			if (!(price > 0) || (omv !== null && !(omv > 0)) || downpayment < 0 || !(years > 0) || ratePercent < 0) {
				setStatus(status, "Please fill in every field with a valid number (OMV can be left blank).", true);
				resultBox.hidden = true;
				return;
			}

			if (years > VEHICLE_LOAN_MAX_YEARS) {
				setStatus(status, `MAS caps vehicle loans at ${VEHICLE_LOAN_MAX_YEARS} years.`, true);
				resultBox.hidden = true;
				return;
			}

			const results = calculateVehicleLoan({ price, omv, downpayment, years, ratePercent });

			if (!results.sufficient) {
				resultBox.innerHTML =
					resultRow("Max loan allowed", `${results.maxLoanPercent}% of price`) +
					resultRow("Minimum downpayment required", formatCurrency(results.minDownpayment)) +
					resultRow("Your downpayment", formatCurrency(results.downpayment)) +
					resultRow("Shortfall", formatCurrency(results.shortfall)) +
					`<p class="calculator-note">MAS caps car loans at 70% of the price if OMV is $20,000 or less, and 60% if it's higher.</p>`;
				resultBox.hidden = false;
				return;
			}

			resultBox.innerHTML =
				headline("Monthly payment", formatCurrency(results.monthlyPayment), `${results.years} years at ${results.ratePercent}% p.a. flat${rateIsTypical ? " (typical bank rate)" : ""}`) +
				(results.hasOmv
					? resultRow("Max loan allowed", `${results.maxLoanPercent}% of price`)
					: resultRow("Max loan allowed", "Not checked (no OMV given)")) +
				resultRow("Downpayment", formatCurrency(results.downpayment)) +
				resultRow("Loan amount", formatCurrency(results.loanAmount)) +
				resultRow("Total repayment", formatCurrency(results.totalRepayment)) +
				resultRow("Total interest paid", formatCurrency(results.totalInterest)) +
				(rateIsTypical
					? `<p class="calculator-note">You left the rate blank, so this uses ${VEHICLE_LOAN_TYPICAL_FLAT_RATE}% flat, where most bank car loans sit in 2026. Used cars are often higher. Your bank will confirm your actual rate.</p>`
					: "") +
				(results.hasOmv
					? `<p class="calculator-note">Car loans quote a flat rate, so the real (effective) rate is roughly 1.8 to 2x higher.</p>`
					: `<p class="calculator-note">No OMV given, so the MAS loan limit wasn't checked. Your dealer or bank will confirm how much they'll finance. Car loans quote a flat rate, so the real rate is roughly 1.8 to 2x higher.</p>`) +
				buildLoanOffsettingBlock(results.totalInterest, results.years, "car loan");
			resultBox.hidden = false;
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		initHdbCalculator();
		initVehicleCalculator();
	});
})();
