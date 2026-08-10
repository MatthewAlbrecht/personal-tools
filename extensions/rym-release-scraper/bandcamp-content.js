const TOAST_MS = 3200;
const SUCCESS_FLASH_MS = 1600;

const PANEL_BG = "#141414";
const AMBER = "#e8a317";
const AMBER_HOVER = "#ffbe3d";
const ERROR_RED = "#f87171";

let captureToastDismissTimerId = null;
let captureToastRemoveTimerId = null;
let successFlashTimerId = null;

/**
 * Keep in sync with `convex/_utils/bandcampReleaseDate.ts` — small inline
 * copy so the content script has no build step / imports.
 */
const MONTH_NAMES = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

function padTwo(value) {
	return value.toString().padStart(2, "0");
}

function parseMonthDayYear(text) {
	const match = text.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/);
	if (!match) {
		return undefined;
	}
	const month = MONTH_NAMES[match[1].toLowerCase()];
	if (!month) {
		return undefined;
	}
	const day = Number.parseInt(match[2], 10);
	const year = Number.parseInt(match[3], 10);
	if (Number.isNaN(day) || Number.isNaN(year)) {
		return undefined;
	}
	return `${year}-${padTwo(month)}-${padTwo(day)}`;
}

function parseYearOnly(text) {
	const match = text.match(/^(19|20)\d{2}$/);
	return match?.[0];
}

function parseYear(text) {
	const match = text.match(/\b(19|20)\d{2}\b/);
	return match?.[0];
}

function parseBandcampReleaseDate(raw) {
	const text = raw.replace(/^released\s+/i, "").trim();
	if (!text) {
		return undefined;
	}
	const monthDayYear = parseMonthDayYear(text);
	if (monthDayYear) {
		return monthDayYear;
	}
	const yearOnly = parseYearOnly(text);
	if (yearOnly) {
		return yearOnly;
	}
	const parsed = Date.parse(text);
	if (!Number.isNaN(parsed)) {
		const date = new Date(parsed);
		return `${date.getUTCFullYear()}-${padTwo(date.getUTCMonth() + 1)}-${padTwo(date.getUTCDate())}`;
	}
	return parseYear(text);
}

function collapseWhitespace(text) {
	return (text || "").replace(/\s+/g, " ").trim();
}

/** Extracts the "released ..." line from the `.tralbum-credits` block. */
function extractReleasedText(creditsEl) {
	if (!creditsEl) {
		return "";
	}
	const text = creditsEl.textContent || "";
	const match = text.match(/released\s+[^\n\r]+/i);
	return match ? match[0].trim() : "";
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

	let el = document.getElementById("bandcamp-capture-toast");
	const created = !el;

	if (!el) {
		el = document.createElement("div");
		el.id = "bandcamp-capture-toast";
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

function buildBandcampPayload() {
	const nameSection = document.querySelector("#name-section");
	const titleEl = nameSection?.querySelector("h2.trackTitle");
	const artistEl = nameSection?.querySelector("h3 a");
	const artEl = document.querySelector("#tralbumArt a.popupImage");
	const creditsEl = document.querySelector(".tralbum-credits");

	const name = collapseWhitespace(titleEl?.textContent);
	const artistName = collapseWhitespace(artistEl?.textContent);
	const imageUrl = artEl?.getAttribute("href") || undefined;
	const releasedRaw = extractReleasedText(creditsEl);
	const releaseDate = releasedRaw
		? parseBandcampReleaseDate(releasedRaw)
		: undefined;

	return {
		source: "bandcamp.com",
		bandcampUrl: window.location.href,
		name,
		artistName,
		imageUrl,
		releaseDate,
		capturedAt: Date.now(),
	};
}

function injectWidgetStyles() {
	if (document.getElementById("bandcamp-capture-styles")) {
		return;
	}
	const style = document.createElement("style");
	style.id = "bandcamp-capture-styles";
	style.textContent = `
		#bandcamp-capture-button:hover:not(:disabled) {
			transform: translateY(-2px);
			border-color: ${AMBER_HOVER};
			box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.3);
		}
		#bandcamp-capture-button:disabled {
			cursor: not-allowed;
			opacity: 0.75;
		}
	`;
	document.head.appendChild(style);
}

function buildWidget() {
	injectWidgetStyles();

	const container = document.createElement("div");
	container.id = "bandcamp-capture-widget";
	Object.assign(container.style, {
		position: "fixed",
		right: "20px",
		bottom: "20px",
		zIndex: "2147483647",
		display: "flex",
		flexDirection: "column",
		alignItems: "flex-end",
		gap: "8px",
		fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
	});

	const errorEl = document.createElement("div");
	errorEl.id = "bandcamp-capture-error";
	Object.assign(errorEl.style, {
		display: "none",
		maxWidth: "260px",
		padding: "8px 12px",
		borderRadius: "8px",
		background: "rgba(20, 20, 20, 0.95)",
		border: `1px solid ${ERROR_RED}`,
		color: "#fecaca",
		fontSize: "12px",
		lineHeight: "1.4",
		boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
	});

	const button = document.createElement("button");
	button.type = "button";
	button.id = "bandcamp-capture-button";
	Object.assign(button.style, {
		display: "flex",
		alignItems: "center",
		gap: "8px",
		minHeight: "48px",
		padding: "12px 20px",
		borderRadius: "10px",
		border: `2px solid ${AMBER}`,
		background: PANEL_BG,
		color: "#ffffff",
		fontSize: "14px",
		fontWeight: "600",
		letterSpacing: "0.01em",
		cursor: "pointer",
		boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.25)",
		transition:
			"transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
	});
	button.textContent = "Add to library";

	container.appendChild(errorEl);
	container.appendChild(button);
	document.body.appendChild(container);

	return { container, button, errorEl };
}

function renderPending(button, errorEl) {
	if (successFlashTimerId !== null) {
		window.clearTimeout(successFlashTimerId);
		successFlashTimerId = null;
	}
	button.disabled = true;
	button.style.borderColor = AMBER;
	button.textContent = "Saving…";
	errorEl.style.display = "none";
}

function renderSuccess(button, errorEl, hasSavedOnce) {
	button.disabled = false;
	button.style.borderColor = AMBER;
	button.textContent = "Saved";
	errorEl.style.display = "none";

	successFlashTimerId = window.setTimeout(function flipLabel() {
		button.textContent = hasSavedOnce ? "Update in library" : "Add to library";
		successFlashTimerId = null;
	}, SUCCESS_FLASH_MS);
}

function renderError(button, errorEl, idleLabel, message) {
	button.disabled = false;
	button.style.borderColor = ERROR_RED;
	button.textContent = idleLabel;
	errorEl.textContent = message;
	errorEl.style.display = "block";
}

function sendCapture(payload, button, errorEl, state) {
	chrome.runtime.sendMessage(
		{ type: "BANDCAMP_ALBUM_CAPTURE", payload },
		function handleResponse(response) {
			if (chrome.runtime.lastError) {
				console.error(
					"[rym-release-scraper]",
					chrome.runtime.lastError.message,
				);
				renderError(
					button,
					errorEl,
					state.idleLabel,
					"Extension worker unreachable.",
				);
				setCaptureToast(
					"error",
					"Bandcamp capture failed — extension worker unreachable.",
				);
				return;
			}
			if (!response || !response.ok) {
				renderError(
					button,
					errorEl,
					state.idleLabel,
					"Could not save capture locally.",
				);
				setCaptureToast(
					"error",
					"Bandcamp capture was not saved to local extension storage.",
				);
				return;
			}

			const backend = response.backend;
			if (backend?.synced) {
				state.hasSavedOnce = true;
				state.idleLabel = "Update in library";
				renderSuccess(button, errorEl, true);
				setCaptureToast("ok", `Saved to library: ${payload.name}`);
				return;
			}

			const detail =
				typeof backend?.error === "string" && backend.error.trim()
					? backend.error.trim()
					: backend?.skipped
						? "Set the ingest secret in extension options."
						: typeof backend?.status === "number"
							? `HTTP ${backend.status}`
							: "network or permission error";
			renderError(button, errorEl, state.idleLabel, detail);
			setCaptureToast("warn", `Bandcamp sync failed — ${detail}`);
		},
	);
}

void (function main() {
	const nameSection = document.querySelector("#name-section");
	if (!nameSection) {
		console.warn("[rym-release-scraper] bandcamp name section not found");
		return;
	}

	const { button, errorEl } = buildWidget();
	const state = { hasSavedOnce: false, idleLabel: "Add to library" };

	button.addEventListener("click", function onClick() {
		const payload = buildBandcampPayload();
		if (!payload.name || !payload.artistName) {
			renderError(
				button,
				errorEl,
				state.idleLabel,
				"Could not read album title/artist on this page.",
			);
			return;
		}

		renderPending(button, errorEl);
		sendCapture(payload, button, errorEl, state);
	});
})();
