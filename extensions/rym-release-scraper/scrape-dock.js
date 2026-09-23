const SCRAPE_DOCK_MINIMIZE_KEY = "scrapeDockMinimized";

const scrapeDockState = {
	root: null,
	minimized: false,
	status: "idle",
	headline: "",
	detail: "",
	current: 0,
	total: 0,
	phase: "",
	elapsedMs: 0,
	timerId: null,
	startedAt: 0,
	onRescrape: null,
	pageKind: "release",
	running: false,
};

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function formatElapsed(ms) {
	const totalSec = Math.max(0, Math.floor(ms / 1000));
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

function statusWord(status) {
	if (status === "running") {
		return "Working";
	}
	if (status === "ok") {
		return "In";
	}
	if (status === "warn") {
		return "Partial";
	}
	if (status === "error") {
		return "Stuck";
	}
	return "Ready";
}

function stopDockTimer() {
	if (scrapeDockState.timerId !== null) {
		window.clearInterval(scrapeDockState.timerId);
		scrapeDockState.timerId = null;
	}
}

function startDockTimer() {
	stopDockTimer();
	scrapeDockState.startedAt = Date.now();
	scrapeDockState.elapsedMs = 0;
	scrapeDockState.timerId = window.setInterval(function tick() {
		scrapeDockState.elapsedMs = Date.now() - scrapeDockState.startedAt;
		renderScrapeDock();
	}, 250);
}

function persistMinimized(minimized) {
	try {
		chrome.storage.local.set({ [SCRAPE_DOCK_MINIMIZE_KEY]: minimized });
	} catch {
		// ignore
	}
}

function applyDockUpdate(patch) {
	if (patch.status) {
		scrapeDockState.status = patch.status;
	}
	if (patch.headline !== undefined) {
		scrapeDockState.headline = patch.headline;
	}
	if (patch.detail !== undefined) {
		scrapeDockState.detail = patch.detail;
	}
	if (typeof patch.current === "number") {
		scrapeDockState.current = patch.current;
	}
	if (typeof patch.total === "number") {
		scrapeDockState.total = patch.total;
	}
	if (patch.phase !== undefined) {
		scrapeDockState.phase = patch.phase;
	}
	if (patch.status === "running" && !scrapeDockState.timerId) {
		scrapeDockState.running = true;
		startDockTimer();
	}
	if (patch.status && patch.status !== "running") {
		scrapeDockState.running = false;
		stopDockTimer();
		if (scrapeDockState.startedAt) {
			scrapeDockState.elapsedMs = Date.now() - scrapeDockState.startedAt;
		}
	}
	renderScrapeDock();
}

function dockStyles() {
	return `
		:host {
			all: initial;
		}
		.wrap {
			position: fixed;
			bottom: 18px;
			left: 50%;
			transform: translateX(-50%);
			z-index: 2147483646;
			font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif;
			color: #f3ead8;
			pointer-events: auto;
		}
		.card {
			width: min(420px, calc(100vw - 28px));
			background:
				radial-gradient(120% 80% at 0% 0%, rgba(232, 176, 74, 0.12), transparent 55%),
				linear-gradient(180deg, #2a221b 0%, #1b1612 100%);
			border: 1px solid rgba(243, 234, 216, 0.16);
			box-shadow:
				0 18px 50px rgba(0, 0, 0, 0.38),
				0 0 0 1px rgba(0, 0, 0, 0.4) inset;
			padding: 12px 14px 13px;
		}
		.card.minimized {
			width: auto;
			padding: 7px 10px;
		}
		.top {
			display: flex;
			align-items: baseline;
			gap: 10px;
			margin-bottom: 8px;
		}
		.kicker {
			font-family: ui-monospace, "SF Mono", Menlo, monospace;
			font-size: 10px;
			letter-spacing: 0.16em;
			text-transform: uppercase;
			color: #e8b04a;
		}
		.title {
			flex: 1;
			font-size: 16px;
			line-height: 1.2;
			letter-spacing: -0.02em;
		}
		.clock {
			font-family: ui-monospace, "SF Mono", Menlo, monospace;
			font-size: 11px;
			color: #c9b89a;
		}
		.detail {
			font-size: 13px;
			line-height: 1.35;
			color: #d7cbb4;
			margin: 0 0 10px;
		}
		.track {
			height: 3px;
			background: rgba(243, 234, 216, 0.1);
			margin: 0 0 11px;
			overflow: hidden;
		}
		.fill {
			height: 100%;
			background: #e8b04a;
			width: 0%;
			transition: width 160ms ease;
		}
		.fill.pulse {
			width: 36%;
			animation: pulse 1.1s ease-in-out infinite;
		}
		@keyframes pulse {
			0%, 100% { transform: translateX(-40%); opacity: 0.55; }
			50% { transform: translateX(120%); opacity: 1; }
		}
		.row {
			display: flex;
			align-items: center;
			gap: 8px;
		}
		button {
			appearance: none;
			border: 1px solid rgba(243, 234, 216, 0.22);
			background: transparent;
			color: #f3ead8;
			font: inherit;
			font-size: 12px;
			padding: 5px 9px;
			cursor: pointer;
		}
		button.primary {
			background: #e8b04a;
			color: #1b1612;
			border-color: #e8b04a;
			font-weight: 600;
		}
		button:disabled {
			opacity: 0.45;
			cursor: default;
		}
		button:focus-visible {
			outline: 2px solid #e8b04a;
			outline-offset: 2px;
		}
		.ghost {
			margin-left: auto;
			letter-spacing: 0.04em;
		}
		.pill {
			display: flex;
			align-items: center;
			gap: 8px;
			cursor: pointer;
			background: none;
			border: 0;
			color: inherit;
			padding: 0;
			font: inherit;
		}
		.dot {
			width: 7px;
			height: 7px;
			border-radius: 50%;
			background: #c9b89a;
		}
		.dot.running { background: #e8b04a; }
		.dot.ok { background: #8fbf6a; }
		.dot.warn { background: #e8b04a; }
		.dot.error { background: #d45a4a; }
		.pill-copy {
			font-size: 13px;
			white-space: nowrap;
		}
	`;
}

function renderScrapeDock() {
	const host = scrapeDockState.root;
	if (!host) {
		return;
	}
	const shadow = host.shadowRoot;
	const s = scrapeDockState;
	const pct =
		s.total > 0 ? Math.min(100, Math.round((s.current / s.total) * 100)) : 0;
	const showBar = s.status === "running" || s.total > 0;
	const indeterminate = s.status === "running" && s.total === 0;

	if (s.minimized) {
		shadow.innerHTML = `
			<style>${dockStyles()}</style>
			<div class="wrap">
				<div class="card minimized">
					<button class="pill" type="button" data-expand>
						<span class="dot ${s.status}"></span>
						<span class="pill-copy">${statusWord(s.status)}${
							s.total
								? ` · ${s.current}/${s.total}`
								: ""
						} · ${formatElapsed(s.elapsedMs)}</span>
					</button>
				</div>
			</div>
		`;
		shadow.querySelector("[data-expand]").addEventListener("click", function expand() {
			s.minimized = false;
			persistMinimized(false);
			renderScrapeDock();
		});
		return;
	}

	const pageLabel = s.pageKind === "charts" ? "Chart" : "Release";
	shadow.innerHTML = `
		<style>${dockStyles()}</style>
		<div class="wrap">
			<div class="card" role="status" aria-live="polite" aria-busy="${
				s.status === "running" ? "true" : "false"
			}">
				<div class="top">
					<div class="kicker">${pageLabel}</div>
					<div class="title">${escapeHtml(s.headline || "This page can be captured")}</div>
					<div class="clock">${formatElapsed(s.elapsedMs)}</div>
				</div>
				<p class="detail">${escapeHtml(s.detail || "Stay on the page. Progress lands here.")}</p>
				${
					showBar
						? `<div class="track"><div class="fill${
								indeterminate ? " pulse" : ""
							}" style="${indeterminate ? "" : `width:${pct}%`}"></div></div>`
						: ""
				}
				<div class="row">
					<button class="primary" type="button" data-rescrape ${
						s.running ? "disabled" : ""
					}>${s.status === "idle" ? "Capture" : "Run again"}</button>
					<button class="ghost" type="button" data-min>Hide</button>
				</div>
			</div>
		</div>
	`;
	shadow.querySelector("[data-rescrape]").addEventListener("click", function run() {
		if (s.running || typeof s.onRescrape !== "function") {
			return;
		}
		s.onRescrape();
	});
	shadow.querySelector("[data-min]").addEventListener("click", function hide() {
		s.minimized = true;
		persistMinimized(true);
		renderScrapeDock();
	});
}

function mountScrapeDock(options) {
	scrapeDockState.pageKind = options.pageKind || "release";
	scrapeDockState.onRescrape = options.onRescrape || null;
	scrapeDockState.headline =
		options.pageKind === "charts"
			? "This chart can be captured"
			: "This release can be captured";
	scrapeDockState.detail =
		options.pageKind === "charts"
			? "Every row on the page, then covers already on screen."
			: "Title, genres, Spotify id, and duration if the tracklist is here.";

	let host = document.getElementById("rym-scrape-dock");
	if (!host) {
		host = document.createElement("div");
		host.id = "rym-scrape-dock";
		host.attachShadow({ mode: "open" });
		document.documentElement.appendChild(host);
	}
	scrapeDockState.root = host;

	try {
		chrome.storage.local.get(SCRAPE_DOCK_MINIMIZE_KEY, function got(res) {
			scrapeDockState.minimized = res[SCRAPE_DOCK_MINIMIZE_KEY] === true;
			renderScrapeDock();
		});
	} catch {
		renderScrapeDock();
	}

	if (!mountScrapeDock.listening) {
		chrome.runtime.onMessage.addListener(function onProgress(message) {
			if (!message || message.type !== "RYM_SCRAPE_PROGRESS") {
				return;
			}
			applyDockUpdate({
				status: "running",
				headline: message.headline,
				detail: message.detail,
				current: message.current,
				total: message.total,
				phase: message.phase,
			});
		});
		mountScrapeDock.listening = true;
	}

	renderScrapeDock();
}
