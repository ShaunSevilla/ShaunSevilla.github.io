const SUPABASE_URL = "https://rubfkxwhieqwqjeaoszi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4njA-v1tihYv3JdxLAbVMQ_AhOZiicx";
const BOOKING_DAYS_TO_SHOW = 14;
const CONTACT_STORAGE_KEY = "ss-booking-contact-v1";
const TELEGRAM_URL = "https://t.me/ShaunSevilla";
const SUBMIT_READY_LABEL = "Confirm Consultation";
const SUBMIT_WAITING_LABEL = "Choose a time first";

const bookingState = {
	availability: [],
	selectedDate: "",
	selectedSlot: "",
};

function formatLocalDate(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatDisplayDate(value) {
	return new Date(`${value}T00:00:00`).toLocaleDateString("en-SG", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

function formatTime(value) {
	const [hours, minutes] = value.split(":");
	return new Date(2000, 0, 1, Number(hours), Number(minutes)).toLocaleTimeString(
		"en-SG",
		{ hour: "numeric", minute: "2-digit" },
	);
}

function advanceOnMobile(targetId) {
	if (!window.matchMedia("(max-width: 840px)").matches) return;

	window.setTimeout(() => {
		document.getElementById(targetId)?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	}, 120);
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function setSubmitReady(ready) {
	const submit = document.getElementById("booking-submit");
	submit.disabled = !ready;
	submit.textContent = ready ? SUBMIT_READY_LABEL : SUBMIT_WAITING_LABEL;
}

function readSavedContact() {
	try {
		return JSON.parse(window.localStorage.getItem(CONTACT_STORAGE_KEY) || "{}") || {};
	} catch (error) {
		return {};
	}
}

function saveContact(name, contact) {
	try {
		window.localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify({ name, contact }));
	} catch (error) {
		// Storage blocked: nothing to remember, booking still works.
	}
}

// "08:00:00" or "08:00" -> "080000"
function toCalendarTime(value) {
	const [hours = "00", minutes = "00"] = String(value).split(":");
	return `${hours.padStart(2, "0")}${minutes.padStart(2, "0")}00`;
}

function buildCalendarLinks(slot) {
	const day = slot.booking_date.replace(/-/g, "");
	const start = `${day}T${toCalendarTime(slot.start_time)}`;
	const end = `${day}T${toCalendarTime(slot.end_time)}`;
	const title = "Consultation with Shaun Sevilla";
	const details = "Shaun will reach out using the contact details you gave to confirm where to meet.";

	const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({
		action: "TEMPLATE",
		text: title,
		dates: `${start}/${end}`,
		ctz: "Asia/Singapore",
		details,
	}).toString()}`;

	const ics = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Shaun Sevilla//Consultation//EN",
		"BEGIN:VEVENT",
		`UID:${day}-${slot.slot_key}@shaunsevilla.github.io`,
		`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
		`DTSTART;TZID=Asia/Singapore:${start}`,
		`DTEND;TZID=Asia/Singapore:${end}`,
		`SUMMARY:${title}`,
		`DESCRIPTION:${details}`,
		"END:VEVENT",
		"END:VCALENDAR",
	].join("\r\n");

	return { google, ics: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}` };
}

function showLoadError() {
	const status = document.getElementById("booking-status");
	status.className = "booking-status error";
	status.innerHTML = `Couldn't load available times. <button type="button" class="booking-retry" id="booking-retry">Try again</button> or <a href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">message me on Telegram</a>.`;
	document.getElementById("booking-retry").addEventListener("click", () => loadAvailability());
}

function showConfirmation(slot) {
	const status = document.getElementById("booking-status");
	const links = buildCalendarLinks(slot);
	status.className = "booking-status success";
	status.innerHTML = `
		<strong>You're booked in: ${escapeHtml(formatDisplayDate(slot.booking_date))}, ${escapeHtml(formatTime(slot.start_time))} &ndash; ${escapeHtml(formatTime(slot.end_time))} (SGT).</strong>
		I&rsquo;ll contact you using the details you gave.
		<span class="booking-calendar-links">
			<a href="${links.google}" target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
			<a href="${links.ics}" download="consultation-shaun-sevilla.ics">Add to Apple / Outlook</a>
		</span>`;
	status.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Notes handed over from a calculator ("Discuss this with Shaun").
function applyPrefill(form) {
	const params = new URLSearchParams(window.location.search);
	const notes = params.get("notes");
	const topic = params.get("topic");
	if (notes && !form.elements.notes.value) {
		form.elements.notes.value = notes.slice(0, 1000);
		const note = document.getElementById("booking-prefill-note");
		if (note) {
			note.textContent = `Your ${topic ? `${topic} ` : ""}results are already in the notes below, so we can start from your numbers.`;
			note.hidden = false;
		}
	}

	const saved = readSavedContact();
	if (saved.name && !form.elements.name.value) form.elements.name.value = saved.name;
	if (saved.contact && !form.elements.contact.value) form.elements.contact.value = saved.contact;
}

async function callSupabaseRpc(functionName, body) {
	const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
		method: "POST",
		headers: {
			apikey: SUPABASE_PUBLISHABLE_KEY,
			Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		throw new Error(error.message || "Unable to complete the request");
	}

	return response.json();
}

function renderDateButtons() {
	const container = document.getElementById("booking-dates");
	const dates = [...new Set(bookingState.availability.map((item) => item.booking_date))];

	if (!dates.length) {
		container.innerHTML = `<p class="booking-empty">No open slots in the next two weeks. <a href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">Message me on Telegram</a> and I&rsquo;ll find a time with you.</p>`;
		return;
	}

	if (!dates.includes(bookingState.selectedDate)) {
		bookingState.selectedDate = dates[0];
		bookingState.selectedSlot = "";
	}

	container.innerHTML = dates
		.map(
			(date) => `
				<button type="button" class="booking-date ${date === bookingState.selectedDate ? "selected" : ""}" data-date="${date}">
					${formatDisplayDate(date)}
				</button>
			`,
		)
		.join("");

	container.querySelectorAll(".booking-date").forEach((button) => {
		button.addEventListener("click", () => {
			bookingState.selectedDate = button.dataset.date;
			bookingState.selectedSlot = "";
			setSubmitReady(false);
			renderDateButtons();
			renderTimeSlots();
			advanceOnMobile("booking-time-step");
		});
	});
}

function renderTimeSlots() {
	const container = document.getElementById("booking-times");
	const slots = bookingState.availability.filter(
		(item) => item.booking_date === bookingState.selectedDate,
	);

	container.innerHTML = slots
		.map(
			(slot) => `
				<button
					type="button"
					class="booking-time ${slot.slot_key === bookingState.selectedSlot ? "selected" : ""}"
					data-slot="${slot.slot_key}"
					${slot.is_available ? "" : "disabled"}
				>
					<span>${formatTime(slot.start_time)} &ndash; ${formatTime(slot.end_time)}</span>
					<small>${slot.is_available ? "Available" : "Booked"}</small>
				</button>
			`,
		)
		.join("");

	container.querySelectorAll(".booking-time:not(:disabled)").forEach((button) => {
		button.addEventListener("click", () => {
			bookingState.selectedSlot = button.dataset.slot;
			renderTimeSlots();
			setSubmitReady(true);
			advanceOnMobile("booking-details-step");
		});
	});
}

async function loadAvailability(preserveStatus = false) {
	const status = document.getElementById("booking-status");
	const today = new Date();
	const end = new Date(today);
	end.setDate(end.getDate() + BOOKING_DAYS_TO_SHOW);

	if (!preserveStatus) {
		status.textContent = "Loading available consultations...";
		status.className = "booking-status";
	}

	try {
		bookingState.availability = await callSupabaseRpc("get_booking_availability", {
			requested_start: formatLocalDate(today),
			requested_end: formatLocalDate(end),
		});
		renderDateButtons();
		renderTimeSlots();
		if (!preserveStatus) {
			status.textContent = "Times shown in Singapore Time (SGT).";
		}
	} catch (error) {
		showLoadError();
	}
}

async function submitBooking(event) {
	event.preventDefault();
	if (!bookingState.selectedDate || !bookingState.selectedSlot) return;

	const form = event.currentTarget;
	const submit = document.getElementById("booking-submit");
	const status = document.getElementById("booking-status");
	const formData = new FormData(form);

	if (formData.get("website")) return;

	submit.disabled = true;
	submit.textContent = "Confirming...";
	const bookedSlot = bookingState.availability.find(
		(item) => item.booking_date === bookingState.selectedDate && item.slot_key === bookingState.selectedSlot,
	);

	try {
		await callSupabaseRpc("create_consultation_booking", {
			requested_date: bookingState.selectedDate,
			requested_slot: bookingState.selectedSlot,
			requested_name: formData.get("name"),
			requested_contact: formData.get("contact"),
			requested_notes: formData.get("notes"),
		});

		saveContact(formData.get("name"), formData.get("contact"));
		form.elements.notes.value = "";
		bookingState.selectedSlot = "";
		const prefillNote = document.getElementById("booking-prefill-note");
		if (prefillNote) prefillNote.hidden = true;
		await loadAvailability(true);
		if (bookedSlot) {
			showConfirmation(bookedSlot);
		} else {
			status.textContent = "Your consultation is confirmed. I’ll contact you using the details provided.";
			status.className = "booking-status success";
		}
	} catch (error) {
		status.textContent = error.message;
		status.className = "booking-status error";
	} finally {
		setSubmitReady(Boolean(bookingState.selectedSlot));
	}
}

function initializeBooking() {
	const form = document.getElementById("booking-form");
	if (!form) return;
	form.addEventListener("submit", submitBooking);
	applyPrefill(form);
	loadAvailability();
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializeBooking);
} else {
	initializeBooking();
}
