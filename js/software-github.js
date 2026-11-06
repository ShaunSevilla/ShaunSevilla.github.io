// Live GitHub card on the software page. Everything from the API is escaped,
// and any failure falls back to a plain link, never "undefined".
(function () {
	const USER = "ShaunSevilla";
	const PROFILE = `https://github.com/${USER}`;
	const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
	const safeUrl = (u) => (/^https:\/\/github\.com\//.test(u || "") ? u : PROFILE);
	const month = (iso) => {
		const d = new Date(iso);
		return isNaN(d) ? "" : d.toLocaleDateString("en-SG", { month: "short", year: "numeric" });
	};

	async function getJson(path) {
		const res = await fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json" } });
		if (!res.ok) throw new Error(`GitHub ${res.status}`);
		return res.json();
	}

	function render(el, user, repos) {
		const list = repos
			.map((r) => {
				const updated = month(r.pushed_at || r.updated_at);
				const desc = r.description || [r.language, updated && `Updated ${updated}`].filter(Boolean).join(" · ");
				return `<div class="github-preview-repo"><a href="${esc(safeUrl(r.html_url))}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a><p>${esc(desc)}</p></div>`;
			})
			.join("");
		const count = Number.isFinite(user.public_repos) ? `<span>${user.public_repos} public repos</span>` : "";
		el.innerHTML = `
			<div class="github-preview-head"><div>
				<h3 class="github-preview-name">${esc(user.name || user.login || USER)}</h3>
				<p class="github-preview-handle">@${esc(user.login || USER)}</p>
			</div></div>
			<div class="github-preview-meta">${count}<a href="${PROFILE}" target="_blank" rel="noopener noreferrer">View on GitHub &rarr;</a></div>
			<div class="github-preview-repos">${list}</div>`;
	}

	async function init() {
		const el = document.getElementById("github-preview");
		if (!el) return;
		try {
			const [user, repos] = await Promise.all([getJson(`/users/${USER}`), getJson(`/users/${USER}/repos?sort=updated&per_page=4`)]);
			if (!user || typeof user !== "object" || !Array.isArray(repos)) throw new Error("Unexpected GitHub response");
			render(el, user, repos);
		} catch {
			el.innerHTML = `<p class="github-error">See my latest code on <a href="${PROFILE}" target="_blank" rel="noopener noreferrer">GitHub &rarr;</a></p>`;
		}
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
