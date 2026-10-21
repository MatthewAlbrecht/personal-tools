import { ConvexError, type Infer } from "convex/values";
// Push notifications: devices with push on, the deal and auction push rules,
// and the outbox every push goes through. Sending itself is a Node action
// (`convex/yugioh/pushDelivery.ts`); this decides what to send and when, and
// records what the push service said.
import {
	millisecondsInDay,
	millisecondsInMinute,
	millisecondsInSecond,
} from "date-fns/constants";
import { isRunningAuction, isSale } from "../../../src/lib/yugioh/deals";
import { isCardFinished } from "../../../src/lib/yugioh/deck";
import {
	DEFAULT_TIME_ZONE,
	auctionPushText,
	dealPushText,
	pushDeliveryTime,
} from "../../../src/lib/yugioh/pushes";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
	type CardDeal,
	MAX_BUY_NOW_LISTINGS,
	goneFromTcgplayerPage,
	loadCardDealGrader,
	matchedPrintingId,
} from "./deals";
import type {
	yugiohPushKindValidator,
	yugiohPushOptionsValidator,
	yugiohPushOutcomeValidator,
	yugiohPushSubscriptionValidator,
} from "./validators";

/** Most devices one push goes to. */
export const MAX_PUSH_DEVICES = 20;

/**
 * A Listing first captured longer ago than this isn't new: matching it later
 * (a Printing added, a match I set) doesn't push it.
 */
export const NEW_DEAL_WINDOW_MS = millisecondsInDay;

/** An auction is pushed this long before it ends, at any hour. */
export const AUCTION_PUSH_LEAD_MS = 15 * millisecondsInMinute;

/**
 * An auction check this close before its push time still pushes. A capture
 * reads "time left" to the minute, so each one moves the end time a little,
 * and each move schedules another check.
 */
const AUCTION_CHECK_SLACK_MS = millisecondsInMinute;

/**
 * A send still unrecorded this long after it started has died: a Node
 * action can't run longer (10 minutes).
 */
export const SEND_DEADLINE_MS = 10 * millisecondsInMinute;

/** Most Cards across Decks checked for one Listing's Printing. */
const MAX_CARDS_WANTING = 50;

/**
 * How long the push service keeps trying an offline device, per kind. An
 * auction push gets no longer than the auction has left.
 */
const TTL_SECONDS: Record<PushKind, number> = {
	deal: 12 * 60 * 60,
	// Useless once the auction has ended.
	auction: AUCTION_PUSH_LEAD_MS / millisecondsInSecond,
	test: 60 * 60,
};

/** Longer than any real push endpoint, key or time zone name. */
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_FIELD_LENGTH = 256;

type PushKind = Infer<typeof yugiohPushKindValidator>;
export type PushSubscriptionInput = Infer<
	typeof yugiohPushSubscriptionValidator
>;
export type PushOutcome = Infer<typeof yugiohPushOutcomeValidator>;
export type PushOptions = Infer<typeof yugiohPushOptionsValidator>;

/** Turns push on for a device, or refreshes it (keys, time zone) on launch. */
export async function savePushSubscription(
	ctx: MutationCtx,
	subscription: PushSubscriptionInput,
	timeZone: string,
	now: number,
): Promise<void> {
	const endpoint = subscription.endpoint.trim();
	if (!isPushEndpoint(endpoint)) {
		throw new ConvexError("That isn't a push subscription endpoint.");
	}
	if (
		[subscription.keys.p256dh, subscription.keys.auth, timeZone].some(
			(field) => field.length > MAX_FIELD_LENGTH,
		)
	) {
		throw new ConvexError("That push subscription is too long.");
	}
	const fields = {
		p256dh: subscription.keys.p256dh,
		auth: subscription.keys.auth,
		timeZone: timeZone.trim() || DEFAULT_TIME_ZONE,
		lastSeenAt: now,
	};
	const existing = await subscriptionFor(ctx, endpoint);
	if (existing) {
		await ctx.db.patch("yugiohPushSubscriptions", existing._id, fields);
		return;
	}
	await ctx.db.insert("yugiohPushSubscriptions", {
		endpoint,
		...fields,
		createdAt: now,
	});
}

/** Turns push off for a device. Unknown endpoints are ignored. */
export async function removePushSubscription(
	ctx: MutationCtx,
	endpoint: string,
): Promise<void> {
	const existing = await subscriptionFor(ctx, endpoint.trim());
	if (existing) await ctx.db.delete("yugiohPushSubscriptions", existing._id);
}

/** Whether a device has push on. */
export async function hasPushSubscription(
	ctx: QueryCtx,
	endpoint: string,
): Promise<boolean> {
	return (await subscriptionFor(ctx, endpoint.trim())) !== null;
}

/**
 * Asks for push checks on a Listing that was just matched to a Printing, or
 * an auction whose end time a capture moved: a deal check now for a
 * fixed-price Listing, an auction check 15 minutes before a running auction
 * ends (now, if that's passed). Nothing is scheduled while no device has push
 * on.
 */
export async function queuePushCheck(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
): Promise<void> {
	const listing = await ctx.db.get("yugiohListings", listingId);
	if (!listing || (await newestSubscription(ctx)) === null) return;
	if (listing.listingType !== "auction") {
		await ctx.scheduler.runAfter(0, internal.yugioh.pushes.checkDeal, {
			listingId,
		});
		return;
	}
	if (listing.endsAt === null || listing.sold) return;
	// A time already passed runs at once.
	await ctx.scheduler.runAt(
		listing.endsAt - AUCTION_PUSH_LEAD_MS,
		internal.yugioh.pushes.checkAuction,
		{ listingId },
	);
}

/**
 * Pushes a Listing once if it's a new Great or Good deal: first captured in
 * the last day, still for sale at a fixed price, and Qualifying for a Card
 * that still needs Copies and searches its Printing. When several Cards (in
 * several Decks) want it, the push opens the most recently viewed Deck.
 * Found in quiet hours, it's held until 8am.
 */
export async function checkDeal(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
	now: number,
): Promise<void> {
	const listing = await ctx.db.get("yugiohListings", listingId);
	if (!listing || !isNewListing(listing, now)) return;
	if (listing.sold || listing.listingType === "auction") return;
	if (isSale(listing, now)) return;
	const printingId = matchedPrintingId(listing);
	if (printingId === null) return;
	if (await pushFor(ctx, listingId, "deal")) return;

	// Ties between Decks go to the one I viewed most recently.
	const deal = await wantingCard(ctx, listing, printingId, now, isPushable);
	if (deal === null) return;
	const text = dealPushText({
		grade: deal.deal.grade,
		cardName: deal.card.cardName,
		rarity: deal.rarity,
		perCopy: deal.deal.perCopy,
		percentOfReference: deal.deal.percentOfReference,
		reference: deal.deal.reference,
		marketplace: listing.marketplace,
		listingType: listing.listingType,
	});
	await queuePush(
		ctx,
		{
			kind: "deal",
			listingId,
			...text,
			url: `/yugioh/decks/${deal.card.deckId}/listings?listing=${listingId}`,
			tag: `deal-${listingId}`,
		},
		pushDeliveryTime(now, await quietHoursTimeZone(ctx)),
		now,
	);
}

/**
 * Pushes a running auction once, 15 minutes before it ends, at any hour, when
 * it's Qualifying for a Card that still needs Copies and searches its
 * Printing. The push carries the last captured Per-copy price and how old it
 * is, and opens the eBay Listing. A check well before the push time is
 * dropped: the end time has moved, and the move scheduled a later check.
 */
export async function checkAuction(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
	now: number,
): Promise<void> {
	const listing = await ctx.db.get("yugiohListings", listingId);
	if (!listing || listing.listingType !== "auction") return;
	if (listing.endsAt === null || !isRunningAuction(listing, now)) return;
	if (now < listing.endsAt - AUCTION_PUSH_LEAD_MS - AUCTION_CHECK_SLACK_MS) {
		return;
	}
	const printingId = matchedPrintingId(listing);
	if (printingId === null) return;
	if (await pushFor(ctx, listingId, "auction")) return;

	const want = await wantingCard(
		ctx,
		listing,
		printingId,
		now,
		isQualifyingDeal,
	);
	if (want === null) return;
	const text = auctionPushText(
		{
			cardName: want.card.cardName,
			rarity: want.rarity,
			perCopy: want.deal.perCopy,
			reference: want.deal.reference,
			bids: listing.bids,
			endsAt: listing.endsAt,
			lastSeenAt: listing.lastSeenAt,
		},
		now,
	);
	await queuePush(
		ctx,
		{
			kind: "auction",
			listingId,
			...text,
			url: listing.url,
			tag: `auction-${listingId}`,
		},
		now,
		now,
	);
}

/**
 * Whether a running auction will get its auction push, so a refresh visit
 * before it is worth making (ticket 16): a device has push on, the auction
 * isn't pushed yet, and it's matched and Qualifying for a Card that still
 * needs Copies and searches its Printing. The same selection as
 * `checkAuction`.
 */
export async function awaitsAuctionPush(
	ctx: QueryCtx,
	listing: Doc<"yugiohListings">,
	now: number,
): Promise<boolean> {
	if (listing.endsAt === null || !isRunningAuction(listing, now)) return false;
	const printingId = matchedPrintingId(listing);
	if (printingId === null) return false;
	if ((await newestSubscription(ctx)) === null) return false;
	if (await pushFor(ctx, listing._id, "auction")) return false;
	const want = await wantingCard(
		ctx,
		listing,
		printingId,
		now,
		isQualifyingDeal,
	);
	return want !== null;
}

/** A push that shows every device push is working. Not held. */
export async function queueTestPush(
	ctx: MutationCtx,
	now: number,
): Promise<void> {
	if ((await newestSubscription(ctx)) === null) {
		throw new ConvexError("Turn on alerts on this device first.");
	}
	await queuePush(
		ctx,
		{
			kind: "test",
			listingId: null,
			title: "Alerts are on",
			body: "Deals and auctions will show up here like this.",
			url: "/yugioh/settings",
			tag: "test",
		},
		now,
		now,
	);
}

/** What a delivery sends, and to which devices. */
export type Delivery = {
	payload: string;
	options: PushOptions;
	subscriptions: Array<{
		_id: Id<"yugiohPushSubscriptions">;
		endpoint: string;
		keys: { p256dh: string; auth: string };
	}>;
};

/**
 * Starts delivering a push that's due. Null when there's nothing to send: it
 * was already handled, its Listing has since sold or ended (a held deal), or
 * no device has push on. Those are marked skipped.
 */
export async function claimDelivery(
	ctx: MutationCtx,
	pushId: Id<"yugiohPushes">,
	now: number,
): Promise<Delivery | null> {
	const push = await ctx.db.get("yugiohPushes", pushId);
	if (!push || push.status !== "pending") return null;
	let ttlSeconds = TTL_SECONDS[push.kind];
	if (push.listingId !== null) {
		const listing = await ctx.db.get("yugiohListings", push.listingId);
		if (!listing || (await hasEnded(ctx, listing, now))) {
			await skip(ctx, pushId, "The Listing has ended.");
			return null;
		}
		if (push.kind === "auction" && listing.endsAt !== null) {
			const secondsLeft = Math.ceil(
				(listing.endsAt - now) / millisecondsInSecond,
			);
			ttlSeconds = Math.min(ttlSeconds, secondsLeft);
		}
	}
	const devices = await ctx.db
		.query("yugiohPushSubscriptions")
		.withIndex("by_lastSeenAt")
		.order("desc")
		.take(MAX_PUSH_DEVICES);
	if (devices.length === 0) {
		await skip(ctx, pushId, "No device has alerts on.");
		return null;
	}
	await ctx.db.patch("yugiohPushes", pushId, { status: "sending" });
	await ctx.scheduler.runAfter(
		SEND_DEADLINE_MS,
		internal.yugioh.pushes.expireDelivery,
		{ pushId },
	);
	return {
		payload: JSON.stringify({
			title: push.title,
			body: push.body,
			url: push.url,
			tag: push.tag,
		}),
		options: {
			ttlSeconds,
			// An auction can't wait for a phone in low-power mode.
			urgency: push.kind === "auction" ? "high" : "normal",
			topic: push.listingId === null ? null : pushTopic(push.listingId),
		},
		subscriptions: devices.map((device) => ({
			_id: device._id,
			endpoint: device.endpoint,
			keys: { p256dh: device.p256dh, auth: device.auth },
		})),
	};
}

/**
 * Records what the push service said for each device. A subscription it
 * says is gone (404/410) is deleted. The push is sent if any device got it.
 */
export async function recordDelivery(
	ctx: MutationCtx,
	pushId: Id<"yugiohPushes">,
	results: Array<{
		subscriptionId: Id<"yugiohPushSubscriptions">;
		outcome: PushOutcome;
	}>,
	now: number,
): Promise<void> {
	let reached = 0;
	let note: string | null = null;
	for (const { subscriptionId, outcome } of results) {
		if (outcome.status === "sent") {
			reached++;
		} else if (outcome.status === "gone") {
			if (await ctx.db.get("yugiohPushSubscriptions", subscriptionId)) {
				await ctx.db.delete("yugiohPushSubscriptions", subscriptionId);
			}
			note ??= "A device's subscription had expired and was removed.";
		} else {
			note = outcome.reason;
		}
	}
	await ctx.db.patch("yugiohPushes", pushId, {
		status: reached > 0 ? "sent" : "failed",
		sentAt: now,
		devicesReached: reached,
		note,
	});
}

/**
 * Fails a push whose send started but never recorded an outcome (its action
 * died). It isn't retried: some devices may already have it.
 */
export async function expireDelivery(
	ctx: MutationCtx,
	pushId: Id<"yugiohPushes">,
	now: number,
): Promise<void> {
	const push = await ctx.db.get("yugiohPushes", pushId);
	if (!push || push.status !== "sending") return;
	await ctx.db.patch("yugiohPushes", pushId, {
		status: "failed",
		sentAt: now,
		note: "The send didn't finish, so some devices may not have it.",
	});
}

type PushContent = {
	kind: PushKind;
	listingId: Id<"yugiohListings"> | null;
	title: string;
	body: string;
	url: string;
	tag: string;
};

/** Files a push and schedules its delivery for `deliverAt`. */
async function queuePush(
	ctx: MutationCtx,
	content: PushContent,
	deliverAt: number,
	now: number,
): Promise<void> {
	const pushId = await ctx.db.insert("yugiohPushes", {
		...content,
		createdAt: now,
		deliverAt,
		status: "pending",
		sentAt: null,
		devicesReached: 0,
		note: null,
	});
	await ctx.scheduler.runAt(deliverAt, internal.yugioh.pushDelivery.deliver, {
		pushId,
	});
}

/** A Card that wants a Listing, and how the Listing grades for it. */
type WantingCard<D extends CardDeal = CardDeal> = {
	card: Doc<"yugiohDeckCards">;
	rarity: string;
	deal: D;
};

/**
 * A Card that still needs Copies, searches the Listing's Printing (the
 * Chosen one, or any Candidate while undecided), and accepts the Listing as
 * graded at the Card's own Lowest acceptable condition. Of several (in
 * several Decks), the one in the Deck I viewed most recently.
 */
async function wantingCard<D extends CardDeal>(
	ctx: QueryCtx,
	listing: Doc<"yugiohListings">,
	printingId: Id<"yugiohPrintings">,
	now: number,
	accepts: (deal: CardDeal) => deal is D,
): Promise<WantingCard<D> | null> {
	const printing = await ctx.db.get("yugiohPrintings", printingId);
	if (!printing) return null;
	const candidates = await ctx.db
		.query("yugiohCandidatePrintings")
		.withIndex("by_printingId", (q) => q.eq("printingId", printingId))
		.take(MAX_CARDS_WANTING);
	const grade = await loadCardDealGrader(ctx, now);
	let best: (WantingCard<D> & { viewedAt: number }) | null = null;
	for (const candidate of candidates) {
		const card = await ctx.db.get("yugiohDeckCards", candidate.deckCardId);
		if (!card || isCardFinished(card)) continue;
		if (card.chosenPrintingId !== null && card.chosenPrintingId !== printingId)
			continue;
		const deal = await grade(listing, card.lowestAcceptableCondition);
		if (!accepts(deal)) continue;
		const viewedAt = await lastViewedAt(ctx, card.deckId);
		if (best !== null && best.viewedAt >= viewedAt) continue;
		best = { card, rarity: printing.rarity, deal, viewedAt };
	}
	return best;
}

type PushableDeal = CardDeal & {
	grade: "great" | "good";
	perCopy: number;
	reference: number;
	percentOfReference: number;
};

/** Counts for the Card: matched, English, not graded, at its condition. */
function isQualifyingDeal(deal: CardDeal): deal is CardDeal {
	return deal.qualifying;
}

function isPushable(deal: CardDeal): deal is PushableDeal {
	return (
		deal.qualifying &&
		(deal.grade === "great" || deal.grade === "good") &&
		deal.perCopy !== null &&
		deal.reference !== null &&
		deal.percentOfReference !== null
	);
}

/**
 * Whether a Listing is over: sold, past the end time eBay showed (an
 * auction, or a fixed-price Listing that ends unsold), or a fixed-price
 * Listing that has dropped out of its page (captures never see "ended
 * unsold").
 */
async function hasEnded(
	ctx: QueryCtx,
	listing: Doc<"yugiohListings">,
	now: number,
): Promise<boolean> {
	if (listing.sold || isSale(listing, now)) return true;
	if (listing.endsAt !== null && listing.endsAt <= now) return true;
	if (listing.listingType === "auction") return false;
	return await droppedOut(ctx, listing);
}

/**
 * A fixed-price Listing no longer on the page that showed it:
 * - TCGplayer: the latest capture of its product page left it out.
 * - eBay: a later capture saw an older fixed-price Listing of the same
 *   Printing. Newly Listed sorts newest first, so that page would have shown
 *   this one too if it were still for sale.
 */
async function droppedOut(
	ctx: QueryCtx,
	listing: Doc<"yugiohListings">,
): Promise<boolean> {
	const printingId = matchedPrintingId(listing);
	if (printingId === null) return false;
	if (listing.marketplace === "tcgplayer") {
		const printing = await ctx.db.get("yugiohPrintings", printingId);
		return goneFromTcgplayerPage(printing)(listing);
	}
	const forSale = await ctx.db
		.query("yugiohListings")
		.withIndex("by_matchedPrintingId_and_marketplace_and_saleAt", (q) =>
			q
				.eq("matchedPrintingId", printingId)
				.eq("marketplace", "ebay")
				.eq("saleAt", null),
		)
		.order("desc")
		.take(MAX_BUY_NOW_LISTINGS);
	const listed = listedTime(listing);
	return forSale.some(
		(other) =>
			other._id !== listing._id &&
			!other.sold &&
			other.listingType !== "auction" &&
			other.lastSeenAt > listing.lastSeenAt &&
			listedTime(other) <= listed,
	);
}

/** When a Listing went up: eBay's listing date, else its first capture. */
function listedTime(listing: Doc<"yugiohListings">): number {
	return listing.listedAt ?? listing.firstSeenAt;
}

async function lastViewedAt(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
): Promise<number> {
	const visit = await ctx.db
		.query("yugiohDeckVisits")
		.withIndex("by_deckId", (q) => q.eq("deckId", deckId))
		.first();
	return visit?.viewedAt ?? 0;
}

/**
 * Quiet hours follow the device I used most recently (the phone, once it
 * has push on): its time zone, else the default.
 */
async function quietHoursTimeZone(ctx: QueryCtx): Promise<string> {
	return (await newestSubscription(ctx))?.timeZone ?? DEFAULT_TIME_ZONE;
}

async function newestSubscription(
	ctx: QueryCtx,
): Promise<Doc<"yugiohPushSubscriptions"> | null> {
	return await ctx.db
		.query("yugiohPushSubscriptions")
		.withIndex("by_lastSeenAt")
		.order("desc")
		.first();
}

async function subscriptionFor(
	ctx: QueryCtx,
	endpoint: string,
): Promise<Doc<"yugiohPushSubscriptions"> | null> {
	return await ctx.db
		.query("yugiohPushSubscriptions")
		.withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
		.unique();
}

async function pushFor(
	ctx: QueryCtx,
	listingId: Id<"yugiohListings">,
	kind: PushKind,
): Promise<boolean> {
	const push = await ctx.db
		.query("yugiohPushes")
		.withIndex("by_listingId_and_kind", (q) =>
			q.eq("listingId", listingId).eq("kind", kind),
		)
		.first();
	return push !== null;
}

async function skip(
	ctx: MutationCtx,
	pushId: Id<"yugiohPushes">,
	note: string,
): Promise<void> {
	await ctx.db.patch("yugiohPushes", pushId, { status: "skipped", note });
}

/**
 * Listed (when eBay says when) and first captured in the last day. A Search
 * or Deck captured for the first time finds Listings that are days old.
 */
function isNewListing(listing: Doc<"yugiohListings">, now: number): boolean {
	const since = now - NEW_DEAL_WINDOW_MS;
	return (
		listing.firstSeenAt >= since &&
		(listing.listedAt === null || listing.listedAt >= since)
	);
}

function isPushEndpoint(endpoint: string): boolean {
	if (endpoint.length > MAX_ENDPOINT_LENGTH) return false;
	try {
		return new URL(endpoint).protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * The push service's Topic header, so a re-sent push for the same Listing
 * replaces one still waiting on an offline device. It allows at most 32
 * URL-safe base64 characters.
 */
function pushTopic(listingId: Id<"yugiohListings">): string | null {
	return /^[A-Za-z0-9_-]{1,32}$/.test(listingId) ? listingId : null;
}
