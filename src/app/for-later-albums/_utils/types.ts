import type { Id } from "../../../../convex/_generated/dataModel";

export type ForLaterListenedFilter = "all" | "listened" | "not_listened";
export type ForLaterRymFilter =
	| "all"
	| "has_scrape"
	| "no_scrape"
	| "has_candidate"
	| "no_candidate";

/** Whether every active constraint must match ("all") or any one ("any"). */
export type ForLaterFilterMatch = "all" | "any";

export type ForLaterFilters = {
	genreKeys: string[];
	descriptorKeys: string[];
	/** Matches album title or artist name (substring, case-insensitive). */
	search?: string;
	year?: number;
	listened: ForLaterListenedFilter;
	rymStatus: ForLaterRymFilter;
	filterMatch: ForLaterFilterMatch;
};

export type ForLaterAlbumRowData = {
	id: string;
	albumItemId: Id<"forLaterAlbumItems">;
	albumId: Id<"spotifyAlbums">;
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	releaseYear?: number;
	playlistAddedAt?: number;
	firstSeenAt: number;
	createdAt: number;
	lastSeenAt: number;
	removedAt?: number;
	isActive: boolean;
	hasListened: boolean;
	listenCount: number;
	lastListenedAt?: number;
	rymStatus:
		| "matched"
		| "candidate"
		| "searching"
		| "not_found"
		| "failed"
		| "not_started";
	rymUrl?: string;
	rymCandidateConfidence?: "high" | "medium" | "low";
	rymDiscoveryReason?: string;
	rymMatchMethod?: "spotify_id" | "title_artist" | "manual";
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
};
