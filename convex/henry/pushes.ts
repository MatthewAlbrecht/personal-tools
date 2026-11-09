import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import * as Pushes from "../model/henry/pushes";
import {
	pushDeliveryValidator,
	pushDeviceResultsValidator,
} from "../model/yugioh/validators";

// The Henry's push deliveries: internal, scheduled by record check (see
// `convex/model/henry/pushes.ts`) and run by `henry/pushDelivery:deliver`.

export const claimDelivery = internalMutation({
	args: { pushId: v.id("henryPushes") },
	returns: v.union(pushDeliveryValidator, v.null()),
	handler: async (ctx, { pushId }) =>
		await Pushes.claimDelivery(ctx, pushId, Date.now()),
});

export const recordDelivery = internalMutation({
	args: { pushId: v.id("henryPushes"), results: pushDeviceResultsValidator },
	returns: v.null(),
	handler: async (ctx, { pushId, results }) => {
		await Pushes.recordDelivery(ctx, pushId, results, Date.now());
		return null;
	},
});

export const expireDelivery = internalMutation({
	args: { pushId: v.id("henryPushes") },
	returns: v.null(),
	handler: async (ctx, { pushId }) => {
		await Pushes.expireDelivery(ctx, pushId, Date.now());
		return null;
	},
});
