// "Send this to a friend": shares a link to the tool (never the person's
// own numbers). Phones get the share sheet; desktops get WhatsApp, Telegram
// and copy-link.
(function () {
	function shareLinks(url, text) {
		const u = encodeURIComponent(url);
		const t = encodeURIComponent(text);
		return `<a href="https://wa.me/?text=${t}%20${u}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` +
			`<a href="https://t.me/share/url?url=${u}&text=${t}" target="_blank" rel="noopener noreferrer">Telegram</a>` +
			`<button type="button" data-copy="${url}">Copy link</button>`;
	}

	// Returns an element: a "Send this to a friend" button that opens the
	// share sheet, or shows the fallback links.
	function shareButton(url, text) {
		const wrap = document.createElement("div");
		wrap.className = "share-friend";
		wrap.innerHTML = `<button type="button" class="share-friend-btn"><i class="fas fa-share" aria-hidden="true"></i> Send this to a friend</button><div class="share-friend-links" hidden>${shareLinks(url, text)}</div><span class="share-friend-status" role="status"></span>`;
		const links = wrap.querySelector(".share-friend-links");
		const status = wrap.querySelector(".share-friend-status");
		wrap.querySelector(".share-friend-btn").addEventListener("click", async function () {
			if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
				try {
					await navigator.share({ title: "Free tool from Shaun Sevilla", text, url });
					return;
				} catch (error) {
					if (error && error.name === "AbortError") return;
				}
			}
			links.hidden = !links.hidden;
		});
		wrap.querySelector("[data-copy]").addEventListener("click", async function (event) {
			try {
				await navigator.clipboard.writeText(event.currentTarget.dataset.copy);
				status.textContent = "Link copied.";
			} catch (error) {
				status.textContent = event.currentTarget.dataset.copy;
			}
		});
		return wrap;
	}

	window.ShareFriend = { shareButton };
})();
