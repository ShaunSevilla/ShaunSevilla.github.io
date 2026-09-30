// Draws the Money Persona result as a 1080x1920 story image (the size
// Instagram and TikTok stories use), in the site's black-and-gold look.
// window.QuizCard.render({ art, name, runner, roast, superpower, blindSpot,
// rare }) resolves to a PNG Blob.
(function () {
	const W = 1080;
	const H = 1920;
	const GOLD = "#c9a84c";
	const GOLD_SOFT = "rgba(201, 168, 76, 0.14)";
	const TEXT = "#f0f0f0";
	const MUTED = "#8f8f8f";
	const SERIF = '"Cormorant Garamond", Georgia, serif';
	const SANS = '"Inter", "Helvetica Neue", Arial, sans-serif';
	const SITE = "shaunsevilla.github.io/Pages/money-quiz.html";

	function loadImage(src) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
	}

	// Splits text into lines that fit maxWidth at the context's current font.
	function wrap(ctx, text, maxWidth) {
		const words = String(text || "").split(/\s+/).filter(Boolean);
		const lines = [];
		let line = "";
		words.forEach((word) => {
			const test = line ? `${line} ${word}` : word;
			if (ctx.measureText(test).width > maxWidth && line) {
				lines.push(line);
				line = word;
			} else {
				line = test;
			}
		});
		if (line) lines.push(line);
		return lines;
	}

	function drawLines(ctx, lines, x, y, lineHeight) {
		lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
		return y + lines.length * lineHeight;
	}

	function spaced(ctx, text, x, y, spacing) {
		// Letter-spaced caps, centred on x (canvas letterSpacing isn't everywhere yet).
		const chars = text.split("");
		const width = chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
		let cursor = x - width / 2;
		const align = ctx.textAlign;
		ctx.textAlign = "left";
		chars.forEach((c) => {
			ctx.fillText(c, cursor, y);
			cursor += ctx.measureText(c).width + spacing;
		});
		ctx.textAlign = align;
	}

	// Draws everything; returns where the body text ends (above the footer).
	function draw(ctx, art, data, box, shift) {

		// Background: near-black with a soft gold glow behind the character.
		ctx.fillStyle = "#0a0a0a";
		ctx.fillRect(0, 0, W, H);
		const glow = ctx.createRadialGradient(W / 2, 640, 40, W / 2, 640, 620);
		glow.addColorStop(0, "rgba(201, 168, 76, 0.22)");
		glow.addColorStop(1, "rgba(201, 168, 76, 0)");
		ctx.fillStyle = glow;
		ctx.fillRect(0, 0, W, H);

		// Gold frame.
		ctx.strokeStyle = GOLD;
		ctx.lineWidth = 3;
		ctx.strokeRect(54, 54, W - 108, H - 108);

		ctx.textAlign = "center";
		ctx.textBaseline = "alphabetic";

		// Label.
		ctx.fillStyle = MUTED;
		ctx.font = `500 30px ${SANS}`;
		spaced(ctx, "MY MONEY PERSONA IS", W / 2, 190 + shift, 7);

		// Character, fitted into a box x box square.
		const scale = Math.min(box / art.width, box / art.height);
		const aw = art.width * scale;
		const ah = art.height * scale;
		ctx.drawImage(art, (W - aw) / 2, 250 + shift + (box - ah) / 2, aw, ah);

		let y = 250 + shift + box + 60;

		// "Rarest result" pill.
		if (data.rare) {
			ctx.font = `500 26px ${SANS}`;
			const label = "RAREST RESULT";
			const pillW = 330;
			const pillH = 56;
			ctx.fillStyle = GOLD_SOFT;
			ctx.strokeStyle = GOLD;
			ctx.lineWidth = 2;
			ctx.beginPath();
			if (ctx.roundRect) {
				ctx.roundRect((W - pillW) / 2, y - 40, pillW, pillH, pillH / 2);
			} else {
				ctx.rect((W - pillW) / 2, y - 40, pillW, pillH);
			}
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = GOLD;
			spaced(ctx, label, W / 2, y - 3, 6);
			y += 80;
		}

		// Persona name.
		ctx.fillStyle = GOLD;
		let nameSize = 104;
		let nameLines;
		for (;;) {
			ctx.font = `600 ${nameSize}px ${SERIF}`;
			nameLines = wrap(ctx, data.name, W - 220);
			const widest = Math.max(...nameLines.map((line) => ctx.measureText(line).width));
			if ((widest <= W - 220 && nameLines.length <= 2) || nameSize <= 64) break;
			nameSize -= 6;
		}
		y = drawLines(ctx, nameLines, W / 2, y + nameSize * 0.4, nameSize);

		// Runner-up, right under the name.
		if (data.runner) {
			ctx.fillStyle = MUTED;
			ctx.font = `italic 400 36px ${SANS}`;
			y = drawLines(ctx, wrap(ctx, data.runner, W - 220), W / 2, y + 16, 48);
		}

		// Roast.
		ctx.fillStyle = TEXT;
		ctx.font = `400 40px ${SANS}`;
		y = drawLines(ctx, wrap(ctx, data.roast, W - 240), W / 2, y + 50, 58);

		// Superpower / blind spot.
		const left = 150;
		const traitWidth = W - left * 2;
		ctx.textAlign = "left";
		y += 50;
		[["SUPERPOWER", data.superpower], ["BLIND SPOT", data.blindSpot]].forEach(([label, text]) => {
			ctx.fillStyle = GOLD;
			ctx.font = `500 26px ${SANS}`;
			ctx.fillText(label.split("").join(String.fromCharCode(8202)), left, y);
			ctx.fillStyle = TEXT;
			ctx.font = `400 36px ${SANS}`;
			y = drawLines(ctx, wrap(ctx, text, traitWidth), left, y + 50, 50) + 34;
		});

		const contentBottom = y;

		// Footer call to action.
		ctx.textAlign = "center";
		ctx.fillStyle = GOLD;
		ctx.font = `600 70px ${SERIF}`;
		ctx.fillText("What's yours?", W / 2, H - 190);
		ctx.fillStyle = MUTED;
		ctx.font = `400 30px ${SANS}`;
		ctx.fillText(SITE, W / 2, H - 130);

		return contentBottom;
	}

	async function render(data) {
		if (document.fonts && document.fonts.load) {
			await Promise.all([
				document.fonts.load(`600 100px ${SERIF}`),
				document.fonts.load(`400 40px ${SANS}`),
				document.fonts.load(`500 40px ${SANS}`),
				document.fonts.load(`italic 400 40px ${SANS}`),
			]).catch(() => {});
		}
		const art = await loadImage(data.art);

		const canvas = document.createElement("canvas");
		canvas.width = W;
		canvas.height = H;
		const ctx = canvas.getContext("2d");

		// Long names or roasts shrink the character until everything fits
		// above the footer.
		const footerTop = H - 270;
		let box = 640;
		let bottom = draw(ctx, art, data, box, 0);
		while (bottom > footerTop && box > 360) {
			box -= 40;
			bottom = draw(ctx, art, data, box, 0);
		}
		// Short results: centre the content in the space above the footer.
		const spare = footerTop - bottom;
		if (spare > 40) draw(ctx, art, data, box, Math.round(spare / 2) - 20);

		return new Promise((resolve, reject) => {
			canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
		});
	}

	window.QuizCard = { render };
})();
