const OBSERVE_MS = 12000;

function canonicalPathFromLocation() {
	try {
		const u = new URL(window.location.href);
		let p = u.pathname.replace(/\/+$/, "");
		if (!p) {
			p = "/";
		}
		return p;
	} catch {
		return window.location.pathname.replace(/\/+$/, "") || "/";
	}
}

function waitForMainSection(timeoutMs) {
	return new Promise(function resolveSection(resolve) {
		const selector = ".section_main_info.section_outer";
		const existing = document.querySelector(selector);
		if (existing) {
			resolve(existing);
			return;
		}

		const deadline = Date.now() + timeoutMs;
		const observer = new MutationObserver(function check() {
			const el = document.querySelector(selector);
			if (el) {
				observer.disconnect();
				resolve(el);
				return;
			}
			if (Date.now() > deadline) {
				observer.disconnect();
				resolve(document.querySelector(selector));
			}
		});

		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});

		window.setTimeout(function onTimeout() {
			observer.disconnect();
			resolve(document.querySelector(selector));
		}, timeoutMs);
	});
}

function textFromAlbumTitle(albumTitleEl) {
	if (!albumTitleEl) {
		return "";
	}
	const chunks = [];
	for (const node of albumTitleEl.childNodes) {
		if (node.nodeType === Node.TEXT_NODE) {
			const t = node.textContent.replace(/\s+/g, " ").trim();
			if (t) {
				chunks.push(t);
			}
		}
	}
	return chunks.join(" ").trim();
}

function findAlbumInfoRow(section, headerLabel) {
	const rows = section.querySelectorAll("table.album_info tr");
	for (const tr of rows) {
		const th = tr.querySelector("th.info_hdr");
		if (!th) {
			continue;
		}
		if (th.textContent.trim() === headerLabel) {
			return tr;
		}
	}
	return null;
}

function getArtists(section) {
	const row = findAlbumInfoRow(section, "Artist");
	if (!row) {
		return [];
	}
	const linked = Array.from(row.querySelectorAll("a.artist"))
		.map(function mapArtist(a) {
			return {
				name: a.textContent.replace(/\s+/g, " ").trim(),
				href: a.getAttribute("href"),
			};
		})
		.filter(function hasName(entry) {
			return entry.name.length > 0;
		});
	if (linked.length > 0) {
		return linked;
	}
	const td = row.querySelector("td");
	const text = td ? td.textContent.replace(/\s+/g, " ").trim() : "";
	if (!text) {
		return [];
	}
	return [{ name: text, href: undefined }];
}

function getReleaseType(section) {
	const row = findAlbumInfoRow(section, "Type");
	if (!row) {
		return "";
	}
	const td = row.querySelector("td");
	return td ? td.textContent.replace(/\s+/g, " ").trim() : "";
}

function getGenreLinks(container) {
	if (!container) {
		return [];
	}
	return Array.from(container.querySelectorAll("a.genre")).map(
		function mapGenre(a) {
			return {
				name: a.textContent.replace(/\s+/g, " ").trim(),
				href: a.getAttribute("href"),
			};
		},
	);
}

function getDescriptors(section) {
	const el = section.querySelector(".release_pri_descriptors");
	if (!el) {
		return [];
	}
	return el.textContent
		.split(",")
		.map(function trimDescriptor(s) {
			return s.replace(/\s+/g, " ").trim();
		})
		.filter(Boolean);
}

function getDefaultSpotifyAlbumId(section) {
	const el = section.querySelector("[data-links]");
	if (!el) {
		return null;
	}
	const raw = el.getAttribute("data-links");
	if (!raw) {
		return null;
	}
	let data;
	try {
		data = JSON.parse(raw);
	} catch {
		return null;
	}
	const spotify = data?.spotify;
	if (!spotify || typeof spotify !== "object") {
		return null;
	}

	let fallbackId = null;
	for (const [id, meta] of Object.entries(spotify)) {
		if (!meta || typeof meta !== "object") {
			continue;
		}
		if (meta.default === true && meta.type === "album") {
			return id;
		}
		if (!fallbackId) {
			fallbackId = id;
		}
	}
	return fallbackId;
}

/**
 * "Total length: 38:00" (MM:SS) or "1:05:30" (H:MM:SS) from track listing footer.
 * Fallback: sum `.tracklist_duration[data-inseconds]` in the same section.
 */
function getTracklistingTotalSeconds() {
	const totalEl = document.querySelector(
		".section_tracklisting span.tracklist_total",
	);
	if (totalEl) {
		const text = totalEl.textContent.replace(/\s+/g, " ").trim();
		const m = text.match(/total\s+length:\s*(\d{1,3}:\d{2}(?::\d{2})?)/i);
		if (m) {
			const parts = m[1].split(":").map(function parsePart(p) {
				return Number.parseInt(p, 10);
			});
			if (
				parts.length === 2 &&
				parts.every(function ok(n) {
					return !Number.isNaN(n);
				})
			) {
				return parts[0] * 60 + parts[1];
			}
			if (
				parts.length === 3 &&
				parts.every(function ok2(n) {
					return !Number.isNaN(n);
				})
			) {
				return parts[0] * 3600 + parts[1] * 60 + parts[2];
			}
		}
	}

	let sum = 0;
	const durationEls = document.querySelectorAll(
		".section_tracklisting ul.tracks .tracklist_duration[data-inseconds]",
	);
	for (const el of durationEls) {
		const sec = Number.parseInt(el.getAttribute("data-inseconds"), 10);
		if (!Number.isNaN(sec)) {
			sum += sec;
		}
	}
	return sum > 0 ? sum : undefined;
}

function buildPayload(section) {
	const canonicalPath = canonicalPathFromLocation();
	const albumTitle = textFromAlbumTitle(section.querySelector(".album_title"));
	const primaryGenres = getGenreLinks(
		section.querySelector(".release_pri_genres"),
	);
	const secondaryGenres = getGenreLinks(
		section.querySelector(".release_sec_genres"),
	);
	const descriptors = getDescriptors(section);
	const artists = getArtists(section);
	const releaseType = getReleaseType(section);
	const spotifyAlbumId = getDefaultSpotifyAlbumId(section);
	const tracklistingTotalSeconds = getTracklistingTotalSeconds();

	return {
		source: "rateyourmusic.com",
		capturedAt: Date.now(),
		/** Full release URL (Convex field `rymUrl`) */
		rymUrl: window.location.href,
		url: window.location.href,
		canonicalPath,
		releaseType,
		albumTitle,
		artists,
		primaryGenres,
		secondaryGenres,
		descriptors,
		spotifyAlbumId,
		spotifyAlbumUrl: spotifyAlbumId
			? `https://open.spotify.com/album/${spotifyAlbumId}`
			: null,
		...(typeof tracklistingTotalSeconds === "number"
			? { tracklistingTotalSeconds }
			: {}),
	};
}

function sendCapture(payload) {
	const title = payload.albumTitle || "This release";
	applyDockUpdate({
		status: "running",
		headline: "Writing to the library",
		detail: title,
		current: 0,
		total: 1,
	});

	chrome.runtime.sendMessage(
		{ type: "RYM_RELEASE_CAPTURE", payload },
		function handleResponse(response) {
			if (chrome.runtime.lastError) {
				console.error(
					"[rym-release-scraper]",
					chrome.runtime.lastError.message,
				);
				applyDockUpdate({
					status: "error",
					headline: "Didn't reach the extension worker",
					detail: "Reload the extension and run again.",
					total: 1,
				});
				return;
			}
			if (!response || !response.ok) {
				applyDockUpdate({
					status: "error",
					headline: "Didn't save locally",
					detail: title,
					total: 1,
				});
				return;
			}
			const backend = response.backend;
			if (backend?.synced) {
				applyDockUpdate({
					status: "ok",
					headline: "This page is in",
					detail: title,
					current: 1,
					total: 1,
				});
				return;
			}
			if (backend?.skipped) {
				applyDockUpdate({
					status: "ok",
					headline: "Saved on this machine",
					detail: "Set the ingest secret in extension options to write the library.",
					current: 1,
					total: 1,
				});
				return;
			}
			const detail =
				typeof backend?.error === "string" && backend.error.trim()
					? backend.error.trim()
					: typeof backend?.status === "number"
						? `HTTP ${backend.status}`
						: "Network or permission error";
			applyDockUpdate({
				status: "warn",
				headline: "Saved here, not the library",
				detail: `${detail}. Open extension options.`,
				current: 1,
				total: 1,
			});
		},
	);
}

async function runReleaseCapture() {
	applyDockUpdate({
		status: "running",
		headline: "Reading the release",
		detail: "Waiting for the main info block.",
		current: 0,
		total: 1,
	});

	const section = await waitForMainSection(OBSERVE_MS);
	if (!section) {
		console.warn("[rym-release-scraper] main section not found");
		applyDockUpdate({
			status: "error",
			headline: "No release block on this page",
			detail: "Wait for the page to finish, then run again.",
		});
		return;
	}

	sendCapture(buildPayload(section));
}

mountScrapeDock({
	pageKind: "release",
	onRescrape: function onRescrape() {
		void runReleaseCapture();
	},
});

void runReleaseCapture();
