const GH_USER = "ShaunSevilla";
const GH_BASE = "https://api.github.com";

async function fetchJson(url) {
	const res = await fetch(url, {
		headers: {
			Accept: "application/vnd.github.v3+json",
		},
	});
	if (!res.ok) throw new Error("GitHub request failed");
	return res.json();
}

function renderGithubPreview(user, repos) {
	const el = document.getElementById("github-preview");
	if (!el) return;

	const repoHtml = repos
		.map((repo) => {
			const desc = repo.description || "No description";
			return `
				<div class="github-preview-repo">
					<a href="${repo.html_url}" target="_blank" rel="noopener noreferrer">${repo.name}</a>
					<p>${desc}</p>
				</div>
			`;
		})
		.join("");

	el.innerHTML = `
		<div class="github-preview-head">
			<div>
				<h3 class="github-preview-name">${user.name || user.login}</h3>
				<p class="github-preview-handle">@${user.login}</p>
			</div>
		</div>
		<div class="github-preview-meta">
			<span>${user.public_repos} Repos</span>
			<span>${user.followers} Followers</span>
			<span>${user.following} Following</span>
		</div>
		<div class="github-preview-repos">${repoHtml}</div>
	`;
}

async function initGithubPreview() {
	const el = document.getElementById("github-preview");
	if (!el) return;

	try {
		const [user, repos] = await Promise.all([
			fetchJson(`${GH_BASE}/users/${GH_USER}`),
			fetchJson(`${GH_BASE}/users/${GH_USER}/repos?sort=updated&per_page=4`),
		]);
		renderGithubPreview(user, repos);
	} catch (err) {
		el.innerHTML =
			'<p class="github-error">Unable to load GitHub preview right now.</p>';
	}
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initGithubPreview);
} else {
	initGithubPreview();
}
