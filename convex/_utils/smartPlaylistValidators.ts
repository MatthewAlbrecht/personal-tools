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

export const smartPlaylistFiltersValidator = v.object({
	genreKeys: v.array(v.string()),
	genreMatch: v.union(v.literal("all"), v.literal("any")),
	primaryGenresOnly: v.boolean(),
	descriptorKeys: v.array(v.string()),
	descriptorMatch: v.union(v.literal("all"), v.literal("any")),
	ratingMin: v.optional(v.number()),
	ratingMax: v.optional(v.number()),
	yearMin: v.optional(v.number()),
	yearMax: v.optional(v.number()),
	durationMinMinutes: v.optional(v.number()),
	durationMaxMinutes: v.optional(v.number()),
	durationBucketKey: v.optional(v.string()),
	addedWindow: v.optional(addedWindowValidator),
});

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
