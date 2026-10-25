// Sliders for every number field, and live results: once someone has hit
// Calculate, any change (drag, type, pick) re-runs the calculator straight
// away. calculator-ux.js sees window.__calcLive and skips its scroll.
(function () {
	const M = (min, max, step, def) => ({ min, max, step, def });
	const RANGES = {
		"afford-age": M(18, 70, 1, 28),
		"afford-pay": M(1000, 30000, 100, 5000),
		"afford-savings": M(0, 500000, 1000, 40000),
		"afford-cpf": M(0, 400000, 1000, 0),
		"afford-expenses": M(500, 15000, 100, 3000),
		"afford-debt": M(0, 5000, 50, 0),
		"earn-price": { bto: M(100000, 1500000, 5000, 450000), resale: M(200000, 2000000, 5000, 600000), car: M(30000, 400000, 1000, 120000), bike: M(3000, 60000, 500, 20000) },
		"earn-age": M(21, 70, 1, 28),
		"earn-cpf": M(0, 400000, 1000, 0),
		"earn-savings": M(0, 500000, 1000, 40000),
		"earn-expenses": M(500, 15000, 100, 3000),
		"earn-debt": M(0, 5000, 50, 0),
		"insurance-income": M(1000, 30000, 100, 4000),
		"insurance-have-life": M(0, 3000000, 10000, 0),
		"insurance-have-ci": M(0, 1500000, 10000, 0),
		"tax-pay": M(1000, 50000, 100, 5000),
		"tax-bonus": M(0, 200000, 500, 0),
		"tax-age": M(18, 80, 1, 29),
		"tax-children": M(0, 6, 1, 0),
		"tax-children-2024": M(0, 4, 1, 0),
		"tax-srs": M(0, 35700, 100, 0),
		"tax-topup-self": M(0, 8000, 100, 0),
		"tax-topup-family": M(0, 8000, 100, 0),
		"hdb-price": M(100000, 1500000, 5000, 500000),
		"hdb-cpf": M(0, 400000, 1000, 0),
		"hdb-pay": M(1000, 30000, 100, 8000),
		"hdb-grants": M(0, 230000, 5000, 0),
		"hdb-years": M(5, 25, 1, 25),
		"hdb-bank-rate": M(0.5, 6, 0.05, 1.6),
		"cpf-age": M(16, 70, 1, 30),
		"cpf-wage": M(1000, 30000, 100, 5000),
		"cpf-oa": M(0, 500000, 1000, 0),
		"cpf-sa": M(0, 500000, 1000, 0),
		"cpf-ma": M(0, 100000, 500, 0),
		"cpf-growth": M(0, 10, 0.5, 0),
		"cpf-house-monthly": M(0, 5000, 50, 0),
		"cpf-house-lump": M(0, 300000, 1000, 0),
		"cpf-house-years": M(5, 35, 1, 25),
		"vehicle-price": M(5000, 400000, 1000, 120000),
		"vehicle-downpayment": M(0, 300000, 1000, 55000),
		"vehicle-years": M(1, 10, 1, 7),
		"vehicle-rate": M(1, 6, 0.01, 2.48),
		"compound-principal": M(0, 500000, 500, 10000),
		"compound-addition": M(0, 100000, 500, 0),
		"compound-years": M(1, 50, 1, 20),
		"compound-rate": M(0, 12, 0.5, 4),
	};

	function rangeFor(input) {
		const r = RANGES[input.id];
		if (r && r.min === undefined) {
			const item = document.getElementById("earn-item");
			return r[(item && item.value) || "bto"];
		}
		return r;
	}

	function fill(slider) {
		const pct = ((Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100;
		slider.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct))}%`);
	}

	function attach(input) {
		const r = rangeFor(input);
		if (!r || input.dataset.slider) return;
		input.dataset.slider = "1";
		const slider = document.createElement("input");
		slider.type = "range";
		slider.className = "calc-range";
		slider.tabIndex = -1; // the number box stays the keyboard control
		slider.setAttribute("aria-hidden", "true");
		const sync = function () {
			const r2 = rangeFor(input);
			slider.min = r2.min;
			slider.step = r2.step;
			const v = input.value === "" ? r2.def : Number(input.value);
			slider.max = Math.max(r2.max, Number.isFinite(v) ? v : 0);
			slider.value = Number.isFinite(v) ? v : r2.def;
			fill(slider);
		};
		sync();
		input.insertAdjacentElement("afterend", slider);
		slider.addEventListener("input", function () {
			input.value = slider.value;
			fill(slider);
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		input.addEventListener("input", function (event) {
			if (event.isTrusted) sync();
		});
		input._syncSlider = sync;
	}

	function live(form) {
		let timer = null;
		const rerun = function () {
			if (form.dataset.ran !== "1") return;
			const box = form.closest(".calculator-card") && form.closest(".calculator-card").querySelector(".calculator-result");
			if (box && box.hidden) return;
			clearTimeout(timer);
			timer = setTimeout(function () {
				window.__calcLive = true;
				try {
					form.requestSubmit();
				} finally {
					setTimeout(function () { window.__calcLive = false; }, 50);
				}
			}, 120);
		};
		form.addEventListener("submit", function () { form.dataset.ran = "1"; }, true);
		form.addEventListener("input", rerun);
		form.addEventListener("change", rerun);
	}

	function init() {
		document.querySelectorAll("#calculators form.calculator-form").forEach(function (form) {
			form.querySelectorAll('input[type="number"]').forEach(attach);
			live(form);
		});
		// The price slider's range follows what they're buying.
		const item = document.getElementById("earn-item");
		const price = document.getElementById("earn-price");
		if (item && price) {
			item.addEventListener("change", function () {
				if (price._syncSlider) price._syncSlider();
			});
		}
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
