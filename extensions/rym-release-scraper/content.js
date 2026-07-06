const OBSERVE_MS = 12000;
const TOAST_MS = 3200;

let captureToastDismissTimerId = null;
let captureToastRemoveTimerId = null;

function truncateLabel(text, maxLen) {
	if (text.length <= maxLen) {
		return text;
	}
	return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

function clearCaptureToastTimers() {
	if (captureToastDismissTimerId !== null) {
		window.clearTimeout(captureToastDismissTimerId);
		captureToastDismissTimerId = null;
	}
	if (captureToastRemoveTimerId !== null) {
		window.clearTimeout(captureToastRemoveTimerId);
		captureToastRemoveTimerId = null;
	}
}

function toastThemeForKind(kind) {
	if (kind === "error") {
		return {
			background: "rgba(255, 252, 252, 0.97)",
			color: "#991b1b",
			border: "1px solid rgba(153, 27, 27, 0.12)",
		};
	}
	if (kind === "warn") {
		return {
			background: "rgba(255, 251, 235, 0.97)",
			color: "#92400e",
			border: "1px solid rgba(146, 64, 14, 0.15)",
		};
	}
	if (kind === "pending") {
		return {
			background: "rgba(252, 252, 251, 0.97)",
			color: "#3f3f46",
			border: "1px solid rgba(0, 0, 0, 0.06)",
		};
	}
	return {
		background: "rgba(254, 254, 253, 0.97)",
		color: "#27272a",
		border: "1px solid rgba(0, 0, 0, 0.06)",
	};
}

function setCaptureToast(kind, message) {
	clearCaptureToastTimers();

	let el = document.getElementById("rym-release-scraper-toast");
	const created = !el;

	if (!el) {
		el = document.createElement("div");
		el.id = "rym-release-scraper-toast";
		el.setAttribute("role", "status");
		el.setAttribute("aria-live", "polite");
		Object.assign(el.style, {
			position: "fixed",
			top: "20px",
			left: "50%",
			transform: "translateX(-50%) translateY(-12px)",
			zIndex: "2147483647",
			maxWidth: "min(420px, calc(100vw - 32px))",
			padding: "12px 20px",
			borderRadius: "10px",
			fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
			fontSize: "14px",
			lineHeight: "1.4",
			boxShadow:
				"0 12px 40px rgba(0, 0, 0, 0.14), 0 6px 18px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.06)",
			transition: "opacity 220ms ease, transform 220ms ease",
			opacity: "0",
			pointerEvents: "none",
		});
		document.body.appendChild(el);
	}

	el.textContent = message;
	const theme = toastThemeForKind(kind);
	el.style.background = theme.background;
	el.style.color = theme.color;
	el.style.border = theme.border;
	el.setAttribute("aria-busy", kind === "pending" ? "true" : "false");

	if (created) {
		window.requestAnimationFrame(function revealToast() {
			el.style.opacity = "1";
			el.style.transform = "translateX(-50%) translateY(0)";
		});
	} else {
		el.style.opacity = "1";
		el.style.transform = "translateX(-50%) translateY(0)";
	}

	if (kind === "pending") {
		return;
	}

	captureToastDismissTimerId = window.setTimeout(function dismissToast() {
		el.style.opacity = "0";
		el.style.transform = "translateX(-50%) translateY(-12px)";
		captureToastRemoveTimerId = window.setTimeout(function removeToast() {
			el.remove();
			captureToastRemoveTimerId = null;
		}, 240);
		captureToastDismissTimerId = null;
	}, TOAST_MS);
}

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
	const label = truncateLabel(payload.albumTitle || "Release", 56);

	chrome.runtime.sendMessage(
		{ type: "RYM_RELEASE_CAPTURE", payload },
		function handleResponse(response) {
			if (chrome.runtime.lastError) {
				console.error(
					"[rym-release-scraper]",
					chrome.runtime.lastError.message,
				);
				setCaptureToast(
					"error",
					"RYM capture failed — extension worker unreachable.",
				);
				return;
			}
			if (!response || !response.ok) {
				console.warn("[rym-release-scraper] capture was not persisted");
				setCaptureToast(
					"error",
					"RYM capture was not saved to local extension storage.",
				);
				return;
			}
			const backend = response.backend;
			if (backend?.synced) {
				setCaptureToast("ok", `Saved locally & synced: ${label}`);
				return;
			}
			if (backend?.skipped) {
				setCaptureToast("ok", `Saved locally: ${label}`);
				return;
			}
			const detail =
				typeof backend?.error === "string" && backend.error.trim()
					? backend.error.trim()
					: typeof backend?.status === "number"
						? `HTTP ${backend.status}`
						: "network or permission error";
			setCaptureToast(
				"warn",
				`Saved locally — backend sync failed (${detail}). Open extension options.`,
			);
		},
	);
}

void (async function main() {
	setCaptureToast("pending", "RYM capture: reading release page…");

	const section = await waitForMainSection(OBSERVE_MS);
	if (!section) {
		console.warn("[rym-release-scraper] main section not found");
		setCaptureToast(
			"error",
			"RYM capture failed — release section not found on this page.",
		);
		return;
	}

	setCaptureToast("pending", "RYM capture: saving locally…");
	sendCapture(buildPayload(section));
})();
