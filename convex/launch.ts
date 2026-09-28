import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	MAX_LAUNCH_BOOKMARKS,
	MAX_LAUNCH_PROJECTS,
	appendRecentOperationId,
	applyLayoutOperationToDocuments,
	buildLaunchBackfillPatches,
	bumpLayoutVersion,
	canonicalLayoutFromDocuments,
	canonicalizeSetProjects,
	launchLayoutError,
	layoutOperationResultValidator,
	layoutOperationValidator,
	layoutSnapshotValidator,
	nextPadPosition,
	readCanonicalLayout,
	validateTargetIndex,
} from "./_utils/launchLayout";
import { requireAuth } from "./auth";

const tagValidator = v.union(v.literal("top"), v.literal("pinned"));

const environmentValidator = v.union(
	v.literal("prod"),
	v.literal("qa"),
	v.literal("stage"),
	v.literal("dev"),
	v.literal("local"),
);

const projectMembershipValidator = v.object({
	projectId: v.id("launchProjects"),
	name: v.optional(v.string()),
	environment: v.optional(environmentValidator),
	position: v.optional(v.number()),
});

const bookmarkValidator = v.object({
	_id: v.id("launchBookmarks"),
	_creationTime: v.number(),
	title: v.string(),
	url: v.string(),
	tags: v.array(tagValidator),
	projects: v.array(projectMembershipValidator),
	clickCount: v.number(),
	lastClickedAt: v.optional(v.number()),
	createdAt: v.number(),
});

export const list = query({
	args: {},
	returns: v.array(bookmarkValidator),
	handler: async (ctx) => {
		requireAuth(ctx);
		const [bookmarks, projects] = await Promise.all([
			ctx.db.query("launchBookmarks").take(MAX_LAUNCH_BOOKMARKS + 1),
			ctx.db.query("launchProjects").take(MAX_LAUNCH_PROJECTS + 1),
		]);
		const canonical = canonicalLayoutFromDocuments(0, bookmarks, projects);
		return canonical.bookmarks.map((bookmark) => {
			const stored = bookmarks.find((item) => item._id === bookmark._id);
			return {
				_id: bookmark._id,
				_creationTime: bookmark._creationTime,
				title: bookmark.title,
				url: bookmark.url,
				tags: bookmark.tags,
				projects: bookmark.projects,
				clickCount: stored?.clickCount ?? 0,
				lastClickedAt: stored?.lastClickedAt,
				createdAt: bookmark.createdAt,
			};
		});
	},
});

export const create = mutation({
	args: {
		title: v.string(),
		url: v.string(),
		tags: v.array(v.string()),
	},
	returns: v.id("launchBookmarks"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const title = args.title.trim();
		const url = normalizeUrl(args.url);
		if (!title) throw new Error("Title is required");
		if (!url) throw new Error("URL is required");
		const [bookmarks, projects] = await Promise.all([
			ctx.db.query("launchBookmarks").collect(),
			ctx.db.query("launchProjects").collect(),
		]);
		const canonical = canonicalLayoutFromDocuments(0, bookmarks, projects);
		const tags = cleanTags(args.tags);
		await persistPadZones(ctx, bookmarks, projects, new Set([tags[0]]));
		const id = await ctx.db.insert("launchBookmarks", {
			title,
			url,
			tags,
			padPosition: nextPadPosition(canonical.bookmarks, tags[0]),
			projects: [],
			clickCount: 0,
			createdAt: Date.now(),
		});
		await bumpLayoutVersion(ctx);
		return id;
	},
});

export const update = mutation({
	args: {
		id: v.id("launchBookmarks"),
		title: v.string(),
		url: v.string(),
		tags: v.array(v.string()),
		projects: v.array(projectMembershipValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Bookmark not found");
		const title = args.title.trim();
		const url = normalizeUrl(args.url);
		if (!title) throw new Error("Title is required");
		if (!url) throw new Error("URL is required");
		const [bookmarks, projects] = await Promise.all([
			ctx.db.query("launchBookmarks").collect(),
			ctx.db.query("launchProjects").collect(),
		]);
		const tags = cleanTags(args.tags);
		const oldZone = cleanTags(existing.tags)[0];
		const requestedProjects = canonicalizeSetProjects(
			bookmarks,
			args.id,
			args.projects,
		);
		const replacement = {
			...existing,
			title,
			url,
			tags,
			padPosition:
				oldZone === tags[0]
					? existing.padPosition
					: nextPadPosition(bookmarks, tags[0]),
			projects: requestedProjects,
		};
		const nextBookmarks = bookmarks.map((bookmark) =>
			bookmark._id === args.id ? replacement : bookmark,
		);
		await ctx.db.patch(args.id, { title, url });
		if (oldZone !== tags[0]) {
			await persistPadZones(
				ctx,
				nextBookmarks,
				projects,
				new Set([oldZone, tags[0]]),
			);
		} else if (existing.tags.length !== 1 || existing.tags[0] !== tags[0]) {
			await ctx.db.patch(args.id, { tags });
		}
		const affectedProjectIds = changedProjectMembershipIds(
			existing.projects,
			requestedProjects,
		);
		await persistProjectMemberships(
			ctx,
			bookmarks,
			nextBookmarks,
			projects,
			affectedProjectIds,
		);
		await bumpLayoutVersion(ctx);
		return null;
	},
});

export const remove = mutation({
	args: { id: v.id("launchBookmarks") },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Bookmark not found");
		const [bookmarks, projects] = await Promise.all([
			ctx.db.query("launchBookmarks").collect(),
			ctx.db.query("launchProjects").collect(),
		]);
		await ctx.db.delete("launchBookmarks", args.id);
		const nextBookmarks = bookmarks.filter(
			(bookmark) => bookmark._id !== args.id,
		);
		await persistPadZones(
			ctx,
			nextBookmarks,
			projects,
			new Set([cleanTags(existing.tags)[0]]),
		);
		await persistProjectMemberships(
			ctx,
			nextBookmarks,
			nextBookmarks,
			projects,
			new Set(existing.projects.map((membership) => membership.projectId)),
		);
		await bumpLayoutVersion(ctx);
		return null;
	},
});

export const click = mutation({
	args: { id: v.id("launchBookmarks") },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Bookmark not found");
		// Counting a click is not a layout change, so it must not invalidate the
		// version an in-flight drag is racing against.
		await ctx.db.patch(args.id, {
			clickCount: existing.clickCount + 1,
			lastClickedAt: Date.now(),
		});
		return null;
	},
});

export const listProjects = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("launchProjects"),
			_creationTime: v.number(),
			name: v.string(),
			createdAt: v.number(),
		}),
	),
	handler: async (ctx) => {
		requireAuth(ctx);
		return (await readCanonicalLayout(ctx)).projects.map((project) => ({
			_id: project._id,
			_creationTime: project._creationTime,
			name: project.name,
			createdAt: project.createdAt,
		}));
	},
});

export const createProject = mutation({
	args: { name: v.string() },
	returns: v.id("launchProjects"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const name = args.name.trim();
		if (!name) throw new Error("Name is required");
		const [bookmarks, projects] = await Promise.all([
			ctx.db.query("launchBookmarks").collect(),
			ctx.db.query("launchProjects").collect(),
		]);
		const canonical = canonicalLayoutFromDocuments(0, bookmarks, projects);
		await persistProjectOrder(ctx, bookmarks, projects);
		const id = await ctx.db.insert("launchProjects", {
			name,
			position: canonical.projects.length,
			createdAt: Date.now(),
		});
		await bumpLayoutVersion(ctx);
		return id;
	},
});

export const renameProject = mutation({
	args: { id: v.id("launchProjects"), name: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Project not found");
		const name = args.name.trim();
		if (!name) throw new Error("Name is required");
		await ctx.db.patch(args.id, { name });
		await bumpLayoutVersion(ctx);
		return null;
	},
});

export const removeProject = mutation({
	args: { id: v.id("launchProjects") },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Project not found");
		const [bookmarks, projects] = await Promise.all([
			ctx.db.query("launchBookmarks").collect(),
			ctx.db.query("launchProjects").collect(),
		]);
		await ctx.db.delete("launchProjects", args.id);
		for (const bookmark of bookmarks) {
			if (
				!bookmark.projects.some(
					(membership) => membership.projectId === args.id,
				)
			) {
				continue;
			}
			await ctx.db.patch("launchBookmarks", bookmark._id, {
				projects: bookmark.projects.filter(
					(membership) => membership.projectId !== args.id,
				),
			});
		}
		await persistProjectOrder(
			ctx,
			bookmarks,
			projects.filter((project) => project._id !== args.id),
		);
		await bumpLayoutVersion(ctx);
		return null;
	},
});

export const setProjects = mutation({
	args: {
		id: v.id("launchBookmarks"),
		projects: v.array(projectMembershipValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Bookmark not found");
		const [bookmarks, projects] = await Promise.all([
			ctx.db.query("launchBookmarks").collect(),
			ctx.db.query("launchProjects").collect(),
		]);
		const requestedProjects = canonicalizeSetProjects(
			bookmarks,
			args.id,
			args.projects,
		);
		const nextBookmarks = bookmarks.map((bookmark) =>
			bookmark._id === args.id
				? { ...bookmark, projects: requestedProjects }
				: bookmark,
		);
		await persistProjectMemberships(
			ctx,
			bookmarks,
			nextBookmarks,
			projects,
			changedProjectMembershipIds(existing.projects, requestedProjects),
		);
		await bumpLayoutVersion(ctx);
		return null;
	},
});

export const setProjectEnvironment = mutation({
	args: {
		id: v.id("launchBookmarks"),
		projectId: v.id("launchProjects"),
		environment: v.union(environmentValidator, v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Bookmark not found");
		const membership = (existing.projects ?? []).find(
			(item) => item.projectId === args.projectId,
		);
		if (!membership) throw new Error("Bookmark is not in that project");

		await ctx.db.patch(args.id, {
			projects: (existing.projects ?? []).map((item) => {
				if (item.projectId !== args.projectId) return item;
				const next: {
					projectId: typeof item.projectId;
					name?: string;
					environment?: "prod" | "qa" | "stage" | "dev" | "local";
					position?: number;
				} = { projectId: item.projectId, position: item.position };
				if (item.name !== undefined) next.name = item.name;
				if (args.environment) next.environment = args.environment;
				return next;
			}),
		});
		await bumpLayoutVersion(ctx);
		return null;
	},
});

export const getLayout = query({
	args: {},
	returns: layoutSnapshotValidator,
	handler: async (ctx) => {
		requireAuth(ctx);
		return await readCanonicalLayout(ctx);
	},
});

export const applyLayoutOperation = mutation({
	args: {
		operationId: v.string(),
		expectedVersion: v.number(),
		operation: layoutOperationValidator,
	},
	returns: layoutOperationResultValidator,
	handler: async (ctx, args) => {
		requireAuth(ctx);
		if (args.operationId.trim().length === 0 || args.operationId.length > 100) {
			throw launchLayoutError(
				"invalid-operation",
				"Operation ID must be non-empty and at most 100 characters",
			);
		}
		validateTargetIndex(args.operation.targetIndex);

		const [state, bookmarks, projects] = await Promise.all([
			ctx.db
				.query("launchLayoutState")
				.withIndex("by_key", (q) => q.eq("key", "default"))
				.unique(),
			ctx.db.query("launchBookmarks").take(MAX_LAUNCH_BOOKMARKS + 1),
			ctx.db.query("launchProjects").take(MAX_LAUNCH_PROJECTS + 1),
		]);
		// A deployment that has never run the backfill has no singleton yet. The
		// first valid operation creates it in the same transaction, so a fresh
		// install works without a separate initialization step.
		const currentVersion = state?.version ?? 0;
		const recentOperationIds = state?.recentOperationIds ?? [];

		const current = canonicalLayoutFromDocuments(
			currentVersion,
			bookmarks,
			projects,
		);
		if (recentOperationIds.includes(args.operationId)) {
			return {
				status: "applied" as const,
				operationId: args.operationId,
				...current,
			};
		}
		if (args.expectedVersion !== currentVersion) {
			return {
				status: "conflict" as const,
				operationId: args.operationId,
				...current,
			};
		}

		const applied = applyLayoutOperationToDocuments(
			bookmarks,
			projects,
			args.operation,
		);
		for (const bookmarkId of applied.changedBookmarkIds) {
			const bookmark = applied.bookmarks.find(
				(item) => item._id === bookmarkId,
			);
			if (!bookmark) throw new Error("Changed bookmark not found");
			const storedBookmark = bookmarks.find((item) => item._id === bookmarkId);
			if (!storedBookmark) throw new Error("Stored bookmark not found");
			const projects =
				args.operation.kind === "placeProjectLink"
					? mergeAffectedProjectMembership(
							storedBookmark.projects,
							bookmark.projects,
							args.operation.targetProjectId,
						)
					: storedBookmark.projects;
			if (args.operation.kind === "placeProjectLink") {
				await ctx.db.patch("launchBookmarks", bookmarkId, { projects });
			} else {
				await ctx.db.patch("launchBookmarks", bookmarkId, {
					tags: bookmark.tags,
					padPosition: bookmark.padPosition,
					projects,
				});
			}
		}
		for (const projectId of applied.changedProjectIds) {
			const project = applied.projects.find((item) => item._id === projectId);
			if (!project) throw new Error("Changed project not found");
			await ctx.db.patch("launchProjects", projectId, {
				position: project.position,
			});
		}

		const version = currentVersion + 1;
		const nextOperationIds = appendRecentOperationId(
			recentOperationIds,
			args.operationId,
		);
		const updatedAt = Date.now();
		if (state) {
			await ctx.db.patch("launchLayoutState", state._id, {
				version,
				recentOperationIds: nextOperationIds,
				updatedAt,
			});
		} else {
			await ctx.db.insert("launchLayoutState", {
				key: "default",
				version,
				recentOperationIds: nextOperationIds,
				updatedAt,
			});
		}
		return {
			status: "applied" as const,
			operationId: args.operationId,
			version,
			bookmarks: applied.bookmarks,
			projects: applied.projects,
		};
	},
});

const backfillSummaryValidator = v.object({
	alreadyInitialized: v.boolean(),
	version: v.number(),
	bookmarks: v.number(),
	projects: v.number(),
	memberships: v.number(),
	normalizedTags: v.number(),
	repairedPositions: v.number(),
});

export const backfillLayoutOrdering = mutation({
	args: {},
	returns: backfillSummaryValidator,
	handler: async (ctx) => {
		// This matches the existing Launch auth boundary; requireAuth is currently a no-op.
		requireAuth(ctx);
		const layoutState = await ctx.db
			.query("launchLayoutState")
			.withIndex("by_key", (q) => q.eq("key", "default"))
			.unique();
		if (layoutState) {
			const [bookmarks, projects] = await Promise.all([
				ctx.db.query("launchBookmarks").collect(),
				ctx.db.query("launchProjects").collect(),
			]);
			return {
				alreadyInitialized: true,
				version: layoutState.version,
				bookmarks: bookmarks.length,
				projects: projects.length,
				memberships: bookmarks.reduce(
					(total, bookmark) => total + bookmark.projects.length,
					0,
				),
				normalizedTags: 0,
				repairedPositions: 0,
			};
		}

		const [bookmarks, projects] = await Promise.all([
			ctx.db.query("launchBookmarks").collect(),
			ctx.db.query("launchProjects").collect(),
		]);
		const patches = buildLaunchBackfillPatches(bookmarks, projects);
		for (const patch of patches.bookmarkPatches) {
			await ctx.db.patch("launchBookmarks", patch.id, {
				tags: patch.tags,
				padPosition: patch.padPosition,
				projects: patch.projects,
			});
		}
		for (const patch of patches.projectPatches) {
			await ctx.db.patch("launchProjects", patch.id, {
				position: patch.position,
			});
		}
		await ctx.db.insert("launchLayoutState", {
			key: "default",
			version: 1,
			recentOperationIds: [],
			updatedAt: Date.now(),
		});
		return {
			alreadyInitialized: false,
			version: 1,
			...patches.counts,
		};
	},
});

const verificationResultValidator = v.object({
	valid: v.boolean(),
	counts: v.object({
		singletons: v.number(),
		bookmarks: v.number(),
		projects: v.number(),
		memberships: v.number(),
	}),
	violations: v.object({
		singleton: v.array(v.string()),
		tags: v.array(v.string()),
		padPositions: v.array(v.string()),
		projectPositions: v.array(v.string()),
		membershipPositions: v.array(v.string()),
	}),
});

export const verifyLayoutOrdering = query({
	args: {},
	returns: verificationResultValidator,
	handler: async (ctx) => {
		// This matches the existing Launch auth boundary; requireAuth is currently a no-op.
		requireAuth(ctx);
		const [states, bookmarks, projects] = await Promise.all([
			ctx.db.query("launchLayoutState").collect(),
			ctx.db.query("launchBookmarks").collect(),
			ctx.db.query("launchProjects").collect(),
		]);
		const violations = {
			singleton: [] as string[],
			tags: [] as string[],
			padPositions: [] as string[],
			projectPositions: [] as string[],
			membershipPositions: [] as string[],
		};

		if (states.length !== 1) {
			violations.singleton.push(
				`Expected one layout state row, found ${states.length}`,
			);
		} else if (states[0]?.key !== "default") {
			violations.singleton.push("Layout state key is not default");
		}

		for (const bookmark of bookmarks) {
			if (
				bookmark.tags.length !== 1 ||
				(bookmark.tags[0] !== "top" && bookmark.tags[0] !== "pinned")
			) {
				violations.tags.push(String(bookmark._id));
			}
		}
		for (const zone of ["top", "pinned"] as const) {
			const positions = bookmarks
				.filter((bookmark) => bookmark.tags[0] === zone)
				.map((bookmark) => bookmark.padPosition);
			addPositionViolations(positions, zone, violations.padPositions);
		}
		addPositionViolations(
			projects.map((project) => project.position),
			"projects",
			violations.projectPositions,
		);
		for (const project of projects) {
			const positions = bookmarks.flatMap((bookmark) =>
				bookmark.projects
					.filter((membership) => membership.projectId === project._id)
					.map((membership) => membership.position),
			);
			addPositionViolations(
				positions,
				String(project._id),
				violations.membershipPositions,
			);
		}

		return {
			valid: Object.values(violations).every((items) => items.length === 0),
			counts: {
				singletons: states.length,
				bookmarks: bookmarks.length,
				projects: projects.length,
				memberships: bookmarks.reduce(
					(total, bookmark) => total + bookmark.projects.length,
					0,
				),
			},
			violations,
		};
	},
});

function addPositionViolations(
	positions: Array<number | undefined>,
	label: string,
	violations: string[],
): void {
	if (positions.some((position) => position === undefined)) {
		violations.push(`${label}: missing position`);
		return;
	}
	const sorted = [...positions].sort((a, b) => (a ?? 0) - (b ?? 0));
	for (const [expected, position] of sorted.entries()) {
		if (position !== expected) {
			violations.push(
				`${label}: expected ${expected}, found ${String(position)}`,
			);
		}
	}
}

function mergeAffectedProjectMembership<
	T extends { projectId: string; position?: number },
>(stored: T[], canonical: T[], affectedProjectId: string): T[] {
	const affected = canonical.find(
		(membership) => membership.projectId === affectedProjectId,
	);
	if (!affected) throw new Error("Affected project membership not found");
	const exists = stored.some(
		(membership) => membership.projectId === affectedProjectId,
	);
	return exists
		? stored.map((membership) =>
				membership.projectId === affectedProjectId ? affected : membership,
			)
		: [...stored, affected];
}

async function persistPadZones(
	ctx: MutationCtx,
	bookmarks: Doc<"launchBookmarks">[],
	projects: Doc<"launchProjects">[],
	zones: Set<"top" | "pinned">,
): Promise<void> {
	const canonical = canonicalLayoutFromDocuments(0, bookmarks, projects);
	for (const bookmark of canonical.bookmarks) {
		const zone = bookmark.tags[0];
		if (zone === undefined || !zones.has(zone)) continue;
		await ctx.db.patch("launchBookmarks", bookmark._id, {
			tags: bookmark.tags,
			padPosition: bookmark.padPosition,
		});
	}
}

async function persistProjectOrder(
	ctx: MutationCtx,
	bookmarks: Doc<"launchBookmarks">[],
	projects: Doc<"launchProjects">[],
): Promise<void> {
	const canonical = canonicalLayoutFromDocuments(0, bookmarks, projects);
	for (const project of canonical.projects) {
		await ctx.db.patch("launchProjects", project._id, {
			position: project.position,
		});
	}
}

async function persistProjectMemberships(
	ctx: MutationCtx,
	storedBookmarks: Doc<"launchBookmarks">[],
	nextBookmarks: Doc<"launchBookmarks">[],
	projects: Doc<"launchProjects">[],
	affectedProjectIds: Set<Id<"launchProjects">>,
): Promise<void> {
	if (affectedProjectIds.size === 0) return;
	const canonical = canonicalLayoutFromDocuments(0, nextBookmarks, projects);
	for (const stored of storedBookmarks) {
		const desired = canonical.bookmarks.find(
			(bookmark) => bookmark._id === stored._id,
		);
		if (!desired) continue;
		const desiredAffected = desired.projects.filter((membership) =>
			affectedProjectIds.has(membership.projectId),
		);
		const nextProjects = stored.projects.flatMap((membership) => {
			if (!affectedProjectIds.has(membership.projectId)) return [membership];
			const replacement = desiredAffected.find(
				(item) => item.projectId === membership.projectId,
			);
			return replacement ? [replacement] : [];
		});
		for (const membership of desiredAffected) {
			if (
				!stored.projects.some((item) => item.projectId === membership.projectId)
			) {
				nextProjects.push(membership);
			}
		}
		if (JSON.stringify(nextProjects) !== JSON.stringify(stored.projects)) {
			await ctx.db.patch("launchBookmarks", stored._id, {
				projects: nextProjects,
			});
		}
	}
}

function changedProjectMembershipIds(
	current: Doc<"launchBookmarks">["projects"],
	next: Doc<"launchBookmarks">["projects"],
): Set<Id<"launchProjects">> {
	const ids = new Set([
		...current.map((membership) => membership.projectId),
		...next.map((membership) => membership.projectId),
	]);
	for (const id of [...ids]) {
		const currentMembership = current.find(
			(membership) => membership.projectId === id,
		);
		const nextMembership = next.find(
			(membership) => membership.projectId === id,
		);
		if (JSON.stringify(currentMembership) === JSON.stringify(nextMembership)) {
			ids.delete(id);
		}
	}
	return ids;
}

function cleanTags(tags: string[]): ["top"] | ["pinned"] {
	return tags.some((item) => item.trim() === "top") ? ["top"] : ["pinned"];
}

function normalizeUrl(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	return stripUtm(withScheme);
}

function stripUtm(value: string): string {
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
