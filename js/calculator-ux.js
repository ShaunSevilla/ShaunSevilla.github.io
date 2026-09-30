// Shared niceties for every calculator on the Financial page:
//   • financial-advisory.html#cpf (or #hdb, #vehicle, #compound) opens that
//     calculator directly, so links from the homepage, guide and bot land on it
//   • numeric keypad on phones
//   • answers are remembered on this device, so nobody retypes their CPF balance
//   • the result scrolls into view, with a "Discuss this with Shaun" button
//     that carries the numbers into the booking form's notes
(function () {
	const STORAGE_KEY = "ss-calculator-inputs-v1";

	function readSaved() {
		try {
			return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") || {};
		} catch (error) {
			return {};
		}
	}

	function writeSaved(values) {
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
		} catch (error) {
			// Private mode or storage blocked: calculators still work, they just won't remember.
		}
	}

	function openFromHash() {
		const id = decodeURIComponent(window.location.hash.replace("#", ""));
		if (!id) return;
		const target = document.getElementById(id);
		if (!target || !target.classList.contains("calculator-dropdown")) return;
		target.open = true;
		window.setTimeout(function () {
			target.scrollIntoView({ behavior: "smooth", block: "start" });
		}, 80);
	}

	function labelFor(input) {
		const label = input.closest("label");
		const span = label && label.querySelector("span");
		if (!span) return input.id;
		return span.textContent.replace(/Optional/i, "").replace(/\s+/g, " ").trim();
	}

	function formatInputValue(input) {
		const value = Number(input.value);
		if (input.value === "" || !Number.isFinite(value)) return null;
		const label = labelFor(input);
		if (/\(\$\)/.test(label)) {
			return "$" + Math.round(value).toLocaleString("en-SG");
		}
		if (/%/.test(label)) {
			return value + "%";
		}
		return String(value);
	}

	// Plain-text summary of a result for the booking notes (max 1,000 chars).
	function summarise(details, form, resultBox) {
		const name = details.dataset.calculator || "Calculator";
		const lines = ["From the " + name + " calculator on the website:"];

		const headline = resultBox.querySelector(".calculator-result-headline");
		if (headline) {
			const label = headline.querySelector("span");
			const value = headline.querySelector("strong");
			if (label && value) lines.push(label.textContent.trim() + ": " + value.textContent.trim());
		}
		resultBox.querySelectorAll(".calculator-result-row").forEach(function (row) {
			const label = row.querySelector("span");
			const value = row.querySelector("strong");
			if (label && value) lines.push(label.textContent.trim() + ": " + value.textContent.trim());
		});

		const inputs = [];
		form.querySelectorAll("input[type=number]").forEach(function (input) {
			const value = formatInputValue(input);
			if (value !== null) inputs.push(labelFor(input).replace(/\s*\(\$\)|\s*\(%[^)]*\)/g, "") + " " + value);
		});
		if (inputs.length) {
			lines.push("", "What I entered: " + inputs.join("; "));
		}

		return lines.join("\n").slice(0, 1000);
	}

	// Small "ask Shaun about..." buttons under each result. Each opens the
	// booking form with that topic and the numbers already in the notes.
	const TOPICS = {
		tax: ["Is SRS worth it for me?", "CPF top-ups for tax", "Planning for next year's tax"],
		afford: ["Grants check", "BTO vs resale", "HDB vs bank loan", "Loan offsetting"],
		hdb: ["Loan offsetting", "HDB vs bank loan", "CPF or cash for my loan?", "Refinancing"],
		cpf: ["CPF optimisation", "Reaching my retirement sum", "CPF top-ups"],
		vehicle: ["Loan offsetting", "Cash vs car loan", "Can I afford this car?"],
		insurance: ["Coverage review", "Closing my protection gap", "Cover on a budget"],
		compound: ["Where to invest", "A regular investing plan", "Investing my SRS"],
	};

	// What Can I Afford: topics follow what they're buying.
	function topicsFor(details) {
		if (details.id !== "afford") return TOPICS[details.id] || [];
		const ticked = (id) => { const box = details.querySelector("#afford-plan-" + id); return Boolean(box && box.checked); };
		const home = ticked("home");
		const vehicle = ticked("car") ? "car" : ticked("bike") ? "bike" : "";
		if (!home && vehicle) return [`Can I afford this ${vehicle}?`, `Cash vs ${vehicle} loan`, "Loan offsetting"];
		if (home && vehicle) return [`Home and ${vehicle} together`, "Grants check", "HDB vs bank loan", "Loan offsetting"];
		return TOPICS.afford;
	}

	function topicChips(details, summary) {
		const topics = topicsFor(details);
		if (!topics.length) return "";
		const chips = topics.map(function (topic) {
			const params = new URLSearchParams({
				topic: details.dataset.calculator || "",
				ask: topic,
				notes: ("I'd like to talk about: " + topic + "\n\n" + summary).slice(0, 1000),
			});
			return '<a class="topic-chip" href="booking.html?' + params.toString() + '">' + topic + "</a>";
		});
		return '<div class="topic-chips"><span>Ask Shaun about</span>' + chips.join("") + "</div>";
	}

	function addResultActions(details, form, resultBox) {
		if (resultBox.hidden || resultBox.querySelector(".calculator-actions")) return;

		const summary = summarise(details, form, resultBox);
		const params = new URLSearchParams({
			topic: details.dataset.calculator || "",
			notes: summary,
		});

		const actions = document.createElement("div");
		actions.className = "calculator-actions";
		actions.innerHTML =
			topicChips(details, summary) +
			'<a class="bot-cta-link bot-cta-primary" href="booking.html?' + params.toString() + '">Discuss this with Shaun <i class="fas fa-arrow-right" aria-hidden="true"></i></a>';
		resultBox.appendChild(actions);

		// On phones the result lands below the fold; bring it up.
		const top = resultBox.getBoundingClientRect().top;
		if (top > window.innerHeight * 0.6 || top < 0) {
			resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}

	function init() {
		const saved = readSaved();

		document.querySelectorAll(".calculator-dropdown").forEach(function (details) {
			const form = details.querySelector("form");
			const resultBox = details.querySelector(".calculator-result");
			if (!form || !resultBox) return;

			form.querySelectorAll("input[type=number]").forEach(function (input) {
				input.setAttribute("inputmode", /\./.test(input.getAttribute("step") || "") ? "decimal" : "numeric");
				if (input.id && saved[input.id] !== undefined && input.value === "") {
					input.value = saved[input.id];
					input.dispatchEvent(new Event("input", { bubbles: true }));
				}
				input.addEventListener("input", function () {
					const values = readSaved();
					if (input.value === "") {
						delete values[input.id];
					} else {
						values[input.id] = input.value;
					}
					writeSaved(values);
				});
			});

			new MutationObserver(function () {
				addResultActions(details, form, resultBox);
			}).observe(resultBox, { attributes: true, attributeFilter: ["hidden"], childList: true });

			// Keep the address bar pointing at the open calculator, so a copied
			// link opens the same one.
			details.addEventListener("toggle", function () {
				if (details.open && details.id && window.location.hash !== "#" + details.id) {
					history.replaceState(null, "", "#" + details.id);
				}
			});
		});

		openFromHash();
		window.addEventListener("hashchange", openFromHash);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
