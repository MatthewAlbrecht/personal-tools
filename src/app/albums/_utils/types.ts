/**
 * Shared types for the albums feature
 */

// Album info embedded in various records
export type AlbumInfo = {
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
};

// History listen record
export type HistoryListen = {
	_id: string;
	albumId: string;
	listenedAt: number;
	album: AlbumInfo | null;
};

// Ranked album item for rankings view
export type RankedAlbumItem = {
	_id: string;
	albumId: string;
	rating?: number;
	position?: number;
	album: AlbumInfo | null;
};

// Track item for tracks view
export type TrackItem = {
	_id: string;
	trackId: string;
	trackName: string;
	artistName: string;
	albumName?: string;
	albumImageUrl?: string;
	spotifyAlbumId?: string;
	lastPlayedAt?: number;
	releaseDate?: string;
};

// Album item for all albums view
export type AlbumItem = {
	_id: string;
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	totalTracks?: number;
	createdAt: number;
};

// User album data for listen tracking
export type UserAlbumData = {
	listenCount?: number;
	lastListenedAt?: number;
	firstListenedAt?: number;
	rating?: number;
};

// Album to rate in the ranker drawer
export type AlbumToRate = {
	userAlbumId: string;
	albumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
};
