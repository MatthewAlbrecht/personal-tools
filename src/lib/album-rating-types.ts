export type AlbumToRate = {
	userAlbumId: string;
	albumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	currentRating?: number;
	currentPosition?: number;
};

export type RankedAlbumForYear = {
	_id: string;
	albumId: string;
	rating?: number;
	position?: number;
	album: {
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	} | null;
};
