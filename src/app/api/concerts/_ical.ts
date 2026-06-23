export type CalendarConcertEvent = {
	tmEventId: string;
	name: string;
	status: "interested" | "owned";
	dateTime?: string;
	localDate?: string;
	url?: string;
	venueName: string;
	venueAddress?: string;
	venueCity?: string;
	venueStateCode?: string;
};

export function renderConcertCalendar({
	productId,
	events,
}: {
	productId: string;
	events: CalendarConcertEvent[];
}): string {
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		`PRODID:-//${escapeIcsText(productId)}//Concert Tracker//EN`,
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
	];

	for (const event of events) {
		lines.push(...renderConcertEvent(productId, event));
	}

	lines.push("END:VCALENDAR");
	return `${lines.join("\r\n")}\r\n`;
}

export function escapeIcsText(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll(",", "\\,")
		.replaceAll(";", "\\;")
		.replaceAll("\r\n", "\\n")
		.replaceAll("\n", "\\n")
		.replaceAll("\r", "\\n");
}

function renderConcertEvent(
	productId: string,
	event: CalendarConcertEvent,
): string[] {
	const statusLabel = event.status === "owned" ? "Owned" : "Interested";
	const location = [
		event.venueName,
		event.venueAddress,
		event.venueCity,
		event.venueStateCode,
	]
		.filter(Boolean)
		.join(", ");

	const lines = [
		"BEGIN:VEVENT",
		`UID:${escapeIcsText(event.tmEventId)}@${escapeIcsText(productId)}`,
		`SUMMARY:${escapeIcsText(`[${statusLabel}] ${event.name}`)}`,
		`LOCATION:${escapeIcsText(location)}`,
		`DTSTAMP:${formatUtcDateTime(new Date())}`,
	];

	if (event.dateTime) {
		lines.push(`DTSTART:${formatUtcDateTime(new Date(event.dateTime))}`);
	} else if (event.localDate) {
		lines.push(`DTSTART;VALUE=DATE:${event.localDate.replaceAll("-", "")}`);
	}

	if (event.url) {
		lines.push(`DESCRIPTION:${escapeIcsText(event.url)}`);
		lines.push(`URL:${event.url}`);
	}

	lines.push("END:VEVENT");
	return lines;
}

function formatUtcDateTime(date: Date): string {
	return date
		.toISOString()
		.replaceAll("-", "")
		.replaceAll(":", "")
		.replace(/\.\d{3}Z$/, "Z");
}
