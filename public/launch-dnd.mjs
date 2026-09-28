import { applyLayoutOperation, layoutAnnouncement } from "./launch-model.mjs";

const CONTROLLERS = new WeakMap();
const MOUSE_THRESHOLD = 4;
const TOUCH_TOLERANCE = 8;
const TOUCH_DELAY = 250;
const AUTOSCROLL_EDGE = 48;

export function eligibleDropLists(source) {
	if (source?.sortKind === "project" && source.zone === "projects") {
		return ["project-list"];
	}
	if (source?.sortKind !== "bookmark") return [];
	if (projectIdFromZone(source.zone)) return ["project:*"];
	if (source.zone === "top" || source.zone === "pinned") {
		return ["top", "pinned", "project:*"];
	}
	return [];
}

export function operationFromDrop(source, target) {
	if (
		!source?.sortId ||
		!target?.valid ||
		!target.exactSlot ||
		!Number.isInteger(target.index) ||
		target.index < 0
	) {
		return null;
	}
	const eligible = eligibleDropLists(source);
	if (source.sortKind === "project") {
		if (
			target.listKind !== "projects" ||
			target.zone !== "project-list" ||
			!eligible.includes("project-list")
		) {
			return null;
		}
		return {
			kind: "moveProject",
			projectId: source.sortId,
			targetIndex:
				Number.isInteger(source.position) && target.index > source.position
					? target.index - 1
					: target.index,
		};
	}
	if (source.sortKind !== "bookmark" || target.listKind !== "bookmarks") {
		return null;
	}
	if (
		(target.zone === "top" || target.zone === "pinned") &&
		eligible.includes(target.zone)
	) {
		return {
			kind: "movePadLink",
			bookmarkId: source.sortId,
			targetZone: target.zone,
			targetIndex: target.index,
		};
	}
	const targetProjectId = projectIdFromZone(target.zone);
	if (!targetProjectId || !eligible.includes("project:*")) return null;
	const sourceProjectId = projectIdFromZone(source.zone);
	return {
		kind: "placeProjectLink",
		bookmarkId: source.sortId,
		...(sourceProjectId ? { sourceProjectId } : {}),
		targetProjectId,
		targetIndex: target.index,
	};
}

export function commitPreview(layout, operation) {
	if (!layout || !operation) return null;
	const result = applyLayoutOperation(layout, operation);
	return result.ok ? result : null;
}

function projectIdFromZone(zone) {
	return typeof zone === "string" && zone.startsWith("project:")
		? zone.slice("project:".length) || null
		: null;
}

export function initializeLaunchDnd(options) {
	const { document, window, pad, projects } = options;
	const existing = CONTROLLERS.get(document);
	if (existing) return existing;

	const roots = [pad, projects].filter(Boolean);
	const state = {
		focusIdentity: null,
		focusName: null,
		focusControl: "handle",
		focusRequiresExactZone: false,
		originFocusIdentity: null,
		restoreOriginOnNextRender: false,
		restoreHandleIdentity: null,
		suppressClickIdentity: null,
		suppressClickTimer: 0,
		destroyed: false,
		phase: "idle",
		session: null,
	};
	const matchMedia = options.matchMedia || window.matchMedia?.bind(window);
	const reducedMotionQuery = matchMedia?.("(prefers-reduced-motion: reduce)");
	let reducedMotion = reducedMotionQuery?.matches === true;
	let overlayFrame = 0;
	let autoscrollFrame = 0;
	const activeAnimations = new Set();

	function handleReducedMotionChange(event) {
		reducedMotion = event.matches;
		if (!state.session) return;
		state.session.reducedMotion = reducedMotion;
		if (!reducedMotion) return;
		for (const animation of activeAnimations) animation.cancel();
		activeAnimations.clear();
		if (state.session.overlay) {
			state.session.overlay.style.translate = "none";
			state.session.overlay.style.transition = "none";
			state.session.overlay.style.animation = "none";
		}
	}

	function belongsToRoot(element) {
		return roots.some((root) => root.contains(element));
	}

	function identityFor(element) {
		if (!element || !belongsToRoot(element)) return null;
		const sortable = element.closest?.("[data-sort-kind][data-sort-id]");
		if (!sortable || !belongsToRoot(sortable)) return null;
		return {
			sortKind: sortable.dataset.sortKind,
			sortId: sortable.dataset.sortId,
			zone: sortable.dataset.zone || null,
			...(sortable.dataset.sortKind === "project"
				? { position: numberPosition(sortable) }
				: {}),
		};
	}

	function matchesIdentity(element, identity, exactZone) {
		return (
			element.dataset.sortKind === identity.sortKind &&
			element.dataset.sortId === identity.sortId &&
			(!exactZone || element.dataset.zone === identity.zone)
		);
	}

	function findHandle(identity, exactZone = true) {
		if (!identity) return null;
		for (const root of roots) {
			const handle = [...root.querySelectorAll("[data-drag-handle]")].find(
				(element) => matchesIdentity(element, identity, exactZone),
			);
			if (handle) return handle;
		}
		return null;
	}

	function announce(message) {
		const live = document.getElementById("launch-dnd-live");
		if (live) live.textContent = message;
	}

	function itemName(handle) {
		return (
			handle?.getAttribute("aria-label")?.replace(/^Move\s+/, "") || "Item"
		);
	}

	function clearPreview(session) {
		session.indicator?.remove();
		session.indicator = null;
		for (const zone of document.querySelectorAll(
			"[data-dnd-receiving='true']",
		)) {
			zone.removeAttribute("data-dnd-receiving");
		}
	}

	function restoreOrigin(session) {
		clearPreview(session);
		session.overlay?.remove();
		session.placeholder?.remove();
		session.source.parentNode?.removeChild(session.source);
		if (session.originalNextSibling?.isConnected) {
			session.originalParent.insertBefore(
				session.source,
				session.originalNextSibling,
			);
		} else {
			session.originalParent.append(session.source);
		}
		session.source.style.visibility = session.sourceVisibility;
		session.source.style.display = session.sourceDisplay;
		session.source.removeAttribute("data-dragging");
		session.handle.style.touchAction = session.handleTouchAction;
		document.documentElement.style.userSelect = session.rootUserSelect;
	}

	function cancelDrag(notify = true, signalIdle = true) {
		const session = state.session;
		const wasActive = state.phase !== "idle";
		if (session?.phase === "keyboard") {
			session.handle.removeAttribute("aria-pressed");
			if (notify) {
				announce(
					layoutAnnouncement("cancel", {
						name: session.name,
						zone: keyboardZoneName(session.originZone),
						position: session.originIndex,
					}),
				);
			}
		}
		if (session) {
			window.clearTimeout(session.touchTimer);
			if (session.phase === "dragging") restoreOrigin(session);
			const captureElement = session.captureElement || session.handle;
			try {
				if (captureElement.hasPointerCapture?.(session.pointerId)) {
					captureElement.releasePointerCapture(session.pointerId);
				}
			} catch {
				/* capture may already have been released */
			}
		}
		if (overlayFrame) window.cancelAnimationFrame?.(overlayFrame);
		if (autoscrollFrame) window.cancelAnimationFrame?.(autoscrollFrame);
		overlayFrame = 0;
		autoscrollFrame = 0;
		state.phase = "idle";
		state.session = null;
		if (notify) options.onCancel?.();
		if (session?.phase === "keyboard" || session?.phase === "dragging") {
			restoreDragFocus(session.sourceIdentity);
		}
		if (wasActive && signalIdle) options.onIdle?.();
	}

	function cancel() {
		cancelDrag(true);
	}

	function beforeRender() {
		const handleIdentity = state.restoreHandleIdentity;
		state.restoreHandleIdentity = null;
		state.focusRequiresExactZone = state.restoreOriginOnNextRender;
		state.restoreOriginOnNextRender = false;
		state.focusIdentity = state.focusRequiresExactZone
			? state.originFocusIdentity
			: handleIdentity || identityFor(document.activeElement);
		state.focusControl =
			handleIdentity || state.focusRequiresExactZone
				? "handle"
				: focusedControl();
		state.focusName = state.focusIdentity
			? itemName(
					findHandle(state.focusIdentity, false) || document.activeElement,
				)
			: null;
		cancelDrag(true, false);
	}

	function focusedControl() {
		const active = document.activeElement;
		if (!active || active.closest?.("[data-drag-handle]")) return "handle";
		return active.closest?.("a") ? "link" : "handle";
	}

	function afterRender() {
		const focusHandle =
			findHandle(state.focusIdentity) ||
			(!state.focusRequiresExactZone
				? findHandle(state.focusIdentity, false)
				: null);
		const focusTarget =
			focusHandle && state.focusControl === "link"
				? focusHandle.parentElement
						?.closest("[data-sort-kind][data-sort-id]")
						?.querySelector("a") || focusHandle
				: focusHandle;
		if (focusTarget) {
			focusTarget.focus();
		} else if (state.focusIdentity) {
			const fallback =
				document.querySelector("#pad-heading, #pad h1, #pad h2") || pad;
			if (fallback) {
				if (!fallback.hasAttribute("tabindex")) {
					fallback.setAttribute("tabindex", "-1");
				}
				fallback.focus();
			}
			announce(`${state.focusName || "Item"} is no longer available.`);
		}
		state.focusIdentity = null;
		state.focusName = null;
		state.focusControl = "handle";
		state.focusRequiresExactZone = false;
	}

	function keyboardZoneName(zone) {
		if (zone === "top" || zone === "pinned" || zone === "projects") return zone;
		const projectId = projectIdFromZone(zone);
		const project = options
			.getLayout?.()
			?.projects?.find((item) => item._id === projectId);
		return project?.name || projectId || zone;
	}

	function keyboardLists(session) {
		if (session.sourceIdentity.sortKind === "project") {
			return [{ element: projects, zone: "projects" }];
		}
		const eligible = eligibleDropLists(session.sourceIdentity);
		return roots
			.flatMap((root) => [
				...root.querySelectorAll(
					"[data-drop-list='bookmarks'][data-drop-zone]",
				),
			])
			.filter((list) => {
				const zone = list.dataset.dropZone;
				return (
					eligible.includes(zone) ||
					(projectIdFromZone(zone) && eligible.includes("project:*"))
				);
			})
			.map((element) => ({ element, zone: element.dataset.dropZone }));
	}

	function keyboardListSize(session, list) {
		const existing = [...list.element.children].filter((element) =>
			element.matches?.("[data-sort-kind][data-sort-id]"),
		).length;
		return existing + (list.zone === session.originZone ? 0 : 1);
	}

	function keyboardOperation(session) {
		if (session.sourceIdentity.sortKind === "project") {
			return {
				kind: "moveProject",
				projectId: session.sourceIdentity.sortId,
				targetIndex: session.index,
			};
		}
		const target = {
			valid: true,
			listKind: "bookmarks",
			zone: session.zone,
			index: session.index,
			exactSlot: true,
		};
		return operationFromDrop(session.sourceIdentity, target);
	}

	function previewKeyboardSession(session) {
		const operation = keyboardOperation(session);
		const result = commitPreview(session.baseLayout, operation);
		if (!operation || !result) {
			announce(layoutAnnouncement("invalid"));
			return;
		}
		session.operation = operation;
		session.result = result;
		const list = keyboardLists(session).find(
			(item) => item.zone === session.zone,
		);
		announce(
			layoutAnnouncement("preview", {
				zone: keyboardZoneName(session.zone),
				position: session.index,
				total: keyboardListSize(session, list),
			}),
		);
		options.onPreview?.(operation, result);
	}

	function moveKeyboardSlot(session, key) {
		if (
			session.zone !== "top" &&
			(key === "ArrowLeft" || key === "ArrowRight")
		) {
			return;
		}
		const list = keyboardLists(session).find(
			(item) => item.zone === session.zone,
		);
		const last = Math.max(0, keyboardListSize(session, list) - 1);
		let delta = 0;
		if (key === "Home") session.index = 0;
		else if (key === "End") session.index = last;
		else {
			if (key === "ArrowLeft" || key === "ArrowUp") delta = -1;
			if (key === "ArrowRight" || key === "ArrowDown") delta = 1;
			if (
				session.zone === "top" &&
				(key === "ArrowUp" || key === "ArrowDown")
			) {
				delta *= 4;
			}
			session.index = Math.min(last, Math.max(0, session.index + delta));
		}
		previewKeyboardSession(session);
	}

	function cycleKeyboardZone(session, backwards) {
		const lists = keyboardLists(session);
		if (lists.length <= 1) {
			previewKeyboardSession(session);
			return;
		}
		const current = lists.findIndex((item) => item.zone === session.zone);
		const offset = backwards ? -1 : 1;
		const next = (current + offset + lists.length) % lists.length;
		session.zone = lists[next].zone;
		session.index = Math.min(
			session.index,
			Math.max(0, keyboardListSize(session, lists[next]) - 1),
		);
		previewKeyboardSession(session);
	}

	function restoreDragFocus(identity) {
		findHandle(identity)?.focus();
	}

	function requestHandleFocus(identity) {
		state.restoreHandleIdentity = identity ? { ...identity } : null;
	}

	function consumePendingHandleFocus() {
		const identity = state.restoreHandleIdentity;
		if (!identity) return;
		state.restoreHandleIdentity = null;
		(findHandle(identity) || findHandle(identity, false))?.focus();
	}

	function startKeyboardDrag(handle) {
		if (options.isPickupBlocked?.()) return false;
		const sourceIdentity = identityFor(handle);
		const source = handle.parentElement?.closest(
			"[data-sort-kind][data-sort-id]",
		);
		const baseLayout = options.getLayout?.();
		if (!sourceIdentity || !source || !baseLayout) return false;
		const session = {
			phase: "keyboard",
			handle,
			source,
			sourceIdentity,
			baseLayout,
			name: itemName(handle).replace(/\s+project$/, ""),
			originZone: sourceIdentity.zone,
			originIndex: numberPosition(source),
			zone: sourceIdentity.zone,
			index: numberPosition(source),
		};
		state.phase = "keyboard";
		state.session = session;
		handle.setAttribute("aria-pressed", "true");
		const list = keyboardLists(session).find(
			(item) => item.zone === session.zone,
		);
		announce(
			layoutAnnouncement("pickup", {
				name: session.name,
				zone: keyboardZoneName(session.zone),
				position: session.index,
				total: keyboardListSize(session, list),
			}),
		);
		return true;
	}

	function finishKeyboardDrag(session) {
		const operation = session.operation || keyboardOperation(session);
		const result =
			session.result || commitPreview(session.baseLayout, operation);
		if (!operation || !result) {
			announce(layoutAnnouncement("invalid"));
			return;
		}
		session.handle.removeAttribute("aria-pressed");
		state.originFocusIdentity = { ...session.sourceIdentity };
		state.phase = "idle";
		state.session = null;
		options.onDrop?.(operation, result);
		announce(
			layoutAnnouncement("drop", {
				name: session.name,
				zone: keyboardZoneName(session.zone),
				position: session.index,
			}),
		);
		restoreDragFocus({
			...session.sourceIdentity,
			zone:
				session.sourceIdentity.sortKind === "project"
					? "projects"
					: session.zone,
		});
		options.onIdle?.();
	}

	function restoreFocusToOrigin(identity) {
		if (identity) state.originFocusIdentity = { ...identity };
		if (state.originFocusIdentity) {
			state.restoreOriginOnNextRender = true;
		}
	}

	function handleDragKeydown(event) {
		const session = state.session;
		if (session?.phase === "keyboard") {
			const owned = [
				" ",
				"Enter",
				"Escape",
				"Tab",
				"ArrowLeft",
				"ArrowRight",
				"ArrowUp",
				"ArrowDown",
				"Home",
				"End",
			];
			if (!owned.includes(event.key)) return false;
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") cancelDrag(true);
			else if (event.key === " " || event.key === "Enter") {
				finishKeyboardDrag(session);
			} else if (event.key === "Tab") {
				cycleKeyboardZone(session, event.shiftKey);
			} else {
				moveKeyboardSlot(session, event.key);
			}
			return true;
		}
		if (event.key !== " " && event.key !== "Enter") return false;
		const handle = event.target.closest?.("[data-drag-handle]");
		if (!handle || !belongsToRoot(handle)) return false;
		if (options.isPickupBlocked?.()) return false;
		event.preventDefault();
		event.stopPropagation();
		return startKeyboardDrag(handle);
	}

	function createPressedSession(event, handle) {
		const source = handle.parentElement?.closest(
			"[data-sort-kind][data-sort-id]",
		);
		if (!source || !belongsToRoot(source)) return null;
		const session = {
			phase: "pressed",
			pointerId: event.pointerId,
			pointerType: event.pointerType || "mouse",
			handle,
			source,
			startX: event.clientX,
			startY: event.clientY,
			x: event.clientX,
			y: event.clientY,
			touchTimer: 0,
			sourceVisibility: source.style.visibility,
			sourceDisplay: source.style.display,
			handleTouchAction: handle.style.touchAction,
			rootUserSelect: document.documentElement.style.userSelect,
			originalParent: source.parentElement,
			originalNextSibling: source.nextSibling,
			sourceIdentity: identityFor(source),
			targetKey: null,
			invalidAnnounced: false,
			reducedMotion,
		};
		if (session.pointerType !== "touch") {
			capturePointer(session);
		}
		if (session.pointerType === "touch") {
			session.touchTimer = window.setTimeout(() => {
				if (state.session === session && session.phase === "pressed") {
					activatePointerDrag(session);
				}
			}, TOUCH_DELAY);
		}
		return session;
	}

	function capturePointer(session) {
		try {
			session.handle.setPointerCapture?.(session.pointerId);
		} catch {
			/* capture is best effort on detached/testing DOM */
		}
	}

	function createOverlay(session, rect) {
		const overlay = document.createElement("div");
		overlay.className = "launch-drag-overlay";
		overlay.setAttribute("aria-hidden", "true");
		if (session.source.dataset.sortKind === "project") {
			overlay.classList.add("launch-drag-project-overlay");
			const heading = session.source.querySelector("h2");
			overlay.textContent = heading?.textContent || "Project";
		} else {
			const mark = session.source.querySelector(".mark");
			if (mark) {
				const overlayMark = mark.cloneNode(true);
				overlayMark.style.width = "22px";
				overlayMark.style.height = "22px";
				overlay.append(overlayMark);
			} else
				overlay.textContent = session.source.textContent.trim().slice(0, 1);
			overlay.style.width = "44px";
			overlay.style.height = "40px";
			if (!session.reducedMotion) overlay.style.translate = "0 -2px";
		}
		overlay.style.left = "0";
		overlay.style.top = "0";
		document.body.append(overlay);
		session.overlayOffsetX = Math.min(
			Math.max(session.startX - rect.left, 0),
			rect.width,
		);
		session.overlayOffsetY = Math.min(
			Math.max(session.startY - rect.top, 0),
			rect.height,
		);
		return overlay;
	}

	function activatePointerDrag(session) {
		if (state.session !== session || session.phase !== "pressed") return;
		window.clearTimeout(session.touchTimer);
		session.phase = "dragging";
		state.phase = "dragging";
		session.previewBaseLayout = options.getLayout?.() || null;
		if (session.pointerType === "touch") capturePointer(session);
		document.documentElement.style.userSelect = "none";
		const rect = session.source.getBoundingClientRect();
		session.originRect = rect;
		session.originZone = session.source.dataset.zone || null;
		session.originIndex = numberPosition(session.source);
		session.placeholder = document.createElement("div");
		session.placeholder.className = "launch-drag-placeholder";
		session.placeholder.setAttribute("aria-hidden", "true");
		session.placeholder.dataset.placeholderKind =
			session.source.dataset.sortKind;
		session.placeholder.style.width = `${rect.width}px`;
		session.placeholder.style.height = `${rect.height}px`;
		session.source.before(session.placeholder);
		session.source.style.visibility = "hidden";
		session.source.style.display = "none";
		session.source.dataset.dragging = "true";
		session.overlay = createOverlay(session, rect);
		if (session.pointerType === "touch") {
			(options.navigator || window.navigator).vibrate?.(10);
		}
		scheduleOverlayFrame(session);
		updatePreview(session);
	}

	function resolveDropTarget(session, x = session.x, y = session.y) {
		if (session.source.dataset.sortKind === "project") {
			return resolveProjectGapTarget(x, y);
		}
		const hits = document.elementsFromPoint?.(x, y) || [];
		const list = hits
			.map((element) => element.closest?.("[data-drop-list='bookmarks']"))
			.find((element) => element && belongsToRoot(element));
		if (!list) return { valid: false };
		const items = [...list.children].filter(
			(element) =>
				element !== session.source &&
				element !== session.placeholder &&
				element.matches("[data-sort-kind='bookmark']"),
		);
		const linearIndex = items.findIndex((item) => {
			const rect = item.getBoundingClientRect();
			return y < rect.top + rect.height / 2;
		});
		const index = list.classList.contains("top-grid")
			? resolveGridIndex(items, x, y)
			: linearIndex < 0
				? items.length
				: linearIndex;
		return {
			valid: true,
			list,
			listKind: "bookmarks",
			zone: list.dataset.dropZone,
			index,
			exactSlot: true,
		};
	}

	// The rule between projects is only two pixels tall, so the gap is resolved
	// from the pointer coordinates instead of an expanded hit area that would
	// otherwise sit on top of the project tile links it separates.
	function resolveProjectGapTarget(x, y) {
		if (!projects) return { valid: false };
		const bounds = projects.getBoundingClientRect();
		if (
			x < bounds.left ||
			x > bounds.right ||
			y < bounds.top ||
			y > bounds.bottom
		) {
			return { valid: false };
		}
		const gaps = [
			...projects.querySelectorAll(
				":scope > .project-gap[data-drop-zone='project-list']",
			),
		];
		const nearest = gaps.reduce(
			(closest, gap) =>
				!closest || gapDistance(gap, y) < gapDistance(closest, y)
					? gap
					: closest,
			null,
		);
		if (!nearest) return { valid: false };
		return {
			valid: true,
			list: projects,
			listKind: "projects",
			zone: "project-list",
			index: numberPosition(nearest),
			exactSlot: true,
		};
	}

	function gapDistance(gap, y) {
		const rect = gap.getBoundingClientRect();
		return Math.abs(rect.top + rect.height / 2 - y);
	}

	function resolveGridIndex(items, x, y) {
		if (!items.length) return 0;
		const rows = [];
		for (const [index, item] of items.entries()) {
			const rect = item.getBoundingClientRect();
			const row = rows.find(
				(candidate) => Math.abs(candidate.top - rect.top) < 2,
			);
			const entry = { index, rect };
			if (row) row.entries.push(entry);
			else rows.push({ top: rect.top, entries: [entry] });
		}
		const row = rows.reduce((nearest, candidate) =>
			Math.abs(candidate.top - y) < Math.abs(nearest.top - y)
				? candidate
				: nearest,
		);
		for (const entry of row.entries) {
			if (x < entry.rect.left + entry.rect.width / 2) return entry.index;
		}
		return row.entries.at(-1).index + 1;
	}

	function numberPosition(element) {
		const position = Number(element.dataset.position);
		return Number.isFinite(position) ? position : 0;
	}

	function createIndicator(target, session) {
		const indicator = document.createElement("div");
		const grid = target.list.classList.contains("top-grid");
		indicator.className = grid ? "launch-drop-slot" : "launch-drop-rule";
		indicator.setAttribute("aria-hidden", "true");
		if (session.source.dataset.sortKind === "project") {
			const gap = [...target.list.querySelectorAll(".project-gap")].find(
				(element) => numberPosition(element) === target.index,
			);
			gap?.after(indicator);
			return indicator;
		}
		const children = [...target.list.children].filter(
			(element) =>
				element !== session.source &&
				!element.classList.contains("launch-drag-placeholder") &&
				!element.classList.contains("launch-drop-slot") &&
				!element.classList.contains("launch-drop-rule"),
		);
		target.list.insertBefore(indicator, children[target.index] || null);
		return indicator;
	}

	function measureSortableNodes() {
		return new Map(
			roots
				.flatMap((root) => [
					...root.querySelectorAll(
						"[data-sort-kind][data-sort-id]:not([data-drag-handle])",
					),
				])
				.filter((element) => element.style.visibility !== "hidden")
				.map((element) => [element, element.getBoundingClientRect()]),
		);
	}

	function animateFlip(before) {
		if (state.session?.reducedMotion) return;
		for (const [element, first] of before) {
			if (!element.isConnected) continue;
			const last = element.getBoundingClientRect();
			const dx = first.left - last.left;
			const dy = first.top - last.top;
			if (!dx && !dy) continue;
			const animation = element.animate?.(
				[
					{ transform: `translate(${dx}px, ${dy}px)` },
					{ transform: "translate(0, 0)" },
				],
				{ duration: 120, easing: "cubic-bezier(.2,.8,.2,1)" },
			);
			if (animation) {
				activeAnimations.add(animation);
				animation.finished
					?.catch(() => {})
					.finally(() => activeAnimations.delete(animation));
			}
		}
	}

	function updatePreview(session) {
		let target = resolveDropTarget(session);
		const operation = operationFromDrop(session.sourceIdentity, target);
		const previewResult =
			operation && session.previewBaseLayout
				? commitPreview(session.previewBaseLayout, operation)
				: null;
		if (!operation || (session.previewBaseLayout && !previewResult)) {
			target = { valid: false };
		}
		const restingAtOrigin = isRestingAtOrigin(session, target);
		const targetKey = !target.valid
			? "invalid"
			: restingAtOrigin
				? "origin"
				: `${target.zone}:${target.index}`;
		if (targetKey === session.targetKey) return;
		const before = measureSortableNodes();
		clearPreview(session);
		session.targetKey = targetKey;
		session.target = target;
		session.previewOperation = target.valid && !restingAtOrigin ? operation : null;
		session.previewResult =
			target.valid && !restingAtOrigin ? previewResult : null;
		session.overlay.style.opacity = target.valid ? "1" : "0.55";
		if (!target.valid) {
			if (!session.invalidAnnounced) announce("Can’t drop here.");
			session.invalidAnnounced = true;
			parkSourceAtOrigin(session);
			animateFlip(before);
			return;
		}
		session.invalidAnnounced = false;
		if (restingAtOrigin) {
			parkSourceAtOrigin(session);
			animateFlip(before);
			return;
		}
		target.list.dataset.dndReceiving = "true";
		moveSourceToTarget(session, target);
		session.indicator = createIndicator(target, session);
		options.onPreview?.(session.previewOperation, session.previewResult);
		animateFlip(before);
	}

	function isRestingAtOrigin(session, target) {
		if (!target.valid || target.zone !== session.originZone) {
			return false;
		}
		const hits = document.elementsFromPoint?.(session.x, session.y) || [];
		const hoveredBookmark = hits
			.map((element) => element.closest?.("[data-sort-kind='bookmark']"))
			.find(
				(element) =>
					element &&
					element !== session.source &&
					element !== session.placeholder,
			);
		if (hoveredBookmark) {
			return false;
		}
		return target.index === session.originIndex;
	}

	function parkSourceAtOrigin(session) {
		if (!session.placeholder?.isConnected) return;
		session.placeholder.after(session.source);
	}

	function moveSourceToTarget(session, target) {
		session.source.parentNode?.removeChild(session.source);
		if (session.source.dataset.sortKind === "project") {
			const gaps = [
				...target.list.querySelectorAll(
					":scope > .project-gap[data-drop-zone='project-list']",
				),
			];
			const gap = gaps.find(
				(element) => numberPosition(element) === target.index,
			);
			if (gap) gap.after(session.source);
			return;
		}
		const items = [...target.list.children].filter(
			(element) =>
				element !== session.placeholder &&
				element.matches("[data-sort-kind='bookmark']"),
		);
		target.list.insertBefore(session.source, items[target.index] || null);
	}

	function scheduleOverlayFrame(session) {
		if (overlayFrame) return;
		overlayFrame = window.requestAnimationFrame(() => {
			overlayFrame = 0;
			if (state.session !== session || session.phase !== "dragging") return;
			const x = session.x - session.overlayOffsetX;
			const y = session.y - session.overlayOffsetY;
			session.overlay.style.transform = `translate3d(${x}px, ${y}px, 0)`;
		});
	}

	function updateAutoscroll(session) {
		const scrollContainer = nearestScrollableAncestor(
			session.target?.list || session.source,
		);
		const bounds = scrollBounds(scrollContainer);
		let speed = 0;
		if (session.y < bounds.top + AUTOSCROLL_EDGE) {
			speed = session.reducedMotion
				? -10
				: -scrollSpeed(bounds.top + AUTOSCROLL_EDGE - session.y);
		} else if (session.y > bounds.bottom - AUTOSCROLL_EDGE) {
			speed = session.reducedMotion
				? 10
				: scrollSpeed(session.y - (bounds.bottom - AUTOSCROLL_EDGE));
		}
		session.scrollSpeed = speed;
		session.scrollContainer = scrollContainer;
		if (!speed && autoscrollFrame) {
			window.cancelAnimationFrame?.(autoscrollFrame);
			autoscrollFrame = 0;
		}
		if (!speed || autoscrollFrame) return;
		function scrollFrame() {
			autoscrollFrame = 0;
			if (state.session !== session || !session.scrollSpeed) return;
			session.scrollContainer.scrollBy?.(0, session.scrollSpeed);
			updatePreview(session);
			autoscrollFrame = window.requestAnimationFrame(scrollFrame);
		}
		autoscrollFrame = window.requestAnimationFrame(scrollFrame);
	}

	function nearestScrollableAncestor(element) {
		for (
			let current = element?.parentElement;
			current;
			current = current.parentElement
		) {
			const style = window.getComputedStyle?.(current);
			if (
				/(auto|scroll)/.test(style?.overflowY || "") &&
				current.scrollHeight > current.clientHeight
			) {
				return current;
			}
		}
		return window;
	}

	function scrollBounds(container) {
		if (container === window) {
			return {
				top: 0,
				bottom: window.innerHeight || document.documentElement.clientHeight,
			};
		}
		const rect = container.getBoundingClientRect();
		return { top: rect.top, bottom: rect.bottom };
	}

	function scrollSpeed(distance) {
		const progress = Math.min(1, Math.max(0, distance / AUTOSCROLL_EDGE));
		return Math.round(4 + progress * 14);
	}

	function handlePointerDown(event) {
		options.onPointerDown?.(event);
		if (
			state.phase !== "idle" ||
			event.button !== 0 ||
			event.isPrimary === false ||
			options.isPickupBlocked?.()
		)
			return;
		const handle = event.target.closest?.("[data-drag-handle]");
		if (!handle || !belongsToRoot(handle)) return;
		const session = createPressedSession(event, handle);
		if (!session) return;
		state.session = session;
		state.phase = "pressed";
	}

	function handlePointerMove(event) {
		const session = state.session;
		if (!session || event.pointerId !== session.pointerId) return;
		session.x = event.clientX;
		session.y = event.clientY;
		const distance = Math.hypot(
			session.x - session.startX,
			session.y - session.startY,
		);
		if (session.phase === "pressed") {
			if (session.pointerType === "touch") {
				if (distance > TOUCH_TOLERANCE) cancelDrag(false);
			} else if (distance > MOUSE_THRESHOLD) {
				activatePointerDrag(session);
			}
			return;
		}
		event.preventDefault();
		scheduleOverlayFrame(session);
		updatePreview(session);
		updateAutoscroll(session);
	}

	function handleTouchMove(event) {
		if (
			state.phase === "dragging" &&
			state.session?.pointerType === "touch" &&
			event.cancelable
		) {
			event.preventDefault();
		}
	}

	function handlePointerEnd(event) {
		const session = state.session;
		if (!session || event.pointerId !== session.pointerId) return;
		if (session.phase === "pressed") {
			session.handle.focus();
			cancelDrag(false);
			return;
		}
		if (!session.previewOperation) {
			cancelDrag(true);
			armClickSuppression(session);
			return;
		}
		const operation = session.previewOperation;
		const result = session.previewResult;
		restoreOrigin(session);
		if (overlayFrame) window.cancelAnimationFrame?.(overlayFrame);
		if (autoscrollFrame) window.cancelAnimationFrame?.(autoscrollFrame);
		overlayFrame = 0;
		autoscrollFrame = 0;
		state.phase = "idle";
		state.session = null;
		requestHandleFocus(session.sourceIdentity);
		armClickSuppression(session);
		options.onDrop?.(operation, result);
		options.onIdle?.();
		consumePendingHandleFocus();
	}

	function handlePointerCancel(event) {
		const session = state.session;
		if (!session || event.pointerId !== session.pointerId) return;
		cancelDrag(session.phase !== "pressed");
	}

	function handleLostPointerCapture(event) {
		const session = state.session;
		if (!session || event.pointerId !== session.pointerId) return;
		const handleHidden =
			!session.handle.isConnected ||
			session.handle.getClientRects?.().length === 0;
		if (
			session.phase === "dragging" &&
			handleHidden &&
			event.target !== document.documentElement
		) {
			// Hiding the dragged source releases its handle's capture; keep the gesture.
			session.captureElement = document.documentElement;
			try {
				session.captureElement.setPointerCapture?.(session.pointerId);
			} catch {
				/* document listeners still receive the pointer without capture */
			}
			return;
		}
		cancelDrag(true);
	}

	// A pointer gesture that dragged still synthesizes one click, which the
	// browser dispatches in the same task as its pointerup. Anything later is a
	// fresh interaction, so the window closes on its own rather than waiting for
	// a click that a re-rendered source node may never produce.
	function armClickSuppression(session) {
		state.suppressClickIdentity = session.sourceIdentity;
		window.clearTimeout(state.suppressClickTimer);
		state.suppressClickTimer = window.setTimeout(disarmClickSuppression, 0);
	}

	function disarmClickSuppression() {
		window.clearTimeout(state.suppressClickTimer);
		state.suppressClickIdentity = null;
		state.suppressClickTimer = 0;
	}

	function handleClick(event) {
		const identity = state.suppressClickIdentity;
		if (!identity) return;
		disarmClickSuppression();
		const anchor = event.target.closest?.("a");
		const sortable = anchor?.closest?.("[data-sort-kind][data-sort-id]");
		if (!anchor || !sortable || !matchesIdentity(sortable, identity, true))
			return;
		event.preventDefault();
		event.stopImmediatePropagation?.();
		event.stopPropagation();
	}

	function handleEscape(event) {
		if (event.key !== "Escape" || state.phase === "idle") return;
		event.preventDefault();
		event.stopPropagation();
		cancelDrag(true);
	}

	function handleVisibilityChange() {
		if (document.hidden) cancelDrag(true);
	}

	function handleKeyDown(event) {
		if (handleDragKeydown(event)) return;
		options.onKeyDown?.(event);
	}

	function destroy() {
		if (state.destroyed) return;
		cancel();
		disarmClickSuppression();
		for (const root of roots) {
			root.removeEventListener("pointerdown", handlePointerDown);
			root.removeEventListener("keydown", handleKeyDown);
		}
		document.removeEventListener("pointermove", handlePointerMove);
		document.removeEventListener("touchmove", handleTouchMove);
		document.removeEventListener("pointerup", handlePointerEnd);
		document.removeEventListener("pointercancel", handlePointerCancel);
		document.removeEventListener(
			"lostpointercapture",
			handleLostPointerCapture,
		);
		document.removeEventListener("keydown", handleEscape, true);
		document.removeEventListener("click", handleClick, true);
		document.removeEventListener("visibilitychange", handleVisibilityChange);
		window.removeEventListener("blur", cancel);
		reducedMotionQuery?.removeEventListener?.(
			"change",
			handleReducedMotionChange,
		);
		state.destroyed = true;
		CONTROLLERS.delete(document);
	}

	function getState() {
		return {
			focusIdentity: state.focusIdentity ? { ...state.focusIdentity } : null,
			phase: state.phase,
			target: state.session?.target
				? {
						valid: state.session.target.valid,
						zone: state.session.target.zone || null,
						index: state.session.target.index ?? null,
					}
				: null,
			destroyed: state.destroyed,
		};
	}

	for (const root of roots) {
		root.addEventListener("pointerdown", handlePointerDown);
		root.addEventListener("keydown", handleKeyDown);
	}
	document.addEventListener("pointermove", handlePointerMove, {
		passive: false,
	});
	// pan-y is fixed at contact; only a cancelable touchmove stops the browser
	// from claiming the vertical pan (and firing pointercancel) after pickup.
	document.addEventListener("touchmove", handleTouchMove, { passive: false });
	document.addEventListener("pointerup", handlePointerEnd);
	document.addEventListener("pointercancel", handlePointerCancel);
	document.addEventListener("lostpointercapture", handleLostPointerCapture);
	document.addEventListener("keydown", handleEscape, true);
	document.addEventListener("click", handleClick, true);
	document.addEventListener("visibilitychange", handleVisibilityChange);
	window.addEventListener("blur", cancel);
	reducedMotionQuery?.addEventListener?.("change", handleReducedMotionChange);

	const controller = {
		beforeRender,
		afterRender,
		cancel,
		destroy,
		getState,
		isActive() {
			return state.phase !== "idle";
		},
		restoreFocusToOrigin,
	};
	CONTROLLERS.set(document, controller);

	if (typeof options.measure === "function") {
		const measure = () => options.measure({ pad, projects });
		if (typeof window.requestIdleCallback === "function") {
			window.requestIdleCallback(measure, { timeout: 500 });
		} else {
			window.setTimeout(measure, 0);
		}
	}

	return controller;
}
