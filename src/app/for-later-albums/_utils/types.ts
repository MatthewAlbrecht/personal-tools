import type { Id } from "../../../../convex/_generated/dataModel";

export type ForLaterListenedFilter = "all" | "listened" | "not_listened";
export type ForLaterRymFilter =
	| "all"
	| "has_scrape"
	| "no_scrape"
	| "not_on_rym";

/** Whether every selected tag must match ("all") or any one ("any"), per taxonomy group. */
export type ForLaterTaxonomyMatch = "all" | "any";

export type ForLaterFilters = {
	genreKeys: string[];
	descriptorKeys: string[];
	/** Matches album title or artist name (substring, case-insensitive). */
	search?: string;
	yearMin?: number;
	yearMax?: number;
	listened: ForLaterListenedFilter;
	rymStatus: ForLaterRymFilter;
	genreMatch: ForLaterTaxonomyMatch;
	descriptorMatch: ForLaterTaxonomyMatch;
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
	userAlbumId?: Id<"userAlbums">;
	listenCount: number;
	lastListenedAt?: number;
	rating?: number;
	rymStatus: "matched" | "unmatched";
	rymUrl?: string;
	rymMatchMethod?: "spotify_id" | "title_artist" | "manual";
	rymNotOnSite?: boolean;
	markedAsSingle?: boolean;
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
};
