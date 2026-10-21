import { type Infer, v } from "convex/values";
import type { Condition, Section } from "../../../src/lib/yugioh/deck";

export const yugiohSectionValidator = v.union(
	v.literal("main"),
	v.literal("extra"),
	v.literal("side"),
);

export const yugiohConditionValidator = v.union(
	v.literal("nearMint"),
	v.literal("lightlyPlayed"),
	v.literal("moderatelyPlayed"),
	v.literal("heavilyPlayed"),
);

// Compile-time check that the validators and the domain library agree.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const sectionsAgree: Same<Infer<typeof yugiohSectionValidator>, Section> = true;
const conditionsAgree: Same<
	Infer<typeof yugiohConditionValidator>,
	Condition
> = true;
void sectionsAgree;
void conditionsAgree;
