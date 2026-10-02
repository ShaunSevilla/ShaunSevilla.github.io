// Credit card finder: a few questions, then every card scored for this
// person, with why it fits (or doesn't), pros and cons. Card facts as of
// Oct 2026, cross-checked across bank sites, MoneySmart, SingSaver, SGFI and
// MileLion; keep in line with the bot's credit card picks (staticContent.js).
(function () {
	const CARDS = [
		{
			key: "absolute", name: "UOB Absolute Cashback", type: "cash", simple: true, minSpend: 0, minIncome: 30000,
			facts: "1.7% cashback on almost everything, no minimum spend, no cap. Fee $196.20/yr, first year usually waived.",
			pros: ["Same 1.7% on nearly every purchase", "No minimum spend and no cap", "Nothing to track"],
			cons: ["Lower rate than category cards if you can hit their minimums", "Only 0.3% on bills, insurance and other usual exclusions", "Annual fee after the first year"],
			strengths: ["mix"],
		},
		{
			key: "liveFresh", name: "DBS Live Fresh", type: "cash", simple: false, minSpend: 800, minIncome: 30000,
			facts: "6% on online and mobile contactless spend with $800/month spend. Cap $70/month ($50 shopping + $20 transport). Fee $196.20/yr.",
			pros: ["6% is among the highest cashback rates", "Covers both online shopping and tapping your phone"],
			cons: ["Needs $800 every month, or it drops to 0.3%", "Capped at $70/month, so spend above about $1,200 earns little extra"],
			strengths: ["online", "contactless"],
		},
		{
			key: "ocbc365", name: "OCBC 365", type: "cash", simple: false, minSpend: 800, minIncome: 30000,
			facts: "5% dining, 6% petrol, 3% groceries and transport with $800/month spend. Cap $80/month ($160 at $1,600). Fee $196.20/yr.",
			pros: ["5% on dining, every day of the week", "6% on petrol if you drive", "Higher cap if you spend $1,600"],
			cons: ["Needs $800 every month", "Only 0.3% outside its categories"],
			strengths: ["dining"],
		},
		{
			key: "uobOne", name: "UOB One", type: "cash", simple: false, minSpend: 600, minIncome: 30000,
			facts: "3.33% back: $60 a quarter at $600/month, $100 at $1,000, $200 at $2,000. Needs 10 transactions every month. Extra on Grab, Shopee, McDonald's and groceries.",
			pros: ["Good rate on almost all spending", "Bonus cashback on Grab, Shopee, McDonald's and groceries"],
			cons: ["Miss the spend or 10 transactions in any month and you lose that quarter's cashback", "Paid quarterly, and works best at exactly $600, $1,000 or $2,000"],
			strengths: ["mix"],
		},
		{
			key: "altitude", name: "DBS Altitude", type: "miles", simple: true, minSpend: 0, minIncome: 30000,
			facts: "1.3 miles per $1 locally, 2.2 overseas. No minimum spend, points never expire. Fee $196.20/yr, first year usually waived.",
			pros: ["Points never expire, so you can collect slowly", "Earns on almost everything", "2.2 miles per $1 overseas"],
			cons: ["1.3 locally is low next to 4 mpd cards", "A fee each time you convert points to miles"],
			strengths: ["mix"],
			travel: 0.5,
		},
		{
			key: "prvi", name: "UOB PRVI Miles", type: "miles", simple: true, minSpend: 0, minIncome: 30000,
			facts: "1.4 miles per $1 locally, 2.4 overseas, up to 8 on selected hotel bookings. Fee $261.60/yr, first year usually waived.",
			pros: ["Highest rate among simple miles cards", "Strong overseas, up to 3 mpd in some Southeast Asian countries"],
			cons: ["Higher annual fee", "Points expire after 2 years"],
			strengths: ["mix"],
			travel: 1,
		},
		{
			key: "womansWorld", name: "DBS Woman's World Card", type: "miles", simple: false, minSpend: 0, minIncome: 80000,
			facts: "4 miles per $1 on online spend, cap $1,000/month. Open to men too. Fee $196.20/yr.",
			pros: ["4 mpd on almost any online spend", "Generous $1,000 monthly cap"],
			cons: ["Needs $80,000 annual income", "Only 0.4 mpd on in-store spend"],
			strengths: ["online"],
		},
		{
			key: "citiRewards", name: "Citi Rewards", type: "miles", simple: false, minSpend: 0, minIncome: 30000,
			facts: "4 miles per $1 on online spend (and some in-store shopping), cap $1,000/statement month. Fee $196.20/yr.",
			pros: ["4 mpd online with only $30,000 income needed", "Points last up to 5 years"],
			cons: ["No bonus on travel bookings or in-app wallet payments", "0.4 mpd on everything else"],
			strengths: ["online"],
		},
		{
			key: "preferredVisa", name: "UOB Preferred Visa", type: "miles", simple: false, minSpend: 0, minIncome: 30000,
			facts: "4 miles per $1 on mobile contactless, plus a separate 4 mpd on selected online categories. Cap $600/month each. Fee $196.20/yr.",
			pros: ["4 mpd when you tap your phone in shops", "Two separate caps, up to $1,200 a month of bonus spend"],
			cons: ["$600 caps fill quickly", "Category rules (MCCs) decide what counts", "0.4 mpd otherwise"],
			strengths: ["contactless", "online"],
		},
		{
			key: "revolution", name: "HSBC Revolution", type: "miles", simple: false, minSpend: 0, minIncome: 30000,
			facts: "4 miles per $1 on dining, air tickets, hotels, contactless and selected online spend. Cap $1,000/month. Usually no annual fee.",
			pros: ["Widest set of 4 mpd categories", "Usually no annual fee"],
			cons: ["$1,000 monthly cap", "Exclusions matter, check what counts", "0.4 mpd otherwise"],
			strengths: ["dining", "contactless", "online", "mix"],
		},
	];

	const SPEND = { low: 500, mid: 700, upper: 1100, high: 2000 };
	const INCOME = { "": null, under30: 25000, mid: 50000, over80: 90000 };

	function score(card, a) {
		const income = INCOME[a.income];
		const spend = SPEND[a.spend];
		const fits = [];
		const misses = [];
		let s = 0;
		if (income !== null && income < card.minIncome) {
			return { card, s: -100, eligible: false, fits, misses: [`Needs at least $${card.minIncome.toLocaleString("en-SG")} a year in income`] };
		}
		if ((a.goal === "cash") === (card.type === "cash")) { s += 4; fits.push(a.goal === "cash" ? "Gives cashback, which is what you want" : "Earns miles, which is what you want"); }
		else { s -= 4; misses.push(card.type === "cash" ? "Cashback, not miles" : "Miles, not cashback"); }
		if (card.minSpend > 0) {
			if (spend >= card.minSpend) { s += 1; fits.push(`You spend enough to hit its $${card.minSpend}/month minimum`); }
			else { s -= 4; misses.push(`Needs $${card.minSpend}/month; you'd usually fall short and earn only 0.3%`); }
		}
		if (card.strengths.includes(a.where)) { s += 2; fits.push(a.where === "mix" ? "Earns well across mixed spending" : "Its bonus matches where most of your money goes"); }
		else if (!card.simple) { s -= 1; misses.push("Its bonus categories don't match where you spend most"); }
		if (a.style === "simple") {
			if (card.simple) { s += 2; fits.push("Simple, nothing to track"); }
			else { s -= 2; misses.push("Needs you to track categories, caps or minimums"); }
		} else if (!card.simple) { s += 1; fits.push("Rewards the tracking you're happy to do"); }
		if (a.travel === "often" && card.travel) { s += card.travel * 2; fits.push("Earns more on overseas spending"); }
		if (a.spend === "high" && !card.simple && card.type === "miles") { misses.push("You'll pass the cap; pair it with a simple card for the rest"); }
		return { card, s, eligible: true, fits, misses };
	}

	const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
	const list = (items) => `<ul class="calculator-note-list">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

	function cardDetail(r, label) {
		const c = r.card;
		return `<div class="card-pick"><span class="card-pick-label">${label} · ${c.type === "cash" ? "Cashback" : "Miles"}</span><strong>${c.name}</strong><p>${c.facts}</p>` +
			(r.fits.length ? `<p class="card-pick-sub">Why it fits you</p>${list(r.fits)}` : "") +
			(r.misses.length ? `<p class="card-pick-sub">Watch out</p>${list(r.misses)}` : "") +
			`<div class="card-pick-procon"><div><p class="card-pick-sub">Pros</p>${list(c.pros)}</div><div><p class="card-pick-sub">Cons</p>${list(c.cons)}</div></div></div>`;
	}

	function init() {
		const form = document.getElementById("cards-form");
		const resultBox = document.getElementById("cards-result");
		if (!form || !resultBox) return;
		const value = (id) => document.getElementById(id).value;
		form.addEventListener("submit", function (event) {
			event.preventDefault();
			const a = { payFull: value("cards-payfull"), goal: value("cards-goal"), spend: value("cards-spend"), where: value("cards-where"), style: value("cards-style"), travel: value("cards-travel"), income: value("cards-income") };
			let html;
			if (a.payFull === "no") {
				html = `<div class="calculator-result-headline"><span>Best card for you right now</span><strong>Not a rewards card yet</strong><em>Clear the balance first.</em></div>` +
					`<p class="calculator-note calculator-note-callout">Card interest is almost <strong>28% a year</strong>. On a $3,000 balance that's roughly $800 a year, far more than any cashback or miles would give back.</p>` +
					`<p class="calculator-note">Pay off the balance (highest interest first), set up GIRO for the full amount each month, then come back and pick a rewards card.</p>`;
			} else if (a.income === "under30") {
				html = `<div class="calculator-result-headline"><span>Best card for you right now</span><strong>A debit card, for now</strong><em>Most credit cards need $30,000 a year.</em></div>` +
					`<p class="calculator-note">Banks generally need at least <strong>$30,000 a year</strong> in income for a credit card (more for foreigners). Until then, a debit card with cashback or a multi-currency card for travel gets you some of the benefit without the debt risk.</p>` +
					`<p class="calculator-note">Once you pass $30,000, come back: UOB Absolute Cashback or DBS Altitude are easy first cards.</p>`;
			} else {
				const ranked = CARDS.map((card) => score(card, a)).sort((x, y) => y.s - x.s);
				const eligible = ranked.filter((r) => r.eligible);
				const best = eligible[0];
				const backup = eligible[1];
				html = `<div class="calculator-result-headline"><span>Best fit for you</span><strong>${best.card.name}</strong><em>${best.card.type === "cash" ? "Cashback" : "Miles"} card</em></div>` +
					cardDetail(best, "Top pick") + cardDetail(backup, "Also consider");
				html += `<details class="card-all"><summary>See how all ${CARDS.length} cards compare for you</summary>`;
				ranked.forEach((r, i) => {
					html += `<div class="card-all-row${r.eligible ? "" : " card-all-out"}"><div class="card-all-head"><strong>${i + 1}. ${r.card.name}</strong><span>${r.eligible ? (r.s >= 6 ? "Strong fit" : r.s >= 2 ? "Decent fit" : "Weak fit") : "Not eligible"}</span></div>` +
						`<p>${esc(r.card.facts)}</p>` +
						(r.fits.length ? `<p><em>Fits:</em> ${esc(r.fits.join("; "))}.</p>` : "") +
						(r.misses.length ? `<p><em>Doesn't fit:</em> ${esc(r.misses.join("; "))}.</p>` : "") +
						`<p><em>Pros:</em> ${esc(r.card.pros.join("; "))}. <em>Cons:</em> ${esc(r.card.cons.join("; "))}.</p></div>`;
				});
				html += `</details>`;
				if (a.income === "") {
					html += `<p class="calculator-note">No income given, so every card is shown. Most need $30,000 a year; DBS Woman's World needs $80,000, and foreigners usually need more.</p>`;
				}
				html += `<p class="calculator-note">Always pay in full. Exclusions (insurance, bills, top-ups, government payments) usually don't earn rewards. Figures as of Oct 2026; check the bank's latest terms before applying. For education only, not financial advice.</p>`;
			}
			resultBox.innerHTML = html;
			resultBox.hidden = false;
		});
	}

	document.addEventListener("DOMContentLoaded", init);
})();
