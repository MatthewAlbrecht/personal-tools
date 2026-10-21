"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { sendWebPush } from "../model/yugioh/webPushSender";

// Sends a due push to every device with push on (Node: the `web-push`
// library). Scheduled by `queuePush` in `convex/model/yugioh/pushes.ts`.
export const deliver = internalAction({
	args: { pushId: v.id("yugiohPushes") },
	returns: v.null(),
	handler: async (ctx, { pushId }) => {
		const delivery = await ctx.runMutation(
			internal.yugioh.pushes.claimDelivery,
			{ pushId },
		);
		if (delivery === null) return null;
		const results = await Promise.all(
			delivery.subscriptions.map(async ({ _id, ...subscription }) => ({
				subscriptionId: _id,
				outcome: await sendWebPush(
					subscription,
					delivery.payload,
					delivery.options,
				),
			})),
		);
		await ctx.runMutation(internal.yugioh.pushes.recordDelivery, {
			pushId,
			results,
		});
		return null;
	},
});
