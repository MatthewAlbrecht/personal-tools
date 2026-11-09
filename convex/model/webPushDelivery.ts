"use node";

// Sends one delivery to each of its devices (Node: the `web-push` library,
// through `./yugioh/webPushSender`). Shared by every feature's delivery
// action; each records the results with its own mutation.
import type { Delivery, DeviceResults } from "./yugioh/pushes";
import { sendWebPush } from "./yugioh/webPushSender";

export async function sendToDevices(
	delivery: Delivery,
): Promise<DeviceResults> {
	return await Promise.all(
		delivery.subscriptions.map(async ({ _id, ...subscription }) => ({
			subscriptionId: _id,
			outcome: await sendSafely(
				subscription,
				delivery.payload,
				delivery.options,
			),
		})),
	);
}

/** One device's send; a throw is that device's failure, not the whole push's. */
async function sendSafely(
	...args: Parameters<typeof sendWebPush>
): ReturnType<typeof sendWebPush> {
	try {
		return await sendWebPush(...args);
	} catch (error) {
		return {
			status: "failed",
			reason: `The send failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}
