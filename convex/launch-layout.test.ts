/// <reference types="vite/client" />

import { readFile } from "node:fs/promises";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import type {
	LaunchLayoutOperation,
	LaunchLayoutOperationResult,
	LaunchLayoutSnapshot,
} from "./_utils/launchLayout";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const getLayout = makeFunctionReference<
	"query",
	Record<string, never>,
	LaunchLayoutSnapshot
>("launch:getLayout");
const listBookmarks = makeFunctionReference<
	"query",
	Record<string, never>,
	Array<{
		_id: Id<"launchBookmarks">;
		title: string;
		tags: Array<"top" | "pinned">;
		clickCount: number;
	}>
>("launch:list");
const listProjectsCompatibility = makeFunctionReference<
	"query",
	Record<string, never>,
	Array<{ _id: Id<"launchProjects">; name: string }>
>("launch:listProjects");
const applyLayoutOperation = makeFunctionReference<
	"mutation",
	{
		operationId: string;
		expectedVersion: number;
		operation: LaunchLayoutOperation;
	},
	LaunchLayoutOperationResult
>("launch:applyLayoutOperation");
const createBookmark = makeFunctionReference<
	"mutation",
	{ title: string; url: string; tags: string[] },
	Id<"launchBookmarks">
>("launch:create");
const updateBookmark = makeFunctionReference<
	"mutation",
	{
		id: Id<"launchBookmarks">;
		title: string;
		url: string;
		tags: string[];
		projects: Array<{
			projectId: Id<"launchProjects">;
			name?: string;
			environment?: "prod" | "qa" | "stage" | "dev" | "local";
			position?: number;
		}>;
	},
	null
>("launch:update");
const removeBookmark = makeFunctionReference<
	"mutation",
	{ id: Id<"launchBookmarks"> },
	null
>("launch:remove");
const clickBookmark = makeFunctionReference<
	"mutation",
	{ id: Id<"launchBookmarks"> },
	null
>("launch:click");
const createProject = makeFunctionReference<
	"mutation",
	{ name: string },
	Id<"launchProjects">
>("launch:createProject");
const renameProject = makeFunctionReference<
	"mutation",
	{ id: Id<"launchProjects">; name: string },
	null
>("launch:renameProject");
const removeProject = makeFunctionReference<
	"mutation",
	{ id: Id<"launchProjects"> },
	null
>("launch:removeProject");
const setProjects = makeFunctionReference<
	"mutation",
	{
		id: Id<"launchBookmarks">;
		projects: Array<{
			projectId: Id<"launchProjects">;
			name?: string;
			environment?: "prod" | "qa" | "stage" | "dev" | "local";
			position?: number;
		}>;
	},
	null
>("launch:setProjects");
const setProjectEnvironment = makeFunctionReference<
	"mutation",
	{
		id: Id<"launchBookmarks">;
		projectId: Id<"launchProjects">;
		environment: "prod" | "qa" | "stage" | "dev" | "local" | null;
	},
	null
>("launch:setProjectEnvironment");

type SeedOptions = {
	topCount?: number;
	pinnedCount?: number;
	projectCount?: number;
};

function required<T>(items: T[], index: number): T {
	const item = items[index];
	if (item === undefined) throw new Error(`Missing seeded item ${index}`);
	return item;
}

type LayoutErrorData = { code: string; message: string };

async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("Expected the mutation to reject");
}

function requiredMatch<T>(items: T[], predicate: (item: T) => boolean): T {
	const item = items.find(predicate);
	if (item === undefined) throw new Error("Missing expected item");
	return item;
}

async function seed(options: SeedOptions = {}) {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const projectIds: Id<"launchProjects">[] = [];
		for (let index = 0; index < (options.projectCount ?? 2); index += 1) {
			projectIds.push(
				await ctx.db.insert("launchProjects", {
					name: `Project ${index}`,
					position: index,
					createdAt: 100 + index,
				}),
			);
		}
		const topIds: Id<"launchBookmarks">[] = [];
		for (let index = 0; index < (options.topCount ?? 3); index += 1) {
			topIds.push(
				await ctx.db.insert("launchBookmarks", {
					title: `Top ${index}`,
					url: `https://top-${index}.example`,
					tags: ["top"],
					padPosition: index,
					projects:
						index < 2 && projectIds[0]
							? [
									{
										projectId: projectIds[0],
										position: index,
										name: `Override ${index}`,
										environment: "prod",
									},
								]
							: [],
					clickCount: 0,
					createdAt: 200 + index,
				}),
			);
		}
		const pinnedIds: Id<"launchBookmarks">[] = [];
		for (let index = 0; index < (options.pinnedCount ?? 2); index += 1) {
			pinnedIds.push(
				await ctx.db.insert("launchBookmarks", {
					title: `Pinned ${index}`,
					url: `https://pinned-${index}.example`,
					tags: ["pinned"],
					padPosition: index,
					projects: [],
					clickCount: 0,
					createdAt: 300 + index,
				}),
			);
		}
		await ctx.db.insert("launchLayoutState", {
			key: "default",
			version: 7,
			recentOperationIds: [],
			updatedAt: 1,
		});
		return { projectIds, topIds, pinnedIds };
	});
	return { t, ...ids };
}

describe("atomic launch layout", () => {
	test("Task 5: existing mutations stay version-coherent", async () => {
		const { t, topIds, pinnedIds, projectIds } = await seed();

		const createdBookmarkId = await t.mutation(createBookmark, {
			title: "Created",
			url: "created.example",
			tags: ["top", "pinned"],
		});
		let layout = await t.query(getLayout, {});
		expect(layout.version).toBe(8);
		expect(
			requiredMatch(layout.bookmarks, (item) => item._id === createdBookmarkId),
		).toMatchObject({
			tags: ["top"],
			padPosition: 3,
		});

		await t.mutation(updateBookmark, {
			id: createdBookmarkId,
			title: "Updated",
			url: "updated.example",
			tags: [],
			projects: [
				{
					projectId: required(projectIds, 0),
					name: "First prod",
					environment: "prod",
				},
				{
					projectId: required(projectIds, 1),
					name: "Second prod",
					environment: "prod",
				},
			],
		});
		layout = await t.query(getLayout, {});
		expect(layout.version).toBe(9);
		expect(
			requiredMatch(layout.bookmarks, (item) => item._id === createdBookmarkId),
		).toMatchObject({
			title: "Updated",
			tags: ["pinned"],
			padPosition: 2,
			projects: [
				{
					projectId: projectIds[0],
					name: "First prod",
					environment: "prod",
					position: 2,
				},
				{
					projectId: projectIds[1],
					name: "Second prod",
					environment: "prod",
					position: 0,
				},
			],
		});

		await t.mutation(removeBookmark, { id: required(topIds, 0) });
		layout = await t.query(getLayout, {});
		expect(layout.version).toBe(10);
		expect(
			layout.bookmarks
				.filter((item) => item.tags[0] === "top")
				.map((item) => item.padPosition),
		).toEqual([0, 1]);
		expect(
			layout.bookmarks
				.filter((item) =>
					item.projects.some(
						(membership) => membership.projectId === projectIds[0],
					),
				)
				.map(
					(item) =>
						requiredMatch(
							item.projects,
							(membership) => membership.projectId === projectIds[0],
						).position,
				),
		).toEqual([0, 1]);

		await t.mutation(setProjects, {
			id: required(pinnedIds, 0),
			projects: [
				{
					projectId: required(projectIds, 0),
					name: "Kept",
					environment: "prod",
				},
				{
					projectId: required(projectIds, 0),
					name: "Ignored",
					environment: "qa",
				},
				{ projectId: required(projectIds, 1), environment: "prod" },
			],
		});
		layout = await t.query(getLayout, {});
		expect(layout.version).toBe(11);
		expect(
			requiredMatch(layout.bookmarks, (item) => item._id === pinnedIds[0])
				.projects,
		).toEqual([
			{
				projectId: projectIds[0],
				name: "Kept",
				environment: "prod",
				position: 2,
			},
			{ projectId: projectIds[1], environment: "prod", position: 1 },
		]);

		await t.mutation(setProjectEnvironment, {
			id: required(pinnedIds, 0),
			projectId: required(projectIds, 0),
			environment: "prod",
		});
		expect((await t.query(getLayout, {})).version).toBe(12);

		const createdProjectId = await t.mutation(createProject, {
			name: "Created project",
		});
		layout = await t.query(getLayout, {});
		expect(layout.version).toBe(13);
		expect(
			requiredMatch(layout.projects, (item) => item._id === createdProjectId)
				.position,
		).toBe(2);

		await t.mutation(renameProject, {
			id: createdProjectId,
			name: "Renamed project",
		});
		expect((await t.query(getLayout, {})).version).toBe(14);

		await t.mutation(removeProject, { id: required(projectIds, 0) });
		layout = await t.query(getLayout, {});
		expect(layout.version).toBe(15);
		expect(layout.projects.map((item) => item.position)).toEqual([0, 1]);
		expect(
			layout.bookmarks.every((item) =>
				item.projects.every(
					(membership) => membership.projectId !== projectIds[0],
				),
			),
		).toBe(true);

		await t.mutation(clickBookmark, { id: required(pinnedIds, 1) });
		layout = await t.query(getLayout, {});
		expect(layout.version).toBe(15);
		expect(
			requiredMatch(layout.bookmarks, (item) => item._id === pinnedIds[1]),
		).not.toHaveProperty("clickCount");
		expect(
			requiredMatch(
				await t.query(listBookmarks, {}),
				(item) => item._id === pinnedIds[1],
			).clickCount,
		).toBe(1);
	});

	test("clicks leave the layout version and a pending drag untouched", async () => {
		const { t, topIds, pinnedIds } = await seed();
		const before = await t.query(getLayout, {});
		expect(before.version).toBe(7);

		await t.mutation(clickBookmark, { id: required(topIds, 0) });
		await t.mutation(clickBookmark, { id: required(topIds, 0) });
		const afterClicks = await t.query(getLayout, {});
		expect(afterClicks.version).toBe(7);
		expect(afterClicks.bookmarks).toEqual(before.bookmarks);
		expect(
			requiredMatch(
				await t.query(listBookmarks, {}),
				(item) => item._id === topIds[0],
			).clickCount,
		).toBe(2);

		// The drag picked up at version 7 and the clicks happened mid-flight.
		const result = await t.mutation(applyLayoutOperation, {
			operationId: "drag-across-a-click",
			expectedVersion: before.version,
			operation: {
				kind: "movePadLink",
				bookmarkId: required(pinnedIds, 1),
				targetZone: "top",
				targetIndex: 0,
			},
		});
		expect(result.status).toBe("applied");
		expect(result.version).toBe(8);
		expect(
			result.bookmarks
				.filter((item) => item.tags[0] === "top")
				.map((item) => item._id),
		).toEqual([pinnedIds[1], ...topIds]);
	});

	test("the first valid operation initializes an absent singleton at version 0", async () => {
		const t = convexTest(schema, modules);
		const bookmarkIds = await t.run(async (ctx) => {
			const ids: Id<"launchBookmarks">[] = [];
			for (const index of [0, 1]) {
				ids.push(
					await ctx.db.insert("launchBookmarks", {
						title: `Top ${index}`,
						url: `https://top-${index}.example`,
						tags: ["top"],
						padPosition: index,
						projects: [],
						clickCount: 0,
						createdAt: 200 + index,
					}),
				);
			}
			return ids;
		});
		expect(
			await t.run((ctx) => ctx.db.query("launchLayoutState").collect()),
		).toHaveLength(0);
		expect((await t.query(getLayout, {})).version).toBe(0);

		const stale = await t.mutation(applyLayoutOperation, {
			operationId: "stale-before-init",
			expectedVersion: 3,
			operation: {
				kind: "movePadLink",
				bookmarkId: required(bookmarkIds, 1),
				targetZone: "pinned",
				targetIndex: 0,
			},
		});
		expect(stale.status).toBe("conflict");
		expect(stale.version).toBe(0);
		expect(
			await t.run((ctx) => ctx.db.query("launchLayoutState").collect()),
		).toHaveLength(0);

		const applied = await t.mutation(applyLayoutOperation, {
			operationId: "first-move",
			expectedVersion: 0,
			operation: {
				kind: "movePadLink",
				bookmarkId: required(bookmarkIds, 1),
				targetZone: "pinned",
				targetIndex: 0,
			},
		});
		expect(applied.status).toBe("applied");
		expect(applied.version).toBe(1);
		const states = await t.run((ctx) =>
			ctx.db.query("launchLayoutState").collect(),
		);
		expect(states).toHaveLength(1);
		expect(states[0]).toMatchObject({
			key: "default",
			version: 1,
			recentOperationIds: ["first-move"],
		});
		const layout = await t.query(getLayout, {});
		expect(layout.version).toBe(1);
		expect(
			layout.bookmarks.filter((item) => item.tags[0] === "pinned")[0]?._id,
		).toBe(bookmarkIds[1]);

		const replay = await t.mutation(applyLayoutOperation, {
			operationId: "first-move",
			expectedVersion: 0,
			operation: {
				kind: "movePadLink",
				bookmarkId: required(bookmarkIds, 1),
				targetZone: "pinned",
				targetIndex: 0,
			},
		});
		expect(replay.status).toBe("applied");
		expect(replay.version).toBe(1);
	});

	test("Task 5: setProjects canonicalizes memberships", async () => {
		const { t, topIds, projectIds } = await seed();
		const bookmarkId = required(topIds, 0);
		const retainedProjectId = required(projectIds, 0);
		const addedProjectId = required(projectIds, 1);

		await t.mutation(setProjects, {
			id: bookmarkId,
			projects: [
				{
					projectId: retainedProjectId,
					name: "Override 0",
					environment: "prod",
					position: 0,
				},
				{ projectId: addedProjectId, environment: "prod", position: 0 },
			],
		});

		const layout = await t.query(getLayout, {});
		expect(layout.version).toBe(8);
		expect(
			requiredMatch(layout.bookmarks, (item) => item._id === bookmarkId)
				.projects,
		).toEqual([
			{
				projectId: retainedProjectId,
				name: "Override 0",
				environment: "prod",
				position: 0,
			},
			{ projectId: addedProjectId, environment: "prod", position: 0 },
		]);
		expect(
			layout.bookmarks
				.filter((item) =>
					item.projects.some(
						(membership) => membership.projectId === retainedProjectId,
					),
				)
				.map(
					(item) =>
						requiredMatch(
							item.projects,
							(membership) => membership.projectId === retainedProjectId,
						).position,
				),
		).toEqual([0, 1]);
	});

	test("Task 5: create compacts existing positions before appending", async () => {
		const { t, topIds, projectIds } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch("launchBookmarks", required(topIds, 0), {
				padPosition: 20,
			});
			await ctx.db.patch("launchBookmarks", required(topIds, 1), {
				padPosition: 10,
			});
			await ctx.db.patch("launchProjects", required(projectIds, 0), {
				position: 20,
			});
			await ctx.db.patch("launchProjects", required(projectIds, 1), {
				position: 10,
			});
		});

		await t.mutation(createBookmark, {
			title: "Appended bookmark",
			url: "bookmark.example",
			tags: ["top"],
		});
		await t.mutation(createProject, { name: "Appended project" });

		const layout = await t.query(getLayout, {});
		expect(
			layout.bookmarks
				.filter((bookmark) => bookmark.tags[0] === "top")
				.map((bookmark) => [bookmark.title, bookmark.padPosition]),
		).toEqual([
			["Top 2", 0],
			["Top 1", 1],
			["Top 0", 2],
			["Appended bookmark", 3],
		]);
		expect(
			layout.projects.map((project) => [project.name, project.position]),
		).toEqual([
			["Project 1", 0],
			["Project 0", 1],
			["Appended project", 2],
		]);
	});

	test("Task 5: environment updates increment layout version", async () => {
		const { t, topIds, projectIds } = await seed();
		const projectId = required(projectIds, 0);

		await t.mutation(setProjectEnvironment, {
			id: required(topIds, 0),
			projectId,
			environment: "qa",
		});

		const layout = await t.query(getLayout, {});
		expect(layout.version).toBe(8);
		expect(
			requiredMatch(layout.bookmarks, (item) => item._id === topIds[0])
				.projects[0]?.environment,
		).toBe("qa");
		expect(
			requiredMatch(layout.bookmarks, (item) => item._id === topIds[1])
				.projects[0]?.environment,
		).toBe("prod");
	});

	test("Task 5: URL edits preserve unrelated malformed layout state", async () => {
		const { t, topIds, pinnedIds, projectIds } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch("launchBookmarks", required(pinnedIds, 0), {
				tags: [],
				padPosition: 41,
				projects: [{ projectId: required(projectIds, 1), position: 37 }],
			});
			await ctx.db.patch("launchProjects", required(projectIds, 1), {
				position: 29,
			});
		});

		await t.mutation(updateBookmark, {
			id: required(topIds, 2),
			title: "Top 2",
			url: "edited.example?utm_source=test",
			tags: ["top"],
			projects: [],
		});

		const stored = await t.run(async (ctx) => ({
			bookmark: await ctx.db.get("launchBookmarks", required(pinnedIds, 0)),
			project: await ctx.db.get("launchProjects", required(projectIds, 1)),
		}));
		expect(stored.bookmark).toMatchObject({
			tags: [],
			padPosition: 41,
			projects: [{ projectId: projectIds[1], position: 37 }],
		});
		expect(stored.project?.position).toBe(29);
		const layout = await t.query(getLayout, {});
		expect(layout.version).toBe(8);
		expect(
			requiredMatch(layout.bookmarks, (item) => item._id === pinnedIds[0]),
		).toMatchObject({
			tags: ["pinned"],
			padPosition: 1,
			projects: [{ projectId: projectIds[1], position: 0 }],
		});
	});

	test("Task 5: project pickers write only affected memberships", async () => {
		const { t, topIds, pinnedIds, projectIds } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch("launchBookmarks", required(pinnedIds, 1), {
				tags: [],
				padPosition: 51,
				projects: [{ projectId: required(projectIds, 1), position: 44 }],
			});
		});

		await t.mutation(setProjects, {
			id: required(topIds, 2),
			projects: [{ projectId: required(projectIds, 0), environment: "qa" }],
		});
		await t.mutation(setProjectEnvironment, {
			id: required(topIds, 2),
			projectId: required(projectIds, 0),
			environment: "stage",
		});

		const stored = await t.run(
			async (ctx) =>
				await ctx.db.get("launchBookmarks", required(pinnedIds, 1)),
		);
		expect(stored).toMatchObject({
			tags: [],
			padPosition: 51,
			projects: [{ projectId: projectIds[1], position: 44 }],
		});
		expect((await t.query(getLayout, {})).version).toBe(9);
	});

	test("Task 5: creates compact only their affected list", async () => {
		const { t, topIds, pinnedIds, projectIds } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch("launchBookmarks", required(topIds, 0), {
				padPosition: 20,
			});
			await ctx.db.patch("launchBookmarks", required(topIds, 1), {
				padPosition: 10,
			});
			await ctx.db.patch("launchBookmarks", required(pinnedIds, 0), {
				tags: [],
				padPosition: 71,
				projects: [{ projectId: required(projectIds, 0), position: 63 }],
			});
			await ctx.db.patch("launchProjects", required(projectIds, 0), {
				position: 30,
			});
			await ctx.db.patch("launchProjects", required(projectIds, 1), {
				position: 10,
			});
		});

		await t.mutation(createBookmark, {
			title: "New top",
			url: "new-top.example",
			tags: ["top"],
		});
		let unrelated = await t.run(
			async (ctx) =>
				await ctx.db.get("launchBookmarks", required(pinnedIds, 0)),
		);
		expect(unrelated).toMatchObject({
			tags: [],
			padPosition: 71,
			projects: [{ projectId: projectIds[0], position: 63 }],
		});

		await t.mutation(createProject, { name: "New project" });
		unrelated = await t.run(
			async (ctx) =>
				await ctx.db.get("launchBookmarks", required(pinnedIds, 0)),
		);
		expect(unrelated).toMatchObject({
			tags: [],
			padPosition: 71,
			projects: [{ projectId: projectIds[0], position: 63 }],
		});
		expect((await t.query(getLayout, {})).version).toBe(9);
	});

	test("Task 5: deletes compact only affected lists", async () => {
		const { t, topIds, pinnedIds, projectIds } = await seed({
			projectCount: 3,
		});
		await t.run(async (ctx) => {
			await ctx.db.patch("launchBookmarks", required(pinnedIds, 0), {
				tags: [],
				padPosition: 81,
				projects: [{ projectId: required(projectIds, 1), position: 73 }],
			});
			await ctx.db.patch("launchProjects", required(projectIds, 2), {
				position: 61,
			});
		});

		await t.mutation(removeBookmark, { id: required(topIds, 0) });
		let unrelated = await t.run(
			async (ctx) =>
				await ctx.db.get("launchBookmarks", required(pinnedIds, 0)),
		);
		expect(unrelated).toMatchObject({
			tags: [],
			padPosition: 81,
			projects: [{ projectId: projectIds[1], position: 73 }],
		});
		expect(
			(
				await t.run(
					async (ctx) =>
						await ctx.db.get("launchProjects", required(projectIds, 2)),
				)
			)?.position,
		).toBe(61);

		await t.mutation(removeProject, { id: required(projectIds, 0) });
		unrelated = await t.run(
			async (ctx) =>
				await ctx.db.get("launchBookmarks", required(pinnedIds, 0)),
		);
		expect(unrelated).toMatchObject({
			tags: [],
			padPosition: 81,
			projects: [{ projectId: projectIds[1], position: 73 }],
		});
		expect((await t.query(getLayout, {})).version).toBe(9);
	});

	test("Task 5: compatibility lists return canonical order", async () => {
		const { t, topIds, projectIds } = await seed({ projectCount: 3 });
		await t.run(async (ctx) => {
			await ctx.db.patch("launchBookmarks", required(topIds, 0), {
				padPosition: 2,
			});
			await ctx.db.patch("launchBookmarks", required(topIds, 2), {
				padPosition: 0,
			});
			await ctx.db.patch("launchProjects", required(projectIds, 0), {
				position: 2,
			});
			await ctx.db.patch("launchProjects", required(projectIds, 2), {
				position: 0,
			});
		});

		const bookmarks = await t.query(listBookmarks, {});
		const projects = await t.query(listProjectsCompatibility, {});
		expect(bookmarks.slice(0, 3).map((item) => item.title)).toEqual([
			"Top 2",
			"Top 1",
			"Top 0",
		]);
		expect(projects.map((item) => item.name)).toEqual([
			"Project 2",
			"Project 1",
			"Project 0",
		]);
	});

	test("public wrappers have validators and invoke requireAuth", async () => {
		const source = await readFile(
			new URL("./launch.ts", import.meta.url),
			"utf8",
		);
		for (const name of ["getLayout", "applyLayoutOperation"]) {
			const start = source.indexOf(`export const ${name}`);
			expect(start).toBeGreaterThan(-1);
			const body = source.slice(start, source.indexOf("\n});", start) + 4);
			expect(body).toContain("args:");
			expect(body).toContain("returns:");
			expect(body).toContain("requireAuth(ctx)");
		}
		const applyStart = source.indexOf("export const applyLayoutOperation");
		const applyBody = source.slice(
			applyStart,
			source.indexOf("\n});", applyStart) + 4,
		);
		expect(applyBody).toContain(".take(MAX_LAUNCH_BOOKMARKS + 1)");
		expect(applyBody).toContain(".take(MAX_LAUNCH_PROJECTS + 1)");
	});

	test("getLayout canonicalizes legacy fallback order", async () => {
		const { t } = await seed({ topCount: 0, pinnedCount: 0, projectCount: 0 });
		await t.run(async (ctx) => {
			await ctx.db.insert("launchBookmarks", {
				title: "Later",
				url: "https://later.example",
				tags: ["top", "pinned"],
				projects: [],
				clickCount: 0,
				createdAt: 2,
			});
			await ctx.db.insert("launchBookmarks", {
				title: "Earlier",
				url: "https://earlier.example",
				tags: [],
				projects: [],
				clickCount: 0,
				createdAt: 1,
			});
		});

		const layout = await t.query(getLayout, {});
		expect(layout.version).toBe(7);
		expect(
			layout.bookmarks.map((item) => [item.title, item.tags, item.padPosition]),
		).toEqual([
			["Later", ["top"], 0],
			["Earlier", ["pinned"], 0],
		]);
	});

	test("moves Pad links atomically and compacts both zones", async () => {
		const { t, topIds } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch("launchBookmarks", required(topIds, 0), {
				padPosition: 10,
			});
			await ctx.db.patch("launchBookmarks", required(topIds, 1), {
				padPosition: 20,
			});
			await ctx.db.patch("launchBookmarks", required(topIds, 2), {
				padPosition: 30,
			});
		});
		const result = await t.mutation(applyLayoutOperation, {
			operationId: "pad-move",
			expectedVersion: 7,
			operation: {
				kind: "movePadLink",
				bookmarkId: required(topIds, 1),
				targetZone: "pinned",
				targetIndex: 1,
			},
		});

		expect(result.status).toBe("applied");
		expect(result.version).toBe(8);
		expect(
			result.bookmarks
				.filter((item) => item.tags[0] === "top")
				.map((item) => [item.title, item.padPosition]),
		).toEqual([
			["Top 0", 0],
			["Top 2", 1],
		]);
		expect(
			result.bookmarks
				.filter((item) => item.tags[0] === "pinned")
				.map((item) => [item.title, item.padPosition]),
		).toEqual([
			["Pinned 0", 0],
			["Top 1", 1],
			["Pinned 1", 2],
		]);
		const stored = await t.run(async (ctx) => {
			const bookmarks = await ctx.db.query("launchBookmarks").collect();
			return {
				top: bookmarks
					.filter((item) => item.tags[0] === "top")
					.sort((a, b) => (a.padPosition ?? 0) - (b.padPosition ?? 0))
					.map((item) => [item.title, item.padPosition]),
				pinned: bookmarks
					.filter((item) => item.tags[0] === "pinned")
					.sort((a, b) => (a.padPosition ?? 0) - (b.padPosition ?? 0))
					.map((item) => [item.title, item.padPosition]),
			};
		});
		expect(stored).toEqual({
			top: [
				["Top 0", 0],
				["Top 2", 1],
			],
			pinned: [
				["Pinned 0", 0],
				["Top 1", 1],
				["Pinned 1", 2],
			],
		});
	});

	test("reorders and adds project memberships without changing metadata", async () => {
		const { t, topIds, projectIds } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch("launchBookmarks", required(topIds, 0), {
				projects: [
					{
						projectId: required(projectIds, 0),
						position: 10,
						name: "Override 0",
						environment: "prod",
					},
				],
			});
			await ctx.db.patch("launchBookmarks", required(topIds, 1), {
				projects: [
					{
						projectId: required(projectIds, 0),
						position: 30,
						name: "Override 1",
						environment: "prod",
					},
				],
			});
		});
		const reordered = await t.mutation(applyLayoutOperation, {
			operationId: "same-project",
			expectedVersion: 7,
			operation: {
				kind: "placeProjectLink",
				bookmarkId: required(topIds, 0),
				sourceProjectId: projectIds[0],
				targetProjectId: required(projectIds, 0),
				targetIndex: 99,
			},
		});
		const preserved = requiredMatch(
			reordered.bookmarks,
			(item) => item._id === topIds[0],
		).projects[0];
		expect(preserved).toMatchObject({
			name: "Override 0",
			environment: "prod",
			position: 1,
		});

		const added = await t.mutation(applyLayoutOperation, {
			operationId: "cross-project",
			expectedVersion: 8,
			operation: {
				kind: "placeProjectLink",
				bookmarkId: required(topIds, 0),
				sourceProjectId: projectIds[0],
				targetProjectId: required(projectIds, 1),
				targetIndex: 0,
			},
		});
		const memberships = requiredMatch(
			added.bookmarks,
			(item) => item._id === topIds[0],
		).projects;
		expect(memberships).toHaveLength(2);
		expect(
			memberships.find((item) => item.projectId === projectIds[0]),
		).toMatchObject({
			name: "Override 0",
			environment: "prod",
		});
		expect(
			memberships.find((item) => item.projectId === projectIds[1]),
		).toEqual({
			projectId: projectIds[1],
			position: 0,
		});
		const storedMemberships = await t.run(async (ctx) =>
			(await ctx.db.query("launchBookmarks").collect())
				.flatMap((bookmark) =>
					bookmark.projects
						.filter((item) => item.projectId === projectIds[0])
						.map((item) => [bookmark.title, item.position]),
				)
				.sort((a, b) => Number(a[1]) - Number(b[1])),
		);
		expect(storedMemberships).toEqual([
			["Top 1", 0],
			["Top 0", 1],
		]);
	});

	test("reorders projects and clamps large indexes", async () => {
		const { t, projectIds } = await seed({ projectCount: 3 });
		await t.run(async (ctx) => {
			await ctx.db.patch("launchProjects", required(projectIds, 1), {
				position: 10,
			});
			await ctx.db.patch("launchProjects", required(projectIds, 2), {
				position: 30,
			});
		});
		const result = await t.mutation(applyLayoutOperation, {
			operationId: "project-move",
			expectedVersion: 7,
			operation: {
				kind: "moveProject",
				projectId: required(projectIds, 0),
				targetIndex: 999,
			},
		});
		expect(result.projects.map((item) => [item.name, item.position])).toEqual([
			["Project 1", 0],
			["Project 2", 1],
			["Project 0", 2],
		]);
		const stored = await t.run(async (ctx) =>
			(await ctx.db.query("launchProjects").collect())
				.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
				.map((item) => [item.name, item.position]),
		);
		expect(stored).toEqual([
			["Project 1", 0],
			["Project 2", 1],
			["Project 0", 2],
		]);
	});

	test("conflicts make zero writes and duplicate IDs are idempotent", async () => {
		const { t, topIds } = await seed();
		const stateBefore = await t.run(
			async (ctx) =>
				await ctx.db
					.query("launchLayoutState")
					.withIndex("by_key", (q) => q.eq("key", "default"))
					.unique(),
		);
		const operation = {
			kind: "movePadLink" as const,
			bookmarkId: required(topIds, 0),
			targetZone: "top" as const,
			targetIndex: 2,
		};
		const conflict = await t.mutation(applyLayoutOperation, {
			operationId: "stale",
			expectedVersion: 6,
			operation,
		});
		expect(conflict.status).toBe("conflict");
		expect(conflict.version).toBe(7);
		const stateAfterConflict = await t.run(
			async (ctx) =>
				await ctx.db
					.query("launchLayoutState")
					.withIndex("by_key", (q) => q.eq("key", "default"))
					.unique(),
		);
		expect(stateAfterConflict).toEqual(stateBefore);

		const first = await t.mutation(applyLayoutOperation, {
			operationId: "once",
			expectedVersion: 7,
			operation,
		});
		const duplicate = await t.mutation(applyLayoutOperation, {
			operationId: "once",
			expectedVersion: 7,
			operation,
		});
		expect(first.version).toBe(8);
		expect(duplicate.status).toBe("applied");
		expect(duplicate.version).toBe(8);
		expect(duplicate.bookmarks).toEqual(first.bookmarks);
	});

	test.each([
		{ tags: ["top", "pinned"] as const, targetZone: "top" as const },
		{ tags: [] as const, targetZone: "pinned" as const },
	])(
		"persists canonical tags for an affected bookmark with tags $tags",
		async ({ tags, targetZone }) => {
			const { t, topIds, pinnedIds } = await seed();
			const bookmarkId =
				targetZone === "top" ? required(topIds, 0) : required(pinnedIds, 0);
			await t.run(async (ctx) => {
				await ctx.db.patch("launchBookmarks", bookmarkId, {
					tags: [...tags],
				});
			});

			await t.mutation(applyLayoutOperation, {
				operationId: `canonical-${targetZone}`,
				expectedVersion: 7,
				operation: {
					kind: "movePadLink",
					bookmarkId,
					targetZone,
					targetIndex: 0,
				},
			});

			const stored = await t.run(
				async (ctx) => await ctx.db.get("launchBookmarks", bookmarkId),
			);
			expect(stored?.tags).toEqual([targetZone]);
		},
	);

	test("persists membership compaction only for affected projects", async () => {
		const { t, topIds, projectIds } = await seed();
		const bookmarkId = required(topIds, 0);
		const unrelatedProjectId = required(projectIds, 1);
		await t.run(async (ctx) => {
			const bookmark = await ctx.db.get("launchBookmarks", bookmarkId);
			if (!bookmark) throw new Error("Missing bookmark");
			await ctx.db.patch("launchBookmarks", bookmarkId, {
				projects: [
					...bookmark.projects,
					{ projectId: unrelatedProjectId, position: 10 },
				],
			});
		});

		const result = await t.mutation(applyLayoutOperation, {
			operationId: "project-move-unrelated-membership",
			expectedVersion: 7,
			operation: {
				kind: "placeProjectLink",
				bookmarkId,
				sourceProjectId: required(projectIds, 0),
				targetProjectId: required(projectIds, 0),
				targetIndex: 1,
			},
		});

		expect(
			requiredMatch(
				result.bookmarks,
				(item) => item._id === bookmarkId,
			).projects.find(
				(membership) => membership.projectId === unrelatedProjectId,
			)?.position,
		).toBe(0);
		const stored = await t.run(
			async (ctx) => await ctx.db.get("launchBookmarks", bookmarkId),
		);
		expect(
			stored?.projects.find(
				(membership) => membership.projectId === projectIds[0],
			)?.position,
		).toBe(1);
		expect(
			stored?.projects.find(
				(membership) => membership.projectId === unrelatedProjectId,
			)?.position,
		).toBe(10);
	});

	test("project placement preserves malformed legacy Pad metadata", async () => {
		const { t, topIds, projectIds } = await seed();
		const firstBookmarkId = required(topIds, 0);
		const secondBookmarkId = required(topIds, 1);
		await t.run(async (ctx) => {
			await ctx.db.patch("launchBookmarks", firstBookmarkId, {
				tags: ["top", "pinned"],
				padPosition: undefined,
			});
			await ctx.db.patch("launchBookmarks", secondBookmarkId, {
				tags: [],
				padPosition: 47,
			});
		});

		await t.mutation(applyLayoutOperation, {
			operationId: "project-move-malformed-pad-metadata",
			expectedVersion: 7,
			operation: {
				kind: "placeProjectLink",
				bookmarkId: firstBookmarkId,
				sourceProjectId: required(projectIds, 0),
				targetProjectId: required(projectIds, 0),
				targetIndex: 1,
			},
		});

		const stored = await t.run(async (ctx) => ({
			first: await ctx.db.get("launchBookmarks", firstBookmarkId),
			second: await ctx.db.get("launchBookmarks", secondBookmarkId),
		}));
		expect(stored.first).toMatchObject({
			tags: ["top", "pinned"],
			projects: [
				expect.objectContaining({
					projectId: projectIds[0],
					position: 1,
				}),
			],
		});
		expect(stored.first?.padPosition).toBeUndefined();
		expect(stored.second).toMatchObject({
			tags: [],
			padPosition: 47,
			projects: [
				expect.objectContaining({
					projectId: projectIds[0],
					position: 0,
				}),
			],
		});
	});

	test("validates operation identifiers, indexes, identities, and source membership", async () => {
		const { t, topIds, projectIds } = await seed();
		const missing = await t.run(async (ctx) => {
			const bookmarkId = await ctx.db.insert("launchBookmarks", {
				title: "Deleted",
				url: "https://deleted.example",
				tags: ["top"],
				projects: [],
				clickCount: 0,
				createdAt: 999,
			});
			const projectId = await ctx.db.insert("launchProjects", {
				name: "Deleted",
				createdAt: 999,
			});
			await ctx.db.delete("launchBookmarks", bookmarkId);
			await ctx.db.delete("launchProjects", projectId);
			return { bookmarkId, projectId };
		});
		const cases = [
			{
				operationId: "",
				code: "invalid-operation",
				operation: {
					kind: "moveProject",
					projectId: required(projectIds, 0),
					targetIndex: 0,
				},
			},
			{
				operationId: "x".repeat(101),
				code: "invalid-operation",
				operation: {
					kind: "moveProject",
					projectId: required(projectIds, 0),
					targetIndex: 0,
				},
			},
			{
				operationId: "negative",
				code: "invalid-operation",
				operation: {
					kind: "moveProject",
					projectId: required(projectIds, 0),
					targetIndex: -1,
				},
			},
			{
				operationId: "fraction",
				code: "invalid-operation",
				operation: {
					kind: "moveProject",
					projectId: required(projectIds, 0),
					targetIndex: 0.5,
				},
			},
			{
				operationId: "missing-bookmark",
				code: "missing-item",
				operation: {
					kind: "movePadLink",
					bookmarkId: missing.bookmarkId,
					targetZone: "top",
					targetIndex: 0,
				},
			},
			{
				operationId: "missing-project",
				code: "missing-item",
				operation: {
					kind: "moveProject",
					projectId: missing.projectId,
					targetIndex: 0,
				},
			},
			{
				operationId: "missing-target",
				code: "missing-target",
				operation: {
					kind: "placeProjectLink",
					bookmarkId: required(topIds, 2),
					targetProjectId: missing.projectId,
					targetIndex: 0,
				},
			},
			{
				operationId: "missing-source",
				code: "missing-item",
				operation: {
					kind: "placeProjectLink",
					bookmarkId: required(topIds, 2),
					sourceProjectId: missing.projectId,
					targetProjectId: required(projectIds, 1),
					targetIndex: 0,
				},
			},
			{
				operationId: "false-source",
				code: "missing-item",
				operation: {
					kind: "placeProjectLink",
					bookmarkId: required(topIds, 2),
					sourceProjectId: projectIds[0],
					targetProjectId: required(projectIds, 1),
					targetIndex: 0,
				},
			},
		] as const;
		for (const item of cases) {
			const error = await rejection(
				t.mutation(applyLayoutOperation, {
					operationId: item.operationId,
					expectedVersion: 7,
					operation: item.operation,
				}),
			);
			expect(error, item.operationId).toBeInstanceOf(ConvexError);
			expect((error as ConvexError<LayoutErrorData>).data.code).toBe(item.code);
		}
	});

	test("definitive cap violations are structured limit errors", async () => {
		const { t, projectIds } = await seed({
			topCount: 251,
			pinnedCount: 0,
			projectCount: 1,
		});
		const error = await rejection(
			t.mutation(applyLayoutOperation, {
				operationId: "too-many",
				expectedVersion: 7,
				operation: {
					kind: "moveProject",
					projectId: required(projectIds, 0),
					targetIndex: 0,
				},
			}),
		);
		expect(error).toBeInstanceOf(ConvexError);
		expect((error as ConvexError<LayoutErrorData>).data).toEqual({
			code: "limit-exceeded",
			message: "A Pad zone supports at most 250 bookmarks",
		});
	});

	test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
		"rejects non-finite target index %s",
		async (targetIndex) => {
			const { t, projectIds } = await seed({ projectCount: 1 });
			const error = await rejection(
				t.mutation(applyLayoutOperation, {
					operationId: "non-finite",
					expectedVersion: 7,
					operation: {
						kind: "moveProject",
						projectId: required(projectIds, 0),
						targetIndex,
					},
				}),
			);
			expect(error).toBeInstanceOf(ConvexError);
			expect((error as ConvexError<LayoutErrorData>).data.code).toBe(
				"invalid-operation",
			);
		},
	);

	test("retains only 50 deduplicated operation IDs", async () => {
		const { t, projectIds } = await seed({ projectCount: 1 });
		for (let index = 0; index < 52; index += 1) {
			await t.mutation(applyLayoutOperation, {
				operationId: `operation-${index}`,
				expectedVersion: 7 + index,
				operation: {
					kind: "moveProject",
					projectId: required(projectIds, 0),
					targetIndex: 0,
				},
			});
		}
		const state = await t.run(
			async (ctx) =>
				await ctx.db
					.query("launchLayoutState")
					.withIndex("by_key", (q) => q.eq("key", "default"))
					.unique(),
		);
		expect(state?.version).toBe(59);
		expect(state?.recentOperationIds).toHaveLength(50);
		expect(state?.recentOperationIds[0]).toBe("operation-2");
	});

	test("deduplicates pre-existing recent operation IDs by latest occurrence", async () => {
		const { t, projectIds } = await seed({ projectCount: 1 });
		await t.run(async (ctx) => {
			const state = await ctx.db
				.query("launchLayoutState")
				.withIndex("by_key", (q) => q.eq("key", "default"))
				.unique();
			if (!state) throw new Error("Missing layout state");
			await ctx.db.patch("launchLayoutState", state._id, {
				recentOperationIds: ["old", "keep", "old"],
			});
		});

		await t.mutation(applyLayoutOperation, {
			operationId: "new",
			expectedVersion: 7,
			operation: {
				kind: "moveProject",
				projectId: required(projectIds, 0),
				targetIndex: 0,
			},
		});

		const state = await t.run(
			async (ctx) =>
				await ctx.db
					.query("launchLayoutState")
					.withIndex("by_key", (q) => q.eq("key", "default"))
					.unique(),
		);
		expect(state?.recentOperationIds).toEqual(["keep", "old", "new"]);
	});

	test("rejects duplicate project membership IDs without writes", async () => {
		const { t, topIds, projectIds } = await seed();
		await t.run(async (ctx) => {
			const bookmark = await ctx.db.get("launchBookmarks", required(topIds, 0));
			if (!bookmark) throw new Error("Missing bookmark");
			const membership = required(bookmark.projects, 0);
			await ctx.db.patch("launchBookmarks", bookmark._id, {
				projects: [
					membership,
					{ ...membership, name: "Duplicate", position: 1 },
				],
			});
		});

		await expect(
			t.mutation(applyLayoutOperation, {
				operationId: "duplicate-membership",
				expectedVersion: 7,
				operation: {
					kind: "placeProjectLink",
					bookmarkId: required(topIds, 0),
					targetProjectId: required(projectIds, 0),
					targetIndex: 0,
				},
			}),
		).rejects.toThrow(/duplicate project membership/i);

		const state = await t.run(
			async (ctx) =>
				await ctx.db
					.query("launchLayoutState")
					.withIndex("by_key", (q) => q.eq("key", "default"))
					.unique(),
		);
		expect(state?.version).toBe(7);
		expect(state?.recentOperationIds).toEqual([]);
	});

	test("rejects bounded dataset overages", async () => {
		const { t, projectIds } = await seed({
			topCount: 251,
			pinnedCount: 0,
			projectCount: 1,
		});
		await expect(
			t.mutation(applyLayoutOperation, {
				operationId: "too-many",
				expectedVersion: 7,
				operation: {
					kind: "moveProject",
					projectId: required(projectIds, 0),
					targetIndex: 0,
				},
			}),
		).rejects.toThrow(/250/);
	});

	test("validates dataset caps before duplicate and stale early returns", async () => {
		const duplicate = await seed({
			topCount: 251,
			pinnedCount: 0,
			projectCount: 1,
		});
		await duplicate.t.run(async (ctx) => {
			const state = await ctx.db
				.query("launchLayoutState")
				.withIndex("by_key", (q) => q.eq("key", "default"))
				.unique();
			if (!state) throw new Error("Missing layout state");
			await ctx.db.patch("launchLayoutState", state._id, {
				recentOperationIds: ["already-applied"],
			});
		});
		await expect(
			duplicate.t.mutation(applyLayoutOperation, {
				operationId: "already-applied",
				expectedVersion: 7,
				operation: {
					kind: "moveProject",
					projectId: required(duplicate.projectIds, 0),
					targetIndex: 0,
				},
			}),
		).rejects.toThrow(/250/);

		const stale = await seed({
			topCount: 251,
			pinnedCount: 0,
			projectCount: 1,
		});
		await expect(
			stale.t.mutation(applyLayoutOperation, {
				operationId: "stale-over-limit",
				expectedVersion: 6,
				operation: {
					kind: "moveProject",
					projectId: required(stale.projectIds, 0),
					targetIndex: 0,
				},
			}),
		).rejects.toThrow(/250/);
	});

	test("rejects project count and project membership cap overages", async () => {
		const tooManyProjects = await seed({
			topCount: 1,
			pinnedCount: 0,
			projectCount: 101,
		});
		await expect(
			tooManyProjects.t.mutation(applyLayoutOperation, {
				operationId: "too-many-projects",
				expectedVersion: 7,
				operation: {
					kind: "moveProject",
					projectId: required(tooManyProjects.projectIds, 0),
					targetIndex: 0,
				},
			}),
		).rejects.toThrow(/100/);

		const tooManyMemberships = await seed({
			topCount: 250,
			pinnedCount: 1,
			projectCount: 1,
		});
		await tooManyMemberships.t.run(async (ctx) => {
			const bookmarks = await ctx.db.query("launchBookmarks").collect();
			for (const [position, bookmark] of bookmarks.entries()) {
				await ctx.db.patch("launchBookmarks", bookmark._id, {
					projects: [
						{
							projectId: required(tooManyMemberships.projectIds, 0),
							position,
						},
					],
				});
			}
		});
		await expect(
			tooManyMemberships.t.mutation(applyLayoutOperation, {
				operationId: "too-many-memberships",
				expectedVersion: 7,
				operation: {
					kind: "moveProject",
					projectId: required(tooManyMemberships.projectIds, 0),
					targetIndex: 0,
				},
			}),
		).rejects.toThrow(/250/);
	});
});
