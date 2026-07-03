export type RobRankingTopLevelGenre = {
	key: string;
	label: string;
};

export type RobRankingGenreCountRow = {
	genreKey: string;
	label: string;
	count: number;
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
	albumTopLevelGenres: RobRankingTopLevelGenre[][];
}): RobRankingGenreCountSummary {
	const countsByKey = new Map<string, { label: string; count: number }>();
	let albumsWithGenreData = 0;

	for (const genresForAlbum of albumTopLevelGenres) {
		const uniqueGenres = new Map<string, string>();
		for (const genre of genresForAlbum) {
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
			});
		}
	}

	const genres = [...countsByKey.entries()]
		.map(([genreKey, value]) => ({
			genreKey,
			label: value.label,
			count: value.count,
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
