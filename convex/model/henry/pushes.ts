// The Henry's pushes: which listed, relisted and dropped units push, the
// per-unit merge of held pushes, the failing-checks push, and delivery.
// Sending is the Node action `convex/henry/pushDelivery.ts`; devices, quiet
// hours and per-device outcomes are shared with Yu-Gi-Oh's pushes.
import type { Infer } from "convex/values";
import { millisecondsInHour } from "date-fns/constants";
import {
	CHECKS_FAILING_PUSH_TAG,
	CHECKS_FAILING_PUSH_URL,
	type UnitPushNews,
	checksFailingPushText,
	pushesNewUnit,
	unitPushTag,
	unitPushText,
	unitPushUrl,
} from "../../../src/lib/henry/pushes";
import { formatMoney } from "../../../src/lib/henry/units";
import { pushDeliveryTime } from "../../../src/lib/yugioh/pushes";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
	type Delivery,
	type DeviceResults,
	SEND_DEADLINE_MS,
	pushDevices,
	pushTopic,
	recordDeviceOutcomes,
	userTimeZone,
} from "../yugioh/pushes";
// A cycle with `./checks` (which calls in here), safe: only functions cross.
import { latestCheck, trackingBeganAt } from "./checks";
import { isStarred } from "./stars";
import type { henryPushReasonValidator } from "./validators";

export type HenryPushReason = Infer<typeof henryPushReasonValidator>;

/** How long the push service keeps trying an offline device. */
const TTL_SECONDS = (12 * millisecondsInHour) / 1000;

/** No successful check for this long is an outage worth a push. */
export const CHECKS_FAILING_AFTER_MS = 6 * millisecondsInHour;

/**
 * Pushes a unit that just listed or relisted when it's starred (itself or
 * its floor plan) or passes the push rules. Baseline units never get here.
 */
export async function pushNewUnit(
	ctx: MutationCtx,
	unit: Doc<"henryUnits">,
	reason: HenryPushReason,
	now: number,
): Promise<void> {
	if (!pushesNewUnit(unit, await isStarred(ctx, unit))) return;
	await queueUnitPush(ctx, unit._id, reason, now);
}

/**
 * Pushes a starred unit's price drop (any amount), against `priceBefore`,
 * its last price. Not for the baseline or a rise: the caller only calls on
 * a lower price.
 */
export async function pushDrop(
	ctx: MutationCtx,
	unit: Doc<"henryUnits">,
	priceBefore: number,
	now: number,
): Promise<void> {
	if (!(await isStarred(ctx, unit))) return;
	await queueUnitPush(ctx, unit._id, "dropped", now, priceBefore);
}

/**
 * Files a push for a unit, delivered now or, in quiet hours, at 8am. A unit
 * with a push still pending gets `reason` added to that one instead: one
 * push per unit per delivery, its text written at delivery from the unit's
 * latest state. A drop passes `priceBefore`; the push keeps the first one,
 * so it reports the total change.
 */
export async function queueUnitPush(
	ctx: MutationCtx,
	unitId: Id<"henryUnits">,
	reason: HenryPushReason,
	now: number,
	priceBefore?: number,
): Promise<void> {
	const held = await ctx.db
		.query("henryPushes")
		.withIndex("by_unitId_and_status", (q) =>
			q.eq("unitId", unitId).eq("status", "pending"),
		)
		.first();
	if (held !== null) {
		await ctx.db.patch("henryPushes", held._id, {
			reasons: held.reasons.includes(reason)
				? held.reasons
				: [...held.reasons, reason],
			priceBefore: held.priceBefore ?? priceBefore,
			updatedAt: now,
		});
		return;
	}
	await insertPush(ctx, unitId, reason, now, priceBefore);
}

/**
 * After a failed check: when no check has succeeded for 6 hours since
 * `lastSuccessAt` (the latest success, or when tracking began), files the
 * failing-checks push, once per outage. The next success starts a new one.
 */
export async function pushChecksFailing(
	ctx: MutationCtx,
	lastSuccessAt: number,
	now: number,
): Promise<void> {
	if (now - lastSuccessAt < CHECKS_FAILING_AFTER_MS) return;
	const pushed = await ctx.db
		.query("henryPushes")
		.withIndex("by_unitId_and_createdAt", (q) =>
			q.eq("unitId", null).gt("createdAt", lastSuccessAt),
		)
		.first();
	if (pushed === null) await insertPush(ctx, null, "checksFailing", now);
}

async function insertPush(
	ctx: MutationCtx,
	unitId: Id<"henryUnits"> | null,
	reason: HenryPushReason,
	now: number,
	priceBefore?: number,
): Promise<void> {
	const deliverAt = pushDeliveryTime(now, await userTimeZone(ctx));
	const pushId = await ctx.db.insert("henryPushes", {
		unitId,
		reasons: [reason],
		...(priceBefore === undefined ? {} : { priceBefore }),
		createdAt: now,
		updatedAt: now,
		deliverAt,
		status: "pending",
		title: null,
		body: null,
		sentAt: null,
		devicesReached: 0,
		note: null,
	});
	await ctx.scheduler.runAt(deliverAt, internal.henry.pushDelivery.deliver, {
		pushId,
	});
}

/** A push's text and where it goes, or why it's no longer worth sending. */
type PushMessage =
	| {
			send: true;
			title: string;
			body: string;
			url: string;
			tag: string;
			topic: string | null;
	  }
	| { send: false; note: string };

/**
 * Starts delivering a push that's due, with text from things as they are
 * now. Null when there's nothing to send (marked skipped, with a note):
 * already handled, no longer true (see `unitMessage`, `checksFailingMessage`),
 * or no device has push on.
 */
export async function claimDelivery(
	ctx: MutationCtx,
	pushId: Id<"henryPushes">,
	now: number,
): Promise<Delivery | null> {
	const push = await ctx.db.get("henryPushes", pushId);
	if (!push || push.status !== "pending") return null;
	const message =
		push.unitId === null
			? await checksFailingMessage(ctx, push)
			: await unitMessage(ctx, push, push.unitId);
	if (!message.send) {
		await skip(ctx, pushId, message.note);
		return null;
	}
	const devices = await pushDevices(ctx);
	if (devices.length === 0) {
		await skip(ctx, pushId, "No device has alerts on.");
		return null;
	}
	const { title, body, url, tag, topic } = message;
	await ctx.db.patch("henryPushes", pushId, {
		status: "sending",
		title,
		body,
	});
	await ctx.scheduler.runAfter(
		SEND_DEADLINE_MS,
		internal.henry.pushes.expireDelivery,
		{ pushId },
	);
	return {
		payload: JSON.stringify({ title, body, url, tag }),
		options: { ttlSeconds: TTL_SECONDS, urgency: "normal", topic },
		subscriptions: devices,
	};
}

/**
 * A unit's push, from the unit as it is now. Dropped if it's off the
 * market. A drop alone is also dropped if the unit is no longer starred or
 * its price is no longer below the price before the drop; with a listing,
 * it goes as the new-unit push, saying the drop only while it's still below.
 */
async function unitMessage(
	ctx: MutationCtx,
	push: Doc<"henryPushes">,
	unitId: Id<"henryUnits">,
): Promise<PushMessage> {
	const unit = await ctx.db.get("henryUnits", unitId);
	if (!unit || unit.status === "offMarket") {
		return { send: false, note: "The unit went off the market." };
	}
	const droppedFrom =
		push.reasons.includes("dropped") &&
		push.priceBefore !== undefined &&
		unit.price < push.priceBefore
			? push.priceBefore
			: null;
	let news: UnitPushNews;
	if (push.reasons.includes("listed")) {
		news = { kind: "listed", droppedFrom };
	} else if (push.reasons.includes("relisted")) {
		news = { kind: "relisted", droppedFrom };
	} else {
		if (!(await isStarred(ctx, unit))) {
			return { send: false, note: "The unit is no longer starred." };
		}
		if (droppedFrom === null) {
			return {
				send: false,
				note: `The price is back at ${formatMoney(push.priceBefore ?? unit.price)} or above.`,
			};
		}
		news = { kind: "dropped", droppedFrom };
	}
	return {
		send: true,
		...unitPushText({
			number: unit.number,
			beds: unit.beds,
			sqft: unit.sqft,
			price: unit.price,
			news,
		}),
		url: unitPushUrl(unit.number),
		tag: unitPushTag(unit.number),
		topic: pushTopic(unit._id),
	};
}

/**
 * The failing-checks push, naming the latest success and failure as they
 * are now. Dropped if a check has succeeded since it was filed.
 */
async function checksFailingMessage(
	ctx: MutationCtx,
	push: Doc<"henryPushes">,
): Promise<PushMessage> {
	const lastSuccess = await latestCheck(ctx, "success");
	if (lastSuccess !== null && lastSuccess.at > push.createdAt) {
		return { send: false, note: "The checks are working again." };
	}
	const lastFailure = await latestCheck(ctx, "failure");
	const lastSuccessAt =
		lastSuccess?.at ?? (await trackingBeganAt(ctx)) ?? push.createdAt;
	return {
		send: true,
		...checksFailingPushText({
			lastSuccessAt,
			lastError: lastFailure?.reason ?? "Unknown",
			timeZone: await userTimeZone(ctx),
		}),
		url: CHECKS_FAILING_PUSH_URL,
		tag: CHECKS_FAILING_PUSH_TAG,
		topic: pushTopic(CHECKS_FAILING_PUSH_TAG),
	};
}

/**
 * Records what the push service said for each device (gone subscriptions
 * are deleted). The push is sent if any device got it.
 */
export async function recordDelivery(
	ctx: MutationCtx,
	pushId: Id<"henryPushes">,
	results: DeviceResults,
	now: number,
): Promise<void> {
	const { reached, note } = await recordDeviceOutcomes(ctx, results);
	await ctx.db.patch("henryPushes", pushId, {
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
	pushId: Id<"henryPushes">,
	now: number,
): Promise<void> {
	const push = await ctx.db.get("henryPushes", pushId);
	if (!push || push.status !== "sending") return;
	await ctx.db.patch("henryPushes", pushId, {
		status: "failed",
		sentAt: now,
		note: "The send didn't finish, so some devices may not have it.",
	});
}

async function skip(
	ctx: MutationCtx,
	pushId: Id<"henryPushes">,
	note: string,
): Promise<void> {
	await ctx.db.patch("henryPushes", pushId, { status: "skipped", note });
}
