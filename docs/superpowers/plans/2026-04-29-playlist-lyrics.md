# Playlist Lyrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/playlist-lyrics`, a standalone playlist-based lyrics tool that scrapes individual Genius song URLs, stores reusable scrape rows, supports playlist notes/overrides, renders a print/read packet, and syncs to production.

**Architecture:** Add a separate Convex playlist system with three tables: playlist containers, ordered playlist items, and canonical Genius song scrape cache rows. The UI uses dedicated `/playlist-lyrics` routes while reusing the existing lyric formatting and print CSS conventions. Scraping happens on paste through a Convex action that normalizes the URL, reuses cached scrapes when available, and stores failed rows with retry/delete affordances.

**Tech Stack:** Next.js App Router, React client components, Convex queries/mutations/actions, existing Genius parser utilities, shadcn/ui components, node:test for focused utility tests, Biome, TypeScript.

**Commit Policy:** Do not create git commits unless the user explicitly requests them.

---

## File Structure

- Create `convex/_utils/playlistLyrics.ts`: pure helpers for Genius URL normalization, playlist display metadata, and ordering.
- Create `convex/_utils/playlistLyrics.test.ts`: node:test coverage for URL normalization, display overrides, and ordering helpers.
- Modify `convex/schema.ts`: add `playlistLyrics`, `geniusLyricScrapes`, and `playlistLyricsItems` tables with indexes.
- Create `convex/playlistLyrics.ts`: Convex queries, mutations, and actions for playlist CRUD, scrape-on-paste, rescrape, item updates, reorder, and sync helpers.
- Create `src/app/playlist-lyrics/_components/lyrics-renderer.tsx`: local lyric line renderer copied from the existing album lyric behavior.
- Create `src/app/playlist-lyrics/_components/playlist-lyrics-list.tsx`: list page client UI.
- Create `src/app/playlist-lyrics/_components/playlist-lyrics-editor.tsx`: edit page client UI.
- Create `src/app/playlist-lyrics/_components/playlist-lyrics-reader.tsx`: print/read page client UI.
- Create `src/app/playlist-lyrics/page.tsx`: route wrapper for the list page.
- Create `src/app/playlist-lyrics/[slug]/page.tsx`: route wrapper for print/read mode.
- Create `src/app/playlist-lyrics/[slug]/edit/page.tsx`: route wrapper for edit mode.
- Create `src/app/api/migrate-playlist-lyrics/route.ts`: production sync endpoint modeled on `src/app/api/migrate-lyrics/route.ts`.
- Modify `src/app/_components/site-header.tsx`: add authenticated nav link to `/playlist-lyrics`.

---

## Task 1: Pure Playlist Lyrics Helpers And Tests

**Files:**
- Create: `convex/_utils/playlistLyrics.ts`
- Create: `convex/_utils/playlistLyrics.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `convex/_utils/playlistLyrics.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	buildPlaylistSongDisplay,
	normalizeGeniusSongUrl,
	sortPlaylistItems,
} from "./playlistLyrics";

test("normalizeGeniusSongUrl strips query string and hash", () => {
	assert.equal(
		normalizeGeniusSongUrl(
			"https://genius.com/Dashboard-confessional-screaming-infidelities-lyrics?utm_source=record#annotations",
		),
		"https://genius.com/Dashboard-confessional-screaming-infidelities-lyrics",
	);
});

test("normalizeGeniusSongUrl accepts www.genius.com and returns genius.com", () => {
	assert.equal(
		normalizeGeniusSongUrl("https://www.genius.com/Jimmy-eat-world-sweetness-lyrics"),
		"https://genius.com/Jimmy-eat-world-sweetness-lyrics",
	);
});

test("normalizeGeniusSongUrl rejects non-Genius URLs", () => {
	assert.throws(
		() => normalizeGeniusSongUrl("https://example.com/song-lyrics"),
		/URL must be from genius.com/,
	);
});

test("normalizeGeniusSongUrl rejects Genius URLs that are not song lyric pages", () => {
	assert.throws(
		() => normalizeGeniusSongUrl("https://genius.com/albums/American-football/American-football"),
		/URL must be a Genius song lyrics page/,
	);
});

test("buildPlaylistSongDisplay uses overrides without mutating scrape defaults", () => {
	const display = buildPlaylistSongDisplay({
		scrape: {
			songTitle: "Scraped Song",
			artistName: "Scraped Artist",
			albumTitle: "Scraped Album",
		},
		item: {
			songTitleOverride: "Display Song",
			artistNameOverride: undefined,
			albumTitleOverride: "Display Album",
		},
	});

	assert.deepEqual(display, {
		songTitle: "Display Song",
		artistName: "Scraped Artist",
		albumTitle: "Display Album",
	});
});

test("sortPlaylistItems orders by position ascending", () => {
	const items = [
		{ _id: "b", position: 2 },
		{ _id: "a", position: 1 },
		{ _id: "c", position: 3 },
	];

	assert.deepEqual(
		sortPlaylistItems(items).map((item) => item._id),
		["a", "b", "c"],
	);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test convex/_utils/playlistLyrics.test.ts
```

Expected: FAIL because `convex/_utils/playlistLyrics.ts` does not exist or does not export the tested helpers.

- [ ] **Step 3: Implement helper module**

Create `convex/_utils/playlistLyrics.ts`:

```typescript
type ScrapeDisplayFields = {
	songTitle: string;
	artistName: string;
	albumTitle?: string;
};

type PlaylistDisplayOverrides = {
	songTitleOverride?: string;
	artistNameOverride?: string;
	albumTitleOverride?: string;
};

export function normalizeGeniusSongUrl(input: string): string {
	const trimmed = input.trim();
	let url: URL;

	try {
		url = new URL(trimmed);
	} catch {
		throw new Error("Enter a valid URL");
	}

	const host = url.hostname.toLowerCase();
	if (host !== "genius.com" && host !== "www.genius.com") {
		throw new Error("URL must be from genius.com");
	}

	if (!url.pathname.endsWith("-lyrics")) {
		throw new Error("URL must be a Genius song lyrics page");
	}

	url.protocol = "https:";
	url.hostname = "genius.com";
	url.search = "";
	url.hash = "";

	return url.toString().replace(/\/$/, "");
}

export function buildPlaylistSongDisplay({
	scrape,
	item,
}: {
	scrape: ScrapeDisplayFields;
	item: PlaylistDisplayOverrides;
}): Required<ScrapeDisplayFields> {
	return {
		songTitle: item.songTitleOverride?.trim() || scrape.songTitle,
		artistName: item.artistNameOverride?.trim() || scrape.artistName,
		albumTitle: item.albumTitleOverride?.trim() || scrape.albumTitle || "",
	};
}

export function sortPlaylistItems<T extends { position: number }>(items: T[]): T[] {
	return [...items].sort((a, b) => a.position - b.position);
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
node --test convex/_utils/playlistLyrics.test.ts
```

Expected: PASS with all five helper tests passing.

---

## Task 2: Convex Schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add playlist lyrics tables**

Modify `convex/schema.ts` near the existing `geniusAlbums` and `geniusSongs` tables:

```typescript
	playlistLyrics: defineTable({
		title: v.string(),
		slug: v.string(),
		theme: v.optional(v.string()),
		description: v.optional(v.string()),
		notes: v.optional(v.string()),
		status: v.union(v.literal("draft"), v.literal("ready")),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_slug", ["slug"])
		.index("by_updatedAt", ["updatedAt"])
		.index("by_status", ["status"]),

	geniusLyricScrapes: defineTable({
		canonicalUrl: v.string(),
		songTitle: v.string(),
		artistName: v.string(),
		albumTitle: v.optional(v.string()),
		lyrics: v.string(),
		about: v.optional(v.string()),
		scrapeStatus: v.union(v.literal("ready"), v.literal("failed")),
		lastScrapedAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_canonicalUrl", ["canonicalUrl"])
		.index("by_updatedAt", ["updatedAt"])
		.index("by_scrapeStatus", ["scrapeStatus"]),

	playlistLyricsItems: defineTable({
		playlistId: v.id("playlistLyrics"),
		lyricScrapeId: v.optional(v.id("geniusLyricScrapes")),
		position: v.number(),
		userNote: v.optional(v.string()),
		songTitleOverride: v.optional(v.string()),
		artistNameOverride: v.optional(v.string()),
		albumTitleOverride: v.optional(v.string()),
		pendingUrl: v.optional(v.string()),
		scrapeState: v.union(
			v.literal("scraping"),
			v.literal("ready"),
			v.literal("failed"),
			v.literal("reused"),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_playlistId", ["playlistId"])
		.index("by_playlistId_position", ["playlistId", "position"])
		.index("by_lyricScrapeId", ["lyricScrapeId"]),
```

- [ ] **Step 2: Typecheck schema**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If generated Convex types do not include the new tables, run `npx convex dev` until codegen completes, then rerun `pnpm typecheck`.

---

## Task 3: Convex Playlist Functions

**Files:**
- Create: `convex/playlistLyrics.ts`

- [ ] **Step 1: Create Convex API skeleton**

Create `convex/playlistLyrics.ts` with these imports and helpers:

```typescript
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { action, mutation, query } from "./_generated/server";
import {
	extractAbout,
	extractAlbumMetadata,
	extractLyrics,
	extractSongTitle,
	slugify,
} from "./_utils/geniusParser";
import { normalizeGeniusSongUrl, sortPlaylistItems } from "./_utils/playlistLyrics";
import { requireAuth } from "./auth";

const GENIUS_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
	Accept:
		"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.9",
	Referer: "https://www.google.com/",
};

function makeDraftSlug(now: number): string {
	return `untitled-playlist-${now}`;
}

async function nextPosition(
	ctx: MutationCtx,
	playlistId: Id<"playlistLyrics">,
): Promise<number> {
	const items = await ctx.db
		.query("playlistLyricsItems")
		.withIndex("by_playlistId", (q) => q.eq("playlistId", playlistId))
		.collect();

	if (items.length === 0) return 1;
	return Math.max(...items.map((item: { position: number }) => item.position)) + 1;
}
```

- [ ] **Step 2: Add list and read queries**

Add:

```typescript
export const list = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await ctx.db
			.query("playlistLyrics")
			.withIndex("by_updatedAt")
			.order("desc")
			.take(args.limit ?? 100);
	},
});

export const getBySlug = query({
	args: {
		slug: v.string(),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const playlist = await ctx.db
			.query("playlistLyrics")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!playlist) return null;

		const items = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId_position", (q) => q.eq("playlistId", playlist._id))
			.collect();

		const songs = [];
		for (const item of sortPlaylistItems(items)) {
			const scrape = item.lyricScrapeId
				? await ctx.db.get(item.lyricScrapeId)
				: null;
			songs.push({ item, scrape });
		}

		return { playlist, songs };
	},
});

export const getScrapeByCanonicalUrl = query({
	args: {
		canonicalUrl: v.string(),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await ctx.db
			.query("geniusLyricScrapes")
			.withIndex("by_canonicalUrl", (q) => q.eq("canonicalUrl", args.canonicalUrl))
			.first();
	},
});
```

- [ ] **Step 3: Add playlist mutations**

Add:

```typescript
export const createDraft = mutation({
	args: {},
	handler: async (ctx) => {
		requireAuth(ctx);
		const now = Date.now();
		const slug = makeDraftSlug(now);

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
		id: v.id("playlistLyrics"),
		title: v.optional(v.string()),
		theme: v.optional(v.string()),
		description: v.optional(v.string()),
		notes: v.optional(v.string()),
		status: v.optional(v.union(v.literal("draft"), v.literal("ready"))),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const playlist = await ctx.db.get(args.id);
		if (!playlist) throw new Error("Playlist not found");

		const patch: Partial<typeof playlist> = {
			updatedAt: Date.now(),
		};

		if (args.title !== undefined) {
			patch.title = args.title;
			patch.slug = slugify(args.title || "Untitled Playlist");
		}
		if (args.theme !== undefined) patch.theme = args.theme || undefined;
		if (args.description !== undefined) patch.description = args.description || undefined;
		if (args.notes !== undefined) patch.notes = args.notes || undefined;
		if (args.status !== undefined) patch.status = args.status;

		await ctx.db.patch(args.id, patch);
		return { success: true };
	},
});
```

- [ ] **Step 4: Add item and scrape mutations**

Add:

```typescript
export const createFailedItem = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		pendingUrl: v.string(),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const now = Date.now();
		const position = await nextPosition(ctx, args.playlistId);
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

export const upsertScrape = mutation({
	args: {
		canonicalUrl: v.string(),
		songTitle: v.string(),
		artistName: v.string(),
		albumTitle: v.optional(v.string()),
		lyrics: v.string(),
		about: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const now = Date.now();
		const existing = await ctx.db
			.query("geniusLyricScrapes")
			.withIndex("by_canonicalUrl", (q) => q.eq("canonicalUrl", args.canonicalUrl))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				songTitle: args.songTitle,
				artistName: args.artistName,
				albumTitle: args.albumTitle,
				lyrics: args.lyrics,
				about: args.about,
				scrapeStatus: "ready",
				lastScrapedAt: now,
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("geniusLyricScrapes", {
			canonicalUrl: args.canonicalUrl,
			songTitle: args.songTitle,
			artistName: args.artistName,
			albumTitle: args.albumTitle,
			lyrics: args.lyrics,
			about: args.about,
			scrapeStatus: "ready",
			lastScrapedAt: now,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const addScrapeToPlaylist = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		lyricScrapeId: v.id("geniusLyricScrapes"),
		reused: v.boolean(),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existingItems = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId", (q) => q.eq("playlistId", args.playlistId))
			.collect();

		if (existingItems.some((item) => item.lyricScrapeId === args.lyricScrapeId)) {
			throw new Error("This song is already in the playlist");
		}

		const now = Date.now();
		const position = existingItems.length === 0
			? 1
			: Math.max(...existingItems.map((item) => item.position)) + 1;

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
```

- [ ] **Step 5: Add editor mutations**

Add:

```typescript
export const updateItem = mutation({
	args: {
		id: v.id("playlistLyricsItems"),
		userNote: v.optional(v.string()),
		songTitleOverride: v.optional(v.string()),
		artistNameOverride: v.optional(v.string()),
		albumTitleOverride: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await ctx.db.patch(args.id, {
			userNote: args.userNote || undefined,
			songTitleOverride: args.songTitleOverride || undefined,
			artistNameOverride: args.artistNameOverride || undefined,
			albumTitleOverride: args.albumTitleOverride || undefined,
			updatedAt: Date.now(),
		});
		return { success: true };
	},
});

export const deleteItem = mutation({
	args: {
		id: v.id("playlistLyricsItems"),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await ctx.db.delete(args.id);
		return { success: true };
	},
});

export const reorderItems = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		itemIds: v.array(v.id("playlistLyricsItems")),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const now = Date.now();
		for (const [index, itemId] of args.itemIds.entries()) {
			const item = await ctx.db.get(itemId);
			if (!item || item.playlistId !== args.playlistId) {
				throw new Error("Invalid playlist item order");
			}
			await ctx.db.patch(itemId, {
				position: index + 1,
				updatedAt: now,
			});
		}
		return { success: true };
	},
});
```

- [ ] **Step 6: Add scrape-on-paste action**

Add:

```typescript
export const addSongFromUrl = action({
	args: {
		playlistId: v.id("playlistLyrics"),
		url: v.string(),
	},
	handler: async (ctx, args) => {
		const canonicalUrl = normalizeGeniusSongUrl(args.url);
		const existing = await ctx.runQuery(api.playlistLyrics.getScrapeByCanonicalUrl, {
			canonicalUrl,
		});

		if (existing) {
			return await ctx.runMutation(api.playlistLyrics.addScrapeToPlaylist, {
				playlistId: args.playlistId,
				lyricScrapeId: existing._id,
				reused: true,
			});
		}

		try {
			const response = await fetch(canonicalUrl, { headers: GENIUS_HEADERS });
			if (!response.ok) {
				throw new Error(`Failed to fetch Genius page: ${response.status}`);
			}

			const html = await response.text();
			const songTitle = extractSongTitle(html);
			const albumMetadata = extractAlbumMetadata(html);
			const lyrics = extractLyrics(html);
			const about = extractAbout(html);

			if (!songTitle || !albumMetadata?.artistName || !lyrics) {
				throw new Error("Could not extract song metadata and lyrics");
			}

			const scrapeId = await ctx.runMutation(api.playlistLyrics.upsertScrape, {
				canonicalUrl,
				songTitle,
				artistName: albumMetadata.artistName,
				albumTitle: albumMetadata.albumTitle,
				lyrics,
				about,
			});

			return await ctx.runMutation(api.playlistLyrics.addScrapeToPlaylist, {
				playlistId: args.playlistId,
				lyricScrapeId: scrapeId,
				reused: false,
			});
		} catch (error) {
			await ctx.runMutation(api.playlistLyrics.createFailedItem, {
				playlistId: args.playlistId,
				pendingUrl: canonicalUrl,
			});
			throw error;
		}
	},
});
```

- [ ] **Step 7: Add sync helper functions**

Add:

```typescript
export const listForSync = query({
	args: {},
	handler: async (ctx) => {
		requireAuth(ctx);
		const playlists = await ctx.db.query("playlistLyrics").collect();
		const result = [];

		for (const playlist of playlists) {
			const items = await ctx.db
				.query("playlistLyricsItems")
				.withIndex("by_playlistId_position", (q) => q.eq("playlistId", playlist._id))
				.collect();

			const songs = [];
			for (const item of sortPlaylistItems(items)) {
				const scrape = item.lyricScrapeId ? await ctx.db.get(item.lyricScrapeId) : null;
				songs.push({ item, scrape });
			}
			result.push({ playlist, songs });
		}

		return result;
	},
});

export const upsertPlaylistForSync = mutation({
	args: {
		title: v.string(),
		slug: v.string(),
		theme: v.optional(v.string()),
		description: v.optional(v.string()),
		notes: v.optional(v.string()),
		status: v.union(v.literal("draft"), v.literal("ready")),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const now = Date.now();
		const existing = await ctx.db
			.query("playlistLyrics")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, { ...args, updatedAt: now });
			return existing._id;
		}

		return await ctx.db.insert("playlistLyrics", {
			...args,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const replaceItemsForSync = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		items: v.array(
			v.object({
				lyricScrapeId: v.optional(v.id("geniusLyricScrapes")),
				position: v.number(),
				userNote: v.optional(v.string()),
				songTitleOverride: v.optional(v.string()),
				artistNameOverride: v.optional(v.string()),
				albumTitleOverride: v.optional(v.string()),
				pendingUrl: v.optional(v.string()),
				scrapeState: v.union(
					v.literal("scraping"),
					v.literal("ready"),
					v.literal("failed"),
					v.literal("reused"),
				),
			}),
		),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId", (q) => q.eq("playlistId", args.playlistId))
			.collect();

		for (const item of existing) {
			await ctx.db.delete(item._id);
		}

		const now = Date.now();
		for (const item of args.items) {
			await ctx.db.insert("playlistLyricsItems", {
				playlistId: args.playlistId,
				...item,
				createdAt: now,
				updatedAt: now,
			});
		}

		return { success: true };
	},
});
```

- [ ] **Step 8: Typecheck Convex functions**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If codegen is stale, run `npx convex dev` until generated API types update, then rerun `pnpm typecheck`.

---

## Task 4: Production Sync API

**Files:**
- Create: `src/app/api/migrate-playlist-lyrics/route.ts`

- [ ] **Step 1: Implement sync route**

Create `src/app/api/migrate-playlist-lyrics/route.ts`:

```typescript
import { ConvexHttpClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../convex/_generated/api";

export async function POST(_request: NextRequest) {
	try {
		const devUrl = env.NEXT_PUBLIC_CONVEX_URL;
		const prodUrl = env.NEXT_PUBLIC_CONVEX_PROD_URL;

		if (!prodUrl) {
			return NextResponse.json(
				{ error: "Production Convex URL not configured" },
				{ status: 500 },
			);
		}

		const devClient = new ConvexHttpClient(devUrl);
		const prodClient = new ConvexHttpClient(prodUrl);
		const playlists = await devClient.query(api.playlistLyrics.listForSync, {});

		let playlistsSynced = 0;
		let scrapesSynced = 0;
		let failed = 0;

		for (const entry of playlists) {
			try {
				const prodPlaylistId = await prodClient.mutation(
					api.playlistLyrics.upsertPlaylistForSync,
					{
						title: entry.playlist.title,
						slug: entry.playlist.slug,
						theme: entry.playlist.theme,
						description: entry.playlist.description,
						notes: entry.playlist.notes,
						status: entry.playlist.status,
					},
				);

				const syncedItems = [];
				for (const song of entry.songs) {
					let prodScrapeId = undefined;
					if (song.scrape) {
						prodScrapeId = await prodClient.mutation(api.playlistLyrics.upsertScrape, {
							canonicalUrl: song.scrape.canonicalUrl,
							songTitle: song.scrape.songTitle,
							artistName: song.scrape.artistName,
							albumTitle: song.scrape.albumTitle,
							lyrics: song.scrape.lyrics,
							about: song.scrape.about,
						});
						scrapesSynced++;
					}

					syncedItems.push({
						lyricScrapeId: prodScrapeId,
						position: song.item.position,
						userNote: song.item.userNote,
						songTitleOverride: song.item.songTitleOverride,
						artistNameOverride: song.item.artistNameOverride,
						albumTitleOverride: song.item.albumTitleOverride,
						pendingUrl: song.item.pendingUrl,
						scrapeState: song.item.scrapeState,
					});
				}

				await prodClient.mutation(api.playlistLyrics.replaceItemsForSync, {
					playlistId: prodPlaylistId,
					items: syncedItems,
				});
				playlistsSynced++;
			} catch (error) {
				console.error("Failed to sync playlist", entry.playlist.slug, error);
				failed++;
			}
		}

		return NextResponse.json({
			success: failed === 0,
			playlistsSynced,
			scrapesSynced,
			failed,
			total: playlists.length,
		});
	} catch (error) {
		console.error("Playlist lyrics migration failed:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Playlist lyrics migration failed",
			},
			{ status: 500 },
		);
	}
}
```

- [ ] **Step 2: Typecheck sync route**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

---

## Task 5: Lyrics Rendering Component

**Files:**
- Create: `src/app/playlist-lyrics/_components/lyrics-renderer.tsx`

- [ ] **Step 1: Create renderer component**

Create `src/app/playlist-lyrics/_components/lyrics-renderer.tsx`:

```typescript
import type React from "react";

export function LyricsRenderer({ lyrics }: { lyrics: string }) {
	const lines = lyrics.split("\n");

	return lines.map((line, index) => {
		const isSectionHeader = /^\[.*\]$/.test(line.trim());

		if (isSectionHeader) {
			return (
				<span
					key={`section-${index}`}
					className="text-muted-foreground text-sm print:text-xs"
				>
					{line}
					<br />
				</span>
			);
		}

		if (line.trim() === "") {
			return <br key={`empty-${index}`} />;
		}

		return (
			<span key={`line-${index}`}>
				{formatInlineLyrics(line, index)}
				<br />
			</span>
		);
	});
}

function formatInlineLyrics(line: string, lineIndex: number): React.ReactNode[] {
	const parts: React.ReactNode[] = [];
	const italicRegex = /\*([^*]+)\*/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	let key = 0;

	while ((match = italicRegex.exec(line)) !== null) {
		if (match.index > lastIndex) {
			parts.push(line.substring(lastIndex, match.index));
		}
		parts.push(
			<em key={`italic-${lineIndex}-${key++}`} className="italic">
				{match[1]}
			</em>,
		);
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < line.length) {
		parts.push(line.substring(lastIndex));
	}

	return parts.length > 0 ? parts : [line];
}
```

- [ ] **Step 2: Run lint for renderer**

Run:

```bash
pnpm check src/app/playlist-lyrics/_components/lyrics-renderer.tsx
```

Expected: PASS. If Biome flags `noAssignInExpressions`, rewrite the regex loop as a `for` loop with explicit assignment before the loop condition.

---

## Task 6: Playlist List Page

**Files:**
- Create: `src/app/playlist-lyrics/_components/playlist-lyrics-list.tsx`
- Create: `src/app/playlist-lyrics/page.tsx`
- Modify: `src/app/_components/site-header.tsx`

- [ ] **Step 1: Create list component**

Create `src/app/playlist-lyrics/_components/playlist-lyrics-list.tsx`:

```typescript
"use client";

import { useMutation, useQuery } from "convex/react";
import { Edit, Loader2, Music, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";

export function PlaylistLyricsList() {
	const router = useRouter();
	const playlists = useQuery(api.playlistLyrics.list, { limit: 100 });
	const createDraft = useMutation(api.playlistLyrics.createDraft);
	const [isCreating, setIsCreating] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);

	async function handleCreate() {
		setIsCreating(true);
		try {
			const result = await createDraft({});
			router.push(`/playlist-lyrics/${result.slug}/edit`);
		} catch (error) {
			console.error("Failed to create playlist", error);
			toast.error("Failed to create playlist");
		} finally {
			setIsCreating(false);
		}
	}

	async function handleSync() {
		setIsSyncing(true);
		try {
			const response = await fetch("/api/migrate-playlist-lyrics", {
				method: "POST",
			});
			const result = await response.json();
			if (!response.ok) {
				throw new Error(result.error || "Sync failed");
			}
			toast.success(
				`Synced ${result.playlistsSynced} playlists and ${result.scrapesSynced} scrapes`,
			);
		} catch (error) {
			console.error("Playlist lyrics sync failed", error);
			toast.error(error instanceof Error ? error.message : "Sync failed");
		} finally {
			setIsSyncing(false);
		}
	}

	return (
		<main className="mx-auto max-w-3xl px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<Music className="h-6 w-6" />
						Playlist Lyrics
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="flex flex-wrap gap-2">
						<Button onClick={handleCreate} disabled={isCreating}>
							{isCreating ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Plus className="mr-2 h-4 w-4" />
							)}
							New Playlist
						</Button>
						<Button onClick={handleSync} variant="outline" disabled={isSyncing}>
							{isSyncing ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="mr-2 h-4 w-4" />
							)}
							Sync to Production
						</Button>
					</div>

					{playlists === undefined ? (
						<div className="space-y-3">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					) : playlists.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No playlist lyrics yet. Create one to start pasting Genius song URLs.
						</p>
					) : (
						<ul className="divide-y">
							{playlists.map((playlist) => (
								<li
									key={playlist._id}
									className="flex items-center justify-between gap-3 py-3"
								>
									<Link
										href={`/playlist-lyrics/${playlist.slug}`}
										className="min-w-0 flex-1 hover:underline"
									>
										<span className="block truncate font-medium">
											{playlist.title}
										</span>
										<span className="text-muted-foreground text-xs">
											{playlist.status}
										</span>
									</Link>
									<Button asChild variant="ghost" size="icon">
										<Link href={`/playlist-lyrics/${playlist.slug}/edit`}>
											<Edit className="h-4 w-4" />
											<span className="sr-only">Edit {playlist.title}</span>
										</Link>
									</Button>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
```

- [ ] **Step 2: Create route page**

Create `src/app/playlist-lyrics/page.tsx`:

```typescript
import { PlaylistLyricsList } from "./_components/playlist-lyrics-list";

export default function PlaylistLyricsPage() {
	return <PlaylistLyricsList />;
}
```

- [ ] **Step 3: Add nav link**

Modify `src/app/_components/site-header.tsx` inside the authenticated nav, after the existing Lyrics link:

```tsx
<Link href="/playlist-lyrics" className="text-sm hover:underline">
	Playlist Lyrics
</Link>
```

- [ ] **Step 4: Typecheck list page**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

---

## Task 7: Playlist Editor Page

**Files:**
- Create: `src/app/playlist-lyrics/_components/playlist-lyrics-editor.tsx`
- Create: `src/app/playlist-lyrics/[slug]/edit/page.tsx`

- [ ] **Step 1: Create editor component**

Create `src/app/playlist-lyrics/_components/playlist-lyrics-editor.tsx`:

```typescript
"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export function PlaylistLyricsEditor({ slug }: { slug: string }) {
	const data = useQuery(api.playlistLyrics.getBySlug, { slug });
	const updatePlaylist = useMutation(api.playlistLyrics.updatePlaylist);
	const updateItem = useMutation(api.playlistLyrics.updateItem);
	const deleteItem = useMutation(api.playlistLyrics.deleteItem);
	const addSongFromUrl = useAction(api.playlistLyrics.addSongFromUrl);
	const [url, setUrl] = useState("");
	const [isAdding, setIsAdding] = useState(false);

	if (data === undefined) {
		return <PlaylistLyricsEditorSkeleton />;
	}

	if (data === null) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-10">
				<p className="mb-4 font-semibold">Playlist not found.</p>
				<Button asChild>
					<Link href="/playlist-lyrics">Back to Playlist Lyrics</Link>
				</Button>
			</main>
		);
	}

	async function savePlaylistField(field: string, value: string) {
		if (!data) return;
		await updatePlaylist({
			id: data.playlist._id,
			[field]: value,
		} as {
			id: Id<"playlistLyrics">;
			title?: string;
			theme?: string;
			description?: string;
			notes?: string;
		});
	}

	async function handleAddSong(e: React.FormEvent) {
		e.preventDefault();
		if (!data || !url.trim()) return;
		setIsAdding(true);
		try {
			await addSongFromUrl({
				playlistId: data.playlist._id,
				url,
			});
			setUrl("");
			toast.success("Song added");
		} catch (error) {
			console.error("Failed to add song", error);
			toast.error(error instanceof Error ? error.message : "Failed to add song");
		} finally {
			setIsAdding(false);
		}
	}

	return (
		<main className="mx-auto max-w-4xl px-4 py-10">
			<div className="mb-6 flex items-center justify-between">
				<Button asChild variant="ghost">
					<Link href="/playlist-lyrics">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to list
					</Link>
				</Button>
				<Button asChild variant="outline">
					<Link href={`/playlist-lyrics/${data.playlist.slug}`}>Print View</Link>
				</Button>
			</div>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Edit Playlist Lyrics</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="title">Title</Label>
							<Input
								id="title"
								defaultValue={data.playlist.title}
								onBlur={(e) => savePlaylistField("title", e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="theme">Theme</Label>
							<Input
								id="theme"
								defaultValue={data.playlist.theme ?? ""}
								onBlur={(e) => savePlaylistField("theme", e.target.value)}
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<Textarea
							id="description"
							defaultValue={data.playlist.description ?? ""}
							onBlur={(e) => savePlaylistField("description", e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="notes">Notes</Label>
						<Textarea
							id="notes"
							defaultValue={data.playlist.notes ?? ""}
							onBlur={(e) => savePlaylistField("notes", e.target.value)}
						/>
					</div>
				</CardContent>
			</Card>

			<form onSubmit={handleAddSong} className="mb-6 flex gap-2">
				<Input
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					placeholder="Paste Genius song URL..."
					disabled={isAdding}
				/>
				<Button type="submit" disabled={isAdding || !url.trim()}>
					{isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					Add
				</Button>
			</form>

			<div className="space-y-4">
				{data.songs.map(({ item, scrape }) => (
					<Card key={item._id}>
						<CardContent className="space-y-3 pt-6">
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="font-medium">
										{item.songTitleOverride || scrape?.songTitle || item.pendingUrl}
									</p>
									<p className="text-muted-foreground text-sm">
										{item.artistNameOverride || scrape?.artistName || item.scrapeState}
									</p>
								</div>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => deleteItem({ id: item._id })}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
							<div className="grid gap-3 md:grid-cols-3">
								<Input
									placeholder="Title override"
									defaultValue={item.songTitleOverride ?? ""}
									onBlur={(e) =>
										updateItem({
											id: item._id,
											songTitleOverride: e.target.value,
										})
									}
								/>
								<Input
									placeholder="Artist override"
									defaultValue={item.artistNameOverride ?? ""}
									onBlur={(e) =>
										updateItem({
											id: item._id,
											artistNameOverride: e.target.value,
										})
									}
								/>
								<Input
									placeholder="Album override"
									defaultValue={item.albumTitleOverride ?? ""}
									onBlur={(e) =>
										updateItem({
											id: item._id,
											albumTitleOverride: e.target.value,
										})
									}
								/>
							</div>
							<Textarea
								placeholder="Your note for this song..."
								defaultValue={item.userNote ?? ""}
								onBlur={(e) =>
									updateItem({
										id: item._id,
										userNote: e.target.value,
									})
								}
							/>
						</CardContent>
					</Card>
				))}
			</div>
		</main>
	);
}

function PlaylistLyricsEditorSkeleton() {
	return (
		<main className="mx-auto max-w-4xl space-y-4 px-4 py-10">
			<Skeleton className="h-10 w-48" />
			<Skeleton className="h-64 w-full" />
			<Skeleton className="h-24 w-full" />
		</main>
	);
}
```

- [ ] **Step 2: Create edit route wrapper**

Create `src/app/playlist-lyrics/[slug]/edit/page.tsx`:

```typescript
import React from "react";
import { PlaylistLyricsEditor } from "../../_components/playlist-lyrics-editor";

export default function PlaylistLyricsEditPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = React.use(params);
	return <PlaylistLyricsEditor slug={slug} />;
}
```

- [ ] **Step 3: Typecheck editor**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If TypeScript rejects the computed `savePlaylistField` payload, replace it with explicit branch calls for title, theme, description, and notes.

---

## Task 8: Playlist Print/Read Page

**Files:**
- Create: `src/app/playlist-lyrics/_components/playlist-lyrics-reader.tsx`
- Create: `src/app/playlist-lyrics/[slug]/page.tsx`

- [ ] **Step 1: Create print/read component**

Create `src/app/playlist-lyrics/_components/playlist-lyrics-reader.tsx`:

```typescript
"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Columns2, Edit, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import { LyricsRenderer } from "./lyrics-renderer";

export function PlaylistLyricsReader({ slug }: { slug: string }) {
	const data = useQuery(api.playlistLyrics.getBySlug, { slug });
	const [isCompact, setIsCompact] = useState(false);
	const [showGeniusInfo, setShowGeniusInfo] = useState(true);

	function handlePrint() {
		setIsCompact(false);
		setTimeout(() => window.print(), 50);
	}

	function handleCompactPrint() {
		setIsCompact(true);
		setTimeout(() => window.print(), 50);
	}

	if (data === undefined) {
		return <PlaylistLyricsReaderSkeleton />;
	}

	if (data === null) {
		return (
			<main className="mx-auto max-w-4xl px-4 py-10 text-center">
				<h1 className="mb-4 font-bold text-2xl">Playlist Not Found</h1>
				<Button asChild>
					<Link href="/playlist-lyrics">Back to Playlist Lyrics</Link>
				</Button>
			</main>
		);
	}

	return (
		<div
			className={`mx-auto max-w-4xl px-4 py-10 print:px-2 print:py-4 ${isCompact ? "print-compact" : ""}`}
		>
			<div className="no-print mb-6 flex items-center justify-between">
				<Button asChild variant="ghost">
					<Link href="/playlist-lyrics">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to list
					</Link>
				</Button>
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						<Checkbox
							id="genius-info"
							checked={showGeniusInfo}
							onCheckedChange={(checked) => setShowGeniusInfo(checked === true)}
						/>
						<Label htmlFor="genius-info" className="cursor-pointer text-sm">
							Show Genius info
						</Label>
					</div>
					<Button asChild variant="outline">
						<Link href={`/playlist-lyrics/${slug}/edit`}>
							<Edit className="mr-2 h-4 w-4" />
							Edit
						</Link>
					</Button>
					<Button onClick={handlePrint} variant="outline">
						<Printer className="mr-2 h-4 w-4" />
						Print
					</Button>
					<Button onClick={handleCompactPrint} variant="outline">
						<Columns2 className="mr-2 h-4 w-4" />
						2-Column
					</Button>
				</div>
			</div>

			<header className="mb-8 text-center print:mb-12">
				<h1 className="mb-2 font-bold text-4xl print:text-5xl">
					{data.playlist.title}
				</h1>
				{data.playlist.theme && (
					<h2 className="text-2xl text-muted-foreground print:text-3xl">
						{data.playlist.theme}
					</h2>
				)}
				{data.playlist.description && (
					<p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
						{data.playlist.description}
					</p>
				)}
				{data.playlist.notes && (
					<p className="mx-auto mt-3 max-w-2xl whitespace-pre-wrap text-sm">
						{data.playlist.notes}
					</p>
				)}
			</header>

			<div className="lyrics-content space-y-12 print:space-y-16">
				{data.songs.map(({ item, scrape }) => {
					if (!scrape) return null;

					const songTitle = item.songTitleOverride || scrape.songTitle;
					const artistName = item.artistNameOverride || scrape.artistName;
					const albumTitle = item.albumTitleOverride || scrape.albumTitle;

					return (
						<article
							key={item._id}
							className="page-break-inside-avoid print:mb-16"
						>
							<span className="text-muted-foreground text-sm print:text-xs">
								Track {item.position}
							</span>
							<h3 className="mb-1 font-semibold text-2xl print:text-3xl">
								{songTitle}
							</h3>
							<p className="mb-4 text-muted-foreground">
								{artistName}
								{albumTitle ? ` - ${albumTitle}` : ""}
							</p>
							{item.userNote && (
								<div className="mb-4 rounded-md bg-muted p-3 text-sm print:p-2">
									{item.userNote}
								</div>
							)}
							<div className="whitespace-pre-wrap leading-relaxed print:text-sm">
								<LyricsRenderer lyrics={scrape.lyrics} />
							</div>
							{showGeniusInfo && scrape.about && (
								<div className="mt-4 rounded-md bg-muted p-4 print:mt-3 print:p-3">
									<h4 className="mb-2 font-semibold text-sm">About</h4>
									<p className="whitespace-pre-wrap text-muted-foreground text-sm">
										{scrape.about}
									</p>
								</div>
							)}
						</article>
					);
				})}
			</div>
		</div>
	);
}

function PlaylistLyricsReaderSkeleton() {
	return (
		<main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
			<Skeleton className="mx-auto h-12 w-3/4" />
			<Skeleton className="h-48 w-full" />
			<Skeleton className="h-48 w-full" />
		</main>
	);
}
```

- [ ] **Step 2: Create print/read route wrapper**

Create `src/app/playlist-lyrics/[slug]/page.tsx`:

```typescript
import React from "react";
import { PlaylistLyricsReader } from "../_components/playlist-lyrics-reader";

export default function PlaylistLyricsReadPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = React.use(params);
	return <PlaylistLyricsReader slug={slug} />;
}
```

- [ ] **Step 3: Typecheck reader**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

---

## Task 9: Verification And Polish

**Files:**
- Modify only files changed in previous tasks if verification finds concrete failures.

- [ ] **Step 1: Run helper tests**

Run:

```bash
node --test convex/_utils/playlistLyrics.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run Biome**

Run:

```bash
pnpm check
```

Expected: PASS. If Biome reports formatting-only changes, run `pnpm check:write` and inspect the diff.

- [ ] **Step 4: Manual browser verification**

Run:

```bash
pnpm dev
```

Expected: Next.js dev server starts on port `1333`.

Verify in the browser:

1. Navigate to `/playlist-lyrics`.
2. Click `New Playlist`.
3. Confirm the app opens `/playlist-lyrics/<slug>/edit`.
4. Add a title and theme, then blur the fields.
5. Paste a valid Genius song lyrics URL.
6. Confirm the row fills with scraped title and artist.
7. Navigate back to `/playlist-lyrics`.
8. Click the playlist title.
9. Confirm the print/read page opens.
10. Click `2-Column` and verify the print layout matches the existing album lyrics behavior.
11. Return to the list and click the pencil icon.
12. Confirm the edit page opens directly.

- [ ] **Step 5: Inspect git diff**

Run:

```bash
git diff --stat && git diff -- docs/superpowers/plans/2026-04-29-playlist-lyrics.md
```

Expected: diff contains only intentional plan and implementation files. Do not commit unless the user explicitly asks.
