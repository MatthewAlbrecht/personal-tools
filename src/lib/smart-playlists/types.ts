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

export type SmartPlaylistFilters = {
	genreKeys: string[];
	genreMatch: "all" | "any";
	/** When true, genre keys must appear in primaryGenres only */
	primaryGenresOnly: boolean;
	descriptorKeys: string[];
	descriptorMatch: "all" | "any";
	ratingMin?: number;
	ratingMax?: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationBucketKey?: string;
	/** For Later only; evaluated at resolve/sync time */
	addedWindow?: AddedWindow;
};

export type RatingSelection =
	| { tier: TierName; subTier?: SubTier }
	| { minTier: TierName };
