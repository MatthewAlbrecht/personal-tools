import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import {
	ensureGenreId,
	taxonomyKeyFromLabel,
} from "./_utils/rateYourMusicTaxonomy";

const rymGenreInputValidator = v.object({
	key: v.string(),
	label: v.string(),
	href: v.optional(v.string()),
	description: v.optional(v.string()),
	isTopLevel: v.boolean(),
});

const rymGenreRelationshipInputValidator = v.object({
	parentKey: v.string(),
	childKey: v.string(),
	position: v.number(),
});

async function getGenreIdByKey(
	ctx: MutationCtx,
	key: string,
): Promise<Id<"rateYourMusicGenres">> {
	const genre = await ctx.db
		.query("rateYourMusicGenres")
		.withIndex("by_key", (q) => q.eq("key", key))
		.first();

	if (!genre) {
		throw new ConvexError(`Missing RYM genre for key: ${key}`);
	}

	return genre._id;
}

export const clearRateYourMusicGenreRelationships = internalMutation({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.object({
		deleted: v.number(),
	}),
	handler: async (ctx, args): Promise<{ deleted: number }> => {
		const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
		const existing = await ctx.db
			.query("rateYourMusicGenreRelationships")
			.take(limit);

		for (const relationship of existing) {
			await ctx.db.delete(relationship._id);
		}

		return { deleted: existing.length };
	},
});

export const upsertRateYourMusicGenreBatch = internalMutation({
	args: {
		genres: v.array(rymGenreInputValidator),
	},
	returns: v.object({
		upserted: v.number(),
	}),
	handler: async (ctx, args): Promise<{ upserted: number }> => {
		const now = Date.now();

		for (const genre of args.genres) {
			const key = taxonomyKeyFromLabel(genre.label);
			if (key !== genre.key) {
				throw new ConvexError(
					`Genre key mismatch for ${genre.label}: expected ${key}, received ${genre.key}`,
				);
			}

			await ensureGenreId(
				ctx,
				{
					name: genre.label,
					href: genre.href,
					description: genre.description,
					isTopLevel: genre.isTopLevel,
				},
				now,
			);
		}

		return { upserted: args.genres.length };
	},
});

export const insertRateYourMusicGenreRelationshipBatch = internalMutation({
	args: {
		relationships: v.array(rymGenreRelationshipInputValidator),
	},
	returns: v.object({
		inserted: v.number(),
	}),
	handler: async (ctx, args): Promise<{ inserted: number }> => {
		const now = Date.now();
		let inserted = 0;

		for (const relationship of args.relationships) {
			const parentGenreId = await getGenreIdByKey(ctx, relationship.parentKey);
			const childGenreId = await getGenreIdByKey(ctx, relationship.childKey);

			await ctx.db.insert("rateYourMusicGenreRelationships", {
				parentGenreId,
				childGenreId,
				parentKey: relationship.parentKey,
				childKey: relationship.childKey,
				position: relationship.position,
				createdAt: now,
				updatedAt: now,
			});
			inserted += 1;
		}

		return { inserted };
	},
});
