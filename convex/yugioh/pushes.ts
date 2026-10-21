import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireAuth } from "../auth";
import * as Pushes from "../model/yugioh/pushes";
import {
	yugiohPushOptionsValidator,
	yugiohPushOutcomeValidator,
	yugiohPushSubscriptionValidator,
} from "../model/yugioh/validators";

// Push notifications. The app turns push on and off per device; deal checks
// and deliveries are internal, scheduled from matching and from each other.

/** Turns push on for this device, or refreshes it on launch. */
export const savePushSubscription = mutation({
	args: { ...yugiohPushSubscriptionValidator.fields, timeZone: v.string() },
	returns: v.null(),
	handler: async (ctx, { timeZone, ...subscription }) => {
		requireAuth(ctx);
		await Pushes.savePushSubscription(ctx, subscription, timeZone, Date.now());
		return null;
	},
});

/** Turns push off for this device. */
export const removePushSubscription = mutation({
	args: { endpoint: v.string() },
	returns: v.null(),
	handler: async (ctx, { endpoint }) => {
		requireAuth(ctx);
		await Pushes.removePushSubscription(ctx, endpoint);
		return null;
	},
});

/** Whether this device (its push endpoint) has push on. */
export const hasPushSubscription = query({
	args: { endpoint: v.string() },
	returns: v.boolean(),
	handler: async (ctx, { endpoint }) => {
		requireAuth(ctx);
		return await Pushes.hasPushSubscription(ctx, endpoint);
	},
});

/** Sends a test push to every device with push on, at any hour. */
export const sendTestPush = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		requireAuth(ctx);
		await Pushes.queueTestPush(ctx, Date.now());
		return null;
	},
});

export const checkDeal = internalMutation({
	args: { listingId: v.id("yugiohListings") },
	returns: v.null(),
	handler: async (ctx, { listingId }) => {
		await Pushes.checkDeal(ctx, listingId, Date.now());
		return null;
	},
});

const deliveryValidator = v.object({
	payload: v.string(),
	options: yugiohPushOptionsValidator,
	subscriptions: v.array(
		yugiohPushSubscriptionValidator.extend({
			_id: v.id("yugiohPushSubscriptions"),
		}),
	),
});

export const claimDelivery = internalMutation({
	args: { pushId: v.id("yugiohPushes") },
	returns: v.union(deliveryValidator, v.null()),
	handler: async (ctx, { pushId }) =>
		await Pushes.claimDelivery(ctx, pushId, Date.now()),
});

export const recordDelivery = internalMutation({
	args: {
		pushId: v.id("yugiohPushes"),
		results: v.array(
			v.object({
				subscriptionId: v.id("yugiohPushSubscriptions"),
				outcome: yugiohPushOutcomeValidator,
			}),
		),
	},
	returns: v.null(),
	handler: async (ctx, { pushId, results }) => {
		await Pushes.recordDelivery(ctx, pushId, results, Date.now());
		return null;
	},
});
