import type { Infer } from "convex/values";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const launchTagValidator = v.union(
	v.literal("top"),
	v.literal("pinned"),
);

export const environmentValidator = v.union(
	v.literal("prod"),
	v.literal("qa"),
	v.literal("stage"),
	v.literal("dev"),
	v.literal("local"),
);

export const projectMembershipValidator = v.object({
	projectId: v.id("launchProjects"),
	name: v.optional(v.string()),
	environment: v.optional(environmentValidator),
	position: v.optional(v.number()),
});

const canonicalProjectMembershipValidator = projectMembershipValidator.extend({
	position: v.number(),
});

// Click counters deliberately stay out of the canonical snapshot: they change on
// ordinary navigation and would otherwise make every click look like a layout
// change to the optimistic client.
export const bookmarkValidator = v.object({
	_id: v.id("launchBookmarks"),
	_creationTime: v.number(),
	title: v.string(),
	url: v.string(),
	tags: v.array(launchTagValidator),
	padPosition: v.number(),
	projects: v.array(canonicalProjectMembershipValidator),
	createdAt: v.number(),
});

export const projectValidator = v.object({
	_id: v.id("launchProjects"),
	_creationTime: v.number(),
	name: v.string(),
	position: v.number(),
	createdAt: v.number(),
});

export const layoutSnapshotValidator = v.object({
	version: v.number(),
	bookmarks: v.array(bookmarkValidator),
	projects: v.array(projectValidator),
});

const movePadLinkOperationValidator = v.object({
	kind: v.literal("movePadLink"),
	bookmarkId: v.id("launchBookmarks"),
	targetZone: launchTagValidator,
	targetIndex: v.number(),
});

const placeProjectLinkOperationValidator = v.object({
	kind: v.literal("placeProjectLink"),
	bookmarkId: v.id("launchBookmarks"),
	sourceProjectId: v.optional(v.id("launchProjects")),
	targetProjectId: v.id("launchProjects"),
	targetIndex: v.number(),
});

const moveProjectOperationValidator = v.object({
	kind: v.literal("moveProject"),
	projectId: v.id("launchProjects"),
	targetIndex: v.number(),
});

export const layoutOperationValidator = v.union(
	movePadLinkOperationValidator,
	placeProjectLinkOperationValidator,
	moveProjectOperationValidator,
);

export const appliedLayoutResultValidator = layoutSnapshotValidator.extend({
	status: v.literal("applied"),
	operationId: v.string(),
});

export const conflictLayoutResultValidator = layoutSnapshotValidator.extend({
	status: v.literal("conflict"),
	operationId: v.string(),
});

export const layoutOperationResultValidator = v.union(
	appliedLayoutResultValidator,
	conflictLayoutResultValidator,
);

export type LaunchTag = Infer<typeof launchTagValidator>;
export type LaunchEnvironment = Infer<typeof environmentValidator>;
export type LaunchProjectMembership = Infer<typeof projectMembershipValidator>;
export type LaunchBookmark = Infer<typeof bookmarkValidator>;
export type LaunchProject = Infer<typeof projectValidator>;
export type LaunchLayoutSnapshot = Infer<typeof layoutSnapshotValidator>;
export type LaunchLayoutOperation = Infer<typeof layoutOperationValidator>;
export type AppliedLaunchLayoutResult = Infer<
	typeof appliedLayoutResultValidator
>;
export type ConflictLaunchLayoutResult = Infer<
	typeof conflictLayoutResultValidator
>;
export type LaunchLayoutOperationResult = Infer<
	typeof layoutOperationResultValidator
>;

export type LaunchBackfillResult = {
	bookmarkPatches: Array<{
		id: Id<"launchBookmarks">;
		tags: LaunchTag[];
		padPosition: number;
		projects: LaunchProjectMembership[];
	}>;
	projectPatches: Array<{
		id: Id<"launchProjects">;
		position: number;
	}>;
	counts: {
		bookmarks: number;
		projects: number;
		memberships: number;
		normalizedTags: number;
		repairedPositions: number;
	};
};

type CanonicalLayoutDocuments = {
	bookmarks: LaunchBookmark[];
	projects: LaunchProject[];
};

type AppliedLayoutDocuments = CanonicalLayoutDocuments & {
	changedBookmarkIds: Set<Id<"launchBookmarks">>;
	changedProjectIds: Set<Id<"launchProjects">>;
};

const MAX_PAD_LINKS = 250;
const MAX_PROJECT_LINKS = 250;
const MAX_PROJECTS = 100;
export const MAX_LAUNCH_BOOKMARKS = MAX_PAD_LINKS * 2;
export const MAX_LAUNCH_PROJECTS = MAX_PROJECTS;

export async function readCanonicalLayout(
	ctx: QueryCtx | MutationCtx,
): Promise<LaunchLayoutSnapshot> {
	const [state, bookmarks, projects] = await Promise.all([
		ctx.db
			.query("launchLayoutState")
			.withIndex("by_key", (q) => q.eq("key", "default"))
			.unique(),
		ctx.db.query("launchBookmarks").take(MAX_LAUNCH_BOOKMARKS + 1),
		ctx.db.query("launchProjects").take(MAX_LAUNCH_PROJECTS + 1),
	]);
	validateDatasetLimits(bookmarks, projects);
	const canonical = canonicalizeLayoutDocuments(bookmarks, projects);
	return {
		version: state?.version ?? 0,
		...canonical,
	};
}

export function canonicalLayoutFromDocuments(
	version: number,
	bookmarks: Doc<"launchBookmarks">[],
	projects: Doc<"launchProjects">[],
): LaunchLayoutSnapshot {
	validateDatasetLimits(bookmarks, projects);
	return {
		version,
		...canonicalizeLayoutDocuments(bookmarks, projects),
	};
}

export type LaunchLayoutErrorCode =
	| "invalid-operation"
	| "missing-item"
	| "missing-target"
	| "limit-exceeded"
	| "invalid-dataset";

export function launchLayoutError(
	code: LaunchLayoutErrorCode,
	message: string,
): ConvexError<{ code: LaunchLayoutErrorCode; message: string }> {
	return new ConvexError({ code, message });
}

export function validateTargetIndex(targetIndex: number): void {
	if (
		!Number.isFinite(targetIndex) ||
		!Number.isInteger(targetIndex) ||
		targetIndex < 0
	) {
		throw launchLayoutError(
			"invalid-operation",
			"Target index must be a finite non-negative integer",
		);
	}
}

export function appendRecentOperationId(
	recentOperationIds: string[],
	operationId: string,
): string[] {
	const seen = new Set<string>();
	const deduplicatedNewestFirst: string[] = [];
	for (let index = recentOperationIds.length - 1; index >= 0; index -= 1) {
		const id = recentOperationIds[index];
		if (id === undefined || id === operationId || seen.has(id)) continue;
		seen.add(id);
		deduplicatedNewestFirst.push(id);
	}
	return [...deduplicatedNewestFirst.reverse(), operationId].slice(-50);
}

export function nextPadPosition(
	bookmarks: Array<{ tags: LaunchTag[] }>,
	zone: LaunchTag,
): number {
	return bookmarks.filter((bookmark) =>
		zone === "top"
			? bookmark.tags.includes("top")
			: !bookmark.tags.includes("top"),
	).length;
}

export function canonicalizeSetProjects(
	bookmarks: Doc<"launchBookmarks">[],
	bookmarkId: Id<"launchBookmarks">,
	requestedProjects: LaunchProjectMembership[],
): LaunchProjectMembership[] {
	const deduplicated = requestedProjects.filter(
		(membership, index) =>
			requestedProjects.findIndex(
				(candidate) => candidate.projectId === membership.projectId,
			) === index,
	);
	return deduplicated.map((membership) => {
		const existing = bookmarks
			.find((bookmark) => bookmark._id === bookmarkId)
			?.projects.find(
				(candidate) => candidate.projectId === membership.projectId,
			);
		const position = bookmarks.filter(
			(bookmark) =>
				bookmark._id !== bookmarkId &&
				bookmark.projects.some(
					(candidate) => candidate.projectId === membership.projectId,
				),
		).length;
		return {
			...existing,
			...membership,
			position: existing?.position ?? position,
		};
	});
}

export async function bumpLayoutVersion(ctx: MutationCtx): Promise<number> {
	const state = await ctx.db
		.query("launchLayoutState")
		.withIndex("by_key", (q) => q.eq("key", "default"))
		.unique();
	const updatedAt = Date.now();
	if (!state) {
		await ctx.db.insert("launchLayoutState", {
			key: "default",
			version: 1,
			recentOperationIds: [],
			updatedAt,
		});
		return 1;
	}
	const version = state.version + 1;
	await ctx.db.patch("launchLayoutState", state._id, { version, updatedAt });
	return version;
}

export function applyLayoutOperationToDocuments(
	bookmarks: Doc<"launchBookmarks">[],
	projects: Doc<"launchProjects">[],
	operation: LaunchLayoutOperation,
): AppliedLayoutDocuments {
	validateDatasetLimits(bookmarks, projects);
	validateTargetIndex(operation.targetIndex);
	const canonical = canonicalizeLayoutDocuments(bookmarks, projects);
	const changedBookmarkIds = new Set<Id<"launchBookmarks">>();
	const changedProjectIds = new Set<Id<"launchProjects">>();

	if (operation.kind === "movePadLink") {
		const bookmark = canonical.bookmarks.find(
			(item) => item._id === operation.bookmarkId,
		);
		if (!bookmark)
			throw launchLayoutError("missing-item", "Bookmark not found");
		const sourceZone = bookmark.tags[0] ?? "pinned";
		const targetCount = canonical.bookmarks.filter(
			(item) =>
				item.tags[0] === operation.targetZone && item._id !== bookmark._id,
		).length;
		if (targetCount >= MAX_PAD_LINKS) {
			throw launchLayoutError(
				"limit-exceeded",
				`A Pad zone supports at most ${MAX_PAD_LINKS} bookmarks`,
			);
		}
		const source = canonical.bookmarks.filter(
			(item) => item.tags[0] === sourceZone && item._id !== bookmark._id,
		);
		const target =
			sourceZone === operation.targetZone
				? source
				: canonical.bookmarks.filter(
						(item) => item.tags[0] === operation.targetZone,
					);
		target.splice(Math.min(operation.targetIndex, target.length), 0, {
			...bookmark,
			tags: [operation.targetZone],
		});
		const affectedZones = new Set([sourceZone, operation.targetZone]);
		for (const zone of affectedZones) {
			const items = zone === operation.targetZone ? target : source;
			for (const [position, item] of items.entries()) {
				const current = bookmarks.find(
					(candidate) => candidate._id === item._id,
				);
				if (
					!current ||
					current.padPosition !== position ||
					current.tags.length !== 1 ||
					current.tags[0] !== zone
				) {
					changedBookmarkIds.add(item._id);
				}
				replaceBookmark(canonical.bookmarks, {
					...item,
					tags: [zone],
					padPosition: position,
				});
			}
		}
	} else if (operation.kind === "placeProjectLink") {
		const bookmark = canonical.bookmarks.find(
			(item) => item._id === operation.bookmarkId,
		);
		if (!bookmark)
			throw launchLayoutError("missing-item", "Bookmark not found");
		if (
			!canonical.projects.some(
				(project) => project._id === operation.targetProjectId,
			)
		) {
			throw launchLayoutError("missing-target", "Target project not found");
		}
		if (
			operation.sourceProjectId !== undefined &&
			!canonical.projects.some(
				(project) => project._id === operation.sourceProjectId,
			)
		) {
			throw launchLayoutError("missing-item", "Source project not found");
		}
		if (
			operation.sourceProjectId !== undefined &&
			!bookmark.projects.some(
				(membership) => membership.projectId === operation.sourceProjectId,
			)
		) {
			throw launchLayoutError(
				"missing-item",
				"Bookmark is not in the source project",
			);
		}

		const targetEntries = canonical.bookmarks
			.flatMap((item) => {
				const membership = item.projects.find(
					(candidate) => candidate.projectId === operation.targetProjectId,
				);
				return membership ? [{ bookmark: item, membership }] : [];
			})
			.filter((entry) => entry.bookmark._id !== bookmark._id);
		const existingTarget = bookmark.projects.find(
			(membership) => membership.projectId === operation.targetProjectId,
		);
		if (!existingTarget && targetEntries.length >= MAX_PROJECT_LINKS) {
			throw launchLayoutError(
				"limit-exceeded",
				`A project supports at most ${MAX_PROJECT_LINKS} bookmarks`,
			);
		}
		targetEntries.splice(
			Math.min(operation.targetIndex, targetEntries.length),
			0,
			{
				bookmark,
				membership: existingTarget ?? {
					projectId: operation.targetProjectId,
					position: 0,
				},
			},
		);
		for (const [position, entry] of targetEntries.entries()) {
			const nextMembership = { ...entry.membership, position };
			const nextProjects = entry.bookmark.projects.some(
				(item) => item.projectId === operation.targetProjectId,
			)
				? entry.bookmark.projects.map((item) =>
						item.projectId === operation.targetProjectId
							? nextMembership
							: item,
					)
				: [...entry.bookmark.projects, nextMembership];
			if (
				bookmarks
					.find((item) => item._id === entry.bookmark._id)
					?.projects.find(
						(item) => item.projectId === operation.targetProjectId,
					)?.position !== position ||
				!entry.bookmark.projects.some(
					(item) => item.projectId === operation.targetProjectId,
				)
			) {
				changedBookmarkIds.add(entry.bookmark._id);
			}
			replaceBookmark(canonical.bookmarks, {
				...entry.bookmark,
				projects: nextProjects,
			});
		}
	} else {
		const moving = canonical.projects.find(
			(project) => project._id === operation.projectId,
		);
		if (!moving) throw launchLayoutError("missing-item", "Project not found");
		const reordered = canonical.projects.filter(
			(project) => project._id !== moving._id,
		);
		reordered.splice(
			Math.min(operation.targetIndex, reordered.length),
			0,
			moving,
		);
		canonical.projects = reordered.map((project, position) => {
			const stored = projects.find((item) => item._id === project._id);
			if (stored?.position !== position) changedProjectIds.add(project._id);
			return { ...project, position };
		});
	}

	canonical.bookmarks.sort(compareCanonicalBookmarks);
	canonical.projects.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
	return { ...canonical, changedBookmarkIds, changedProjectIds };
}

export function buildLaunchBackfillPatches(
	bookmarks: Doc<"launchBookmarks">[],
	projects: Doc<"launchProjects">[],
): LaunchBackfillResult {
	const orderedBookmarks = [...bookmarks].sort((a, b) => {
		if (a._creationTime !== b._creationTime) {
			return a._creationTime - b._creationTime;
		}
		return compareDocumentIdentity(a._id, b._id);
	});
	const padPositions: Record<LaunchTag, number> = { top: 0, pinned: 0 };
	const membershipPositions = new Map<Id<"launchProjects">, number>();
	const bookmarkPatches: LaunchBackfillResult["bookmarkPatches"] = [];
	let memberships = 0;
	let normalizedTags = 0;
	let repairedPositions = 0;

	for (const bookmark of orderedBookmarks) {
		const zone: LaunchTag = bookmark.tags.includes("top") ? "top" : "pinned";
		const tags: LaunchTag[] = [zone];
		const padPosition = padPositions[zone];
		padPositions[zone] += 1;
		const nextProjects = bookmark.projects.map((membership) => {
			memberships += 1;
			const position = membershipPositions.get(membership.projectId) ?? 0;
			membershipPositions.set(membership.projectId, position + 1);
			if (membership.position !== position) repairedPositions += 1;
			return { ...membership, position };
		});
		const tagsChanged = bookmark.tags.length !== 1 || bookmark.tags[0] !== zone;
		if (tagsChanged) normalizedTags += 1;
		if (bookmark.padPosition !== padPosition) repairedPositions += 1;
		const projectsChanged = bookmark.projects.some(
			(membership, index) =>
				membership.position !== nextProjects[index]?.position,
		);

		if (
			tagsChanged ||
			bookmark.padPosition !== padPosition ||
			projectsChanged
		) {
			bookmarkPatches.push({
				id: bookmark._id,
				tags,
				padPosition,
				projects: nextProjects,
			});
		}
	}

	const projectPatches: LaunchBackfillResult["projectPatches"] = [];
	const orderedProjects = [...projects].sort((a, b) => {
		if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
		if (a._creationTime !== b._creationTime) {
			return a._creationTime - b._creationTime;
		}
		return compareDocumentIdentity(a._id, b._id);
	});
	for (const [position, project] of orderedProjects.entries()) {
		if (project.position === position) continue;
		repairedPositions += 1;
		projectPatches.push({ id: project._id, position });
	}

	return {
		bookmarkPatches,
		projectPatches,
		counts: {
			bookmarks: bookmarks.length,
			projects: projects.length,
			memberships,
			normalizedTags,
			repairedPositions,
		},
	};
}

function compareDocumentIdentity(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

function canonicalizeLayoutDocuments(
	bookmarks: Doc<"launchBookmarks">[],
	projects: Doc<"launchProjects">[],
): CanonicalLayoutDocuments {
	const canonicalBookmarks = bookmarks.map((bookmark) => ({
		...bookmark,
		tags: [bookmark.tags.includes("top") ? "top" : "pinned"] as LaunchTag[],
		projects: bookmark.projects.map((membership) => ({ ...membership })),
	}));
	for (const zone of ["top", "pinned"] as const) {
		const ordered = canonicalBookmarks
			.filter((bookmark) => bookmark.tags[0] === zone)
			.sort(comparePositionThenCreation);
		for (const [position, bookmark] of ordered.entries()) {
			replaceBookmark(canonicalBookmarks, {
				...bookmark,
				padPosition: position,
			});
		}
	}

	for (const project of projects) {
		const entries = canonicalBookmarks
			.flatMap((bookmark) => {
				const membership = bookmark.projects.find(
					(item) => item.projectId === project._id,
				);
				return membership ? [{ bookmark, membership }] : [];
			})
			.sort((a, b) => {
				const byPosition = compareOptionalPositions(
					a.membership.position,
					b.membership.position,
				);
				return (
					byPosition || a.bookmark._creationTime - b.bookmark._creationTime
				);
			});
		for (const [position, entry] of entries.entries()) {
			replaceBookmark(canonicalBookmarks, {
				...entry.bookmark,
				projects: entry.bookmark.projects.map((membership) =>
					membership.projectId === project._id
						? { ...membership, position }
						: membership,
				),
			});
		}
	}

	const canonicalProjects = projects
		.map((project) => ({ ...project }))
		.sort((a, b) => {
			const byPosition = compareOptionalPositions(a.position, b.position);
			if (byPosition) return byPosition;
			if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
			return a._creationTime - b._creationTime;
		})
		.map((project, position) => ({ ...project, position }));

	return {
		bookmarks: canonicalBookmarks
			.map((bookmark) => ({
				_id: bookmark._id,
				_creationTime: bookmark._creationTime,
				title: bookmark.title,
				url: bookmark.url,
				tags: bookmark.tags,
				padPosition: bookmark.padPosition ?? 0,
				projects: bookmark.projects.map((membership) => ({
					...membership,
					position: membership.position ?? 0,
				})),
				createdAt: bookmark.createdAt,
			}))
			.sort(compareCanonicalBookmarks),
		projects: canonicalProjects,
	};
}

function compareCanonicalBookmarks(
	a: { tags: LaunchTag[]; padPosition?: number },
	b: { tags: LaunchTag[]; padPosition?: number },
): number {
	const zoneOrder = a.tags[0] === b.tags[0] ? 0 : a.tags[0] === "top" ? -1 : 1;
	return zoneOrder || (a.padPosition ?? 0) - (b.padPosition ?? 0);
}

function comparePositionThenCreation(
	a: { padPosition?: number; _creationTime: number },
	b: { padPosition?: number; _creationTime: number },
): number {
	return (
		compareOptionalPositions(a.padPosition, b.padPosition) ||
		a._creationTime - b._creationTime
	);
}

function compareOptionalPositions(
	a: number | undefined,
	b: number | undefined,
): number {
	if (a !== undefined && b !== undefined && a !== b) return a - b;
	if (a !== undefined && b === undefined) return -1;
	if (a === undefined && b !== undefined) return 1;
	return 0;
}

function replaceBookmark<T extends { _id: Id<"launchBookmarks"> }>(
	bookmarks: T[],
	replacement: T,
): void {
	const index = bookmarks.findIndex(
		(bookmark) => bookmark._id === replacement._id,
	);
	if (index >= 0) bookmarks[index] = replacement;
}

function validateDatasetLimits(
	bookmarks: Doc<"launchBookmarks">[],
	projects: Doc<"launchProjects">[],
): void {
	if (projects.length > MAX_PROJECTS) {
		throw launchLayoutError(
			"limit-exceeded",
			`Launch supports at most ${MAX_PROJECTS} projects`,
		);
	}
	for (const zone of ["top", "pinned"] as const) {
		const count = bookmarks.filter((bookmark) =>
			zone === "top"
				? bookmark.tags.includes("top")
				: !bookmark.tags.includes("top"),
		).length;
		if (count > MAX_PAD_LINKS) {
			throw launchLayoutError(
				"limit-exceeded",
				`A Pad zone supports at most ${MAX_PAD_LINKS} bookmarks`,
			);
		}
	}
	for (const bookmark of bookmarks) {
		const projectIds = new Set<Id<"launchProjects">>();
		for (const membership of bookmark.projects) {
			if (projectIds.has(membership.projectId)) {
				throw launchLayoutError(
					"invalid-dataset",
					`Bookmark ${bookmark._id} has a duplicate project membership`,
				);
			}
			projectIds.add(membership.projectId);
		}
	}
	for (const project of projects) {
		const count = bookmarks.filter((bookmark) =>
			bookmark.projects.some(
				(membership) => membership.projectId === project._id,
			),
		).length;
		if (count > MAX_PROJECT_LINKS) {
			throw launchLayoutError(
				"limit-exceeded",
				`A project supports at most ${MAX_PROJECT_LINKS} bookmarks`,
			);
		}
	}
}
