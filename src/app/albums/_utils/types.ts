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

// Canonical track data (from spotifyTracksCanonical)
export type CanonicalTrack = {
	spotifyTrackId: string;
	trackName: string;
	artistName: string;
	albumName?: string;
	albumImageUrl?: string;
	spotifyAlbumId?: string;
	durationMs?: number;
	trackNumber?: number;
	isExplicit?: boolean;
	previewUrl?: string;
	rawData?: string;
};

// Track item for tracks view (user track with nested canonical data)
export type TrackItem = {
	_id: string;
	userId: string;
	spotifyTrackId: string;
	firstSeenAt: number;
	lastSeenAt: number;
	lastPlayedAt?: number;
	lastLikedAt?: number;
	lastCategorizedAt?: number;
	track: CanonicalTrack;
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
	currentRating?: number; // Existing rating for re-ranking
	currentPosition?: number; // Existing position for re-ranking
};
