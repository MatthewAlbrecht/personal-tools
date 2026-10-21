// @vitest-environment node
// Bug: a capture posted to an app without the route (a 404 HTML page) showed
// the whole page in the dock and logged it. Failed ingest and automation
// calls must say what's wrong in one short sentence, and log only the status
// and an excerpt. chrome and fetch are stubbed; the service worker is real.

import { afterEach, beforeEach, expect, test, vi } from "vitest";

const NOT_FOUND_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><title>404: This page could not be found.</title>${'<script>self.__next_f.push([1,"x"])</script>'.repeat(200)}</head><body><h1>404</h1></body></html>`;

type Listener = (
	message: unknown,
	sender: { tab?: { id: number } },
	sendResponse: (response: unknown) => void,
) => unknown;

let listeners: Listener[] = [];
let logged: unknown[][] = [];

async function loadServiceWorker(origin: string): Promise<void> {
	listeners = [];
	logged = [];
	const event = () => ({ addListener: () => {} });
	vi.stubGlobal("importScripts", () => {});
	vi.stubGlobal("chrome", {
		runtime: {
			onMessage: {
				addListener: (listener: Listener) => listeners.push(listener),
			},
			onStartup: event(),
			onInstalled: event(),
			sendMessage: () => {},
		},
		alarms: { onAlarm: event() },
		storage: {
			onChanged: event(),
			sync: {
				get: async () => ({
					rymBackendOrigin: origin,
					rymBackendSecret: "secret",
				}),
			},
			local: { get: async () => ({}) },
		},
		permissions: { contains: async () => true },
		tabs: { sendMessage: () => {} },
	});
	const record = (...args: unknown[]) => {
		logged.push(args);
	};
	vi.spyOn(console, "error").mockImplementation(record);
	vi.spyOn(console, "warn").mockImplementation(record);
	vi.resetModules();
	await import("../automation-runner.js");
	await import("../ingest-errors.js");
	await import("../service-worker.js");
}

function respondWith(status: number, body: string, contentType: string) {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(body, {
					status,
					headers: { "content-type": contentType },
				}),
		),
	);
}

async function sendTcgplayerCapture(): Promise<{
	ok: boolean;
	backend: { synced: boolean; status?: number; error?: string };
}> {
	return await new Promise((resolve) => {
		for (const listener of listeners) {
			listener(
				{ type: "YUGIOH_TCGPLAYER_CAPTURE", product: { productId: 1 } },
				{ tab: { id: 7 } },
				resolve as (response: unknown) => void,
			);
		}
	});
}

beforeEach(() => {
	vi.useRealTimers();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test("a capture sent to an app without the route says to deploy it or use localhost, not the 404 page", async () => {
	await loadServiceWorker("https://www.moooose.dev");
	respondWith(404, NOT_FOUND_PAGE, "text/html; charset=utf-8");

	const response = await sendTcgplayerCapture();

	expect(response.backend).toMatchObject({ synced: false, status: 404 });
	expect(response.backend.error).toBe(
		"The app at www.moooose.dev doesn't have this capture yet (404). Deploy it, or point the extension at http://localhost:1333 in its options.",
	);
	const log = JSON.stringify(logged);
	expect(log).not.toContain("<!DOCTYPE");
	expect(log).toContain("HTTP 404");
	expect(log.length).toBeLessThan(600);
});

test("a capture the app refuses for its secret says the secret doesn't match", async () => {
	await loadServiceWorker("https://www.moooose.dev");
	respondWith(
		401,
		JSON.stringify({ error: "Unauthorized" }),
		"application/json",
	);

	const response = await sendTcgplayerCapture();

	expect(response.backend.error).toBe(
		"The ingest secret doesn't match the app at www.moooose.dev (401). Copy the app's RYM_EXTENSION_INGEST_SECRET into the extension's options.",
	);
});

test("an app error with a JSON reason keeps the reason", async () => {
	await loadServiceWorker("http://localhost:1333");
	respondWith(
		503,
		JSON.stringify({
			error: "RYM_EXTENSION_INGEST_SECRET is not set on the server",
		}),
		"application/json",
	);

	const response = await sendTcgplayerCapture();

	expect(response.backend.error).toBe(
		"RYM_EXTENSION_INGEST_SECRET is not set on the server",
	);
});

test("a server error page is cut down to its status", async () => {
	await loadServiceWorker("https://www.moooose.dev");
	respondWith(502, "<html><body>Bad gateway</body></html>", "text/html");

	const response = await sendTcgplayerCapture();

	expect(response.backend.error).toBe(
		"The app at www.moooose.dev answered HTTP 502.",
	);
});
