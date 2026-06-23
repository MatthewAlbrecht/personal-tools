import assert from "node:assert/strict";
import test from "node:test";
import { escapeIcsText, renderConcertCalendar } from "./_ical";

test("escapeIcsText escapes calendar special characters", () => {
	assert.equal(escapeIcsText("A, B; C\\D\nE"), "A\\, B\\; C\\\\D\\nE");
});

test("renderConcertCalendar emits stable event uid and owned status", () => {
	const calendar = renderConcertCalendar({
		productId: "moooose-concert-tracker",
		events: [
			{
				tmEventId: "tm-event-1",
				name: "Waxahatchee",
				status: "owned",
				dateTime: "2026-07-02T02:00:00Z",
				localDate: "2026-07-01",
				url: "https://example.com/event",
				venueName: "Bluebird Theater",
				venueAddress: "3317 E Colfax Ave",
				venueCity: "Denver",
				venueStateCode: "CO",
			},
		],
	});

	assert.match(calendar, /BEGIN:VCALENDAR/);
	assert.match(calendar, /UID:tm-event-1@moooose-concert-tracker/);
	assert.match(calendar, /SUMMARY:\[Owned\] Waxahatchee/);
	assert.match(
		calendar,
		/LOCATION:Bluebird Theater\\, 3317 E Colfax Ave\\, Denver\\, CO/,
	);
});
