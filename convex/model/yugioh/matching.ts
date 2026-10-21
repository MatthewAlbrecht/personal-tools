// Title reading and matching of Listings to Printings. The AI's judgments come
// in through `saveTitleRead`; everything here is deterministic.
import { ConvexError } from "convex/values";
import { RARITY_NAMES } from "../../../src/lib/yugioh/deck";
import {
	type MatchStatus,
	type TitleJudgments,
	type TitleRead,
	findSetCodes,
	matchListing,
	readTitle,
	setCodeKey,
	setCodeVariants,
	shownMatchStatus,
	titleSetCode,
} from "../../../src/lib/yugioh/title-reading";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { queueDealCheck } from "./pushes";

/** Most Printings one set code holds (one per rarity). */
const MAX_PRINTINGS_PER_SET_CODE = 20;
/** Most Listings re-matched when a Printing on their set code changes. */
const MAX_LISTINGS_REMATCHED = 200;

/**
 * Marks a Listing's title as needing a read and schedules the AI. Called for
 * a new Listing and whenever a capture shows a changed title. Until the read
 * lands, the title's lone set code (if any) files the Listing under its card.
 */
export async function queueTitleRead(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
	title: string,
): Promise<void> {
	const setCode = titleSetCode(title);
	await ctx.db.patch("yugiohListings", listingId, {
		titleReadStatus: "reading",
		setCodeKey: setCode === null ? null : setCodeKey(setCode),
	});
	await ctx.scheduler.runAfter(0, internal.yugioh.titleReading.readTitle, {
		listingId,
	});
}

/**
 * Queues reads for Listings captured before title reading existed (they have
 * no `setCodeKey` field at all), a batch at a time. Returns how many it
 * queued; run it again until that's 0.
 */
export async function queueUnreadTitles(
	ctx: MutationCtx,
	batchSize: number,
): Promise<number> {
	const unread = await ctx.db
		.query("yugiohListings")
		.withIndex("by_setCodeKey", (q) => q.eq("setCodeKey", undefined))
		.take(batchSize);
	for (const listing of unread) {
		await ctx.db.patch("yugiohListings", listing._id, {
			titleRead: null,
			matchStatus: "unsure",
			matchedPrintingId: null,
			matchOverridden: false,
		});
		await queueTitleRead(ctx, listing._id, listing.title);
	}
	return unread.length;
}

/**
 * What the AI needs to read a Listing's title: the title, its set codes, and
 * the rarities it may answer (known ones plus any my Printings use under those
 * set codes). Null when there's nothing left to read.
 */
export async function titleToRead(
	ctx: QueryCtx,
	listingId: Id<"yugiohListings">,
): Promise<{
	title: string;
	setCodes: string[];
	rarities: string[];
} | null> {
	const listing = await ctx.db.get("yugiohListings", listingId);
	if (!listing || listing.titleReadStatus !== "reading") return null;
	const setCodes = findSetCodes(listing.title);
	const rarities = new Set(RARITY_NAMES);
	for (const setCode of setCodes) {
		for (const printing of await printingsForSetCode(ctx, setCode)) {
			rarities.add(printing.rarity);
			for (const rarity of printing.overloadedRarities) rarities.add(rarity);
		}
	}
	return { title: listing.title, setCodes, rarities: [...rarities] };
}

/**
 * Stores the AI's read of a title and matches the Listing. `judgments` is null
 * when the AI failed: the title's set code still decides what it can. A read
 * for a title the Listing no longer has is dropped (a newer one is queued).
 * A match I set myself is never changed.
 */
export async function saveTitleRead(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
	title: string,
	judgments: TitleJudgments | null,
): Promise<void> {
	const listing = await ctx.db.get("yugiohListings", listingId);
	if (!listing || listing.title !== title) return;
	const read = judgments === null ? null : readTitle(title, judgments);
	const setCode = read === null ? titleSetCode(title) : read.setCode;
	const match = listing.matchOverridden
		? null
		: await automaticMatch(ctx, { setCode, rarity: read?.rarity ?? null });
	await ctx.db.patch("yugiohListings", listingId, {
		titleReadStatus: read === null ? "failed" : "read",
		titleRead: read,
		setCodeKey: setCode === null ? null : setCodeKey(setCode),
		...match,
	});
	if ((match?.matchStatus ?? listing.matchStatus) === "match") {
		await queueDealCheck(ctx, listingId);
	}
}

/**
 * Re-matches the Listings filed under a set code's card, after a Printing on
 * it was added or learned another Overloaded rarity. No AI: stored reads are
 * reused. Overrides are left alone, and so are TCGplayer Listings, which are
 * matched by product page, not by title.
 */
export async function rematchSetCode(
	ctx: MutationCtx,
	setCode: string,
): Promise<void> {
	const key = setCodeKey(setCode);
	if (key === null) return;
	const listings = await ctx.db
		.query("yugiohListings")
		.withIndex("by_setCodeKey", (q) => q.eq("setCodeKey", key))
		.order("desc")
		.take(MAX_LISTINGS_REMATCHED);
	// Every Listing here names the same card, so its Printings are read once.
	const printings = await printingsForSetCode(ctx, setCode);
	for (const listing of listings) {
		if (
			listing.matchOverridden ||
			listing.titleReadStatus === "reading" ||
			listing.marketplace === "tcgplayer"
		) {
			continue;
		}
		const { status, printingId } = matchListing(matchInput(listing), printings);
		const match = { matchStatus: status, matchedPrintingId: printingId };
		if (
			match.matchStatus !== listing.matchStatus ||
			match.matchedPrintingId !== listing.matchedPrintingId
		) {
			await ctx.db.patch("yugiohListings", listing._id, match);
		}
	}
}

/**
 * My own match for a Listing: one of my Printings, or null for "not a match".
 * It wins over the AI on every later capture.
 */
export async function setMatchOverride(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
	printingId: Id<"yugiohPrintings"> | null,
): Promise<void> {
	const listing = await ctx.db.get("yugiohListings", listingId);
	if (!listing) throw new ConvexError("That Listing doesn't exist.");
	if (
		printingId !== null &&
		!(await ctx.db.get("yugiohPrintings", printingId))
	) {
		throw new ConvexError("That Printing doesn't exist.");
	}
	await ctx.db.patch("yugiohListings", listingId, {
		matchStatus: printingId === null ? "notMatch" : "match",
		matchedPrintingId: printingId,
		matchOverridden: true,
	});
	if (printingId !== null) await queueDealCheck(ctx, listingId);
}

/** The set code and rarity a stored Listing is matched on. */
function matchInput(listing: Doc<"yugiohListings">): {
	setCode: string | null;
	rarity: string | null;
} {
	if (listing.titleRead) {
		return {
			setCode: listing.titleRead.setCode,
			rarity: listing.titleRead.rarity,
		};
	}
	return { setCode: titleSetCode(listing.title), rarity: null };
}

async function automaticMatch(
	ctx: QueryCtx,
	read: { setCode: string | null; rarity: string | null },
): Promise<{
	matchStatus: MatchStatus;
	matchedPrintingId: Id<"yugiohPrintings"> | null;
}> {
	const printings =
		read.setCode === null ? [] : await printingsForSetCode(ctx, read.setCode);
	const { status, printingId } = matchListing(read, printings);
	return { matchStatus: status, matchedPrintingId: printingId };
}

/** Printings of the card a set code names, saved under any region's code. */
async function printingsForSetCode(
	ctx: QueryCtx,
	setCode: string,
): Promise<Doc<"yugiohPrintings">[]> {
	const printings: Doc<"yugiohPrintings">[] = [];
	for (const variant of setCodeVariants(setCode)) {
		printings.push(
			...(await ctx.db
				.query("yugiohPrintings")
				.withIndex("by_setCode_and_rarity", (q) => q.eq("setCode", variant))
				.take(MAX_PRINTINGS_PER_SET_CODE)),
		);
	}
	return printings;
}

/** A Listing's read and match, as the Listings views show them. */
export type ListingMatchView = {
	titleRead: TitleRead | null;
	match: {
		status: MatchStatus | "reading";
		printing: {
			_id: Id<"yugiohPrintings">;
			cardName: string;
			setCode: string;
			rarity: string;
		} | null;
		overridden: boolean;
	};
};

export async function listingMatchView(
	ctx: QueryCtx,
	listing: Doc<"yugiohListings">,
): Promise<ListingMatchView> {
	const overridden = listing.matchOverridden ?? false;
	const printing =
		listing.matchedPrintingId == null
			? null
			: await ctx.db.get("yugiohPrintings", listing.matchedPrintingId);
	return {
		titleRead: listing.titleRead ?? null,
		match: {
			status: shownMatchStatus(listing),
			printing: printing && {
				_id: printing._id,
				cardName: printing.cardName,
				setCode: printing.setCode,
				rarity: printing.rarity,
			},
			overridden,
		},
	};
}
