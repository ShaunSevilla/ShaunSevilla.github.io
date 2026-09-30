// "What's your money persona?" quiz: 15 one-tap questions, 8 personas.
// Website only (the Telegram bot no longer runs the quiz).
// Each answer gives points to one or two personas; the highest total wins
// (ties go to the persona listed first in PERSONA_ORDER).
// The Quiet Millionaire-in-Training is the rare one: it's only on the table
// if you gave the good-habit answer on every question that has a Quiet
// Millionaire option, with one slip allowed. Two slips and the next-highest
// persona wins.
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.MoneyQuiz = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	const PERSONAS = {
		ostrich: {
			emoji: "🙈",
			name: "The Ostrich",
			roast: "Hasn't opened the bank app since NS. If you don't look, it can't hurt you. Right?",
			superpower: "Zero money stress. For now.",
			blindSpot: "Everything. That's kind of the point.",
			tip: "Look once. Just one number: what comes in each month and what goes out.",
			cta: "Too paiseh to look alone? Shaun will look with you. No lectures.",
		},
		grabfood: {
			emoji: "🛵",
			name: "The GrabFood Philanthropist",
			roast: "Single-handedly funding the delivery economy. Your rider knows your unit number by heart.",
			superpower: "You value your time, and that's real.",
			blindSpot: "$25 a day is $750 a month. That's $9,000 a year.",
			tip: "Pick a monthly cap for convenience spending, and move your savings out on payday before it happens.",
			cta: "Curious what the delivery habit is worth by 60? Shaun will run the numbers with you.",
		},
		yolo: {
			emoji: "✈️",
			name: "The YOLO Traveller",
			roast: "Your passport has more stamps than your savings account has dollars. Changi greets you by name.",
			superpower: "You actually enjoy your money.",
			blindSpot: "Future you also wants to travel. At 65.",
			tip: "Save first, automatically, then travel on what's left. Guilt-free.",
			cta: "Want to keep travelling and still retire on time? That's literally Shaun's job.",
		},
		crypto: {
			emoji: "🚀",
			name: "The Crypto Kaki",
			roast: "\"It's a long-term hold.\" It's down 70%. Your portfolio has more red candles than a birthday cake.",
			superpower: "You're not scared of risk.",
			blindSpot: "Putting it all in one place. One bad month can undo years.",
			tip: "Keep a boring core that grows quietly, then have fun with a small slice.",
			cta: "Want a second pair of eyes on your risk? No judgement, just numbers.",
		},
		hoarder: {
			emoji: "🐿️",
			name: "The Kiasu Hoarder",
			roast: "14 bank accounts and still takes the free plastic bag. Your money is very safe. It's also not doing anything.",
			superpower: "You will never go broke.",
			blindSpot: "Cash in the bank quietly loses to inflation every single year.",
			tip: "Keep 6 months of expenses easy to reach, then let the rest actually work.",
			cta: "Want to see what your idle cash could be doing? Book a free chat with Shaun.",
		},
		cpf: {
			emoji: "🏦",
			name: "The CPF Believer",
			roast: "Trusts the government more than your own bank app. Checks your CPF balance for fun.",
			superpower: "Disciplined, guaranteed, sleeps like a baby.",
			blindSpot: "CPF alone may not pay for the retirement you actually want.",
			tip: "Find out your CPF LIFE payout, then plan for the gap.",
			cta: "Want to know your real retirement gap? Shaun can map it with you in one chat.",
		},
		monk: {
			emoji: "📊",
			name: "The Spreadsheet Monk",
			roast: "Has a tab for the tab. Knows every bank's interest rate to two decimal places.",
			superpower: "Nothing slips past you.",
			blindSpot: "Optimising a 0.2% difference while the big decisions wait.",
			tip: "Lock in the three things that really move the needle: protection, investing and housing.",
			cta: "Bring the spreadsheet. Shaun will stress-test it for free.",
		},
		quiet: {
			emoji: "🌱",
			name: "The Quiet Millionaire-in-Training",
			roast: "Boring. Consistent. Winning. You don't talk about money much because it's handled.",
			superpower: "Time is on your side and you know it.",
			blindSpot: "Being on autopilot so long you forget to check the plan still fits.",
			tip: "Do a yearly check-up: protection, investments and goals.",
			cta: "Want a second opinion that the plan holds up? Book a check-up.",
		},
	};

	// How many non-good answers the Quiet Millionaire-in-Training allows.
	const MAX_QUIET_SLIPS = 1;

	const PERSONA_ORDER = ["grabfood", "cpf", "crypto", "yolo", "monk", "hoarder", "quiet", "ostrich"];

	// [question, [[answer, { persona: points }], ...]]
	const QUESTIONS = [
		["Payday hits. First thing you do?", [
			["Move money to savings before I can touch it", { hoarder: 2, quiet: 1 }],
			["Open the bank app and update my spreadsheet", { monk: 2 }],
			["Look at flights. Just looking.", { yolo: 2 }],
			["Payday? I just know my card works again", { ostrich: 2 }],
		]],
		["Your friend says \"confirm huat\" about a new coin. You…", [
			["Already in. Since last month.", { crypto: 2 }],
			["Ask for his source, then do my own homework", { monk: 1, quiet: 1 }],
			["No thanks. CPF pays me 4%, guaranteed.", { cpf: 2 }],
			["What's a coin", { hoarder: 1, cpf: 1 }],
		]],
		["How many subscriptions are you paying for right now?", [
			["1 or 2, and I actually use them", { quiet: 1, monk: 1 }],
			["Honestly? No idea.", { ostrich: 2 }],
			["Netflix, Disney+, Spotify, and the gym I never go to", { grabfood: 2 }],
			["Zero. I use my cousin's login.", { hoarder: 2 }],
		]],
		["Where's your emergency fund?", [
			["Separate account, 6 months, untouchable", { quiet: 2, hoarder: 1 }],
			["It's called my credit limit", { yolo: 2 }],
			["What emergency fund", { ostrich: 2 }],
			["Split across 5 high-interest accounts, optimised", { monk: 2 }],
		]],
		["It's 10pm and you're hungry. You…", [
			["GrabFood. The delivery fee is fine.", { grabfood: 2 }],
			["Walk down to the kopitiam", { quiet: 1, hoarder: 1 }],
			["Maggi mee. Budget is budget.", { hoarder: 2 }],
			["Whatever the promo code says", { grabfood: 1, monk: 1 }],
		]],
		["Someone mentions \"dollar-cost averaging\". You…", [
			["Doing it every month. Automated.", { quiet: 2 }],
			["Sounds like a scam", { cpf: 2 }],
			["Nod and pretend I know", { ostrich: 2 }],
			["Nah, I buy the dip. With leverage.", { crypto: 2 }],
		]],
		["Your retirement plan?", [
			["CPF LIFE and chill", { cpf: 2 }],
			["Retire at 40 off my portfolio", { crypto: 1, quiet: 1 }],
			["I'll figure it out at 60", { ostrich: 1, yolo: 1 }],
			["I've calculated my FIRE number. Twice.", { monk: 2 }],
		]],
		["A friend's wedding. Your angbao is…", [
			["Checked the angbao rate for that hotel first", { monk: 2 }],
			["Whatever's in my wallet lah", { ostrich: 1, yolo: 1 }],
			["The bare minimum. They'll understand.", { hoarder: 2 }],
			["Generous. Life is short.", { yolo: 2 }],
		]],
		["Your phone is 3 years old and works fine. The new model drops.", [
			["Using mine till it dies", { hoarder: 1, quiet: 1 }],
			["Pre-ordered already", { grabfood: 2 }],
			["Waiting for the trade-in promo", { monk: 2 }],
			["0% instalments, why not", { grabfood: 1, ostrich: 1 }],
		]],
		["How do you feel when you check your bank balance?", [
			["Calm. It's going up.", { quiet: 2 }],
			["I don't check. Ignorance is bliss.", { ostrich: 2 }],
			["Depends what the market did today", { crypto: 2 }],
			["Happy. It's in places I trust.", { cpf: 2 }],
		]],
		["It's the weekend and you have $200 spare.", [
			["Staycation, obviously", { yolo: 2 }],
			["Invest it, then do something free", { quiet: 1, hoarder: 1 }],
			["Brunch, bubble tea, dinner, dessert", { grabfood: 2 }],
			["Into a new token", { crypto: 2 }],
		]],
		["Your insurance situation?", [
			["Reviewed it recently, I know what I'm covered for", { quiet: 2 }],
			["My company covers me… right?", { ostrich: 2 }],
			["My mum bought something when I was a kid", { cpf: 1, ostrich: 1 }],
			["I'll self-insure with my portfolio", { crypto: 2 }],
		]],
		["Your most-used money app?", [
			["Excel. Colour-coded.", { monk: 2 }],
			["The Grab app, if we're being honest", { grabfood: 2 }],
			["The CPF app, I check it for fun", { cpf: 2 }],
			["My trading app, notifications on", { crypto: 2 }],
		]],
		["50% off something you don't need.", [
			["50% off is still 100% spent", { hoarder: 1, quiet: 1 }],
			["Added to cart. Plus a few other things.", { grabfood: 2 }],
			["Compare prices on 3 sites first", { monk: 2 }],
			["Didn't see it, I don't open emails", { ostrich: 1, cpf: 1 }],
		]],
		["Someone hands you $10,000 today. You…", [
			["Top up my CPF. Safe and guaranteed.", { cpf: 2 }],
			["Japan. Business class. Maybe.", { yolo: 2 }],
			["Emergency fund first, then invest the rest", { quiet: 2 }],
			["Leave it in the bank and sleep well", { hoarder: 2 }],
		]],
	];

	// answers: array of chosen option indexes (0-3), one per question.
	function score(answers) {
		const totals = {};
		PERSONA_ORDER.forEach((key) => { totals[key] = 0; });
		(answers || []).forEach((choice, index) => {
			const question = QUESTIONS[index];
			const option = question && question[1][choice];
			if (!option) return;
			Object.entries(option[1]).forEach(([key, points]) => { totals[key] += points; });
		});
		// Quiet Millionaire needs the good-habit answer on every question that
		// has one, with at most one slip. If they slipped, that one answer
		// decides the runner-up ("with a pinch of ... in me").
		const slips = [];
		QUESTIONS.forEach((question, index) => {
			const hasGoodAnswer = question[1].some((option) => option[1].quiet);
			if (!hasGoodAnswer) return;
			const option = question[1][(answers || [])[index]];
			if (!option || !option[1].quiet) slips.push(option ? option[1] : {});
		});
		const earnedQuiet = slips.length <= MAX_QUIET_SLIPS;
		const byScore = (a, b) => totals[b] - totals[a] || PERSONA_ORDER.indexOf(a) - PERSONA_ORDER.indexOf(b);
		let top;
		let second;
		if (earnedQuiet) {
			top = "quiet";
			const slipKeys = slips.length ? Object.keys(slips[0]).filter((key) => key !== "quiet") : [];
			const pool = slipKeys.length ? slipKeys : PERSONA_ORDER.filter((key) => key !== "quiet");
			second = pool.slice().sort(byScore)[0];
		} else {
			const ranked = PERSONA_ORDER.filter((key) => key !== "quiet").sort(byScore);
			top = ranked[0];
			second = ranked[1];
		}
		const runnerUp = totals[second] > 0 ? second : null;
		return { key: top, rare: top === "quiet", persona: PERSONAS[top], runnerUp, runnerUpPersona: runnerUp ? PERSONAS[runnerUp] : null, totals };
	}

	// "With a little bit of ... in me": worded by how close the second-highest
	// persona came to the winner.
	//   85%+ of the winner's score  -> "With a lot of X in me too."
	//   50% to 85%                  -> "With a little bit of X in me."
	//   under 50%                   -> "With a pinch of X in me."
	function runnerUpLine(result) {
		if (!result || !result.runnerUpPersona) return "";
		const top = result.totals[result.key] || 0;
		const closeness = top > 0 ? result.totals[result.runnerUp] / top : 0;
		const who = `${result.runnerUpPersona.emoji} ${result.runnerUpPersona.name}`;
		if (closeness >= 0.85) return `With a lot of ${who} in me too.`;
		if (closeness >= 0.5) return `With a little bit of ${who} in me.`;
		return `With a pinch of ${who} in me.`;
	}

	return { PERSONAS, PERSONA_ORDER, QUESTIONS, score, runnerUpLine };
});
