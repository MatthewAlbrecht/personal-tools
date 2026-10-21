importScripts("marketplaces.js", "automation-runner.js", "ingest-errors.js");

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

/**
 * The app's Listings for a capture's `listingsPage` (`{ deckId, cardId }`),
 * filtered to `marketplace` and the Card; null when the app named no Deck.
 */
function listingsUrlFor(origin, listingsPage, marketplace) {
	if (!listingsPage || typeof listingsPage.deckId !== "string") return null;
	const params = new URLSearchParams({ marketplace });
	if (typeof listingsPage.cardId === "string") {
		params.set("card", listingsPage.cardId);
	}
	return `${origin}/yugioh/decks/${encodeURIComponent(listingsPage.deckId)}/listings?${params.toString()}`;
}

/**
 * POST one Yu-Gi-Oh capture to Next.js → Convex (`/api/yugioh/<kind>-capture`).
 * Same origin/secret settings and host-permission flow as the RYM and
 * Bandcamp captures. `label` names the page in logs; `marketplace` is the
 * Listings filter for the reply's `listingsUrl`.
 */
async function postYugiohCapture(path, body, label, marketplace) {
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
		return { synced: false, skipped: true };
	}
	const permitted = await ensureHostPermissionForBackend(origin);
	if (!permitted) {
		return {
			synced: false,
			skipped: false,
			error: "Host permission denied — allow access when Chrome prompts",
		};
	}

	try {
		const res = await fetch(`${origin}${path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${secret}`,
			},
			body: JSON.stringify(body),
		});
		const text = await res.text();
		let json = {};
		try {
			json = JSON.parse(text);
		} catch {
			// keep raw response text for the error
		}
		if (!res.ok) {
			const failure = describeFailedResponse(origin, res.status, text);
			console.error(
				`[rym-release-scraper] ${label} capture failed`,
				failure.log,
			);
			return {
				synced: false,
				skipped: false,
				status: res.status,
				error: failure.message,
			};
		}
		const listingsUrl = listingsUrlFor(origin, json?.listingsPage, marketplace);
		return {
			synced: true,
			skipped: false,
			...json,
			...(listingsUrl ? { listingsUrl } : {}),
		};
	} catch (error) {
		console.error(`[rym-release-scraper] ${label} capture error`, error);
		return {
			synced: false,
			skipped: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

// eBay search-results page → `{ captured, created, updated, auctionsWithoutEndTime }`.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message || message.type !== "YUGIOH_EBAY_CAPTURE") {
		return;
	}
	void (async function sendEbayCapture() {
		try {
			const listings = Array.isArray(message.listings) ? message.listings : [];
			const searchUrl =
				typeof message.searchUrl === "string" ? message.searchUrl : undefined;
			const backend = await postYugiohCapture(
				"/api/yugioh/ebay-capture",
				{ listings, searchUrl },
				"eBay",
				"ebay",
			);
			sendResponse({ ok: true, backend });
			settleAutomatedVisit(sender.tab?.id, { ok: true, backend });
		} catch (error) {
			console.error("[rym-release-scraper] failed to send eBay capture", error);
			sendResponse({ ok: false });
			settleAutomatedVisit(sender.tab?.id, { ok: false });
		}
	})();
	return true;
});

// TCGplayer product page → `{ printing, listings, sales, created, updated }`.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message || message.type !== "YUGIOH_TCGPLAYER_CAPTURE") {
		return;
	}
	void (async function sendTcgplayerCapture() {
		try {
			const backend = await postYugiohCapture(
				"/api/yugioh/tcgplayer-capture",
				{ product: message.product },
				"TCGplayer",
				"tcgplayer",
			);
			sendResponse({ ok: true, backend });
			settleAutomatedVisit(sender.tab?.id, { ok: true, backend });
		} catch (error) {
			console.error(
				"[rym-release-scraper] failed to send TCGplayer capture",
				error,
			);
			sendResponse({ ok: false });
			settleAutomatedVisit(sender.tab?.id, { ok: false });
		}
	})();
	return true;
});

// ---------------------------------------------------------------------------
// Automated browser runs (docs/yugioh/automation.md). Only in a Chrome profile
// where "Run automated captures" is on in the options (chrome.storage.local,
// so it never syncs to my everyday profile). The script on my Mac asks the
// app for a run and opens this profile; a 1-minute alarm (and browser start)
// checks for it here, and `runAutomatedRun` (automation-runner.js) visits
// every page in the plan.

const SETTINGS_AUTOMATION_ENABLED = "yugiohAutomationEnabled";
const AUTOMATION_ALARM = "yugioh-automation-check";
// A TCGplayer page can take ~75 s to load its sales; then it's given up.
const AUTOMATION_VISIT_TIMEOUT_MS = 120_000;
// Extension API calls keep the service worker alive; a quiet pause between
// pages would otherwise let Chrome stop it after 30 s (see
// docs/yugioh/references/automated-browser.md).
const AUTOMATION_KEEPALIVE_MS = 20_000;

/** Tab ID → resolves that tab's visit with its capture outcome. */
const pendingAutomatedVisits = new Map();
let automationActive = false;

function settleAutomatedVisit(tabId, response) {
	const settle = pendingAutomatedVisits.get(tabId);
	if (!settle) return;
	pendingAutomatedVisits.delete(tabId);
	settle(visitOutcome(response));
}

// A page with nothing to send (a Search with no results), or a check page
// (`challenged`), which stops the run.
chrome.runtime.onMessage.addListener((message, sender) => {
	if (!message || message.type !== "YUGIOH_CAPTURE_EMPTY") {
		return;
	}
	settleAutomatedVisit(sender.tab?.id, {
		ok: true,
		empty: true,
		error: message.error,
		challenged: message.challenged === true,
	});
});

// A content script asks whether its tab is on a run's visit, to scroll
// through the page before reading it the way a person would.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message || message.type !== "YUGIOH_AUTOMATED_VISIT") {
		return;
	}
	sendResponse({ automated: pendingAutomatedVisits.has(sender.tab?.id) });
});

async function automationSettings() {
	const cfg = await chrome.storage.sync.get([
		SETTINGS_BACKEND_ORIGIN,
		SETTINGS_BACKEND_SECRET,
	]);
	const originRaw =
		(typeof cfg[SETTINGS_BACKEND_ORIGIN] === "string" &&
			cfg[SETTINGS_BACKEND_ORIGIN].trim()) ||
		"https://www.moooose.dev";
	return {
		origin: originRaw.replace(/\/+$/, ""),
		secret:
			typeof cfg[SETTINGS_BACKEND_SECRET] === "string"
				? cfg[SETTINGS_BACKEND_SECRET].trim()
				: "",
	};
}

/** Posts one run step to the app; throws with the app's reason on failure. */
async function postAutomationStep(body) {
	const { origin, secret } = await automationSettings();
	if (!secret) throw new Error("The ingest secret isn't set");
	const res = await fetch(`${origin}/api/yugioh/automation`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${secret}`,
		},
		body: JSON.stringify(body),
	});
	const text = await res.text();
	if (!res.ok) {
		const failure = describeFailedResponse(origin, res.status, text);
		console.error("[yugioh-automation] step failed", body.op, failure.log);
		throw new Error(failure.message);
	}
	return JSON.parse(text);
}

/** A visit that landed on a check page `checkPageAt` knows by its URL. */
function challengedVisit(marketplace) {
	return {
		listingsCaptured: 0,
		newListings: 0,
		error: `${marketplace} showed a check page instead of results.`,
		challenged: true,
	};
}

/**
 * Opens one page in the run's tab for its marketplace (`openVisit`, from
 * `makeVisitTabs`) and waits for its capture. The tab stays open for the
 * next page; closing the run's window closes it. eBay's check pages live at
 * /splashui/*, where no content script runs: the tab's URL gives them away
 * (the host permission lets us read it), so the visit settles as challenged
 * the moment the tab gets there.
 *
 * A page that sent nothing within 2 minutes has its tab closed, so a late
 * capture from it can't settle the next visit; the next page of that
 * marketplace opens a new tab.
 */
async function visitPageInTab(openVisit, visit) {
	const waitingOn = new Set();
	let tabId = null;
	let timer = null;
	let watchUrl = null;
	try {
		return await new Promise(function waitForCapture(resolve, reject) {
			watchUrl = function onUpdated(updatedTabId, changeInfo) {
				if (!waitingOn.has(updatedTabId)) return;
				const marketplace = checkPageAt(changeInfo.url);
				if (marketplace) resolve(challengedVisit(marketplace));
			};
			chrome.tabs.onUpdated.addListener(watchUrl);
			timer = setTimeout(async function giveUp() {
				const current =
					tabId === null
						? null
						: await chrome.tabs.get(tabId).catch(function gone() {
								return null;
							});
				const marketplace = checkPageAt(current?.url);
				if (marketplace) {
					resolve(challengedVisit(marketplace));
					return;
				}
				if (tabId !== null) {
					await chrome.tabs.remove(tabId).catch(function alreadyClosed() {});
				}
				resolve({
					listingsCaptured: 0,
					newListings: 0,
					error: "The page sent nothing within 2 minutes.",
				});
			}, AUTOMATION_VISIT_TIMEOUT_MS);
			openVisit(visit, function ready(readyTabId) {
				tabId = readyTabId;
				waitingOn.add(readyTabId);
				pendingAutomatedVisits.set(readyTabId, resolve);
			}).catch(reject);
		});
	} finally {
		clearTimeout(timer);
		if (watchUrl) chrome.tabs.onUpdated.removeListener(watchUrl);
		for (const waitedOn of waitingOn) pendingAutomatedVisits.delete(waitedOn);
	}
}

/**
 * The browser side of `makeVisitTabs` for one run's window: new tabs, tab
 * loads, and asking the marketplace page in a tab to open the next page
 * itself (run-navigation.js).
 */
function runTabs(runWindow) {
	return makeVisitTabs({
		async createTab(url) {
			const tab = await chrome.tabs.create({
				windowId: await runWindow(),
				url,
			});
			return tab.id;
		},
		async updateTab(tabId, url) {
			try {
				await chrome.tabs.update(tabId, { url, active: true });
				return true;
			} catch {
				return false;
			}
		},
		async navigateFromPage(tabId, url) {
			try {
				await chrome.tabs.update(tabId, { active: true });
				const reply = await chrome.tabs.sendMessage(tabId, {
					type: "YUGIOH_NAVIGATE",
					url,
				});
				return reply?.ok === true;
			} catch {
				// No content script answered (the tab is gone or on another page).
				return false;
			}
		},
	});
}

async function checkForAutomatedRun() {
	// Taken before any await, so browser start and the alarm can't both run.
	if (automationActive) return;
	automationActive = true;
	const local = await chrome.storage.local.get(SETTINGS_AUTOMATION_ENABLED);
	if (!local[SETTINGS_AUTOMATION_ENABLED]) {
		automationActive = false;
		return;
	}
	const keepAlive = setInterval(function ping() {
		void chrome.runtime.getPlatformInfo();
	}, AUTOMATION_KEEPALIVE_MS);
	let windowId = null;
	const openVisit = runTabs(async function runWindow() {
		// Opened on the first page, and again if it was closed mid-run.
		const open =
			windowId !== null &&
			(await chrome.windows.get(windowId).then(
				function found() {
					return true;
				},
				function gone() {
					return false;
				},
			));
		if (!open) {
			const win = await chrome.windows.create({ focused: false });
			windowId = win.id;
		}
		return windowId;
	});
	try {
		const result = await runAutomatedRun({
			call: postAutomationStep,
			visitPage(visit) {
				return visitPageInTab(openVisit, visit);
			},
			pause: function pause(ms) {
				return new Promise(function wait(resolve) {
					setTimeout(resolve, ms);
				});
			},
			random: Math.random,
		});
		if (result) {
			console.info(
				`[yugioh-automation] run ${result.runId}: ${result.pagesVisited} pages`,
			);
		}
	} catch (error) {
		console.error("[yugioh-automation] run failed", error);
	} finally {
		clearInterval(keepAlive);
		if (windowId !== null) {
			await chrome.windows.remove(windowId).catch(function alreadyClosed() {});
		}
		automationActive = false;
	}
}

async function syncAutomationAlarm() {
	const local = await chrome.storage.local.get(SETTINGS_AUTOMATION_ENABLED);
	if (local[SETTINGS_AUTOMATION_ENABLED]) {
		await chrome.alarms.create(AUTOMATION_ALARM, { periodInMinutes: 1 });
	} else {
		await chrome.alarms.clear(AUTOMATION_ALARM);
	}
}

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === AUTOMATION_ALARM) void checkForAutomatedRun();
});

chrome.runtime.onStartup.addListener(() => {
	void syncAutomationAlarm();
	void checkForAutomatedRun();
});

chrome.runtime.onInstalled.addListener(() => {
	void syncAutomationAlarm();
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "local" && SETTINGS_AUTOMATION_ENABLED in changes) {
		void syncAutomationAlarm();
	}
});
