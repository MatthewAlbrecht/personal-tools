import { v } from "convex/values";

/** Shared across `schema.ts` and `albumEnrichmentTrials.ts` for trial rows. */
export const enrichmentSliceKeyValidator = v.union(
	v.literal("artistContext"),
	v.literal("whyListen"),
	v.literal("coverDescriptors"),
	v.literal("occasions"),
);

const artistContextTrialPayloadValidator = v.object({
	origin: v.optional(v.string()),
	activeSince: v.optional(v.string()),
	instagramUrl: v.optional(v.string()),
	artistWriteup: v.optional(v.string()),
	listenIfYouLike: v.optional(v.array(v.string())),
});

const whyListenTrialPayloadValidator = v.object({
	whyListenPitch: v.string(),
});

const tagTrialPayloadValidator = v.object({
	tags: v.array(v.object({ label: v.string() })),
});

/**
 * Same shape as a live single-slice save body — one of `artistContext`,
 * `whyListen`, or the shared tag shape used by `coverDescriptors` /
 * `occasions`. The row's `slice` field disambiguates which shape applies.
 */
export const albumEnrichmentTrialPayloadValidator = v.union(
	artistContextTrialPayloadValidator,
	whyListenTrialPayloadValidator,
	tagTrialPayloadValidator,
);
