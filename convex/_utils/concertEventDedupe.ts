export type ConcertEventDedupeInput = {
	name: string;
	localDate?: string;
	dateTime?: string;
	attractionNames: string[];
};

export type ConcertEventDedupeParts = {
	baseKey: string;
	eventDate?: string;
};

export function getConcertEventDedupeParts({
	event,
	tmVenueId,
}: {
	event: ConcertEventDedupeInput;
	tmVenueId: string;
}): ConcertEventDedupeParts {
	const eventKey =
		getPrimaryAttractionKey(event.attractionNames) ||
		normalizeEventName(event.name);

	return {
		baseKey: `${tmVenueId}:${eventKey}`,
		eventDate: getConcertEventDate(event),
	};
}

export function getInitialConcertEventDedupeKey({
	baseKey,
	eventDate,
}: ConcertEventDedupeParts): string {
	return eventDate ? `${baseKey}:${eventDate}` : baseKey;
}

export function getConcertEventDate({
	dateTime,
	localDate,
}: {
	dateTime?: string;
	localDate?: string;
}): string | undefined {
	return localDate ?? dateTime?.slice(0, 10);
}

export function getBestConcertEventName(names: string[]): string {
	const [representative] = names
		.filter(Boolean)
		.sort((a, b) => getEventNameScore(a) - getEventNameScore(b));

	return representative ?? "";
}

export function cleanConcertEventNameForDisplay(value: string): string {
	const cleaned = stripCommonSuffixes(value)
		.replace(/^\s*club level seating:\s*/i, "")
		.replace(/:\s*.*\btour\b.*$/i, "")
		.replace(/\s+/g, " ")
		.trim();

	return cleaned || value;
}

export function areConcertDatesInSameRun(
	existingDates: string[],
	eventDate: string | undefined,
): boolean {
	if (!eventDate || existingDates.length === 0) return false;

	return existingDates.some((existingDate) => {
		const delta = Math.abs(getDateDeltaDays(existingDate, eventDate));
		return delta <= 1;
	});
}

export function mergeConcertEventDates(
	existingDates: string[],
	nextDate: string | undefined,
): string[] {
	return uniqueSortedStrings(
		nextDate ? [...existingDates, nextDate] : existingDates,
	);
}

export function getConcertDateRange(dates: string[]): {
	dateRangeStart?: string;
	dateRangeEnd?: string;
} {
	const sortedDates = uniqueSortedStrings(dates);
	return {
		dateRangeStart: sortedDates[0],
		dateRangeEnd: sortedDates[sortedDates.length - 1],
	};
}

export function mergeTicketmasterEventIds(ids: string[]): string[] {
	return uniqueSortedStrings(ids);
}

export function getStrongerConcertStatus(
	a: "new" | "interested" | "owned" | "ignored",
	b: "new" | "interested" | "owned" | "ignored",
): "new" | "interested" | "owned" | "ignored" {
	return getStatusRank(a) <= getStatusRank(b) ? a : b;
}

function getPrimaryAttractionKey(attractionNames: string[]): string {
	const attractionName = attractionNames.find(
		(name) => !isNoisyAttractionName(name),
	);

	return attractionName ? normalizeText(attractionName) : "";
}

function isNoisyAttractionName(value: string): boolean {
	return /\b(club level|parking|seating|suite|vip)\b/i.test(value);
}

function normalizeEventName(value: string): string {
	return normalizeText(cleanConcertEventNameForDisplay(value));
}

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function getEventNameScore(value: string): number {
	let score = value.length;

	if (/\b(club level|parking|seating|suite|vip)\b/i.test(value)) {
		score += 1000;
	}

	if (hasCommonSuffix(value)) {
		score += 100;
	}

	if (/:\s*.*\btour\b/i.test(value)) {
		score += 25;
	}

	return score;
}

function stripCommonSuffixes(value: string): string {
	let cleaned = value;

	while (hasCommonSuffix(cleaned)) {
		cleaned = cleaned
			.replace(/\s+-\s+\d{2}\+$/i, "")
			.replace(/\s+-\s+[a-z][a-z\s.'-]+,\s*[a-z]{2}$/i, "")
			.replace(
				/\s+-\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
				"",
			)
			.trim();
	}

	return cleaned;
}

function hasCommonSuffix(value: string): boolean {
	return (
		/\s+-\s+\d{2}\+$/i.test(value) ||
		/\s+-\s+[a-z][a-z\s.'-]+,\s*[a-z]{2}$/i.test(value) ||
		/\s+-\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(
			value,
		)
	);
}

function getDateDeltaDays(from: string, to: string): number {
	const fromTime = getLocalDateTimestamp(from);
	const toTime = getLocalDateTimestamp(to);

	if (fromTime === undefined || toTime === undefined) {
		return Number.POSITIVE_INFINITY;
	}

	return Math.round((toTime - fromTime) / 86_400_000);
}

function getLocalDateTimestamp(value: string): number | undefined {
	const [year, month, day] = value.split("-").map(Number);

	if (!year || !month || !day) {
		return undefined;
	}

	return new Date(year, month - 1, day).getTime();
}

function uniqueSortedStrings(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean))).sort();
}

function getStatusRank(
	status: "new" | "interested" | "owned" | "ignored",
): number {
	switch (status) {
		case "owned":
			return 0;
		case "interested":
			return 1;
		case "new":
			return 2;
		case "ignored":
			return 3;
	}
}
