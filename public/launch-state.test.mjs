import assert from "node:assert/strict";
import test from "node:test";

import {
	LAYOUT_STORAGE_KEY,
	applyLayoutOperation,
	classifyLayoutMutationError,
	createLaunchLayoutStore,
	pendingLayoutMarkers,
	readLayoutSnapshot,
} from "./launch-model.mjs";

function fixture() {
	return {
		version: 4,
		bookmarks: [
			{
				_id: "a",
				_creationTime: 1,
				title: "Alpha",
				url: "https://alpha.example",
				tags: ["top"],
				padPosition: 0,
				projects: [
					{
						projectId: "p1",
						position: 0,
						name: "  Exact Alpha\t",
						environment: "prod",
					},
				],
			},
			{
				_id: "b",
				_creationTime: 2,
				title: "Beta",
				url: "https://beta.example",
				tags: ["top"],
				padPosition: 1,
				projects: [{ projectId: "p1", position: 1, environment: "prod" }],
			},
		],
		projects: [{ _id: "p1", name: "Project", position: 0, createdAt: 1 }],
	};
}

function operation(bookmarkId, targetIndex) {
	return {
		kind: "movePadLink",
		bookmarkId,
		targetZone: "top",
		targetIndex,
	};
}

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

function fixtureWithPinned() {
	const layout = fixture();
	layout.bookmarks.push({
		_id: "c",
		_creationTime: 3,
		title: "Gamma",
		url: "https://gamma.example",
		tags: ["pinned"],
		padPosition: 0,
		projects: [],
	});
	layout.projects.push({
		_id: "p2",
		name: "Second",
		position: 1,
		createdAt: 2,
	});
	return layout;
}

function zoneOrder(layout, zone) {
	return layout.bookmarks
		.filter((item) => item.tags[0] === zone)
		.sort((left, right) => left.padPosition - right.padPosition)
		.map((item) => item._id);
}

function without(layout, bookmarkId) {
	return {
		...layout,
		bookmarks: layout.bookmarks.filter((item) => item._id !== bookmarkId),
	};
}

function applied(layout, ...operations) {
	let next = layout;
	for (const item of operations) {
		next = applyLayoutOperation(next, item).layout;
	}
	return next;
}

async function flush() {
	for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function harness(overrides = {}) {
	const writes = [];
	const renders = [];
	const statuses = [];
	const calls = [];
	const pending = [];
	const focus = [];
	const timers = [];
	const saved = {};
	const storage = {
		getItem(key) {
			return Object.hasOwn(saved, key) ? saved[key] : null;
		},
		setItem(key, value) {
			saved[key] = value;
			writes.push([key, JSON.parse(value)]);
		},
	};
	const store = createLaunchLayoutStore({
		initialLayout: fixture(),
		storage,
		applyOperation: applyLayoutOperation,
		createOperationId: (() => {
			let id = 0;
			return () => `operation-${++id}`;
		})(),
		render(layout, state) {
			renders.push({ layout, state });
		},
		setStatus(message) {
			statuses.push(message);
		},
		mutate(args) {
			calls.push(args);
			const next = deferred();
			pending.push(next);
			return next.promise;
		},
		restoreFocus(failed) {
			focus.push(failed);
		},
		isOnline: () => true,
		wait: () => Promise.resolve(),
		setTimer(callback, delay) {
			timers.push({ callback, delay, cleared: false });
			return timers.length - 1;
		},
		clearTimer(handle) {
			if (timers[handle]) timers[handle].cleared = true;
		},
		...overrides,
	});
	return {
		store,
		storage,
		writes,
		renders,
		statuses,
		calls,
		pending,
		focus,
		timers,
	};
}

test("drop renders and writes the optimistic view synchronously, then sends serially", async () => {
	const h = harness();
	h.store.drop(operation("a", 1));
	h.store.drop(operation("b", 1));

	assert.equal(h.calls.length, 1);
	assert.deepEqual(
		h.store.getView().bookmarks.map((item) => item._id),
		["a", "b"],
	);
	assert.equal(h.renders.length, 2);
	assert.equal(h.renders[0].state.pending, true);
	assert.equal(h.writes[0][0], LAYOUT_STORAGE_KEY);
	assert.equal("pendingOperations" in h.writes[0][1], false);

	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...applyLayoutOperation(fixture(), operation("a", 1)).layout,
		version: 5,
	});
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(h.calls.length, 2);
});

test("an acknowledgment keeps Saving status while queued moves remain", async () => {
	const h = harness();
	h.store.drop(operation("a", 1));
	h.store.drop(operation("b", 1));
	assert.equal(h.statuses.at(-1), "Saving order…");
	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...applyLayoutOperation(fixture(), operation("a", 1)).layout,
		version: 5,
	});
	await flush();
	assert.equal(h.calls.length, 2);
	assert.equal(h.statuses.at(-1), "Saving order…");
	h.pending[1].resolve({
		status: "applied",
		operationId: "operation-2",
		...applied(fixture(), operation("a", 1), operation("b", 1)),
		version: 6,
	});
	await flush();
	assert.equal(h.statuses.at(-1), "");
});

test("success acknowledges once, rebases the remainder, and preserves remote metadata", async () => {
	const h = harness();
	h.store.drop(operation("a", 1));
	h.store.drop(operation("b", 1));
	const authoritative = fixture();
	authoritative.version = 5;
	authoritative.bookmarks[0].title = "Remote Alpha";
	authoritative.bookmarks[0].projects[0].environment = "qa";
	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...authoritative,
	});
	await Promise.resolve();
	await Promise.resolve();

	assert.equal(h.store.getConfirmed().bookmarks[0].title, "Remote Alpha");
	assert.equal(h.store.getView().bookmarks[0].projects[0].environment, "qa");
	assert.equal(h.store.getPendingOperations().length, 1);
	h.store.receiveSnapshot(authoritative);
	assert.equal(h.store.getPendingOperations().length, 1);
});

test("a late acknowledgment cannot regress a newer subscription snapshot", async () => {
	const h = harness();
	h.store.drop(operation("a", 1));
	const remote = fixture();
	remote.version = 8;
	remote.bookmarks[0].title = "Newest Alpha";
	remote.bookmarks[0].projects[0].environment = "stage";
	h.store.receiveSnapshot(remote);

	const olderAcknowledgment = fixture();
	olderAcknowledgment.version = 5;
	olderAcknowledgment.bookmarks[0].title = "Older Alpha";
	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...olderAcknowledgment,
	});
	await Promise.resolve();
	await Promise.resolve();

	assert.equal(h.store.getConfirmed().version, 8);
	assert.equal(h.store.getView().bookmarks[0].title, "Newest Alpha");
	assert.equal(h.store.getView().bookmarks[0].projects[0].environment, "stage");
	assert.equal(h.store.getPendingOperations().length, 0);
});

test("duplicate acknowledgment after subscription acknowledgment does not apply twice", async () => {
	const h = harness();
	h.store.drop(operation("a", 1));
	const authoritative = applyLayoutOperation(
		fixture(),
		operation("a", 1),
	).layout;
	authoritative.version = 5;
	h.store.receiveSnapshot({
		...authoritative,
		recentOperationIds: ["operation-1"],
	});
	const renderCount = h.renders.length;

	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...authoritative,
	});
	await Promise.resolve();
	await Promise.resolve();

	assert.equal(h.store.getPendingOperations().length, 0);
	assert.deepEqual(h.store.getView(), authoritative);
	assert.equal(h.renders.length, renderCount);
});

test("newer subscriptions rebase pending intent; stale snapshots do not render", () => {
	const h = harness();
	h.store.drop(operation("a", 1));
	const renderCount = h.renders.length;
	const remote = fixture();
	remote.version = 8;
	remote.bookmarks[0].title = "Remote";
	remote.bookmarks[0].projects[0].name = " byte-for-byte ";
	h.store.receiveSnapshot(remote);
	const rebasedAlpha = h.store
		.getView()
		.bookmarks.find((bookmark) => bookmark._id === "a");
	assert.equal(rebasedAlpha.title, "Remote");
	assert.equal(rebasedAlpha.projects[0].name, " byte-for-byte ");
	h.store.receiveSnapshot({ ...remote, version: 8 });
	h.store.receiveSnapshot({ ...remote, version: 7 });
	assert.equal(h.renders.length, renderCount + 1);
});

test("one conflict rebases and retries; a second conflict rolls back dependents", async () => {
	const h = harness();
	h.store.drop(operation("a", 1));
	const conflict = { ...fixture(), version: 5 };
	h.pending[0].resolve({
		status: "conflict",
		operationId: "operation-1",
		...conflict,
	});
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(h.calls.length, 2);
	assert.equal(h.calls[1].expectedVersion, 5);

	const latest = fixture();
	latest.version = 6;
	latest.bookmarks = latest.bookmarks.filter((item) => item._id !== "a");
	h.pending[1].resolve({
		status: "conflict",
		operationId: "operation-1",
		...latest,
	});
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(h.store.getPendingOperations().length, 0);
	assert.deepEqual(h.store.getView(), latest);
	assert.equal(
		h.statuses.at(-1),
		"The layout changed elsewhere. Review the latest order and try again.",
	);
});

test("transport retries use backoff while pending, then rollback exactly", async () => {
	const waits = [];
	const h = harness({
		wait(delay) {
			waits.push(delay);
			return Promise.resolve();
		},
	});
	h.store.drop(operation("a", 1));
	for (let index = 0; index < 4; index += 1) {
		h.pending[index].reject(new Error("network"));
		await flush();
	}
	assert.deepEqual(waits, [250, 1000, 3000]);
	assert.deepEqual(h.store.getView(), fixture());
	assert.equal(
		h.statuses.at(-1),
		"Couldn’t save that move. Your previous order is restored.",
	);
});

test("offline keeps pending in memory and waits for retryOnline", async () => {
	let online = false;
	const h = harness({ isOnline: () => online });
	h.store.drop(operation("a", 1));
	assert.equal(h.calls.length, 0);
	assert.equal(h.store.getPendingOperations().length, 1);
	assert.equal(
		h.statuses.at(-1),
		"You’re offline. Reconnect, then try the move again.",
	);
	assert.equal(h.writes.length, 0);
	assert.deepEqual(
		[...h.store.getView().bookmarks]
			.sort((a, b) => a.padPosition - b.padPosition)
			.map((item) => item._id),
		["b", "a"],
	);

	online = true;
	h.store.retryOnline();
	assert.equal(h.calls.length, 1);
	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...fixture(),
		version: 5,
	});
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(h.statuses.at(-1), "");
});

const CHANGED_ELSEWHERE =
	"The layout changed elsewhere. Review the latest order and try again.";
const COULD_NOT_SAVE =
	"Couldn’t save that move. Your previous order is restored.";
const OFFLINE = "You’re offline. Reconnect, then try the move again.";

function serverError(message) {
	return new Error(
		`[CONVEX M(launch:applyLayoutOperation)] [Request ID: 1] Server Error\nUncaught Error: ${message}\n    at handler (../convex/launch.ts:1:1)`,
	);
}

test("reload before acknowledgment restores same-version server authority", () => {
	const cached = applied(fixture(), operation("a", 1));
	const h = harness({ initialLayout: cached });
	assert.deepEqual(zoneOrder(h.store.getView(), "top"), ["b", "a"]);

	h.store.receiveSnapshot(fixture());

	assert.deepEqual(zoneOrder(h.store.getView(), "top"), ["a", "b"]);
	assert.deepEqual(zoneOrder(h.writes.at(-1)[1], "top"), ["a", "b"]);
	assert.equal(h.renders.length, 1);
	h.store.receiveSnapshot(fixture());
	assert.equal(h.renders.length, 1);
});

test("a failed operation removes only itself and same-item dependents", async () => {
	const waits = [];
	const h = harness({
		initialLayout: fixtureWithPinned(),
		wait(delay) {
			waits.push(delay);
			return Promise.resolve();
		},
	});
	h.store.drop(operation("a", 1));
	h.store.drop(operation("c", 0));
	h.store.drop(operation("a", 0));
	for (let index = 0; index < 4; index += 1) {
		assert.equal(h.calls.length, index + 1);
		assert.equal(h.calls[index].operationId, "operation-1");
		h.pending[index].reject(new TypeError("Failed to fetch"));
		await flush();
	}

	assert.deepEqual(waits, [250, 1000, 3000]);
	assert.deepEqual(h.store.getPendingOperations(), [
		{ operationId: "operation-2", ...operation("c", 0) },
	]);
	assert.deepEqual(
		h.store.getView(),
		applied(fixtureWithPinned(), operation("c", 0)),
	);
	assert.equal(h.statuses.at(-1), COULD_NOT_SAVE);
	assert.deepEqual(h.focus, [operation("a", 1)]);
	assert.equal(h.renders.at(-1).state.pending, true);
	assert.deepEqual(
		h.renders.at(-1).state.pendingOperations.map((item) => item.operationId),
		["operation-2"],
	);
	assert.equal(h.calls.length, 5);
	assert.equal(h.calls[4].operationId, "operation-2");
	assert.deepEqual(h.calls[4].operation, operation("c", 0));
});

test("missing-target server rejections roll back target dependents without retries", async () => {
	const waits = [];
	const h = harness({
		initialLayout: fixtureWithPinned(),
		wait(delay) {
			waits.push(delay);
			return Promise.resolve();
		},
	});
	const placeA = {
		kind: "placeProjectLink",
		bookmarkId: "a",
		targetProjectId: "p2",
		targetIndex: 0,
	};
	const placeB = { ...placeA, bookmarkId: "b" };
	h.store.drop(placeA);
	h.store.drop(placeB);
	h.store.drop(operation("c", 0));
	h.pending[0].reject(serverError("Target project not found"));
	await flush();

	assert.deepEqual(waits, []);
	assert.deepEqual(
		h.store.getPendingOperations().map((item) => item.operationId),
		["operation-3"],
	);
	assert.equal(h.statuses.at(-1), CHANGED_ELSEWHERE);
	assert.deepEqual(h.focus, [placeA]);
	assert.equal(h.calls.length, 2);
	assert.equal(h.calls[1].operationId, "operation-3");
});

test("validation rejections are definitive while transport failures retry", async () => {
	for (const error of [
		serverError("A Pad zone supports at most 100 bookmarks"),
		Object.assign(new Error("ConvexError"), { data: { code: "invalid" } }),
	]) {
		const waits = [];
		const h = harness({
			wait(delay) {
				waits.push(delay);
				return Promise.resolve();
			},
		});
		h.store.drop(operation("a", 1));
		h.pending[0].reject(error);
		await flush();
		assert.deepEqual(waits, []);
		assert.equal(h.calls.length, 1);
		assert.deepEqual(h.store.getView(), fixture());
		assert.equal(h.statuses.at(-1), COULD_NOT_SAVE);
	}

	const waits = [];
	const h = harness({
		wait(delay) {
			waits.push(delay);
			return Promise.resolve();
		},
	});
	h.store.drop(operation("a", 1));
	h.pending[0].reject(new TypeError("Failed to fetch"));
	await flush();
	assert.deepEqual(waits, [250]);
	assert.equal(h.calls.length, 2);
	assert.equal(h.calls[1].operationId, "operation-1");
	assert.equal(h.store.getPendingOperations().length, 1);
});

test("offline pending intent is never persisted by acknowledgment or subscription", async () => {
	let online = true;
	const h = harness({
		initialLayout: fixtureWithPinned(),
		isOnline: () => online,
	});
	h.store.drop(operation("c", 0));
	online = false;
	h.store.drop(operation("a", 2));
	const writesBefore = h.writes.length;

	const acknowledgment = {
		...applied(fixtureWithPinned(), operation("c", 0)),
		version: 5,
	};
	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...acknowledgment,
	});
	await flush();

	assert.deepEqual(zoneOrder(h.store.getView(), "top"), ["c", "b", "a"]);
	assert.ok(h.writes.length > writesBefore);
	assert.equal(h.statuses.at(-1), OFFLINE);

	const remote = structuredClone(acknowledgment);
	remote.version = 6;
	remote.bookmarks.find((item) => item._id === "b").title = "Remote Beta";
	h.store.receiveSnapshot(remote);

	assert.ok(h.writes.length > writesBefore + 1);
	for (const [, snapshot] of h.writes.slice(writesBefore)) {
		assert.deepEqual(zoneOrder(snapshot, "top"), ["c", "a", "b"]);
	}
	assert.equal(
		h.writes.at(-1)[1].bookmarks.find((item) => item._id === "b").title,
		"Remote Beta",
	);
	assert.deepEqual(
		h.store.getPendingOperations().map((item) => item.operationId),
		["operation-2"],
	);
	assert.equal(h.calls.length, 1);
});

test("a true second conflict restores authority without a third send", async () => {
	const h = harness();
	h.store.drop(operation("a", 1));
	h.pending[0].resolve({
		status: "conflict",
		operationId: "operation-1",
		...fixture(),
		version: 5,
	});
	await flush();
	assert.equal(h.calls.length, 2);
	assert.equal(h.calls[1].operationId, "operation-1");
	assert.deepEqual(zoneOrder(h.store.getView(), "top"), ["b", "a"]);

	const latest = fixture();
	latest.version = 6;
	latest.bookmarks[1].title = "Remote Beta";
	h.pending[1].resolve({
		status: "conflict",
		operationId: "operation-1",
		...latest,
	});
	await flush();

	assert.equal(h.calls.length, 2);
	assert.equal(h.store.getPendingOperations().length, 0);
	assert.deepEqual(h.store.getView(), latest);
	assert.equal(h.statuses.at(-1), CHANGED_ELSEWHERE);
	assert.deepEqual(h.focus, [operation("a", 1)]);
});

test("remote deletion removes only the affected pending move", async () => {
	const h = harness({ initialLayout: fixtureWithPinned() });
	h.store.drop(operation("a", 1));
	h.store.drop(operation("c", 0));
	const remote = without(fixtureWithPinned(), "c");
	remote.version = 5;
	remote.bookmarks[0].title = "Remote Alpha";
	h.store.receiveSnapshot(remote);

	assert.deepEqual(
		h.store.getPendingOperations().map((item) => item.operationId),
		["operation-1"],
	);
	assert.deepEqual(h.store.getView(), applied(remote, operation("a", 1)));
	assert.equal(h.statuses.at(-1), CHANGED_ELSEWHERE);
	assert.deepEqual(h.focus, []);

	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...applied(remote, operation("a", 1)),
		version: 6,
	});
	await flush();
	assert.equal(h.calls.length, 1);
	assert.equal(h.store.getPendingOperations().length, 0);
});

test("remote deletion of the in-flight move ignores its late failure and sends the next move", async () => {
	const waits = [];
	const h = harness({
		initialLayout: fixtureWithPinned(),
		wait(delay) {
			waits.push(delay);
			return Promise.resolve();
		},
	});
	h.store.drop(operation("a", 1));
	h.store.drop(operation("c", 0));
	const remote = without(fixtureWithPinned(), "a");
	remote.version = 5;
	h.store.receiveSnapshot(remote);
	assert.deepEqual(
		h.store.getPendingOperations().map((item) => item.operationId),
		["operation-2"],
	);

	h.pending[0].reject(new TypeError("Failed to fetch"));
	await flush();

	assert.deepEqual(waits, []);
	assert.equal(h.calls.length, 2);
	assert.equal(h.calls[1].operationId, "operation-2");
	assert.equal(h.calls[1].expectedVersion, 5);
	assert.deepEqual(h.store.getView(), applied(remote, operation("c", 0)));
	assert.notEqual(h.statuses.at(-1), COULD_NOT_SAVE);
});

test("an acknowledgment that invalidates a later move drops only that move", async () => {
	const h = harness({ initialLayout: fixtureWithPinned() });
	h.store.drop(operation("a", 1));
	h.store.drop(operation("c", 0));
	h.store.drop(operation("b", 0));
	const acknowledgment = {
		...applied(without(fixtureWithPinned(), "c"), operation("a", 1)),
		version: 5,
	};
	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...acknowledgment,
	});
	await flush();

	assert.deepEqual(
		h.store.getPendingOperations().map((item) => item.operationId),
		["operation-3"],
	);
	assert.deepEqual(
		h.store.getView(),
		applied(acknowledgment, operation("b", 0)),
	);
	assert.equal(h.statuses.at(-1), CHANGED_ELSEWHERE);
	assert.deepEqual(h.focus, []);
	assert.equal(h.calls.length, 2);
	assert.equal(h.calls[1].operationId, "operation-3");
	assert.equal(h.calls[1].expectedVersion, 5);
});

function productionError(code) {
	return Object.assign(
		new Error(
			"[CONVEX M(launch:applyLayoutOperation)] [Request ID: 9] Server Error",
		),
		code ? { data: { code, message: "redacted" } } : {},
	);
}

test("production ConvexError data codes classify missing identities", () => {
	assert.equal(
		classifyLayoutMutationError(productionError("missing-item")),
		"missing-item",
	);
	assert.equal(
		classifyLayoutMutationError(productionError("missing-target")),
		"missing-target",
	);
	for (const code of [
		"invalid-operation",
		"limit-exceeded",
		"invalid-dataset",
		"not-initialized",
	]) {
		assert.equal(
			classifyLayoutMutationError(productionError(code)),
			"rejected",
		);
	}
	assert.equal(classifyLayoutMutationError(productionError()), "rejected");
	assert.equal(
		classifyLayoutMutationError(new TypeError("Failed to fetch")),
		"transport",
	);
});

test("production missing-item drops same-item dependents as a layout conflict", async () => {
	const waits = [];
	const h = harness({
		initialLayout: fixtureWithPinned(),
		wait(delay) {
			waits.push(delay);
			return Promise.resolve();
		},
	});
	h.store.drop(operation("a", 1));
	h.store.drop(operation("c", 0));
	h.store.drop(operation("a", 0));
	h.pending[0].reject(productionError("missing-item"));
	await flush();

	assert.deepEqual(waits, []);
	assert.deepEqual(
		h.store.getPendingOperations().map((item) => item.operationId),
		["operation-2"],
	);
	assert.equal(h.statuses.at(-1), CHANGED_ELSEWHERE);
	assert.equal(h.calls.length, 2);
	assert.equal(h.calls[1].operationId, "operation-2");
});

test("production missing-target drops every move into that project", async () => {
	const h = harness({ initialLayout: fixtureWithPinned() });
	const placeA = {
		kind: "placeProjectLink",
		bookmarkId: "a",
		targetProjectId: "p2",
		targetIndex: 0,
	};
	h.store.drop(placeA);
	h.store.drop({ ...placeA, bookmarkId: "b" });
	h.store.drop(operation("c", 0));
	h.pending[0].reject(productionError("missing-target"));
	await flush();

	assert.deepEqual(
		h.store.getPendingOperations().map((item) => item.operationId),
		["operation-3"],
	);
	assert.equal(h.statuses.at(-1), CHANGED_ELSEWHERE);
});

test("retryOnline keeps a persistent error when nothing has succeeded", async () => {
	let online = true;
	const h = harness({ isOnline: () => online });
	h.store.drop(operation("a", 1));
	h.pending[0].reject(productionError("limit-exceeded"));
	await flush();
	assert.equal(h.statuses.at(-1), COULD_NOT_SAVE);
	const statusCount = h.statuses.length;

	online = false;
	h.store.handleOffline();
	online = true;
	h.store.retryOnline();

	assert.equal(h.statuses.length, statusCount);
	assert.equal(h.calls.length, 1);
});

test("retryOnline replaces only its own offline status", async () => {
	let online = false;
	const h = harness({ isOnline: () => online });
	h.store.drop(operation("a", 1));
	assert.equal(h.statuses.at(-1), OFFLINE);

	online = true;
	h.store.retryOnline();
	assert.equal(h.statuses.at(-1), "Saving order…");
	assert.equal(h.calls.length, 1);
	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...applied(fixture(), operation("a", 1)),
		version: 5,
	});
	await flush();
	assert.equal(h.statuses.at(-1), "");
});

test("going offline mid-request shows offline and waits for Convex to resend", async () => {
	let online = true;
	const h = harness({ isOnline: () => online });
	h.store.drop(operation("a", 1));
	assert.equal(h.calls.length, 1);

	online = false;
	h.store.handleOffline();
	assert.equal(h.statuses.at(-1), OFFLINE);
	assert.deepEqual(zoneOrder(h.store.getView(), "top"), ["b", "a"]);

	online = true;
	h.store.retryOnline();
	await flush();
	assert.equal(h.calls.length, 1, "no parallel duplicate while in flight");
	assert.equal(h.statuses.at(-1), "Saving order…");

	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...applied(fixture(), operation("a", 1)),
		version: 5,
	});
	await flush();
	assert.equal(h.store.getPendingOperations().length, 0);
	assert.equal(h.statuses.at(-1), "");
	assert.equal(h.timers.length, 0);
});

test("a still-pending mutation is never timed out, resent, or rolled back before it settles", async () => {
	const waits = [];
	const h = harness({
		initialLayout: fixtureWithPinned(),
		wait(delay) {
			waits.push(delay);
			return Promise.resolve();
		},
	});
	h.store.drop(operation("a", 1));
	h.store.drop(operation("c", 0));
	await flush();
	h.store.handleOffline();
	h.store.retryOnline();
	await flush();

	assert.equal(h.timers.length, 0, "no synthetic request timeout is armed");
	assert.deepEqual(waits, []);
	assert.equal(h.calls.length, 1);
	assert.deepEqual(
		h.store.getPendingOperations().map((item) => item.operationId),
		["operation-1", "operation-2"],
	);
	assert.notEqual(h.statuses.at(-1), COULD_NOT_SAVE);

	const acknowledged = {
		...applied(fixtureWithPinned(), operation("a", 1)),
		version: 5,
	};
	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...acknowledged,
	});
	await flush();

	assert.deepEqual(h.store.getConfirmed(), acknowledged);
	assert.deepEqual(h.store.getView(), applied(acknowledged, operation("c", 0)));
	assert.deepEqual(h.focus, []);
	assert.equal(h.calls.length, 2);
	assert.equal(h.calls[1].operationId, "operation-2");
	assert.equal(h.calls[1].expectedVersion, 5);
});

test("going offline rewrites the cache to acknowledged authority while the view keeps pending intent", async () => {
	let online = true;
	const h = harness({
		initialLayout: fixtureWithPinned(),
		isOnline: () => online,
	});
	h.store.drop(operation("c", 0));
	h.store.drop(operation("a", 2));
	const acknowledged = {
		...applied(fixtureWithPinned(), operation("c", 0)),
		version: 5,
	};
	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...acknowledged,
	});
	await flush();
	assert.deepEqual(zoneOrder(h.writes.at(-1)[1], "top"), ["c", "b", "a"]);

	online = false;
	h.store.handleOffline();

	assert.deepEqual(
		h.writes.at(-1)[1].bookmarks,
		h.store.getConfirmed().bookmarks,
	);
	assert.deepEqual(zoneOrder(h.writes.at(-1)[1], "top"), ["c", "a", "b"]);
	assert.equal(h.writes.at(-1)[1].layoutVersion, 5);
	assert.deepEqual(zoneOrder(h.store.getView(), "top"), ["c", "b", "a"]);
	assert.deepEqual(
		h.store.getPendingOperations().map((item) => item.operationId),
		["operation-2"],
	);

	const remote = structuredClone(acknowledged);
	remote.version = 6;
	remote.bookmarks.find((item) => item._id === "b").title = "Remote Beta";
	h.store.receiveSnapshot(remote);
	assert.deepEqual(zoneOrder(h.writes.at(-1)[1], "top"), ["c", "a", "b"]);

	const reloaded = harness({
		initialLayout: readLayoutSnapshot(h.storage).layout,
	});
	assert.deepEqual(zoneOrder(reloaded.store.getView(), "top"), ["c", "a", "b"]);
	assert.equal(reloaded.store.getView().version, 6);
});

test("pending markers derive from current pending identities", async () => {
	assert.deepEqual(
		pendingLayoutMarkers([
			{ kind: "movePadLink", bookmarkId: "a", targetZone: "top" },
			{
				kind: "placeProjectLink",
				bookmarkId: "b",
				sourceProjectId: "p1",
				targetProjectId: "p2",
			},
			{ kind: "moveProject", projectId: "p1" },
		]),
		{
			items: [
				{ sortKind: "bookmark", sortId: "a" },
				{ sortKind: "bookmark", sortId: "b" },
				{ sortKind: "project", sortId: "p1" },
			],
			zones: ["top", "project:p1", "project:p2"],
		},
	);
	assert.deepEqual(pendingLayoutMarkers([]), { items: [], zones: [] });

	const h = harness();
	h.store.drop(operation("a", 1));
	assert.equal(h.renders.at(-1).state.pendingOperations.length, 1);
	h.pending[0].resolve({
		status: "applied",
		operationId: "operation-1",
		...applied(fixture(), operation("a", 1)),
		version: 5,
	});
	await flush();
	assert.equal(h.renders.at(-1).state.pending, false);
	assert.deepEqual(h.renders.at(-1).state.pendingOperations, []);
});
