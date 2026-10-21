import { type Infer, v } from "convex/values";
import type {
	CardOrder,
	Condition,
	Section,
} from "../../../src/lib/yugioh/deck";

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

export const yugiohCardOrderValidator = v.union(
	v.literal("byCost"),
	v.literal("custom"),
);

/**
 * Where a Printing's TCGplayer product lookup stands: AI is "searching" right
 * after the Printing is added, then it's "found" or "needsPaste".
 */
export const yugiohTcgplayerStatusValidator = v.union(
	v.literal("searching"),
	v.literal("found"),
	v.literal("needsPaste"),
);

// Compile-time check that the validators and the domain library agree.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const sectionsAgree: Same<Infer<typeof yugiohSectionValidator>, Section> = true;
const conditionsAgree: Same<
	Infer<typeof yugiohConditionValidator>,
	Condition
> = true;
const cardOrdersAgree: Same<
	Infer<typeof yugiohCardOrderValidator>,
	CardOrder
> = true;
void sectionsAgree;
void cardOrdersAgree;
void conditionsAgree;
