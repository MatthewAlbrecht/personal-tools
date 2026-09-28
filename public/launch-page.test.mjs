import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import { inferLegacyLayout } from "./launch-model.mjs";

const html = await readFile(new URL("./launch.html", import.meta.url), "utf8");

function classicScript() {
	const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
	assert.ok(match, "expected classic launch script");
	return match[1];
}

function functionBlock(source, startName, endName) {
	const start = source.indexOf(`function ${startName}`);
	const end = source.indexOf(`function ${endName}`, start);
	assert.notEqual(start, -1, `expected ${startName}`);
	assert.notEqual(end, -1, `expected ${endName}`);
	return source.slice(start, end);
}

function exactFunction(source, name) {
	const start = source.indexOf(`function ${name}`);
	assert.notEqual(start, -1, `expected ${name}`);
	const bodyStart = source.indexOf("{", start);
	let depth = 0;
	for (let index = bodyStart; index < source.length; index += 1) {
		if (source[index] === "{") depth += 1;
		if (source[index] === "}") depth -= 1;
		if (depth === 0) return source.slice(start, index + 1);
	}
	throw new Error(`unterminated function ${name}`);
}

function statusStubs() {
	const element = {
		textContent: "",
		setAttribute() {},
		removeAttribute() {},
		querySelectorAll: () => [],
	};
	return {
		document: {
			getElementById: () => element,
			querySelector: () => null,
			querySelectorAll: () => [],
		},
		navigator: { onLine: true },
		pendingOperations: [],
		layoutStoreFailed: false,
		SAVING_STATUS: "Saving order…",
		OFFLINE_STATUS: "You’re offline. Reconnect, then try the move again.",
		UNSAVED_STATUS: "Couldn’t save that move. Your previous order is restored.",
		CSS: { escape: (value) => String(value) },
	};
}

function memoryStorage(seed = {}) {
	const data = { ...seed };
	const writes = [];
	return {
		writes,
		getItem(key) {
			return Object.hasOwn(data, key) ? data[key] : null;
		},
		setItem(key, value) {
			data[key] = String(value);
			writes.push([key, JSON.parse(value)]);
		},
	};
}

test("the launcher has no persistent bookmark form", () => {
	assert.doesNotMatch(html, /id="add"/);
	assert.doesNotMatch(html, /id="add-button"/);
});

test("bookmark tiles and rows open their menu on right click", () => {
	assert.match(html, /addEventListener\("contextmenu"/);
	assert.match(html, /openMenu\(bookmark,/);
	assert.doesNotMatch(html, /menuButton\(bookmark\)/);
	assert.match(html, /projectMenuButton\(project, heading\)/);
});

test("canonical sortable nodes expose stable identities and positions", () => {
	assert.match(html, /dataset\.sortKind = "bookmark"/);
	assert.match(html, /dataset\.sortKind = "project"/);
	assert.match(html, /dataset\.sortId = bookmark\._id/);
	assert.match(html, /dataset\.bookmarkId = bookmark\._id/);
	assert.match(html, /dataset\.sortId = project\._id/);
	assert.match(html, /dataset\.projectId = project\._id/);
	assert.match(html, /dragHandle\([^)]*,\s*\{\s*sortKind:/);
	assert.match(html, /dataset\.zone = "top"/);
	assert.match(html, /dataset\.zone = "pinned"/);
	assert.match(html, /dataset\.position = String\(position\)/);
	assert.match(html, /dataset\.dropList = "bookmarks"/);
	assert.match(html, /dataset\.dropList = "projects"/);
	assert.match(html, /dataset\.dropZone = `project:/);
	assert.match(html, /className = "project-gap"/);
});

test("sortable handles are named buttons with reserved geometry", () => {
	assert.match(html, /function dragHandle\(label, identity\)/);
	assert.match(html, /button\.dataset\.dragHandle = ""/);
	assert.match(
		html,
		/button\.setAttribute\("aria-label", `Move \$\{label\}`\)/,
	);
	assert.match(
		html,
		/button\.setAttribute\("aria-describedby", instruction\.id\)/,
	);
	assert.match(html, /instruction\.className = "visually-hidden"/);
	assert.match(html, /Press Space or Enter to pick up\./);
	assert.doesNotMatch(html, /aria-grabbed|aria-dropeffect/);
	assert.match(
		html,
		/\.tile-wrap > \.drag-handle[\s\S]*width: 16px[\s\S]*height: 16px/,
	);
	assert.match(
		html,
		/\.row > \.drag-handle[\s\S]*width: 16px[\s\S]*height: 24px/,
	);
	assert.match(
		html,
		/\.project-head > \.drag-handle[\s\S]*width: 24px[\s\S]*height: 24px/,
	);
	assert.match(html, /\.drag-handle::before[\s\S]*inset: -4px/);
	assert.match(html, /\.drag-handle \{[\s\S]*touch-action: pan-y/);
	assert.match(
		html,
		/\.row > \.drag-handle::before[\s\S]*right: -4px[\s\S]*left: -4px/,
	);
	assert.match(
		html,
		/\.tile-wrap > \.drag-handle::before\s*\{[^}]*top: -2px;[^}]*right: 0;[^}]*bottom: 0;[^}]*left: -2px;/,
	);
	assert.match(html, /dragHandle\(`\$\{project\.name\} project`/);
	assert.doesNotMatch(html, /\.draggable\s*=|setAttribute\("draggable"/);
});

test("every top bookmark has a canonical sortable tile while repeated hosts retain popovers", () => {
	assert.match(html, /groupBySite\(tops\)/);
	assert.match(
		html,
		/const groupsByBookmarkId = new Map\([\s\S]*group\.map\(\(bookmark\) => \[bookmark\._id, group\]\)[\s\S]*for \(const \[position, bookmark\] of tops\.entries\(\)\)[\s\S]*groupsByBookmarkId\.get\(bookmark\._id\)[\s\S]*group\.length === 1[\s\S]*tile\(bookmark, position\)[\s\S]*siteTile\(group, bookmark, position\)/,
	);
	assert.doesNotMatch(
		html,
		/for \(const group of groupBySite\(tops\)\)\s*\{\s*for \(const bookmark of group\)/,
	);
	assert.match(html, /function siteTile\(group, bookmark, position\)/);
	const siteTileBlock = functionBlock(
		classicScript(),
		"siteTile(",
		"openPopover(",
	);
	assert.match(siteTileBlock, /dataset\.sortKind = "bookmark"/);
	assert.match(siteTileBlock, /dataset\.sortId = bookmark\._id/);
	assert.match(siteTileBlock, /dataset\.bookmarkId = bookmark\._id/);
	assert.match(siteTileBlock, /dataset\.zone = "top"/);
	assert.match(siteTileBlock, /dataset\.position = String\(position\)/);
	assert.match(siteTileBlock, /dragHandle\(bookmark\.title/);
	assert.match(siteTileBlock, /openPopover\(group,/);
	const popoverBlock = functionBlock(
		classicScript(),
		"openPopover(",
		"closePopover(",
	);
	assert.match(popoverBlock, /className = "choice"/);
	assert.match(popoverBlock, /watchHover\(cell, bookmark\._id\)/);
	assert.doesNotMatch(popoverBlock, /dragHandle|sortKind|sortId|bookmarkId/);
});

test("host popovers preserve the selected bookmark keyboard target", () => {
	const popoverBlock = functionBlock(
		classicScript(),
		"openPopover(",
		"closePopover(",
	);
	assert.match(popoverBlock, /cell\.dataset\.id = bookmark\._id/);
	assert.match(popoverBlock, /watchHover\(cell, bookmark\._id\)/);
	assert.match(popoverBlock, /assignIfAdding\(event, bookmark\)/);
});

test("DnD enhancement is requested only after the synchronous first paint", () => {
	const firstRender = html.indexOf(
		"render(bookmarks);\n\t\t\trenderProjects();",
	);
	const scheduler = html.indexOf("scheduleLaunchDnd();");
	const importRequest = html.indexOf('import("./launch-dnd.mjs")');
	assert.notEqual(firstRender, -1);
	assert.ok(scheduler > firstRender);
	assert.ok(importRequest > scheduler);
	const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
	assert.doesNotMatch(head, /launch-dnd|modulepreload/);
});

function runLoadLaunchDnd({
	storage = {},
	url = "https://x.test/launch.html",
}) {
	const source = exactFunction(classicScript(), "loadLaunchDnd").replace(
		'import("./launch-dnd.mjs")',
		"importLaunchDnd()",
	);
	let imports = 0;
	const context = vm.createContext({
		URL,
		window: { location: { href: url } },
		localStorage:
			storage === null
				? {
						getItem() {
							throw new Error("storage blocked");
						},
					}
				: memoryStorage(storage),
		importLaunchDnd() {
			imports += 1;
			return new Promise(() => {});
		},
	});
	vm.runInContext(`${source}\nloadLaunchDnd();`, context);
	return imports;
}

test("DnD enhancement is on by default and needs no opt-in flag", () => {
	assert.equal(runLoadLaunchDnd({}), 1);
	assert.equal(runLoadLaunchDnd({ storage: null }), 1);
});

test("prior local opt-in keeps enhancement on without gating it", () => {
	assert.equal(runLoadLaunchDnd({ storage: { "launch-dnd-enabled": "1" } }), 1);
	assert.equal(runLoadLaunchDnd({ storage: { "launch-dnd-enabled": "0" } }), 1);
});

test("explicit query and local kill switches prevent default-on enhancement", () => {
	for (const scenario of [
		{ url: "https://x.test/launch.html?launch-dnd=0" },
		{ storage: { "launch-dnd-disabled": "1" } },
		{
			storage: { "launch-dnd-enabled": "1", "launch-dnd-disabled": "1" },
		},
		{
			storage: { "launch-dnd-enabled": "1" },
			url: "https://x.test/launch.html?launch-dnd=0",
		},
		{ storage: null, url: "https://x.test/launch.html?launch-dnd=0" },
	]) {
		assert.equal(runLoadLaunchDnd(scenario), 0, JSON.stringify(scenario));
	}
	assert.equal(
		runLoadLaunchDnd({ storage: { "launch-dnd-disabled": "0" } }),
		1,
	);
	assert.equal(
		runLoadLaunchDnd({ url: "https://x.test/launch.html?launch-dnd=1" }),
		1,
	);
});

test("DnD scheduling has timeout fallback, failure safety, and kill switches", () => {
	const scheduleBlock = functionBlock(
		classicScript(),
		"scheduleLaunchDnd(",
		"loadInitialLayout(",
	);
	const callbackStart = scheduleBlock.indexOf("function loadLaunchDnd()");
	assert.notEqual(callbackStart, -1);
	const beforeCallback = scheduleBlock.slice(0, callbackStart);
	const callback = scheduleBlock.slice(callbackStart);
	assert.doesNotMatch(
		beforeCallback,
		/launch-dnd-enabled|launch-dnd-disabled|searchParams/,
	);
	assert.doesNotMatch(callback, /launch-dnd-enabled/);
	assert.match(
		callback,
		/localStorage\.getItem\("launch-dnd-disabled"\) === "1"/,
	);
	assert.match(callback, /searchParams\.get\("launch-dnd"\) === "0"/);
	assert.match(html, /requestAnimationFrame\)\s*window\.requestAnimationFrame/);
	assert.match(html, /window\.setTimeout\(loadLaunchDnd, 0\)/);
	assert.match(html, /\.catch\(\(\) => \{\s*\/\* enhancement is optional/);
	assert.match(html, /window\.launchDndController = launchDndController/);
});

test("delegated DnD key handling runs before document shortcuts", () => {
	const dndImport = html.indexOf('import("./launch-dnd.mjs")');
	const shortcutHandler = html.indexOf('document.addEventListener("keydown"');
	assert.ok(shortcutHandler < dndImport);
	assert.match(
		html,
		/pad:\s*document\.getElementById\("pad"\)[\s\S]*projects:\s*document\.getElementById\("projects"\)/,
	);
	assert.match(
		html,
		/<main class="column" id="pad" tabindex="-1" aria-label="Pad">/,
	);
});

test("page centralizes pickup conflicts and cancels before opening interactions", () => {
	const source = classicScript();
	const blocker = functionBlock(
		source,
		"isPickupBlocked(",
		"cancelDragForInteraction(",
	);
	assert.match(
		blocker,
		/menu \|\| popover \|\| addDialog \|\| addingProjectId/,
	);
	assert.match(blocker, /document\.activeElement instanceof HTMLInputElement/);
	assert.match(
		blocker,
		/document\.activeElement instanceof HTMLTextAreaElement/,
	);
	assert.match(source, /initializeLaunchDnd\(\{[\s\S]*isPickupBlocked,/);
	for (const functionName of [
		"openMenu(",
		"openProjectMenu(",
		"openGroupPicker(",
		"openEnvironmentPicker(",
		"openAddLinkDialog(",
		"startRename(",
		"startUrlEdit(",
		"startAddProject(",
	]) {
		const start = source.indexOf(`function ${functionName}`);
		assert.notEqual(start, -1, functionName);
		assert.match(
			source.slice(start, source.indexOf("\n\t\t\t}", start) + 6),
			/cancelDragForInteraction\(\)/,
			functionName,
		);
	}
	assert.match(
		source,
		/addingProjectId = addingProjectId === project\._id \? null : project\._id;\s*cancelDragForInteraction\(\)/,
	);
});

test("each concrete interaction mode blocks pickup in an executable DOM", () => {
	const { document, window } = parseHTML(`
		<main id="pad"><input id="rename"><textarea id="notes"></textarea></main>
		<aside id="projects"></aside>
	`);
	Object.defineProperty(document, "activeElement", {
		configurable: true,
		writable: true,
		value: document.body,
	});
	const source = classicScript();
	const context = vm.createContext({
		document,
		HTMLInputElement: window.HTMLInputElement,
		HTMLTextAreaElement: window.HTMLTextAreaElement,
		menu: null,
		popover: null,
		addDialog: null,
		addingProjectId: null,
		launchDndController: null,
	});
	vm.runInContext(
		`${exactFunction(source, "isPickupBlocked()")}
		${exactFunction(source, "cancelDragForInteraction()")}`,
		context,
	);

	for (const [name, apply] of [
		[
			"bookmark menu",
			() => {
				context.menu = document.createElement("div");
			},
		],
		[
			"project menu",
			() => {
				context.menu = document.createElement("div");
			},
		],
		[
			"project picker",
			() => {
				context.popover = document.createElement("div");
			},
		],
		[
			"environment picker",
			() => {
				context.popover = document.createElement("div");
				context.popover.dataset.kind = "environment";
			},
		],
		[
			"add dialog",
			() => {
				context.addDialog = document.createElement("div");
			},
		],
		[
			"project add mode",
			() => {
				context.addingProjectId = "p1";
			},
		],
		[
			"rename input",
			() => {
				document.activeElement = document.getElementById("rename");
			},
		],
		[
			"textarea input",
			() => {
				document.activeElement = document.getElementById("notes");
			},
		],
	]) {
		context.menu = null;
		context.popover = null;
		context.addDialog = null;
		context.addingProjectId = null;
		document.activeElement = document.body;
		apply();
		assert.equal(vm.runInContext("isPickupBlocked()", context), true, name);
	}

	let cancellations = 0;
	context.launchDndController = {
		cancel() {
			cancellations += 1;
		},
	};
	vm.runInContext("cancelDragForInteraction()", context);
	assert.equal(cancellations, 1);
});

test("reduced-motion CSS removes drag transitions and animation", () => {
	assert.match(
		html,
		/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.launch-drag-overlay[\s\S]*transition:\s*none[\s\S]*animation:\s*none/,
	);
});

test("existing shortcut and popover keys remain executable", () => {
	const source = classicScript();
	const start = source.indexOf(
		'document.addEventListener("keydown", (event) => {',
	);
	const end = source.indexOf("\n\t\t\t});", start);
	assert.notEqual(start, -1);
	assert.notEqual(end, -1);
	const statement = source.slice(start, end + "\n\t\t\t});".length);
	const calls = [];
	let handler = null;
	const active = { dataset: { projectId: "p1" } };
	const context = vm.createContext({
		HTMLInputElement: class HTMLInputElement {},
		HTMLTextAreaElement: class HTMLTextAreaElement {},
		addDialog: null,
		addingProjectId: null,
		bookmarks: [{ _id: "b1" }],
		closeAddLinkDialog() {},
		closeMenu() {},
		closePopover() {
			calls.push("close-popover");
		},
		document: {
			addEventListener(_type, callback) {
				handler = callback;
			},
			querySelector() {
				return active;
			},
		},
		hoveredId: "b1",
		keyboardTargetId: null,
		menu: null,
		openAddLinkDialog() {
			calls.push("c");
		},
		openEnvironmentPicker() {
			calls.push("e");
		},
		openGroupPicker() {
			calls.push("g");
		},
		popover: null,
		renderProjects() {},
		startRename() {
			calls.push("a");
		},
		startUrlEdit() {
			calls.push("l");
		},
		window: {
			launchModel: {
				environmentForShortcut(key) {
					return key === "p" ? "prod" : undefined;
				},
				resolveKeyboardTargetId() {
					return "b1";
				},
			},
		},
		applyProjectEnvironment() {
			calls.push("p");
		},
	});
	vm.runInContext(statement, context);

	for (const key of ["a", "l", "g", "e", "c"]) handler(shortcutEvent(key));
	context.popover = {
		dataset: { kind: "environment", bookmarkId: "b1", projectId: "p1" },
	};
	handler(shortcutEvent("p"));
	assert.deepEqual(calls, ["a", "l", "g", "e", "c", "p", "close-popover"]);
});

test("every render entry point uses centralized non-recursive controller hooks", () => {
	const renderLayout = functionBlock(
		classicScript(),
		"renderLayout(",
		"parseTags(",
	);
	assert.match(renderLayout, /withRenderHooks\(\(\) => \{/);
	assert.match(
		renderLayout,
		/renderPadContents\(bookmarks\);\s*renderProjectsContents\(\)/,
	);
	assert.doesNotMatch(
		renderLayout,
		/\brender\(bookmarks\)|\brenderProjects\(\)/,
	);

	const renderPad = functionBlock(
		classicScript(),
		"render(items)",
		"renderPadContents(",
	);
	assert.match(
		renderPad,
		/withRenderHooks\(\(\) => renderPadContents\(items\)\)/,
	);
	const renderProjects = functionBlock(
		classicScript(),
		"renderProjects()",
		"renderProjectsContents(",
	);
	assert.match(
		renderProjects,
		/withRenderHooks\(\(\) => renderProjectsContents\(\)\)/,
	);

	const hooks = functionBlock(
		classicScript(),
		"withRenderHooks(",
		"renderLayout(",
	);
	assert.match(hooks, /controller\?\.beforeRender\(\)/);
	assert.match(hooks, /try \{\s*callback\(\)/);
	assert.match(hooks, /finally \{\s*controller\?\.afterRender\(\)/);
});

test("empty drop rails, live announcements, and persistent status exist", () => {
	assert.match(html, /className = "empty-drop-rail"/);
	assert.match(html, /className = "empty-project-slot"/);
	assert.doesNotMatch(html, /id="launch-dnd-instructions"/);
	assert.match(html, /instruction\.id = `launch-dnd-instructions-\$\{/);
	assert.match(
		html,
		/id="launch-dnd-live"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
	);
	assert.match(html, /id="status-region"/);
	assert.match(html, /id="dismiss-status"/);
	assert.match(html, /\.visually-hidden/);
});

test("project insertion gaps stay a crisp rule that never takes pointer events", () => {
	assert.match(
		html,
		/\.project-gap\s*\{[^}]*position:\s*relative[^}]*height:\s*2px[^}]*margin:\s*-1px 0[^}]*pointer-events:\s*none/s,
	);
	assert.doesNotMatch(html, /\.project-gap::before/);
	assert.match(html, /\.launch-drop-rule\s*\{[^}]*height:\s*2px/s);
});

test("drag handles expose programmatic focus, not only focus-visible", () => {
	assert.match(
		html,
		/\.drag-handle:hover,\s*\.drag-handle:focus\s*\{[^}]*opacity:\s*1/s,
	);
	assert.match(
		html,
		/\.drag-handle:focus\s*\{[^}]*outline:\s*2px solid var\(--ink\)/s,
	);
	assert.doesNotMatch(html, /\.drag-handle:focus-visible/);
});

test("the browser Convex client matches the installed SDK major and minor", async () => {
	const manifest = JSON.parse(
		await readFile(new URL("../package.json", import.meta.url), "utf8"),
	);
	const installed = manifest.dependencies.convex.replace(/^[^\d]*/, "");
	const imported = html.match(
		/https:\/\/esm\.sh\/convex@([\d.]+)\/browser/,
	)?.[1];
	assert.equal(imported, installed);
});

test("project links expose an environment picker via E and menu", () => {
	assert.match(html, /event\.key === "e"/);
	assert.match(html, /openEnvironmentPicker/);
	assert.match(html, /env-prod/);
	assert.match(html, /env-local/);
	assert.match(html, /launch:setProjectEnvironment/);
});

test("one atomic snapshot synchronously paints Pad and projects", () => {
	assert.match(html, /LAYOUT_STORAGE_KEY\s*=\s*"launch-layout-v2"/);
	assert.match(html, /PROJECTS_STORAGE_KEY\s*=\s*"launch-projects"/);
	assert.match(html, /const initialLayout = loadInitialLayout\(\)/);
	assert.match(html, /let confirmed = initialLayout/);
	assert.match(html, /let pendingOperations = \[\]/);
	assert.match(html, /let view = confirmed/);
	assert.match(html, /render\(bookmarks\);\s*renderProjects\(\)/);
	assert.doesNotMatch(html, /localStorage\.setItem\(STORAGE_KEY/);
	assert.doesNotMatch(html, /localStorage\.setItem\(PROJECTS_STORAGE_KEY/);
});

test("malformed v2 executes legacy fallback with model-equivalent ordering", () => {
	const source = classicScript();
	const storage = memoryStorage({
		"launch-layout-v2": "{broken",
		"launch-bookmarks": JSON.stringify([
			{
				_id: "newer",
				_creationTime: 20,
				tags: ["top"],
				padPosition: 0,
				projects: [{ projectId: "p1", position: 1 }],
			},
			{
				_id: "older",
				_creationTime: 10,
				tags: ["top", "pinned"],
				padPosition: 1,
				projects: [{ projectId: "p1", position: 0 }],
			},
		]),
		"launch-projects": JSON.stringify([
			{ _id: "later", createdAt: 20, position: 0 },
			{ _id: "p1", createdAt: 10, position: 1 },
		]),
	});
	const context = vm.createContext({
		localStorage: storage,
		STORAGE_KEY: "launch-bookmarks",
		PROJECTS_STORAGE_KEY: "launch-projects",
		LAYOUT_STORAGE_KEY: "launch-layout-v2",
	});
	vm.runInContext(
		`${functionBlock(source, "loadInitialLayout()", "saveLayout(")}
		result = loadInitialLayout();`,
		context,
	);

	assert.deepEqual(
		JSON.parse(JSON.stringify(context.result)),
		inferLegacyLayout(
			JSON.parse(storage.getItem("launch-bookmarks")),
			JSON.parse(storage.getItem("launch-projects")),
		),
	);
	assert.equal(storage.writes.length, 0);
});

test("page state functions synchronously cache optimistic view and confirmed rollback", () => {
	const source = classicScript();
	const storage = memoryStorage();
	const renders = [];
	const context = vm.createContext({
		...statusStubs(),
		localStorage: storage,
		LAYOUT_STORAGE_KEY: "launch-layout-v2",
		bufferedDropOperations: [],
		confirmed: { version: 4, bookmarks: [{ _id: "a" }], projects: [] },
		view: null,
		bookmarks: [],
		window: { launchProjects: [] },
		renderPadContents(items) {
			renders.push(items.map((item) => item._id));
		},
		renderProjectsContents() {},
		Date: { now: () => 123 },
	});
	vm.runInContext(
		`${functionBlock(source, "saveLayout(", "parseTags(")}
		setLayoutView({ version: 4, bookmarks: [{ _id: "b" }], projects: [] }, true);
		optimistic = view;
		rollbackLayout();
		rolledBack = view;`,
		context,
	);

	assert.deepEqual(
		Array.from(context.optimistic.bookmarks, (item) => item._id),
		["b"],
	);
	assert.deepEqual(
		Array.from(context.rolledBack.bookmarks, (item) => item._id),
		["a"],
	);
	assert.deepEqual(
		storage.writes.map(([, snapshot]) => ({
			ids: snapshot.bookmarks.map((item) => item._id),
			hasOperations: "pendingOperations" in snapshot,
		})),
		[
			{ ids: ["b"], hasOperations: false },
			{ ids: ["a"], hasOperations: false },
		],
	);
	assert.deepEqual(JSON.parse(JSON.stringify(renders)), [["b"], ["a"]]);
});

test("rollback requests origin focus before rendering authority", () => {
	const rollback = functionBlock(
		classicScript(),
		"rollbackLayout()",
		"setLiveLayout(",
	);
	const calls = [];
	const context = vm.createContext({
		confirmed: { version: 1, bookmarks: [], projects: [] },
		setLayoutView() {
			calls.push("render");
		},
		window: {
			launchDndController: {
				restoreFocusToOrigin() {
					calls.push("origin");
				},
			},
		},
	});
	vm.runInContext(`${rollback} rollbackLayout();`, context);
	assert.deepEqual(calls, ["origin", "render"]);
});

test("production DnD wiring previews live state and commits valid drops synchronously", () => {
	const scheduleBlock = functionBlock(
		classicScript(),
		"scheduleLaunchDnd(",
		"loadInitialLayout(",
	);
	assert.match(scheduleBlock, /getLayout\(\)\s*\{\s*return view;\s*\}/);
	assert.match(scheduleBlock, /onPreview\([^)]*\)\s*\{[\s\S]*previewDndLayout/);
	assert.match(
		scheduleBlock,
		/onDrop\(operation\)\s*\{[\s\S]*commitDndDrop\(operation\)/,
	);
	assert.match(scheduleBlock, /onCancel\(\)\s*\{[\s\S]*cancelDndPreview/);

	const source = classicScript();
	const storage = memoryStorage();
	const renders = [];
	const original = {
		version: 3,
		bookmarks: [
			{ _id: "a", tags: ["top"], padPosition: 0, projects: [] },
			{ _id: "b", tags: ["top"], padPosition: 1, projects: [] },
		],
		projects: [],
	};
	const context = vm.createContext({
		...statusStubs(),
		localStorage: storage,
		LAYOUT_STORAGE_KEY: "launch-layout-v2",
		view: original,
		bookmarks: original.bookmarks,
		dragPreviewBase: null,
		layoutStore: null,
		bufferedDropOperations: [],
		window: {
			launchProjects: [],
			launchModel: {
				pendingLayoutMarkers: () => ({ items: [], zones: [] }),
				applyLayoutOperation(layout, operation) {
					if (operation?.kind !== "movePadLink") {
						return { ok: false, reason: "unsupported-operation" };
					}
					return {
						ok: true,
						layout: {
							...layout,
							bookmarks: [...layout.bookmarks].reverse(),
						},
					};
				},
			},
		},
		renderPadContents(items) {
			renders.push(items.map((item) => item._id));
		},
		renderProjectsContents() {},
		Date: { now: () => 123 },
	});
	vm.runInContext(
		`${functionBlock(source, "saveLayout(", "parseTags(")}
		${functionBlock(source, "setLiveLayout(", "parseTags(")}
		previewDndLayout({ ok: true, layout: { ...view, bookmarks: [...view.bookmarks].reverse() } });
		previewIds = bookmarks.map((item) => item._id);
		previewWrites = localStorage.writes.length;
		valid = commitDndDrop({ kind: "movePadLink" });
		committedIds = bookmarks.map((item) => item._id);
		invalid = commitDndDrop({ kind: "unsupported" });
		afterInvalidIds = bookmarks.map((item) => item._id);`,
		context,
	);

	assert.deepEqual(Array.from(context.previewIds), ["b", "a"]);
	assert.equal(context.previewWrites, 0);
	assert.equal(context.valid, true);
	assert.deepEqual(Array.from(context.committedIds), ["b", "a"]);
	assert.equal(context.invalid, false);
	assert.deepEqual(Array.from(context.afterInvalidIds), ["b", "a"]);
	assert.equal(storage.writes.length, 0);
	assert.deepEqual(JSON.parse(JSON.stringify(context.bufferedDropOperations)), [
		{ kind: "movePadLink" },
	]);
	assert.deepEqual(renders, [["b", "a"]]);
});

test("drops before the store exists stay in memory, then enqueue in order", () => {
	const source = classicScript();
	const storage = memoryStorage();
	const renders = [];
	const layout = {
		version: 3,
		bookmarks: [
			{ _id: "a", tags: ["top"], padPosition: 0, projects: [] },
			{ _id: "b", tags: ["top"], padPosition: 1, projects: [] },
		],
		projects: [],
	};
	const context = vm.createContext({
		...statusStubs(),
		localStorage: storage,
		LAYOUT_STORAGE_KEY: "launch-layout-v2",
		view: layout,
		bookmarks: layout.bookmarks,
		dragPreviewBase: null,
		layoutStore: null,
		bufferedDropOperations: [],
		storeDrops: [],
		window: {
			launchProjects: [],
			launchModel: {
				pendingLayoutMarkers: () => ({ items: [], zones: [] }),
				applyLayoutOperation(current) {
					return {
						ok: true,
						layout: { ...current, bookmarks: [...current.bookmarks].reverse() },
					};
				},
			},
		},
		renderPadContents(items) {
			renders.push(items.map((item) => item._id));
		},
		renderProjectsContents() {},
		Date: { now: () => 123 },
	});
	vm.runInContext(
		`${functionBlock(source, "saveLayout(", "parseTags(")}
		commitDndDrop({ kind: "movePadLink", bookmarkId: "a" });
		commitDndDrop({ kind: "movePadLink", bookmarkId: "b" });
		attachLayoutStore({
			drop(operation) {
				storeDrops.push(operation.bookmarkId);
				return { ok: operation.bookmarkId === "a" };
			},
			getView() {
				return { version: 3, bookmarks: [{ _id: "store" }], projects: [] };
			},
		});
		afterAttachIds = bookmarks.map((item) => item._id);
		bufferedAfterAttach = bufferedDropOperations.length;
		commitDndDrop({ kind: "movePadLink", bookmarkId: "c" });`,
		context,
	);

	assert.equal(storage.writes.length, 0);
	assert.deepEqual(Array.from(context.storeDrops), ["a", "b", "c"]);
	assert.equal(context.bufferedAfterAttach, 0);
	assert.deepEqual(Array.from(context.afterAttachIds), ["store"]);
});

test("module wires the store through the buffer with per-operation focus", () => {
	assert.match(
		html,
		/attachLayoutStore\(\s*launchModel\.createLaunchLayoutStore\(\{\s*initialLayout: confirmed,/,
	);
	assert.match(
		html,
		/restoreFocus: \(operation\) =>[\s\S]*restoreFocusToOrigin\([\s\S]*launchModel\.focusIdentityForOperation\(\s*operation,\s*layoutStore\.getView\(\),?\s*\)/,
	);
	assert.doesNotMatch(
		html,
		/layoutStore = launchModel\.createLaunchLayoutStore/,
	);
});

test("client uses one getLayout subscription and saves authoritative snapshots", () => {
	assert.match(html, /client\.onUpdate\(\s*"launch:getLayout"/);
	assert.doesNotMatch(html, /client\.onUpdate\("launch:listProjects"/);
	assert.doesNotMatch(html, /"launch:list",/);
	assert.match(html, /confirmed = next/);
	assert.match(html, /view = confirmed/);
	assert.match(html, /saveLayout\(view\)/);
});

test("pressing c opens an add-link dialog with clipboard and preview", () => {
	assert.match(html, /event\.key === "c"/);
	assert.match(html, /openAddLinkDialog/);
	assert.match(html, /navigator\.clipboard\.readText/);
	assert.match(html, /launchActions:previewLink/);
	assert.match(html, /launch:create/);
});

test("add-link Save closes after create without opening projects", () => {
	assert.match(html, /textContent = "Save"/);
	assert.match(html, /Save & add to projects/);
	const saveHandler = html.match(
		/save\.addEventListener\("click", async \(\) => \{\s*const form = readForm\(\);[\s\S]*?closeAddLinkDialog\(\);\s*\}\);/,
	);
	assert.ok(saveHandler, "expected save click handler");
	assert.match(saveHandler[0], /await createBookmark\(/);
	assert.doesNotMatch(saveHandler[0], /showAddLinkGroupsStep/);
});

test("Save & add to projects advances to project multi-select with last project preselected", () => {
	assert.match(html, /showAddLinkGroupsStep|Add to projects/);
	assert.match(html, /readLastGroupId/);
	assert.match(html, /defaultSelectedGroupIds/);
	assert.match(html, /Save & add to projects/);
	assert.match(
		html,
		/saveAndGroups\.addEventListener\("click"|Save & add to projects[\s\S]*?showAddLinkGroupsStep/,
	);
});

test("confirming add-to-projects applies memberships and updates last-project storage", () => {
	assert.match(html, /writeLastGroupId/);
	assert.match(html, /launch:setProjects/);
	assert.match(html, /Add to projects/);
	assert.match(html, /writeLastGroupId\([\s\S]*localStorage|rememberLastGroup/);
});

test("touched bookmark membership copy consistently says project", () => {
	assert.match(html, /menuItem\("Add to project"/);
	assert.doesNotMatch(html, /Add to group(?:s)?/);
	assert.doesNotMatch(html, /Save & add to groups/);
});

test("environment picker wires keyboard shortcuts for each environment", () => {
	assert.match(html, /environmentForShortcut/);
	assert.match(html, /environmentShortcutLabel/);
	assert.match(html, /dataset\.kind\s*=\s*"environment"/);
	assert.match(html, /launch:setProjectEnvironment/);
});

test("environment picker allows local and does not communicate replacement", () => {
	assert.match(html, /\["local", "Local"\]/);
	assert.doesNotMatch(
		html,
		/(replace|remove|clear|demote).{0,40}(existing|other|previous).{0,20}prod/i,
	);
});

test("open menu or popover pins keyboard target so shortcuts work without hover", () => {
	assert.match(html, /keyboardTargetId/);
	assert.match(html, /pinKeyboardTarget/);
	assert.match(html, /releaseKeyboardTarget/);
	assert.match(html, /resolveKeyboardTargetId/);
	assert.match(html, /pinKeyboardTarget\(bookmark\._id/);
	assert.doesNotMatch(html, /if \(event\.key === "l" && hoveredId\)/);
	assert.match(html, /startUrlEdit\(focusId\)/);
});

function shortcutEvent(key) {
	return {
		altKey: false,
		ctrlKey: false,
		key,
		metaKey: false,
		preventDefault() {},
		target: {},
	};
}

test("bookmark menu offers Reload favicon for that item only", () => {
	assert.match(html, /Reload favicon/);
	assert.match(html, /reloadFavicon\(bookmark\._id\)/);
	assert.match(html, /faviconBust/);
	assert.match(html, /withCacheBust/);
});

const SAVING = "Saving order…";
const OFFLINE = "You’re offline. Reconnect, then try the move again.";
const UNSAVED = "Couldn’t save that move. Your previous order is restored.";

function pageLayout() {
	return {
		version: 3,
		bookmarks: [
			{
				_id: "a",
				_creationTime: 1,
				tags: ["top"],
				padPosition: 0,
				projects: [],
			},
			{
				_id: "b",
				_creationTime: 2,
				tags: ["top"],
				padPosition: 1,
				projects: [],
			},
		],
		projects: [{ _id: "p1", name: "One", position: 0, createdAt: 1 }],
	};
}

function topIds(layout) {
	return layout.bookmarks
		.filter((item) => item.tags[0] === "top")
		.sort((left, right) => left.padPosition - right.padPosition)
		.map((item) => item._id);
}

async function pageContext(overrides = {}) {
	const model = await import("./launch-model.mjs");
	const { document } = parseHTML(`
		<main id="pad"><div id="list"></div>
			<div id="status-region"><p id="status"></p></div>
		</main>
		<aside id="projects"></aside>
	`);
	const renders = [];
	const layout = pageLayout();
	const context = vm.createContext({
		document,
		localStorage: memoryStorage(),
		LAYOUT_STORAGE_KEY: "launch-layout-v2",
		SAVING_STATUS: SAVING,
		OFFLINE_STATUS: OFFLINE,
		UNSAVED_STATUS: UNSAVED,
		CSS: { escape: (value) => String(value) },
		navigator: { onLine: true },
		confirmed: layout,
		view: layout,
		bookmarks: layout.bookmarks,
		pendingOperations: [],
		dragPreviewBase: null,
		layoutStore: null,
		layoutStoreFailed: false,
		bufferedDropOperations: [],
		window: { launchProjects: layout.projects, launchModel: model },
		renderPadContents(items) {
			renders.push(topIds({ bookmarks: items }));
			const list = document.getElementById("list");
			list.replaceChildren();
			const grid = document.createElement("div");
			grid.dataset.dropZone = "top";
			for (const item of items) {
				const node = document.createElement("div");
				node.dataset.sortKind = "bookmark";
				node.dataset.sortId = item._id;
				const handle = document.createElement("button");
				handle.dataset.dragHandle = "";
				handle.dataset.sortKind = "bookmark";
				handle.dataset.sortId = item._id;
				node.append(handle);
				grid.append(node);
			}
			list.append(grid);
		},
		renderProjectsContents() {},
		Date: { now: () => 123 },
		...overrides,
	});
	vm.runInContext(
		functionBlock(classicScript(), "saveLayout(", "parseTags("),
		context,
	);
	return { context, document, renders, model };
}

function pendingIds(document) {
	return [...document.querySelectorAll("[data-pending='true']")].map(
		(element) => element.dataset.sortId || element.dataset.dropZone,
	);
}

test("render hooks derive pending markers only from current pending operations", async () => {
	const { context, document } = await pageContext();
	context.pendingOperations = [
		{
			operationId: "1",
			kind: "movePadLink",
			bookmarkId: "a",
			targetZone: "top",
			targetIndex: 1,
		},
	];
	vm.runInContext("renderLayout()", context);
	assert.deepEqual(pendingIds(document), ["top", "a"]);
	assert.equal(
		document.querySelector("[data-drag-handle][data-pending]"),
		null,
	);

	context.pendingOperations = [];
	vm.runInContext("renderLayout()", context);
	assert.deepEqual(pendingIds(document), []);

	const stale = document.getElementById("projects");
	stale.dataset.pending = "true";
	vm.runInContext(
		"withRenderHooks(() => renderPadContents(bookmarks))",
		context,
	);
	assert.equal(stale.hasAttribute("data-pending"), false);
});

test("pre-store drops immediately show saving or offline status with pending markers", async () => {
	const { context, document } = await pageContext();
	vm.runInContext(
		'commitDndDrop({ kind: "movePadLink", bookmarkId: "a", targetZone: "top", targetIndex: 1 })',
		context,
	);
	assert.equal(document.getElementById("status").textContent, SAVING);
	assert.equal(
		document.getElementById("status-region").hasAttribute("data-persistent"),
		false,
	);
	assert.ok(pendingIds(document).includes("a"));
	assert.equal(context.localStorage.writes.length, 0);

	context.navigator.onLine = false;
	vm.runInContext(
		'commitDndDrop({ kind: "movePadLink", bookmarkId: "b", targetZone: "top", targetIndex: 1 })',
		context,
	);
	assert.equal(document.getElementById("status").textContent, OFFLINE);
	assert.equal(
		document.getElementById("status-region").getAttribute("data-persistent"),
		"true",
	);
	assert.match(
		html,
		/\.status-region\[data-persistent="true"\] \.dismiss-status \{ display: block; \}/,
	);

	vm.runInContext("handleLayoutOnline()", context);
	assert.equal(document.getElementById("status").textContent, SAVING);
	vm.runInContext("handleLayoutOffline()", context);
	assert.equal(document.getElementById("status").textContent, OFFLINE);
});

test("store bootstrap failure restores buffered drops with an explicit unsaved status", async () => {
	const { context, document } = await pageContext();
	vm.runInContext(
		'commitDndDrop({ kind: "movePadLink", bookmarkId: "a", targetZone: "top", targetIndex: 1 })',
		context,
	);
	assert.deepEqual(topIds(context.view), ["b", "a"]);

	vm.runInContext("failLayoutStore()", context);
	assert.deepEqual(topIds(context.view), ["a", "b"]);
	assert.equal(context.bufferedDropOperations.length, 0);
	assert.deepEqual(pendingIds(document), []);
	assert.equal(document.getElementById("status").textContent, UNSAVED);
	assert.equal(
		document.getElementById("status-region").hasAttribute("data-persistent"),
		true,
	);

	const accepted = vm.runInContext(
		'commitDndDrop({ kind: "movePadLink", bookmarkId: "a", targetZone: "top", targetIndex: 1 })',
		context,
	);
	assert.equal(accepted, false);
	assert.deepEqual(topIds(context.view), ["a", "b"]);
	assert.equal(document.getElementById("status").textContent, UNSAVED);
	assert.equal(context.localStorage.writes.length, 0);
});

function dragController(context, events) {
	return {
		active: false,
		isActive() {
			return this.active;
		},
		cancel() {
			events.push("cancel");
			this.active = false;
			context.cancelDndPreview();
		},
		beforeRender() {
			events.push(this.active ? "render-canceled-drag" : "before-render");
			this.active = false;
		},
		afterRender() {},
		restoreFocusToOrigin() {},
	};
}

async function storePageContext() {
	const page = await pageContext();
	const events = [];
	const controller = dragController(page.context, events);
	page.context.window.launchDndController = controller;
	const calls = [];
	const replies = [];
	let id = 0;
	const store = page.model.createLaunchLayoutStore({
		initialLayout: pageLayout(),
		storage: page.context.localStorage,
		createOperationId: () => `operation-${++id}`,
		isOnline: () => true,
		mutate(args) {
			calls.push(args);
			return new Promise((resolve) => replies.push(resolve));
		},
		render: (next, state) => page.context.renderStoreView(next, state),
		setStatus: (message) => page.context.setLayoutStatus(message),
	});
	page.context.attachLayoutStore(store);
	return { ...page, events, controller, calls, replies, store };
}

function startPreview(context, model, operation) {
	context.previewDndLayout(model.applyLayoutOperation(context.view, operation));
}

test("an acknowledgment during a second drag with an unchanged view only refreshes markers", async () => {
	const {
		context,
		document,
		model,
		events,
		controller,
		calls,
		replies,
		renders,
		store,
	} = await storePageContext();
	const first = {
		kind: "movePadLink",
		bookmarkId: "a",
		targetZone: "top",
		targetIndex: 1,
	};
	vm.runInContext(`commitDndDrop(${JSON.stringify(first)})`, context);
	assert.equal(calls.length, 1);
	assert.ok(pendingIds(document).includes("a"));

	controller.active = true;
	const second = {
		kind: "movePadLink",
		bookmarkId: "b",
		targetZone: "top",
		targetIndex: 1,
	};
	startPreview(context, model, second);
	const renderCount = renders.length;
	events.length = 0;
	replies[0]({
		status: "applied",
		operationId: "operation-1",
		...model.applyLayoutOperation(pageLayout(), first).layout,
		version: 4,
	});
	for (let index = 0; index < 12; index += 1) await Promise.resolve();

	assert.deepEqual(events, [], "no cancel or full render mid-drag");
	assert.equal(controller.active, true);
	assert.equal(renders.length, renderCount);
	assert.deepEqual(pendingIds(document), [], "markers reflect confirmation");
	assert.equal(context.confirmed.version, 4);
	assert.deepEqual(topIds(context.view), ["a", "b"], "preview kept");
	assert.equal(document.getElementById("status").textContent, "");

	controller.active = false;
	vm.runInContext(`commitDndDrop(${JSON.stringify(second)})`, context);
	assert.equal(calls.length, 2);
	assert.equal(calls[1].expectedVersion, 4);
	assert.deepEqual({ ...calls[1].operation }, second);
	assert.deepEqual(topIds(context.view), ["a", "b"]);
	assert.deepEqual(topIds(store.getView()), ["a", "b"]);
	assert.ok(pendingIds(document).includes("b"));
});

test("a remote same-zone change during an active drag cancels before rendering authority", async () => {
	const { context, model, events, controller, calls, renders, store } =
		await storePageContext();
	controller.active = true;
	startPreview(context, model, {
		kind: "movePadLink",
		bookmarkId: "a",
		targetZone: "top",
		targetIndex: 1,
	});
	assert.deepEqual(topIds(context.view), ["b", "a"]);
	const renderCount = renders.length;
	const remote = pageLayout();
	remote.version = 5;
	remote.bookmarks.push({
		_id: "c",
		_creationTime: 3,
		tags: ["top"],
		padPosition: -1,
		projects: [],
	});
	store.receiveSnapshot(remote);

	assert.deepEqual(events, ["cancel", "before-render"]);
	assert.equal(controller.active, false);
	assert.equal(renders.length, renderCount + 1);
	assert.deepEqual(renders.at(-1), ["c", "a", "b"]);
	assert.deepEqual(topIds(context.view), ["c", "a", "b"]);
	assert.equal(context.dragPreviewBase, null);
	assert.equal(calls.length, 0);
});

test("remote deletion of the dragged item during an active drag cancels and renders without it", async () => {
	const { context, model, events, controller, calls, renders, store } =
		await storePageContext();
	controller.active = true;
	startPreview(context, model, {
		kind: "movePadLink",
		bookmarkId: "a",
		targetZone: "top",
		targetIndex: 1,
	});
	const remote = pageLayout();
	remote.version = 5;
	remote.bookmarks = remote.bookmarks.filter((item) => item._id !== "a");
	store.receiveSnapshot(remote);

	assert.deepEqual(events, ["cancel", "before-render"]);
	assert.equal(controller.active, false);
	assert.deepEqual(renders.at(-1), ["b"]);
	assert.deepEqual(topIds(context.view), ["b"]);
	assert.equal(context.dragPreviewBase, null);
	assert.equal(calls.length, 0);
});

test("page wires offline/online listeners and module failure handling", () => {
	const source = classicScript();
	assert.match(
		source,
		/window\.addEventListener\("offline", handleLayoutOffline\)/,
	);
	assert.match(
		source,
		/window\.addEventListener\("online", handleLayoutOnline\)/,
	);
	assert.doesNotMatch(source, /deferredStoreRender|flushDeferredStoreRender/);
	assert.match(html, /<script type="module" onerror="failLayoutStore\(\)">/);
	assert.match(html, /render: renderStoreView/);
	assert.match(html, /setStatus: setLayoutStatus/);
	assert.match(
		html,
		/catch \(error\) \{\s*console\.error\([^)]*\);\s*failLayoutStore\(\);/,
	);
	assert.doesNotMatch(
		html,
		/addEventListener\("online", \(\) => layoutStore\.retryOnline\(\)\)/,
	);
});
