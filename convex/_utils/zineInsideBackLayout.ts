import { v } from "convex/values";

export const zineInsideBackContentAlignValidator = v.union(
	v.literal("center"),
	v.literal("right"),
);

export const zineInsideBackArtistDisplayValidator = v.union(
	v.literal("newline"),
	v.literal("inline"),
);

export const zineInsideBackLayoutMutationValidator = v.object({
	marginTopPt: v.number(),
	marginRightPt: v.number(),
	marginBottomPt: v.number(),
	marginLeftPt: v.number(),
	contentAlign: zineInsideBackContentAlignValidator,
	artistDisplay: zineInsideBackArtistDisplayValidator,
});
