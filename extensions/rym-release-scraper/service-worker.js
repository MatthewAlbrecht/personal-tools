const STORAGE_KEY = "rymReleaseCaptures";
const STORAGE_KEY_BANDCAMP = "bandcampAlbumCaptures";
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
			let errorMessage = text;
			try {
				const parsed = JSON.parse(text);
				if (typeof parsed?.error === "string" && parsed.error.trim()) {
					errorMessage = parsed.error.trim();
				}
			} catch {
				// keep raw response text
			}
			console.error(
				"[rym-release-scraper] backend sync failed",
				res.status,
				errorMessage,
			);
			return {
				synced: false,
				skipped: false,
				status: res.status,
				error: errorMessage,
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

function notifyScrapeProgress(tabId, payload) {
	if (typeof tabId !== "number") {
		return;
	}
	chrome.tabs.sendMessage(
		tabId,
		{ type: "RYM_SCRAPE_PROGRESS", ...payload },
		function ignoreMissing() {
			void chrome.runtime.lastError;
		},
	);
}

async function forwardCoversToBackend(origin, secret, payloads, tabId) {
	const covers = [];
	for (const payload of payloads) {
		if (
			payload &&
			typeof payload.rymUrl === "string" &&
			typeof payload.coverJpegBase64 === "string" &&
			payload.coverJpegBase64.length > 0
		) {
			covers.push({
				rymUrl: payload.rymUrl,
				jpegBase64: payload.coverJpegBase64,
			});
		}
	}
	if (covers.length === 0) {
		return { uploaded: 0, failed: 0 };
	}

	const url = `${origin}/api/rate-your-music/covers`;
	let uploaded = 0;
	let failed = 0;
	const chunkSize = 10;

	for (let i = 0; i < covers.length; i += chunkSize) {
		const chunk = covers.slice(i, i + chunkSize);
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${secret}`,
				},
				body: JSON.stringify({ covers: chunk }),
			});
			if (!res.ok) {
				failed += chunk.length;
				continue;
			}
			const json = await res.json().catch(function ignoreJson() {
				return {};
			});
			uploaded += typeof json.uploaded === "number" ? json.uploaded : 0;
			failed += typeof json.failed === "number" ? json.failed : 0;
		} catch (error) {
			console.error("[rym-release-scraper] cover upload error", error);
			failed += chunk.length;
		}
		notifyScrapeProgress(tabId, {
			headline: "Filing covers",
			detail: `${Math.min(i + chunk.length, covers.length)} of ${covers.length} cover batches sent.`,
			current: Math.min(i + chunk.length, covers.length),
			total: covers.length,
			phase: "covers",
		});
	}

	return { uploaded, failed };
}

/**
 * POST a charts page of scrapes in one request.
 */
async function forwardCapturesToBackend(payloads, tabId) {
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
	const items = payloads.map(function stripCover(p) {
		const { coverJpegBase64: _cover, ...rest } = p;
		return rest;
	});
	const chunkSize = 8;
	let upserted = 0;
	let failed = 0;

	try {
		for (let i = 0; i < items.length; i += chunkSize) {
			const chunk = items.slice(i, i + chunkSize);
			notifyScrapeProgress(tabId, {
				headline: "Writing to the library",
				detail: `${Math.min(i + chunk.length, items.length)} of ${items.length} rows.`,
				current: i,
				total: items.length,
				phase: "save",
			});
			const res = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${secret}`,
				},
				body: JSON.stringify({ items: chunk }),
			});

			if (!res.ok) {
				const text = await res.text();
				let errorMessage = text;
				try {
					const parsed = JSON.parse(text);
					if (typeof parsed?.error === "string" && parsed.error.trim()) {
						errorMessage = parsed.error.trim();
					}
				} catch {
					// keep raw response text
				}
				console.error(
					"[rym-release-scraper] charts backend sync failed",
					res.status,
					errorMessage,
				);
				if (i === 0) {
					return {
						synced: false,
						skipped: false,
						status: res.status,
						error: errorMessage,
					};
				}
				failed += chunk.length;
				continue;
			}

			const json = await res.json().catch(function ignoreJson() {
				return {};
			});
			upserted += typeof json?.upserted === "number" ? json.upserted : 0;
			failed += typeof json?.failed === "number" ? json.failed : 0;
			notifyScrapeProgress(tabId, {
				headline: "Writing to the library",
				detail: `${Math.min(i + chunk.length, items.length)} of ${items.length} rows.`,
				current: Math.min(i + chunk.length, items.length),
				total: items.length,
				phase: "save",
			});
		}

		const covers = await forwardCoversToBackend(
			origin,
			secret,
			payloads,
			tabId,
		);
		return {
			synced: true,
			skipped: false,
			upserted,
			failed,
			coversUploaded: covers.uploaded,
			coversFailed: covers.failed,
		};
	} catch (error) {
		console.error("[rym-release-scraper] charts backend sync error", error);
		return {
			synced: false,
			skipped: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message && message.type === "RYM_CHARTS_CAPTURE") {
		void (async function persistChartCaptures() {
			try {
				const payloads = Array.isArray(message.payloads)
					? message.payloads
					: [];
				const prev = await chrome.storage.local.get(STORAGE_KEY);
				const map =
					prev[STORAGE_KEY] && typeof prev[STORAGE_KEY] === "object"
						? prev[STORAGE_KEY]
						: {};
				for (const payload of payloads) {
					if (payload?.canonicalPath) {
						const { coverJpegBase64: _cover, ...rest } = payload;
						map[payload.canonicalPath] = rest;
					}
				}
				await chrome.storage.local.set({ [STORAGE_KEY]: map });

				const backend = await forwardCapturesToBackend(
					payloads,
					sender.tab?.id,
				);
				sendResponse({ ok: true, backend });
			} catch (error) {
				console.error(
					"[rym-release-scraper] failed to save charts capture",
					error,
				);
				sendResponse({ ok: false });
			}
		})();
		return true;
	}

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

/**
 * POST Bandcamp album capture to Next.js → Convex when extension options are
 * configured. Reuses the same origin/secret settings and host-permission
 * flow as `forwardCaptureToBackend`.
 */
async function forwardBandcampCaptureToBackend(payload) {
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
			"[rym-release-scraper] bandcamp sync skipped — set ingest secret in extension options",
		);
		return { synced: false, skipped: true };
	}

	const permitted = await ensureHostPermissionForBackend(origin);
	if (!permitted) {
		console.warn(
			"[rym-release-scraper] bandcamp sync blocked — host permission denied",
		);
		return {
			synced: false,
			skipped: false,
			error: "Host permission denied — allow access when Chrome prompts",
		};
	}

	const url = `${origin}/api/bandcamp/capture`;

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${secret}`,
			},
			body: JSON.stringify({
				bandcampUrl: payload.bandcampUrl,
				name: payload.name,
				artistName: payload.artistName,
				imageUrl: payload.imageUrl,
				releaseDate: payload.releaseDate,
			}),
		});

		if (!res.ok) {
			const text = await res.text();
			let errorMessage = text;
			try {
				const parsed = JSON.parse(text);
				if (typeof parsed?.error === "string" && parsed.error.trim()) {
					errorMessage = parsed.error.trim();
				}
			} catch {
				// keep raw response text
			}
			console.error(
				"[rym-release-scraper] bandcamp sync failed",
				res.status,
				errorMessage,
			);
			return {
				synced: false,
				skipped: false,
				status: res.status,
				error: errorMessage,
			};
		}

		const json = await res.json().catch(function ignoreJson() {
			return {};
		});
		return {
			synced: true,
			skipped: false,
			alreadyExists: json?.alreadyExists,
			alreadyInLibrary: json?.alreadyInLibrary,
		};
	} catch (error) {
		console.error("[rym-release-scraper] bandcamp sync error", error);
		return {
			synced: false,
			skipped: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!message || message.type !== "BANDCAMP_ALBUM_CAPTURE") {
		return;
	}

	void (async function persistBandcampCapture() {
		try {
			const prev = await chrome.storage.local.get(STORAGE_KEY_BANDCAMP);
			const map =
				prev[STORAGE_KEY_BANDCAMP] &&
				typeof prev[STORAGE_KEY_BANDCAMP] === "object"
					? prev[STORAGE_KEY_BANDCAMP]
					: {};
			map[message.payload.bandcampUrl] = message.payload;
			await chrome.storage.local.set({ [STORAGE_KEY_BANDCAMP]: map });

			const backend = await forwardBandcampCaptureToBackend(message.payload);
			sendResponse({ ok: true, backend });
		} catch (error) {
			console.error(
				"[rym-release-scraper] failed to save bandcamp capture",
				error,
			);
			sendResponse({ ok: false });
		}
	})();

	return true;
});
