export function parseReleaseYearFromIsoDate(
	releaseDate: string | undefined,
): number | undefined {
	if (!releaseDate || releaseDate.length < 4) {
		return undefined;
	}
	const yearStr = releaseDate.slice(0, 4);
	if (!/^\d{4}$/.test(yearStr)) {
		return undefined;
	}
	const year = Number.parseInt(yearStr, 10);
	return Number.isFinite(year) ? year : undefined;
}

export function buildFilterGenreKeysSorted(
	primaryGenres: Array<{ key: string }>,
	secondaryGenres: Array<{ key: string }>,
): string[] {
	const keys = new Set<string>();
	for (const t of primaryGenres) {
		keys.add(t.key);
	}
	for (const t of secondaryGenres) {
		keys.add(t.key);
	}
	return [...keys].sort();
}

export function buildFilterDescriptorKeysSorted(
	descriptors: Array<{ key: string }>,
): string[] {
	const keys = new Set<string>();
	for (const t of descriptors) {
		keys.add(t.key);
	}
	return [...keys].sort();
}
