import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	applyHideCreditLabel,
	applyShowCreditLabel,
	normalizeCreditLabelList,
} from "./_utils/geniusCreditVisibility";
import {
	isPublicPlaylistStatus,
	sortPlaylistItems,
} from "./_utils/playlistLyrics";
import {
	zineCoverTextAlignValidator,
	zineCoverTextAnchorValidator,
	zineCoverTextLayoutMutationValidator,
} from "./_utils/zineCoverTextLayout";
import {
	normalizeZineInsideBackSections,
	zineInsideBackSectionsValidator,
} from "./_utils/zineInsideBackSections";
import { zineInsideBackLayoutMutationValidator } from "./_utils/zineInsideBackLayout";
import { requireAuth } from "./auth";
import { getSiteWideHiddenCreditLabelKeys, getIgnoredCreditLabelKeys } from "./geniusCreditLabels";

const playlistStatusValidator = v.union(v.literal("draft"), v.literal("ready"));
const scrapeStatusValidator = v.union(v.literal("ready"), v.literal("failed"));
const itemScrapeStateValidator = v.union(
	v.literal("scraping"),
	v.literal("ready"),
	v.literal("failed"),
	v.literal("reused"),
	v.literal("manual"),
);

const geniusCreditValidator = v.object({
	label: v.string(),
	contributors: v.array(
		v.object({
			name: v.string(),
			url: v.optional(v.string()),
		}),
	),
});

const zineDisplaySettingsValidator = v.object({
	showArtist: v.optional(v.boolean()),
	showAlbum: v.optional(v.boolean()),
	showYear: v.optional(v.boolean()),
	showAlbumArt: v.optional(v.boolean()),
	showIntro: v.optional(v.boolean()),
	showGeniusInfo: v.optional(v.boolean()),
	showSectionLabels: v.optional(v.boolean()),
	showUserNote: v.optional(v.boolean()),
	separateInstrumentalPages: v.optional(v.boolean()),
});

const playlistValidator = v.object({
	_id: v.id("playlistLyrics"),
	_creationTime: v.number(),
	title: v.string(),
	slug: v.string(),
	theme: v.optional(v.string()),
	description: v.optional(v.string()),
	notes: v.optional(v.string()),
	zineCoverImageUrl: v.optional(v.string()),
	zineCoverImageStorageId: v.optional(v.id("_storage")),
	zineCoverGreyscale: v.optional(v.boolean()),
	zineCoverTextAnchor: v.optional(zineCoverTextAnchorValidator),
	zineCoverTextAlign: v.optional(zineCoverTextAlignValidator),
	zineCoverTextOffsetXIn: v.optional(v.number()),
	zineCoverTextOffsetYIn: v.optional(v.number()),
	zineSpotifyQrStorageId: v.optional(v.id("_storage")),
	zineSpotifyQrImageUrl: v.optional(v.string()),
	zineAppleMusicQrStorageId: v.optional(v.id("_storage")),
	zineAppleMusicQrImageUrl: v.optional(v.string()),
	zineShowSpotifyQr: v.optional(v.boolean()),
	zineShowAppleMusicQr: v.optional(v.boolean()),
	zineDisplaySettings: v.optional(zineDisplaySettingsValidator),
	zineInsideBackSections: v.optional(zineInsideBackSectionsValidator),
	zineInsideBackMarginTopPt: v.optional(v.number()),
	zineInsideBackMarginRightPt: v.optional(v.number()),
	zineInsideBackMarginBottomPt: v.optional(v.number()),
	zineInsideBackMarginLeftPt: v.optional(v.number()),
	zineInsideBackContentAlign: v.optional(
		v.union(v.literal("center"), v.literal("right")),
	),
	zineInsideBackArtistDisplay: v.optional(
		v.union(v.literal("newline"), v.literal("inline")),
	),
	zineInsideBackRecommendationRowAlign: v.optional(
		v.union(v.literal("top"), v.literal("center")),
	),
	status: playlistStatusValidator,
	createdAt: v.number(),
	updatedAt: v.number(),
});

const publicPlaylistValidator = v.object({
	title: v.string(),
	slug: v.string(),
	theme: v.optional(v.string()),
	description: v.optional(v.string()),
	zineCoverImageUrl: v.optional(v.string()),
	zineCoverGreyscale: v.optional(v.boolean()),
	zineCoverTextAnchor: v.optional(zineCoverTextAnchorValidator),
	zineCoverTextAlign: v.optional(zineCoverTextAlignValidator),
	zineCoverTextOffsetXIn: v.optional(v.number()),
	zineCoverTextOffsetYIn: v.optional(v.number()),
	zineSpotifyQrImageUrl: v.optional(v.string()),
	zineAppleMusicQrImageUrl: v.optional(v.string()),
	zineShowSpotifyQr: v.optional(v.boolean()),
	zineShowAppleMusicQr: v.optional(v.boolean()),
	zineDisplaySettings: v.optional(zineDisplaySettingsValidator),
	zineInsideBackSections: v.optional(zineInsideBackSectionsValidator),
	zineInsideBackMarginTopPt: v.optional(v.number()),
	zineInsideBackMarginRightPt: v.optional(v.number()),
	zineInsideBackMarginBottomPt: v.optional(v.number()),
	zineInsideBackMarginLeftPt: v.optional(v.number()),
	zineInsideBackContentAlign: v.optional(
		v.union(v.literal("center"), v.literal("right")),
	),
	zineInsideBackArtistDisplay: v.optional(
		v.union(v.literal("newline"), v.literal("inline")),
	),
	zineInsideBackRecommendationRowAlign: v.optional(
		v.union(v.literal("top"), v.literal("center")),
	),
});

const scrapeValidator = v.object({
	_id: v.id("geniusLyricScrapes"),
	_creationTime: v.number(),
	canonicalUrl: v.string(),
	songTitle: v.string(),
	artistName: v.string(),
	albumTitle: v.optional(v.string()),
	albumYear: v.optional(v.string()),
	albumArtUrl: v.optional(v.string()),
	lyrics: v.string(),
	about: v.optional(v.string()),
	credits: v.optional(v.array(geniusCreditValidator)),
	scrapeStatus: scrapeStatusValidator,
	lastScrapedAt: v.number(),
	createdAt: v.number(),
	updatedAt: v.number(),
});

const publicScrapeValidator = v.object({
	songTitle: v.string(),
	artistName: v.string(),
	albumTitle: v.optional(v.string()),
	albumYear: v.optional(v.string()),
	albumArtUrl: v.optional(v.string()),
	lyrics: v.string(),
	about: v.optional(v.string()),
	credits: v.optional(v.array(geniusCreditValidator)),
});

const itemWithScrapeValidator = v.object({
	_id: v.id("playlistLyricsItems"),
	_creationTime: v.number(),
	playlistId: v.id("playlistLyrics"),
	lyricScrapeId: v.optional(v.id("geniusLyricScrapes")),
	position: v.number(),
	userNote: v.optional(v.string()),
	introContent: v.optional(v.string()),
	songTitleOverride: v.optional(v.string()),
	artistNameOverride: v.optional(v.string()),
	albumTitleOverride: v.optional(v.string()),
	albumArtUrlOverride: v.optional(v.string()),
	zineLyricsColumnCount: v.optional(v.union(v.literal(1), v.literal(2))),
	zineLyricsFontSizePt: v.optional(v.number()),
	zineTitleCondenseScale: v.optional(v.number()),
	zineShowCredits: v.optional(v.boolean()),
	durationSecondsOverride: v.optional(v.number()),
	hiddenCreditLabels: v.optional(v.array(v.string())),
	shownCreditLabels: v.optional(v.array(v.string())),
	pendingUrl: v.optional(v.string()),
	scrapeState: itemScrapeStateValidator,
	createdAt: v.number(),
	updatedAt: v.number(),
	scrape: v.optional(scrapeValidator),
});

const publicItemWithScrapeValidator = v.object({
	_id: v.id("playlistLyricsItems"),
	position: v.number(),
	userNote: v.optional(v.string()),
	introContent: v.optional(v.string()),
	songTitleOverride: v.optional(v.string()),
	artistNameOverride: v.optional(v.string()),
	albumTitleOverride: v.optional(v.string()),
	albumArtUrlOverride: v.optional(v.string()),
	zineLyricsColumnCount: v.optional(v.union(v.literal(1), v.literal(2))),
	zineLyricsFontSizePt: v.optional(v.number()),
	zineTitleCondenseScale: v.optional(v.number()),
	zineShowCredits: v.optional(v.boolean()),
	durationSecondsOverride: v.optional(v.number()),
	hiddenCreditLabels: v.optional(v.array(v.string())),
	shownCreditLabels: v.optional(v.array(v.string())),
	scrape: v.optional(publicScrapeValidator),
});

const syncScrapeInputValidator = v.object({
	canonicalUrl: v.string(),
	songTitle: v.string(),
	artistName: v.string(),
	albumTitle: v.optional(v.string()),
	albumYear: v.optional(v.string()),
	albumArtUrl: v.optional(v.string()),
	lyrics: v.string(),
	about: v.optional(v.string()),
	credits: v.optional(v.array(geniusCreditValidator)),
	lastScrapedAt: v.optional(v.number()),
	createdAt: v.optional(v.number()),
	updatedAt: v.optional(v.number()),
});

type ItemWithScrape = Doc<"playlistLyricsItems"> & {
	scrape?: Doc<"geniusLyricScrapes">;
};

type PlaylistPatch = {
	title?: string;
	theme?: string;
	description?: string;
	notes?: string;
	zineCoverImageUrl?: string;
	status?: "draft" | "ready";
	updatedAt: number;
};

type GeniusCreditInput = {
	label: string;
	contributors: Array<{
		name: string;
		url?: string;
	}>;
};

type ScrapeUpsertInput = {
	canonicalUrl: string;
	songTitle: string;
	artistName: string;
	albumTitle?: string;
	albumYear?: string;
	albumArtUrl?: string;
	lyrics: string;
	about?: string;
	credits?: GeniusCreditInput[];
	lastScrapedAt?: number;
	createdAt?: number;
	updatedAt?: number;
};

export const list = query({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.array(playlistValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		return await ctx.db
			.query("playlistLyrics")
			.withIndex("by_updatedAt")
			.order("desc")
			.take(args.limit ?? 100);
	},
});

export const listPublic = query({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.array(publicPlaylistValidator),
	handler: async (ctx, args) => {
		const playlists = await ctx.db
			.query("playlistLyrics")
			.withIndex("by_status", (q) => q.eq("status", "ready"))
			.collect();

		return Promise.all(
			playlists
				.sort((a, b) => b.updatedAt - a.updatedAt)
				.slice(0, args.limit ?? 100)
				.map((playlist) => toPublicPlaylist(ctx, playlist)),
		);
	},
});

export const getBySlug = query({
	args: {
		slug: v.string(),
	},
	returns: v.union(
		v.object({
			playlist: playlistValidator,
			songs: v.array(itemWithScrapeValidator),
			siteWideHiddenCreditLabelKeys: v.array(v.string()),
			ignoredCreditLabelKeys: v.array(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const playlist = await ctx.db
			.query("playlistLyrics")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!playlist) return null;

		const items = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId_position", (q) =>
				q.eq("playlistId", playlist._id),
			)
			.collect();
		const songs = await attachScrapes(ctx, sortPlaylistItems(items));
		const siteWideHiddenCreditLabelKeys =
			await getSiteWideHiddenCreditLabelKeys(ctx);
		const ignoredCreditLabelKeys = await getIgnoredCreditLabelKeys(ctx);

		return {
			playlist: {
				...playlist,
				zineCoverImageUrl: await resolveZineCoverImageUrl(ctx, playlist),
				zineSpotifyQrImageUrl: await resolveZineSpotifyQrImageUrl(
					ctx,
					playlist,
				),
				zineAppleMusicQrImageUrl: await resolveZineAppleMusicQrImageUrl(
					ctx,
					playlist,
				),
			},
			songs,
			siteWideHiddenCreditLabelKeys,
			ignoredCreditLabelKeys,
		};
	},
});

export const getPublicBySlug = query({
	args: {
		slug: v.string(),
	},
	returns: v.union(
		v.object({
			playlist: publicPlaylistValidator,
			songs: v.array(publicItemWithScrapeValidator),
			siteWideHiddenCreditLabelKeys: v.array(v.string()),
			ignoredCreditLabelKeys: v.array(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const playlist = await ctx.db
			.query("playlistLyrics")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!playlist || !isPublicPlaylistStatus(playlist.status)) return null;

		const items = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId_position", (q) =>
				q.eq("playlistId", playlist._id),
			)
			.collect();
		const songs = await attachScrapes(ctx, sortPlaylistItems(items));
		const siteWideHiddenCreditLabelKeys =
			await getSiteWideHiddenCreditLabelKeys(ctx);
		const ignoredCreditLabelKeys = await getIgnoredCreditLabelKeys(ctx);

		return {
			playlist: {
				...(await toPublicPlaylist(ctx, playlist)),
			},
			songs: songs.map(toPublicItemWithScrape),
			siteWideHiddenCreditLabelKeys,
			ignoredCreditLabelKeys,
		};
	},
});

export const getScrapeByCanonicalUrl = query({
	args: {
		canonicalUrl: v.string(),
	},
	returns: v.union(scrapeValidator, v.null()),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		return await ctx.db
			.query("geniusLyricScrapes")
			.withIndex("by_canonicalUrl", (q) =>
				q.eq("canonicalUrl", args.canonicalUrl),
			)
			.first();
	},
});

export const getItemForRescrape = query({
	args: {
		itemId: v.id("playlistLyricsItems"),
	},
	returns: v.union(itemWithScrapeValidator, v.null()),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) return null;

		const scrape = item.lyricScrapeId
			? await ctx.db.get(item.lyricScrapeId)
			: undefined;

		return { ...item, scrape: scrape ?? undefined };
	},
});

export const createDraft = mutation({
	args: {},
	returns: v.object({ slug: v.string() }),
	handler: async (ctx) => {
		requireAuth(ctx);

		const now = Date.now();
		const slug = `untitled-playlist-${now}`;

		await ctx.db.insert("playlistLyrics", {
			title: "Untitled Playlist",
			slug,
			status: "draft",
			createdAt: now,
			updatedAt: now,
		});

		return { slug };
	},
});

export const updatePlaylist = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		title: v.optional(v.string()),
		theme: v.optional(v.string()),
		description: v.optional(v.string()),
		notes: v.optional(v.string()),
		status: v.optional(playlistStatusValidator),
	},
	returns: v.object({ slug: v.string() }),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const playlist = await ctx.db.get(args.playlistId);
		if (!playlist) {
			throw new Error("Playlist not found");
		}

		const now = Date.now();
		const updates: PlaylistPatch = { updatedAt: now };

		if (args.title !== undefined) {
			const title = args.title.trim();
			if (!title) {
				throw new Error("Playlist title is required");
			}

			updates.title = title;
		}

		if (args.theme !== undefined) {
			updates.theme = normalizeOptionalString(args.theme);
		}
		if (args.description !== undefined) {
			updates.description = normalizeOptionalString(args.description);
		}
		if (args.notes !== undefined) {
			updates.notes = normalizeOptionalString(args.notes);
		}
		if (args.status !== undefined) {
			updates.status = args.status;
		}

		await ctx.db.patch(args.playlistId, updates);

		return { slug: playlist.slug };
	},
});

export const generateZineCoverUploadUrl = mutation({
	args: {},
	returns: v.string(),
	handler: async (ctx) => {
		requireAuth(ctx);
		return await ctx.storage.generateUploadUrl();
	},
});

export const updateZineCoverImage = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		coverImageUrl: v.optional(v.string()),
		storageId: v.optional(v.id("_storage")),
	},
	returns: v.object({ coverImageUrl: v.optional(v.string()) }),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const playlist = await requirePlaylist(ctx, args.playlistId);
		const now = Date.now();

		if (args.storageId !== undefined) {
			if (
				playlist.zineCoverImageStorageId &&
				playlist.zineCoverImageStorageId !== args.storageId
			) {
				await ctx.storage.delete(playlist.zineCoverImageStorageId);
			}

			await ctx.db.patch(args.playlistId, {
				zineCoverImageStorageId: args.storageId,
				zineCoverImageUrl: undefined,
				updatedAt: now,
			});

			return {
				coverImageUrl: (await ctx.storage.getUrl(args.storageId)) ?? undefined,
			};
		}

		if (args.coverImageUrl !== undefined) {
			if (playlist.zineCoverImageStorageId) {
				await ctx.storage.delete(playlist.zineCoverImageStorageId);
			}

			const normalized = normalizeOptionalString(args.coverImageUrl);

			await ctx.db.patch(args.playlistId, {
				zineCoverImageUrl: normalized,
				zineCoverImageStorageId: undefined,
				updatedAt: now,
			});

			return { coverImageUrl: normalized };
		}

		throw new Error("No cover image provided");
	},
});

export const updateZineCoverGreyscale = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		greyscale: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		await ctx.db.patch(args.playlistId, {
			zineCoverGreyscale: args.greyscale ? true : undefined,
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const updateZineCoverTextLayout = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		layout: zineCoverTextLayoutMutationValidator,
	},
	returns: v.id("playlistLyrics"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await requirePlaylist(ctx, args.playlistId);

		await ctx.db.patch(args.playlistId, {
			zineCoverTextAnchor: args.layout.anchor,
			zineCoverTextAlign: args.layout.textAlign,
			zineCoverTextOffsetXIn: args.layout.offsetXIn,
			zineCoverTextOffsetYIn: args.layout.offsetYIn,
			updatedAt: Date.now(),
		});

		return args.playlistId;
	},
});

const zineDisplaySettingsMutationValidator = v.object({
	showArtist: v.boolean(),
	showAlbum: v.boolean(),
	showYear: v.boolean(),
	showAlbumArt: v.boolean(),
	showIntro: v.boolean(),
	showGeniusInfo: v.boolean(),
	showSectionLabels: v.boolean(),
	showUserNote: v.boolean(),
	separateInstrumentalPages: v.boolean(),
});

export const updateZineDisplaySettings = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		settings: zineDisplaySettingsMutationValidator,
	},
	returns: v.id("playlistLyrics"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await requirePlaylist(ctx, args.playlistId);

		await ctx.db.patch(args.playlistId, {
			zineDisplaySettings: args.settings,
			updatedAt: Date.now(),
		});

		return args.playlistId;
	},
});

export const updateZineInsideBackSections = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		sections: zineInsideBackSectionsValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const playlist = await ctx.db.get(args.playlistId);
		if (!playlist) throw new Error("Playlist not found");

		await ctx.db.patch(args.playlistId, {
			zineInsideBackSections: normalizeZineInsideBackSections(args.sections),
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const updateZineInsideBackLayoutSettings = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		layout: zineInsideBackLayoutMutationValidator,
	},
	returns: v.id("playlistLyrics"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await requirePlaylist(ctx, args.playlistId);

		await ctx.db.patch(args.playlistId, {
			zineInsideBackMarginTopPt: args.layout.marginTopPt,
			zineInsideBackMarginRightPt: args.layout.marginRightPt,
			zineInsideBackMarginBottomPt: args.layout.marginBottomPt,
			zineInsideBackMarginLeftPt: args.layout.marginLeftPt,
			zineInsideBackContentAlign: args.layout.contentAlign,
			zineInsideBackArtistDisplay: args.layout.artistDisplay,
			zineInsideBackRecommendationRowAlign: args.layout.recommendationRowAlign,
			updatedAt: Date.now(),
		});

		return args.playlistId;
	},
});

export const updateZineSpotifyQr = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		qrImageUrl: v.optional(v.string()),
		storageId: v.optional(v.id("_storage")),
	},
	returns: v.object({ qrImageUrl: v.optional(v.string()) }),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await updateZineQrImage(ctx, args.playlistId, "spotify", args);
	},
});

export const updateZineAppleMusicQr = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		qrImageUrl: v.optional(v.string()),
		storageId: v.optional(v.id("_storage")),
	},
	returns: v.object({ qrImageUrl: v.optional(v.string()) }),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await updateZineQrImage(ctx, args.playlistId, "appleMusic", args);
	},
});

export const updateZineQrToggles = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		showSpotifyQr: v.optional(v.boolean()),
		showAppleMusicQr: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		const patch: {
			zineShowSpotifyQr?: boolean;
			zineShowAppleMusicQr?: boolean;
			updatedAt: number;
		} = { updatedAt: Date.now() };

		if (args.showSpotifyQr !== undefined) {
			patch.zineShowSpotifyQr = args.showSpotifyQr ? true : undefined;
		}
		if (args.showAppleMusicQr !== undefined) {
			patch.zineShowAppleMusicQr = args.showAppleMusicQr ? true : undefined;
		}

		await ctx.db.patch(args.playlistId, patch);

		return null;
	},
});

export const createFailedItem = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		pendingUrl: v.string(),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		const now = Date.now();
		const position = await getNextPosition(ctx, args.playlistId);

		return await ctx.db.insert("playlistLyricsItems", {
			playlistId: args.playlistId,
			position,
			pendingUrl: args.pendingUrl,
			scrapeState: "failed",
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const createManualItem = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		songTitle: v.string(),
		artistName: v.optional(v.string()),
		albumTitle: v.optional(v.string()),
		introContent: v.optional(v.string()),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		const songTitle = args.songTitle.trim();
		if (!songTitle) {
			throw new Error("Song title is required");
		}

		const now = Date.now();
		const position = await getNextPosition(ctx, args.playlistId);

		return await ctx.db.insert("playlistLyricsItems", {
			playlistId: args.playlistId,
			position,
			scrapeState: "manual",
			songTitleOverride: songTitle,
			artistNameOverride: normalizeOptionalString(args.artistName),
			albumTitleOverride: normalizeOptionalString(args.albumTitle),
			introContent: normalizeOptionalString(args.introContent),
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const upsertScrape = mutation({
	args: {
		canonicalUrl: v.string(),
		songTitle: v.string(),
		artistName: v.string(),
		albumTitle: v.optional(v.string()),
		albumYear: v.optional(v.string()),
		albumArtUrl: v.optional(v.string()),
		lyrics: v.string(),
		about: v.optional(v.string()),
		credits: v.optional(v.array(geniusCreditValidator)),
	},
	returns: v.id("geniusLyricScrapes"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		return await upsertScrapeRow(ctx, args);
	},
});

export const addScrapeToPlaylist = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		lyricScrapeId: v.id("geniusLyricScrapes"),
		reused: v.optional(v.boolean()),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		const scrape = await ctx.db.get(args.lyricScrapeId);
		if (!scrape) {
			throw new Error("Lyric scrape not found");
		}

		const existingItemsForScrape = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_lyricScrapeId", (q) =>
				q.eq("lyricScrapeId", args.lyricScrapeId),
			)
			.collect();
		const duplicate = existingItemsForScrape.some(
			(item) => item.playlistId === args.playlistId,
		);

		if (duplicate) {
			throw new Error("Song is already in this playlist");
		}

		const now = Date.now();
		const position = await getNextPosition(ctx, args.playlistId);

		return await ctx.db.insert("playlistLyricsItems", {
			playlistId: args.playlistId,
			lyricScrapeId: args.lyricScrapeId,
			position,
			scrapeState: args.reused ? "reused" : "ready",
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const updateItem = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
		userNote: v.optional(v.string()),
		introContent: v.optional(v.string()),
		songTitleOverride: v.optional(v.string()),
		artistNameOverride: v.optional(v.string()),
		albumTitleOverride: v.optional(v.string()),
		albumArtUrlOverride: v.optional(v.string()),
		durationSecondsOverride: v.optional(v.union(v.number(), v.null())),
		hiddenCreditLabels: v.optional(v.array(v.string())),
		shownCreditLabels: v.optional(v.array(v.string())),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) {
			throw new Error("Playlist item not found");
		}

		const updates: {
			userNote?: string;
			introContent?: string;
			songTitleOverride?: string;
			artistNameOverride?: string;
			albumTitleOverride?: string;
			albumArtUrlOverride?: string;
			durationSecondsOverride?: number;
			hiddenCreditLabels?: string[];
			shownCreditLabels?: string[];
			updatedAt: number;
		} = {
			updatedAt: Date.now(),
		};

		if (args.userNote !== undefined) {
			updates.userNote = normalizeOptionalString(args.userNote);
		}
		if (args.introContent !== undefined) {
			updates.introContent = normalizeOptionalString(args.introContent);
		}
		if (args.songTitleOverride !== undefined) {
			updates.songTitleOverride = normalizeOptionalString(
				args.songTitleOverride,
			);
		}
		if (args.artistNameOverride !== undefined) {
			updates.artistNameOverride = normalizeOptionalString(
				args.artistNameOverride,
			);
		}
		if (args.albumTitleOverride !== undefined) {
			updates.albumTitleOverride = normalizeOptionalString(
				args.albumTitleOverride,
			);
		}
		if (args.albumArtUrlOverride !== undefined) {
			updates.albumArtUrlOverride = normalizeOptionalString(
				args.albumArtUrlOverride,
			);
		}
		if (args.durationSecondsOverride !== undefined) {
			if (args.durationSecondsOverride === null) {
				updates.durationSecondsOverride = undefined;
			} else if (
				!Number.isFinite(args.durationSecondsOverride) ||
				args.durationSecondsOverride < 0
			) {
				throw new Error("Duration must be a non-negative number of seconds");
			} else {
				updates.durationSecondsOverride = Math.round(
					args.durationSecondsOverride,
				);
			}
		}
		if (args.hiddenCreditLabels !== undefined) {
			updates.hiddenCreditLabels = normalizeCreditLabelList(
				args.hiddenCreditLabels,
			);
		}
		if (args.shownCreditLabels !== undefined) {
			updates.shownCreditLabels = normalizeCreditLabelList(
				args.shownCreditLabels,
			);
		}

		await ctx.db.patch(args.itemId, updates);

		return args.itemId;
	},
});

export const hideItemCreditLabel = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
		label: v.string(),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) throw new Error("Playlist item not found");

		const siteWideHiddenLabelKeys = await getSiteWideHiddenCreditLabelKeys(ctx);
		const next = applyHideCreditLabel(
			{
				hiddenCreditLabels: item.hiddenCreditLabels,
				shownCreditLabels: item.shownCreditLabels,
				siteWideHiddenLabelKeys,
			},
			args.label,
		);

		await ctx.db.patch(args.itemId, next);
		return args.itemId;
	},
});

export const showItemCreditLabel = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
		label: v.string(),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) throw new Error("Playlist item not found");

		const siteWideHiddenLabelKeys = await getSiteWideHiddenCreditLabelKeys(ctx);
		const next = applyShowCreditLabel(
			{
				hiddenCreditLabels: item.hiddenCreditLabels,
				shownCreditLabels: item.shownCreditLabels,
				siteWideHiddenLabelKeys,
			},
			args.label,
		);

		await ctx.db.patch(args.itemId, next);
		return args.itemId;
	},
});

/** Mirrors `src/app/playlist-lyrics/_utils/zine-layout.ts` slider bounds. */
const ZINE_LYRICS_FONT_MIN_PT = 6;
const ZINE_LYRICS_FONT_MAX_PT = 16;
const ZINE_LYRICS_FONT_DEFAULT_PT = 9;

/** Mirrors `src/app/playlist-lyrics/_utils/zine-layout.ts` `ZINE_TEXT_CONDENSE`. */
const ZINE_TITLE_CONDENSE_MIN = 0.5;
const ZINE_TITLE_CONDENSE_MAX = 1;
const ZINE_TITLE_CONDENSE_DEFAULT = 1;

export const updateZineItemSettings = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
		zineLyricsColumnCount: v.optional(v.union(v.literal(1), v.literal(2))),
		zineLyricsFontSizePt: v.optional(v.number()),
		zineTitleCondenseScale: v.optional(v.number()),
		zineShowCredits: v.optional(v.boolean()),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		if (
			args.zineLyricsColumnCount === undefined &&
			args.zineLyricsFontSizePt === undefined &&
			args.zineTitleCondenseScale === undefined &&
			args.zineShowCredits === undefined
		) {
			throw new Error("No zine settings provided");
		}

		const item = await ctx.db.get(args.itemId);
		if (!item) {
			throw new Error("Playlist item not found");
		}

		await requirePlaylist(ctx, item.playlistId);

		const roundedPt =
			args.zineLyricsFontSizePt !== undefined
				? Math.round(args.zineLyricsFontSizePt * 2) / 2
				: undefined;

		if (
			roundedPt !== undefined &&
			(!Number.isFinite(roundedPt) ||
				roundedPt < ZINE_LYRICS_FONT_MIN_PT ||
				roundedPt > ZINE_LYRICS_FONT_MAX_PT)
		) {
			throw new Error("Lyrics font size must be between 6 and 16 pt");
		}

		const roundedCondenseScale =
			args.zineTitleCondenseScale !== undefined
				? Math.round(args.zineTitleCondenseScale * 100) / 100
				: undefined;

		if (
			roundedCondenseScale !== undefined &&
			(!Number.isFinite(roundedCondenseScale) ||
				roundedCondenseScale < ZINE_TITLE_CONDENSE_MIN ||
				roundedCondenseScale > ZINE_TITLE_CONDENSE_MAX)
		) {
			throw new Error(
				`Title condense scale must be between ${ZINE_TITLE_CONDENSE_MIN} and ${ZINE_TITLE_CONDENSE_MAX}`,
			);
		}

		const patch: {
			zineLyricsColumnCount?: 1 | 2 | undefined;
			zineLyricsFontSizePt?: number | undefined;
			zineTitleCondenseScale?: number | undefined;
			zineShowCredits?: boolean | undefined;
			updatedAt: number;
		} = {
			updatedAt: Date.now(),
		};

		if (args.zineLyricsColumnCount !== undefined) {
			patch.zineLyricsColumnCount =
				args.zineLyricsColumnCount === 2 ? undefined : 1;
		}

		if (args.zineLyricsFontSizePt !== undefined && roundedPt !== undefined) {
			patch.zineLyricsFontSizePt =
				roundedPt === ZINE_LYRICS_FONT_DEFAULT_PT ? undefined : roundedPt;
		}

		if (
			args.zineTitleCondenseScale !== undefined &&
			roundedCondenseScale !== undefined
		) {
			patch.zineTitleCondenseScale =
				roundedCondenseScale === ZINE_TITLE_CONDENSE_DEFAULT
					? undefined
					: roundedCondenseScale;
		}

		if (args.zineShowCredits !== undefined) {
			patch.zineShowCredits = args.zineShowCredits ? undefined : false;
		}

		await ctx.db.patch(args.itemId, patch);

		return args.itemId;
	},
});

export const markItemScrapeReady = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
		lyricScrapeId: v.id("geniusLyricScrapes"),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) {
			throw new Error("Playlist item not found");
		}

		const scrape = await ctx.db.get(args.lyricScrapeId);
		if (!scrape) {
			throw new Error("Lyric scrape not found");
		}

		await ctx.db.patch(args.itemId, {
			lyricScrapeId: args.lyricScrapeId,
			pendingUrl: undefined,
			scrapeState: "ready",
			updatedAt: Date.now(),
		});

		return args.itemId;
	},
});

export const markItemScrapeFailed = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
		pendingUrl: v.string(),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) {
			throw new Error("Playlist item not found");
		}

		await ctx.db.patch(args.itemId, {
			pendingUrl: args.pendingUrl,
			scrapeState: "failed",
			updatedAt: Date.now(),
		});

		return args.itemId;
	},
});

export const deleteItem = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) {
			throw new Error("Playlist item not found");
		}

		await ctx.db.delete(args.itemId);
		await compactPlaylistItemPositions(ctx, item.playlistId);

		return { success: true };
	},
});

export const reorderItems = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		itemIds: v.array(v.id("playlistLyricsItems")),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		const uniqueItemIds = new Set(args.itemIds);
		if (uniqueItemIds.size !== args.itemIds.length) {
			throw new Error("Cannot reorder duplicate items");
		}

		const existingItems = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId", (q) => q.eq("playlistId", args.playlistId))
			.collect();
		if (uniqueItemIds.size !== existingItems.length) {
			throw new Error("Reorder must include every playlist item");
		}

		for (const item of existingItems) {
			if (!uniqueItemIds.has(item._id)) {
				throw new Error("Reorder must include every playlist item");
			}
		}

		for (let index = 0; index < args.itemIds.length; index++) {
			const itemId = args.itemIds[index];
			if (!itemId) continue;

			const item = await ctx.db.get(itemId);
			if (!item || item.playlistId !== args.playlistId) {
				throw new Error("All items must belong to the playlist");
			}

			await ctx.db.patch(itemId, {
				position: index + 1,
				updatedAt: Date.now(),
			});
		}

		return { success: true };
	},
});

export const listForSync = query({
	args: {},
	returns: v.array(
		v.object({
			playlist: playlistValidator,
			songs: v.array(itemWithScrapeValidator),
		}),
	),
	handler: async (ctx) => {
		requireAuth(ctx);

		const playlists = await ctx.db.query("playlistLyrics").collect();
		const result: Array<{
			playlist: Doc<"playlistLyrics">;
			songs: ItemWithScrape[];
		}> = [];

		for (const playlist of playlists) {
			const items = await ctx.db
				.query("playlistLyricsItems")
				.withIndex("by_playlistId_position", (q) =>
					q.eq("playlistId", playlist._id),
				)
				.collect();
			const songs = await attachScrapes(ctx, sortPlaylistItems(items));

			result.push({ playlist, songs });
		}

		return result.sort((a, b) => b.playlist.updatedAt - a.playlist.updatedAt);
	},
});

export const upsertPlaylistForSync = mutation({
	args: {
		title: v.string(),
		slug: v.string(),
		theme: v.optional(v.string()),
		description: v.optional(v.string()),
		notes: v.optional(v.string()),
		zineSpotifyQrImageUrl: v.optional(v.string()),
		zineAppleMusicQrImageUrl: v.optional(v.string()),
		zineShowSpotifyQr: v.optional(v.boolean()),
		zineShowAppleMusicQr: v.optional(v.boolean()),
		status: playlistStatusValidator,
		createdAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
	},
	returns: v.id("playlistLyrics"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const now = Date.now();
		const existing = await ctx.db
			.query("playlistLyrics")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		const playlist = {
			title: args.title,
			slug: args.slug,
			theme: normalizeOptionalString(args.theme),
			description: normalizeOptionalString(args.description),
			notes: normalizeOptionalString(args.notes),
			zineSpotifyQrImageUrl: normalizeOptionalString(
				args.zineSpotifyQrImageUrl,
			),
			zineAppleMusicQrImageUrl: normalizeOptionalString(
				args.zineAppleMusicQrImageUrl,
			),
			zineShowSpotifyQr: args.zineShowSpotifyQr ? true : undefined,
			zineShowAppleMusicQr: args.zineShowAppleMusicQr ? true : undefined,
			status: args.status,
			updatedAt: args.updatedAt ?? now,
		};

		if (existing) {
			await ctx.db.patch(existing._id, playlist);
			return existing._id;
		}

		return await ctx.db.insert("playlistLyrics", {
			...playlist,
			createdAt: args.createdAt ?? now,
		});
	},
});

export const replaceItemsForSync = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		items: v.array(
			v.object({
				position: v.number(),
				userNote: v.optional(v.string()),
				introContent: v.optional(v.string()),
				songTitleOverride: v.optional(v.string()),
				artistNameOverride: v.optional(v.string()),
				albumTitleOverride: v.optional(v.string()),
				albumArtUrlOverride: v.optional(v.string()),
				durationSecondsOverride: v.optional(v.number()),
				pendingUrl: v.optional(v.string()),
				scrapeState: itemScrapeStateValidator,
				createdAt: v.optional(v.number()),
				updatedAt: v.optional(v.number()),
				scrape: v.optional(syncScrapeInputValidator),
			}),
		),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		const existingItems = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId", (q) => q.eq("playlistId", args.playlistId))
			.collect();

		for (const item of existingItems) {
			await ctx.db.delete(item._id);
		}

		for (const item of sortPlaylistItems(args.items)) {
			const now = Date.now();
			const lyricScrapeId = item.scrape
				? await upsertScrapeRow(ctx, item.scrape)
				: undefined;

			await ctx.db.insert("playlistLyricsItems", {
				playlistId: args.playlistId,
				lyricScrapeId,
				position: item.position,
				userNote: normalizeOptionalString(item.userNote),
				introContent: normalizeOptionalString(item.introContent),
				songTitleOverride: normalizeOptionalString(item.songTitleOverride),
				artistNameOverride: normalizeOptionalString(item.artistNameOverride),
				albumTitleOverride: normalizeOptionalString(item.albumTitleOverride),
				albumArtUrlOverride: normalizeOptionalString(item.albumArtUrlOverride),
				durationSecondsOverride: item.durationSecondsOverride,
				pendingUrl: normalizeOptionalString(item.pendingUrl),
				scrapeState: item.scrapeState,
				createdAt: item.createdAt ?? now,
				updatedAt: item.updatedAt ?? now,
			});
		}

		return { success: true };
	},
});

async function attachScrapes(
	ctx: QueryCtx | MutationCtx,
	items: Doc<"playlistLyricsItems">[],
): Promise<ItemWithScrape[]> {
	const songs: ItemWithScrape[] = [];

	for (const item of items) {
		const scrape = item.lyricScrapeId
			? await ctx.db.get(item.lyricScrapeId)
			: undefined;

		songs.push({ ...item, scrape: scrape ?? undefined });
	}

	return songs;
}

function toPublicPlaylist(ctx: QueryCtx, playlist: Doc<"playlistLyrics">) {
	return Promise.all([
		resolveZineCoverImageUrl(ctx, playlist),
		resolveZineSpotifyQrImageUrl(ctx, playlist),
		resolveZineAppleMusicQrImageUrl(ctx, playlist),
	]).then(
		([zineCoverImageUrl, zineSpotifyQrImageUrl, zineAppleMusicQrImageUrl]) => ({
			title: playlist.title,
			slug: playlist.slug,
			theme: playlist.theme,
			description: playlist.description,
			zineCoverImageUrl,
			zineCoverGreyscale: playlist.zineCoverGreyscale,
			zineCoverTextAnchor: playlist.zineCoverTextAnchor,
			zineCoverTextAlign: playlist.zineCoverTextAlign,
			zineCoverTextOffsetXIn: playlist.zineCoverTextOffsetXIn,
			zineCoverTextOffsetYIn: playlist.zineCoverTextOffsetYIn,
			zineSpotifyQrImageUrl,
			zineAppleMusicQrImageUrl,
			zineShowSpotifyQr: playlist.zineShowSpotifyQr,
			zineShowAppleMusicQr: playlist.zineShowAppleMusicQr,
			zineDisplaySettings: playlist.zineDisplaySettings,
			zineInsideBackSections: playlist.zineInsideBackSections,
			zineInsideBackMarginTopPt: playlist.zineInsideBackMarginTopPt,
			zineInsideBackMarginRightPt: playlist.zineInsideBackMarginRightPt,
			zineInsideBackMarginBottomPt: playlist.zineInsideBackMarginBottomPt,
			zineInsideBackMarginLeftPt: playlist.zineInsideBackMarginLeftPt,
			zineInsideBackContentAlign: playlist.zineInsideBackContentAlign,
			zineInsideBackArtistDisplay: playlist.zineInsideBackArtistDisplay,
			zineInsideBackRecommendationRowAlign:
				playlist.zineInsideBackRecommendationRowAlign,
		}),
	);
}

async function resolveZineCoverImageUrl(
	ctx: QueryCtx | MutationCtx,
	playlist: Doc<"playlistLyrics">,
): Promise<string | undefined> {
	if (playlist.zineCoverImageStorageId) {
		return (
			(await ctx.storage.getUrl(playlist.zineCoverImageStorageId)) ?? undefined
		);
	}

	return playlist.zineCoverImageUrl;
}

async function resolveZineSpotifyQrImageUrl(
	ctx: QueryCtx | MutationCtx,
	playlist: Doc<"playlistLyrics">,
): Promise<string | undefined> {
	if (playlist.zineSpotifyQrStorageId) {
		return (
			(await ctx.storage.getUrl(playlist.zineSpotifyQrStorageId)) ?? undefined
		);
	}

	return playlist.zineSpotifyQrImageUrl;
}

async function resolveZineAppleMusicQrImageUrl(
	ctx: QueryCtx | MutationCtx,
	playlist: Doc<"playlistLyrics">,
): Promise<string | undefined> {
	if (playlist.zineAppleMusicQrStorageId) {
		return (
			(await ctx.storage.getUrl(playlist.zineAppleMusicQrStorageId)) ??
			undefined
		);
	}

	return playlist.zineAppleMusicQrImageUrl;
}

type ZineQrService = "spotify" | "appleMusic";

async function updateZineQrImage(
	ctx: MutationCtx,
	playlistId: Id<"playlistLyrics">,
	service: ZineQrService,
	args: { qrImageUrl?: string; storageId?: Id<"_storage"> },
): Promise<{ qrImageUrl?: string }> {
	const playlist = await requirePlaylist(ctx, playlistId);
	const now = Date.now();
	const storageField =
		service === "spotify"
			? "zineSpotifyQrStorageId"
			: "zineAppleMusicQrStorageId";
	const urlField =
		service === "spotify"
			? "zineSpotifyQrImageUrl"
			: "zineAppleMusicQrImageUrl";

	if (args.storageId !== undefined) {
		const existingStorageId = playlist[storageField];
		if (existingStorageId && existingStorageId !== args.storageId) {
			await ctx.storage.delete(existingStorageId);
		}

		await ctx.db.patch(playlistId, {
			[storageField]: args.storageId,
			[urlField]: undefined,
			updatedAt: now,
		});

		return {
			qrImageUrl: (await ctx.storage.getUrl(args.storageId)) ?? undefined,
		};
	}

	if (args.qrImageUrl !== undefined) {
		const existingStorageId = playlist[storageField];
		if (existingStorageId) {
			await ctx.storage.delete(existingStorageId);
		}

		const normalized = normalizeOptionalString(args.qrImageUrl);

		await ctx.db.patch(playlistId, {
			[urlField]: normalized,
			[storageField]: undefined,
			updatedAt: now,
		});

		return { qrImageUrl: normalized };
	}

	throw new Error("No QR image provided");
}

function toPublicItemWithScrape(item: ItemWithScrape) {
	return {
		_id: item._id,
		position: item.position,
		userNote: item.userNote,
		introContent: item.introContent,
		songTitleOverride: item.songTitleOverride,
		artistNameOverride: item.artistNameOverride,
		albumTitleOverride: item.albumTitleOverride,
		albumArtUrlOverride: item.albumArtUrlOverride,
		zineLyricsColumnCount: item.zineLyricsColumnCount,
		zineLyricsFontSizePt: item.zineLyricsFontSizePt,
		zineTitleCondenseScale: item.zineTitleCondenseScale,
		zineShowCredits: item.zineShowCredits,
		durationSecondsOverride: item.durationSecondsOverride,
		hiddenCreditLabels: item.hiddenCreditLabels,
		shownCreditLabels: item.shownCreditLabels,
		scrape: item.scrape
			? {
					songTitle: item.scrape.songTitle,
					artistName: item.scrape.artistName,
					albumTitle: item.scrape.albumTitle,
					albumYear: item.scrape.albumYear,
					albumArtUrl: item.scrape.albumArtUrl,
					lyrics: item.scrape.lyrics,
					about: item.scrape.about,
					credits: item.scrape.credits,
				}
			: undefined,
	};
}

async function requirePlaylist(
	ctx: MutationCtx,
	playlistId: Id<"playlistLyrics">,
): Promise<Doc<"playlistLyrics">> {
	const playlist = await ctx.db.get(playlistId);
	if (!playlist) {
		throw new Error("Playlist not found");
	}

	return playlist;
}

async function getNextPosition(
	ctx: MutationCtx,
	playlistId: Id<"playlistLyrics">,
): Promise<number> {
	const lastItem = await ctx.db
		.query("playlistLyricsItems")
		.withIndex("by_playlistId_position", (q) => q.eq("playlistId", playlistId))
		.order("desc")
		.first();

	return (lastItem?.position ?? 0) + 1;
}

async function compactPlaylistItemPositions(
	ctx: MutationCtx,
	playlistId: Id<"playlistLyrics">,
): Promise<void> {
	const items = await ctx.db
		.query("playlistLyricsItems")
		.withIndex("by_playlistId", (q) => q.eq("playlistId", playlistId))
		.collect();
	const sorted = sortPlaylistItems(items);
	const now = Date.now();

	for (let index = 0; index < sorted.length; index++) {
		const item = sorted[index];
		if (!item) continue;

		const nextPosition = index + 1;
		if (item.position !== nextPosition) {
			await ctx.db.patch(item._id, {
				position: nextPosition,
				updatedAt: now,
			});
		}
	}
}

async function upsertScrapeRow(
	ctx: MutationCtx,
	input: ScrapeUpsertInput,
): Promise<Id<"geniusLyricScrapes">> {
	const now = Date.now();
	const existing = await ctx.db
		.query("geniusLyricScrapes")
		.withIndex("by_canonicalUrl", (q) =>
			q.eq("canonicalUrl", input.canonicalUrl),
		)
		.first();

	const scrape = {
		canonicalUrl: input.canonicalUrl,
		songTitle: input.songTitle,
		artistName: input.artistName,
		albumTitle: normalizeOptionalString(input.albumTitle),
		albumYear: normalizeOptionalString(input.albumYear),
		albumArtUrl: normalizeOptionalString(input.albumArtUrl),
		lyrics: input.lyrics,
		about: normalizeOptionalString(input.about),
		credits: normalizeCredits(input.credits),
		scrapeStatus: "ready" as const,
		lastScrapedAt: input.lastScrapedAt ?? now,
		updatedAt: input.updatedAt ?? now,
	};

	if (existing) {
		await ctx.db.patch(existing._id, scrape);
		return existing._id;
	}

	return await ctx.db.insert("geniusLyricScrapes", {
		...scrape,
		createdAt: input.createdAt ?? now,
	});
}

function normalizeOptionalString(
	value: string | undefined,
): string | undefined {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

function normalizeCredits(
	credits: ScrapeUpsertInput["credits"],
): GeniusCreditInput[] | undefined {
	if (!credits || credits.length === 0) return undefined;

	const normalized: GeniusCreditInput[] = [];

	for (const credit of credits) {
		const label = normalizeOptionalString(credit.label);
		if (!label) continue;

		const contributors: GeniusCreditInput["contributors"] = [];
		for (const contributor of credit.contributors) {
			const name = normalizeOptionalString(contributor.name);
			if (!name) continue;

			const url = normalizeOptionalString(contributor.url);
			contributors.push(url ? { name, url } : { name });
		}

		if (contributors.length > 0) {
			normalized.push({ label, contributors });
		}
	}

	return normalized.length > 0 ? normalized : undefined;
}
