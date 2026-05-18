import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function taxonomyKeyFromLabel(label: string): string {
	return label.trim().toLowerCase();
}

export async function ensureGenreId(
	ctx: MutationCtx,
	args: {
		name: string;
		href?: string | undefined;
		description?: string | undefined;
		isTopLevel?: boolean | undefined;
	},
	now: number,
): Promise<Id<"rateYourMusicGenres">> {
	const label = args.name.trim();
	const key = taxonomyKeyFromLabel(label);
	if (!key) {
		throw new ConvexError("Genre label cannot be empty");
	}
	const existing = await ctx.db
		.query("rateYourMusicGenres")
		.withIndex("by_key", (q) => q.eq("key", key))
		.first();

	const href = args.href?.trim() || undefined;
	const description = args.description?.trim() || undefined;

	if (!existing) {
		return await ctx.db.insert("rateYourMusicGenres", {
			key,
			label,
			...(href ? { href } : {}),
			...(description ? { description } : {}),
			...(args.isTopLevel !== undefined ? { isTopLevel: args.isTopLevel } : {}),
			createdAt: now,
			updatedAt: now,
		});
	}

	const patch: Partial<{
		label: string;
		href: string;
		description: string;
		isTopLevel: boolean;
		updatedAt: number;
	}> = {};

	if (label && existing.label !== label) {
		patch.label = label;
	}
	if (href && existing.href !== href) {
		patch.href = href;
	}
	if (description && existing.description !== description) {
		patch.description = description;
	}
	if (
		args.isTopLevel !== undefined &&
		existing.isTopLevel !== args.isTopLevel
	) {
		patch.isTopLevel = args.isTopLevel;
	}
	if (Object.keys(patch).length > 0) {
		patch.updatedAt = now;
		await ctx.db.patch(existing._id, patch);
	}

	return existing._id;
}

export async function ensureDescriptorId(
	ctx: MutationCtx,
	rawPretty: string,
	now: number,
): Promise<Id<"rateYourMusicDescriptors">> {
	const label = rawPretty.trim();
	const key = taxonomyKeyFromLabel(label);
	if (!key) {
		throw new ConvexError("Descriptor cannot be empty");
	}
	const existing = await ctx.db
		.query("rateYourMusicDescriptors")
		.withIndex("by_key", (q) => q.eq("key", key))
		.first();

	if (!existing) {
		return await ctx.db.insert("rateYourMusicDescriptors", {
			key,
			label,
			createdAt: now,
		});
	}

	return existing._id;
}

export async function deleteReleaseGenreLinks(
	ctx: MutationCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
): Promise<void> {
	const rows = await ctx.db
		.query("rateYourMusicReleaseGenres")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();
	for (const row of rows) {
		await ctx.db.delete(row._id);
	}
}

export async function deleteReleaseDescriptorLinks(
	ctx: MutationCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
): Promise<void> {
	const rows = await ctx.db
		.query("rateYourMusicReleaseDescriptors")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();
	for (const row of rows) {
		await ctx.db.delete(row._id);
	}
}
