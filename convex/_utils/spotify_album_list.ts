export type SpotifyAlbumDoc = {
	_id: string;
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	totalTracks: number;
	createdAt: number;
	updatedAt?: number;
	rawData?: string;
	_creationTime?: number;
	genres?: string[];
};

export type SpotifyAlbumListItem = Pick<
	SpotifyAlbumDoc,
	| "_id"
	| "spotifyAlbumId"
	| "name"
	| "artistName"
	| "imageUrl"
	| "releaseDate"
	| "totalTracks"
	| "createdAt"
>;

export function buildSpotifyAlbumListItems(
	albums: SpotifyAlbumDoc[],
): SpotifyAlbumListItem[] {
	return [...albums]
		.sort((a, b) => b.createdAt - a.createdAt)
		.map((a) => ({
			_id: a._id,
			spotifyAlbumId: a.spotifyAlbumId,
			name: a.name,
			artistName: a.artistName,
			imageUrl: a.imageUrl,
			releaseDate: a.releaseDate,
			totalTracks: a.totalTracks,
			createdAt: a.createdAt,
		}));
}
