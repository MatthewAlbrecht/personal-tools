"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { sendToDevices } from "../model/webPushDelivery";

// Sends a due Henry push to every device with push on. Scheduled by
// `queueUnitPush` in `convex/model/henry/pushes.ts`.
export const deliver = internalAction({
	args: { pushId: v.id("henryPushes") },
	returns: v.null(),
	handler: async (ctx, { pushId }) => {
		const delivery = await ctx.runMutation(
			internal.henry.pushes.claimDelivery,
			{ pushId },
		);
		if (delivery === null) return null;
		const results = await sendToDevices(delivery);
		await ctx.runMutation(internal.henry.pushes.recordDelivery, {
			pushId,
			results,
		});
		return null;
	},
});
