const SUPABASE_URL = "https://rubfkxwhieqwqjeaoszi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4njA-v1tihYv3JdxLAbVMQ_AhOZiicx";
const BOOKING_DAYS_TO_SHOW = 14;

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
		container.innerHTML = '<p class="booking-empty">No dates are currently available.</p>';
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
			document.getElementById("booking-submit").disabled = true;
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
			document.getElementById("booking-submit").disabled = false;
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
		status.textContent = "Booking is not active yet. Please try again later.";
		status.className = "booking-status error";
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

	try {
		await callSupabaseRpc("create_consultation_booking", {
			requested_date: bookingState.selectedDate,
			requested_slot: bookingState.selectedSlot,
			requested_name: formData.get("name"),
			requested_contact: formData.get("contact"),
			requested_notes: formData.get("notes"),
		});

		form.reset();
		bookingState.selectedSlot = "";
		status.textContent = "Your consultation is confirmed. I’ll contact you using the details provided.";
		status.className = "booking-status success";
		await loadAvailability(true);
	} catch (error) {
		status.textContent = error.message;
		status.className = "booking-status error";
	} finally {
		submit.textContent = "Confirm Consultation";
		submit.disabled = !bookingState.selectedSlot;
	}
}

function initializeBooking() {
	const form = document.getElementById("booking-form");
	if (!form) return;
	form.addEventListener("submit", submitBooking);
	loadAvailability();
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializeBooking);
} else {
	initializeBooking();
}
