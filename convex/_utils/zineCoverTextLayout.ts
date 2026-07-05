import { v } from "convex/values";

export const zineCoverTextAnchorValidator = v.union(
	v.literal("top-left"),
	v.literal("top-center"),
	v.literal("top-right"),
	v.literal("center-left"),
	v.literal("center"),
	v.literal("center-right"),
	v.literal("bottom-left"),
	v.literal("bottom-center"),
	v.literal("bottom-right"),
);

export const zineCoverTextAlignValidator = v.union(
	v.literal("left"),
	v.literal("center"),
	v.literal("right"),
);

export const zineCoverTextLayoutMutationValidator = v.object({
	anchor: zineCoverTextAnchorValidator,
	textAlign: zineCoverTextAlignValidator,
	offsetXIn: v.number(),
	offsetYIn: v.number(),
});
