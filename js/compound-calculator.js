(function () {
	// Keep in sync with the ProsperityPath bot's calculatorService.js (calculateCompoundInterest).
	function formatCurrency(value) {
		return `$${Math.round(Number(value) || 0).toLocaleString("en-SG")}`;
	}

	function calculateCompoundInterest({ principal, annualAddition, years, ratePercent }) {
		const rate = ratePercent / 100;
		const n = years;

		// Compounded annually, with each year's addition made at the start of
		// that compounding period (so it earns a full year of interest).
		const futureValue = rate === 0
			? principal + annualAddition * n
			: (principal * Math.pow(1 + rate, n))
				+ (annualAddition * ((Math.pow(1 + rate, n) - 1) / rate) * (1 + rate));

		const totalContributions = principal + annualAddition * n;
		const totalInterest = futureValue - totalContributions;

		return { totalContributions, totalInterest, futureValue };
	}

	function resultRow(label, value) {
		return `<div class="calculator-result-row"><span>${label}</span><strong>${value}</strong></div>`;
	}

	function setStatus(el, message, isError) {
		el.textContent = message || "";
		el.classList.toggle("error", Boolean(isError));
	}

	function initCompoundCalculator() {
		const form = document.getElementById("compound-form");
		const resultBox = document.getElementById("compound-result");
		const status = document.getElementById("compound-status");
		if (!form) return;

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			setStatus(status, "", false);

			const principal = Number(document.getElementById("compound-principal").value);
			// Blank yearly addition = nothing added.
			const annualAddition = Number(document.getElementById("compound-addition").value || 0);
			const years = Number(document.getElementById("compound-years").value);
			const ratePercent = Number(document.getElementById("compound-rate").value);

			if (!(principal >= 0) || !(annualAddition >= 0) || !(years > 0) || !Number.isInteger(years) || !(ratePercent >= 0)) {
				setStatus(status, "Please fill in every field with a valid number.", true);
				resultBox.hidden = true;
				return;
			}

			const { totalContributions, totalInterest, futureValue } = calculateCompoundInterest({ principal, annualAddition, years, ratePercent });

			resultBox.innerHTML =
				`<div class="calculator-result-headline"><span>In ${years} years</span><strong>${formatCurrency(futureValue)}</strong></div>` +
				resultRow("You put in", formatCurrency(totalContributions)) +
				resultRow("Interest earned", formatCurrency(totalInterest)) +
				`<p class="calculator-note">Assumes compounding annually, with each year's addition made at the start of that year. Projection only. Returns aren't guaranteed.</p>`;
			resultBox.hidden = false;
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		initCompoundCalculator();
	});
})();
