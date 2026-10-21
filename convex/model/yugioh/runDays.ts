import {
	type RunDay,
	type RunSlot,
	localDate,
	planRunDay,
} from "../../../src/lib/yugioh/run-timing";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { userTimeZone } from "./pushes";

/**
 * Today's plan of full runs in my time zone (the zone of the device I used
 * most recently, else Denver), drawn and stored at the day's first scheduled
 * ask so every later ask that day gets the same slots. Draws come from
 * Math.random.
 */
export async function todaysRunDay(
	ctx: MutationCtx,
	now: number,
): Promise<Doc<"yugiohRunDays">> {
	const timeZone = await userTimeZone(ctx);
	const date = localDate(now, timeZone);
	const stored = await ctx.db
		.query("yugiohRunDays")
		.withIndex("by_date", (q) => q.eq("date", date))
		.first();
	if (stored) return stored;
	const id = await ctx.db.insert(
		"yugiohRunDays",
		planRunDay(date, timeZone, Math.random),
	);
	const inserted = await ctx.db.get("yugiohRunDays", id);
	if (!inserted) throw new Error("The day's run plan wasn't stored.");
	return inserted;
}

/** Stores what became of a day's slots. */
export async function saveSlots(
	ctx: MutationCtx,
	dayId: Id<"yugiohRunDays">,
	slots: RunSlot[],
): Promise<void> {
	await ctx.db.patch("yugiohRunDays", dayId, { slots });
}

/** The latest day's plan (today's, once a scheduled ask drew it); null before any. */
export async function readLatestRunDay(ctx: QueryCtx): Promise<RunDay | null> {
	const day = await ctx.db
		.query("yugiohRunDays")
		.withIndex("by_date")
		.order("desc")
		.first();
	if (!day) return null;
	const { date, timeZone, slots } = day;
	return { date, timeZone, slots };
}
