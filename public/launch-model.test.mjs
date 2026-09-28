import assert from "node:assert/strict";
import test from "node:test";
import {
	LAST_GROUP_STORAGE_KEY,
	LAYOUT_STORAGE_KEY,
	addProject,
	applyLayoutOperation,
	classifyLayoutMutationError,
	compactPadZone,
	compactProjectMemberships,
	compactProjects,
	defaultSelectedGroupIds,
	displayName,
	environmentForShortcut,
	environmentShortcutLabel,
	extractTitleFromHtml,
	faviconSourceForProjectTile,
	firstProdBookmarkInProject,
	focusIdentityForOperation,
	isLocalUrl,
	layoutAnnouncement,
	looksLikeUrl,
	normalizeLaunchUrl,
	normalizePadTags,
	padZoneForBookmark,
	projectsNewestFirst,
	readLastGroupId,
	readLayoutSnapshot,
	removeAndInsert,
	removeDependentOperations,
	renameInProject,
	renamePad,
	replayLayoutOperations,
	resolveKeyboardTargetId,
	setEnvironment,
	sortLayout,
	stripUtm,
	titleSuggestionFromUrl,
	toggleProject,
	withCacheBust,
	writeLastGroupId,
	writeLayoutSnapshot,
} from "./launch-model.mjs";

function memoryStorage(seed = {}) {
	const data = { ...seed };
	return {
		getItem(key) {
			return Object.hasOwn(data, key) ? data[key] : null;
		},
		setItem(key, value) {
			data[key] = String(value);
		},
	};
}

const bookmark = {
	title: "Local",
	projects: [],
};

test("v2 layout snapshots win over legacy cache and require schema version 2", () => {
	const v2 = {
		schemaVersion: 2,
		layoutVersion: 7,
		bookmarks: [{ _id: "v2", tags: ["top"], projects: [] }],
		projects: [],
		savedAt: 123,
	};
	const storage = memoryStorage({
		[LAYOUT_STORAGE_KEY]: JSON.stringify(v2),
		"launch-bookmarks": JSON.stringify([{ _id: "legacy" }]),
		"launch-projects": JSON.stringify([{ _id: "legacy-project" }]),
	});
	assert.deepEqual(readLayoutSnapshot(storage), {
		source: "v2",
		layout: {
			version: 7,
			bookmarks: v2.bookmarks,
			projects: [],
		},
	});

	const invalid = memoryStorage({
		[LAYOUT_STORAGE_KEY]: JSON.stringify({ ...v2, schemaVersion: 1 }),
	});
	assert.equal(readLayoutSnapshot(invalid).source, "legacy");
});

test("missing or corrupt v2 falls back to both normalized legacy snapshots", () => {
	const storage = memoryStorage({
		[LAYOUT_STORAGE_KEY]: "{broken",
		"launch-bookmarks": JSON.stringify([
			{ _id: "b", _creationTime: 2, tags: ["top", "pinned"], projects: [] },
			{ _id: "a", _creationTime: 1, tags: [], projects: [] },
		]),
		"launch-projects": JSON.stringify([
			{ _id: "p2", name: "Later", createdAt: 2 },
			{ _id: "p1", name: "Earlier", createdAt: 1 },
		]),
	});
	const result = readLayoutSnapshot(storage);
	assert.equal(result.source, "legacy");
	assert.equal(result.layout.version, 0);
	assert.deepEqual(
		result.layout.bookmarks.map((item) => [
			item._id,
			item.tags,
			item.padPosition,
		]),
		[
			["b", ["top"], 0],
			["a", ["pinned"], 0],
		],
	);
	assert.deepEqual(
		result.layout.projects.map((item) => [item._id, item.position]),
		[
			["p1", 0],
			["p2", 1],
		],
	);
});

test("layout writes are atomic, safe, and never persist pending operation state", () => {
	const writes = [];
	const storage = {
		setItem(key, value) {
			writes.push([key, JSON.parse(value)]);
		},
	};
	const layout = {
		version: 9,
		bookmarks: [],
		projects: [],
		pendingOperations: [{ operationId: "never-store" }],
	};
	assert.equal(writeLayoutSnapshot(storage, layout, 456), true);
	assert.equal(writes[0][0], LAYOUT_STORAGE_KEY);
	assert.deepEqual(writes[0][1], {
		schemaVersion: 2,
		layoutVersion: 9,
		bookmarks: [],
		projects: [],
		savedAt: 456,
	});
	assert.equal(
		writeLayoutSnapshot(
			{
				setItem() {
					throw new Error("quota");
				},
			},
			layout,
			456,
		),
		false,
	);
});

test("displayName uses the pad title when the membership has no override", () => {
	assert.equal(displayName(bookmark, { projectId: "p1" }), "Local");
});

test("displayName uses the override when present", () => {
	assert.equal(displayName(bookmark, { projectId: "p1", name: "Dev" }), "Dev");
});

test("addProject appends a membership without a name", () => {
	assert.deepEqual(addProject(bookmark, "p1"), {
		title: "Local",
		projects: [{ projectId: "p1" }],
	});
});

test("addProject leaves an existing membership alone", () => {
	const member = addProject(bookmark, "p1");
	assert.deepEqual(addProject(member, "p1"), member);
});

test("toggleProject adds then removes", () => {
	const added = toggleProject(bookmark, "p1");
	assert.equal(added.projects.length, 1);
	assert.deepEqual(toggleProject(added, "p1").projects, []);
});

test("renamePad updates the title and leaves overrides in place", () => {
	const member = {
		title: "Local",
		projects: [{ projectId: "p1" }, { projectId: "p2", name: "Prod app" }],
	};
	assert.deepEqual(renamePad(member, "Moose local"), {
		title: "Moose local",
		projects: [{ projectId: "p1" }, { projectId: "p2", name: "Prod app" }],
	});
});

test("renameInProject stores an override", () => {
	const member = addProject(bookmark, "p1");
	assert.deepEqual(renameInProject(member, "p1", "Dev"), {
		title: "Local",
		projects: [{ projectId: "p1", name: "Dev" }],
	});
});

test("renameInProject clears the override when the name matches the pad title", () => {
	const named = {
		title: "Local",
		projects: [{ projectId: "p1", name: "Dev" }],
	};
	assert.deepEqual(renameInProject(named, "p1", "Local"), {
		title: "Local",
		projects: [{ projectId: "p1" }],
	});
});

test("stripUtm removes utm query parameters and keeps the rest", () => {
	assert.equal(
		stripUtm("https://example.com/a?utm_source=x&id=1&utm_medium=email#h"),
		"https://example.com/a?id=1#h",
	);
});

test("projectsNewestFirst puts the latest createdAt first", () => {
	const projects = [
		{ _id: "old", createdAt: 1 },
		{ _id: "new", createdAt: 3 },
		{ _id: "mid", createdAt: 2 },
	];
	assert.deepEqual(
		projectsNewestFirst(projects).map((project) => project._id),
		["new", "mid", "old"],
	);
});

test("isLocalUrl detects localhost variants with ports", () => {
	assert.equal(isLocalUrl("http://localhost:1333"), true);
	assert.equal(isLocalUrl("http://127.0.0.1:3000/login"), true);
	assert.equal(isLocalUrl("http://[::1]:8080"), true);
	assert.equal(isLocalUrl("https://example.com"), false);
});

test("setEnvironment assigns and clears a membership environment", () => {
	const member = addProject(bookmark, "p1");
	assert.deepEqual(setEnvironment(member, "p1", "dev").projects, [
		{ projectId: "p1", environment: "dev" },
	]);
	assert.deepEqual(
		setEnvironment(
			{ title: "Local", projects: [{ projectId: "p1", environment: "dev" }] },
			"p1",
			null,
		).projects,
		[{ projectId: "p1" }],
	);
});

test("setEnvironment preserves name when changing environment", () => {
	const named = {
		title: "Local",
		projects: [{ projectId: "p1", name: "Moose", environment: "qa" }],
	};
	assert.deepEqual(setEnvironment(named, "p1", "prod").projects, [
		{ projectId: "p1", name: "Moose", environment: "prod" },
	]);
});

test("assigning any environment changes only the targeted membership", () => {
	for (const environment of ["prod", "qa", "stage", "dev", "local"]) {
		const target = {
			_id: "target",
			title: "Target",
			projects: [{ projectId: "p1" }, { projectId: "p2", environment: "qa" }],
		};
		const existing = {
			_id: "existing",
			title: "Existing",
			projects: [{ projectId: "p1", environment }],
		};

		const updated = setEnvironment(target, "p1", environment);

		assert.equal(updated.projects[0].environment, environment);
		assert.deepEqual(updated.projects[1], target.projects[1]);
		assert.deepEqual(existing.projects, [{ projectId: "p1", environment }]);
	}
});

test("renameInProject preserves environment", () => {
	const named = {
		title: "Local",
		projects: [{ projectId: "p1", environment: "stage" }],
	};
	assert.deepEqual(renameInProject(named, "p1", "Staging").projects, [
		{ projectId: "p1", name: "Staging", environment: "stage" },
	]);
});

test("firstProdBookmarkInProject returns the first matching prod membership", () => {
	const local = {
		_id: "b1",
		url: "http://localhost:3000",
		projects: [{ projectId: "p1", environment: "dev" }],
	};
	const prod = {
		_id: "b2",
		url: "https://app.example.com",
		projects: [{ projectId: "p1", environment: "prod" }],
	};
	const other = {
		_id: "b3",
		url: "https://other.example.com",
		projects: [{ projectId: "p2", environment: "prod" }],
	};
	assert.equal(firstProdBookmarkInProject([local, prod, other], "p1"), prod);
	assert.equal(firstProdBookmarkInProject([local, other], "p1"), null);
});

test("faviconSourceForProjectTile uses prod for local urls in the same project", () => {
	const local = {
		_id: "b1",
		url: "http://localhost:3000",
		projects: [{ projectId: "p1", environment: "dev" }],
	};
	const prod = {
		_id: "b2",
		url: "https://app.example.com",
		projects: [{ projectId: "p1", environment: "prod" }],
	};
	assert.equal(
		faviconSourceForProjectTile(local, "p1", [local, prod]),
		"https://app.example.com",
	);
	assert.equal(
		faviconSourceForProjectTile(local, "p1", [local]),
		"http://localhost:3000",
	);
	assert.equal(
		faviconSourceForProjectTile(prod, "p1", [local, prod]),
		"https://app.example.com",
	);
});

test("looksLikeUrl accepts pasted hosts and localhost", () => {
	assert.equal(looksLikeUrl("https://example.com/a"), true);
	assert.equal(looksLikeUrl("example.com"), true);
	assert.equal(looksLikeUrl("localhost:1333/launch.html"), true);
	assert.equal(looksLikeUrl("not a url"), false);
});

test("normalizeLaunchUrl adds https and strips utm params", () => {
	assert.equal(
		normalizeLaunchUrl("example.com?utm_source=x&id=1"),
		"https://example.com/?id=1",
	);
});

test("titleSuggestionFromUrl uses a meaningful path segment", () => {
	assert.equal(
		titleSuggestionFromUrl("https://docs.example.com/guide/getting-started"),
		"getting started",
	);
	assert.equal(
		titleSuggestionFromUrl("https://www.example.com/"),
		"example.com",
	);
});

test("extractTitleFromHtml prefers og:title then title", () => {
	assert.equal(
		extractTitleFromHtml(
			'<meta property="og:title" content="Og Name"><title>Tag Name</title>',
		),
		"Og Name",
	);
	assert.equal(extractTitleFromHtml("<title>Tag Name</title>"), "Tag Name");
});

test("environmentForShortcut maps P/Q/S/D and clear keys", () => {
	assert.equal(environmentForShortcut("p"), "prod");
	assert.equal(environmentForShortcut("P"), "prod");
	assert.equal(environmentForShortcut("q"), "qa");
	assert.equal(environmentForShortcut("s"), "stage");
	assert.equal(environmentForShortcut("d"), "dev");
	assert.equal(environmentForShortcut("n"), null);
	assert.equal(environmentForShortcut("0"), null);
	assert.equal(environmentForShortcut("Backspace"), null);
	assert.equal(environmentForShortcut("x"), undefined);
	assert.equal(environmentForShortcut("e"), undefined);
});

test("environmentShortcutLabel returns the kbd hint for each option", () => {
	assert.equal(environmentShortcutLabel("prod"), "P");
	assert.equal(environmentShortcutLabel("qa"), "Q");
	assert.equal(environmentShortcutLabel("stage"), "S");
	assert.equal(environmentShortcutLabel("dev"), "D");
	assert.equal(environmentShortcutLabel(null), "N");
});

test("resolveKeyboardTargetId prefers pinned over hover and menu", () => {
	assert.equal(
		resolveKeyboardTargetId({
			pinnedId: "a",
			hoveredId: "b",
			menuId: "c",
		}),
		"a",
	);
	assert.equal(
		resolveKeyboardTargetId({
			pinnedId: null,
			hoveredId: "b",
			menuId: "c",
		}),
		"b",
	);
	assert.equal(
		resolveKeyboardTargetId({
			pinnedId: null,
			hoveredId: null,
			menuId: "c",
		}),
		"c",
	);
	assert.equal(
		resolveKeyboardTargetId({
			pinnedId: null,
			hoveredId: null,
			menuId: null,
		}),
		null,
	);
});

test("withCacheBust appends a version query without breaking existing params", () => {
	assert.equal(withCacheBust("https://x/f.ico", 12), "https://x/f.ico?v=12");
	assert.equal(
		withCacheBust("https://x/f.ico?sz=64", 99),
		"https://x/f.ico?sz=64&v=99",
	);
	assert.equal(withCacheBust("https://x/f.ico", null), "https://x/f.ico");
	assert.equal(withCacheBust("", 1), "");
});

test("readLastGroupId and writeLastGroupId persist via storage", () => {
	const storage = memoryStorage();
	assert.equal(readLastGroupId(storage), null);
	writeLastGroupId(storage, "proj_abc");
	assert.equal(readLastGroupId(storage), "proj_abc");
	assert.equal(storage.getItem(LAST_GROUP_STORAGE_KEY), "proj_abc");
	writeLastGroupId(storage, "");
	assert.equal(readLastGroupId(storage), "proj_abc");
});

test("defaultSelectedGroupIds preselects the last group when it still exists", () => {
	const projects = [
		{ _id: "old", createdAt: 1 },
		{ _id: "new", createdAt: 3 },
	];
	assert.deepEqual(defaultSelectedGroupIds(projects, "old"), ["old"]);
	assert.deepEqual(defaultSelectedGroupIds(projects, "missing"), []);
	assert.deepEqual(defaultSelectedGroupIds(projects, null), []);
});

function layoutFixture() {
	return {
		version: 7,
		bookmarks: [
			{
				_id: "a",
				_creationTime: 20,
				title: "Alpha",
				url: "https://alpha.example",
				tags: ["top"],
				padPosition: 1,
				projects: [
					{
						projectId: "p1",
						position: 1,
						name: " Alpha exact ",
						environment: "prod",
					},
				],
			},
			{
				_id: "b",
				_creationTime: 10,
				title: "Beta",
				url: "https://beta.example",
				tags: ["top"],
				padPosition: 0,
				projects: [{ projectId: "p1", position: 0, environment: "prod" }],
			},
			{
				_id: "c",
				_creationTime: 30,
				title: "Gamma",
				url: "https://gamma.example",
				tags: ["pinned"],
				padPosition: 0,
				projects: [],
			},
		],
		projects: [
			{ _id: "p2", name: "Two", position: 1, createdAt: 20 },
			{ _id: "p1", name: "One", position: 0, createdAt: 10 },
		],
	};
}

test("Pad tags normalize to exactly one canonical zone", () => {
	assert.deepEqual(normalizePadTags(["pinned", "top"]), ["top"]);
	assert.deepEqual(normalizePadTags(["top"]), ["top"]);
	assert.deepEqual(normalizePadTags(["pinned"]), ["pinned"]);
	assert.deepEqual(normalizePadTags([]), ["pinned"]);
	assert.equal(padZoneForBookmark({ tags: ["top", "pinned"] }), "top");
	assert.equal(padZoneForBookmark({ tags: [] }), "pinned");
});

test("sortLayout uses position then deterministic creation fallback", () => {
	const sorted = sortLayout({
		version: 1,
		bookmarks: [
			{ _id: "late", _creationTime: 20, tags: ["top"], projects: [] },
			{
				_id: "positioned",
				_creationTime: 30,
				tags: ["top"],
				padPosition: 0,
				projects: [],
			},
			{ _id: "early", _creationTime: 10, tags: ["top"], projects: [] },
		],
		projects: [
			{ _id: "late", createdAt: 20 },
			{ _id: "positioned", createdAt: 30, position: 0 },
			{ _id: "early", createdAt: 10 },
		],
	});
	assert.deepEqual(
		sorted.bookmarks.map((item) => item._id),
		["positioned", "early", "late"],
	);
	assert.deepEqual(
		sorted.projects.map((item) => item._id),
		["positioned", "early", "late"],
	);
});

test("removeAndInsert supports first, middle, last, and clamped insertion", () => {
	assert.deepEqual(removeAndInsert(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
	assert.deepEqual(removeAndInsert(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
	assert.deepEqual(removeAndInsert(["a", "b", "c"], 0, 99), ["b", "c", "a"]);
	assert.deepEqual(removeAndInsert(["a", "b", "c"], 2, -4), ["c", "a", "b"]);
});

test("compaction helpers return new objects with contiguous positions", () => {
	const layout = layoutFixture();
	const pad = compactPadZone(layout.bookmarks, "top");
	assert.deepEqual(
		pad
			.filter((item) => item.tags[0] === "top")
			.map((item) => item.padPosition)
			.sort(),
		[0, 1],
	);
	const memberships = compactProjectMemberships(layout.bookmarks, "p1");
	assert.deepEqual(
		memberships
			.filter((item) =>
				item.projects.some((member) => member.projectId === "p1"),
			)
			.map(
				(item) =>
					item.projects.find((member) => member.projectId === "p1")?.position,
			),
		[1, 0],
	);
	assert.deepEqual(
		compactProjects(layout.projects).map((item) => item.position),
		[0, 1],
	);
	assert.notEqual(pad, layout.bookmarks);
});

test("project membership fallback ordering uses bookmark creation time, not Pad position", () => {
	const bookmarks = [
		{
			_id: "newer-low-pad",
			_creationTime: 20,
			tags: ["top"],
			padPosition: 0,
			projects: [{ projectId: "p1" }],
		},
		{
			_id: "older-high-pad",
			_creationTime: 10,
			tags: ["top"],
			padPosition: 99,
			projects: [{ projectId: "p1" }],
		},
	];

	const compacted = compactProjectMemberships(bookmarks, "p1");

	assert.deepEqual(
		compacted.map((item) => [
			item._id,
			item.projects.find((membership) => membership.projectId === "p1")
				?.position,
		]),
		[
			["newer-low-pad", 1],
			["older-high-pad", 0],
		],
	);
});

test("Pad moves compact both zones and preserve unrelated metadata", () => {
	const confirmed = layoutFixture();
	const result = applyLayoutOperation(confirmed, {
		kind: "movePadLink",
		bookmarkId: "a",
		targetZone: "pinned",
		targetIndex: 0,
	});
	assert.equal(result.ok, true);
	assert.deepEqual(result.affectedZones, ["top", "pinned"]);
	assert.deepEqual(
		result.layout.bookmarks.map((item) => item._id),
		["b", "a", "c"],
	);
	const moved = result.layout.bookmarks.find((item) => item._id === "a");
	assert.deepEqual(moved.tags, ["pinned"]);
	assert.equal(moved.padPosition, 0);
	assert.equal(moved.url, "https://alpha.example");
	assert.deepEqual(moved.projects[0], confirmed.bookmarks[0].projects[0]);
	assert.deepEqual(confirmed, layoutFixture());
});

test("project placement is exact, additive, and preserves membership metadata", () => {
	const confirmed = layoutFixture();
	const added = applyLayoutOperation(confirmed, {
		kind: "placeProjectLink",
		bookmarkId: "c",
		targetProjectId: "p2",
		targetIndex: 0,
	});
	assert.deepEqual(
		added.layout.bookmarks.find((item) => item._id === "c").projects,
		[{ projectId: "p2", position: 0 }],
	);
	assert.deepEqual(
		added.layout.bookmarks.find((item) => item._id === "c").tags,
		["pinned"],
	);
	assert.equal(
		added.layout.bookmarks.find((item) => item._id === "c").padPosition,
		0,
	);

	const reordered = applyLayoutOperation(confirmed, {
		kind: "placeProjectLink",
		bookmarkId: "a",
		sourceProjectId: "p1",
		targetProjectId: "p1",
		targetIndex: 0,
	});
	assert.deepEqual(
		reordered.layout.bookmarks.find((item) => item._id === "a").projects[0],
		{
			projectId: "p1",
			position: 0,
			name: " Alpha exact ",
			environment: "prod",
		},
	);

	const crossProject = applyLayoutOperation(reordered.layout, {
		kind: "placeProjectLink",
		bookmarkId: "a",
		sourceProjectId: "p1",
		targetProjectId: "p2",
		targetIndex: 0,
	});
	const memberships = crossProject.layout.bookmarks.find(
		(item) => item._id === "a",
	).projects;
	assert.equal(memberships.length, 2);
	assert.deepEqual(
		memberships.find((item) => item.projectId === "p1"),
		{
			projectId: "p1",
			position: 0,
			name: " Alpha exact ",
			environment: "prod",
		},
	);
	assert.deepEqual(
		memberships.find((item) => item.projectId === "p2"),
		{
			projectId: "p2",
			position: 0,
		},
	);
});

test("cross-project placement compacts and reports source and target while retaining source membership", () => {
	const confirmed = layoutFixture();
	confirmed.bookmarks.push({
		_id: "d",
		_creationTime: 40,
		title: "Delta",
		url: "https://delta.example",
		tags: ["pinned"],
		padPosition: 1,
		projects: [{ projectId: "p1", position: 4, environment: "qa" }],
	});

	const result = applyLayoutOperation(confirmed, {
		kind: "placeProjectLink",
		bookmarkId: "a",
		sourceProjectId: "p1",
		targetProjectId: "p2",
		targetIndex: 0,
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.affectedZones, ["project:p1", "project:p2"]);
	assert.deepEqual(
		result.layout.bookmarks
			.map((item) => ({
				id: item._id,
				membership: item.projects.find(
					(membership) => membership.projectId === "p1",
				),
			}))
			.filter((item) => item.membership)
			.map((item) => [item.id, item.membership.position]),
		[
			["b", 0],
			["a", 1],
			["d", 2],
		],
	);
	assert.deepEqual(
		result.layout.bookmarks
			.find((item) => item._id === "a")
			.projects.find((membership) => membership.projectId === "p1"),
		confirmed.bookmarks[0].projects[0],
	);
});

test("existing cross-project targets reposition without duplication", () => {
	const confirmed = layoutFixture();
	confirmed.bookmarks[0].projects.push({
		projectId: "p2",
		position: 1,
		name: "Other exact",
		environment: "qa",
	});
	confirmed.bookmarks[2].projects.push({
		projectId: "p2",
		position: 0,
		environment: "qa",
	});
	const result = applyLayoutOperation(confirmed, {
		kind: "placeProjectLink",
		bookmarkId: "a",
		sourceProjectId: "p1",
		targetProjectId: "p2",
		targetIndex: 0,
	});
	const moved = result.layout.bookmarks.find((item) => item._id === "a");
	assert.equal(
		moved.projects.filter((item) => item.projectId === "p2").length,
		1,
	);
	assert.deepEqual(
		moved.projects.find((item) => item.projectId === "p2"),
		{
			projectId: "p2",
			position: 0,
			name: "Other exact",
			environment: "qa",
		},
	);
	assert.equal(
		moved.projects.find((item) => item.projectId === "p1").environment,
		"prod",
	);
});

test("duplicate environments survive same-project reorder and replay unchanged", () => {
	const authoritative = layoutFixture();
	authoritative.bookmarks[0].projects[0].environment = "prod";
	authoritative.bookmarks[1].projects[0].environment = "prod";
	const operations = [
		{
			kind: "placeProjectLink",
			bookmarkId: "a",
			sourceProjectId: "p1",
			targetProjectId: "p1",
			targetIndex: 0,
		},
	];

	const applied = applyLayoutOperation(authoritative, operations[0]);
	const replayed = replayLayoutOperations(authoritative, operations);

	for (const result of [applied, replayed]) {
		assert.equal(result.ok, true);
		assert.deepEqual(
			result.layout.bookmarks
				.filter((item) =>
					item.projects.some((membership) => membership.projectId === "p1"),
				)
				.map(
					(item) =>
						item.projects.find((membership) => membership.projectId === "p1")
							.environment,
				),
			["prod", "prod"],
		);
	}
	assert.deepEqual(authoritative, {
		...layoutFixture(),
		bookmarks: layoutFixture().bookmarks.map((item) => ({
			...item,
			projects: item.projects.map((membership) => ({
				...membership,
				environment:
					membership.projectId === "p1" ? "prod" : membership.environment,
			})),
		})),
	});
});

test("project reorder compacts project positions", () => {
	const result = applyLayoutOperation(layoutFixture(), {
		kind: "moveProject",
		projectId: "p1",
		targetIndex: 99,
	});
	assert.deepEqual(
		result.layout.projects.map((item) => [item._id, item.position]),
		[
			["p2", 0],
			["p1", 1],
		],
	);
});

test("replay retains newer authoritative names, urls, and environments", () => {
	const authoritative = layoutFixture();
	authoritative.bookmarks[0].title = "Remote title";
	authoritative.bookmarks[0].url = "https://remote.example";
	authoritative.bookmarks[0].projects[0].name = " Remote exact ";
	authoritative.bookmarks[0].projects[0].environment = "stage";
	const replayed = replayLayoutOperations(authoritative, [
		{
			kind: "movePadLink",
			bookmarkId: "a",
			targetZone: "pinned",
			targetIndex: 0,
		},
		{
			kind: "placeProjectLink",
			bookmarkId: "a",
			sourceProjectId: "p1",
			targetProjectId: "p1",
			targetIndex: 0,
		},
	]);
	const moved = replayed.layout.bookmarks.find((item) => item._id === "a");
	assert.equal(moved.title, "Remote title");
	assert.equal(moved.url, "https://remote.example");
	assert.equal(moved.projects[0].name, " Remote exact ");
	assert.equal(moved.projects[0].environment, "stage");
});

test("dependent operations are removed after missing identities", () => {
	const operations = [
		{
			operationId: "1",
			kind: "placeProjectLink",
			bookmarkId: "a",
			targetProjectId: "missing",
			targetIndex: 0,
		},
		{
			operationId: "2",
			kind: "movePadLink",
			bookmarkId: "a",
			targetZone: "top",
			targetIndex: 0,
		},
		{ operationId: "3", kind: "moveProject", projectId: "p1", targetIndex: 0 },
	];
	assert.deepEqual(
		removeDependentOperations(operations, {
			bookmarkId: "a",
			projectId: "missing",
		}).map((item) => item.operationId),
		["3"],
	);
});

test("invalid operations return typed failures and rollback stays exact", () => {
	const confirmed = layoutFixture();
	for (const operation of [
		{
			kind: "moveProjectLinkToPad",
			bookmarkId: "a",
			targetZone: "top",
			targetIndex: 0,
		},
		{
			kind: "movePadLink",
			bookmarkId: "missing",
			targetZone: "top",
			targetIndex: 0,
		},
		{
			kind: "placeProjectLink",
			bookmarkId: "a",
			targetProjectId: "missing",
			targetIndex: 0,
		},
		{ kind: "moveProject", projectId: "missing", targetIndex: 0 },
	]) {
		const result = applyLayoutOperation(confirmed, operation);
		assert.equal(result.ok, false);
		assert.equal(typeof result.reason, "string");
		assert.deepEqual(confirmed, layoutFixture());
	}
	const optimistic = applyLayoutOperation(confirmed, {
		kind: "movePadLink",
		bookmarkId: "a",
		targetZone: "pinned",
		targetIndex: 0,
	});
	assert.notDeepEqual(optimistic.layout, confirmed);
	assert.deepEqual(confirmed, layoutFixture());
});

test("layout announcements use exact accessible copy", () => {
	assert.equal(
		layoutAnnouncement("pickup", {
			name: "GitHub",
			zone: "top",
			position: 1,
			total: 6,
		}),
		"Moving GitHub. Top, position 2 of 6. Use arrow keys to move, Tab to change section, Enter to drop, or Escape to cancel.",
	);
	assert.equal(
		layoutAnnouncement("preview", { zone: "pinned", position: 0, total: 4 }),
		"Pinned, position 1 of 4.",
	);
	assert.equal(
		layoutAnnouncement("drop", { name: "GitHub", zone: "pinned", position: 0 }),
		"Moved GitHub to Pinned, position 1.",
	);
	assert.equal(
		layoutAnnouncement("cancel", { name: "GitHub", zone: "top", position: 1 }),
		"Move canceled. GitHub returned to Top, position 2.",
	);
	assert.equal(layoutAnnouncement("invalid", {}), "Can’t drop here.");
});

test("layout mutation errors distinguish definitive server outcomes from transport", () => {
	function serverError(message) {
		return new Error(
			`[CONVEX M(launch:applyLayoutOperation)] [Request ID: 1] Server Error\nUncaught Error: ${message}`,
		);
	}
	assert.equal(
		classifyLayoutMutationError(new TypeError("Failed to fetch")),
		"transport",
	);
	assert.equal(classifyLayoutMutationError(undefined), "transport");
	assert.equal(
		classifyLayoutMutationError(serverError("Target project not found")),
		"missing-target",
	);
	for (const message of [
		"Bookmark not found",
		"Project not found",
		"Source project not found",
		"Bookmark is not in the source project",
	]) {
		assert.equal(
			classifyLayoutMutationError(serverError(message)),
			"missing-item",
		);
	}
	assert.equal(
		classifyLayoutMutationError(
			serverError("Target index must be a finite non-negative integer"),
		),
		"rejected",
	);
	assert.equal(
		classifyLayoutMutationError(
			Object.assign(new Error("ConvexError"), { data: { code: "x" } }),
		),
		"rejected",
	);
});

test("rollback focus identity follows each operation's origin zone", () => {
	const layout = {
		version: 1,
		bookmarks: [{ _id: "a", tags: ["pinned"], padPosition: 0, projects: [] }],
		projects: [],
	};
	assert.deepEqual(
		focusIdentityForOperation(
			{ kind: "movePadLink", bookmarkId: "a", targetZone: "top" },
			layout,
		),
		{ sortKind: "bookmark", sortId: "a", zone: "pinned" },
	);
	assert.deepEqual(
		focusIdentityForOperation(
			{
				kind: "placeProjectLink",
				bookmarkId: "a",
				sourceProjectId: "p1",
				targetProjectId: "p2",
			},
			layout,
		),
		{ sortKind: "bookmark", sortId: "a", zone: "project:p1" },
	);
	assert.deepEqual(
		focusIdentityForOperation(
			{ kind: "placeProjectLink", bookmarkId: "a", targetProjectId: "p2" },
			layout,
		),
		{ sortKind: "bookmark", sortId: "a", zone: "pinned" },
	);
	assert.deepEqual(
		focusIdentityForOperation({ kind: "moveProject", projectId: "p1" }, layout),
		{ sortKind: "project", sortId: "p1", zone: "projects" },
	);
});
