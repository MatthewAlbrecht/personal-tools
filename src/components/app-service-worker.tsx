"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "~/lib/auth-context";
import { currentSubscription, subscriptionArgs } from "~/lib/push";
import { api } from "../../convex/_generated/api";

/**
 * The tap message from `public/sw.js`. "yugioh-open" is what workers before
 * the app-wide change posted; an installed device can still be running one
 * until the browser picks up the new worker.
 */
const OPEN_MESSAGE_TYPES = new Set(["app-open", "yugioh-open"]);

/**
 * Mounted once in the root layout, so it runs whichever page the app opens
 * on. Registers the service worker (`/sw.js`), re-saves this device's push
 * subscription once signed in (iOS never fires `pushsubscriptionchange`, so
 * each launch refreshes it), and routes notification taps the worker hands
 * to an open window.
 */
export function AppServiceWorker(): null {
	const router = useRouter();
	const { isAuthenticated } = useAuth();
	const savePushSubscription = useMutation(
		api.yugioh.pushes.savePushSubscription,
	);

	// Syncs with the browser's service worker registration.
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		navigator.serviceWorker
			.register("/sw.js", { scope: "/" })
			.catch((error: unknown) => {
				console.error("Service worker registration failed", error);
			});
	}, []);

	// Syncs with the browser's push subscription. Signed out (at /login) it
	// waits: the refresh runs once the session check says signed in.
	useEffect(() => {
		if (!isAuthenticated || !("serviceWorker" in navigator)) return;
		void navigator.serviceWorker.ready
			.then(() => currentSubscription())
			.then((subscription) => {
				if (subscription) {
					return savePushSubscription(subscriptionArgs(subscription));
				}
			})
			.catch((error: unknown) => {
				console.error("Push subscription refresh failed", error);
			});
	}, [isAuthenticated, savePushSubscription]);

	// Syncs with messages from the service worker (a tapped notification).
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		function onMessage(event: MessageEvent): void {
			const url = openMessageUrl(event.data);
			if (url) router.push(url);
		}
		navigator.serviceWorker.addEventListener("message", onMessage);
		return () =>
			navigator.serviceWorker.removeEventListener("message", onMessage);
	}, [router]);

	return null;
}

/** The same-origin path a tap message asks to open, or null. */
function openMessageUrl(data: unknown): string | null {
	if (
		typeof data === "object" &&
		data !== null &&
		"type" in data &&
		typeof data.type === "string" &&
		OPEN_MESSAGE_TYPES.has(data.type) &&
		"url" in data &&
		typeof data.url === "string" &&
		data.url.startsWith("/") &&
		!data.url.startsWith("//")
	) {
		return data.url;
	}
	return null;
}
