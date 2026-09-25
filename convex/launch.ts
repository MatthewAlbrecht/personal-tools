import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./auth";

const tagValidator = v.union(v.literal("top"), v.literal("pinned"));

const projectMembershipValidator = v.object({
	projectId: v.id("launchProjects"),
	name: v.optional(v.string()),
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
		const bookmarks = await ctx.db.query("launchBookmarks").collect();
		bookmarks.sort((a, b) => a._creationTime - b._creationTime);
		return bookmarks.map((bookmark) => ({
			_id: bookmark._id,
			_creationTime: bookmark._creationTime,
			title: bookmark.title,
			url: bookmark.url,
			tags: cleanTags(bookmark.tags),
			projects: bookmark.projects ?? [],
			clickCount: bookmark.clickCount,
			lastClickedAt: bookmark.lastClickedAt,
			createdAt: bookmark.createdAt,
		}));
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
		return await ctx.db.insert("launchBookmarks", {
			title,
			url,
			tags: cleanTags(args.tags),
			projects: [],
			clickCount: 0,
			createdAt: Date.now(),
		});
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
		await ctx.db.patch(args.id, {
			title,
			url,
			tags: cleanTags(args.tags),
			projects: args.projects,
		});
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
		await ctx.db.delete(args.id);
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
		const projects = await ctx.db.query("launchProjects").collect();
		projects.sort((a, b) => a.createdAt - b.createdAt);
		return projects;
	},
});

export const createProject = mutation({
	args: { name: v.string() },
	returns: v.id("launchProjects"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const name = args.name.trim();
		if (!name) throw new Error("Name is required");
		return await ctx.db.insert("launchProjects", {
			name,
			createdAt: Date.now(),
		});
	},
});

export const removeProject = mutation({
	args: { id: v.id("launchProjects") },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Project not found");
		const bookmarks = await ctx.db.query("launchBookmarks").collect();
		for (const bookmark of bookmarks) {
			const projects = (bookmark.projects ?? []).filter(
				(item) => item.projectId !== args.id,
			);
			if (projects.length !== (bookmark.projects ?? []).length) {
				await ctx.db.patch(bookmark._id, { projects });
			}
		}
		await ctx.db.delete(args.id);
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
		await ctx.db.patch(args.id, { projects: args.projects });
		return null;
	},
});

function cleanTags(tags: string[]): Array<"top" | "pinned"> {
	const allowed = ["top", "pinned"] as const;
	return allowed.filter((tag) => tags.some((item) => item.trim() === tag));
}

function normalizeUrl(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}
