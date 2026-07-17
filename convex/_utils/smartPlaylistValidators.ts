import { v } from "convex/values";

export const addedWindowValidator = v.union(
	v.object({
		type: v.literal("absolute"),
		afterMs: v.optional(v.number()),
		beforeMs: v.optional(v.number()),
	}),
	v.object({
		type: v.literal("relative"),
		unit: v.union(v.literal("days"), v.literal("months")),
		amount: v.number(),
	}),
	v.object({
		type: v.literal("calendar_month"),
		year: v.number(),
		month: v.number(),
	}),
);

export const genreClauseValidator = v.object({
	genreKey: v.string(),
	mode: v.union(v.literal("include"), v.literal("exclude")),
	role: v.union(
		v.literal("primary"),
		v.literal("secondary"),
		v.literal("either"),
	),
});

export const smartPlaylistFiltersV2Validator = v.object({
	genreClauses: v.array(genreClauseValidator),
	genreMatch: v.union(v.literal("all"), v.literal("any")),
	descriptorKeys: v.array(v.string()),
	descriptorMatch: v.union(v.literal("all"), v.literal("any")),
	ratingMin: v.number(),
	ratingMax: v.number(),
	yearMin: v.optional(v.number()),
	yearMax: v.optional(v.number()),
	durationMinMinutes: v.optional(v.number()),
	durationMaxMinutes: v.optional(v.number()),
	durationOpenLow: v.optional(v.boolean()),
	durationOpenHigh: v.optional(v.boolean()),
	addedWindow: v.optional(addedWindowValidator),
	excludedAlbumIds: v.array(v.id("spotifyAlbums")),
});

export const smartPlaylistFiltersValidator = smartPlaylistFiltersV2Validator;

export const trackSelectionValidator = v.object({
	mode: v.literal("allTracks"),
});

export const smartPlaylistSourceValidator = v.union(
	v.literal("forLater"),
	v.literal("rankings"),
);

export const smartPlaylistSyncModeValidator = v.union(
	v.literal("mirror"),
	v.literal("addOnly"),
);

export const smartPlaylistSyncStatusValidator = v.union(
	v.literal("never"),
	v.literal("ok"),
	v.literal("error"),
);
