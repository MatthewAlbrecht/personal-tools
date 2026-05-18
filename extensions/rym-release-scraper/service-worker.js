const STORAGE_KEY = "rymReleaseCaptures";
const SETTINGS_BACKEND_ORIGIN = "rymBackendOrigin";
const SETTINGS_BACKEND_SECRET = "rymBackendSecret";

/**
 * Non-local origins need a one-time grant via chrome.permissions (declared in optional_host_permissions).
 */
async function ensureHostPermissionForBackend(origin) {
	let parsed;
	try {
		parsed = new URL(origin);
	} catch {
		return false;
	}

	const host = parsed.hostname;
	if (host === "localhost" || host === "127.0.0.1") {
		return true;
	}

	const pattern = `${parsed.origin}/*`;

	try {
		const has = await chrome.permissions.contains({ origins: [pattern] });
		if (has) {
			return true;
		}
		return await chrome.permissions.request({ origins: [pattern] });
	} catch (error) {
		console.error("[rym-release-scraper] host permission failed", error);
		return false;
	}
}

/**
 * POST scrape payload to Next.js → Convex when extension options are configured.
 */
async function forwardCaptureToBackend(payload) {
	const cfg = await chrome.storage.sync.get([
		SETTINGS_BACKEND_ORIGIN,
		SETTINGS_BACKEND_SECRET,
	]);

	const originRaw =
		(typeof cfg[SETTINGS_BACKEND_ORIGIN] === "string" &&
			cfg[SETTINGS_BACKEND_ORIGIN].trim()) ||
		"https://www.moooose.dev";
	const origin = originRaw.replace(/\/+$/, "");
	const secret =
		typeof cfg[SETTINGS_BACKEND_SECRET] === "string"
			? cfg[SETTINGS_BACKEND_SECRET].trim()
			: "";

	if (!secret) {
		console.info(
			"[rym-release-scraper] backend sync skipped — set ingest secret in extension options",
		);
		return { synced: false, skipped: true };
	}

	const permitted = await ensureHostPermissionForBackend(origin);
	if (!permitted) {
		console.warn(
			"[rym-release-scraper] backend sync blocked — host permission denied",
		);
		return {
			synced: false,
			skipped: false,
			error: "Host permission denied — allow access when Chrome prompts",
		};
	}

	const url = `${origin}/api/rate-your-music/scrape`;

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${secret}`,
			},
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const text = await res.text();
			console.error(
				"[rym-release-scraper] backend sync failed",
				res.status,
				text,
			);
			return {
				synced: false,
				skipped: false,
				status: res.status,
				error: text,
			};
		}

		await res.json().catch(function ignoreJson() {
			return {};
		});
		return { synced: true, skipped: false };
	} catch (error) {
		console.error("[rym-release-scraper] backend sync error", error);
		return {
			synced: false,
			skipped: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!message || message.type !== "RYM_RELEASE_CAPTURE") {
		return;
	}

	void (async function persistCapture() {
		try {
			const prev = await chrome.storage.local.get(STORAGE_KEY);
			const map =
				prev[STORAGE_KEY] && typeof prev[STORAGE_KEY] === "object"
					? prev[STORAGE_KEY]
					: {};
			map[message.payload.canonicalPath] = message.payload;
			await chrome.storage.local.set({ [STORAGE_KEY]: map });

			const backend = await forwardCaptureToBackend(message.payload);
			sendResponse({ ok: true, backend });
		} catch (error) {
			console.error("[rym-release-scraper] failed to save capture", error);
			sendResponse({ ok: false });
		}
	})();

	return true;
});
