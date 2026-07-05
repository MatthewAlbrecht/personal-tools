# Album Lyrics Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure album lyric pages include every Genius album track, add an override-based private album data editor, and allow mapping a Genius album to a canonical Spotify album.

**Architecture:** Add small pure helpers for album song scrape assembly, display overrides, credit visibility, and Spotify matching semantics. Then wire those helpers into the existing album scrape paths, Convex schema/mutations, private edit route, and album reader/zine display paths. Existing scraped data remains intact; editable data is stored as overrides.

**Tech Stack:** Next.js App Router, React 19, Convex, TypeScript, `node-html-parser`, shadcn-style local UI components, `node:test` via `pnpm exec tsx --test`.

---

## File Structure

- Create `convex/_utils/geniusAlbumLyrics.ts`: pure album scrape assembly, display override, and credit visibility helpers.
- Create `convex/_utils/geniusAlbumLyrics.test.ts`: tests for all-track assembly, overrides, empty lyrics, credit visibility.
- Modify `convex/_utils/geniusParser.ts`: add tracklist item extraction while preserving existing `extractAlbumTracklist`.
- Modify `convex/geniusAlbums.ts`: add schema validators, update create/scrape paths, edit mutations, Spotify mapping mutations.
- Modify `convex/schema.ts`: add album/song override fields, scrape state/error, Spotify mapping fields.
- Modify `src/app/api/scrape-genius/route.ts`: return every tracklist row, with placeholders on failed/no-lyrics tracks.
- Modify `src/app/lyrics/page.tsx`: send new song scrape state/error and keep creating every returned track.
- Create `src/app/lyrics/[slug]/edit/page.tsx`: private edit route.
- Create `src/app/lyrics/_components/album-lyrics-editor.tsx`: album/song override editor.
- Modify `src/app/lyrics/[slug]/page.tsx` and `src/app/public/lyrics/[slug]/page.tsx`: render overrides and no-lyrics placeholders.
- Modify `src/app/lyrics/_components/album-lyrics-zine.tsx` and `src/lib/zine/album-song-input.ts`: use display overrides/duration.

Do not add a public edit route, editable scraped credit content, destructive scraped-field edits, or Spotify API search.

---

### Task 1: Pure Album Lyrics Helpers

**Files:**
- Create: `convex/_utils/geniusAlbumLyrics.ts`
- Create: `convex/_utils/geniusAlbumLyrics.test.ts`

- [ ] **Step 1: Write failing tests**

Create `convex/_utils/geniusAlbumLyrics.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	buildAlbumSongRecordInput,
	buildDisplayAlbum,
	buildDisplaySong,
	filterVisibleCredits,
	hasDisplayLyrics,
} from "./geniusAlbumLyrics";

const producerCredit = {
	label: "Producer",
	contributors: [{ name: "Flying Lotus" }],
};

const writerCredit = {
	label: "Writers",
	contributors: [{ name: "Niki Randa" }],
};

test("buildAlbumSongRecordInput creates a ready song from scraped page data", () => {
	assert.deepEqual(
		buildAlbumSongRecordInput({
			track: {
				trackNumber: 2,
				title: "Coronus, The Terminator",
				url: "https://genius.com/Flying-lotus-coronus-the-terminator-lyrics",
			},
			scrape: {
				songTitle: "Coronus, The Terminator",
				lyrics: "The days of men are coming to an end",
				about: "A song note",
				credits: [producerCredit],
			},
		}),
		{
			trackNumber: 2,
			songTitle: "Coronus, The Terminator",
			geniusSongUrl:
				"https://genius.com/Flying-lotus-coronus-the-terminator-lyrics",
			lyrics: "The days of men are coming to an end",
			about: "A song note",
			credits: [producerCredit],
			scrapeState: "ready",
			scrapeError: undefined,
		},
	);
});

test("buildAlbumSongRecordInput creates failed placeholder for failed scrape", () => {
	assert.deepEqual(
		buildAlbumSongRecordInput({
			track: {
				trackNumber: 3,
				title: "Instrumental Break",
				url: "https://genius.com/Artist-instrumental-break-lyrics",
			},
			errorMessage: "Failed to fetch song page: 404",
		}),
		{
			trackNumber: 3,
			songTitle: "Instrumental Break",
			geniusSongUrl: "https://genius.com/Artist-instrumental-break-lyrics",
			lyrics: "",
			about: undefined,
			credits: undefined,
			scrapeState: "failed",
			scrapeError: "Failed to fetch song page: 404",
		},
	);
});

test("buildDisplayAlbum prefers overrides", () => {
	assert.deepEqual(
		buildDisplayAlbum({
			albumTitle: "Scraped Album",
			artistName: "Scraped Artist",
			zineCoverImageUrl: "https://example.com/scraped.jpg",
			albumTitleOverride: "Override Album",
			artistNameOverride: "Override Artist",
			frontPageImageUrlOverride: "https://example.com/override.jpg",
			summaryOverride: "Override summary",
		}),
		{
			albumTitle: "Override Album",
			artistName: "Override Artist",
			frontPageImageUrl: "https://example.com/override.jpg",
			summary: "Override summary",
		},
	);
});

test("buildDisplaySong prefers overrides and filters visible credits", () => {
	assert.deepEqual(
		buildDisplaySong({
			songTitle: "Scraped Title",
			lyrics: "Scraped lyrics",
			about: "Scraped about",
			credits: [producerCredit, writerCredit],
			songTitleOverride: "Override Title",
			lyricsOverride: "Override lyrics",
			aboutOverride: "Override about",
			durationSecondsOverride: 183,
			hiddenCreditLabels: ["Producer"],
		}),
		{
			songTitle: "Override Title",
			lyrics: "Override lyrics",
			about: "Override about",
			durationSeconds: 183,
			credits: [writerCredit],
		},
	);
});

test("empty text overrides fall back to scraped values", () => {
	assert.deepEqual(
		buildDisplaySong({
			songTitle: "Scraped Title",
			lyrics: "Scraped lyrics",
			songTitleOverride: "   ",
			lyricsOverride: "",
		}),
		{
			songTitle: "Scraped Title",
			lyrics: "Scraped lyrics",
			about: undefined,
			durationSeconds: undefined,
			credits: undefined,
		},
	);
});

test("filterVisibleCredits hides selected labels only", () => {
	assert.deepEqual(
		filterVisibleCredits([producerCredit, writerCredit], ["Producer"]),
		[writerCredit],
	);
});

test("hasDisplayLyrics identifies empty lyrics", () => {
	assert.equal(hasDisplayLyrics(""), false);
	assert.equal(hasDisplayLyrics("   \n"), false);
	assert.equal(hasDisplayLyrics("A lyric"), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec tsx --test convex/_utils/geniusAlbumLyrics.test.ts
```

Expected: FAIL because `convex/_utils/geniusAlbumLyrics.ts` does not exist.

- [ ] **Step 3: Implement pure helpers**

Create `convex/_utils/geniusAlbumLyrics.ts`:

```typescript
import type { GeniusCredit } from "./geniusParser";

export type GeniusAlbumTrackInfo = {
	trackNumber: number;
	title: string;
	url: string;
};

export type GeniusAlbumSongScrape = {
	songTitle?: string;
	lyrics?: string;
	about?: string;
	credits?: GeniusCredit[];
};

export type GeniusAlbumSongRecordInput = {
	trackNumber: number;
	songTitle: string;
	geniusSongUrl: string;
	lyrics: string;
	about?: string;
	credits?: GeniusCredit[];
	scrapeState: "ready" | "failed";
	scrapeError?: string;
};

export function buildAlbumSongRecordInput({
	track,
	scrape,
	errorMessage,
}: {
	track: GeniusAlbumTrackInfo;
	scrape?: GeniusAlbumSongScrape;
	errorMessage?: string;
}): GeniusAlbumSongRecordInput {
	const songTitle = normalizeOptionalString(scrape?.songTitle) ?? track.title;
	const lyrics = scrape?.lyrics ?? "";
	const about = normalizeOptionalString(scrape?.about);
	const credits = scrape?.credits && scrape.credits.length > 0 ? scrape.credits : undefined;
	const scrapeState: "ready" | "failed" = errorMessage ? "failed" : "ready";

	return {
		trackNumber: track.trackNumber,
		songTitle,
		geniusSongUrl: track.url,
		lyrics,
		about,
		credits,
		scrapeState,
		scrapeError: normalizeOptionalString(errorMessage),
	};
}

export function buildDisplayAlbum(album: {
	albumTitle: string;
	artistName: string;
	zineCoverImageUrl?: string;
	albumTitleOverride?: string;
	artistNameOverride?: string;
	summaryOverride?: string;
	frontPageImageUrlOverride?: string;
}): {
	albumTitle: string;
	artistName: string;
	summary?: string;
	frontPageImageUrl?: string;
} {
	return {
		albumTitle: normalizeOptionalString(album.albumTitleOverride) ?? album.albumTitle,
		artistName: normalizeOptionalString(album.artistNameOverride) ?? album.artistName,
		summary: normalizeOptionalString(album.summaryOverride),
		frontPageImageUrl:
			normalizeOptionalString(album.frontPageImageUrlOverride) ??
			normalizeOptionalString(album.zineCoverImageUrl),
	};
}

export function buildDisplaySong(song: {
	songTitle: string;
	lyrics: string;
	about?: string;
	credits?: GeniusCredit[];
	songTitleOverride?: string;
	lyricsOverride?: string;
	aboutOverride?: string;
	durationSecondsOverride?: number;
	hiddenCreditLabels?: string[];
}): {
	songTitle: string;
	lyrics: string;
	about?: string;
	durationSeconds?: number;
	credits?: GeniusCredit[];
} {
	return {
		songTitle: normalizeOptionalString(song.songTitleOverride) ?? song.songTitle,
		lyrics: normalizeOptionalString(song.lyricsOverride) ?? song.lyrics,
		about: normalizeOptionalString(song.aboutOverride) ?? song.about,
		durationSeconds: song.durationSecondsOverride,
		credits: filterVisibleCredits(song.credits, song.hiddenCreditLabels),
	};
}

export function filterVisibleCredits(
	credits: GeniusCredit[] | undefined,
	hiddenCreditLabels: string[] | undefined,
): GeniusCredit[] | undefined {
	if (!credits || credits.length === 0) return undefined;
	if (!hiddenCreditLabels || hiddenCreditLabels.length === 0) return credits;

	const hidden = new Set(hiddenCreditLabels.map((label) => label.trim()));
	const visible = credits.filter((credit) => !hidden.has(credit.label.trim()));
	return visible.length > 0 ? visible : undefined;
}

export function hasDisplayLyrics(lyrics: string): boolean {
	return lyrics.trim().length > 0;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed || undefined;
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
pnpm exec tsx --test convex/_utils/geniusAlbumLyrics.test.ts
```

Expected: PASS.

---

### Task 2: Tracklist-Complete Scraping

**Files:**
- Modify: `convex/_utils/geniusParser.ts`
- Modify: `convex/geniusAlbums.ts`
- Modify: `src/app/api/scrape-genius/route.ts`
- Modify: `src/app/lyrics/page.tsx`
- Modify: `convex/schema.ts`

- [ ] **Step 1: Extend schema and createSong inputs**

In `convex/schema.ts`, add to `geniusSongs`:

```typescript
scrapeState: v.optional(v.union(v.literal("ready"), v.literal("failed"))),
scrapeError: v.optional(v.string()),
```

In `convex/geniusAlbums.ts`, add the same optional fields to `createSong.args` and insert them:

```typescript
scrapeState: v.optional(v.union(v.literal("ready"), v.literal("failed"))),
scrapeError: v.optional(v.string()),
```

and:

```typescript
scrapeState: args.scrapeState,
scrapeError: args.scrapeError,
```

- [ ] **Step 2: Add tracklist item parser while preserving old API**

In `convex/_utils/geniusParser.ts`, import `type GeniusAlbumTrackInfo` from `./geniusAlbumLyrics`.

Add:

```typescript
export function extractAlbumTracklistItems(html: string): GeniusAlbumTrackInfo[] {
	const root = parseHTML(html);
	const items: GeniusAlbumTrackInfo[] = [];
	const seenUrls = new Set<string>();

	const oldRows = root.querySelectorAll(".chart_row");
	if (oldRows.length > 0) {
		for (const row of oldRows) {
			const numberText = row
				.querySelector(".chart_row-number_container span")
				?.textContent.trim();
			const trackNumber = Number.parseInt(numberText ?? "", 10);
			const link = row.querySelector('a[href*="-lyrics"]');
			const href = link?.getAttribute("href");
			const url = normalizeGeniusTrackUrl(href);
			const title = normalizeTrackTitle(link?.textContent);
			if (!url || !title || !Number.isFinite(trackNumber) || trackNumber <= 0) {
				continue;
			}
			if (seenUrls.has(url)) continue;
			seenUrls.add(url);
			items.push({ trackNumber, title, url });
		}
		return items.sort((a, b) => a.trackNumber - b.trackNumber);
	}

	const tracklistContainer = root.querySelector(
		'[class*="AlbumTracklist__Container"]',
	);
	if (!tracklistContainer) return [];

	for (const trackItem of tracklistContainer.querySelectorAll(
		'li[class*="AlbumTracklist__Track"]',
	)) {
		const trackNumberText =
			trackItem
				.querySelector('[class*="AlbumTracklist__TrackNumber"]')
				?.textContent.trim() ?? "";
		const trackNumber = Number.parseInt(trackNumberText.replace(".", ""), 10);
		const link = trackItem.querySelector('a[href*="-lyrics"]');
		const url = normalizeGeniusTrackUrl(link?.getAttribute("href"));
		const title = normalizeTrackTitle(link?.textContent);
		if (!url || !title || !Number.isFinite(trackNumber) || trackNumber <= 0) {
			continue;
		}
		if (seenUrls.has(url)) continue;
		seenUrls.add(url);
		items.push({ trackNumber, title, url });
	}

	return items.sort((a, b) => a.trackNumber - b.trackNumber);
}
```

Add helpers:

```typescript
function normalizeGeniusTrackUrl(href: string | undefined): string | undefined {
	const trimmed = href?.trim();
	if (!trimmed) return undefined;
	return trimmed.startsWith("http") ? trimmed : `https://genius.com${trimmed}`;
}

function normalizeTrackTitle(value: string | undefined): string | undefined {
	const title = value?.replace(/\s+/g, " ").trim();
	return title || undefined;
}
```

Update existing `extractAlbumTracklist(html)` to return:

```typescript
return extractAlbumTracklistItems(html).map((item) => item.url);
```

- [ ] **Step 3: Update Convex album action path**

In `convex/geniusAlbums.ts`, import `buildAlbumSongRecordInput` and `extractAlbumTracklistItems`.

Change tracklist extraction in `scrapeAndStoreAlbum` from URL arrays to `tracklistItems`.

For each track:

```typescript
let songInput = buildAlbumSongRecordInput({ track });
try {
	// fetch song page
	// extract title/lyrics/about/credits
	songInput = buildAlbumSongRecordInput({
		track,
		scrape: {
			songTitle,
			lyrics,
			about,
			credits,
		},
	});
} catch (error) {
	songInput = buildAlbumSongRecordInput({
		track,
		errorMessage: error instanceof Error ? error.message : "Failed to scrape song page",
	});
}
await ctx.runMutation(api.geniusAlbums.createSong, {
	albumId,
	...songInput,
});
```

Do not `continue` merely because lyrics are empty or fetch fails.

- [ ] **Step 4: Update `/api/scrape-genius` path**

In `src/app/api/scrape-genius/route.ts`, import `buildAlbumSongRecordInput` and `type GeniusAlbumTrackInfo`.

Change `SongData` to include:

```typescript
scrapeState?: "ready" | "failed";
scrapeError?: string;
```

Change local `TrackInfo` to:

```typescript
type TrackInfo = GeniusAlbumTrackInfo;
```

Capture track titles from old/new tracklist links. For each track, initialize:

```typescript
let songData = buildAlbumSongRecordInput({ track: trackInfo });
```

If song fetch/parsing succeeds, replace it with `buildAlbumSongRecordInput({ track: trackInfo, scrape: {...} })`. If fetch/parsing fails, push the placeholder with `errorMessage`. Always push one `SongData` per `tracklistInfo` item.

- [ ] **Step 5: Update `/lyrics` creation call**

In `src/app/lyrics/page.tsx`, include:

```typescript
scrapeState: song.scrapeState,
scrapeError: song.scrapeError,
```

in `createSongMutation`.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm exec tsx --test convex/_utils/geniusAlbumLyrics.test.ts
pnpm typecheck
```

Expected: helper tests pass and TypeScript exits 0.

---

### Task 3: Convex Overrides and Spotify Mapping

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/geniusAlbums.ts`
- Modify: `convex/_utils/geniusAlbumLyrics.test.ts`

- [ ] **Step 1: Add schema fields**

Add to `geniusAlbums`:

```typescript
albumTitleOverride: v.optional(v.string()),
artistNameOverride: v.optional(v.string()),
summaryOverride: v.optional(v.string()),
frontPageImageUrlOverride: v.optional(v.string()),
spotifyAlbumId: v.optional(v.string()),
spotifyAlbumConvexId: v.optional(v.id("spotifyAlbums")),
spotifyAlbumMatchMethod: v.optional(
	v.union(v.literal("spotify_id"), v.literal("title_artist"), v.literal("manual")),
),
spotifyAlbumMatchedAt: v.optional(v.number()),
```

Add to `geniusSongs`:

```typescript
songTitleOverride: v.optional(v.string()),
lyricsOverride: v.optional(v.string()),
aboutOverride: v.optional(v.string()),
durationSecondsOverride: v.optional(v.number()),
hiddenCreditLabels: v.optional(v.array(v.string())),
```

- [ ] **Step 2: Add Convex validators**

In `convex/geniusAlbums.ts`, add:

```typescript
const spotifyAlbumMatchMethodValidator = v.union(
	v.literal("spotify_id"),
	v.literal("title_artist"),
	v.literal("manual"),
);
```

- [ ] **Step 3: Add override mutations**

Add `updateAlbumOverrides`:

```typescript
export const updateAlbumOverrides = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
		albumTitleOverride: v.optional(v.string()),
		artistNameOverride: v.optional(v.string()),
		summaryOverride: v.optional(v.string()),
		frontPageImageUrlOverride: v.optional(v.string()),
	},
	returns: v.id("geniusAlbums"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");

		await ctx.db.patch(args.albumId, {
			albumTitleOverride: normalizeOptionalString(args.albumTitleOverride),
			artistNameOverride: normalizeOptionalString(args.artistNameOverride),
			summaryOverride: normalizeOptionalString(args.summaryOverride),
			frontPageImageUrlOverride: normalizeOptionalString(
				args.frontPageImageUrlOverride,
			),
			updatedAt: Date.now(),
		});

		return args.albumId;
	},
});
```

Add `updateSongOverrides`:

```typescript
export const updateSongOverrides = mutation({
	args: {
		songId: v.id("geniusSongs"),
		songTitleOverride: v.optional(v.string()),
		lyricsOverride: v.optional(v.string()),
		aboutOverride: v.optional(v.string()),
		durationSecondsOverride: v.optional(v.union(v.number(), v.null())),
		hiddenCreditLabels: v.optional(v.array(v.string())),
	},
	returns: v.id("geniusSongs"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const song = await ctx.db.get(args.songId);
		if (!song) throw new Error("Song not found");

		await ctx.db.patch(args.songId, {
			songTitleOverride: normalizeOptionalString(args.songTitleOverride),
			lyricsOverride: normalizeOptionalString(args.lyricsOverride),
			aboutOverride: normalizeOptionalString(args.aboutOverride),
			durationSecondsOverride:
				args.durationSecondsOverride === null
					? undefined
					: args.durationSecondsOverride,
			hiddenCreditLabels: normalizeHiddenCreditLabels(args.hiddenCreditLabels),
		});

		return args.songId;
	},
});
```

Add helpers:

```typescript
function normalizeOptionalString(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

function normalizeHiddenCreditLabels(
	labels: string[] | undefined,
): string[] | undefined {
	if (!labels) return undefined;
	const normalized = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
	return normalized.length > 0 ? normalized : undefined;
}
```

- [ ] **Step 4: Add Spotify mapping mutations**

Import `artistKeysIntersect`, `buildArtistKeys`, and `normalizeAlbumTitle` from `./_utils/albumMatching`.

Add `autoMatchSpotifyAlbum` and `setSpotifyAlbumMapping`.

`autoMatchSpotifyAlbum`:
- accepts `{ albumId }`
- uses `albumTitleOverride ?? albumTitle`
- uses `artistNameOverride ?? artistName`, split on comma for artist names
- queries `spotifyAlbums.by_albumTitleKey`
- accepts exactly one candidate whose artist keys intersect
- patches `spotifyAlbumConvexId`, `spotifyAlbumId`, `spotifyAlbumMatchMethod: "title_artist"`, `spotifyAlbumMatchedAt`
- returns `{ matched: boolean, reason: string, spotifyAlbumId?: string }`

`setSpotifyAlbumMapping`:
- accepts `{ albumId, spotifyAlbumId }`
- finds local `spotifyAlbums.by_spotifyAlbumId`
- patches mapping fields with method `"manual"`
- returns mapped album summary

- [ ] **Step 5: Add tests for matching logic if helper extracted**

If matching logic is kept inside mutations, skip pure tests. If a helper is extracted, add tests in `convex/_utils/geniusAlbumLyrics.test.ts` for unique, none, and ambiguous matches.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm exec tsx --test convex/_utils/geniusAlbumLyrics.test.ts
pnpm typecheck
```

Expected: tests pass and TypeScript exits 0.

---

### Task 4: Album Edit Data UI

**Files:**
- Create: `src/app/lyrics/[slug]/edit/page.tsx`
- Create: `src/app/lyrics/_components/album-lyrics-editor.tsx`
- Modify: `src/app/lyrics/[slug]/page.tsx`

- [ ] **Step 1: Add route**

Create `src/app/lyrics/[slug]/edit/page.tsx`:

```typescript
import { AlbumLyricsEditor } from "../../_components/album-lyrics-editor";

export default async function AlbumLyricsEditPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	return <AlbumLyricsEditor slug={slug} />;
}
```

- [ ] **Step 2: Add editor component**

Create `src/app/lyrics/_components/album-lyrics-editor.tsx` as a client component.

Use imports:

```typescript
"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ExternalLink, RefreshCw, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
```

Component requirements:
- Query `api.geniusAlbums.getAlbumBySlug`.
- Use `api.geniusAlbums.updateAlbumOverrides`, `updateSongOverrides`, `autoMatchSpotifyAlbum`, `setSpotifyAlbumMapping`.
- Show album form with album title, artist name(s), summary, front page image URL, manual Spotify ID field, auto-match button.
- Show each song in a card with title, duration, lyrics, about, and credit label checkboxes.
- Save album overrides via a button.
- Save track overrides via per-card button.
- Toggle credit labels by saving `hiddenCreditLabels`.

- [ ] **Step 3: Add private page link**

In `src/app/lyrics/[slug]/page.tsx`, import `Pencil` from `lucide-react` and add a private header button:

```tsx
<Button asChild variant="outline">
	<Link href={`/lyrics/${slug}/edit`}>
		<Pencil className="mr-2 h-4 w-4" />
		Edit data
	</Link>
</Button>
```

Do not add this to public pages.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm typecheck
pnpm exec biome check src/app/lyrics/[slug]/edit/page.tsx src/app/lyrics/_components/album-lyrics-editor.tsx src/app/lyrics/[slug]/page.tsx
```

Expected: TypeScript exits 0 and scoped Biome exits 0.

---

### Task 5: Render Overrides and Empty Lyrics

**Files:**
- Modify: `src/app/lyrics/[slug]/page.tsx`
- Modify: `src/app/public/lyrics/[slug]/page.tsx`
- Modify: `src/app/lyrics/_components/album-lyrics-zine.tsx`
- Modify: `src/lib/zine/album-song-input.ts`
- Modify: `src/lib/zine/album-song-input.test.ts`

- [ ] **Step 1: Add zine input support for duration and overrides**

In `src/lib/zine/album-song-input.ts`, update the `song` parameter shape to include:

```typescript
songTitleOverride?: string;
lyricsOverride?: string;
aboutOverride?: string;
durationSecondsOverride?: number;
```

Return:

```typescript
title: song.songTitleOverride?.trim() || song.songTitle || "Untitled song",
about: song.aboutOverride?.trim() || song.about,
lyrics: song.lyricsOverride?.trim() || song.lyrics ?? "",
durationSeconds: song.durationSecondsOverride,
```

- [ ] **Step 2: Update album zine adapter**

In `src/app/lyrics/_components/album-lyrics-zine.tsx`, pass the new override/duration fields into `buildAlbumZineSongInput`.

- [ ] **Step 3: Update private/public album pages**

In both album reader pages, compute:

```typescript
const displayAlbumTitle = album.albumTitleOverride?.trim() || album.albumTitle;
const displayArtistName = album.artistNameOverride?.trim() || album.artistName;
const displaySummary = album.summaryOverride?.trim();
const frontPageImageUrl =
	album.frontPageImageUrlOverride?.trim() || album.zineCoverImageUrl;
```

For each song:

```typescript
const displayTitle = song.songTitleOverride?.trim() || song.songTitle;
const displayLyrics = song.lyricsOverride?.trim() || song.lyrics;
const displayAbout = song.aboutOverride?.trim() || song.about;
const hasLyrics = displayLyrics.trim().length > 0;
```

Render a no-lyrics placeholder when `hasLyrics` is false:

```tsx
<p className="rounded-lg border bg-muted/30 p-4 text-muted-foreground text-sm">
	No lyrics available for this track.
</p>
```

Show `displaySummary` under the album header when present. Show `frontPageImageUrl` in the header when present.

- [ ] **Step 4: Update tests**

In `src/lib/zine/album-song-input.test.ts`, add a test that overrides title, lyrics, about, and duration.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm exec tsx --test src/lib/zine/album-song-input.test.ts
pnpm typecheck
pnpm exec biome check src/app/lyrics/[slug]/page.tsx src/app/public/lyrics/[slug]/page.tsx src/app/lyrics/_components/album-lyrics-zine.tsx src/lib/zine/album-song-input.ts src/lib/zine/album-song-input.test.ts
```

Expected: tests pass, TypeScript exits 0, scoped Biome exits 0.

---

### Task 6: Final Verification

**Files:**
- All touched files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm exec tsx --test convex/_utils/geniusAlbumLyrics.test.ts convex/_utils/geniusParser.test.ts convex/_utils/playlistLyrics.test.ts src/lib/zine/album-song-input.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 3: Run scoped Biome on touched files**

Run:

```bash
pnpm exec biome check convex/_utils/geniusAlbumLyrics.ts convex/_utils/geniusAlbumLyrics.test.ts convex/_utils/geniusParser.ts convex/geniusAlbums.ts convex/schema.ts src/app/api/scrape-genius/route.ts src/app/lyrics/page.tsx src/app/lyrics/[slug]/page.tsx src/app/public/lyrics/[slug]/page.tsx src/app/lyrics/[slug]/edit/page.tsx src/app/lyrics/_components/album-lyrics-editor.tsx src/app/lyrics/_components/album-lyrics-zine.tsx src/lib/zine/album-song-input.ts src/lib/zine/album-song-input.test.ts
```

Expected: exit 0.

- [ ] **Step 4: Run full Biome and report known repo issues**

Run:

```bash
pnpm check
```

Expected: may fail on known unrelated generated/legacy diagnostics. If it fails, confirm no diagnostics are from touched files.

---

## Execution Notes

- Work on the current dirty branch; do not revert the existing uncommitted Genius credits implementation.
- Do not commit implementation changes unless the user explicitly requests a commit.
- Keep public pages read-only.
- Keep scraped fields intact and write overrides separately.
- Do not add Spotify API search; match only against existing `spotifyAlbums` rows.
