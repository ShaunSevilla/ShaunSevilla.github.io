document.addEventListener("DOMContentLoaded", function () {
	// Navigation menu functionality
	const hamburger = document.getElementById("hamburger-menu");
	const closeMenu = document.getElementById("close-menu");
	const navMenu = document.getElementById("nav-menu");
	const overlay = document.getElementById("overlay");

	// Function to open the menu
	function openMenu() {
		navMenu.classList.add("active");
		overlay.classList.add("active");
		document.body.style.overflow = "hidden"; // Prevent scrolling when menu is open
	}

	// Function to close the menu
	function closeMenuFunc() {
		navMenu.classList.remove("active");
		overlay.classList.remove("active");
		document.body.style.overflow = ""; // Allow scrolling again
	}

	// Event listeners for menu
	hamburger.addEventListener("click", openMenu);
	closeMenu.addEventListener("click", closeMenuFunc);
	overlay.addEventListener("click", closeMenuFunc);

	// Close menu when clicking a link (optional)
	const navLinks = document.querySelectorAll("#nav-menu a");
	navLinks.forEach((link) => {
		link.addEventListener("click", closeMenuFunc);
	});

	// Theme toggle functionality
	const themeSwitch = document.getElementById("theme-switch");

	// Check for saved user preference, otherwise use dark theme as default
	const savedTheme = localStorage.getItem("theme") || "dark";
	document.documentElement.setAttribute("data-theme", savedTheme);
	themeSwitch.checked = savedTheme === "light";

	themeSwitch.addEventListener("change", function () {
		const theme = this.checked ? "light" : "dark";
		document.documentElement.setAttribute("data-theme", theme);
		localStorage.setItem("theme", theme);

		// Optional: Add transition effect to the body
		document.body.classList.add("theme-transition");
		setTimeout(() => {
			document.body.classList.remove("theme-transition");
		}, 500);
	});

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
