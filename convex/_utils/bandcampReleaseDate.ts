const MONTH_NAMES: Record<string, number> = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

function padTwo(value: number): string {
	return value.toString().padStart(2, "0");
}

function parseMonthDayYear(text: string): string | undefined {
	const match = text.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/);
	if (!match) {
		return undefined;
	}

	const month = MONTH_NAMES[match[1]!.toLowerCase()];
	if (!month) {
		return undefined;
	}

	const day = Number.parseInt(match[2]!, 10);
	const year = Number.parseInt(match[3]!, 10);
	if (Number.isNaN(day) || Number.isNaN(year)) {
		return undefined;
	}

	return `${year}-${padTwo(month)}-${padTwo(day)}`;
}

function parseYearOnly(text: string): string | undefined {
	const match = text.match(/^(19|20)\d{2}$/);
	return match?.[0];
}

function parseYear(text: string): string | undefined {
	const match = text.match(/\b(19|20)\d{2}\b/);
	return match?.[0];
}

export function parseBandcampReleaseDate(raw: string): string | undefined {
	const text = raw.replace(/^(?:released|releases)\s+/i, "").trim();
	if (!text) {
		return undefined;
	}

	const monthDayYear = parseMonthDayYear(text);
	if (monthDayYear) {
		return monthDayYear;
	}

	const yearOnly = parseYearOnly(text);
	if (yearOnly) {
		return yearOnly;
	}

	const parsed = Date.parse(text);
	if (!Number.isNaN(parsed)) {
		const date = new Date(parsed);
		return `${date.getUTCFullYear()}-${padTwo(date.getUTCMonth() + 1)}-${padTwo(date.getUTCDate())}`;
	}

	return parseYear(text);
}
