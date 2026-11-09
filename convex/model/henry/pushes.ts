// The Henry's pushes: which listed and relisted units push, the per-unit
// merge of held pushes, and delivery. Sending is the Node action
// `convex/henry/pushDelivery.ts`; devices, quiet hours and per-device
// outcomes are shared with Yu-Gi-Oh's pushes.
import type { Infer } from "convex/values";
import { millisecondsInHour } from "date-fns/constants";
import {
	pushesNewUnit,
	unitPushTag,
	unitPushText,
	unitPushUrl,
} from "../../../src/lib/henry/pushes";
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
import { isStarred } from "./stars";
import type { henryPushReasonValidator } from "./validators";

export type HenryPushReason = Infer<typeof henryPushReasonValidator>;

/** How long the push service keeps trying an offline device. */
const TTL_SECONDS = (12 * millisecondsInHour) / 1000;

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
 * Files a push for a unit, delivered now or, in quiet hours, at 8am. A unit
 * with a push still pending gets `reason` added to that one instead: one
 * push per unit per delivery, its text written at delivery from the unit's
 * latest state.
 */
export async function queueUnitPush(
	ctx: MutationCtx,
	unitId: Id<"henryUnits">,
	reason: HenryPushReason,
	now: number,
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
			updatedAt: now,
		});
		return;
	}
	const deliverAt = pushDeliveryTime(now, await userTimeZone(ctx));
	const pushId = await ctx.db.insert("henryPushes", {
		unitId,
		reasons: [reason],
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

/**
 * Starts delivering a push that's due, with text from the unit as it is
 * now. Null when there's nothing to send: already handled, the unit has
 * gone off the market, or no device has push on. Those are marked skipped.
 */
export async function claimDelivery(
	ctx: MutationCtx,
	pushId: Id<"henryPushes">,
	now: number,
): Promise<Delivery | null> {
	const push = await ctx.db.get("henryPushes", pushId);
	if (!push || push.status !== "pending") return null;
	const unit = await ctx.db.get("henryUnits", push.unitId);
	// Ticket 07: a held drop is also dropped here if the unit is no longer
	// starred or its price is no longer below the price before the drop.
	if (!unit || unit.status === "offMarket") {
		await skip(ctx, pushId, "The unit went off the market.");
		return null;
	}
	const devices = await pushDevices(ctx);
	if (devices.length === 0) {
		await skip(ctx, pushId, "No device has alerts on.");
		return null;
	}
	const text = unitPushText({
		number: unit.number,
		beds: unit.beds,
		sqft: unit.sqft,
		price: unit.price,
		// Listed and relisted while held is still new to me.
		relisted: !push.reasons.includes("listed"),
	});
	await ctx.db.patch("henryPushes", pushId, { status: "sending", ...text });
	await ctx.scheduler.runAfter(
		SEND_DEADLINE_MS,
		internal.henry.pushes.expireDelivery,
		{ pushId },
	);
	return {
		payload: JSON.stringify({
			...text,
			url: unitPushUrl(unit.number),
			tag: unitPushTag(unit.number),
		}),
		options: {
			ttlSeconds: TTL_SECONDS,
			urgency: "normal",
			topic: pushTopic(unit._id),
		},
		subscriptions: devices,
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
