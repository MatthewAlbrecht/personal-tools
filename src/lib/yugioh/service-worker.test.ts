import { describe, expect, test, vi } from "vitest";
import source from "../../../public/sw.js?raw";

// Loads the app's real service worker (`public/sw.js`) with its globals
// stubbed, then taps a notification. A push opens a page of the app (the home
// page when it has no usable link); a Yu-Gi-Oh auction push opens its eBay
// Listing, since time matters more than context.

type Listener = (event: unknown) => void;

function loadWorker({ openWindow = false } = {}) {
	const listeners = new Map<string, Listener>();
	const open = { focus: vi.fn(async () => {}), postMessage: vi.fn() };
	const clients = {
		claim: vi.fn(async () => {}),
		matchAll: vi.fn(async () => (openWindow ? [open] : [])),
		openWindow: vi.fn(async () => null),
	};
	const self = {
		addEventListener: (type: string, listener: Listener) =>
			listeners.set(type, listener),
		skipWaiting: vi.fn(),
		registration: { showNotification: vi.fn(async () => {}) },
		clients,
	};
	new Function("self", source)(self);

	async function tap(url: unknown): Promise<void> {
		let done: Promise<unknown> = Promise.resolve();
		listeners.get("notificationclick")?.({
			notification: { close: vi.fn(), data: { url } },
			waitUntil: (promise: Promise<unknown>) => {
				done = promise;
			},
		});
		await done;
	}
	return { tap, clients, open };
}

const EBAY_ITEM = "https://www.ebay.com/itm/406512345678";

describe("tapping a push", () => {
	test("an app path routes the open window there", async () => {
		const worker = loadWorker({ openWindow: true });
		await worker.tap("/yugioh/decks/abc/listings?listing=xyz");
		expect(worker.open.postMessage).toHaveBeenCalledWith({
			type: "app-open",
			url: "/yugioh/decks/abc/listings?listing=xyz",
		});
		expect(worker.clients.openWindow).not.toHaveBeenCalled();
	});

	test("an eBay Listing opens directly, even with the app open", async () => {
		const worker = loadWorker({ openWindow: true });
		await worker.tap(EBAY_ITEM);
		expect(worker.clients.openWindow).toHaveBeenCalledWith(EBAY_ITEM);
		expect(worker.open.postMessage).not.toHaveBeenCalled();
	});

	test("a page of another feature routes the open window there", async () => {
		const worker = loadWorker({ openWindow: true });
		await worker.tap("/henry?unit=123");
		expect(worker.open.postMessage).toHaveBeenCalledWith({
			type: "app-open",
			url: "/henry?unit=123",
		});
	});

	test("with no window open, an app path opens a new one there", async () => {
		const worker = loadWorker();
		await worker.tap("/yugioh/settings");
		expect(worker.clients.openWindow).toHaveBeenCalledWith("/yugioh/settings");
	});

	test("any other site, or no link, opens the home page instead", async () => {
		const worker = loadWorker();
		await worker.tap("https://evil.example/itm/1");
		await worker.tap("https://www.ebay.com.evil.example/itm/1");
		await worker.tap("//evil.example/");
		await worker.tap(undefined);
		expect(worker.clients.openWindow.mock.calls).toEqual([
			["/"],
			["/"],
			["/"],
			["/"],
		]);
	});
});
