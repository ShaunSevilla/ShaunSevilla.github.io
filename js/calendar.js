/**
 * Calendar Integration Module
 * Fetches and displays events from Apple Calendar iCal feeds
 */

// Configuration - Replace these with your actual public calendar URLs
const CALENDAR_CONFIG = {
	professional:
		"webcal://p151-caldav.icloud.com/published/2/MTYxNzgxNDkwMjE2MTc4MWKqmdT6Ltqcu09H9b6BgDO8g0OAlwwTkYhpZtTD54h9ds_NPwew2zKuXT5s9CJO7cuR2HHO0GiWYyuksd9oI8g", // Replace with your professional calendar webcal:// or https:// URL
	personal:
		"webcal://p151-caldav.icloud.com/published/2/MTYxNzgxNDkwMjE2MTc4MWKqmdT6Ltqcu09H9b6BgDO8g0OAlwwTkYhpZtTD54h9ds_NPwew2zKuXT5s9CJO7cuR2HHO0GiWYyuksd9oI8g", // Replace with your personal calendar webcal:// or https:// URL
};

/**
 * Parse iCal data
 * @param {string} icalData - Raw iCal data
 * @returns {Array} Array of event objects
 */
function parseICalData(icalData) {
	const events = [];
	const lines = icalData.split(/\r\n|\n|\r/);

	let currentEvent = null;
	let currentField = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		if (line === "BEGIN:VEVENT") {
			currentEvent = {
				summary: "",
				description: "",
				location: "",
				dtstart: null,
				dtend: null,
				isAllDay: false,
			};
		} else if (line === "END:VEVENT" && currentEvent) {
			// Mark as all-day if no time component exists
			if (currentEvent.dtstart && !hasTimeComponent(currentEvent.dtstart)) {
				currentEvent.isAllDay = true;
			}
			events.push(currentEvent);
			currentEvent = null;
		} else if (currentEvent) {
			// Handle multi-line values
			if (line.startsWith(" ") && currentField) {
				currentEvent[currentField] += line.substring(1);
				continue;
			}

			const colonIndex = line.indexOf(":");
			if (colonIndex === -1) continue;

			const fullKey = line.substring(0, colonIndex);
			const value = line.substring(colonIndex + 1);

			// Extract the base key (before any semicolon parameters)
			const key = fullKey.split(";")[0];

			switch (key) {
				case "SUMMARY":
					currentEvent.summary = value;
					currentField = "summary";
					break;
				case "DESCRIPTION":
					currentEvent.description = value.replace(/\\n/g, "\n");
					currentField = "description";
					break;
				case "LOCATION":
					currentEvent.location = value;
					currentField = "location";
					break;
				case "DTSTART":
					currentEvent.dtstart = parseICalDate(value);
					// Check if it's a VALUE=DATE (all-day event)
					if (fullKey.includes("VALUE=DATE")) {
						currentEvent.isAllDay = true;
					}
					currentField = null;
					break;
				case "DTEND":
					currentEvent.dtend = parseICalDate(value);
					currentField = null;
					break;
				default:
					currentField = null;
			}
		}
	}

	return events;
}

/**
 * Check if a date string has a time component
 * @param {Date} date - Date object
 * @returns {boolean} True if has time component
 */
function hasTimeComponent(date) {
	return (
		date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0
	);
}

/**
 * Parse iCal date format to JavaScript Date
 * @param {string} icalDate - iCal date string (format: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS or YYYYMMDD)
 * @returns {Date} JavaScript Date object
 */
function parseICalDate(icalDate) {
	if (!icalDate) return null;

	// Remove any hyphens or colons
	const dateStr = icalDate.replace(/[-:]/g, "");

	if (dateStr.length === 8) {
		// All-day event: YYYYMMDD
		const year = parseInt(dateStr.substring(0, 4));
		const month = parseInt(dateStr.substring(4, 6));
		const day = parseInt(dateStr.substring(6, 8));
		return new Date(year, month - 1, day);
	} else if (dateStr.includes("T")) {
		// Timed event: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
		const year = parseInt(dateStr.substring(0, 4));
		const month = parseInt(dateStr.substring(4, 6));
		const day = parseInt(dateStr.substring(6, 8));
		const hour = parseInt(dateStr.substring(9, 11));
		const minute = parseInt(dateStr.substring(11, 13));
		const second = parseInt(dateStr.substring(13, 15)) || 0;

		if (dateStr.endsWith("Z")) {
			// UTC time
			return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
		} else {
			// Local time (timezone-aware but treat as local)
			return new Date(year, month - 1, day, hour, minute, second);
		}
	}

	return null;
}

/**
 * Format date for display
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
function formatDate(date) {
	if (!date) return "";

	const options = {
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	};

	return date.toLocaleDateString("en-US", options);
}

/**
 * Format date range for display
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @param {boolean} isAllDay - Whether it's an all-day event
 * @returns {string} Formatted date range
 */
function formatDateRange(start, end, isAllDay = false) {
	if (!start) return "Date TBD";

	// For all-day events, show just the date
	if (isAllDay) {
		const startDateOptions = { month: "short", day: "numeric" };
		const startStr = start.toLocaleDateString("en-US", startDateOptions);

		if (!end || isSameDay(start, end)) {
			return startStr;
		}

		const endStr = end.toLocaleDateString("en-US", startDateOptions);
		return `${startStr} - ${endStr}`;
	}

	const startStr = formatDate(start);

	if (!end || end.getTime() === start.getTime()) {
		return startStr;
	}

	// Check if same day
	if (isSameDay(start, end)) {
		const timeOptions = { hour: "2-digit", minute: "2-digit" };
		return `${startStr} - ${end.toLocaleTimeString("en-US", timeOptions)}`;
	}

	return `${startStr} - ${formatDate(end)}`;
}

/**
 * Check if two dates are the same day
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {boolean} True if same day
 */
function isSameDay(date1, date2) {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

/**
 * Filter events to show only upcoming events
 * @param {Array} events - Array of event objects
 * @returns {Array} Filtered and sorted events
 */
function filterUpcomingEvents(events) {
	const now = new Date();
	return events
		.filter((event) => {
			if (!event.dtstart) return false;
			return event.dtstart >= now || (event.dtend && event.dtend >= now);
		})
		.sort((a, b) => a.dtstart - b.dtstart)
		.slice(0, 10); // Show next 10 events
}

/**
 * Get events for a specific date (including multi-day events)
 * @param {Array} events - Array of all events
 * @param {Date} date - Target date
 * @returns {Array} Events for that date
 */
function getEventsForDate(events, date) {
	return events.filter((event) => {
		if (!event.dtstart) return false;

		const eventStart = new Date(event.dtstart);
		const eventEnd = event.dtend
			? new Date(event.dtend)
			: new Date(event.dtstart);

		// Normalize dates to midnight for comparison
		const targetDate = new Date(
			date.getFullYear(),
			date.getMonth(),
			date.getDate()
		);
		const startDate = new Date(
			eventStart.getFullYear(),
			eventStart.getMonth(),
			eventStart.getDate()
		);
		const endDate = new Date(
			eventEnd.getFullYear(),
			eventEnd.getMonth(),
			eventEnd.getDate()
		);

		// Check if the target date falls within the event's date range
		return targetDate >= startDate && targetDate <= endDate;
	});
}

/**
 * Check if an event spans multiple days
 * @param {Object} event - Event object
 * @returns {boolean} True if event spans multiple days
 */
function isMultiDayEvent(event) {
	if (!event.dtstart || !event.dtend) return false;

	const start = new Date(event.dtstart);
	const end = new Date(event.dtend);

	// For all-day events, check if end date is more than 1 day after start
	if (event.isAllDay) {
		const daysDiff = Math.floor((end - start) / (1000 * 60 * 60 * 24));
		return daysDiff >= 1;
	}

	// For timed events, check if they span different calendar days
	return (
		start.getFullYear() !== end.getFullYear() ||
		start.getMonth() !== end.getMonth() ||
		start.getDate() !== end.getDate()
	);
}

/**
 * Render monthly calendar view
 * @param {string} containerId - ID of the container element
 * @param {Array} events - Array of event objects
 */
function renderCalendar(containerId, events) {
	const container = document.getElementById(containerId);
	if (!container) return;

	const now = new Date();
	const currentMonth = now.getMonth();
	const currentYear = now.getFullYear();

	// Get first day of month and number of days
	const firstDay = new Date(currentYear, currentMonth, 1);
	const lastDay = new Date(currentYear, currentMonth + 1, 0);
	const daysInMonth = lastDay.getDate();
	const startingDayOfWeek = firstDay.getDay();

	// Month/Year header
	const monthNames = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];

	let calendarHTML = `
        <div class="calendar-header">
            <h3>${monthNames[currentMonth]} ${currentYear}</h3>
        </div>
        <div class="calendar-grid">
            <div class="calendar-day-names">
                <div class="day-name">Sun</div>
                <div class="day-name">Mon</div>
                <div class="day-name">Tue</div>
                <div class="day-name">Wed</div>
                <div class="day-name">Thu</div>
                <div class="day-name">Fri</div>
                <div class="day-name">Sat</div>
            </div>
            <div class="calendar-days">
    `;

	// Empty cells before first day
	for (let i = 0; i < startingDayOfWeek; i++) {
		calendarHTML += '<div class="calendar-day empty"></div>';
	}

	// Days of the month
	for (let day = 1; day <= daysInMonth; day++) {
		const date = new Date(currentYear, currentMonth, day);
		const dayEvents = getEventsForDate(events, date);
		const isToday =
			day === now.getDate() &&
			currentMonth === now.getMonth() &&
			currentYear === now.getFullYear();
		const isPast = date < now && !isToday;

		calendarHTML += `
            <div class="calendar-day ${isToday ? "today" : ""} ${
			isPast ? "past" : ""
		} ${dayEvents.length > 0 ? "has-events" : ""}" 
                 data-date="${currentYear}-${String(currentMonth + 1).padStart(
			2,
			"0"
		)}-${String(day).padStart(2, "0")}">
                <div class="day-number">${day}</div>
                ${
									dayEvents.length > 0
										? `
                    <div class="event-indicators">
                        ${dayEvents
													.map(() => '<span class="event-dot"></span>')
													.join("")}
                    </div>
                    <div class="event-preview">
                        ${dayEvents
													.map(
														(e) =>
															`<div class="preview-item">${escapeHtml(
																e.summary || "Event"
															)}</div>`
													)
													.join("")}
                    </div>
                `
										: ""
								}
            </div>
        `;
	}

	calendarHTML += `
            </div>
        </div>
        <div class="event-modal" id="event-modal-${containerId}">
            <div class="modal-content">
                <div class="modal-header">
                    <h4 id="modal-date-${containerId}"></h4>
                    <button class="modal-close" onclick="closeEventModal('${containerId}')">&times;</button>
                </div>
                <div class="modal-body" id="modal-body-${containerId}">
                </div>
            </div>
        </div>
    `;

	container.innerHTML = calendarHTML;

	// Add click handlers to days with events
	container.querySelectorAll(".calendar-day.has-events").forEach((dayEl) => {
		dayEl.addEventListener("click", function () {
			const dateStr = this.getAttribute("data-date");
			const date = new Date(dateStr + "T00:00:00");
			const dayEvents = getEventsForDate(events, date);
			showEventModal(containerId, date, dayEvents);
		});
	});
}

/**
 * Show event modal with day's events
 * @param {string} containerId - Container ID
 * @param {Date} date - Selected date
 * @param {Array} events - Events for that date
 */
function showEventModal(containerId, date, events) {
	const modal = document.getElementById(`event-modal-${containerId}`);
	const modalDate = document.getElementById(`modal-date-${containerId}`);
	const modalBody = document.getElementById(`modal-body-${containerId}`);

	if (!modal || !modalDate || !modalBody) return;

	// Format date
	const options = {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	};
	modalDate.textContent = date.toLocaleDateString("en-US", options);

	// Render events
	const eventsHTML = events
		.map((event, index) => {
			const isMultiDay = isMultiDayEvent(event);
			const timeDisplay = event.isAllDay
				? "All Day"
				: isMultiDay
				? formatDateRange(event.dtstart, event.dtend)
				: `${formatTime(event.dtstart)} - ${formatTime(event.dtend)}`;

			return `
        <div class="modal-event ${event.isAllDay ? "all-day-event" : ""} ${
				isMultiDay ? "multi-day-event" : ""
			}" onclick="toggleEventDetails(this)">
            <div class="modal-event-summary">
                <strong>${escapeHtml(
									event.summary || "Untitled Event"
								)}</strong>
                <span class="event-time">${timeDisplay}</span>
                <i class="fas fa-chevron-down expand-icon"></i>
            </div>
            <div class="modal-event-details">
                ${
									isMultiDay
										? `
                    <div class="detail-row">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${formatDateRange(
													event.dtstart,
													event.dtend
												)}</span>
                    </div>
                `
										: ""
								}
                ${
									event.location
										? `
                    <div class="detail-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${escapeHtml(event.location)}</span>
                    </div>
                `
										: ""
								}
                ${
									event.description
										? `
                    <div class="detail-row">
                        <i class="fas fa-info-circle"></i>
                        <span>${escapeHtml(event.description)}</span>
                    </div>
                `
										: ""
								}
                ${
									!isMultiDay && !event.isAllDay
										? `
                    <div class="detail-row">
                        <i class="fas fa-clock"></i>
                        <span>${formatTime(event.dtstart)} - ${formatTime(
												event.dtend
										  )}</span>
                    </div>
                `
										: ""
								}
            </div>
        </div>
    `;
		})
		.join("");

	modalBody.innerHTML =
		eventsHTML || '<p class="no-events">No events for this day</p>';
	modal.classList.add("active");

	// Close modal when clicking outside
	modal.addEventListener("click", function (e) {
		if (e.target === modal) {
			closeEventModal(containerId);
		}
	});
}

/**
 * Close event modal
 * @param {string} containerId - Container ID
 */
function closeEventModal(containerId) {
	const modal = document.getElementById(`event-modal-${containerId}`);
	if (modal) {
		modal.classList.remove("active");
	}
}

/**
 * Toggle event details in modal
 * @param {HTMLElement} element - Event element
 */
function toggleEventDetails(element) {
	element.classList.toggle("expanded");
}

/**
 * Format time only
 * @param {Date} date - Date object
 * @returns {string} Formatted time
 */
function formatTime(date) {
	if (!date) return "";
	const options = { hour: "2-digit", minute: "2-digit" };
	return date.toLocaleTimeString("en-US", options);
}

// Make functions global for onclick handlers
window.closeEventModal = closeEventModal;
window.toggleEventDetails = toggleEventDetails;

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

/**
 * CORS proxy services to try (in order)
 */
const CORS_PROXIES = [
	"https://api.allorigins.win/raw?url=",
	"https://corsproxy.io/?",
	"https://api.codetabs.com/v1/proxy?quest=",
];

/**
 * Fetch calendar data with CORS proxy fallback
 * @param {string} calendarUrl - URL of the iCal feed
 * @returns {Promise<string>} iCal data
 */
async function fetchWithProxy(calendarUrl) {
	// Convert webcal:// to https://
	const httpsUrl = calendarUrl.replace("webcal://", "https://");

	// Try direct fetch first
	try {
		const response = await fetch(httpsUrl, {
			mode: "cors",
			headers: {
				Accept: "text/calendar",
			},
		});
		if (response.ok) {
			return await response.text();
		}
	} catch (error) {
		console.log("Direct fetch failed, trying proxies...", error.message);
	}

	// Try each proxy service
	for (let i = 0; i < CORS_PROXIES.length; i++) {
		const proxy = CORS_PROXIES[i];
		const proxiedUrl = proxy + encodeURIComponent(httpsUrl);

		try {
			console.log(`Trying proxy ${i + 1}/${CORS_PROXIES.length}: ${proxy}`);
			const response = await fetch(proxiedUrl, {
				headers: {
					Accept: "text/calendar, text/plain, */*",
				},
			});

			if (response.ok) {
				const text = await response.text();
				// Verify it's actually iCal data
				if (text.includes("BEGIN:VCALENDAR") || text.includes("BEGIN:VEVENT")) {
					console.log(`Successfully fetched calendar via proxy ${i + 1}`);
					return text;
				}
			}
		} catch (error) {
			console.log(`Proxy ${i + 1} failed:`, error.message);
			continue;
		}
	}

	throw new Error("All proxy attempts failed");
}

/**
 * Fetch and display calendar events
 * @param {string} calendarUrl - URL of the iCal feed
 * @param {string} containerId - ID of the container element
 */
async function fetchAndDisplayCalendar(calendarUrl, containerId) {
	const container = document.getElementById(containerId);
	if (!container) return;

	try {
		// Check if URL is configured
		if (
			!calendarUrl ||
			calendarUrl.includes("YOUR_") ||
			calendarUrl.includes("_HERE")
		) {
			container.innerHTML =
				'<div class="calendar-error">Calendar not configured. Please add your public calendar URL in calendar.js</div>';
			return;
		}

		// Fetch calendar data with proxy fallback
		const icalData = await fetchWithProxy(calendarUrl);
		const events = parseICalData(icalData);
		renderCalendar(containerId, events);
	} catch (error) {
		console.error("Error fetching calendar:", error);
		container.innerHTML = `
            <div class="calendar-error">
                Unable to load calendar events. 
                <br><small>Error: ${error.message}</small>
                <br><small>Please check the calendar URL and try again.</small>
            </div>
        `;
	}
}

/**
 * Initialize calendars when DOM is ready
 */
function initializeCalendars() {
	console.log("Initializing calendars...");

	// Fetch professional calendar
	if (document.getElementById("professional-calendar")) {
		console.log("Loading professional calendar...");
		fetchAndDisplayCalendar(
			CALENDAR_CONFIG.professional,
			"professional-calendar"
		);
	}

	// Fetch personal calendar
	if (document.getElementById("personal-calendar")) {
		console.log("Loading personal calendar...");
		fetchAndDisplayCalendar(CALENDAR_CONFIG.personal, "personal-calendar");
	}
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializeCalendars);
} else {
	initializeCalendars();
}

// Add manual refresh function for debugging
window.refreshCalendars = initializeCalendars;
