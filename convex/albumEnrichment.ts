import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	type EnrichmentSliceKey,
	type SlicePresence,
	missingEnrichmentSlices,
	normalizeEnrichmentTags,
} from "./_utils/albumEnrichmentSlices";

type EnrichmentDbCtx = QueryCtx | MutationCtx;

const enrichmentSliceKeyValidator = v.union(
	v.literal("artistContext"),
	v.literal("whyListen"),
	v.literal("coverDescriptors"),
	v.literal("occasions"),
);

const slicePresenceValidator = v.object({
	artistContext: v.optional(v.object({ updatedAt: v.number() })),
	whyListen: v.optional(v.object({ updatedAt: v.number() })),
	coverDescriptors: v.optional(v.object({ updatedAt: v.number() })),
	occasions: v.optional(v.object({ updatedAt: v.number() })),
});

const identityPacketValidator = v.object({
	title: v.string(),
	artists: v.array(v.string()),
	releaseYear: v.optional(v.number()),
	coverImageUrl: v.optional(v.string()),
	rymUrl: v.optional(v.string()),
});

const artistContextPayloadValidator = v.object({
	origin: v.optional(v.string()),
	activeSince: v.optional(v.string()),
	instagramUrl: v.optional(v.string()),
	artistWriteup: v.optional(v.string()),
	listenIfYouLike: v.optional(v.array(v.string())),
});

const whyListenPayloadValidator = v.object({
	whyListenPitch: v.string(),
});

const tagPayloadValidator = v.object({
	tags: v.array(v.object({ label: v.string() })),
});

const albumSnapshotFields = {
	title: v.string(),
	artists: v.array(v.string()),
	releaseYear: v.optional(v.number()),
	coverImageUrl: v.optional(v.string()),
	rymUrl: v.optional(v.string()),
	missingSlices: v.array(enrichmentSliceKeyValidator),
	existingSlices: slicePresenceValidator,
};

/** Scan bound for claim/candidate search; large enough for the v1 backlog. */
const FOR_LATER_SCAN_LIMIT = 1000;
const CANDIDATE_SCAN_LIMIT = 500;
const CANDIDATE_RESULT_LIMIT = 10;

type AlbumEnrichmentSnapshot = {
	title: string;
	artists: string[];
	releaseYear?: number;
	coverImageUrl?: string;
	rymUrl?: string;
	missingSlices: EnrichmentSliceKey[];
	existingSlices: SlicePresence;
};

function splitArtistNames(artistName: string): string[] {
	const segments = artistName
		.split(", ")
		.map((segment) => segment.trim())
		.filter(Boolean);
	return segments.length > 0 ? segments : [artistName];
}

function parseReleaseYear(releaseDate: string | undefined): number | undefined {
	if (!releaseDate) {
		return undefined;
	}
	const year = Number.parseInt(releaseDate.slice(0, 4), 10);
	return Number.isFinite(year) ? year : undefined;
}

async function loadRymUrlForAlbum(
	ctx: EnrichmentDbCtx,
	albumId: Id<"spotifyAlbums">,
): Promise<string | undefined> {
	const links = await ctx.db
		.query("rateYourMusicSpotifyAlbumLinks")
		.withIndex("by_albumId", (q) => q.eq("albumId", albumId))
		.collect();
	if (links.length === 0) {
		return undefined;
	}
	const [latest] = [...links].sort((a, b) => b.updatedAt - a.updatedAt);
	if (!latest) {
		return undefined;
	}
	const scrape = await ctx.db.get(latest.scrapeId);
	return scrape?.rymUrl;
}

function isForLaterItemHidden(item: Doc<"forLaterAlbumItems">): boolean {
	return item.markedAsSingle === true || item.removedFromForLater === true;
}

async function buildAlbumEnrichmentSnapshot(
	ctx: EnrichmentDbCtx,
	album: Doc<"spotifyAlbums">,
): Promise<AlbumEnrichmentSnapshot> {
	const releaseYear = parseReleaseYear(album.releaseDate);
	const rymUrl = await loadRymUrlForAlbum(ctx, album._id);

	const enrichment = await ctx.db
		.query("albumEnrichments")
		.withIndex("by_albumId", (q) => q.eq("albumId", album._id))
		.first();
	const existingSlices: SlicePresence = enrichment?.slices ?? {};

	return {
		title: album.name,
		artists: splitArtistNames(album.artistName),
		...(releaseYear !== undefined ? { releaseYear } : {}),
		...(album.imageUrl ? { coverImageUrl: album.imageUrl } : {}),
		...(rymUrl ? { rymUrl } : {}),
		missingSlices: missingEnrichmentSlices(existingSlices),
		existingSlices,
	};
}

export const claimNextForLater = mutation({
	args: { userId: v.string() },
	returns: v.union(
		v.object({
			empty: v.literal(true),
		}),
		v.object({
			empty: v.literal(false),
			albumId: v.id("spotifyAlbums"),
			spotifyAlbumId: v.string(),
			forLaterItemId: v.id("forLaterAlbumItems"),
			...albumSnapshotFields,
		}),
	),
	handler: async (ctx, args) => {
		const items = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_isActive_lastSeenAt", (q) =>
				q.eq("userId", args.userId).eq("isActive", true),
			)
			.order("desc")
			.take(FOR_LATER_SCAN_LIMIT);

		for (const item of items) {
			if (isForLaterItemHidden(item)) {
				continue;
			}
			const album = await ctx.db.get(item.albumId);
			if (!album) {
				continue;
			}
			const snapshot = await buildAlbumEnrichmentSnapshot(ctx, album);
			if (snapshot.missingSlices.length === 0) {
				continue;
			}
			return {
				empty: false as const,
				albumId: item.albumId,
				spotifyAlbumId: item.spotifyAlbumId,
				forLaterItemId: item._id,
				...snapshot,
			};
		}

		return { empty: true as const };
	},
});

async function replaceCoverDescriptorFacets(
	ctx: MutationCtx,
	albumId: Id<"spotifyAlbums">,
	rawTags: Array<{ label: string }>,
): Promise<void> {
	const existingRows = await ctx.db
		.query("albumCoverDescriptorFacets")
		.withIndex("by_albumId", (q) => q.eq("albumId", albumId))
		.collect();
	for (const row of existingRows) {
		await ctx.db.delete(row._id);
	}
	for (const tag of normalizeEnrichmentTags(rawTags)) {
		await ctx.db.insert("albumCoverDescriptorFacets", {
			albumId,
			coverDescriptorKey: tag.key,
			label: tag.label,
		});
	}
}

async function replaceOccasionFacets(
	ctx: MutationCtx,
	albumId: Id<"spotifyAlbums">,
	rawTags: Array<{ label: string }>,
): Promise<void> {
	const existingRows = await ctx.db
		.query("albumOccasionFacets")
		.withIndex("by_albumId", (q) => q.eq("albumId", albumId))
		.collect();
	for (const row of existingRows) {
		await ctx.db.delete(row._id);
	}
	for (const tag of normalizeEnrichmentTags(rawTags)) {
		await ctx.db.insert("albumOccasionFacets", {
			albumId,
			occasionKey: tag.key,
			label: tag.label,
		});
	}
}

export const saveSlices = mutation({
	args: {
		albumId: v.id("spotifyAlbums"),
		identityPacket: identityPacketValidator,
		artistContext: v.optional(artistContextPayloadValidator),
		whyListen: v.optional(whyListenPayloadValidator),
		coverDescriptors: v.optional(tagPayloadValidator),
		occasions: v.optional(tagPayloadValidator),
		mode: v.union(v.literal("gaps"), v.literal("overwrite")),
	},
	returns: v.object({
		albumId: v.id("spotifyAlbums"),
		savedSlices: v.array(enrichmentSliceKeyValidator),
	}),
	handler: async (ctx, args) => {
		const album = await ctx.db.get(args.albumId);
		if (!album) {
			throw new Error("Album not found");
		}

		let enrichment = await ctx.db
			.query("albumEnrichments")
			.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
			.first();

		const now = Date.now();

		if (!enrichment) {
			const insertedId = await ctx.db.insert("albumEnrichments", {
				albumId: args.albumId,
				spotifyAlbumId: album.spotifyAlbumId,
				slices: {},
				createdAt: now,
				updatedAt: now,
			});
			enrichment = await ctx.db.get(insertedId);
		}
		if (!enrichment) {
			throw new Error("Failed to create album enrichment row");
		}

		const shouldWrite = (
			key: EnrichmentSliceKey,
			hasPayload: boolean,
		): boolean =>
			hasPayload &&
			(args.mode === "overwrite" || enrichment.slices[key] == null);

		const savedSlices: EnrichmentSliceKey[] = [];
		const nextSlices: SlicePresence = { ...enrichment.slices };

		const patch: Partial<Doc<"albumEnrichments">> = {
			identityPacket: args.identityPacket,
			lastEnrichedAt: now,
			updatedAt: now,
		};

		if (
			shouldWrite("artistContext", args.artistContext !== undefined) &&
			args.artistContext
		) {
			patch.origin = args.artistContext.origin;
			patch.activeSince = args.artistContext.activeSince;
			patch.instagramUrl = args.artistContext.instagramUrl;
			patch.artistWriteup = args.artistContext.artistWriteup;
			patch.listenIfYouLike = args.artistContext.listenIfYouLike;
			nextSlices.artistContext = { updatedAt: now };
			savedSlices.push("artistContext");
		}

		if (
			shouldWrite("whyListen", args.whyListen !== undefined) &&
			args.whyListen
		) {
			patch.whyListenPitch = args.whyListen.whyListenPitch;
			nextSlices.whyListen = { updatedAt: now };
			savedSlices.push("whyListen");
		}

		if (
			shouldWrite("coverDescriptors", args.coverDescriptors !== undefined) &&
			args.coverDescriptors
		) {
			await replaceCoverDescriptorFacets(
				ctx,
				args.albumId,
				args.coverDescriptors.tags,
			);
			nextSlices.coverDescriptors = { updatedAt: now };
			savedSlices.push("coverDescriptors");
		}

		if (
			shouldWrite("occasions", args.occasions !== undefined) &&
			args.occasions
		) {
			await replaceOccasionFacets(ctx, args.albumId, args.occasions.tags);
			nextSlices.occasions = { updatedAt: now };
			savedSlices.push("occasions");
		}

		patch.slices = nextSlices;

		await ctx.db.patch(enrichment._id, patch);

		return { albumId: args.albumId, savedSlices };
	},
});

function albumMatchesSearchTerm(
	title: string,
	artistName: string,
	term: string,
): boolean {
	return (
		title.toLowerCase().includes(term) ||
		artistName.toLowerCase().includes(term)
	);
}

type AlbumCandidate = {
	albumId: Id<"spotifyAlbums">;
	spotifyAlbumId: string;
	title: string;
	artistName: string;
};

async function searchAlbumCandidates(
	ctx: QueryCtx,
	args: { userId: string; search: string },
): Promise<AlbumCandidate[]> {
	const term = args.search.toLowerCase();
	const seenAlbumIds = new Set<Id<"spotifyAlbums">>();
	const candidates: AlbumCandidate[] = [];

	const libraryItems = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
		.order("desc")
		.take(CANDIDATE_SCAN_LIMIT);

	for (const item of libraryItems) {
		if (candidates.length >= CANDIDATE_RESULT_LIMIT) {
			return candidates;
		}
		if (seenAlbumIds.has(item.albumId)) {
			continue;
		}
		if (!albumMatchesSearchTerm(item.name, item.artistName, term)) {
			continue;
		}
		seenAlbumIds.add(item.albumId);
		candidates.push({
			albumId: item.albumId,
			spotifyAlbumId: item.spotifyAlbumId,
			title: item.name,
			artistName: item.artistName,
		});
	}

	const forLaterItems = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_userId_lastSeenAt", (q) => q.eq("userId", args.userId))
		.order("desc")
		.take(CANDIDATE_SCAN_LIMIT);

	for (const item of forLaterItems) {
		if (candidates.length >= CANDIDATE_RESULT_LIMIT) {
			return candidates;
		}
		if (isForLaterItemHidden(item) || seenAlbumIds.has(item.albumId)) {
			continue;
		}
		const album = await ctx.db.get(item.albumId);
		if (!album || !albumMatchesSearchTerm(album.name, album.artistName, term)) {
			continue;
		}
		seenAlbumIds.add(item.albumId);
		candidates.push({
			albumId: item.albumId,
			spotifyAlbumId: item.spotifyAlbumId,
			title: album.name,
			artistName: album.artistName,
		});
	}

	return candidates;
}

export const resolveAlbum = query({
	args: {
		userId: v.string(),
		q: v.string(),
	},
	returns: v.union(
		v.null(),
		v.object({
			kind: v.literal("exact"),
			albumId: v.id("spotifyAlbums"),
			spotifyAlbumId: v.string(),
			...albumSnapshotFields,
		}),
		v.object({
			kind: v.literal("candidates"),
			candidates: v.array(
				v.object({
					albumId: v.id("spotifyAlbums"),
					spotifyAlbumId: v.string(),
					title: v.string(),
					artistName: v.string(),
				}),
			),
		}),
	),
	handler: async (ctx, args) => {
		const term = args.q.trim();
		if (!term) {
			return null;
		}

		const normalizedId = ctx.db.normalizeId("spotifyAlbums", term);
		const albumById = normalizedId ? await ctx.db.get(normalizedId) : null;
		if (albumById) {
			const snapshot = await buildAlbumEnrichmentSnapshot(ctx, albumById);
			return {
				kind: "exact" as const,
				albumId: albumById._id,
				spotifyAlbumId: albumById.spotifyAlbumId,
				...snapshot,
			};
		}

		const albumBySpotifyId = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_spotifyAlbumId", (q) => q.eq("spotifyAlbumId", term))
			.first();
		if (albumBySpotifyId) {
			const snapshot = await buildAlbumEnrichmentSnapshot(
				ctx,
				albumBySpotifyId,
			);
			return {
				kind: "exact" as const,
				albumId: albumBySpotifyId._id,
				spotifyAlbumId: albumBySpotifyId.spotifyAlbumId,
				...snapshot,
			};
		}

		const candidates = await searchAlbumCandidates(ctx, {
			userId: args.userId,
			search: term,
		});

		if (candidates.length === 0) {
			return null;
		}

		if (candidates.length === 1) {
			const [only] = candidates;
			const album = only ? await ctx.db.get(only.albumId) : null;
			if (!album) {
				return null;
			}
			const snapshot = await buildAlbumEnrichmentSnapshot(ctx, album);
			return {
				kind: "exact" as const,
				albumId: album._id,
				spotifyAlbumId: album.spotifyAlbumId,
				...snapshot,
			};
		}

		return { kind: "candidates" as const, candidates };
	},
});
