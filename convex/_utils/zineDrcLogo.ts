import { v } from "convex/values";

export const zineDrcLogoCornerValidator = v.union(
	v.literal("top-left"),
	v.literal("top-right"),
	v.literal("bottom-left"),
	v.literal("bottom-right"),
);
