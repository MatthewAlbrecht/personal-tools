import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { compareManualRank } from "./_utils/rankingOrdinals";
import { previousSundayUtcMs } from "./_utils/rankingWeek";

const RETENTION_SUNDAYS = 26;

const snapshotStatusValidator = v.union(
	v.literal("pending"),
	v.literal("complete"),
);

const snapshotHeaderValidator = v.object({
	_id: v.id("manualRankingSnapshots"),
	_creationTime: v.number(),
	userId: v.string(),
	year: v.number(),
	weekSundayUtcMs: v.number(),
	capturedAt: v.optional(v.number()),
	entryCount: v.number(),
	status: snapshotStatusValidator,
});

const snapshotEntryValidator = v.object({
	_id: v.id("manualRankingSnapshotEntries"),
	_creationTime: v.number(),
	snapshotId: v.id("manualRankingSnapshots"),
	userId: v.string(),
	year: v.number(),
	weekSundayUtcMs: v.number(),
	userAlbumId: v.id("userAlbums"),
	albumId: v.id("spotifyAlbums"),
	ordinal: v.number(),
	rating: v.number(),
	position: v.number(),
});

type RatedYearAlbum = {
	userAlbumId: Id<"userAlbums">;
	albumId: Id<"spotifyAlbums">;
	rating: number;
	position: number | null;
};

function extractReleaseYear(releaseDate: string | undefined): number | null {
	if (!releaseDate) return null;
	const year = Number.parseInt(releaseDate.substring(0, 4), 10);
	return Number.isNaN(year) ? null : year;
}

async function deleteSnapshotEntries(
	ctx: MutationCtx,
	snapshotId: Id<"manualRankingSnapshots">,
): Promise<void> {
	const entries = await ctx.db
		.query("manualRankingSnapshotEntries")
		.withIndex("by_snapshotId", (q) => q.eq("snapshotId", snapshotId))
		.collect();
	for (const entry of entries) {
		await ctx.db.delete(entry._id);
	}
}

async function pruneOldSnapshots(
	ctx: MutationCtx,
	userId: string,
	year: number,
): Promise<void> {
	const headers = await ctx.db
		.query("manualRankingSnapshots")
		.withIndex("by_user_year_week", (q) =>
			q.eq("userId", userId).eq("year", year),
		)
		.collect();

	headers.sort((a, b) => b.weekSundayUtcMs - a.weekSundayUtcMs);
	const toDelete = headers.slice(RETENTION_SUNDAYS);
	for (const header of toDelete) {
		await deleteSnapshotEntries(ctx, header._id);
		await ctx.db.delete(header._id);
	}
}

async function captureYearForUser(
	ctx: MutationCtx,
	args: {
		userId: string;
		year: number;
		weekSundayUtcMs: number;
		albums: RatedYearAlbum[];
	},
): Promise<"processed"> {
	const existing = await ctx.db
		.query("manualRankingSnapshots")
		.withIndex("by_user_year_week", (q) =>
			q
				.eq("userId", args.userId)
				.eq("year", args.year)
				.eq("weekSundayUtcMs", args.weekSundayUtcMs),
		)
		.unique();

	let snapshotId: Id<"manualRankingSnapshots">;
	if (existing) {
		await deleteSnapshotEntries(ctx, existing._id);
		snapshotId = existing._id;
		await ctx.db.patch(snapshotId, {
			status: "pending",
			entryCount: 0,
		});
	} else {
		snapshotId = await ctx.db.insert("manualRankingSnapshots", {
			userId: args.userId,
			year: args.year,
			weekSundayUtcMs: args.weekSundayUtcMs,
			entryCount: 0,
			status: "pending",
		});
	}

	const ranked = [...args.albums].sort(compareManualRank);

	for (let i = 0; i < ranked.length; i++) {
		const album = ranked[i];
		if (!album) continue;
		await ctx.db.insert("manualRankingSnapshotEntries", {
			snapshotId,
			userId: args.userId,
			year: args.year,
			weekSundayUtcMs: args.weekSundayUtcMs,
			userAlbumId: album.userAlbumId,
			albumId: album.albumId,
			ordinal: i + 1,
			rating: album.rating,
			position: album.position ?? Number.POSITIVE_INFINITY,
		});
	}

	await ctx.db.patch(snapshotId, {
		status: "complete",
		entryCount: ranked.length,
		capturedAt: Date.now(),
	});

	await pruneOldSnapshots(ctx, args.userId, args.year);
	return "processed";
}

export const orchestrateSunday = internalMutation({
	args: {
		nowMs: v.optional(v.number()),
	},
	returns: v.object({
		userCount: v.number(),
		weekSundayUtcMs: v.number(),
	}),
	handler: async (ctx, args) => {
		const nowMs = args.nowMs ?? Date.now();
		const weekSundayUtcMs = previousSundayUtcMs(nowMs);

		// Personal-app scale: full userAlbums scan to find distinct rated users.
		// Revisit if the table grows large (prefer a rated-users index / denorm set).
		const allUserAlbums = await ctx.db.query("userAlbums").collect();
		const userIds = new Set<string>();
		for (const ua of allUserAlbums) {
			if (typeof ua.rating === "number") {
				userIds.add(ua.userId);
			}
		}

		for (const userId of userIds) {
			await ctx.scheduler.runAfter(
				0,
				internal.rankingSnapshots.captureUserWeek,
				{
					userId,
					weekSundayUtcMs,
				},
			);
		}

		return { userCount: userIds.size, weekSundayUtcMs };
	},
});

export const captureUserWeek = internalMutation({
	args: {
		userId: v.string(),
		weekSundayUtcMs: v.number(),
	},
	returns: v.object({
		yearsProcessed: v.number(),
		yearsSkipped: v.number(),
	}),
	handler: async (ctx, args) => {
		const userAlbums = await ctx.db
			.query("userAlbums")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		const byYear = new Map<number, RatedYearAlbum[]>();

		for (const ua of userAlbums) {
			if (typeof ua.rating !== "number") continue;

			const album = await ctx.db.get(ua.albumId);
			if (!album) continue;

			const year = extractReleaseYear(album.releaseDate);
			if (year === null) continue;

			const list = byYear.get(year) ?? [];
			list.push({
				userAlbumId: ua._id,
				albumId: ua.albumId,
				rating: ua.rating,
				position: ua.position ?? null,
			});
			byYear.set(year, list);
		}

		let yearsProcessed = 0;

		for (const [year, albums] of byYear) {
			await captureYearForUser(ctx, {
				userId: args.userId,
				year,
				weekSundayUtcMs: args.weekSundayUtcMs,
				albums,
			});
			yearsProcessed += 1;
		}

		return { yearsProcessed, yearsSkipped: 0 };
	},
});

/** One-shot seed: same capture path as the weekly cron fan-out. */
export const seedUserWeek = captureUserWeek;

export const getCompleteWeek = query({
	args: {
		userId: v.string(),
		year: v.number(),
		weekSundayUtcMs: v.number(),
	},
	returns: v.union(
		v.null(),
		v.object({
			snapshot: snapshotHeaderValidator,
			entries: v.array(snapshotEntryValidator),
		}),
	),
	handler: async (ctx, args) => {
		const snapshot = await ctx.db
			.query("manualRankingSnapshots")
			.withIndex("by_user_year_week", (q) =>
				q
					.eq("userId", args.userId)
					.eq("year", args.year)
					.eq("weekSundayUtcMs", args.weekSundayUtcMs),
			)
			.unique();

		if (!snapshot || snapshot.status !== "complete") {
			return null;
		}

		const entries = await ctx.db
			.query("manualRankingSnapshotEntries")
			.withIndex("by_snapshotId", (q) => q.eq("snapshotId", snapshot._id))
			.collect();

		entries.sort((a, b) => a.ordinal - b.ordinal);

		return {
			snapshot,
			entries,
		};
	},
});
