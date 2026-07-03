export type RobRankingTopLevelGenre = {
	key: string;
	label: string;
	throughGenreLabel?: string;
};

export type RobRankingGenreAlbumInput = {
	position: number;
	albumName: string;
	artistName: string;
};

export type RobRankingGenreAlbum = RobRankingGenreAlbumInput & {
	throughGenres: string[];
};

export type RobRankingAlbumGenreInput = {
	album?: RobRankingGenreAlbumInput;
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
		const uniqueGenres = new Map<
			string,
			{ label: string; throughGenres: Set<string> }
		>();
		for (const genre of entry.genres) {
			const throughGenreLabel = genre.throughGenreLabel ?? genre.label;
			const existing = uniqueGenres.get(genre.key);
			if (existing) {
				existing.throughGenres.add(throughGenreLabel);
			} else {
				uniqueGenres.set(genre.key, {
					label: genre.label,
					throughGenres: new Set([throughGenreLabel]),
				});
			}
		}

		if (uniqueGenres.size === 0) {
			continue;
		}

		albumsWithGenreData += 1;

		for (const [key, genre] of uniqueGenres.entries()) {
			const existing = countsByKey.get(key);
			countsByKey.set(key, {
				label: genre.label,
				count: (existing?.count ?? 0) + 1,
				albums: entry.album
					? [
							...(existing?.albums ?? []),
							{
								...entry.album,
								throughGenres: [...genre.throughGenres].sort(),
							},
						]
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
