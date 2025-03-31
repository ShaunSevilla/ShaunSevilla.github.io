document.addEventListener("DOMContentLoaded", function () {
	// Navigation menu functionality
	const hamburger = document.getElementById("hamburger-menu");
	const sideBar = document.querySelector(".sidebar");
	const overlay = document.getElementById("overlay");
	const headerThemeToggle = document.querySelector(".navbar .theme-toggle");

	// Function to open the menu on mobile
	function openMenu(event) {
		if (event) event.stopPropagation(); // Prevent document click from immediately closing the menu
		sideBar.classList.add("active");
		overlay.classList.add("active");
		document.body.style.overflow = "hidden"; // Prevent scrolling when menu is open

		// Hide the header theme toggle when sidebar is open
		if (headerThemeToggle) {
			headerThemeToggle.classList.add("hide-toggle");
		}
	}

	// Function to close the menu on mobile
	function closeMenu() {
		sideBar.classList.remove("active");
		overlay.classList.remove("active");
		document.body.style.overflow = ""; // Allow scrolling again

		// Show the header theme toggle when sidebar is closed
		if (headerThemeToggle) {
			headerThemeToggle.classList.remove("hide-toggle");
		}
	}

	// Event listeners for mobile menu
	if (hamburger) {
		hamburger.addEventListener("click", openMenu);
	}

	// Close menu when clicking on overlay
	if (overlay) {
		overlay.addEventListener("click", closeMenu);
	}

	// ADD this improved document click handler instead
	document.addEventListener("click", function (event) {
		// Only proceed if sidebar is active
		if (!sideBar.classList.contains("active")) return;

		// Check if click is outside sidebar AND not on hamburger menu
		if (!sideBar.contains(event.target) && !hamburger.contains(event.target)) {
			closeMenu();
		}
	});

	// Theme toggle functionality - main switch
	const themeSwitch = document.getElementById("theme-switch");
	const sidebarThemeSwitch = document.getElementById("sidebar-theme-switch");

	// Check for saved user preference, otherwise use dark theme as default
	const savedTheme = localStorage.getItem("theme") || "dark";
	document.documentElement.setAttribute("data-theme", savedTheme);

	// Sync both theme switches
	if (themeSwitch) themeSwitch.checked = savedTheme === "light";
	if (sidebarThemeSwitch) sidebarThemeSwitch.checked = savedTheme === "light";

	// Function to handle theme change
	function handleThemeChange(event) {
		const theme = event.target.checked ? "light" : "dark";
		document.documentElement.setAttribute("data-theme", theme);
		localStorage.setItem("theme", theme);

		// Sync the other switch
		if (event.target === themeSwitch && sidebarThemeSwitch) {
			sidebarThemeSwitch.checked = event.target.checked;
		} else if (event.target === sidebarThemeSwitch && themeSwitch) {
			themeSwitch.checked = event.target.checked;
		}

		// Optional: Add transition effect to the body
		document.body.classList.add("theme-transition");
		setTimeout(() => {
			document.body.classList.remove("theme-transition");
		}, 500);
	}

	// Add event listeners to both switches
	if (themeSwitch) themeSwitch.addEventListener("change", handleThemeChange);
	if (sidebarThemeSwitch)
		sidebarThemeSwitch.addEventListener("change", handleThemeChange);

	// Project section collapsible functionality - only apply on project page
	const isProjectPage = window.location.href.includes("project.html");

	if (isProjectPage) {
		const contentSections = document.querySelectorAll(".content-section");

		contentSections.forEach((section) => {
			// Get section heading
			const sectionHeading = section.querySelector("h2");
			if (!sectionHeading) return; // Skip if no heading found

			// Create a wrapper for the heading and toggle button
			const headingWrapper = document.createElement("div");
			headingWrapper.className = "section-header";

			// Move the heading to the wrapper
			section.insertBefore(headingWrapper, sectionHeading);
			headingWrapper.appendChild(sectionHeading);

			// Add dropdown icon directly inside the heading
			const dropdownIcon = document.createElement("span");
			dropdownIcon.className = "dropdown-icon";
			dropdownIcon.innerHTML = '<i class="fas fa-chevron-down"></i>';
			sectionHeading.appendChild(dropdownIcon);

			// Get the project grid
			const projectGrid = section.querySelector(".project-grid");
			if (!projectGrid) return;

			// Create a container for the project grid to help with centering and animation
			const gridContainer = document.createElement("div");
			gridContainer.className = "grid-container";

			// Move the project grid into the container
			projectGrid.parentNode.insertBefore(gridContainer, projectGrid);
			gridContainer.appendChild(projectGrid);

			// Initially set grid to collapsed state
			gridContainer.style.display = "none";

			// Add click event to heading wrapper to toggle visibility
			headingWrapper.addEventListener("click", function () {
				const isExpanded = gridContainer.style.display !== "none";

				if (isExpanded) {
					// Collapse
					section.classList.remove("expanded");
					gridContainer.style.display = "none";
					dropdownIcon.innerHTML = '<i class="fas fa-chevron-down"></i>';
				} else {
					// Expand
					section.classList.add("expanded");
					gridContainer.style.display = "block";
					dropdownIcon.innerHTML = '<i class="fas fa-chevron-up"></i>';

					// Scroll to the section
					setTimeout(() => {
						section.scrollIntoView({ behavior: "smooth", block: "start" });
					}, 100);
				}
			});
		});
	}
});
