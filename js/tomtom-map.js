// TomTom Map Integration
const TOMTOM_API_KEY = "xpwlZpkOObqpqC6b5FgByummnHbLnRDX";
let allMarkers = [];
let mapInstance = null;

// Initialize map when page loads
window.addEventListener("load", function () {
	const mapContainer = document.getElementById("tomtom-map");

	if (!mapContainer) {
		console.error("Map container not found");
		return;
	}

	try {
		// Center on Singapore
		const center = [103.8198, 1.3521]; // [longitude, latitude]

		// Initialize TomTom map
		const map = tt.map({
			key: TOMTOM_API_KEY,
			container: "tomtom-map",
			center: center,
			zoom: 11,
			style:
				"https://api.tomtom.com/style/1/style/22.2.1-*?map=basic_main&key=" +
				TOMTOM_API_KEY,
		});

		mapInstance = map;

		// Wait for map to load
		map.on("load", function () {
			console.log("Map loaded successfully");

			// Add navigation controls
			map.addControl(new tt.NavigationControl());

			// Add markers for each place
			myPlaces.forEach((place, index) => {
				// Create custom marker element with emoji
				const markerElement = document.createElement("div");
				markerElement.className = "custom-marker";
				markerElement.innerHTML = `<div class="marker-emoji">${place.emoji}</div>`;

				// Create marker
				const marker = new tt.Marker({ element: markerElement })
					.setLngLat(place.coordinates)
					.addTo(map);

				// Create popup content
				const popupContent = `
				<div class="map-popup">
					<div class="popup-header">
						<span class="popup-emoji">${place.emoji}</span>
						<h3>${place.name}</h3>
					</div>
					<div class="popup-category">${place.category}</div>
					<div class="popup-rating">${"⭐".repeat(place.rating)}</div>
					<a href="${place.address}" target="_blank" class="popup-address">
						<i class="fas fa-map-marker-alt"></i> View on Google Maps
					</a>
				</div>
			`; // Add popup to marker
				const popup = new tt.Popup({ offset: 35 }).setHTML(popupContent);
				marker.setPopup(popup);

				// Store reference and category
				marker.placeIndex = index;
				marker.placeCategory = place.category;
				marker.markerElement = markerElement;

				allMarkers.push(marker);
			});

			// Display places list
			displayPlacesList(map);

			// Initialize filter buttons
			initializeFilters(map);
		});

		// Error handling
		map.on("error", function (e) {
			console.error("Map error:", e);
		});
	} catch (error) {
		console.error("Error initializing map:", error);
	}
});

// Initialize filter buttons
function initializeFilters(map) {
	const filterButtons = document.querySelectorAll(".filter-btn");

	filterButtons.forEach((button) => {
		button.addEventListener("click", function () {
			// Update active state
			filterButtons.forEach((btn) => btn.classList.remove("active"));
			this.classList.add("active");

			const filter = this.dataset.filter;
			filterPlaces(filter, map);
		});
	});
}

// Filter places by category
function filterPlaces(category, map) {
	const placeCards = document.querySelectorAll(".place-card");

	// Filter markers on map
	allMarkers.forEach((marker) => {
		if (category === "all" || marker.placeCategory === category) {
			marker.markerElement.style.display = "block";
		} else {
			marker.markerElement.style.display = "none";
		}
	});

	// Filter place cards
	placeCards.forEach((card) => {
		const index = parseInt(card.dataset.index);
		const place = myPlaces[index];

		if (category === "all" || place.category === category) {
			card.style.display = "block";
		} else {
			card.style.display = "none";
		}
	});
}

// Display places list below map
function displayPlacesList(map) {
	const listContainer = document.getElementById("places-list");
	if (!listContainer) return;

	listContainer.innerHTML = myPlaces
		.map(
			(place, index) => `
		<div class="place-card" data-index="${index}" data-category="${place.category}">
			<div class="place-header">
				<div class="place-title-row">
					<span class="place-emoji">${place.emoji}</span>
					<h3>${place.name}</h3>
				</div>
				<span class="place-category-badge">${place.category}</span>
			</div>
			<div class="place-rating">${"⭐".repeat(place.rating)}</div>
			<a href="${
				place.address
			}" target="_blank" class="place-address" onclick="event.stopPropagation();">
				<i class="fas fa-map-marker-alt"></i> View on Google Maps
			</a>
		</div>
	`
		)
		.join("");

	// Add click handlers to place cards
	document.querySelectorAll(".place-card").forEach((card) => {
		card.addEventListener("click", function () {
			const index = parseInt(this.dataset.index);
			const place = myPlaces[index];

			// Fly to location
			map.flyTo({
				center: place.coordinates,
				zoom: 15,
				duration: 1500,
			});
		});
	});
}
