import type { Infer } from "convex/values";
import {
	LONGEST_CHANGE_WINDOW,
	type PriceChanges,
	priceChanges,
} from "../../../src/lib/henry/changes";
import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type {
	henryLedgerUnitValidator,
	henryTimelineEntryValidator,
	henryUnitDetailsValidator,
} from "./validators";

export type HenryLedgerUnit = Infer<typeof henryLedgerUnitValidator>;
export type HenryUnitDetails = Infer<typeof henryUnitDetailsValidator>;
type TimelineEntry = Infer<typeof henryTimelineEntryValidator>;

const DAY = 24 * 60 * 60 * 1000;
/** "New" lasts this long after listing. */
const NEW_FOR = 7 * DAY;
/**
 * Price points one 14-day window can hold: one per hourly check is 336. A
 * bound, not an expected size; prices change a few times a week.
 */
const MAX_POINTS_IN_WINDOW = 400;
/** Price points the drawer shows: years of history at a few changes a week. */
const MAX_HISTORY = 500;
/** Timeline events (tracking began, listed; ticket 04 adds off/relisted). */
const MAX_EVENTS = 100;

/** A unit's Ledger row at `now`. */
export function ledgerUnit(
	unit: Doc<"henryUnits">,
	changes: PriceChanges,
	now: number,
): HenryLedgerUnit {
	return {
		_id: unit._id,
		number: unit.number,
		floor: unit.floor,
		floorPlan: unit.floorPlan,
		beds: unit.beds,
		baths: unit.baths,
		sqft: unit.sqft,
		facesI25: unit.facesI25,
		price: unit.price,
		totalPrice: unit.totalPrice,
		leaseTermMonths: unit.leaseTermMonths,
		availableOn: unit.availableOn,
		specials: unit.specials,
		newDays: newDays(unit.listedAt, now),
		changes,
	};
}

/**
 * The 3, 7 and 14 day changes at `now`, from the price point in force 14 days
 * back (if any) and every one since.
 */
export async function readPriceChanges(
	ctx: QueryCtx,
	unit: Doc<"henryUnits">,
	now: number,
): Promise<PriceChanges> {
	const windowStart = now - LONGEST_CHANGE_WINDOW;
	const [inForce, recent] = await Promise.all([
		ctx.db
			.query("henryPricePoints")
			.withIndex("by_unitId_and_at", (q) =>
				q.eq("unitId", unit._id).lte("at", windowStart),
			)
			.order("desc")
			.first(),
		ctx.db
			.query("henryPricePoints")
			.withIndex("by_unitId_and_at", (q) =>
				q.eq("unitId", unit._id).gt("at", windowStart),
			)
			.take(MAX_POINTS_IN_WINDOW),
	]);
	const points = inForce ? [inForce, ...recent] : recent;
	return priceChanges(points, unit.price, now);
}

/**
 * One unit's drawer by its number (e.g. "608"), or null when it was never
 * seen. History and timeline are bounded; the change since it started uses
 * its very first price point.
 */
export async function readUnitDetails(
	ctx: QueryCtx,
	number: string,
	now: number,
): Promise<HenryUnitDetails | null> {
	// Numbers are unique per building; should SightMap ever re-key a unit,
	// the newest row is the live one.
	const unit = await ctx.db
		.query("henryUnits")
		.withIndex("by_number", (q) => q.eq("number", number))
		.order("desc")
		.first();
	if (unit === null) return null;

	const [changes, first, latest, events] = await Promise.all([
		readPriceChanges(ctx, unit, now),
		ctx.db
			.query("henryPricePoints")
			.withIndex("by_unitId_and_at", (q) => q.eq("unitId", unit._id))
			.first(),
		ctx.db
			.query("henryPricePoints")
			.withIndex("by_unitId_and_at", (q) => q.eq("unitId", unit._id))
			.order("desc")
			.take(MAX_HISTORY),
		ctx.db
			.query("henryUnitEvents")
			.withIndex("by_unitId_and_at", (q) => q.eq("unitId", unit._id))
			.order("desc")
			.take(MAX_EVENTS),
	]);
	const history = latest.reverse();

	return {
		...ledgerUnit(unit, changes, now),
		status: unit.status,
		listedAt: unit.listedAt,
		firstSeenAt: unit.firstSeenAt,
		offMarketAt: unit.offMarketAt,
		sinceStart: unit.price - (first?.price ?? unit.price),
		history: history.map(({ at, price, totalPrice, leaseTermMonths }) => ({
			at,
			price,
			totalPrice,
			leaseTermMonths,
		})),
		timeline: timeline(history, events),
	};
}

/**
 * Newest first: each price change (a point after the one before it) and
 * each event. A change and an event at the same moment (a relisting at a new
 * price, in ticket 04) list the change above the event it followed.
 */
function timeline(
	history: Doc<"henryPricePoints">[],
	events: Doc<"henryUnitEvents">[],
): TimelineEntry[] {
	const changes: TimelineEntry[] = [];
	for (let i = 1; i < history.length; i++) {
		const before = history[i - 1];
		const point = history[i];
		if (!before || !point) continue;
		changes.push({
			kind: "priceChange",
			at: point.at,
			from: before.price,
			to: point.price,
		});
	}
	const entries: TimelineEntry[] = [
		...changes,
		...events.map(({ kind, at, price }) => ({ kind, at, price })),
	];
	return entries.sort((a, b) => b.at - a.at || rank(a) - rank(b));
}

function rank(entry: TimelineEntry): number {
	return entry.kind === "priceChange" ? 0 : 1;
}

/** Whole days since it listed, while it's still New; null otherwise. */
function newDays(listedAt: number | null, now: number): number | null {
	if (listedAt === null) return null;
	const age = Math.max(0, now - listedAt);
	return age < NEW_FOR ? Math.floor(age / DAY) : null;
}
