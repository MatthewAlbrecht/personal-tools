import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { DEFAULT_ELO, eloUpdate } from "./_utils/duelElo";

type DbCtx = QueryCtx | MutationCtx;

type RatedYearAlbum = {
	userAlbum: Doc<"userAlbums">;
	album: Doc<"spotifyAlbums">;
	rating: number;
	releaseYear: number;
};

const duelCandidateValidator = v.object({
	userAlbumId: v.id("userAlbums"),
	albumId: v.id("spotifyAlbums"),
	elo: v.optional(v.number()),
	title: v.optional(v.string()),
	artist: v.optional(v.string()),
	imageUrl: v.optional(v.string()),
});

const duelTopRowValidator = v.object({
	userAlbumId: v.id("userAlbums"),
	albumId: v.id("spotifyAlbums"),
	elo: v.number(),
	matches: v.number(),
	title: v.optional(v.string()),
	artist: v.optional(v.string()),
	imageUrl: v.optional(v.string()),
});

/**
 * Mild Elo prior from manual rating (1–15).
 * Midpoint 8 → +0; rating 15 → +75; rating 1 → −75.
 * `DEFAULT_ELO + clamp(round((rating - 8) / 7 * 75), -75, 75)`
 */
function seedEloFromRating(rating: number): number {
	const offset = Math.round(((rating - 8) / 7) * 75);
	const clamped = Math.max(-75, Math.min(75, offset));
	return DEFAULT_ELO + clamped;
}

function parseReleaseYear(releaseDate: string | undefined): number | null {
	if (!releaseDate || releaseDate.length < 4) return null;
	const year = Number.parseInt(releaseDate.substring(0, 4), 10);
	return Number.isNaN(year) ? null : year;
}

function toCandidate(
	row: RatedYearAlbum,
	elo: number | undefined,
): {
	userAlbumId: Id<"userAlbums">;
	albumId: Id<"spotifyAlbums">;
	elo?: number;
	title?: string;
	artist?: string;
	imageUrl?: string;
} {
	return {
		userAlbumId: row.userAlbum._id,
		albumId: row.album._id,
		...(elo !== undefined ? { elo } : {}),
		title: row.album.name,
		artist: row.album.artistName,
		...(row.album.imageUrl !== undefined
			? { imageUrl: row.album.imageUrl }
			: {}),
	};
}

async function loadRatedAlbumsForYear(
	ctx: DbCtx,
	userId: string,
	year: number,
): Promise<RatedYearAlbum[]> {
	const userAlbums = await ctx.db
		.query("userAlbums")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();

	const rated: RatedYearAlbum[] = [];
	for (const ua of userAlbums) {
		if (typeof ua.rating !== "number") continue;
		const album = await ctx.db.get(ua.albumId);
		if (!album) continue;
		const releaseYear = parseReleaseYear(album.releaseDate);
		if (releaseYear !== year) continue;
		rated.push({
			userAlbum: ua,
			album,
			rating: ua.rating,
			releaseYear,
		});
	}
	return rated;
}

async function loadScoreMap(
	ctx: DbCtx,
	userId: string,
): Promise<Map<Id<"userAlbums">, Doc<"albumDuelScores">>> {
	const scores = await ctx.db
		.query("albumDuelScores")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	const map = new Map<Id<"userAlbums">, Doc<"albumDuelScores">>();
	for (const score of scores) {
		map.set(score.userAlbumId, score);
	}
	return map;
}

/** Effective Elo for pairing only — does not write scores. */
function effectiveEloForPairing(
	row: RatedYearAlbum,
	score: Doc<"albumDuelScores"> | undefined,
): number {
	if (score) return score.elo;
	return seedEloFromRating(row.rating);
}

/**
 * Deterministic PRNG from client-provided seed (no Date.now in queries).
 * Mulberry32.
 */
function seededUnit(seed: number, salt: number): number {
	let t = (seed + salt * 0x9e3779b9) >>> 0;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Pairing v1: pick an anchor via seed, then prefer a partner with close Elo
 * (among remaining). Tie-break with seed. Never returns the same id twice.
 */
function pickPair(
	pool: RatedYearAlbum[],
	scoreMap: Map<Id<"userAlbums">, Doc<"albumDuelScores">>,
	seed: number,
): { a: RatedYearAlbum; b: RatedYearAlbum } | null {
	if (pool.length < 2) return null;

	const anchorIndex = Math.floor(seededUnit(seed, 1) * pool.length);
	const a = pool[anchorIndex];
	if (!a) return null;

	const aElo = effectiveEloForPairing(a, scoreMap.get(a.userAlbum._id));
	const rest = pool.filter((_, i) => i !== anchorIndex);
	if (rest.length === 0) return null;

	const CLOSE_BAND = 100;
	const close = rest.filter((row) => {
		const elo = effectiveEloForPairing(row, scoreMap.get(row.userAlbum._id));
		return Math.abs(elo - aElo) <= CLOSE_BAND;
	});
	const candidates = close.length > 0 ? close : rest;

	candidates.sort((x, y) => {
		const dx = Math.abs(
			effectiveEloForPairing(x, scoreMap.get(x.userAlbum._id)) - aElo,
		);
		const dy = Math.abs(
			effectiveEloForPairing(y, scoreMap.get(y.userAlbum._id)) - aElo,
		);
		if (dx !== dy) return dx - dy;
		return x.userAlbum._id.localeCompare(y.userAlbum._id);
	});

	const pickIndex = Math.floor(
		seededUnit(seed, 2) * Math.min(3, candidates.length),
	);
	const b = candidates[pickIndex] ?? candidates[0];
	if (!b) return null;

	return { a, b };
}

async function getOrCreateScore(
	ctx: MutationCtx,
	userId: string,
	userAlbum: Doc<"userAlbums">,
	rating: number,
): Promise<Doc<"albumDuelScores">> {
	const existing = await ctx.db
		.query("albumDuelScores")
		.withIndex("by_user_userAlbum", (q) =>
			q.eq("userId", userId).eq("userAlbumId", userAlbum._id),
		)
		.unique();
	if (existing) return existing;

	const now = Date.now();
	const id = await ctx.db.insert("albumDuelScores", {
		userId,
		userAlbumId: userAlbum._id,
		albumId: userAlbum.albumId,
		elo: seedEloFromRating(rating),
		matches: 0,
		updatedAt: now,
	});
	const created = await ctx.db.get(id);
	if (!created) throw new Error("Failed to create duel score");
	return created;
}

async function loadRatedYearAlbumOrThrow(
	ctx: MutationCtx,
	userId: string,
	userAlbumId: Id<"userAlbums">,
	year: number,
): Promise<RatedYearAlbum> {
	const userAlbum = await ctx.db.get(userAlbumId);
	if (!userAlbum) throw new Error("User album not found");
	if (userAlbum.userId !== userId) {
		throw new Error("Unauthorized: album does not belong to user");
	}
	if (typeof userAlbum.rating !== "number") {
		throw new Error("Album must be rated");
	}
	const album = await ctx.db.get(userAlbum.albumId);
	if (!album) throw new Error("Spotify album not found");
	const releaseYear = parseReleaseYear(album.releaseDate);
	if (releaseYear !== year) {
		throw new Error("Album release year does not match duel year");
	}
	return {
		userAlbum,
		album,
		rating: userAlbum.rating,
		releaseYear,
	};
}

export const getPair = query({
	args: {
		userId: v.string(),
		year: v.number(),
		seed: v.number(),
	},
	returns: v.union(
		v.null(),
		v.object({
			a: duelCandidateValidator,
			b: duelCandidateValidator,
		}),
	),
	handler: async (ctx, args) => {
		const pool = await loadRatedAlbumsForYear(ctx, args.userId, args.year);
		if (pool.length < 2) return null;

		const scoreMap = await loadScoreMap(ctx, args.userId);
		const pair = pickPair(pool, scoreMap, args.seed);
		if (!pair) return null;

		const aScore = scoreMap.get(pair.a.userAlbum._id);
		const bScore = scoreMap.get(pair.b.userAlbum._id);

		return {
			a: toCandidate(pair.a, aScore?.elo),
			b: toCandidate(pair.b, bScore?.elo),
		};
	},
});

export const pick = mutation({
	args: {
		userId: v.string(),
		year: v.number(),
		aUserAlbumId: v.id("userAlbums"),
		bUserAlbumId: v.id("userAlbums"),
		winnerUserAlbumId: v.id("userAlbums"),
	},
	returns: v.object({
		duelId: v.id("albumDuels"),
		aAfter: v.number(),
		bAfter: v.number(),
	}),
	handler: async (ctx, args) => {
		if (args.aUserAlbumId === args.bUserAlbumId) {
			throw new Error("Duel candidates must be distinct");
		}
		if (
			args.winnerUserAlbumId !== args.aUserAlbumId &&
			args.winnerUserAlbumId !== args.bUserAlbumId
		) {
			throw new Error("Winner must be one of the duel candidates");
		}

		const aRow = await loadRatedYearAlbumOrThrow(
			ctx,
			args.userId,
			args.aUserAlbumId,
			args.year,
		);
		const bRow = await loadRatedYearAlbumOrThrow(
			ctx,
			args.userId,
			args.bUserAlbumId,
			args.year,
		);

		const aScore = await getOrCreateScore(
			ctx,
			args.userId,
			aRow.userAlbum,
			aRow.rating,
		);
		const bScore = await getOrCreateScore(
			ctx,
			args.userId,
			bRow.userAlbum,
			bRow.rating,
		);

		const winnerSide: "a" | "b" =
			args.winnerUserAlbumId === args.aUserAlbumId ? "a" : "b";
		const aBefore = aScore.elo;
		const bBefore = bScore.elo;
		const { a: aAfter, b: bAfter } = eloUpdate(aBefore, bBefore, winnerSide);
		const now = Date.now();

		await ctx.db.patch(aScore._id, {
			elo: aAfter,
			matches: aScore.matches + 1,
			updatedAt: now,
		});
		await ctx.db.patch(bScore._id, {
			elo: bAfter,
			matches: bScore.matches + 1,
			updatedAt: now,
		});

		const duelId = await ctx.db.insert("albumDuels", {
			userId: args.userId,
			aUserAlbumId: args.aUserAlbumId,
			bUserAlbumId: args.bUserAlbumId,
			winnerUserAlbumId: args.winnerUserAlbumId,
			aBefore,
			bBefore,
			aAfter,
			bAfter,
			createdAt: now,
		});

		return { duelId, aAfter, bAfter };
	},
});

export const undoLast = mutation({
	args: {
		userId: v.string(),
	},
	returns: v.union(
		v.object({
			undone: v.literal(false),
		}),
		v.object({
			undone: v.literal(true),
			duelId: v.id("albumDuels"),
		}),
	),
	handler: async (ctx, args) => {
		const recent = await ctx.db
			.query("albumDuels")
			.withIndex("by_user_createdAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.take(50);

		const duel = recent.find((row) => row.undoneAt === undefined);
		if (!duel) {
			return { undone: false as const };
		}

		const aScore = await ctx.db
			.query("albumDuelScores")
			.withIndex("by_user_userAlbum", (q) =>
				q.eq("userId", args.userId).eq("userAlbumId", duel.aUserAlbumId),
			)
			.unique();
		const bScore = await ctx.db
			.query("albumDuelScores")
			.withIndex("by_user_userAlbum", (q) =>
				q.eq("userId", args.userId).eq("userAlbumId", duel.bUserAlbumId),
			)
			.unique();

		const now = Date.now();

		if (aScore) {
			await ctx.db.patch(aScore._id, {
				elo: duel.aBefore,
				matches: Math.max(0, aScore.matches - 1),
				updatedAt: now,
			});
		}
		if (bScore) {
			await ctx.db.patch(bScore._id, {
				elo: duel.bBefore,
				matches: Math.max(0, bScore.matches - 1),
				updatedAt: now,
			});
		}

		await ctx.db.patch(duel._id, { undoneAt: now });

		return { undone: true as const, duelId: duel._id };
	},
});

export const listDuelTop = query({
	args: {
		userId: v.string(),
		year: v.number(),
		limit: v.optional(v.number()),
	},
	returns: v.array(duelTopRowValidator),
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50;
		const pool = await loadRatedAlbumsForYear(ctx, args.userId, args.year);
		const scoreMap = await loadScoreMap(ctx, args.userId);

		const rows = pool.map((row) => {
			const score = scoreMap.get(row.userAlbum._id);
			return {
				userAlbumId: row.userAlbum._id,
				albumId: row.album._id,
				elo: score?.elo ?? DEFAULT_ELO,
				matches: score?.matches ?? 0,
				title: row.album.name,
				artist: row.album.artistName,
				...(row.album.imageUrl !== undefined
					? { imageUrl: row.album.imageUrl }
					: {}),
			};
		});

		rows.sort((x, y) => {
			if (y.elo !== x.elo) return y.elo - x.elo;
			return x.userAlbumId.localeCompare(y.userAlbumId);
		});

		return rows.slice(0, limit);
	},
});
