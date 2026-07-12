document.addEventListener("DOMContentLoaded", function () {
	const hamburger = document.getElementById("nav-hamburger");
	const navLinks = document.getElementById("nav-links");

	if (!hamburger || !navLinks) return;

	function closeMenu() {
		navLinks.classList.remove("open");
		hamburger.setAttribute("aria-expanded", "false");
	}

	hamburger.addEventListener("click", function (event) {
		event.stopPropagation();
		navLinks.classList.toggle("open");
		hamburger.setAttribute(
			"aria-expanded",
			String(navLinks.classList.contains("open")),
		);
	});

	navLinks.querySelectorAll("a").forEach(function (link) {
		link.addEventListener("click", closeMenu);
	});

	document.addEventListener("click", function (event) {
		if (!hamburger.contains(event.target) && !navLinks.contains(event.target)) {
			closeMenu();
		}
	});

	document.addEventListener("keydown", function (event) {
		if (event.key === "Escape") {
			closeMenu();
			hamburger.focus();
		}
	});
});
