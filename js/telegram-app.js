// Telegram Mini App mode. The bot opens app.html inside Telegram; from there
// every page the person visits stays in "app mode" for the session: no site
// nav or footer, Telegram's own back button, their name and @username filled
// in on the booking form, and Telegram links opened natively. Normal visitors
// never load Telegram's script and see the site as usual.
(function () {
	const KEY = "tgapp";
	const params = new URLSearchParams(window.location.search);
	let inApp = false;
	try {
		if (params.get("tg") === "1") window.sessionStorage.setItem(KEY, "1");
		inApp = window.sessionStorage.getItem(KEY) === "1";
	} catch (error) {
		inApp = params.get("tg") === "1";
	}
	const isHub = document.body && document.body.dataset.page === "app";
	if (!inApp && !isHub) return;

	const root = (document.body && document.body.dataset.root) || ".";
	if (!isHub) document.documentElement.classList.add("in-telegram");

	function setup() {
		const tg = window.Telegram && window.Telegram.WebApp;
		if (!tg || !tg.initData) {
			// Opened in a normal browser: show the site as usual.
			document.documentElement.classList.remove("in-telegram");
			return;
		}
		try {
			window.sessionStorage.setItem(KEY, "1");
		} catch (error) {
			// Storage blocked: app mode only lasts for this page.
		}
		document.documentElement.classList.add("in-telegram");
		tg.ready();
		tg.expand();
		try {
			tg.setHeaderColor("#080808");
			tg.setBackgroundColor("#080808");
		} catch (error) {
			// Older Telegram versions: colours stay default.
		}

		const user = tg.initDataUnsafe && tg.initDataUnsafe.user;
		if (isHub) {
			const hello = document.getElementById("mini-app-hello");
			if (hello && user && user.first_name) hello.textContent = `Hi ${user.first_name}.`;
		} else {
			tg.BackButton.show();
			tg.BackButton.onClick(function () {
				if (document.referrer) window.history.back();
				else window.location.href = `${root}/app.html`;
			});
		}

		// Booking: fill in who they are from Telegram.
		const form = document.getElementById("booking-form");
		if (form && user) {
			const fill = function () {
				if (!form.elements.name.value) form.elements.name.value = [user.first_name, user.last_name].filter(Boolean).join(" ");
				if (user.username && !form.elements.contact.value) form.elements.contact.value = `@${user.username}`;
			};
			fill();
			window.setTimeout(fill, 600);
		}

		// Links that leave the app open natively instead of inside the web view.
		document.addEventListener("click", function (event) {
			const link = event.target.closest && event.target.closest("a[href]");
			if (!link) return;
			const href = link.href;
			if (/^https:\/\/t\.me\//.test(href)) {
				event.preventDefault();
				tg.openTelegramLink(href);
			} else if (link.target === "_blank" && /^https?:/.test(href)) {
				event.preventDefault();
				tg.openLink(href);
			}
		});
	}

	if (window.Telegram && window.Telegram.WebApp) {
		setup();
	} else {
		const script = document.createElement("script");
		script.src = "https://telegram.org/js/telegram-web-app.js";
		script.onload = setup;
		script.onerror = function () {
			document.documentElement.classList.remove("in-telegram");
		};
		document.head.appendChild(script);
	}
})();
