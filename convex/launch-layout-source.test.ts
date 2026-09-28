import { readFile } from "node:fs/promises";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type {
	LaunchLayoutOperation,
	LaunchLayoutOperationResult,
	LaunchLayoutSnapshot,
} from "./_utils/launchLayout";
import {
	layoutOperationResultValidator,
	layoutOperationValidator,
	layoutSnapshotValidator,
} from "./_utils/launchLayout";
import schema from "./schema";

const validateSnapshot = query({
	args: { value: layoutSnapshotValidator },
	returns: layoutSnapshotValidator,
	handler: (_ctx, args) => args.value,
});
const validateResult = query({
	args: { value: layoutOperationResultValidator },
	returns: layoutOperationResultValidator,
	handler: (_ctx, args) => args.value,
});
const validateOperation = query({
	args: { value: layoutOperationValidator },
	returns: layoutOperationValidator,
	handler: (_ctx, args) => args.value,
});
const modules = {
	...import.meta.glob("./**/*.ts"),
	"./launchLayoutValidatorHarness.ts": async () => ({
		validateOperation,
		validateResult,
		validateSnapshot,
	}),
};
const validateSnapshotReference = makeFunctionReference<
	"query",
	{ value: LaunchLayoutSnapshot },
	LaunchLayoutSnapshot
>("launchLayoutValidatorHarness:validateSnapshot");
const validateResultReference = makeFunctionReference<
	"query",
	{ value: LaunchLayoutOperationResult },
	LaunchLayoutOperationResult
>("launchLayoutValidatorHarness:validateResult");
const validateOperationReference = makeFunctionReference<
	"query",
	{ value: LaunchLayoutOperation },
	LaunchLayoutOperation
>("launchLayoutValidatorHarness:validateOperation");

const schemaSource = await readFile(
	new URL("./schema.ts", import.meta.url),
	"utf8",
);
const validatorSource = await readFile(
	new URL("./_utils/launchLayout.ts", import.meta.url),
	"utf8",
);
const launchSource = await readFile(
	new URL("./launch.ts", import.meta.url),
	"utf8",
);

test("schema keeps all ordering positions optional during migration", () => {
	expect(schemaSource).toMatch(
		/launchProjects: defineTable\(\{[\s\S]*?position: v\.optional\(v\.number\(\)\),[\s\S]*?createdAt:/,
	);
	expect(schemaSource).toMatch(
		/launchBookmarks: defineTable\(\{[\s\S]*?padPosition: v\.optional\(v\.number\(\)\),/,
	);
	expect(validatorSource).toMatch(
		/projectMembershipValidator = v\.object\(\{[\s\S]*?position: v\.optional\(v\.number\(\)\),/,
	);
});

test("Task 15 Phase 4 tightening stays deferred until production verification and one release", () => {
	for (const name of [
		"backfillLayoutOrdering",
		"verifyLayoutOrdering",
		"list",
		"listProjects",
		"setProjects",
	]) {
		expect(launchSource).toMatch(new RegExp(`export const ${name} = `));
	}
	expect(schemaSource).not.toMatch(
		/launchProjects: defineTable\(\{[^}]*position: v\.number\(\)/,
	);
	expect(schemaSource).not.toMatch(/padPosition: v\.number\(\)/);
	expect(validatorSource).not.toMatch(
		/projectMembershipValidator = v\.object\(\{[^}]*position: v\.number\(\)/,
	);
});

test("schema defines the indexed singleton layout state", () => {
	expect(schemaSource).toMatch(
		/launchLayoutState: defineTable\(\{[\s\S]*?key: v\.literal\("default"\),[\s\S]*?version: v\.number\(\),[\s\S]*?recentOperationIds: v\.array\(v\.string\(\)\),[\s\S]*?updatedAt: v\.number\(\),[\s\S]*?\}\)\.index\("by_key", \["key"\]\)/,
	);
});

describe("shared launch validators at runtime", () => {
	test.each(["prod", "qa", "stage", "dev", "local"] as const)(
		"schema accepts duplicate %s environments in one project",
		async (environment) => {
			const t = convexTest(schema, modules);
			const rows = await t.run(async (ctx) => {
				const projectId = await ctx.db.insert("launchProjects", {
					name: "Shared project",
					createdAt: 1,
				});
				for (let index = 0; index < 2; index += 1) {
					await ctx.db.insert("launchBookmarks", {
						title: `Bookmark ${index}`,
						url: `https://example.com/${index}`,
						tags: ["top"],
						projects: [{ projectId, environment }],
						clickCount: 0,
						createdAt: index,
					});
				}
				return await ctx.db.query("launchBookmarks").collect();
			});

			expect(rows.map((row) => row.projects[0]?.environment)).toEqual([
				environment,
				environment,
			]);
		},
	);

	test("public snapshot plus applied and conflict results preserve full nested shapes", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const projectId = await ctx.db.insert("launchProjects", {
				name: "Project",
				position: 0,
				createdAt: 10,
			});
			const bookmarkId = await ctx.db.insert("launchBookmarks", {
				title: "Bookmark",
				url: "https://example.com",
				tags: ["top"],
				padPosition: 0,
				projects: [
					{
						projectId,
						name: "Named membership",
						environment: "prod",
						position: 0,
					},
				],
				clickCount: 3,
				lastClickedAt: 20,
				createdAt: 11,
			});
			await ctx.db.insert("launchLayoutState", {
				key: "default",
				version: 4,
				recentOperationIds: [],
				updatedAt: 12,
			});
			return { bookmarkId, projectId };
		});

		const rawSnapshot = await t.run(async (ctx) => {
			const bookmark = await ctx.db.get("launchBookmarks", ids.bookmarkId);
			const project = await ctx.db.get("launchProjects", ids.projectId);
			if (!bookmark || !project) throw new Error("Missing seeded layout");
			const { clickCount, lastClickedAt, ...snapshotBookmark } = bookmark;
			return {
				version: 4,
				bookmarks: [snapshotBookmark],
				projects: [project],
			};
		});
		const snapshot = await t.query(validateSnapshotReference, {
			value: rawSnapshot as unknown as LaunchLayoutSnapshot,
		});
		expectSnapshotShape(snapshot, ids);

		const applied = await t.query(validateResultReference, {
			value: {
				...snapshot,
				status: "applied",
				operationId: "applied-shape",
			},
		});
		expect(applied).toMatchObject({
			status: "applied",
			operationId: "applied-shape",
			version: 4,
		});
		expectSnapshotShape(applied, ids);

		const conflict = await t.query(validateResultReference, {
			value: {
				...snapshot,
				status: "conflict",
				operationId: "conflict-shape",
			},
		});
		expect(conflict).toMatchObject({
			status: "conflict",
			operationId: "conflict-shape",
			version: 4,
		});
		expectSnapshotShape(conflict, ids);
	});

	test("public snapshots require canonical numeric positions", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const projectId = await ctx.db.insert("launchProjects", {
				name: "Project",
				createdAt: 1,
			});
			const bookmarkId = await ctx.db.insert("launchBookmarks", {
				title: "Bookmark",
				url: "https://example.com",
				tags: ["top"],
				projects: [{ projectId }],
				clickCount: 0,
				createdAt: 2,
			});
			return { bookmarkId, projectId };
		});
		const base = {
			version: 1,
			bookmarks: [
				{
					_id: ids.bookmarkId,
					_creationTime: 2,
					title: "Bookmark",
					url: "https://example.com",
					tags: ["top"] as const,
					padPosition: 0,
					projects: [{ projectId: ids.projectId, position: 0 }],
					createdAt: 2,
				},
			],
			projects: [
				{
					_id: ids.projectId,
					_creationTime: 1,
					name: "Project",
					position: 0,
					createdAt: 1,
				},
			],
		};

		for (const value of [
			{
				...base,
				bookmarks: [{ ...base.bookmarks[0], padPosition: undefined }],
			},
			{
				...base,
				bookmarks: [
					{
						...base.bookmarks[0],
						projects: [{ projectId: ids.projectId }],
					},
				],
			},
			{
				...base,
				projects: [{ ...base.projects[0], position: undefined }],
			},
			// Click counters change on ordinary navigation, so the canonical
			// snapshot must not carry them.
			{
				...base,
				bookmarks: [{ ...base.bookmarks[0], clickCount: 0 }],
			},
			{
				...base,
				bookmarks: [{ ...base.bookmarks[0], lastClickedAt: 20 }],
			},
		]) {
			await expect(
				t.query(validateSnapshotReference, {
					value: value as unknown as LaunchLayoutSnapshot,
				}),
			).rejects.toThrow(/Validator error/);
		}
	});

	test("operation validator rejects an unknown discriminant", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.query(validateOperationReference, {
				value: {
					kind: "unknown",
					targetIndex: 0,
				} as unknown as LaunchLayoutOperation,
			}),
		).rejects.toThrow(/Validator error: Expected one of object/);
	});
});

function expectSnapshotShape(
	snapshot: LaunchLayoutSnapshot,
	ids: {
		bookmarkId: Id<"launchBookmarks">;
		projectId: Id<"launchProjects">;
	},
): void {
	expect(snapshot.projects).toEqual([
		{
			_id: ids.projectId,
			_creationTime: expect.any(Number),
			name: "Project",
			position: 0,
			createdAt: 10,
		},
	]);
	expect(snapshot.bookmarks).toEqual([
		{
			_id: ids.bookmarkId,
			_creationTime: expect.any(Number),
			title: "Bookmark",
			url: "https://example.com",
			tags: ["top"],
			padPosition: 0,
			projects: [
				{
					projectId: ids.projectId,
					name: "Named membership",
					environment: "prod",
					position: 0,
				},
			],
			createdAt: 11,
		},
	]);
}
