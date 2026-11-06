(function () {
	function buildNav(root, page) {
		const links = [
			{
				key: "home",
				label: "Home",
				href: `${root}/index.html`,
			},
			{
				key: "booking",
				label: "Book",
				href: `${root}/Pages/booking.html`,
			},
			{
				key: "software",
				label: "Software",
				href: `${root}/Pages/software-development.html`,
			},
			{
				key: "financial",
				label: "Financial",
				href: `${root}/Pages/financial-advisory.html`,
			},
			{
				key: "guide",
				label: "Money Guide",
				href: `${root}/Pages/sg-money-guide.html`,
			},
			{
				key: "fitness",
				label: "Fitness",
				href: `${root}/Pages/fitness-sports.html`,
			},
			{
				key: "contact",
				label: "Contact",
				href: `${root}/Pages/contact.html`,
			},
		];

		const items = links
			.map((link) => {
				const activeClass = link.key === page ? ' class="active"' : "";
				return `<li><a href="${link.href}"${activeClass}>${link.label}</a></li>`;
			})
			.join("");

		return `
			<div class="nav-inner">
				<a href="${root}/index.html" class="nav-logo" aria-label="Shaun Sevilla, home"><img src="${root}/assets/logo/mark-nav.svg" alt="" width="34" height="34" /></a>
				<button class="nav-hamburger" id="nav-hamburger" aria-label="Toggle navigation" aria-controls="nav-links" aria-expanded="false">
					<span></span><span></span><span></span>
				</button>
				<ul class="nav-links" id="nav-links">
					${items}
				</ul>
			</div>
		`;
	}

	const SOCIAL = [
		["mailto:shaun.sevilla@aiafa.com.sg", "fas fa-envelope", "Email"],
		["https://www.linkedin.com/in/shaunsevilla/", "fab fa-linkedin", "LinkedIn"],
		["https://github.com/ShaunSevilla", "fab fa-github", "GitHub"],
		["https://www.instagram.com/se.villa/", "fab fa-instagram", "Instagram"],
		["https://t.me/ShaunSevilla", "fab fa-telegram", "Telegram"],
		["https://www.tiktok.com/@shaunsevilla?lang=en", "fab fa-tiktok", "TikTok"],
	];

	function buildFooter(root) {
		const ext = 'target="_blank" rel="noopener noreferrer"';
		const social = SOCIAL.map(([href, icon, name]) => `<a href="${href}" ${href.startsWith("http") ? ext : ""} aria-label="${name}"><i class="${icon}" aria-hidden="true"></i><b>${name}</b></a>`).join("");
		return `
			<div class="container">
				<div class="footer-tools">
					<span>Free tools</span>
					<a href="${root}/Pages/financial-advisory.html#calculators">Calculators</a>
					<a href="${root}/Pages/money-quiz.html">Money Quiz</a>
					<a href="${root}/Pages/sg-money-guide.html">Money Guide</a>
					<a href="${root}/Pages/market-update.html">Market Update</a>
					<a href="https://t.me/ProsperityPath_bot?start=menu" ${ext}>Telegram Bot</a>
					<a href="${root}/Pages/booking.html">Book a Chat</a>
				</div>
				<div class="footer-contact-links">${social}</div>
				<p class="footer-copy">&copy; 2026 <span>Shaun Sevilla</span>. Relentlessly building.</p>
			</div>
		`;
	}

	document.addEventListener("DOMContentLoaded", function () {
		const body = document.body;
		const root = body.getAttribute("data-root") || ".";
		const page = body.getAttribute("data-page") || "";

		const nav = document.getElementById("site-nav");
		if (nav) {
			nav.innerHTML = buildNav(root, page);
		}

		const footer = document.getElementById("site-footer");
		if (footer) {
			footer.innerHTML = buildFooter(root);
		}
	});
})();
