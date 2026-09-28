export function displayName(bookmark, membership) {
	return membership.name || bookmark.title;
}

export const LAYOUT_STORAGE_KEY = "launch-layout-v2";
export const LEGACY_BOOKMARKS_STORAGE_KEY = "launch-bookmarks";
export const LEGACY_PROJECTS_STORAGE_KEY = "launch-projects";

export function readLayoutSnapshot(storage) {
	const snapshot = readStoredJson(storage, LAYOUT_STORAGE_KEY);
	if (
		snapshot?.schemaVersion === 2 &&
		Number.isFinite(snapshot.layoutVersion) &&
		Array.isArray(snapshot.bookmarks) &&
		Array.isArray(snapshot.projects)
	) {
		return {
			source: "v2",
			layout: sortLayout({
				version: snapshot.layoutVersion,
				bookmarks: snapshot.bookmarks,
				projects: snapshot.projects,
			}),
		};
	}
	return {
		source: "legacy",
		layout: inferLegacyLayout(
			readStoredJson(storage, LEGACY_BOOKMARKS_STORAGE_KEY),
			readStoredJson(storage, LEGACY_PROJECTS_STORAGE_KEY),
		),
	};
}

export function writeLayoutSnapshot(storage, layout, savedAt = Date.now()) {
	if (!storage?.setItem) return false;
	try {
		storage.setItem(
			LAYOUT_STORAGE_KEY,
			JSON.stringify({
				schemaVersion: 2,
				layoutVersion: Number.isFinite(layout?.version) ? layout.version : 0,
				bookmarks: Array.isArray(layout?.bookmarks) ? layout.bookmarks : [],
				projects: Array.isArray(layout?.projects) ? layout.projects : [],
				savedAt,
			}),
		);
		return true;
	} catch {
		return false;
	}
}

export function inferLegacyLayout(bookmarks, projects) {
	const sourceBookmarks = Array.isArray(bookmarks) ? bookmarks : [];
	const sourceProjects = Array.isArray(projects) ? projects : [];
	let normalizedBookmarks = sourceBookmarks.map((bookmark) => ({
		...bookmark,
		tags: normalizePadTags(bookmark.tags),
		projects: (bookmark.projects || []).map((membership) => ({
			...membership,
		})),
	}));
	for (const zone of ["top", "pinned"]) {
		const ordered = normalizedBookmarks
			.filter((bookmark) => padZoneForBookmark(bookmark) === zone)
			.sort((left, right) => {
				if ((left._creationTime || 0) !== (right._creationTime || 0)) {
					return (left._creationTime || 0) - (right._creationTime || 0);
				}
				return String(left._id || "").localeCompare(String(right._id || ""));
			});
		const positions = new Map(
			ordered.map((bookmark, position) => [bookmark._id, position]),
		);
		normalizedBookmarks = normalizedBookmarks.map((bookmark) => ({
			...bookmark,
			padPosition: positions.has(bookmark._id)
				? positions.get(bookmark._id)
				: bookmark.padPosition,
			projects: bookmark.projects.map((membership) => ({ ...membership })),
		}));
	}
	const projectIds = new Set(sourceProjects.map((project) => project._id));
	for (const bookmark of normalizedBookmarks) {
		for (const membership of bookmark.projects) {
			projectIds.add(membership.projectId);
		}
	}
	for (const projectId of projectIds) {
		normalizedBookmarks = compactProjectMemberships(
			normalizedBookmarks,
			projectId,
		);
	}
	return sortLayout({
		version: 0,
		bookmarks: normalizedBookmarks,
		projects: compactProjects(sourceProjects),
	});
}

function readStoredJson(storage, key) {
	if (!storage?.getItem) return null;
	try {
		const value = storage.getItem(key);
		return value ? JSON.parse(value) : null;
	} catch {
		return null;
	}
}

export function normalizePadTags(tags) {
	return Array.isArray(tags) && tags.includes("top") ? ["top"] : ["pinned"];
}

export function padZoneForBookmark(bookmark) {
	return normalizePadTags(bookmark?.tags)[0];
}

function comparePosition(left, right, fallbackField) {
	const leftPosition = Number.isFinite(left.position)
		? left.position
		: Number.POSITIVE_INFINITY;
	const rightPosition = Number.isFinite(right.position)
		? right.position
		: Number.POSITIVE_INFINITY;
	if (leftPosition !== rightPosition) return leftPosition - rightPosition;
	const leftFallback = Number.isFinite(left[fallbackField])
		? left[fallbackField]
		: 0;
	const rightFallback = Number.isFinite(right[fallbackField])
		? right[fallbackField]
		: 0;
	if (leftFallback !== rightFallback) return leftFallback - rightFallback;
	return String(left._id || "").localeCompare(String(right._id || ""));
}

function comparePadBookmarks(left, right) {
	const leftPosition = Number.isFinite(left.padPosition)
		? left.padPosition
		: Number.POSITIVE_INFINITY;
	const rightPosition = Number.isFinite(right.padPosition)
		? right.padPosition
		: Number.POSITIVE_INFINITY;
	if (leftPosition !== rightPosition) return leftPosition - rightPosition;
	if ((left._creationTime || 0) !== (right._creationTime || 0)) {
		return (left._creationTime || 0) - (right._creationTime || 0);
	}
	return String(left._id || "").localeCompare(String(right._id || ""));
}

export function sortLayout(layout) {
	const zones = { top: [], pinned: [] };
	for (const bookmark of layout.bookmarks || []) {
		const normalized = {
			...bookmark,
			tags: normalizePadTags(bookmark.tags),
			projects: [...(bookmark.projects || [])],
		};
		zones[padZoneForBookmark(normalized)].push(normalized);
	}
	for (const zone of ["top", "pinned"]) zones[zone].sort(comparePadBookmarks);
	const bookmarks = [...zones.top, ...zones.pinned].map((bookmark) => ({
		...bookmark,
		projects: bookmark.projects.map((membership) => ({ ...membership })),
	}));
	const projects = [...(layout.projects || [])]
		.map((project) => ({ ...project }))
		.sort((left, right) => comparePosition(left, right, "createdAt"));
	return { ...layout, bookmarks, projects };
}

export function removeAndInsert(items, sourceIndex, targetIndex) {
	const next = [...items];
	if (
		!Number.isInteger(sourceIndex) ||
		sourceIndex < 0 ||
		sourceIndex >= next.length
	) {
		return next;
	}
	const [moving] = next.splice(sourceIndex, 1);
	const clampedIndex = Math.max(
		0,
		Math.min(
			Number.isFinite(targetIndex) ? Math.trunc(targetIndex) : 0,
			next.length,
		),
	);
	next.splice(clampedIndex, 0, moving);
	return next;
}

export function compactPadZone(bookmarks, zone) {
	const ordered = bookmarks
		.filter((bookmark) => padZoneForBookmark(bookmark) === zone)
		.sort(comparePadBookmarks);
	const positions = new Map(
		ordered.map((bookmark, position) => [bookmark._id, position]),
	);
	return bookmarks.map((bookmark) => {
		if (!positions.has(bookmark._id)) {
			return {
				...bookmark,
				tags: normalizePadTags(bookmark.tags),
				projects: [...(bookmark.projects || [])],
			};
		}
		return {
			...bookmark,
			tags: [zone],
			padPosition: positions.get(bookmark._id),
			projects: [...(bookmark.projects || [])],
		};
	});
}

export function compactProjectMemberships(bookmarks, projectId) {
	const entries = bookmarks
		.flatMap((bookmark) => {
			const membership = (bookmark.projects || []).find(
				(item) => item.projectId === projectId,
			);
			return membership ? [{ bookmark, membership }] : [];
		})
		.sort(compareProjectMembershipEntries);
	const positions = new Map(
		entries.map((entry, position) => [entry.bookmark._id, position]),
	);
	return bookmarks.map((bookmark) => ({
		...bookmark,
		projects: (bookmark.projects || []).map((membership) =>
			membership.projectId === projectId
				? { ...membership, position: positions.get(bookmark._id) }
				: { ...membership },
		),
	}));
}

function compareProjectMembershipEntries(left, right) {
	const leftPosition = Number.isFinite(left.membership.position)
		? left.membership.position
		: Number.POSITIVE_INFINITY;
	const rightPosition = Number.isFinite(right.membership.position)
		? right.membership.position
		: Number.POSITIVE_INFINITY;
	if (leftPosition !== rightPosition) return leftPosition - rightPosition;
	if (
		(left.bookmark._creationTime || 0) !== (right.bookmark._creationTime || 0)
	) {
		return (
			(left.bookmark._creationTime || 0) - (right.bookmark._creationTime || 0)
		);
	}
	return String(left.bookmark._id || "").localeCompare(
		String(right.bookmark._id || ""),
	);
}

export function compactProjects(projects) {
	return [...projects]
		.sort((left, right) => comparePosition(left, right, "createdAt"))
		.map((project, position) => ({ ...project, position }));
}

export function addProject(bookmark, projectId) {
	if (bookmark.projects.some((item) => item.projectId === projectId)) {
		return bookmark;
	}
	return {
		...bookmark,
		projects: [...bookmark.projects, { projectId }],
	};
}

export function toggleProject(bookmark, projectId) {
	const existing = bookmark.projects.some(
		(item) => item.projectId === projectId,
	);
	if (!existing) return addProject(bookmark, projectId);
	return {
		...bookmark,
		projects: bookmark.projects.filter((item) => item.projectId !== projectId),
	};
}

export function renamePad(bookmark, nextTitle) {
	return { ...bookmark, title: nextTitle };
}

export function renameInProject(bookmark, projectId, nextName) {
	return {
		...bookmark,
		projects: bookmark.projects.map((item) => {
			if (item.projectId !== projectId) return item;
			const { name: _name, ...membership } = item;
			return nextName === bookmark.title
				? membership
				: { ...membership, name: nextName };
		}),
	};
}

export function setEnvironment(bookmark, projectId, environment) {
	return {
		...bookmark,
		projects: bookmark.projects.map((item) => {
			if (item.projectId !== projectId) return item;
			const { environment: _environment, ...membership } = item;
			return environment ? { ...membership, environment } : membership;
		}),
	};
}

export function isLocalUrl(value) {
	try {
		const host = new URL(value).hostname.toLowerCase();
		return (
			host === "localhost" ||
			host === "127.0.0.1" ||
			host === "[::1]" ||
			host === "::1"
		);
	} catch {
		return false;
	}
}

export function firstProdBookmarkInProject(bookmarks, projectId) {
	return (
		bookmarks.find((bookmark) =>
			(bookmark.projects || []).some(
				(item) => item.projectId === projectId && item.environment === "prod",
			),
		) || null
	);
}

export function faviconSourceForProjectTile(bookmark, projectId, bookmarks) {
	if (isLocalUrl(bookmark.url)) {
		const prod = firstProdBookmarkInProject(bookmarks, projectId);
		if (prod) return prod.url;
	}
	return bookmark.url;
}

export function stripUtm(value) {
	try {
		const parsed = new URL(value);
		for (const key of [...parsed.searchParams.keys()]) {
			if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
		}
		return parsed.toString();
	} catch {
		return value;
	}
}

export function looksLikeUrl(value) {
	const trimmed = String(value || "").trim();
	if (!trimmed) return false;
	if (/^https?:\/\//i.test(trimmed)) return true;
	if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?([/:?#]|$)/i.test(trimmed)) {
		return true;
	}
	return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#]|$)/i.test(trimmed);
}

export function normalizeLaunchUrl(value) {
	const trimmed = String(value || "").trim();
	if (!trimmed) return "";
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	return stripUtm(withScheme);
}

export function titleSuggestionFromUrl(value) {
	try {
		const parsed = new URL(normalizeLaunchUrl(value));
		const host = parsed.hostname.replace(/^www\./i, "");
		const path = parsed.pathname.replace(/\/+$/, "");
		if (!path || path === "/") return host || "Untitled";
		const segment = decodeURIComponent(
			path.split("/").filter(Boolean).pop() || host,
		);
		const cleaned = segment
			.replace(/\.[a-z0-9]{1,5}$/i, "")
			.replace(/[-_]+/g, " ")
			.trim();
		return cleaned || host || "Untitled";
	} catch {
		return "Untitled";
	}
}

export function extractTitleFromHtml(html) {
	const og =
		html.match(
			/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
		) ||
		html.match(
			/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
		);
	if (og?.[1]?.trim()) return decodeHtmlEntities(og[1].trim());
	const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
	if (title?.[1]?.trim()) return decodeHtmlEntities(title[1].trim());
	return "";
}

function decodeHtmlEntities(value) {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

export function projectsNewestFirst(projects) {
	return [...projects].sort((a, b) => b.createdAt - a.createdAt);
}

/** Env picker keys: P/Q/S/D set env; N/0/Backspace clear. Undefined = not a shortcut. */
export function environmentForShortcut(key) {
	if (key === "Backspace" || key === "0" || key === "n" || key === "N") {
		return null;
	}
	const lower =
		typeof key === "string" && key.length === 1 ? key.toLowerCase() : key;
	if (lower === "p") return "prod";
	if (lower === "q") return "qa";
	if (lower === "s") return "stage";
	if (lower === "d") return "dev";
	return undefined;
}

export function environmentShortcutLabel(environment) {
	if (environment === "prod") return "P";
	if (environment === "qa") return "Q";
	if (environment === "stage") return "S";
	if (environment === "dev") return "D";
	if (environment == null) return "N";
	return "";
}

/** Prefer a pinned keyboard target (menu/popover open) over hover. */
export function resolveKeyboardTargetId({ pinnedId, hoveredId, menuId }) {
	return pinnedId || hoveredId || menuId || null;
}

/** Append a cache-bust query so browsers re-fetch a favicon URL. */
export function withCacheBust(url, bust) {
	if (!url || bust == null || bust === "") return url || "";
	const sep = String(url).includes("?") ? "&" : "?";
	return `${url}${sep}v=${encodeURIComponent(String(bust))}`;
}

export const LAST_GROUP_STORAGE_KEY = "launch-last-group-id";

export function readLastGroupId(storage) {
	if (!storage?.getItem) return null;
	try {
		const value = storage.getItem(LAST_GROUP_STORAGE_KEY);
		return value || null;
	} catch {
		return null;
	}
}

export function writeLastGroupId(storage, projectId) {
	if (!storage?.setItem || !projectId) return;
	try {
		storage.setItem(LAST_GROUP_STORAGE_KEY, String(projectId));
	} catch {
		/* ignore quota / private mode */
	}
}

export function defaultSelectedGroupIds(projects, lastGroupId) {
	if (!lastGroupId) return [];
	const exists = (projects || []).some(
		(project) => project._id === lastGroupId,
	);
	return exists ? [lastGroupId] : [];
}

export function applyLayoutOperation(confirmed, operation) {
	const layout = sortLayout(confirmed);
	if (!operation || typeof operation !== "object") {
		return invalidLayoutOperation("unsupported-operation");
	}
	if (operation.kind === "movePadLink") {
		return applyPadMove(layout, operation);
	}
	if (operation.kind === "placeProjectLink") {
		return applyProjectPlacement(layout, operation);
	}
	if (operation.kind === "moveProject") {
		return applyProjectMove(layout, operation);
	}
	return invalidLayoutOperation("unsupported-operation");
}

export function replayLayoutOperations(confirmed, operations) {
	let layout = sortLayout(confirmed);
	const affectedZones = [];
	for (const operation of operations || []) {
		const result = applyLayoutOperation(layout, operation);
		if (!result.ok) return result;
		layout = result.layout;
		for (const zone of result.affectedZones) {
			if (!affectedZones.includes(zone)) affectedZones.push(zone);
		}
	}
	return { ok: true, layout, affectedZones };
}

export function removeDependentOperations(operations, missingIdentity) {
	const missingBookmarkId =
		typeof missingIdentity === "string"
			? missingIdentity
			: missingIdentity?.bookmarkId;
	const missingProjectId =
		typeof missingIdentity === "string"
			? missingIdentity
			: missingIdentity?.projectId;
	return (operations || []).filter((operation) => {
		if (missingBookmarkId && operation.bookmarkId === missingBookmarkId) {
			return false;
		}
		if (
			missingProjectId &&
			(operation.projectId === missingProjectId ||
				operation.sourceProjectId === missingProjectId ||
				operation.targetProjectId === missingProjectId)
		) {
			return false;
		}
		return true;
	});
}

const OFFLINE_MESSAGE = "You’re offline. Reconnect, then try the move again.";
const COULD_NOT_SAVE_MESSAGE =
	"Couldn’t save that move. Your previous order is restored.";
const CHANGED_ELSEWHERE_MESSAGE =
	"The layout changed elsewhere. Review the latest order and try again.";
const SAVING_MESSAGE = "Saving order…";
const TRANSPORT_RETRY_DELAYS = [250, 1000, 3000];

export function sameLayoutContent(left, right) {
	function canonical(value) {
		if (Array.isArray(value)) return value.map(canonical);
		if (!value || typeof value !== "object") return value;
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, canonical(value[key])]),
		);
	}
	function content(layout) {
		const sorted = sortLayout(layout || {});
		return JSON.stringify(
			canonical({ bookmarks: sorted.bookmarks, projects: sorted.projects }),
		);
	}
	return content(left) === content(right);
}

export function pendingLayoutMarkers(operations) {
	const items = [];
	const zones = [];
	function add(list, value, key) {
		if (!list.some((existing) => key(existing) === key(value))) {
			list.push(value);
		}
	}
	for (const operation of operations || []) {
		add(
			items,
			operation.kind === "moveProject"
				? { sortKind: "project", sortId: operation.projectId }
				: { sortKind: "bookmark", sortId: operation.bookmarkId },
			(item) => `${item.sortKind}:${item.sortId}`,
		);
		for (const zone of [
			operation.targetZone,
			operation.sourceProjectId ? `project:${operation.sourceProjectId}` : null,
			operation.targetProjectId ? `project:${operation.targetProjectId}` : null,
		]) {
			if (zone) add(zones, zone, (value) => value);
		}
	}
	return { items, zones };
}

export function createLaunchLayoutStore(options) {
	const applyOperation = options.applyOperation || applyLayoutOperation;
	const createOperationId =
		options.createOperationId || (() => globalThis.crypto.randomUUID());
	const isOnline =
		options.isOnline ||
		(() => typeof navigator === "undefined" || navigator.onLine !== false);
	const wait =
		options.wait ||
		((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
	const classifyError = options.classifyError || classifyLayoutMutationError;
	let confirmed = sortLayout(options.initialLayout);
	let hasAuthority = false;
	let pendingOperations = [];
	let view = confirmed;
	let processing = false;
	let status = "";

	function setStatus(message) {
		status = message;
		options.setStatus?.(message);
	}

	function render(pending = pendingOperations.length > 0) {
		options.render?.(view, {
			pending,
			pendingOperations: [...pendingOperations],
		});
	}

	function persist() {
		let layout = confirmed;
		for (const entry of pendingOperations) {
			if (entry.offline) continue;
			const result = applyOperation(layout, entry.operation);
			if (result.ok) layout = result.layout;
		}
		writeLayoutSnapshot(options.storage, layout);
	}

	function deriveView() {
		let layout = confirmed;
		const kept = [];
		const dropped = [];
		for (const entry of pendingOperations) {
			if (
				dropped.some((failure) =>
					dependsOn(entry.operation, failure.entry.operation, failure.reason),
				)
			) {
				continue;
			}
			const result = applyOperation(layout, entry.operation);
			if (result.ok) {
				layout = result.layout;
				kept.push(entry);
			} else {
				dropped.push({ entry, reason: result.reason });
			}
		}
		pendingOperations = kept;
		view = layout;
		return dropped;
	}

	function commit({ failed = null, message } = {}) {
		const dropped = deriveView();
		persist();
		if (failed) options.restoreFocus?.(failed.operation);
		render();
		if (failed) setStatus(message);
		else if (dropped.length > 0) setStatus(CHANGED_ELSEWHERE_MESSAGE);
		else if (message !== undefined) setStatus(message);
	}

	function failEntry(entry, reason, message) {
		pendingOperations = pendingOperations.filter(
			(candidate) =>
				candidate !== entry &&
				!dependsOn(candidate.operation, entry.operation, reason),
		);
		commit({ failed: entry, message });
	}

	function acceptAuthority(snapshot) {
		if (!hasAuthority || snapshot.version >= confirmed.version) {
			confirmed = sortLayout({
				version: snapshot.version,
				bookmarks: snapshot.bookmarks,
				projects: snapshot.projects,
			});
		}
		hasAuthority = true;
		const acknowledged = new Set(snapshot.recentOperationIds || []);
		if (acknowledged.size > 0) {
			pendingOperations = pendingOperations.filter(
				(entry) => !acknowledged.has(entry.operationId),
			);
		}
	}

	async function handleFailure(entry, kind) {
		if (kind !== "transport") {
			failEntry(
				entry,
				kind,
				kind === "rejected"
					? COULD_NOT_SAVE_MESSAGE
					: CHANGED_ELSEWHERE_MESSAGE,
			);
			return;
		}
		if (!isOnline()) {
			setStatus(OFFLINE_MESSAGE);
		} else if (entry.transportRetries < TRANSPORT_RETRY_DELAYS.length) {
			const delay = TRANSPORT_RETRY_DELAYS[entry.transportRetries];
			entry.transportRetries += 1;
			await wait(delay);
		} else {
			failEntry(entry, "failed", COULD_NOT_SAVE_MESSAGE);
		}
	}

	function handleResult(entry, result) {
		acceptAuthority({
			version: result.version,
			bookmarks: result.bookmarks,
			projects: result.projects,
		});
		if (result.status === "conflict") {
			if (entry.conflicts === 0) {
				entry.conflicts += 1;
				commit();
			} else {
				failEntry(entry, "conflict", CHANGED_ELSEWHERE_MESSAGE);
			}
			return;
		}
		pendingOperations = pendingOperations.filter(
			(candidate) => candidate !== entry,
		);
		commit({
			message:
				pendingOperations.length === 0
					? ""
					: isOnline()
						? SAVING_MESSAGE
						: OFFLINE_MESSAGE,
		});
	}

	async function sendAttempt(entry) {
		try {
			const result = await options.mutate({
				operationId: entry.operationId,
				expectedVersion: confirmed.version,
				operation: entry.operation,
			});
			return { result };
		} catch (error) {
			return { kind: classifyError(error) };
		}
	}

	async function processQueue() {
		if (processing || pendingOperations.length === 0) return;
		if (!isOnline()) {
			setStatus(OFFLINE_MESSAGE);
			return;
		}
		processing = true;
		const entry = pendingOperations[0];
		try {
			const outcome = await sendAttempt(entry);
			if (!pendingOperations.includes(entry)) return;
			if (outcome.kind) await handleFailure(entry, outcome.kind);
			else handleResult(entry, outcome.result);
		} finally {
			processing = false;
			if (pendingOperations.length > 0 && isOnline()) {
				void processQueue();
			}
		}
	}

	function drop(operation) {
		const result = applyOperation(view, operation);
		if (!result.ok) return result;
		const online = isOnline();
		const entry = {
			operationId: createOperationId(),
			operation,
			conflicts: 0,
			transportRetries: 0,
			offline: !online,
		};
		pendingOperations.push(entry);
		view = result.layout;
		if (online) persist();
		render(true);
		setStatus(online ? SAVING_MESSAGE : OFFLINE_MESSAGE);
		void processQueue();
		return { ...result, operationId: entry.operationId };
	}

	function receiveSnapshot(snapshot) {
		const acknowledged = new Set(snapshot.recentOperationIds || []);
		const hasNewAcknowledgment = pendingOperations.some((entry) =>
			acknowledged.has(entry.operationId),
		);
		if (
			hasAuthority &&
			snapshot.version <= confirmed.version &&
			!hasNewAcknowledgment
		) {
			return;
		}
		acceptAuthority(snapshot);
		commit();
	}

	function handleOffline() {
		for (const entry of pendingOperations) entry.offline = true;
		persist();
		if (pendingOperations.length > 0) setStatus(OFFLINE_MESSAGE);
	}

	function retryOnline() {
		if (!isOnline()) return;
		if (status === OFFLINE_MESSAGE) {
			setStatus(pendingOperations.length > 0 ? SAVING_MESSAGE : "");
		}
		void processQueue();
	}

	return {
		getView() {
			return view;
		},
		getConfirmed() {
			return confirmed;
		},
		getPendingOperations() {
			return pendingOperations.map((entry) => ({
				operationId: entry.operationId,
				...entry.operation,
			}));
		},
		drop,
		receiveSnapshot,
		processQueue,
		handleOffline,
		retryOnline,
		rollback(message) {
			pendingOperations = [];
			view = confirmed;
			persist();
			options.restoreFocus?.();
			render();
			setStatus(message || COULD_NOT_SAVE_MESSAGE);
		},
	};
}

export function classifyLayoutMutationError(error) {
	if (error && typeof error === "object" && error.data !== undefined) {
		const code = error.data?.code;
		return code === "missing-item" || code === "missing-target"
			? code
			: "rejected";
	}
	const message = String(error?.message || "");
	if (!/Server Error|Uncaught /.test(message)) return "transport";
	if (/Target project not found/.test(message)) return "missing-target";
	if (
		/Bookmark not found|Project not found|Source project not found|not in the source project/.test(
			message,
		)
	) {
		return "missing-item";
	}
	return "rejected";
}

export function focusIdentityForOperation(operation, layout) {
	if (operation?.kind === "moveProject") {
		return {
			sortKind: "project",
			sortId: operation.projectId,
			zone: "projects",
		};
	}
	const bookmark = layout?.bookmarks?.find(
		(item) => item._id === operation?.bookmarkId,
	);
	let zone = bookmark ? padZoneForBookmark(bookmark) : null;
	if (operation?.kind === "placeProjectLink" && operation.sourceProjectId) {
		zone = `project:${operation.sourceProjectId}`;
	}
	return { sortKind: "bookmark", sortId: operation?.bookmarkId, zone };
}

export function layoutAnnouncement(kind, details = {}) {
	const name = details.name || "Item";
	const zone = displayZone(details.zone);
	const position = (Number(details.position) || 0) + 1;
	if (kind === "pickup") {
		return `Moving ${name}. ${zone}, position ${position} of ${details.total}. Use arrow keys to move, Tab to change section, Enter to drop, or Escape to cancel.`;
	}
	if (kind === "preview") {
		return `${zone}, position ${position} of ${details.total}.`;
	}
	if (kind === "drop") {
		return `Moved ${name} to ${zone}, position ${position}.`;
	}
	if (kind === "cancel") {
		return `Move canceled. ${name} returned to ${zone}, position ${position}.`;
	}
	if (kind === "invalid") return "Can’t drop here.";
	return "";
}

function applyPadMove(layout, operation) {
	if (operation.targetZone !== "top" && operation.targetZone !== "pinned") {
		return invalidLayoutOperation("invalid-target");
	}
	const bookmark = layout.bookmarks.find(
		(item) => item._id === operation.bookmarkId,
	);
	if (!bookmark) return invalidLayoutOperation("missing-item");
	const sourceZone = padZoneForBookmark(bookmark);
	const source = layout.bookmarks.filter(
		(item) =>
			padZoneForBookmark(item) === sourceZone && item._id !== bookmark._id,
	);
	const target =
		sourceZone === operation.targetZone
			? source
			: layout.bookmarks.filter(
					(item) => padZoneForBookmark(item) === operation.targetZone,
				);
	const targetIndex = clampInsertionIndex(operation.targetIndex, target.length);
	target.splice(targetIndex, 0, {
		...bookmark,
		tags: [operation.targetZone],
	});
	const affectedZones = [...new Set([sourceZone, operation.targetZone])];
	const byId = new Map(layout.bookmarks.map((item) => [item._id, item]));
	for (const zone of affectedZones) {
		const items = zone === operation.targetZone ? target : source;
		for (const [position, item] of items.entries()) {
			byId.set(item._id, {
				...item,
				tags: [zone],
				padPosition: position,
				projects: (item.projects || []).map((membership) => ({
					...membership,
				})),
			});
		}
	}
	const next = sortLayout({
		...layout,
		bookmarks: [...byId.values()],
	});
	return { ok: true, layout: next, affectedZones };
}

function applyProjectPlacement(layout, operation) {
	const bookmark = layout.bookmarks.find(
		(item) => item._id === operation.bookmarkId,
	);
	if (!bookmark) return invalidLayoutOperation("missing-item");
	if (
		!layout.projects.some(
			(project) => project._id === operation.targetProjectId,
		)
	) {
		return invalidLayoutOperation("missing-target");
	}
	if (
		operation.sourceProjectId !== undefined &&
		!bookmark.projects.some(
			(membership) => membership.projectId === operation.sourceProjectId,
		)
	) {
		return invalidLayoutOperation("missing-source");
	}
	const entries = layout.bookmarks
		.flatMap((item) => {
			const membership = item.projects.find(
				(candidate) => candidate.projectId === operation.targetProjectId,
			);
			return membership ? [{ bookmark: item, membership }] : [];
		})
		.sort(compareProjectMembershipEntries)
		.filter((entry) => entry.bookmark._id !== bookmark._id);
	const existingMembership = bookmark.projects.find(
		(membership) => membership.projectId === operation.targetProjectId,
	);
	entries.splice(
		clampInsertionIndex(operation.targetIndex, entries.length),
		0,
		{
			bookmark,
			membership: existingMembership || {
				projectId: operation.targetProjectId,
			},
		},
	);
	const replacements = new Map();
	for (const [position, entry] of entries.entries()) {
		const nextMembership = { ...entry.membership, position };
		const projects = entry.bookmark.projects.some(
			(item) => item.projectId === operation.targetProjectId,
		)
			? entry.bookmark.projects.map((item) =>
					item.projectId === operation.targetProjectId
						? nextMembership
						: { ...item },
				)
			: [
					...entry.bookmark.projects.map((item) => ({ ...item })),
					nextMembership,
				];
		replacements.set(entry.bookmark._id, {
			...entry.bookmark,
			projects,
		});
	}
	let nextBookmarks = layout.bookmarks.map(
		(item) =>
			replacements.get(item._id) || {
				...item,
				projects: item.projects.map((membership) => ({ ...membership })),
			},
	);
	const affectedZones = [];
	if (
		operation.sourceProjectId !== undefined &&
		operation.sourceProjectId !== operation.targetProjectId
	) {
		nextBookmarks = compactProjectMemberships(
			nextBookmarks,
			operation.sourceProjectId,
		);
		affectedZones.push(`project:${operation.sourceProjectId}`);
	}
	affectedZones.push(`project:${operation.targetProjectId}`);
	const next = sortLayout({
		...layout,
		bookmarks: nextBookmarks,
	});
	return { ok: true, layout: next, affectedZones };
}

function applyProjectMove(layout, operation) {
	const sourceIndex = layout.projects.findIndex(
		(project) => project._id === operation.projectId,
	);
	if (sourceIndex < 0) return invalidLayoutOperation("missing-item");
	const projects = removeAndInsert(
		layout.projects,
		sourceIndex,
		operation.targetIndex,
	).map((project, position) => ({ ...project, position }));
	return {
		ok: true,
		layout: { ...layout, projects },
		affectedZones: ["projects"],
	};
}

function dependsOn(candidate, failed, reason) {
	if (reason === "missing-target") {
		return (
			removeDependentOperations([candidate], {
				projectId: failed.targetProjectId,
			}).length === 0
		);
	}
	if (failed.kind === "moveProject") {
		if (reason === "missing-item") {
			return (
				removeDependentOperations([candidate], {
					projectId: failed.projectId,
				}).length === 0
			);
		}
		return (
			candidate.kind === "moveProject" &&
			candidate.projectId === failed.projectId
		);
	}
	return candidate.bookmarkId === failed.bookmarkId;
}

function invalidLayoutOperation(reason) {
	return { ok: false, reason };
}

function clampInsertionIndex(index, length) {
	if (!Number.isFinite(index)) return 0;
	return Math.max(0, Math.min(Math.trunc(index), length));
}

function displayZone(zone) {
	if (zone === "top") return "Top";
	if (zone === "pinned") return "Pinned";
	if (zone === "projects") return "Projects";
	return String(zone || "").replace(/^project:/, "");
}
