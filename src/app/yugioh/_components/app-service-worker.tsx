"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../../convex/_generated/api";
import { currentSubscription, subscriptionArgs } from "../_utils/push";

/**
 * Registers the service worker (`/sw.js`) when the app opens, re-saves this
 * device's push subscription (iOS never fires `pushsubscriptionchange`, so
 * each launch refreshes it), and routes notification clicks the worker
 * hands to an open window.
 */
export function AppServiceWorker(): null {
	const router = useRouter();
	const savePushSubscription = useMutation(
		api.yugioh.pushes.savePushSubscription,
	);

	// Syncs with the browser's service worker registration and push subscription.
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		void navigator.serviceWorker
			.register("/sw.js", { scope: "/" })
			.then(() => currentSubscription())
			.then((subscription) => {
				if (subscription) {
					return savePushSubscription(subscriptionArgs(subscription));
				}
			})
			.catch((error: unknown) => {
				console.error("Service worker setup failed", error);
			});
	}, [savePushSubscription]);

	// Syncs with messages from the service worker (a tapped notification).
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		function onMessage(event: MessageEvent): void {
			const data: unknown = event.data;
			if (
				typeof data === "object" &&
				data !== null &&
				"type" in data &&
				data.type === "yugioh-open" &&
				"url" in data &&
				typeof data.url === "string" &&
				data.url.startsWith("/") &&
				!data.url.startsWith("//")
			) {
				router.push(data.url);
			}
		}
		navigator.serviceWorker.addEventListener("message", onMessage);
		return () =>
			navigator.serviceWorker.removeEventListener("message", onMessage);
	}, [router]);

	return null;
}
