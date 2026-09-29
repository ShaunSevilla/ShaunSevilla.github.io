// "Tap to copy" links (e.g. a Discord username, which has no web link).
document.addEventListener("click", function (event) {
	const trigger = event.target.closest("[data-copy]");
	if (!trigger) return;
	event.preventDefault();
	const value = trigger.getAttribute("data-copy");
	const feedback = trigger.querySelector("[data-copy-feedback]");
	const done = function () {
		if (!feedback) return;
		feedback.textContent = "Copied!";
		window.setTimeout(function () {
			feedback.textContent = value;
		}, 1600);
	};
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(value).then(done, done);
	} else {
		done();
	}
});

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
