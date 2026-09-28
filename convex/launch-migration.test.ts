import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { convexTest } from "convex-test";
import { test } from "vitest";

import { api } from "./_generated/api";
import { buildLaunchBackfillPatches } from "./_utils/launchLayout";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const projectA = "project-a" as never;
const projectB = "project-b" as never;

function bookmark(
	id: string,
	creationTime: number,
	tags: Array<"top" | "pinned">,
	projects: Array<{
		projectId: never;
		name?: string;
		environment?: "prod" | "qa" | "stage" | "dev" | "local";
		position?: number;
	}> = [],
	padPosition?: number,
) {
	return {
		_id: id as never,
		_creationTime: creationTime,
		title: id,
		url: `https://${id}.example`,
		tags,
		...(padPosition === undefined ? {} : { padPosition }),
		projects,
		clickCount: 0,
		createdAt: creationTime,
	};
}

function project(id: never, createdAt: number, position?: number) {
	return {
		_id: id,
		_creationTime: createdAt,
		name: String(id),
		createdAt,
		...(position === undefined ? {} : { position }),
	};
}

test("backfill assigns deterministic independent contiguous positions", () => {
	const result = buildLaunchBackfillPatches(
		[
			bookmark("later-top", 40, ["top"]),
			bookmark("both", 10, ["top", "pinned"]),
			bookmark("pinned", 30, ["pinned"]),
			bookmark("neither", 20, []),
		],
		[project(projectA, 200), project(projectB, 100)],
	);

	assert.deepEqual(
		result.bookmarkPatches.map((patch) => ({
			id: patch.id,
			tags: patch.tags,
			padPosition: patch.padPosition,
		})),
		[
			{ id: "both", tags: ["top"], padPosition: 0 },
			{ id: "neither", tags: ["pinned"], padPosition: 0 },
			{ id: "pinned", tags: ["pinned"], padPosition: 1 },
			{ id: "later-top", tags: ["top"], padPosition: 1 },
		],
	);
	assert.deepEqual(
		result.projectPatches.map((patch) => ({
			id: patch.id,
			position: patch.position,
		})),
		[
			{ id: projectB, position: 0 },
			{ id: projectA, position: 1 },
		],
	);
});

test("equal creation timestamps use document identity as the final tie-breaker", () => {
	const bookmarks = [
		bookmark("bookmark-b", 10, ["top"]),
		bookmark("bookmark-a", 10, ["top"]),
	];
	const projects = [
		project("project-b" as never, 10),
		project("project-a" as never, 10),
	];

	const forward = buildLaunchBackfillPatches(bookmarks, projects);
	const reverse = buildLaunchBackfillPatches(
		[...bookmarks].reverse(),
		[...projects].reverse(),
	);

	assert.deepEqual(forward, reverse);
	assert.deepEqual(
		forward.bookmarkPatches.map((patch) => [patch.id, patch.padPosition]),
		[
			["bookmark-a", 0],
			["bookmark-b", 1],
		],
	);
	assert.deepEqual(
		forward.projectPatches.map((patch) => [patch.id, patch.position]),
		[
			["project-a", 0],
			["project-b", 1],
		],
	);
});

test("membership order follows bookmark creation and preserves duplicate metadata", () => {
	const result = buildLaunchBackfillPatches(
		[
			bookmark(
				"later",
				20,
				["top"],
				[
					{
						projectId: projectA,
						name: "Later prod",
						environment: "prod",
					},
				],
			),
			bookmark(
				"earlier",
				10,
				["pinned"],
				[
					{
						projectId: projectA,
						name: "",
						environment: "prod",
					},
					{
						projectId: projectB,
						name: "QA",
						environment: "qa",
					},
				],
			),
		],
		[project(projectA, 10), project(projectB, 20)],
	);

	const earlier = result.bookmarkPatches.find(
		(patch) => patch.id === "earlier",
	);
	const later = result.bookmarkPatches.find((patch) => patch.id === "later");
	assert.deepEqual(earlier?.projects, [
		{
			projectId: projectA,
			name: "",
			environment: "prod",
			position: 0,
		},
		{
			projectId: projectB,
			name: "QA",
			environment: "qa",
			position: 0,
		},
	]);
	assert.deepEqual(later?.projects, [
		{
			projectId: projectA,
			name: "Later prod",
			environment: "prod",
			position: 1,
		},
	]);
});

test("canonical input produces no patches on a second run", () => {
	const bookmarks = [
		bookmark(
			"top",
			10,
			["top"],
			[{ projectId: projectA, environment: "prod", position: 0 }],
			0,
		),
		bookmark(
			"pinned",
			20,
			["pinned"],
			[{ projectId: projectA, environment: "prod", position: 1 }],
			0,
		),
	];
	const projects = [project(projectA, 10, 0)];

	const result = buildLaunchBackfillPatches(bookmarks, projects);

	assert.deepEqual(result.bookmarkPatches, []);
	assert.deepEqual(result.projectPatches, []);
	assert.equal(result.counts.normalizedTags, 0);
	assert.equal(result.counts.repairedPositions, 0);
});

test("migration endpoints expose validators and the no-op auth boundary", async () => {
	const source = await readFile(
		new URL("./launch.ts", import.meta.url),
		"utf8",
	);
	for (const name of ["backfillLayoutOrdering", "verifyLayoutOrdering"]) {
		const handler = source.match(
			new RegExp(`export const ${name}[\\s\\S]*?\\n\\}\\);`),
		)?.[0];
		assert.ok(handler, `expected ${name}`);
		assert.match(handler, /args: \{\}/);
		assert.match(handler, /returns:/);
		assert.match(handler, /requireAuth\(ctx\)/);
	}
	assert.match(
		source,
		/version: 1,[\s\S]*?recentOperationIds: \[\],[\s\S]*?updatedAt:/,
	);
	assert.match(source, /if \(layoutState\)/);
});

test("existing singleton prevents a rerun from resetting newer ordering", async () => {
	const source = await readFile(
		new URL("./launch.ts", import.meta.url),
		"utf8",
	);
	const handler = source.match(
		/export const backfillLayoutOrdering[\s\S]*?\n\}\);/,
	)?.[0];
	assert.ok(handler);

	const singletonGuard = handler.indexOf("if (layoutState)");
	const patchBuilder = handler.indexOf("buildLaunchBackfillPatches");
	assert.ok(singletonGuard >= 0, "expected an existing-singleton guard");
	assert.ok(
		singletonGuard < patchBuilder,
		"expected the singleton guard before patch calculation",
	);
});

test("runtime migration is idempotent and preserves newer state and metadata", async () => {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const projectId = await ctx.db.insert("launchProjects", {
			name: "Project",
			createdAt: 10,
		});
		const bookmarkId = await ctx.db.insert("launchBookmarks", {
			title: "Bookmark",
			url: "https://example.com",
			tags: ["top", "pinned"],
			projects: [
				{
					projectId,
					name: "Production",
					environment: "prod",
				},
			],
			clickCount: 7,
			lastClickedAt: 20,
			createdAt: 11,
		});
		return { bookmarkId, projectId };
	});

	const first = await t.mutation(api.launch.backfillLayoutOrdering, {});
	assert.equal(first.alreadyInitialized, false);
	assert.equal(first.version, 1);
	assert.equal(first.normalizedTags, 1);
	assert.equal(first.memberships, 1);

	await t.run(async (ctx) => {
		const state = await ctx.db.query("launchLayoutState").unique();
		if (!state) throw new Error("Missing layout state");
		await ctx.db.patch(state._id, {
			version: 9,
			recentOperationIds: ["newer-operation"],
			updatedAt: 999,
		});
	});

	const second = await t.mutation(api.launch.backfillLayoutOrdering, {});
	assert.equal(second.alreadyInitialized, true);
	assert.equal(second.version, 9);

	const stored = await t.run(async (ctx) => ({
		bookmark: await ctx.db.get("launchBookmarks", ids.bookmarkId),
		project: await ctx.db.get("launchProjects", ids.projectId),
		states: await ctx.db.query("launchLayoutState").collect(),
	}));
	assert.deepEqual(stored.bookmark?.projects, [
		{
			projectId: ids.projectId,
			name: "Production",
			environment: "prod",
			position: 0,
		},
	]);
	assert.equal(stored.bookmark?.clickCount, 7);
	assert.equal(stored.bookmark?.lastClickedAt, 20);
	assert.equal(stored.project?.name, "Project");
	assert.equal(stored.states.length, 1);
	assert.equal(stored.states[0]?.version, 9);
	assert.deepEqual(stored.states[0]?.recentOperationIds, ["newer-operation"]);
	assert.equal(stored.states[0]?.updatedAt, 999);

	const verification = await t.query(api.launch.verifyLayoutOrdering, {});
	assert.equal(verification.valid, true);
	assert.deepEqual(verification.counts, {
		singletons: 1,
		bookmarks: 1,
		projects: 1,
		memberships: 1,
	});
});

test("runtime verification detects duplicate singleton rows", async () => {
	const t = convexTest(schema, modules);
	await t.run(async (ctx) => {
		for (let index = 0; index < 2; index += 1) {
			await ctx.db.insert("launchLayoutState", {
				key: "default",
				version: index + 1,
				recentOperationIds: [],
				updatedAt: index,
			});
		}
	});

	const result = await t.query(api.launch.verifyLayoutOrdering, {});
	assert.equal(result.valid, false);
	assert.equal(result.counts.singletons, 2);
	assert.deepEqual(result.violations.singleton, [
		"Expected one layout state row, found 2",
	]);
	await assert.rejects(
		t.mutation(api.launch.backfillLayoutOrdering, {}),
		/unique\(\) query returned more than one result/,
	);
});

test("runtime endpoints enforce argument validators and current auth boundary", async () => {
	const t = convexTest(schema, modules);

	await t.mutation(api.launch.backfillLayoutOrdering, {});
	await t.query(api.launch.verifyLayoutOrdering, {});
	await assert.rejects(
		t.mutation(api.launch.backfillLayoutOrdering, {
			extra: true,
		} as never),
		/Validator error/,
	);
	await assert.rejects(
		t.query(api.launch.verifyLayoutOrdering, { extra: true } as never),
		/Validator error/,
	);
});
