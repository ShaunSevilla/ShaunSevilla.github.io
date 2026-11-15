// Sliders under "Play with the numbers" once there's a result, and live results: once someone has hit
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
		"srs-pay": M(1000, 40000, 250, 6000),
		"srs-amount": (input) => (Number(input.max) > 15300 ? M(0, 35700, 100, 35700) : M(0, 15300, 100, 15300)),
		"srs-age": M(18, 62, 1, 30),
		"bto-sale-cpf": M(0, 600000, 5000, 150000),
		"bto-sale-grants": M(0, 230000, 5000, 0),
		"bto-sale-age": M(1, 40, 1, 8),
		"bto-sale-sell": M(200000, 1500000, 10000, 600000),
		// Share of pay for the loan, 0-100%, starting at comfortable: 30% of
		// gross pay for a home, 10% of take-home for a car or bike.
		"loan-score": M(1000, 2000, 1, 1818),
		"loan-amount": (input) => ({ hdb: M(10000, 1000000, 5000, 350000), bankHdb: M(10000, 1500000, 5000, 400000), private: M(50000, 5000000, 10000, 1000000), car: M(5000, 300000, 1000, 80000), personal: M(1000, 200000, 500, 20000) })[(document.getElementById("loan-type") || {}).value || "hdb"],
		"loan-income": M(1000, 40000, 100, 6000),
		"loan-debt": M(0, 10000, 50, 0),
		"afford-home-share": M(0, 100, 1, 30),
		"afford-vehicle-share": M(0, 100, 1, 10),
		"earn-share": { bto: M(1, 100, 1, 30), resale: M(1, 100, 1, 30), car: M(1, 100, 1, 10), bike: M(1, 100, 1, 10) },
	};

	function homeShareNote(v) {
		if (v > 30) return "HDB and banks cap home loan repayments at 30% of pay, so the answer stops growing past 30%.";
		return v < 30 ? "" : "Comfortable: 30% of pay, the most HDB allows.";
	}
	function vehicleShareNote(v) {
		// TDSR: all loans within 55% of gross pay, about 69% of take-home.
		if (v > 69) return "Banks cap all loan repayments at 55% of gross pay (about 69% of take-home), so it stops growing there.";
		if (v > 15) return "Past 15% of take-home is a stretch: little room left for savings.";
		return v === 10 ? "Comfortable: 10% of take-home pay, for a car or a bike." : "";
	}
	function isVehicle(id) {
		if (id === "afford-vehicle-share") return true;
		const item = (document.getElementById("earn-item") || {}).value;
		return id === "earn-share" && (item === "car" || item === "bike");
	}

	// A one-line heads-up under a slider once its value crosses a limit.
	const money = (v) => `$${v.toLocaleString("en-SG")}`;
	const NOTES = {
		"afford-pay": function (v) {
			const home = document.getElementById("afford-plan-home");
			if (!home || !home.checked) return "";
			const couple = (document.getElementById("afford-with") || {}).value === "partner";
			const cap = couple ? 16000 : 8000;
			return v > cap ? `Above the ${money(cap)} ${couple ? "household" : "singles"} BTO income ceiling: resale or private only.` : "";
		},
		"afford-home-share": homeShareNote,
		"afford-vehicle-share": vehicleShareNote,
		"earn-share": function (v) {
			return isVehicle("earn-share") ? vehicleShareNote(v) : homeShareNote(v);
		},
		"cpf-wage": function (v) {
			return v > 8000 ? "CPF stops at the first $8,000 of monthly pay (CPF wage ceiling)." : "";
		},
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
		"srs-form": ["#srs-return-field", "#srs-withdraw-field", "#srs-other-field"],
		"loan-odds-form": ["#loan-years", "#loan-price", "#loan-omv", "#loan-unsecured", "#loan-with"],
		"bto-sale-form": ["#bto-sale-interest-field", "#bto-sale-upfront-field", "#bto-sale-scheme-field", "#bto-sale-clawback-field", "#bto-sale-agent-field", "#bto-sale-next-field", "#bto-sale-singles-field"],
	};

	function rangeFor(input) {
		const r = typeof RANGES[input.id] === "function" ? RANGES[input.id](input) : RANGES[input.id];
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

	function show(input, value) {
		if (!Number.isFinite(value)) return "—";
		if (/share$/.test(input.id)) {
			const vehicle = isVehicle(input.id);
			const pay = input.id.startsWith("afford") ? Number((document.getElementById("afford-pay") || {}).value) : 0;
			// Afford knows the pay, so show the dollars too: take-home is 80% of gross.
			const monthly = pay > 0 ? ` · $${Math.round((pay * (vehicle ? 0.8 : 1) * value) / 100).toLocaleString("en-SG")}/mo` : ` of ${vehicle ? "take-home" : "pay"}`;
			return `${value}%${monthly}`;
		}
		if (/rate/.test(input.id)) return `${value}%`;
		if (input.id === "loan-score") return `${value} (${window.LoanOdds ? window.LoanOdds.gradeFor(value).grade : ""})`;
		if (/years|-age$/.test(input.id)) return `${value} ${value === 1 ? "year" : "years"}`;
		return `$${Math.round(value).toLocaleString("en-SG")}`;
	}

	function labelText(input) {
		const label = input.closest("label");
		const span = label && label.querySelector("span");
		const text = span ? span.childNodes[0].textContent : input.id;
		return text.replace(/\s*\((?:\$|%)\)/g, "").trim();
	}

	// "Play with the numbers": once there's a result, the key numbers get a
	// slider right above it, so a drag changes the answer in view. The form
	// itself stays plain number boxes.
	function tweakPanel(form) {
		const inputs = Array.from(form.querySelectorAll('input[type="number"]')).filter(rangeFor);
		const card = form.closest(".calculator-card");
		const box = card && card.querySelector(".calculator-result");
		if (!inputs.length || !box) return;

		const panel = document.createElement("div");
		panel.className = "calc-tweak";
		panel.hidden = true;
		const title = document.createElement("p");
		title.className = "calc-tweak-title";
		title.textContent = "Play with the numbers";
		panel.appendChild(title);

		const rows = inputs.map(function (input) {
			const row = document.createElement("label");
			row.className = "calc-tweak-row";
			const head = document.createElement("span");
			head.className = "calc-tweak-head";
			const name = document.createElement("span");
			name.textContent = labelText(input);
			const val = document.createElement("strong");
			head.append(name, val);
			const slider = document.createElement("input");
			slider.type = "range";
			slider.className = "calc-range";
			const note = document.createElement("small");
			note.className = "calc-tweak-note";
			note.setAttribute("aria-live", "polite");
			row.append(head, slider, note);
			panel.appendChild(row);
			const updateNote = function () {
				const text = NOTES[input.id] ? NOTES[input.id](Number(slider.value)) : "";
				note.textContent = text;
				note.hidden = !text;
			};

			const sync = function () {
				const r = rangeFor(input);
				const v = input.value === "" ? r.def : Number(input.value);
				slider.min = r.min;
				slider.step = r.step;
				slider.max = Math.max(r.max, Number.isFinite(v) ? v : 0);
				slider.value = Number.isFinite(v) ? v : r.def;
				val.textContent = show(input, Number(slider.value));
				slider.setAttribute("aria-valuetext", val.textContent);
				fill(slider);
				updateNote();
			};
			slider.addEventListener("input", function () {
				input.value = slider.value;
				val.textContent = show(input, Number(slider.value));
				slider.setAttribute("aria-valuetext", val.textContent);
				fill(slider);
				updateNote();
				input.dispatchEvent(new Event("input", { bubbles: true }));
			});
			input.addEventListener("input", function (event) {
				if (event.isTrusted) sync();
			});
			input._syncSlider = sync;
			return { input, row, sync };
		});

		// Only numbers that are on screen in the form get a slider (Quick hides some).
		const refresh = function () {
			panel.hidden = box.hidden;
			if (box.hidden) return;
			rows.forEach(function (r) {
				const label = r.input.closest("label") || r.input;
				// Slider-only numbers (share of pay) never show in the form; they
				// follow what's being planned instead.
				const plan = label.dataset.plan;
				r.row.hidden = label.classList.contains("calc-tweak-only")
					? Boolean(plan) && !plan.split(" ").some(function (k) {
						const box = document.getElementById("afford-plan-" + k);
						return box && box.checked;
					})
					: !label.getClientRects().length;
				r.sync();
			});
		};
		box.insertAdjacentElement("beforebegin", panel);
		new MutationObserver(refresh).observe(box, { attributes: true, attributeFilter: ["hidden"], childList: true });
		refresh();
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
			tweakPanel(form);
			live(form);
		});
		// The price slider's range follows what they're buying.
		const item = document.getElementById("earn-item");
		const price = document.getElementById("earn-price");
		if (item && price) {
			item.addEventListener("change", function () {
				if (price._syncSlider) price._syncSlider();
				// The loan share means something different for a home and a car.
				const share = document.getElementById("earn-share");
				if (share) {
					share.value = "";
					if (share._syncSlider) share._syncSlider();
				}
			});
		}
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
