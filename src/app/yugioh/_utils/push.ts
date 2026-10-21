// Web Push in the browser: what this device can do, and its subscription.
// Platform facts: docs/yugioh/references/ios-web-push.md.

/**
 * What this browser allows: push itself; "install" for an iPhone or iPad
 * Safari tab (push only exists once the app is on the home screen); or none.
 */
export type PushSupport = "push" | "install" | "none";

export function pushSupport(): PushSupport {
	if (
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window
	) {
		return "push";
	}
	return /iPhone|iPad|iPod/.test(navigator.userAgent) ? "install" : "none";
}

/** This device's push subscription, or null (none, or no push here). */
export async function currentSubscription(): Promise<PushSubscription | null> {
	if (pushSupport() !== "push") return null;
	const registration = await navigator.serviceWorker.getRegistration("/");
	return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Subscribes this device. Call straight from the tap that asked for it:
 * iOS only shows the permission prompt within a few seconds of a tap, so no
 * other awaits come first.
 */
export async function subscribeThisDevice(
	vapidPublicKey: string,
): Promise<PushSubscription> {
	const registration = await navigator.serviceWorker.ready;
	return await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: base64UrlToBytes(vapidPublicKey),
	});
}

/** The subscription as the Convex mutation takes it, with this device's time zone. */
export function subscriptionArgs(subscription: PushSubscription): {
	endpoint: string;
	keys: { p256dh: string; auth: string };
	timeZone: string;
} {
	const json = subscription.toJSON();
	return {
		endpoint: subscription.endpoint,
		keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	};
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4))
		.replace(/-/g, "+")
		.replace(/_/g, "/");
	const raw = atob(base64);
	const bytes = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}
