(function () {
	function buildNav(root, page) {
		const links = [
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
				<a href="${root}/index.html" class="nav-logo">SS</a>
				<button class="nav-hamburger" id="nav-hamburger" aria-label="Toggle navigation">
					<span></span><span></span><span></span>
				</button>
				<ul class="nav-links" id="nav-links">
					${items}
				</ul>
			</div>
		`;
	}

	function buildFooter() {
		return `
			<div class="container">
				<div class="footer-contact-links">
					<a href="mailto:00shaun.sevilla@gmail.com"><i class="fas fa-envelope"></i>Email</a>
					<a href="https://www.linkedin.com/in/shaunsevilla/" target="_blank" rel="noopener noreferrer"><i class="fab fa-linkedin"></i>LinkedIn</a>
					<a href="https://github.com/ShaunSevilla" target="_blank" rel="noopener noreferrer"><i class="fab fa-github"></i>GitHub</a>
					<a href="https://www.instagram.com/se.villa/" target="_blank" rel="noopener noreferrer"><i class="fab fa-instagram"></i>Instagram</a>
					<a href="https://t.me/ShaunSevilla" target="_blank" rel="noopener noreferrer"><i class="fab fa-telegram"></i>Telegram</a>
					<a href="https://www.tiktok.com/@shaunsevilla?lang=en" target="_blank" rel="noopener noreferrer"><i class="fab fa-tiktok"></i>TikTok</a>
				</div>
				<p>&copy; 2026 <span>Shaun Sevilla</span>. Relentlessly building.</p>
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
			footer.innerHTML = buildFooter();
		}
	});
})();
