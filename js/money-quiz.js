// Money Persona Quiz page. Questions, personas and scoring live in
// js/shared/moneyQuiz.js (the same file the Telegram bot uses).
(function () {
	const Quiz = window.MoneyQuiz;
	if (!Quiz) return;

	const PAGE_URL = "https://shaunsevilla.github.io/Pages/money-quiz.html";
	const $ = (id) => document.getElementById(id);
	const intro = $("quiz-intro");
	const questionBox = $("quiz-question");
	const resultBox = $("quiz-result");
	let answers = [];
	let current = 0;
	let lastResult = null;

	function show(section) {
		[intro, questionBox, resultBox].forEach((el) => { el.hidden = el !== section; });
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	function renderQuestion() {
		const [text, options] = Quiz.QUESTIONS[current];
		$("quiz-count").textContent = `Question ${current + 1} of ${Quiz.QUESTIONS.length}`;
		$("quiz-progress-bar").style.width = `${(current / Quiz.QUESTIONS.length) * 100}%`;
		$("quiz-text").textContent = text;
		const list = $("quiz-options");
		list.innerHTML = "";
		options.forEach(([label], index) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "quiz-option";
			button.textContent = label;
			if (answers[current] === index) button.classList.add("selected");
			button.addEventListener("click", () => choose(index));
			list.appendChild(button);
		});
		$("quiz-back").hidden = current === 0;
	}

	function choose(index) {
		answers[current] = index;
		if (current < Quiz.QUESTIONS.length - 1) {
			current += 1;
			renderQuestion();
		} else {
			showResult();
		}
	}

	// Persona illustrations live in assets/quiz/<key>.webp.
	function artFor(key) {
		return `../assets/quiz/${key}.webp`;
	}

	// Load all eight up front so the result appears with its picture.
	Object.keys(Quiz.PERSONAS).forEach((key) => {
		new Image().src = artFor(key);
	});

	function showResult() {
		lastResult = Quiz.score(answers);
		const persona = lastResult.persona;
		const art = $("quiz-art");
		art.src = artFor(lastResult.key);
		art.alt = persona.name;
		$("quiz-name").textContent = persona.name;
		$("quiz-roast").textContent = persona.roast;
		$("quiz-superpower").textContent = persona.superpower;
		$("quiz-blindspot").textContent = persona.blindSpot;
		$("quiz-tip").textContent = persona.tip;
		$("quiz-runner").textContent = lastResult.runnerUpPersona ? `With a little bit of ${lastResult.runnerUpPersona.emoji} ${lastResult.runnerUpPersona.name} in me.` : "";
		$("quiz-cta").textContent = persona.cta;
		const notes = `Took the money persona quiz: ${persona.name}. ${persona.blindSpot}`;
		$("quiz-book").href = `booking.html?${new URLSearchParams({ topic: "Money persona", notes }).toString()}`;
		$("quiz-share-status").textContent = "";
		show(resultBox);
	}

	function start() {
		answers = [];
		current = 0;
		renderQuestion();
		show(questionBox);
	}

	async function share() {
		const persona = lastResult.persona;
		const url = `${PAGE_URL}?r=${lastResult.key}`;
		const text = `I got ${persona.emoji} ${persona.name}. What's your money persona?`;
		try {
			if (navigator.share) {
				await navigator.share({ title: "What's your money persona?", text, url });
				return;
			}
			await navigator.clipboard.writeText(`${text} ${url}`);
			$("quiz-share-status").textContent = "Link copied. Paste it to a friend.";
		} catch (error) {
			$("quiz-share-status").textContent = `Copy this: ${url}`;
		}
	}

	// A link shared from a result (?r=monk) shows who sent it.
	const shared = new URLSearchParams(window.location.search).get("r");
	if (shared && Quiz.PERSONAS[shared]) {
		const persona = Quiz.PERSONAS[shared];
		const friend = $("quiz-friend");
		friend.innerHTML = "";
		const img = document.createElement("img");
		img.src = artFor(shared);
		img.alt = "";
		img.className = "quiz-friend-art";
		friend.append(img, `Your friend got ${persona.name}. Your turn.`);
		friend.hidden = false;
	}

	$("quiz-start").addEventListener("click", start);
	$("quiz-restart").addEventListener("click", start);
	$("quiz-share").addEventListener("click", share);
	$("quiz-back").addEventListener("click", () => {
		if (current > 0) {
			current -= 1;
			renderQuestion();
		}
	});
})();
