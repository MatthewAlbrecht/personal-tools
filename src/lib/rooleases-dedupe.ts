// Pure helper shared by the Rooleases check routes. Relative imports only.

/**
 * Keeps the first track for each artist + exact track name, so a song released
 * as a single and again on an album is added once. Sort oldest-first before
 * calling this so the earliest release wins.
 */
export function keepFirstPerArtistAndName<
	T extends { artistId: string; trackName: string },
>(tracks: T[]): T[] {
	const seen = new Set<string>();
	return tracks.filter((track) => {
		const key = `${track.artistId}\u0000${track.trackName}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
