"use node";

// The push service adapter: sends one encrypted Web Push message with the
// VAPID keys from Convex env (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT). Status codes and headers: docs/yugioh/references/ios-web-push.md.
import webpush, { WebPushError } from "web-push";
import type { PushOptions, PushOutcome, PushSubscriptionInput } from "./pushes";

/** One device's send gives up after this long. */
const SEND_TIMEOUT_MS = 30_000;

export async function sendWebPush(
	subscription: PushSubscriptionInput,
	payload: string,
	options: PushOptions,
): Promise<PushOutcome> {
	const publicKey = process.env.VAPID_PUBLIC_KEY;
	const privateKey = process.env.VAPID_PRIVATE_KEY;
	const subject = process.env.VAPID_SUBJECT;
	if (!publicKey || !privateKey || !subject) {
		return {
			status: "failed",
			reason:
				"VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set in Convex env.",
		};
	}
	try {
		await webpush.sendNotification(subscription, payload, {
			vapidDetails: { subject, publicKey, privateKey },
			TTL: options.ttlSeconds,
			urgency: options.urgency,
			// A hung push service must not hold the send past its deadline.
			timeout: SEND_TIMEOUT_MS,
			...(options.topic === null ? {} : { topic: options.topic }),
		});
		return { status: "sent" };
	} catch (error) {
		if (error instanceof WebPushError) {
			// RFC 8030 uses 404 for an expired subscription; Apple uses 410.
			if (error.statusCode === 404 || error.statusCode === 410) {
				return { status: "gone" };
			}
			return {
				status: "failed",
				reason: `The push service answered ${error.statusCode}${reasonOf(error.body)}.`,
			};
		}
		return {
			status: "failed",
			reason: `Couldn't reach the push service: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/** Apple's error bodies are JSON with a `reason` ("BadJwtToken"). */
function reasonOf(body: string): string {
	try {
		const parsed: unknown = JSON.parse(body);
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			"reason" in parsed &&
			typeof parsed.reason === "string"
		) {
			return ` (${parsed.reason})`;
		}
	} catch {
		// Not JSON.
	}
	return "";
}
