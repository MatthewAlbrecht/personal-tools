export type RobRankingTopLevelGenre = {
	key: string;
	label: string;
};

export type RobRankingGenreAlbum = {
	position: number;
	albumName: string;
	artistName: string;
};

export type RobRankingAlbumGenreInput = {
	album?: RobRankingGenreAlbum;
	genres: RobRankingTopLevelGenre[];
};

export type RobRankingGenreCountRow = {
	genreKey: string;
	label: string;
	count: number;
	albums: RobRankingGenreAlbum[];
};

export type RobRankingGenreCountSummary = {
	year: number;
	totalAlbums: number;
	albumsWithGenreData: number;
	albumsMissingGenreData: number;
	genres: RobRankingGenreCountRow[];
};

export function buildRobRankingGenreCountSummary({
	year,
	totalAlbums,
	albumTopLevelGenres,
}: {
	year: number;
	totalAlbums: number;
	albumTopLevelGenres: RobRankingAlbumGenreInput[];
}): RobRankingGenreCountSummary {
	const countsByKey = new Map<
		string,
		{ label: string; count: number; albums: RobRankingGenreAlbum[] }
	>();
	let albumsWithGenreData = 0;

	for (const entry of albumTopLevelGenres) {
		const uniqueGenres = new Map<string, string>();
		for (const genre of entry.genres) {
			uniqueGenres.set(genre.key, genre.label);
		}

		if (uniqueGenres.size === 0) {
			continue;
		}

		albumsWithGenreData += 1;

		for (const [key, label] of uniqueGenres.entries()) {
			const existing = countsByKey.get(key);
			countsByKey.set(key, {
				label,
				count: (existing?.count ?? 0) + 1,
				albums: entry.album
					? [...(existing?.albums ?? []), entry.album]
					: (existing?.albums ?? []),
			});
		}
	}

	const genres = [...countsByKey.entries()]
		.map(([genreKey, value]) => ({
			genreKey,
			label: value.label,
			count: value.count,
			albums: [...value.albums].sort((a, b) => a.position - b.position),
		}))
		.sort((a, b) => {
			const countDiff = b.count - a.count;
			if (countDiff !== 0) return countDiff;
			return a.label.localeCompare(b.label);
		});

	return {
		year,
		totalAlbums,
		albumsWithGenreData,
		albumsMissingGenreData: Math.max(totalAlbums - albumsWithGenreData, 0),
		genres,
	};
}
