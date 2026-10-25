// Sliders for every number field, and live results: once someone has hit
// Calculate, any change (drag, type, pick) re-runs the calculator straight
// away. calculator-ux.js sees window.__calcLive and skips its scroll.
(function () {
	const M = (min, max, step, def) => ({ min, max, step, def });
	// Sliders only on the numbers people actually play with.
	const RANGES = {
		"afford-pay": M(1000, 30000, 100, 5000),
		"afford-savings": M(0, 500000, 1000, 40000),
		"earn-price": { bto: M(100000, 1500000, 5000, 450000), resale: M(200000, 2000000, 5000, 600000), car: M(30000, 400000, 1000, 120000), bike: M(3000, 60000, 500, 20000) },
		"earn-savings": M(0, 500000, 1000, 40000),
		"insurance-income": M(1000, 30000, 100, 4000),
		"tax-pay": M(1000, 50000, 100, 5000),
		"tax-srs": M(0, 35700, 100, 0),
		"hdb-price": M(100000, 1500000, 5000, 500000),
		"cpf-wage": M(1000, 30000, 100, 5000),
		"vehicle-price": M(5000, 400000, 1000, 120000),
		"vehicle-downpayment": M(0, 300000, 1000, 55000),
		"compound-principal": M(0, 500000, 500, 10000),
		"compound-addition": M(0, 100000, 500, 0),
		"compound-years": M(1, 50, 1, 20),
		"compound-rate": M(0, 12, 0.5, 4),
	};

	// Quick / Detailed: Quick shows only these forms' essentials; everything
	// listed here is Detailed only, and counts as blank (or its default) while
	// Quick is on, so a hidden leftover value can't skew the answer.
	const DETAIL = {
		"afford-form": ["#afford-cpf", "#afford-first", "#afford-ehg-hint", "#afford-proximity-field", "#afford-dependants", "#afford-expenses-field", "#afford-debt"],
		"earn-form": ["#earn-first", "#earn-proximity-field", "#earn-cpf", "#earn-dependants", "#earn-expenses-field", "#earn-debt"],
		"tax-form": [".tax-relief-field", "#tax-mother-fields", "#tax-ptr-field", "#tax-life-field"],
		"hdb-loan-form": ["#hdb-pay-field", "#hdb-pay-hint", "#hdb-staggered-field", "#hdb-staggered-hint", "#hdb-grants", "#hdb-grants-hint", "#hdb-years", "#hdb-bank-rate"],
		"cpf-form": ["#cpf-oa", "#cpf-sa", "#cpf-ma", "#cpf-growth", "#cpf-house-monthly", "#cpf-house-lump", "#cpf-house-more", ":scope > p.calculator-field-hint"],
		"vehicle-loan-form": ["#vehicle-years", "#vehicle-rate"],
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

	function setupModes(form) {
		const selectors = DETAIL[form.id];
		if (!selectors) return;
		const parts = [];
		selectors.forEach(function (sel) {
			form.querySelectorAll(sel).forEach(function (el) {
				const part = el.matches("input, select") ? el.closest("label") || el : el;
				if (!parts.includes(part)) parts.push(part);
			});
		});
		parts.forEach(function (part) { part.classList.add("calc-detail"); });

		const toggle = document.createElement("div");
		toggle.className = "calc-mode";
		toggle.setAttribute("role", "group");
		toggle.setAttribute("aria-label", "Calculator mode");
		toggle.innerHTML = '<button type="button" data-mode="quick">Quick</button><button type="button" data-mode="detailed">Detailed</button>';
		form.insertAdjacentElement("beforebegin", toggle);

		function setMode(mode, rerun) {
			form.classList.toggle("is-quick", mode === "quick");
			toggle.querySelectorAll("button").forEach(function (btn) {
				const on = btn.dataset.mode === mode;
				btn.classList.toggle("is-on", on);
				btn.setAttribute("aria-pressed", on ? "true" : "false");
			});
			if (rerun && form.dataset.ran === "1") form.requestSubmit();
		}
		toggle.querySelectorAll("button").forEach(function (btn) {
			btn.addEventListener("click", function () { setMode(btn.dataset.mode, true); });
		});
		setMode("quick", false);

		// While Quick is on, Detailed-only fields count as blank for this run.
		form.addEventListener("submit", function () {
			if (!form.classList.contains("is-quick")) return;
			const saved = [];
			parts.forEach(function (part) {
				part.querySelectorAll("input, select").forEach(function (el) {
					if (el.type === "checkbox" || el.type === "radio") {
						saved.push([el, "checked", el.checked]);
						el.checked = el.defaultChecked;
					} else if (el.tagName === "SELECT") {
						saved.push([el, "value", el.value]);
						const def = Array.from(el.options).find(function (o) { return o.defaultSelected; }) || el.options[0];
						if (def) el.value = def.value;
					} else if (el.type !== "range") {
						saved.push([el, "value", el.value]);
						el.value = "";
					}
				});
			});
			setTimeout(function () {
				saved.forEach(function (entry) { entry[0][entry[1]] = entry[2]; });
			}, 0);
		}, true);
	}

	function init() {
		document.querySelectorAll("#calculators form.calculator-form").forEach(function (form) {
			setupModes(form);
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
