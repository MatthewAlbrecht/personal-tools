export type TitleArtistTarget = {
	albumTitleKey: string;
	artistKeys: string[];
};

export type TitleArtistCandidate = {
	albumTitle: string;
	artistNames: string[];
};

export function normalizeAlbumTitle(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(
			/\s+\([^)]*(deluxe|explicit|clean|remaster(ed)?|bonus|bonus tracks|anniversary edition)[^)]*\)$/i,
			"",
		);
}

export function normalizeArtistName(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildArtistKeys(values: string[]): string[] {
	return values.map(normalizeArtistName).filter((value) => value.length > 0);
}

export function artistKeysIntersect(
	left: string[],
	right: string[],
): string | null {
	const leftKeys = new Set(left.map(normalizeArtistName));
	for (const key of right.map(normalizeArtistName)) {
		if (key && leftKeys.has(key)) {
			return key;
		}
	}
	return null;
}

export function findTitleArtistMatch<TCandidate extends TitleArtistCandidate>(
	target: TitleArtistTarget,
	candidates: TCandidate[],
): { candidate: TCandidate; matchedArtistKey: string } | null {
	for (const candidate of candidates) {
		if (normalizeAlbumTitle(candidate.albumTitle) !== target.albumTitleKey) {
			continue;
		}

		const matchedArtistKey = artistKeysIntersect(
			target.artistKeys,
			buildArtistKeys(candidate.artistNames),
		);
		if (matchedArtistKey) {
			return { candidate, matchedArtistKey };
		}
	}

	return null;
}
