import { v } from "convex/values";

export const zineInsideBackContentAreaAlignValidator = v.union(
	v.literal("top"),
	v.literal("center"),
);

/** Accepts legacy horizontal `"right"` values still stored in the database. */
export const zineInsideBackContentAlignStoredValidator = v.union(
	v.literal("top"),
	v.literal("center"),
	v.literal("right"),
);

export const zineInsideBackArtistDisplayValidator = v.union(
	v.literal("newline"),
	v.literal("inline"),
);

export const zineInsideBackRecommendationRowAlignValidator = v.union(
	v.literal("top"),
	v.literal("center"),
);

export const zineInsideBackLayoutMutationValidator = v.object({
	marginTopPt: v.number(),
	marginRightPt: v.number(),
	marginBottomPt: v.number(),
	marginLeftPt: v.number(),
	contentAreaAlign: zineInsideBackContentAreaAlignValidator,
	artistDisplay: zineInsideBackArtistDisplayValidator,
	recommendationRowAlign: zineInsideBackRecommendationRowAlignValidator,
});
