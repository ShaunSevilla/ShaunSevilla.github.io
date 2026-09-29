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

	// HDB resale: Option Fee + Option Exercise Fee are cash-only (CPF can't
	// be used until the resale application is processed) and combined must
	// not exceed $5,000 — commonly quoted as ~1% of price, capped at $5,000.
	// Source: cpf.gov.sg, hdb.gov.sg.
	const HDB_OTP_DEPOSIT_RATE = 0.01;
	const HDB_OTP_DEPOSIT_CAP = 5000;

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

	function calculateHdbLoan({ price, cpfAvailable, grants = 0, cash, years }) {
		// Grants (EHG, CPF Housing Grant, PHG, etc.) are credited to the
		// buyer's CPF OA at completion, not handed over as cash — so for
		// this math they pool with CPF: same OTP-cash restriction, same
		// effect on the required downpayment.
		const cpfPool = cpfAvailable + grants;
		const requiredDownpayment = price * (1 - HDB_LOAN_LTV);
		const otpCash = Math.min(price * HDB_OTP_DEPOSIT_RATE, HDB_OTP_DEPOSIT_CAP);
		const bsd = computeBsd(price);
		const totalAvailable = cpfPool + cash;

		if (totalAvailable < requiredDownpayment) {
			return {
				sufficient: false,
				requiredDownpayment,
				otpCash,
				totalAvailable,
				shortfall: requiredDownpayment - totalAvailable,
				grants,
			};
		}

		const cpfNeeded = Math.max(0, requiredDownpayment - cash);
		const cpfUsed = Math.min(cpfPool, cpfNeeded);
		const cpfLeftover = cpfPool - cpfUsed;
		const totalDownpayment = cash + cpfUsed;
		const loanAmount = price - totalDownpayment;

		const monthlyPayment = amortisedMonthlyPayment(loanAmount, HDB_LOAN_ANNUAL_RATE, years);
		const totalRepayment = monthlyPayment * years * 12;
		const totalInterest = totalRepayment - loanAmount;

		// otpCash must come out of cash specifically (CPF can't pay it); the
		// rest is settled at completion/key collection alongside BSD.
		const cashShortfallForOtp = Math.max(0, otpCash - cash);
		const completionCash = Math.max(0, cash - otpCash);
		const completionDownpayment = Math.max(0, requiredDownpayment - otpCash);
		const bsdCpfPortion = Math.min(cpfLeftover, bsd);
		const bsdCashPortion = bsd - bsdCpfPortion;

		return {
			sufficient: true,
			requiredDownpayment,
			cash,
			grants,
			cpfUsed,
			cpfLeftover,
			totalDownpayment,
			loanAmount,
			years,
			monthlyPayment,
			totalRepayment,
			totalInterest,
			otpCash,
			cashShortfallForOtp,
			completionCash,
			completionDownpayment,
			bsd,
			bsdCpfPortion,
			bsdCashPortion,
		};
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
		const grantsEl = document.getElementById("hdb-grants");
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
		const grantsRaw = grantsEl ? grantsEl.value : "";
		const grants = grantsRaw === "" || !Number.isFinite(Number(grantsRaw)) || Number(grantsRaw) < 0 ? 0 : Number(grantsRaw);
		const poolLabel = grants > 0 ? "CPF + grants" : "CPF";

		if (cpfAvailable === null || !Number.isFinite(cpfAvailable) || cpfAvailable < 0) {
			cpfHint.textContent = `${poolLabel} usable toward downpayment: ${formatCurrency(0)} – ${formatCurrency(requiredDownpayment)} (depends on your CPF balance)`;
			cashHint.textContent = `Cash needed: ${formatCurrency(0)} – ${formatCurrency(requiredDownpayment)} (depends on how much ${poolLabel} you use)`;
			return;
		}

		const cpfPool = cpfAvailable + grants;
		const maxCpfUsable = Math.min(cpfPool, requiredDownpayment);
		const minCash = Math.max(0, requiredDownpayment - cpfPool);
		cpfHint.textContent = `${poolLabel} usable toward downpayment: ${formatCurrency(0)} – ${formatCurrency(maxCpfUsable)}`;
		cashHint.textContent = `Cash needed: ${formatCurrency(minCash)} – ${formatCurrency(requiredDownpayment)}. Leave blank to use the minimum.`;
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
		updateHdbHints();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "", false);

			const price = Number(document.getElementById("hdb-price").value);
			const cpfAvailable = Number(document.getElementById("hdb-cpf").value);
			const grantsRaw = document.getElementById("hdb-grants").value;
			const grants = grantsRaw === "" ? 0 : Number(grantsRaw);
			// Blank cash = the minimum cash needed; blank tenure = 25 years.
			const cashRaw = document.getElementById("hdb-cash").value;
			const minimumCash = Math.max(0, price * (1 - HDB_LOAN_LTV) - (cpfAvailable + grants));
			const cash = cashRaw === "" ? minimumCash : Number(cashRaw);
			const yearsRaw = document.getElementById("hdb-years").value;
			const years = yearsRaw === "" ? HDB_LOAN_MAX_YEARS : Number(yearsRaw);

			if (!(price > 0) || cpfAvailable < 0 || grants < 0 || cash < 0 || !(years > 0)) {
				setStatus(status, "Please fill in every field with a valid number.", true);
				resultBox.hidden = true;
				return;
			}

			if (years > HDB_LOAN_MAX_YEARS) {
				setStatus(status, `HDB loans are capped at ${HDB_LOAN_MAX_YEARS} years.`, true);
				resultBox.hidden = true;
				return;
			}

			const results = calculateHdbLoan({ price, cpfAvailable, grants, cash, years });

			if (!results.sufficient) {
				resultBox.innerHTML =
					resultRow("Minimum downpayment needed (25%)", formatCurrency(results.requiredDownpayment)) +
					resultRow("Your CPF + grants + cash", formatCurrency(results.totalAvailable)) +
					resultRow("Shortfall", formatCurrency(results.shortfall)) +
					`<p class="calculator-note">Of that, about ${formatCurrency(results.otpCash)} is due in cash at the Option to Purchase, since CPF can't be used until the resale application is processed.</p>` +
					`<p class="calculator-note">You'd need more CPF, more cash, or a lower-priced flat.</p>`;
				resultBox.hidden = false;
				return;
			}

			resultBox.innerHTML =
				headline("Monthly payment", formatCurrency(results.monthlyPayment), `${results.years} years at ${(HDB_LOAN_ANNUAL_RATE * 100).toFixed(1)}% p.a.`) +
				resultRow("Minimum downpayment (25%)", formatCurrency(results.requiredDownpayment)) +
				resultRow("Cash used", formatCurrency(results.cash)) +
				(results.grants > 0
					? resultRow("CPF + grants used", `${formatCurrency(results.cpfUsed)} (${formatCurrency(results.cpfLeftover)} left untouched, incl. ${formatCurrency(results.grants)} in grants)`)
					: resultRow("CPF used", `${formatCurrency(results.cpfUsed)} (${formatCurrency(results.cpfLeftover)} left untouched)`)) +
				resultRow("Total downpayment", formatCurrency(results.totalDownpayment)) +
				resultRow("Loan amount", formatCurrency(results.loanAmount)) +
				resultRow("Total repayment", formatCurrency(results.totalRepayment)) +
				resultRow("Total interest paid", formatCurrency(results.totalInterest)) +
				buildHdbPaymentTimeline(results);
			resultBox.hidden = false;
		});
	}

	// A simple proportional bar (no chart library needed) showing the cash
	// due at OTP vs. what's settled at Key Collection, plus a point-form
	// breakdown of each stage.
	function buildHdbPaymentTimeline(results) {
		const otpPct = Math.max(2, (results.otpCash / results.requiredDownpayment) * 100);
		const completionPct = 100 - otpPct;

		let html = `<p class="calculator-note" style="margin-top:1.2rem;"><strong style="color:var(--text);">When you pay</strong></p>`;
		html += `<div class="hdb-timeline-bar"><span class="hdb-timeline-otp" style="width:${otpPct}%;"></span><span class="hdb-timeline-completion" style="width:${completionPct}%;"></span></div>`;
		html += `<div class="hdb-timeline-legend"><span><i class="hdb-timeline-swatch hdb-timeline-swatch-otp"></i>At OTP</span><span><i class="hdb-timeline-swatch hdb-timeline-swatch-completion"></i>At key collection</span></div>`;
		html += `<ul class="calculator-note-list">`;
		html += `<li>At OTP (cash only): ${formatCurrency(results.otpCash)}</li>`;
		html += `<li>At key collection (~8 to 10 weeks later): ${formatCurrency(results.completionDownpayment)} (cash ${formatCurrency(results.completionCash)} + CPF ${formatCurrency(results.cpfUsed)}), plus stamp duty of about ${formatCurrency(results.bsd)} (CPF or cash)</li>`;
		html += `</ul>`;

		if (results.cashShortfallForOtp > 0) {
			html += `<p class="calculator-note" style="color:var(--gold);">Your planned cash (${formatCurrency(results.cash)}) is less than the ${formatCurrency(results.otpCash)} due at OTP. That part must be cash, since CPF can't be used yet.</p>`;
		}

		const totalCash = results.cash + results.bsdCashPortion;
		html += `<p class="calculator-note"><strong>Cash you need in total: about ${formatCurrency(totalCash)}</strong>${results.bsdCashPortion > 0 ? " (incl. stamp duty your leftover CPF can't cover)" : ""}. Legal and admin fees add about $650 to $1,000 (CPF or cash).</p>`;
		if (results.grants > 0) {
			html += `<p class="calculator-note">Grants are credited to your CPF OA at completion, so they're treated the same as CPF here — they don't raise your loan limit, only reduce what you need to put in. Check your actual eligible amount on the CPF Housing Grants checker.</p>`;
		}
		html += `<p class="calculator-note">Uses today's HDB loan rate and the 25% downpayment rule. Doesn't check MSR, age limits or bank loans. The OTP fee split is negotiable, but it's cash only and capped at $5,000.</p>`;

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
			const ratePercent = Number(document.getElementById("vehicle-rate").value);

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
				headline("Monthly payment", formatCurrency(results.monthlyPayment), `${results.years} years at ${results.ratePercent}% p.a. flat`) +
				(results.hasOmv
					? resultRow("Max loan allowed", `${results.maxLoanPercent}% of price`)
					: resultRow("Max loan allowed", "Not checked (no OMV given)")) +
				resultRow("Downpayment", formatCurrency(results.downpayment)) +
				resultRow("Loan amount", formatCurrency(results.loanAmount)) +
				resultRow("Total repayment", formatCurrency(results.totalRepayment)) +
				resultRow("Total interest paid", formatCurrency(results.totalInterest)) +
				(results.hasOmv
					? `<p class="calculator-note">Car loans quote a flat rate, so the real (effective) rate is roughly 1.8 to 2x higher.</p>`
					: `<p class="calculator-note">No OMV given, so the MAS loan limit wasn't checked. Your dealer or bank will confirm how much they'll finance. Car loans quote a flat rate, so the real rate is roughly 1.8 to 2x higher.</p>`);
			resultBox.hidden = false;
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		initHdbCalculator();
		initVehicleCalculator();
	});
})();
