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

	// Motor vehicle loans: MAS caps the loan at 70% of purchase price when
	// OMV is $20,000 or below, and 60% when OMV is above $20,000, with a
	// maximum tenure of 7 years.
	// Source: mas.gov.sg/regulation/explainers/motor-vehicle-loans.
	const VEHICLE_LOAN_OMV_THRESHOLD = 20000;
	const VEHICLE_LOAN_LTV_LOW_OMV = 0.70;
	const VEHICLE_LOAN_LTV_HIGH_OMV = 0.60;
	const VEHICLE_LOAN_MAX_YEARS = 7;

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

	function calculateHdbLoan({ price, cpfAvailable, cash, years }) {
		const requiredDownpayment = price * (1 - HDB_LOAN_LTV);
		const totalAvailable = cpfAvailable + cash;

		if (totalAvailable < requiredDownpayment) {
			return {
				sufficient: false,
				requiredDownpayment,
				totalAvailable,
				shortfall: requiredDownpayment - totalAvailable,
			};
		}

		const cpfNeeded = Math.max(0, requiredDownpayment - cash);
		const cpfUsed = Math.min(cpfAvailable, cpfNeeded);
		const cpfLeftover = cpfAvailable - cpfUsed;
		const totalDownpayment = cash + cpfUsed;
		const loanAmount = price - totalDownpayment;

		const monthlyPayment = amortisedMonthlyPayment(loanAmount, HDB_LOAN_ANNUAL_RATE, years);
		const totalRepayment = monthlyPayment * years * 12;
		const totalInterest = totalRepayment - loanAmount;

		return {
			sufficient: true,
			requiredDownpayment,
			cash,
			cpfUsed,
			cpfLeftover,
			totalDownpayment,
			loanAmount,
			years,
			monthlyPayment,
			totalRepayment,
			totalInterest,
		};
	}

	function calculateVehicleLoan({ price, omv, downpayment, years, ratePercent }) {
		const maxLoanPercent = omv <= VEHICLE_LOAN_OMV_THRESHOLD ? VEHICLE_LOAN_LTV_LOW_OMV : VEHICLE_LOAN_LTV_HIGH_OMV;
		const maxLoanAmount = price * maxLoanPercent;
		const minDownpayment = price - maxLoanAmount;

		if (downpayment < minDownpayment) {
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
			maxLoanPercent: maxLoanPercent * 100,
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

	function resultRow(label, value) {
		return `<div class="calculator-result-row"><span>${label}</span><strong>${value}</strong></div>`;
	}

	function setStatus(el, message, isError) {
		el.textContent = message || "";
		el.classList.toggle("error", Boolean(isError));
	}

	// Live-updates the greyed helper text under the price/CPF/cash fields as the
	// user types, before they've submitted the form, so they know the minimum
	// (and maximum) downpayment split before committing to numbers.
	function updateHdbHints() {
		const priceHint = document.getElementById("hdb-price-hint");
		const cpfHint = document.getElementById("hdb-cpf-hint");
		const cashHint = document.getElementById("hdb-cash-hint");
		if (!priceHint || !cpfHint || !cashHint) return;

		const priceEl = document.getElementById("hdb-price");
		const cpfEl = document.getElementById("hdb-cpf");
		const price = Number(priceEl.value);

		if (!(price > 0)) {
			priceHint.textContent = "";
			cpfHint.textContent = "";
			cashHint.textContent = "";
			return;
		}

		const requiredDownpayment = price * (1 - HDB_LOAN_LTV);
		priceHint.textContent = `Minimum downpayment needed (25%): ${formatCurrency(requiredDownpayment)}`;

		const cpfRaw = cpfEl.value;
		const cpfAvailable = cpfRaw === "" ? null : Number(cpfRaw);

		if (cpfAvailable === null || !Number.isFinite(cpfAvailable) || cpfAvailable < 0) {
			cpfHint.textContent = `CPF usable toward downpayment: ${formatCurrency(0)} – ${formatCurrency(requiredDownpayment)} (depends on your CPF balance)`;
			cashHint.textContent = `Cash needed: ${formatCurrency(0)} – ${formatCurrency(requiredDownpayment)} (depends on how much CPF you use)`;
			return;
		}

		const maxCpfUsable = Math.min(cpfAvailable, requiredDownpayment);
		const minCash = Math.max(0, requiredDownpayment - cpfAvailable);
		cpfHint.textContent = `CPF usable toward downpayment: ${formatCurrency(0)} – ${formatCurrency(maxCpfUsable)}`;
		cashHint.textContent = `Cash needed: ${formatCurrency(minCash)} – ${formatCurrency(requiredDownpayment)}`;
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
		if (priceEl) priceEl.addEventListener("input", updateHdbHints);
		if (cpfEl) cpfEl.addEventListener("input", updateHdbHints);
		updateHdbHints();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "", false);

			const price = Number(document.getElementById("hdb-price").value);
			const cpfAvailable = Number(document.getElementById("hdb-cpf").value);
			const cash = Number(document.getElementById("hdb-cash").value);
			const years = Number(document.getElementById("hdb-years").value);

			if (!(price > 0) || cpfAvailable < 0 || cash < 0 || !(years > 0)) {
				setStatus(status, "Please fill in every field with a valid number.", true);
				resultBox.hidden = true;
				return;
			}

			if (years > HDB_LOAN_MAX_YEARS) {
				setStatus(status, `HDB loans are capped at ${HDB_LOAN_MAX_YEARS} years.`, true);
				resultBox.hidden = true;
				return;
			}

			const results = calculateHdbLoan({ price, cpfAvailable, cash, years });

			if (!results.sufficient) {
				resultBox.innerHTML =
					resultRow("Minimum downpayment needed (25%)", formatCurrency(results.requiredDownpayment)) +
					resultRow("Your CPF + cash", formatCurrency(results.totalAvailable)) +
					resultRow("Shortfall", formatCurrency(results.shortfall)) +
					`<p class="calculator-note">You're short of the minimum downpayment under current LTV rules (75% max loan). You'd need more CPF, more cash, or a lower-priced flat.</p>`;
				resultBox.hidden = false;
				return;
			}

			resultBox.innerHTML =
				resultRow("Minimum downpayment (25%)", formatCurrency(results.requiredDownpayment)) +
				resultRow("Cash used", formatCurrency(results.cash)) +
				resultRow("CPF used", `${formatCurrency(results.cpfUsed)} (${formatCurrency(results.cpfLeftover)} left untouched)`) +
				resultRow("Total downpayment", formatCurrency(results.totalDownpayment)) +
				resultRow("Loan amount", formatCurrency(results.loanAmount)) +
				resultRow("Interest rate", `${(HDB_LOAN_ANNUAL_RATE * 100).toFixed(1)}% p.a. (HDB concessionary)`) +
				resultRow("Loan tenure", `${results.years} years`) +
				resultRow("Monthly payment", formatCurrency(results.monthlyPayment)) +
				resultRow("Total repayment", formatCurrency(results.totalRepayment)) +
				resultRow("Total interest paid", formatCurrency(results.totalInterest));
			resultBox.hidden = false;
		});
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
			const omv = Number(document.getElementById("vehicle-omv").value);
			const downpayment = Number(document.getElementById("vehicle-downpayment").value);
			const years = Number(document.getElementById("vehicle-years").value);
			const ratePercent = Number(document.getElementById("vehicle-rate").value);

			if (!(price > 0) || !(omv > 0) || downpayment < 0 || !(years > 0) || ratePercent < 0) {
				setStatus(status, "Please fill in every field with a valid number.", true);
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
					`<p class="calculator-note">MAS caps vehicle loans at 70% of price when OMV is $20,000 or under, and 60% when OMV is above $20,000 — so you're short of the minimum downpayment needed.</p>`;
				resultBox.hidden = false;
				return;
			}

			resultBox.innerHTML =
				resultRow("Max loan allowed", `${results.maxLoanPercent}% of price`) +
				resultRow("Downpayment", formatCurrency(results.downpayment)) +
				resultRow("Loan amount", formatCurrency(results.loanAmount)) +
				resultRow("Interest rate", `${results.ratePercent}% p.a. flat`) +
				resultRow("Loan tenure", `${results.years} years`) +
				resultRow("Monthly payment", formatCurrency(results.monthlyPayment)) +
				resultRow("Total repayment", formatCurrency(results.totalRepayment)) +
				resultRow("Total interest paid", formatCurrency(results.totalInterest)) +
				`<p class="calculator-note">Car loans use a flat rate, not reducing balance — the effective rate is roughly 1.8–2x higher than the flat rate quoted.</p>`;
			resultBox.hidden = false;
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		initHdbCalculator();
		initVehicleCalculator();
	});
})();
