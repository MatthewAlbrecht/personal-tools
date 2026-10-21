// @ts-nocheck: service worker globals (`self.registration`, `clients`) aren't
// in the app's DOM-only TypeScript lib.
// Service worker for the installed app: shows pushes and opens them.
// Platform rules (iOS especially): docs/yugioh/references/ios-web-push.md.
// Every push must end in a shown notification, even a malformed one: iOS
// drops the subscription for good after three silent pushes. Quiet hours are
// enforced on the server by not sending, never here.

const FALLBACK = {
	title: "Yu-Gi-Oh",
	body: "Something changed in your Decks.",
	url: "/yugioh",
};

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	// Control open pages at once, so a notification click can reach them.
	event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
	const push = readPush(event);
	event.waitUntil(
		self.registration
			.showNotification(push.title, {
				body: push.body,
				tag: push.tag,
				icon: "/icon-192.png",
				data: { url: push.url },
			})
			.catch(() => undefined),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = pushTarget(event.notification.data?.url);
	event.waitUntil(openTarget(url).catch(() => undefined));
});

/** The push's JSON ({ title, body, url, tag }), or a generic one. */
function readPush(event) {
	try {
		const data = event.data ? event.data.json() : null;
		if (data && typeof data.title === "string" && data.title !== "") {
			return {
				title: data.title,
				body: typeof data.body === "string" ? data.body : "",
				url: pushTarget(data.url),
				tag: typeof data.tag === "string" ? data.tag : undefined,
			};
		}
	} catch {
		// Not JSON: show the generic notification.
	}
	return { ...FALLBACK, tag: undefined };
}

/** An eBay Listing: an auction push opens it directly, as time matters most. */
const EBAY_ITEM = /^https:\/\/www\.ebay\.com\/itm\/\d+$/;

/** A same-origin path or an eBay Listing to open; anything else opens the tracker. */
function pushTarget(url) {
	if (typeof url === "string" && EBAY_ITEM.test(url)) return url;
	if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) {
		return FALLBACK.url;
	}
	return url;
}

/** Opens an eBay Listing in a new window, or a page of the app. */
async function openTarget(url) {
	if (EBAY_ITEM.test(url)) {
		await self.clients.openWindow(url);
		return;
	}
	await openApp(url);
}

/**
 * Focuses an open window and has the page route itself there (`navigate()`
 * only works on a window this worker controls), else opens a new one. Both
 * need the click's short user gesture, so nothing slow comes first.
 */
async function openApp(path) {
	const windows = await self.clients.matchAll({
		type: "window",
		includeUncontrolled: true,
	});
	const open = windows[0];
	if (open) {
		await open.focus();
		open.postMessage({ type: "yugioh-open", url: path });
		return;
	}
	await self.clients.openWindow(path);
}
