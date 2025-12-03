// GitHub API Integration
const GITHUB_USERNAME = "ShaunSevilla";
const GITHUB_API_BASE = "https://api.github.com";

// Initialize GitHub data on page load
document.addEventListener("DOMContentLoaded", function () {
	if (document.getElementById("github-stats")) {
		loadGitHubData();
	}
});

async function loadGitHubData() {
	const container = document.getElementById("github-stats");
	if (!container) return;

	try {
		// Fetch user data
		const userData = await fetchGitHub(`/users/${GITHUB_USERNAME}`);

		// Fetch repositories (sorted by updated)
		const repos = await fetchGitHub(
			`/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=6`
		);

		// Fetch contribution stats (last 100 events)
		const events = await fetchGitHub(
			`/users/${GITHUB_USERNAME}/events/public?per_page=100`
		);

		displayGitHubData(userData, repos, events);
	} catch (error) {
		console.error("GitHub API error:", error);
		container.innerHTML = `
			<div class="github-error">
				<p>Unable to load GitHub data. Please try again later.</p>
			</div>
		`;
	}
}

async function fetchGitHub(endpoint) {
	const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
		headers: {
			Accept: "application/vnd.github.v3+json",
		},
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	return await response.json();
}

function displayGitHubData(userData, repos, events) {
	const container = document.getElementById("github-stats");
	if (!container) return;

	// Calculate contribution stats
	const contributionStats = calculateContributions(events);

	let html = '<div class="github-content">';

	// User Stats Overview
	html += `
		<div class="github-overview">
			<div class="github-profile">
				<img src="${userData.avatar_url}" alt="${userData.name || userData.login}">
				<div class="profile-info">
					<h3>${userData.name || userData.login}</h3>
					<p class="bio">${userData.bio || "GitHub Developer"}</p>
					<a href="${userData.html_url}" target="_blank" class="github-link">
						<i class="fab fa-github"></i> View on GitHub
					</a>
				</div>
			</div>
			<div class="github-stats-grid">
				<div class="stat-card">
					<i class="fas fa-book"></i>
					<div class="stat-number">${userData.public_repos}</div>
					<div class="stat-label">Repositories</div>
				</div>
				<div class="stat-card">
					<i class="fas fa-users"></i>
					<div class="stat-number">${userData.followers}</div>
					<div class="stat-label">Followers</div>
				</div>
				<div class="stat-card">
					<i class="fas fa-code-branch"></i>
					<div class="stat-number">${contributionStats.totalContributions}</div>
					<div class="stat-label">Recent Commits</div>
				</div>
				<div class="stat-card">
					<i class="fas fa-star"></i>
					<div class="stat-number">${contributionStats.totalStars}</div>
					<div class="stat-label">Total Stars</div>
				</div>
			</div>
		</div>
	`;

	// Latest Repositories
	if (repos && repos.length > 0) {
		html += `
			<div class="github-repos">
				<h3><i class="fas fa-folder"></i> Latest Repositories</h3>
				<div class="repos-grid">
		`;

		repos.slice(0, 6).forEach((repo) => {
			const lastUpdate = new Date(repo.updated_at);
			const timeAgo = getTimeAgo(lastUpdate);

			html += `
				<div class="repo-card">
					<div class="repo-header">
						<h4>
							<i class="fas fa-book"></i>
							<a href="${repo.html_url}" target="_blank">${repo.name}</a>
						</h4>
						${
							repo.private
								? '<span class="private-badge">Private</span>'
								: '<span class="public-badge">Public</span>'
						}
					</div>
					<p class="repo-description">${
						repo.description || "No description available"
					}</p>
					<div class="repo-stats">
						${
							repo.language
								? `<span class="language"><i class="fas fa-circle"></i> ${repo.language}</span>`
								: ""
						}
						<span class="stars"><i class="fas fa-star"></i> ${repo.stargazers_count}</span>
						<span class="forks"><i class="fas fa-code-branch"></i> ${
							repo.forks_count
						}</span>
						<span class="updated">Updated ${timeAgo}</span>
					</div>
				</div>
			`;
		});

		html += `
				</div>
			</div>
		`;
	}

	// Recent Activity
	if (events && events.length > 0) {
		const recentEvents = events.slice(0, 8);
		html += `
			<div class="github-activity">
				<h3><i class="fas fa-clock"></i> Recent Activity</h3>
				<div class="activity-list">
		`;

		recentEvents.forEach((event) => {
			const activity = formatActivity(event);
			if (activity) {
				html += `
					<div class="activity-item">
						<i class="${activity.icon}"></i>
						<div class="activity-details">
							<p>${activity.text}</p>
							<span class="activity-time">${getTimeAgo(new Date(event.created_at))}</span>
						</div>
					</div>
				`;
			}
		});

		html += `
				</div>
			</div>
		`;
	}

	html += "</div>";
	container.innerHTML = html;
}

function calculateContributions(events) {
	let totalContributions = 0;
	let totalStars = 0;

	events.forEach((event) => {
		if (event.type === "PushEvent") {
			totalContributions += event.payload.commits?.length || 0;
		}
	});

	return { totalContributions, totalStars };
}

function formatActivity(event) {
	switch (event.type) {
		case "PushEvent":
			const commits = event.payload.commits?.length || 0;
			return {
				icon: "fas fa-code",
				text: `Pushed ${commits} commit${commits !== 1 ? "s" : ""} to <strong>${
					event.repo.name
				}</strong>`,
			};
		case "CreateEvent":
			return {
				icon: "fas fa-plus-circle",
				text: `Created ${event.payload.ref_type} in <strong>${event.repo.name}</strong>`,
			};
		case "WatchEvent":
			return {
				icon: "fas fa-star",
				text: `Starred <strong>${event.repo.name}</strong>`,
			};
		case "ForkEvent":
			return {
				icon: "fas fa-code-branch",
				text: `Forked <strong>${event.repo.name}</strong>`,
			};
		case "IssuesEvent":
			return {
				icon: "fas fa-exclamation-circle",
				text: `${event.payload.action} an issue in <strong>${event.repo.name}</strong>`,
			};
		case "PullRequestEvent":
			return {
				icon: "fas fa-code-branch",
				text: `${event.payload.action} a pull request in <strong>${event.repo.name}</strong>`,
			};
		default:
			return null;
	}
}

function getTimeAgo(date) {
	const seconds = Math.floor((new Date() - date) / 1000);

	const intervals = {
		year: 31536000,
		month: 2592000,
		week: 604800,
		day: 86400,
		hour: 3600,
		minute: 60,
	};

	for (const [unit, secondsInUnit] of Object.entries(intervals)) {
		const interval = Math.floor(seconds / secondsInUnit);
		if (interval >= 1) {
			return `${interval} ${unit}${interval !== 1 ? "s" : ""} ago`;
		}
	}

	return "just now";
}

// Auto-refresh every 5 minutes
setInterval(() => {
	if (document.getElementById("github-stats")) {
		loadGitHubData();
	}
}, 300000);
