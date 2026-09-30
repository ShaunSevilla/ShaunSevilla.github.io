(function () {
	// Keep in sync with the ProsperityPath bot's calculatorService.js (calculateCompoundInterest).
	function formatCurrency(value) {
		return `$${Math.round(Number(value) || 0).toLocaleString("en-SG")}`;
	}

	function calculateCompoundInterest({ principal, annualAddition, years, ratePercent }) {
		const rate = ratePercent / 100;
		const n = years;

		// Compounded yearly, each year's addition made at the END of the year
		// (the cautious convention, same as the bot's target calculator).
		const futureValue = rate === 0
			? principal + annualAddition * n
			: (principal * Math.pow(1 + rate, n))
				+ (annualAddition * ((Math.pow(1 + rate, n) - 1) / rate));

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

			if (!(principal >= 0) || !(annualAddition >= 0) || !(years > 0) || !Number.isInteger(years) || years > 60 || !(ratePercent >= 0) || ratePercent > 12) {
				setStatus(status, years > 60 ? "Please pick 60 years or fewer." : ratePercent > 12 ? "Please assume 12% a year or less. Even 8% is optimistic over long periods." : "Please fill in every field with a valid number.", true);
				resultBox.hidden = true;
				return;
			}

			const { totalContributions, totalInterest, futureValue } = calculateCompoundInterest({ principal, annualAddition, years, ratePercent });

			const lower = Math.max(0, ratePercent - 2);
			const lowerCase = calculateCompoundInterest({ principal, annualAddition, years, ratePercent: lower });
			resultBox.innerHTML =
				`<div class="calculator-result-headline"><span>In ${years} years, at ${ratePercent}% a year</span><strong>${formatCurrency(futureValue)}</strong></div>` +
				resultRow("You put in", formatCurrency(totalContributions)) +
				resultRow("Investment growth (not guaranteed)", formatCurrency(totalInterest)) +
				resultRow(`If returns are ${lower}% instead`, formatCurrency(lowerCase.futureValue)) +
				resultRow("In today's money (2% inflation)", `about ${formatCurrency(futureValue / Math.pow(1.02, years))}`) +
				`<p class="calculator-note">Compounded yearly, with each year's addition made at the end of the year. Fees (often 0.5% to 1% a year) come off the return. ${ratePercent > 8 ? "Above 8% a year is optimistic over long periods. " : ""}Projection only: returns aren't guaranteed and can be negative.</p>`;
			resultBox.hidden = false;
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		initCompoundCalculator();
	});
})();
