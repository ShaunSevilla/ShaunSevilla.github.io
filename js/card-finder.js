// Credit card finder: a few questions, then the card that fits best and a
// backup. Card facts as of Oct 2026 (bank sites, MileLion, MoneySmart);
// keep in line with the bot's credit card picks (staticContent.js).
(function () {
	const CARDS = {
		absolute: {
			name: "UOB Absolute Cashback",
			type: "Cashback",
			facts: ["1.7% cashback on almost everything", "No minimum spend, no cap", "Fee $196.20/yr, first year usually waived"],
			why: "Flat cashback with nothing to track. Every dollar earns the same.",
		},
		liveFresh: {
			name: "DBS Live Fresh",
			type: "Cashback",
			facts: ["6% on online and mobile contactless spend", "Needs $800/month spend", "Cap $70/month ($50 shopping + $20 transport)"],
			why: "High cashback on online shopping, as long as you hit $800 every month.",
		},
		ocbc365: {
			name: "OCBC 365",
			type: "Cashback",
			facts: ["5% on dining, 6% on petrol, 3% on groceries and transport", "Needs $800/month spend", "Cap $80/month ($160 if you spend $1,600)"],
			why: "Built for people whose spending is mostly eating out.",
		},
		uobOne: {
			name: "UOB One",
			type: "Cashback",
			facts: ["3.33% back: $60 a quarter at $600/month, up to $200 at $2,000/month", "Needs 10 transactions every month of the quarter", "Extra cashback on Grab, Shopee, McDonald's and groceries"],
			why: "Good cashback on mixed spending, if you hit the same spend and 10 transactions every single month.",
		},
		altitude: {
			name: "DBS Altitude",
			type: "Miles",
			facts: ["1.3 miles per $1 locally, 2.2 overseas", "No minimum spend, points never expire", "Fee $196.20/yr, first year usually waived"],
			why: "A simple miles card. Points never expire, so you can collect slowly.",
		},
		prvi: {
			name: "UOB PRVI Miles",
			type: "Miles",
			facts: ["1.4 miles per $1 locally, 2.4 overseas", "Up to 8 mpd on selected hotel bookings", "Fee $261.60/yr, first year usually waived"],
			why: "Earns more than other simple miles cards, especially overseas.",
		},
		womansWorld: {
			name: "DBS Woman's World Card",
			type: "Miles",
			facts: ["4 miles per $1 on online spend", "Cap $1,000/month", "Needs $80,000 annual income; open to men too"],
			why: "Top miles rate for people who spend mostly online.",
		},
		citiRewards: {
			name: "Citi Rewards",
			type: "Miles",
			facts: ["4 miles per $1 on online spend (and some in-store shopping)", "Cap $1,000/statement month", "Not on travel bookings or in-app wallets"],
			why: "Another 4 mpd online card, with points that last up to 5 years.",
		},
		preferredVisa: {
			name: "UOB Preferred Visa",
			type: "Miles",
			facts: ["4 miles per $1 on mobile contactless (Apple Pay, Google Pay)", "Separate 4 mpd on selected online categories", "Cap $600/month each"],
			why: "Top miles rate when you tap your phone to pay in shops.",
		},
		revolution: {
			name: "HSBC Revolution",
			type: "Miles",
			facts: ["4 miles per $1 on dining, air tickets, hotels, contactless and selected online", "Cap $1,000/month", "Usually no annual fee"],
			why: "Covers the most bonus categories, with usually no annual fee.",
		},
	};

	function pick(a) {
		if (a.payFull === "no") return { stop: true };
		const simple = a.style === "simple" || a.spend === "low";
		const overseas = a.travel === "often";
		let best;
		let backup;
		if (a.goal === "cash") {
			if (simple || a.spend === "mid") {
				best = a.spend === "mid" && a.style !== "simple" ? "uobOne" : "absolute";
				backup = best === "absolute" ? "uobOne" : "absolute";
			} else if (a.where === "online") {
				best = "liveFresh"; backup = "absolute";
			} else if (a.where === "dining") {
				best = "ocbc365"; backup = "absolute";
			} else {
				best = "uobOne"; backup = "absolute";
			}
		} else if (simple) {
			best = overseas ? "prvi" : "altitude";
			backup = best === "prvi" ? "altitude" : "prvi";
		} else if (a.where === "online") {
			best = "womansWorld"; backup = "citiRewards";
		} else if (a.where === "contactless") {
			best = "preferredVisa"; backup = "revolution";
		} else {
			best = "revolution"; backup = overseas ? "prvi" : "altitude";
		}
		return { best, backup };
	}

	function cardHtml(card, label, showName) {
		return `<div class="card-pick"><span class="card-pick-label">${label} · ${card.type}</span>${showName ? `<strong>${card.name}</strong>` : ""}<p>${card.why}</p><ul class="calculator-note-list">${card.facts.map((f) => `<li>${f}</li>`).join("")}</ul></div>`;
	}

	function init() {
		const form = document.getElementById("cards-form");
		const resultBox = document.getElementById("cards-result");
		if (!form || !resultBox) return;
		const value = (id) => document.getElementById(id).value;
		form.addEventListener("submit", function (event) {
			event.preventDefault();
			const a = { payFull: value("cards-payfull"), goal: value("cards-goal"), spend: value("cards-spend"), where: value("cards-where"), style: value("cards-style"), travel: value("cards-travel") };
			const result = pick(a);
			let html;
			if (result.stop) {
				html = `<div class="calculator-result-headline"><span>Best card for you right now</span><strong>Not a rewards card yet</strong><em>Clear the balance first.</em></div>` +
					`<p class="calculator-note calculator-note-callout">Card interest is almost <strong>28% a year</strong>. On a $3,000 balance that's roughly $800 a year, far more than any cashback or miles would give back.</p>` +
					`<p class="calculator-note">Pay off the balance (highest interest first), set up GIRO for the full amount each month, then come back and pick a rewards card.</p>`;
			} else {
				const best = CARDS[result.best];
				const backup = CARDS[result.backup];
				html = `<div class="calculator-result-headline"><span>Best fit for you</span><strong>${best.name}</strong><em>${best.type} card</em></div>` +
					cardHtml(best, "Why it fits", false) + cardHtml(backup, "Also consider", true);
				if (a.spend === "high" && a.style === "optimise") {
					html += `<p class="calculator-note">You spend more than most bonus caps allow. Many people pair a 4 mpd card with a simple card (like DBS Altitude or UOB PRVI Miles) for spending above the cap.</p>`;
				}
				if (a.goal === "miles") {
					html += `<p class="calculator-note">Miles are worth the most when redeemed for flights, especially premium seats. If you'd rather not plan redemptions, cashback is simpler.</p>`;
				}
				html += `<p class="calculator-note">Always pay in full. Check exclusions (insurance, bills, top-ups, government payments usually don't earn rewards) and the bank's latest terms before applying. Figures as of Oct 2026. For education only, not financial advice.</p>`;
			}
			resultBox.innerHTML = html;
			resultBox.hidden = false;
		});
	}

	document.addEventListener("DOMContentLoaded", init);
})();
