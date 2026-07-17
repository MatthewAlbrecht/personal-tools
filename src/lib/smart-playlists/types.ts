import type { SubTier, TierName } from "~/lib/album-tiers";

export type SmartPlaylistSource = "forLater" | "rankings";
export type SmartPlaylistSyncMode = "mirror" | "addOnly";

export type TrackSelection = {
	mode: "allTracks";
};

export type AddedWindow =
	| { type: "absolute"; afterMs?: number; beforeMs?: number }
	| { type: "relative"; unit: "days" | "months"; amount: number }
	| { type: "calendar_month"; year: number; month: number }; // month 1-12

export type GenreRole = "primary" | "secondary" | "either";

export type GenreClause = {
	genreKey: string;
	mode: "include" | "exclude";
	role: GenreRole;
};

export type SmartPlaylistFilters = {
	genreClauses: GenreClause[];
	genreMatch: "all" | "any";
	descriptorKeys: string[];
	descriptorMatch: "all" | "any";
	ratingMin: number;
	ratingMax: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationOpenLow?: boolean;
	durationOpenHigh?: boolean;
	/** For Later only; evaluated at resolve/sync time */
	addedWindow?: AddedWindow;
	/** Convex Id<"spotifyAlbums"> as string on the client */
	excludedAlbumIds: string[];
};

export const EMPTY_SMART_PLAYLIST_FILTERS: SmartPlaylistFilters = {
	genreClauses: [],
	genreMatch: "any",
	descriptorKeys: [],
	descriptorMatch: "any",
	ratingMin: 1,
	ratingMax: 15,
	durationOpenLow: true,
	durationOpenHigh: true,
	excludedAlbumIds: [],
};

export type RatingSelection =
	| { tier: TierName; subTier?: SubTier }
	| { minTier: TierName };
