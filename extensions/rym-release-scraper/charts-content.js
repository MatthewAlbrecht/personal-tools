const OBSERVE_MS = 12000;

function collapseText(value) {
	return value.replace(/\s+/g, " ").trim();
}

function waitForChartItems(timeoutMs) {
	return new Promise(function resolveItems(resolve) {
		const selector = ".page_charts_section_charts_item";
		const existing = document.querySelectorAll(selector);
		if (existing.length > 0) {
			resolve(existing);
			return;
		}

		const deadline = Date.now() + timeoutMs;
		const observer = new MutationObserver(function check() {
			const els = document.querySelectorAll(selector);
			if (els.length > 0) {
				observer.disconnect();
				resolve(els);
			}
		});

		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});

		window.setTimeout(function onTimeout() {
			observer.disconnect();
			resolve(document.querySelectorAll(selector));
		}, Math.max(0, deadline - Date.now()));
	});
}

function localeName(root) {
	if (!root) {
		return "";
	}
	const original = root.querySelector(".ui_name_locale_original");
	if (original) {
		return collapseText(original.textContent);
	}
	return collapseText(root.textContent);
}

function getGenreLinks(container) {
	if (!container) {
		return [];
	}
	return Array.from(container.querySelectorAll("a.genre")).map(
		function mapGenre(a) {
			return {
				name: collapseText(a.textContent),
				href: a.getAttribute("href"),
			};
		},
	);
}

function getDescriptors(row) {
	const el = row.querySelector(
		".page_charts_section_charts_item_genre_descriptors",
	);
	if (!el) {
		return [];
	}
	return Array.from(el.querySelectorAll("span"))
		.map(function mapSpan(span) {
			return collapseText(span.textContent);
		})
		.filter(Boolean);
}

function getArtists(row) {
	const linked = Array.from(
		row.querySelectorAll(
			".page_charts_section_charts_item_credited_text a.artist",
		),
	)
		.map(function mapArtist(a) {
			return {
				name: localeName(a),
				href: a.getAttribute("href"),
			};
		})
		.filter(function hasName(entry) {
			return entry.name.length > 0;
		});
	if (linked.length > 0) {
		return linked;
	}
	const textEl = row.querySelector(
		".page_charts_section_charts_item_credited_text",
	);
	const text = textEl ? collapseText(textEl.textContent) : "";
	if (!text) {
		return [];
	}
	return [{ name: text, href: undefined }];
}

function getDefaultSpotifyAlbumId(row) {
	const el = row.querySelector("[data-links]");
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

function parseAbbrevCount(text) {
	const t = collapseText(text).replace(/,/g, "").toLowerCase();
	if (!t) {
		return undefined;
	}
	const m = t.match(/^([\d.]+)\s*([kmb])?$/);
	if (!m) {
		return undefined;
	}
	const n = Number.parseFloat(m[1]);
	if (!Number.isFinite(n)) {
		return undefined;
	}
	const suffix = m[2];
	const mult = suffix === "k" ? 1000 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
	return Math.round(n * mult);
}

function absoluteUrl(href) {
	if (!href) {
		return "";
	}
	try {
		return new URL(href, window.location.origin).toString();
	} catch {
		return href;
	}
}

function getCoverImageEl(row) {
	return row.querySelector(
		".page_charts_section_charts_item_image img.ui_image_img",
	);
}

function waitForLoadedImg(img) {
	if (img.complete && img.naturalWidth > 0) {
		return Promise.resolve(true);
	}
	return new Promise(function onImg(resolve) {
		function done(ok) {
			img.removeEventListener("load", onLoad);
			img.removeEventListener("error", onError);
			resolve(ok);
		}
		function onLoad() {
			done(img.naturalWidth > 0);
		}
		function onError() {
			done(false);
		}
		img.addEventListener("load", onLoad);
		img.addEventListener("error", onError);
	});
}

function jpegBase64FromLoadedImg(img) {
	if (!img.naturalWidth) {
		return Promise.resolve("");
	}
	const canvas = document.createElement("canvas");
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return Promise.resolve("");
	}
	try {
		ctx.drawImage(img, 0, 0);
	} catch {
		return Promise.resolve("");
	}
	return new Promise(function toJpeg(resolve) {
		try {
			canvas.toBlob(
				function onBlob(blob) {
					if (!blob) {
						resolve("");
						return;
					}
					const reader = new FileReader();
					reader.onloadend = function onRead() {
						const result = reader.result;
						if (typeof result !== "string") {
							resolve("");
							return;
						}
						const comma = result.indexOf(",");
						resolve(comma >= 0 ? result.slice(comma + 1) : result);
					};
					reader.onerror = function onReadError() {
						resolve("");
					};
					reader.readAsDataURL(blob);
				},
				"image/jpeg",
				0.84,
			);
		} catch {
			resolve("");
		}
	});
}

function getReleaseDateLabel(row) {
	const dateEl = row.querySelector(".page_charts_section_charts_item_date");
	if (!dateEl) {
		return "";
	}
	const spans = Array.from(dateEl.querySelectorAll("span")).filter(
		function notType(span) {
			return !span.classList.contains(
				"page_charts_section_charts_item_release_type",
			);
		},
	);
	const first = spans[0];
	return first ? collapseText(first.textContent) : "";
}

function getReleaseType(row) {
	const el = row.querySelector(".page_charts_section_charts_item_release_type");
	return el ? collapseText(el.textContent) : "";
}

function getAverageRating(row) {
	const el = row.querySelector(
		".page_charts_section_charts_item_details_average_num",
	);
	if (!el) {
		return undefined;
	}
	const n = Number.parseFloat(collapseText(el.textContent));
	return Number.isFinite(n) ? n : undefined;
}

function getRatingsCount(row) {
	const el = row.querySelector(
		".page_charts_section_charts_item_details_ratings .abbr",
	);
	return el ? parseAbbrevCount(el.textContent) : undefined;
}

function getReviewsCount(row) {
	const el = row.querySelector(
		".page_charts_section_charts_item_details_reviews .abbr",
	);
	return el ? parseAbbrevCount(el.textContent) : undefined;
}

function payloadFromChartRow(row, capturedAt) {
	const link =
		row.querySelector("a.page_charts_section_charts_item_link.release") ||
		row.querySelector("a.page_charts_section_charts_item_image_link");
	const href = link?.getAttribute("href") || "";
	const rymUrl = absoluteUrl(href);
	if (!rymUrl) {
		return null;
	}

	let canonicalPath = href;
	try {
		const u = new URL(rymUrl);
		canonicalPath = u.pathname.replace(/\/+$/, "") || "/";
	} catch {
		canonicalPath = href.replace(/\/+$/, "") || href;
	}

	const titleEl = row.querySelector(".page_charts_section_charts_item_title");
	const albumTitle = localeName(titleEl);
	if (!albumTitle) {
		return null;
	}

	const spotifyAlbumId = getDefaultSpotifyAlbumId(row);
	const averageRating = getAverageRating(row);
	const ratingsCount = getRatingsCount(row);
	const reviewsCount = getReviewsCount(row);
	const releaseDateLabel = getReleaseDateLabel(row);

	return {
		source: "rateyourmusic.com/charts",
		capturedAt,
		rymUrl,
		url: rymUrl,
		canonicalPath,
		releaseType: getReleaseType(row),
		albumTitle,
		artists: getArtists(row),
		primaryGenres: getGenreLinks(
			row.querySelector(".page_charts_section_charts_item_genres_primary"),
		),
		secondaryGenres: getGenreLinks(
			row.querySelector(".page_charts_section_charts_item_genres_secondary"),
		),
		descriptors: getDescriptors(row),
		spotifyAlbumId,
		spotifyAlbumUrl: spotifyAlbumId
			? `https://open.spotify.com/album/${spotifyAlbumId}`
			: null,
		...(averageRating !== undefined ? { averageRating } : {}),
		...(ratingsCount !== undefined ? { ratingsCount } : {}),
		...(reviewsCount !== undefined ? { reviewsCount } : {}),
		...(releaseDateLabel ? { releaseDateLabel } : {}),
	};
}

function finishChartBackend(response, payloads) {
	if (chrome.runtime.lastError) {
		console.error("[rym-release-scraper]", chrome.runtime.lastError.message);
		applyDockUpdate({
			status: "error",
			headline: "Didn't reach the extension worker",
			detail: "Reload the extension and run again.",
			current: 0,
			total: payloads.length,
		});
		return;
	}
	if (!response || !response.ok) {
		applyDockUpdate({
			status: "error",
			headline: "Didn't save locally",
			detail: "Chrome storage rejected the capture.",
			total: payloads.length,
		});
		return;
	}
	const backend = response.backend;
	const upserted =
		typeof backend?.upserted === "number" ? backend.upserted : 0;
	const failed = typeof backend?.failed === "number" ? backend.failed : 0;
	const coversUploaded =
		typeof backend?.coversUploaded === "number" ? backend.coversUploaded : 0;
	const coversFailed =
		typeof backend?.coversFailed === "number" ? backend.coversFailed : 0;

	if (backend?.synced) {
		applyDockUpdate({
			status: failed > 0 || coversFailed > 0 ? "warn" : "ok",
			headline: failed > 0 ? "Most of the page is in" : "This page is in",
			detail: `${upserted} saved · ${failed} missed · ${coversUploaded} covers${
				coversFailed ? ` · ${coversFailed} covers skipped` : ""
			}.`,
			current: upserted,
			total: payloads.length,
		});
		return;
	}
	if (backend?.skipped) {
		applyDockUpdate({
			status: "ok",
			headline: "Saved on this machine",
			detail: "Set the ingest secret in extension options to write the library.",
			current: payloads.length,
			total: payloads.length,
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
		current: payloads.length,
		total: payloads.length,
	});
}

function sendCaptures(payloads) {
	applyDockUpdate({
		status: "running",
		headline: "Writing to the library",
		detail: `Sending ${payloads.length} rows, then filing covers.`,
		current: 0,
		total: payloads.length,
		phase: "save",
	});
	chrome.runtime.sendMessage(
		{ type: "RYM_CHARTS_CAPTURE", payloads },
		function handleResponse(response) {
			finishChartBackend(response, payloads);
		},
	);
}

async function runChartCapture() {
	applyDockUpdate({
		status: "running",
		headline: "Finding rows",
		detail: "Waiting for the chart list.",
		current: 0,
		total: 0,
		phase: "read",
	});

	const nodes = await waitForChartItems(OBSERVE_MS);
	const capturedAt = Date.now();
	const payloads = [];
	const seen = new Set();
	const totalGuess = nodes.length;

	let index = 0;
	for (const row of nodes) {
		index += 1;
		applyDockUpdate({
			status: "running",
			headline: "Reading the list",
			detail: `Row ${index} of ${totalGuess}. Covers come from what's already on screen.`,
			current: index,
			total: totalGuess,
			phase: "read",
		});

		const payload = payloadFromChartRow(row, capturedAt);
		if (!payload) {
			continue;
		}
		if (seen.has(payload.canonicalPath)) {
			continue;
		}
		seen.add(payload.canonicalPath);

		const img = getCoverImageEl(row);
		if (img) {
			const loaded = await waitForLoadedImg(img);
			if (loaded) {
				const jpegBase64 = await jpegBase64FromLoadedImg(img);
				if (jpegBase64) {
					payload.coverJpegBase64 = jpegBase64;
				}
			}
		}

		payloads.push(payload);
	}

	if (payloads.length === 0) {
		console.warn("[rym-release-scraper] no chart rows found");
		applyDockUpdate({
			status: "error",
			headline: "No rows on this chart",
			detail: "Wait for the list to finish loading, then run again.",
		});
		return;
	}

	sendCaptures(payloads);
}

mountScrapeDock({
	pageKind: "charts",
	onRescrape: function onRescrape() {
		void runChartCapture();
	},
});

void runChartCapture();
