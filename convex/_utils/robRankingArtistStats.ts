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

export type ArtistHighestPlacementRow = {
	artistKey: string;
	displayName: string;
	bestPlacement: number;
	bestPlacementYear: number;
};

export type ArtistUniqueTier =
	| "wins"
	| "top3"
	| "top5"
	| "top10"
	| "top25"
	| "top50";

export type ArtistUniqueTierRow = {
	artistKey: string;
	displayName: string;
	tierBestPlacement: number;
	tierBestPlacementYear: number;
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

export function dedupeArtistNames(names: string[]): string[] {
	const seenKeys = new Set<string>();
	const resolved: string[] = [];

	for (const name of names) {
		const trimmed = name.trim();
		if (!trimmed) continue;
		const key = normalizeArtistName(trimmed);
		if (!key || seenKeys.has(key)) continue;
		seenKeys.add(key);
		resolved.push(trimmed);
	}

	return resolved;
}

/** Manual rankings: one artist string, no comma splitting. */
export function resolveSingleArtistName(raw: string): string[] {
	const trimmed = raw.trim();
	if (!trimmed) return [];
	const key = normalizeArtistName(trimmed);
	if (!key) return [];
	return [trimmed];
}

export function resolveArtistNamesFromRaw(raw: string): string[] {
	return dedupeArtistNames(splitArtistNames(raw));
}

/** Spotify albums: structured artists from rawData; comma-split artistName as fallback. */
export function resolveArtistNamesFromSpotifyAlbum(album: {
	artistName: string;
	rawData?: string;
}): string[] {
	if (album.rawData) {
		try {
			const parsed = JSON.parse(album.rawData) as {
				artists?: Array<{ name?: string }>;
			};
			const names =
				parsed.artists
					?.map((artist) => artist.name)
					.filter((name): name is string => Boolean(name)) ?? [];
			if (names.length > 0) {
				return dedupeArtistNames(names);
			}
		} catch {
			// fall through to artistName
		}
	}

	if (!album.artistName.trim()) return [];

	return resolveArtistNamesFromRaw(album.artistName);
}

export function resolveArtistNamesForRankingEntry(
	ranking: {
		artistNames?: string[];
		manualArtistName?: string;
	},
	options: {
		isManual: boolean;
		spotifyAlbum: { artistName: string; rawData?: string } | null;
	},
): string[] {
	if (ranking.artistNames && ranking.artistNames.length > 0) {
		return dedupeArtistNames(ranking.artistNames);
	}

	if (options.isManual) {
		const manualArtist = ranking.manualArtistName?.trim();
		if (!manualArtist) return [];
		return resolveSingleArtistName(manualArtist);
	}

	if (!options.spotifyAlbum?.artistName) return [];

	return resolveArtistNamesFromSpotifyAlbum(options.spotifyAlbum);
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

type HighestPlacementAccumulator = {
	displayName: string;
	bestPlacement: number;
	bestPlacementYear: number;
};

export function buildArtistHighestPlacementRows(
	entries: ArtistFinishInput[],
): ArtistHighestPlacementRow[] {
	const sortedEntries = [...entries].sort((a, b) => b.year - a.year);
	const byKey = new Map<string, HighestPlacementAccumulator>();

	for (const entry of sortedEntries) {
		const seenInEntry = new Set<string>();

		for (const artistName of entry.artistNames) {
			const artistKey = normalizeArtistName(artistName);
			if (!artistKey || seenInEntry.has(artistKey)) continue;
			seenInEntry.add(artistKey);

			const existing = byKey.get(artistKey);
			if (!existing) {
				byKey.set(artistKey, {
					displayName: artistName.trim() || titleCaseArtistKey(artistKey),
					bestPlacement: entry.position,
					bestPlacementYear: entry.year,
				});
				continue;
			}

			if (entry.position < existing.bestPlacement) {
				existing.bestPlacement = entry.position;
				existing.bestPlacementYear = entry.year;
				continue;
			}

			if (
				entry.position === existing.bestPlacement &&
				entry.year > existing.bestPlacementYear
			) {
				existing.bestPlacementYear = entry.year;
			}
		}
	}

	return [...byKey.entries()]
		.map(([artistKey, accumulator]) => ({
			artistKey,
			displayName: accumulator.displayName,
			bestPlacement: accumulator.bestPlacement,
			bestPlacementYear: accumulator.bestPlacementYear,
		}))
		.sort((a, b) => {
			if (a.bestPlacement !== b.bestPlacement) {
				return a.bestPlacement - b.bestPlacement;
			}
			return a.displayName.localeCompare(b.displayName);
		});
}

function getTierMaxPosition(tier: ArtistUniqueTier): number {
	switch (tier) {
		case "wins":
			return 1;
		case "top3":
			return 3;
		case "top5":
			return 5;
		case "top10":
			return 10;
		case "top25":
			return 25;
		case "top50":
			return 50;
	}
}

type UniqueTierAccumulator = {
	displayName: string;
	tierBestPlacement: number;
	tierBestPlacementYear: number;
};

export function buildArtistUniqueTierRows(
	entries: ArtistFinishInput[],
	tier: ArtistUniqueTier,
): ArtistUniqueTierRow[] {
	const maxPosition = getTierMaxPosition(tier);
	const sortedEntries = [...entries].sort((a, b) => b.year - a.year);
	const byKey = new Map<string, UniqueTierAccumulator>();

	for (const entry of sortedEntries) {
		if (entry.position > maxPosition) continue;

		const seenInEntry = new Set<string>();

		for (const artistName of entry.artistNames) {
			const artistKey = normalizeArtistName(artistName);
			if (!artistKey || seenInEntry.has(artistKey)) continue;
			seenInEntry.add(artistKey);

			const existing = byKey.get(artistKey);
			if (!existing) {
				byKey.set(artistKey, {
					displayName: artistName.trim() || titleCaseArtistKey(artistKey),
					tierBestPlacement: entry.position,
					tierBestPlacementYear: entry.year,
				});
				continue;
			}

			if (entry.position < existing.tierBestPlacement) {
				existing.tierBestPlacement = entry.position;
				existing.tierBestPlacementYear = entry.year;
				continue;
			}

			if (
				entry.position === existing.tierBestPlacement &&
				entry.year > existing.tierBestPlacementYear
			) {
				existing.tierBestPlacementYear = entry.year;
			}
		}
	}

	return [...byKey.entries()]
		.map(([artistKey, accumulator]) => ({
			artistKey,
			displayName: accumulator.displayName,
			tierBestPlacement: accumulator.tierBestPlacement,
			tierBestPlacementYear: accumulator.tierBestPlacementYear,
		}))
		.sort((a, b) => {
			if (a.tierBestPlacement !== b.tierBestPlacement) {
				return a.tierBestPlacement - b.tierBestPlacement;
			}
			return a.displayName.localeCompare(b.displayName);
		});
}
