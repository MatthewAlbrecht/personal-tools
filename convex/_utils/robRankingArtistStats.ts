import { normalizeArtistName } from "./albumMatchingCore";

export type ArtistFinishInput = {
	position: number;
	artistNames: string[];
	year: number;
};

export type ArtistStatsRow = {
	artistKey: string;
	displayName: string;
	wins: number;
	top3: number;
	top5: number;
	top10: number;
	top25: number;
	top50: number;
	yearsAppeared: number;
};

type ArtistAccumulator = {
	displayName: string;
	wins: number;
	top3: number;
	top5: number;
	top10: number;
	top25: number;
	top50: number;
	years: Set<number>;
};

export function splitArtistNames(raw: string): string[] {
	return raw
		.split(", ")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

export function resolveArtistNamesFromRaw(raw: string): string[] {
	const names = splitArtistNames(raw);
	const seenKeys = new Set<string>();
	const resolved: string[] = [];

	for (const name of names) {
		const key = normalizeArtistName(name);
		if (!key || seenKeys.has(key)) continue;
		seenKeys.add(key);
		resolved.push(name.trim());
	}

	return resolved;
}

function titleCaseArtistKey(key: string): string {
	return key
		.split(" ")
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function incrementTierCounts(
	accumulator: ArtistAccumulator,
	position: number,
): void {
	if (position === 1) accumulator.wins += 1;
	if (position <= 3) accumulator.top3 += 1;
	if (position <= 5) accumulator.top5 += 1;
	if (position <= 10) accumulator.top10 += 1;
	if (position <= 25) accumulator.top25 += 1;
	if (position <= 50) accumulator.top50 += 1;
}

export function buildArtistStatsRows(
	entries: ArtistFinishInput[],
): ArtistStatsRow[] {
	const sortedEntries = [...entries].sort((a, b) => b.year - a.year);
	const byKey = new Map<string, ArtistAccumulator>();

	for (const entry of sortedEntries) {
		const seenInEntry = new Set<string>();

		for (const artistName of entry.artistNames) {
			const artistKey = normalizeArtistName(artistName);
			if (!artistKey || seenInEntry.has(artistKey)) continue;
			seenInEntry.add(artistKey);

			let accumulator = byKey.get(artistKey);
			if (!accumulator) {
				accumulator = {
					displayName: artistName.trim() || titleCaseArtistKey(artistKey),
					wins: 0,
					top3: 0,
					top5: 0,
					top10: 0,
					top25: 0,
					top50: 0,
					years: new Set<number>(),
				};
				byKey.set(artistKey, accumulator);
			}

			incrementTierCounts(accumulator, entry.position);
			accumulator.years.add(entry.year);
		}
	}

	return [...byKey.entries()]
		.map(([artistKey, accumulator]) => ({
			artistKey,
			displayName: accumulator.displayName,
			wins: accumulator.wins,
			top3: accumulator.top3,
			top5: accumulator.top5,
			top10: accumulator.top10,
			top25: accumulator.top25,
			top50: accumulator.top50,
			yearsAppeared: accumulator.years.size,
		}))
		.sort((a, b) => {
			if (b.wins !== a.wins) return b.wins - a.wins;
			if (b.top3 !== a.top3) return b.top3 - a.top3;
			return a.displayName.localeCompare(b.displayName);
		});
}
