export function formatVenueLocation({
	city,
	stateCode,
	postalCode,
}: {
	city?: string;
	stateCode?: string;
	postalCode?: string;
}): string {
	return [city, stateCode, postalCode].filter(Boolean).join(", ");
}

export function formatEventDate({
	dateTime,
	dateRangeEnd,
	dateRangeStart,
	eventDates,
	localDate,
}: {
	dateTime?: string;
	dateRangeEnd?: string;
	dateRangeStart?: string;
	eventDates?: string[];
	localDate?: string;
	localTime?: string;
}): string {
	if (eventDates && eventDates.length > 0) {
		return formatEventDateRange(eventDates.map((localDate) => ({ localDate })));
	}

	if (dateRangeStart && dateRangeEnd && dateRangeStart !== dateRangeEnd) {
		return `${formatLocalDate(dateRangeStart)} - ${formatLocalDate(dateRangeEnd)}`;
	}

	const eventDate = getEventDate({ dateTime, localDate });
	return eventDate ? formatLocalDate(eventDate) : "Date unavailable";
}

export function formatEventDateRange(
	events: {
		dateTime?: string;
		localDate?: string;
	}[],
): string {
	const dates = Array.from(
		new Set(
			events
				.map((event) => getEventDate(event))
				.filter((date): date is string => Boolean(date)),
		),
	).sort();

	if (dates.length === 0) {
		return "Date unavailable";
	}

	const firstDate = dates[0];
	const lastDate = dates[dates.length - 1];

	if (!firstDate || !lastDate) {
		return "Date unavailable";
	}

	if (dates.length === 1) {
		return formatLocalDate(firstDate);
	}

	return `${formatLocalDate(firstDate)} - ${formatLocalDate(lastDate)}`;
}

export function buildGoogleSearchUrl(query: string): string {
	return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function formatConcertStatusLabel(status: string): string {
	switch (status) {
		case "owned":
			return "Ticketed";
		case "interested":
			return "Interested";
		case "ignored":
			return "Ignored";
		default:
			return "New";
	}
}

export function getTodayDateKey(): string {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, "0");
	const day = String(today.getDate()).padStart(2, "0");

	return `${year}-${month}-${day}`;
}

export function getEventDate({
	dateTime,
	localDate,
}: {
	dateTime?: string;
	localDate?: string;
}): string | undefined {
	return localDate ?? dateTime?.slice(0, 10);
}

function formatLocalDate(value: string): string {
	const [year, month, day] = value.split("-").map(Number);

	if (!year || !month || !day) {
		return value;
	}

	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
	}).format(new Date(year, month - 1, day));
}
