# Shared Lyrics Zine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the playlist-lyrics zine into a Convex-agnostic shared shell and give the Album Lyrics Aggregator (`/lyrics/[slug]`, `/public/lyrics/[slug]`) a full-parity "Zine" button.

**Architecture:** Move the generic zine code into `src/lib/zine/` (pure) and `src/components/zine/` (UI), introduce a generic `LyricsZine` component that takes normalized songs + cover settings + persistence callbacks, then drive it from two thin per-source adapters (playlist + album). Album zine settings persist by mirroring the playlist inline-field pattern on `geniusAlbums`/`geniusSongs`.

**Tech Stack:** Next.js 15 App Router, React 19 client components, Convex (queries/mutations/file storage), node:test + tsx for pure util tests, Biome.

**Commit Policy:** Do NOT create git commits unless the user explicitly requests them. The `git commit` steps below are written for completeness; skip them unless the user asks to commit.

**Spec:** `docs/superpowers/specs/2026-06-03-shared-lyrics-zine-design.md`

---

## File Structure

**New (pure) — `src/lib/zine/`:**
- `zine-types.ts` — `ZineSongDisplayInput`, `ZineItemSettings`
- `zine-layout.ts` (moved), `zine-layout.test.ts` (moved)
- `zine-pages.ts` (moved), `zine-pages.test.ts` (moved)
- `zine-booklet.ts` (moved), `zine-booklet.test.ts` (moved)
- `zine-song-header-content.ts` (moved), `zine-song-header-content.test.ts` (moved)
- `album-song-input.ts` — album → `ZineSongDisplayInput` mapping
- `album-song-input.test.ts`

**New (UI) — `src/components/zine/`:**
- `lyrics-zine.tsx` — generic entry (no Convex)
- `zine-cover-page.tsx`, `zine-song-page.tsx`, `zine-song-header.tsx` (moved)
- `zine-print-styles.tsx`, `zine-print-remeasure.ts` (moved)
- `use-auto-fit-text.ts`, `use-zine-song-lyrics-fit.ts` (moved)
- `lyrics-renderer.tsx` (moved)

**Modified:**
- `src/app/playlist-lyrics/_components/playlist-lyrics-zine.tsx` — rewritten thin adapter
- `src/app/playlist-lyrics/_utils/song-display.ts` — imports type from `~/lib/zine/zine-types`
- `convex/schema.ts` — zine fields on `geniusAlbums` + `geniusSongs`
- `convex/geniusAlbums.ts` — cover/song-settings mutations + `getAlbumBySlug` returns resolved cover + settings
- `src/app/lyrics/[slug]/page.tsx`, `src/app/public/lyrics/[slug]/page.tsx` — "Zine" button
- Import-path updates in any file importing moved modules

**New (routes/adapters for album):**
- `src/app/lyrics/_components/album-lyrics-zine.tsx`
- `src/app/lyrics/[slug]/zine/page.tsx`
- `src/app/public/lyrics/[slug]/zine/page.tsx`

---

## Task 1: Shared zine types

**Files:**
- Create: `src/lib/zine/zine-types.ts`

- [ ] **Step 1: Create the types file**

```typescript
export type ZineSongDisplayInput = {
	id: string;
	position: number;
	title: string;
	artistName: string;
	albumTitle?: string;
	albumYear?: string;
	albumArtUrl?: string;
	durationSeconds?: number;
	userNote?: string;
	about?: string;
	lyrics: string;
};

export type ZineItemSettings = {
	columnCount?: 1 | 2;
	fontSizePt?: number;
	condenseScale?: number;
};
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS (new file, no consumers yet).

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add src/lib/zine/zine-types.ts
git commit -m "feat: add shared zine types module"
```

---

## Task 2: Move pure zine utils to `src/lib/zine/`

Moves `zine-layout`, `zine-pages`, `zine-booklet`, `zine-song-header-content` and their tests out of `src/app/playlist-lyrics/_utils/`. `song-display.ts` stays in playlist `_utils` (it is the playlist adapter helper) but re-points its type import.

**Files:**
- Move: `src/app/playlist-lyrics/_utils/zine-layout.ts` → `src/lib/zine/zine-layout.ts`
- Move: `src/app/playlist-lyrics/_utils/zine-layout.test.ts` → `src/lib/zine/zine-layout.test.ts`
- Move: `src/app/playlist-lyrics/_utils/zine-pages.ts` → `src/lib/zine/zine-pages.ts`
- Move: `src/app/playlist-lyrics/_utils/zine-pages.test.ts` → `src/lib/zine/zine-pages.test.ts`
- Move: `src/app/playlist-lyrics/_utils/zine-booklet.ts` → `src/lib/zine/zine-booklet.ts`
- Move: `src/app/playlist-lyrics/_utils/zine-booklet.test.ts` → `src/lib/zine/zine-booklet.test.ts`
- Move: `src/app/playlist-lyrics/_utils/zine-song-header-content.ts` → `src/lib/zine/zine-song-header-content.ts`
- Move: `src/app/playlist-lyrics/_utils/zine-song-header-content.test.ts` → `src/lib/zine/zine-song-header-content.test.ts`
- Modify: `src/lib/zine/zine-pages.ts` (import path)
- Modify: `src/app/playlist-lyrics/_utils/song-display.ts` (import path + drop local type)

- [ ] **Step 1: Move the files with git**

```bash
git mv src/app/playlist-lyrics/_utils/zine-layout.ts src/lib/zine/zine-layout.ts
git mv src/app/playlist-lyrics/_utils/zine-layout.test.ts src/lib/zine/zine-layout.test.ts
git mv src/app/playlist-lyrics/_utils/zine-pages.ts src/lib/zine/zine-pages.ts
git mv src/app/playlist-lyrics/_utils/zine-pages.test.ts src/lib/zine/zine-pages.test.ts
git mv src/app/playlist-lyrics/_utils/zine-booklet.ts src/lib/zine/zine-booklet.ts
git mv src/app/playlist-lyrics/_utils/zine-booklet.test.ts src/lib/zine/zine-booklet.test.ts
git mv src/app/playlist-lyrics/_utils/zine-song-header-content.ts src/lib/zine/zine-song-header-content.ts
git mv src/app/playlist-lyrics/_utils/zine-song-header-content.test.ts src/lib/zine/zine-song-header-content.test.ts
```

(If not using git for the move, create the files at the new paths and delete the originals.)

- [ ] **Step 2: Re-point `zine-pages.ts` to the shared type**

In `src/lib/zine/zine-pages.ts`, change the type import. It currently reads:

```typescript
import type { ZineSongDisplayInput } from "./song-display";
```

Replace with:

```typescript
import type { ZineSongDisplayInput } from "./zine-types";
```

Leave the rest (`import { padZinePageCount } from "./zine-layout";` and the `ZineSongInput`/`ZineSongPage`/`buildZinePages` definitions) unchanged — `zine-layout` is now a sibling so `./zine-layout` still resolves.

- [ ] **Step 3: Re-point `song-display.ts` to the shared type and remove its local copy**

In `src/app/playlist-lyrics/_utils/song-display.ts`, delete the local `export type ZineSongDisplayInput = { ... }` block (lines 1-13) and add this import at the top instead:

```typescript
import type { ZineSongDisplayInput } from "~/lib/zine/zine-types";
```

Keep `getZineSongMetadataParts`, `buildZineSongDisplayInput`, and `splitAlbumTitleAndYear` as-is. Add a re-export so existing importers of the type from this module keep working:

```typescript
export type { ZineSongDisplayInput } from "~/lib/zine/zine-types";
```

- [ ] **Step 4: Update importers of the moved utils**

Find all imports of the moved modules and update paths from `../_utils/zine-*` / `./zine-*` to `~/lib/zine/zine-*`.

Run: `rg -n "_utils/zine-(layout|pages|booklet|song-header-content)" src` and `rg -n "playlist-lyrics/_utils/zine-(layout|pages|booklet|song-header-content)" src`

Known importers to update (verify with rg): `src/app/playlist-lyrics/_components/playlist-lyrics-zine.tsx`, `zine-song-page.tsx`, `zine-song-header.tsx`, `use-zine-song-lyrics-fit.ts`, `zine-print-remeasure.ts`. Update each matched import to the `~/lib/zine/...` path.

- [ ] **Step 5: Run the moved tests**

Run: `pnpm exec tsx --test src/lib/zine/zine-layout.test.ts src/lib/zine/zine-pages.test.ts src/lib/zine/zine-booklet.test.ts src/lib/zine/zine-song-header-content.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no unresolved imports).

- [ ] **Step 7: Commit** (only if user asked)

```bash
git add -A
git commit -m "refactor: move pure zine utils to src/lib/zine"
```

---

## Task 3: Move zine components/hooks/print + lyrics-renderer to `src/components/zine/`

**Files:**
- Move: `src/app/playlist-lyrics/_components/zine-cover-page.tsx` → `src/components/zine/zine-cover-page.tsx`
- Move: `src/app/playlist-lyrics/_components/zine-song-page.tsx` → `src/components/zine/zine-song-page.tsx`
- Move: `src/app/playlist-lyrics/_components/zine-song-header.tsx` → `src/components/zine/zine-song-header.tsx`
- Move: `src/app/playlist-lyrics/_components/zine-print-styles.tsx` → `src/components/zine/zine-print-styles.tsx`
- Move: `src/app/playlist-lyrics/_components/zine-print-remeasure.ts` → `src/components/zine/zine-print-remeasure.ts`
- Move: `src/app/playlist-lyrics/_components/use-auto-fit-text.ts` → `src/components/zine/use-auto-fit-text.ts`
- Move: `src/app/playlist-lyrics/_components/use-zine-song-lyrics-fit.ts` → `src/components/zine/use-zine-song-lyrics-fit.ts`
- Move: `src/app/playlist-lyrics/_components/lyrics-renderer.tsx` → `src/components/zine/lyrics-renderer.tsx`

- [ ] **Step 1: Move the files with git**

```bash
git mv src/app/playlist-lyrics/_components/zine-cover-page.tsx src/components/zine/zine-cover-page.tsx
git mv src/app/playlist-lyrics/_components/zine-song-page.tsx src/components/zine/zine-song-page.tsx
git mv src/app/playlist-lyrics/_components/zine-song-header.tsx src/components/zine/zine-song-header.tsx
git mv src/app/playlist-lyrics/_components/zine-print-styles.tsx src/components/zine/zine-print-styles.tsx
git mv src/app/playlist-lyrics/_components/zine-print-remeasure.ts src/components/zine/zine-print-remeasure.ts
git mv src/app/playlist-lyrics/_components/use-auto-fit-text.ts src/components/zine/use-auto-fit-text.ts
git mv src/app/playlist-lyrics/_components/use-zine-song-lyrics-fit.ts src/components/zine/use-zine-song-lyrics-fit.ts
git mv src/app/playlist-lyrics/_components/lyrics-renderer.tsx src/components/zine/lyrics-renderer.tsx
```

- [ ] **Step 2: Fix intra-module relative imports in the moved files**

The moved components import each other and the pure utils. In each moved file, ensure:
- imports of sibling moved components stay relative (e.g. `./zine-song-header`, `./lyrics-renderer`, `./use-auto-fit-text`, `./use-zine-song-lyrics-fit`, `./zine-print-remeasure`) — these still resolve since they moved together.
- imports of pure utils point to `~/lib/zine/...` (already done for some in Task 2; verify `zine-song-page.tsx`, `zine-song-header.tsx`, `use-zine-song-lyrics-fit.ts`, `zine-print-remeasure.ts`).
- imports of `~/lib/utils` (the `cn` helper) and `~/components/ui/*` are unchanged (absolute paths).

Run: `rg -n "from \"\\.\\./_utils|from \"\\.\\./playlist-lyrics" src/components/zine` — expected no matches after fixes.

- [ ] **Step 3: Update external importers of the moved modules**

Run: `rg -n "playlist-lyrics/_components/(zine-|use-auto-fit-text|use-zine-song-lyrics-fit|lyrics-renderer)" src`

Update every match to the new `~/components/zine/...` path. Known importers:
- `src/app/playlist-lyrics/_components/playlist-lyrics-zine.tsx` (zine-cover-page, zine-song-page, zine-print-remeasure, zine-print-styles)
- `src/app/playlist-lyrics/_components/playlist-lyrics-reader.tsx` (lyrics-renderer)
- `src/app/lyrics/[slug]/page.tsx` and `src/app/public/lyrics/[slug]/page.tsx` (lyrics-renderer)
- Any other `lyrics-renderer` importer surfaced by rg.

Replace e.g. `from "./lyrics-renderer"` (in reader) with `from "~/components/zine/lyrics-renderer"`.

- [ ] **Step 4: Typecheck and build**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm build`
Expected: build succeeds (catches client/server boundary or missing-import issues the typecheck might miss).

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add -A
git commit -m "refactor: move zine components and lyrics-renderer to src/components/zine"
```

---

## Task 4: Extract generic `LyricsZine`; rewrite playlist zine as adapter

This is a mechanical "move + parameterize". The current `playlist-lyrics-zine.tsx` contains BOTH the generic rendering/state and the Convex coupling. Split it: generic parts → `src/components/zine/lyrics-zine.tsx` (the `LyricsZine` component below), Convex parts stay in the rewritten `playlist-lyrics-zine.tsx`.

**Files:**
- Create: `src/components/zine/lyrics-zine.tsx`
- Modify (rewrite): `src/app/playlist-lyrics/_components/playlist-lyrics-zine.tsx`

- [ ] **Step 1: Create `LyricsZine` with this public interface**

`src/components/zine/lyrics-zine.tsx` is a `"use client"` component. Define and export:

```typescript
import type { ZineItemSettings, ZineSongDisplayInput } from "~/lib/zine/zine-types";

export type LyricsZinePersistence = {
	saveItemSettings(songId: string, settings: ZineItemSettings): void;
	saveCover(
		url: string | undefined,
		storageId?: string,
	): Promise<{ coverImageUrl?: string }>;
	saveGreyscale(on: boolean): void;
	generateUploadUrl(): Promise<string>;
};

export function LyricsZine({
	collectionTitle,
	songs,
	cover,
	itemSettingsById,
	canEdit,
	persistence,
}: {
	collectionTitle: string;
	songs: ZineSongDisplayInput[];
	cover: { imageUrl?: string; greyscale: boolean };
	itemSettingsById: Record<string, ZineItemSettings>;
	canEdit: boolean;
	persistence?: LyricsZinePersistence;
}) {
	// ...moved body (see Step 2)...
}
```

- [ ] **Step 2: Move the generic body into `LyricsZine`**

From the current `playlist-lyrics-zine.tsx`, move into `LyricsZine` everything that is NOT Convex-specific:
- Display-toggle state: `showGeniusInfo`, `showArtist`, `showAlbum`, `showYear`, `showAlbumArt`, `showSectionLabels`, `showUserNote`, `duplexBinding`, `isUploadingCover`.
- Local working copies driven by props: initialize `coverImageUrl` from `cover.imageUrl`, `coverGreyscale` from `cover.greyscale`; initialize the per-song maps (`songLyricsColumnModes`, `songLyricsTargetSizesPt`, `songTextCondenseScales`) from `itemSettingsById`.
- All render logic: `buildZinePages({ playlistTitle: collectionTitle, songs })`, `buildBookletSheets`, `renderPageByReadingIndex`, the screen `.zine-screen-document`, the print `.zine-print-booklet-root`, the cover controls, duplex fieldset, display-options grid, and `handlePrint` (calls `triggerZinePrintRemeasure()` + `window.print()`).
- Replace these Convex calls with prop callbacks:
  - `updateZineItemSettingsMutation({ itemId, ...})` → `persistence?.saveItemSettings(songId, { columnCount, fontSizePt, condenseScale })`
  - `updateZineCoverImageMutation({...})` → `persistence?.saveCover(url, storageId)`
  - `updateZineCoverGreyscaleMutation({...})` → `persistence?.saveGreyscale(on)`
  - `generateZineCoverUploadUrlMutation({})` → `persistence?.generateUploadUrl()`
- Gate all editing UI (cover section, per-song `<aside>` controls, greyscale toggle) behind `canEdit`. When `!canEdit`, render the read-only preview + print exactly as the current public variant does.
- Remove from `LyricsZine`: `useQuery`, `useMutation`, `api`, `Id`, hydration `useEffect` keyed on `playlistData`, `buildZineSongDisplayInput`, and the loading/not-found branches (the adapter owns data fetching and passes ready data in).
- Keep the debounce timers (`persistZineTimersRef`, `persistCoverImageTimerRef`) inside `LyricsZine` but have them call the `persistence` callbacks. The per-song clear-at-default normalization (`clampCondenseScale`, `setSongLyricsTargetPt`, etc.) stays in `LyricsZine` since it is generic.

- [ ] **Step 3: Rewrite `playlist-lyrics-zine.tsx` as a thin adapter**

Replace the file body with: data fetch, mapping, persistence callbacks, and `<LyricsZine>`. Full content:

```typescript
"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { LyricsZine } from "~/components/zine/lyrics-zine";
import type { ZineItemSettings } from "~/lib/zine/zine-types";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { buildZineSongDisplayInput } from "../_utils/song-display";

type PlaylistLyricsZineProps = {
	slug: string;
	variant: "private" | "public";
};

export function PlaylistLyricsZine({ slug, variant }: PlaylistLyricsZineProps) {
	const updateItemSettings = useMutation(api.playlistLyrics.updateZineItemSettings);
	const updateCoverImage = useMutation(api.playlistLyrics.updateZineCoverImage);
	const updateCoverGreyscale = useMutation(api.playlistLyrics.updateZineCoverGreyscale);
	const generateUploadUrl = useMutation(api.playlistLyrics.generateZineCoverUploadUrl);

	const playlistData = useQuery(
		variant === "public"
			? api.playlistLyrics.getPublicBySlug
			: api.playlistLyrics.getBySlug,
		{ slug },
	);

	if (playlistData === undefined) {
		return <div className="mx-auto max-w-4xl px-4 py-10">Loading…</div>;
	}

	if (playlistData === null) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-10 text-center">
				<h1 className="mb-4 font-bold text-2xl">Playlist Not Found</h1>
				<Button asChild>
					<Link href={variant === "public" ? "/public/playlist-lyrics" : "/playlist-lyrics"}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Link>
				</Button>
			</div>
		);
	}

	const canEdit = variant === "private";
	const playlistId =
		"_id" in playlistData.playlist ? playlistData.playlist._id : undefined;

	const songs = playlistData.songs.map((song) =>
		buildZineSongDisplayInput({
			id: song._id,
			position: song.position,
			songTitleOverride: song.songTitleOverride,
			artistNameOverride: song.artistNameOverride,
			albumTitleOverride: song.albumTitleOverride,
			albumArtUrlOverride: song.albumArtUrlOverride,
			userNote: song.userNote,
			scrape: song.scrape,
		}),
	);

	const itemSettingsById: Record<string, ZineItemSettings> = {};
	for (const song of playlistData.songs) {
		itemSettingsById[song._id] = {
			columnCount: song.zineLyricsColumnCount,
			fontSizePt: song.zineLyricsFontSizePt,
			condenseScale: song.zineTitleCondenseScale,
		};
	}

	return (
		<LyricsZine
			canEdit={canEdit}
			collectionTitle={playlistData.playlist.title}
			cover={{
				imageUrl: playlistData.playlist.zineCoverImageUrl,
				greyscale: playlistData.playlist.zineCoverGreyscale === true,
			}}
			itemSettingsById={itemSettingsById}
			songs={songs}
			persistence={
				canEdit && playlistId !== undefined
					? {
							saveItemSettings: (songId, s) => {
								void updateItemSettings({
									itemId: songId as Id<"playlistLyricsItems">,
									zineLyricsColumnCount: s.columnCount,
									zineLyricsFontSizePt: s.fontSizePt,
									zineTitleCondenseScale: s.condenseScale,
								});
							},
							saveCover: (url, storageId) =>
								updateCoverImage({
									playlistId,
									coverImageUrl: url,
									storageId: storageId as Id<"_storage"> | undefined,
								}),
							saveGreyscale: (on) => {
								void updateCoverGreyscale({ playlistId, greyscale: on });
							},
							generateUploadUrl: () => generateUploadUrl({}),
						}
					: undefined
			}
		/>
	);
}

export function PrivatePlaylistLyricsZine({ slug }: { slug: string }) {
	return <PlaylistLyricsZine slug={slug} variant="private" />;
}

export function PublicPlaylistLyricsZine({ slug }: { slug: string }) {
	return <PlaylistLyricsZine slug={slug} variant="public" />;
}
```

Note: `updateZineItemSettings` currently requires at least one defined field and throws otherwise. `LyricsZine` must only call `saveItemSettings` when at least one of the three values is set; preserve the existing debounce + "skip when all defaults" behavior from the original component when moving it.

- [ ] **Step 4: Typecheck and build**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm build`
Expected: success.

- [ ] **Step 5: Manual verification of the playlist zine**

Run: `pnpm dev`, open `/playlist-lyrics/<an-existing-slug>/zine`. Confirm: pages render, per-song column/size/condense controls work and persist (reload), cover URL/upload + greyscale work, Print Zine triggers the booklet layout, duplex radios still rotate backs. Open `/public/playlist-lyrics/<slug>/zine` and confirm read-only (no edit controls), still prints.

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add -A
git commit -m "refactor: extract generic LyricsZine; playlist zine becomes adapter"
```

---

## Task 5: Album Convex — schema fields, mutations, query resolution

Mirror the playlist zine persistence on the album tables. Reference `convex/playlistLyrics.ts` for the equivalent `updateZineItemSettings`, `updateZineCoverImage`, `updateZineCoverGreyscale`, `generateZineCoverUploadUrl`, and `resolveZineCoverImageUrl` implementations and copy their normalization rules (defaults cleared to `undefined`: 2 columns, 9pt, scale 1.0, greyscale false).

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/geniusAlbums.ts`

- [ ] **Step 1: Add schema fields**

In `convex/schema.ts`, in the `geniusAlbums` table definition, add before `createdAt`:

```typescript
		zineCoverImageUrl: v.optional(v.string()),
		zineCoverImageStorageId: v.optional(v.id("_storage")),
		zineCoverGreyscale: v.optional(v.boolean()),
```

In the `geniusSongs` table definition, add before `createdAt`:

```typescript
		zineLyricsColumnCount: v.optional(v.union(v.literal(1), v.literal(2))),
		zineLyricsFontSizePt: v.optional(v.number()),
		zineTitleCondenseScale: v.optional(v.number()),
```

- [ ] **Step 2: Add a cover-URL resolver + return it from `getAlbumBySlug`**

In `convex/geniusAlbums.ts`, add a helper and use it in `getAlbumBySlug` so the album object carries a resolved `zineCoverImageUrl` (storage-first):

```typescript
async function resolveAlbumCoverImageUrl(
	ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } },
	album: { zineCoverImageStorageId?: Id<"_storage">; zineCoverImageUrl?: string },
): Promise<string | undefined> {
	if (album.zineCoverImageStorageId) {
		return (await ctx.storage.getUrl(album.zineCoverImageStorageId)) ?? undefined;
	}
	return album.zineCoverImageUrl;
}
```

Add `import type { Id } from "./_generated/dataModel";` at the top. In `getAlbumBySlug`'s return, replace `return { album, songs };` with:

```typescript
		return {
			album: {
				...album,
				zineCoverImageUrl: await resolveAlbumCoverImageUrl(ctx, album),
			},
			songs,
		};
```

(`songs` already include the new per-song zine fields since they are full `geniusSongs` docs.)

- [ ] **Step 3: Add the four mutations**

Append to `convex/geniusAlbums.ts`:

```typescript
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
		albumId: v.id("geniusAlbums"),
		coverImageUrl: v.optional(v.string()),
		storageId: v.optional(v.id("_storage")),
	},
	returns: v.object({ coverImageUrl: v.optional(v.string()) }),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");
		const now = Date.now();

		if (args.storageId !== undefined) {
			if (album.zineCoverImageStorageId && album.zineCoverImageStorageId !== args.storageId) {
				await ctx.storage.delete(album.zineCoverImageStorageId);
			}
			await ctx.db.patch(args.albumId, {
				zineCoverImageStorageId: args.storageId,
				zineCoverImageUrl: undefined,
				updatedAt: now,
			});
			return { coverImageUrl: (await ctx.storage.getUrl(args.storageId)) ?? undefined };
		}

		if (args.coverImageUrl !== undefined) {
			if (album.zineCoverImageStorageId) {
				await ctx.storage.delete(album.zineCoverImageStorageId);
			}
			const trimmed = args.coverImageUrl.trim();
			const normalized = trimmed.length > 0 ? trimmed : undefined;
			await ctx.db.patch(args.albumId, {
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
	args: { albumId: v.id("geniusAlbums"), greyscale: v.boolean() },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");
		await ctx.db.patch(args.albumId, {
			zineCoverGreyscale: args.greyscale ? true : undefined,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const updateZineSongSettings = mutation({
	args: {
		songId: v.id("geniusSongs"),
		zineLyricsColumnCount: v.optional(v.union(v.literal(1), v.literal(2))),
		zineLyricsFontSizePt: v.optional(v.number()),
		zineTitleCondenseScale: v.optional(v.number()),
	},
	returns: v.id("geniusSongs"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		if (
			args.zineLyricsColumnCount === undefined &&
			args.zineLyricsFontSizePt === undefined &&
			args.zineTitleCondenseScale === undefined
		) {
			throw new Error("No zine settings provided");
		}
		const song = await ctx.db.get(args.songId);
		if (!song) throw new Error("Song not found");

		const patch: {
			zineLyricsColumnCount?: 1 | 2 | undefined;
			zineLyricsFontSizePt?: number | undefined;
			zineTitleCondenseScale?: number | undefined;
		} = {};

		if (args.zineLyricsColumnCount !== undefined) {
			patch.zineLyricsColumnCount =
				args.zineLyricsColumnCount === 2 ? undefined : 1;
		}
		if (args.zineLyricsFontSizePt !== undefined) {
			const rounded = Math.round(args.zineLyricsFontSizePt * 2) / 2;
			patch.zineLyricsFontSizePt = rounded === 9 ? undefined : rounded;
		}
		if (args.zineTitleCondenseScale !== undefined) {
			const rounded = Math.round(args.zineTitleCondenseScale * 100) / 100;
			patch.zineTitleCondenseScale = rounded === 1 ? undefined : rounded;
		}

		await ctx.db.patch(args.songId, patch);
		return args.songId;
	},
});
```

(`9`, `1`, and `2` defaults match `ZINE_LYRICS_SIZE_SLIDER.defaultPt`, `ZINE_TEXT_CONDENSE.default`, and the 2-column default in `src/lib/zine/zine-layout.ts`. If those constants differ, use the constant values.)

- [ ] **Step 4: Push schema + functions to dev Convex**

Run: `npx convex dev --once`
Expected: schema accepted (new optional fields), functions deployed, no validator errors.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (generated API types now include the new functions).

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add -A
git commit -m "feat: album zine persistence (schema + mutations)"
```

---

## Task 6: Album → `ZineSongDisplayInput` mapping (TDD)

**Files:**
- Create: `src/lib/zine/album-song-input.ts`
- Create: `src/lib/zine/album-song-input.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/zine/album-song-input.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { buildAlbumZineSongInput } from "./album-song-input";

test("maps a genius song to zine song input with album artist", () => {
	const result = buildAlbumZineSongInput({
		album: { albumTitle: "Twenty", artistName: "Taking Back Sunday" },
		song: {
			id: "song1",
			trackNumber: 9,
			songTitle: "Cute Without the 'E'",
			lyrics: "first line\nsecond line",
			about: "context",
		},
	});

	assert.equal(result.id, "song1");
	assert.equal(result.position, 9);
	assert.equal(result.title, "Cute Without the 'E'");
	assert.equal(result.artistName, "Taking Back Sunday");
	assert.equal(result.albumTitle, "Twenty");
	assert.equal(result.albumYear, undefined);
	assert.equal(result.albumArtUrl, undefined);
	assert.equal(result.userNote, undefined);
	assert.equal(result.durationSeconds, undefined);
	assert.equal(result.about, "context");
	assert.equal(result.lyrics, "first line\nsecond line");
});

test("falls back to placeholder title and empty lyrics", () => {
	const result = buildAlbumZineSongInput({
		album: { albumTitle: "X", artistName: "Y" },
		song: { id: "s", trackNumber: 1, songTitle: "", lyrics: "" },
	});

	assert.equal(result.title, "Untitled song");
	assert.equal(result.lyrics, "");
	assert.equal(result.about, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec tsx --test src/lib/zine/album-song-input.test.ts`
Expected: FAIL with "Cannot find module './album-song-input'" or "buildAlbumZineSongInput is not a function".

- [ ] **Step 3: Write the implementation**

`src/lib/zine/album-song-input.ts`:

```typescript
import type { ZineSongDisplayInput } from "./zine-types";

export function buildAlbumZineSongInput({
	album,
	song,
}: {
	album: { albumTitle: string; artistName: string };
	song: {
		id: string;
		trackNumber: number;
		songTitle: string;
		lyrics: string;
		about?: string;
	};
}): ZineSongDisplayInput {
	return {
		id: song.id,
		position: song.trackNumber,
		title: song.songTitle || "Untitled song",
		artistName: album.artistName || "Unknown artist",
		albumTitle: album.albumTitle || undefined,
		albumYear: undefined,
		albumArtUrl: undefined,
		durationSeconds: undefined,
		userNote: undefined,
		about: song.about,
		lyrics: song.lyrics ?? "",
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec tsx --test src/lib/zine/album-song-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add src/lib/zine/album-song-input.ts src/lib/zine/album-song-input.test.ts
git commit -m "feat: album to zine song input mapping"
```

---

## Task 7: Album zine adapter component

**Files:**
- Create: `src/app/lyrics/_components/album-lyrics-zine.tsx`

- [ ] **Step 1: Create the adapter**

`src/app/lyrics/_components/album-lyrics-zine.tsx`:

```typescript
"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { LyricsZine } from "~/components/zine/lyrics-zine";
import { buildAlbumZineSongInput } from "~/lib/zine/album-song-input";
import type { ZineItemSettings } from "~/lib/zine/zine-types";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type AlbumLyricsZineProps = {
	slug: string;
	variant: "private" | "public";
};

export function AlbumLyricsZine({ slug, variant }: AlbumLyricsZineProps) {
	const updateSongSettings = useMutation(api.geniusAlbums.updateZineSongSettings);
	const updateCoverImage = useMutation(api.geniusAlbums.updateZineCoverImage);
	const updateCoverGreyscale = useMutation(api.geniusAlbums.updateZineCoverGreyscale);
	const generateUploadUrl = useMutation(api.geniusAlbums.generateZineCoverUploadUrl);

	const albumData = useQuery(api.geniusAlbums.getAlbumBySlug, { slug });

	if (albumData === undefined) {
		return <div className="mx-auto max-w-4xl px-4 py-10">Loading…</div>;
	}

	if (albumData === null) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-10 text-center">
				<h1 className="mb-4 font-bold text-2xl">Album Not Found</h1>
				<Button asChild>
					<Link href={variant === "public" ? "/public/lyrics" : "/lyrics"}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Link>
				</Button>
			</div>
		);
	}

	const canEdit = variant === "private";
	const albumId = albumData.album._id;

	const songs = albumData.songs.map((song) =>
		buildAlbumZineSongInput({
			album: {
				albumTitle: albumData.album.albumTitle,
				artistName: albumData.album.artistName,
			},
			song: {
				id: song._id,
				trackNumber: song.trackNumber,
				songTitle: song.songTitle,
				lyrics: song.lyrics,
				about: song.about,
			},
		}),
	);

	const itemSettingsById: Record<string, ZineItemSettings> = {};
	for (const song of albumData.songs) {
		itemSettingsById[song._id] = {
			columnCount: song.zineLyricsColumnCount,
			fontSizePt: song.zineLyricsFontSizePt,
			condenseScale: song.zineTitleCondenseScale,
		};
	}

	return (
		<LyricsZine
			canEdit={canEdit}
			collectionTitle={albumData.album.albumTitle}
			cover={{
				imageUrl: albumData.album.zineCoverImageUrl,
				greyscale: albumData.album.zineCoverGreyscale === true,
			}}
			itemSettingsById={itemSettingsById}
			songs={songs}
			persistence={
				canEdit
					? {
							saveItemSettings: (songId, s) => {
								void updateSongSettings({
									songId: songId as Id<"geniusSongs">,
									zineLyricsColumnCount: s.columnCount,
									zineLyricsFontSizePt: s.fontSizePt,
									zineTitleCondenseScale: s.condenseScale,
								});
							},
							saveCover: (url, storageId) =>
								updateCoverImage({
									albumId,
									coverImageUrl: url,
									storageId: storageId as Id<"_storage"> | undefined,
								}),
							saveGreyscale: (on) => {
								void updateCoverGreyscale({ albumId, greyscale: on });
							},
							generateUploadUrl: () => generateUploadUrl({}),
						}
					: undefined
			}
		/>
	);
}

export function PrivateAlbumLyricsZine({ slug }: { slug: string }) {
	return <AlbumLyricsZine slug={slug} variant="private" />;
}

export function PublicAlbumLyricsZine({ slug }: { slug: string }) {
	return <AlbumLyricsZine slug={slug} variant="public" />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add src/app/lyrics/_components/album-lyrics-zine.tsx
git commit -m "feat: album lyrics zine adapter"
```

---

## Task 8: Album zine routes

**Files:**
- Create: `src/app/lyrics/[slug]/zine/page.tsx`
- Create: `src/app/public/lyrics/[slug]/zine/page.tsx`

- [ ] **Step 1: Private route**

`src/app/lyrics/[slug]/zine/page.tsx`:

```typescript
import { PrivateAlbumLyricsZine } from "../../_components/album-lyrics-zine";

export default async function AlbumZinePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	return <PrivateAlbumLyricsZine slug={slug} />;
}
```

- [ ] **Step 2: Public route**

`src/app/public/lyrics/[slug]/zine/page.tsx`:

```typescript
import { PublicAlbumLyricsZine } from "../../../../lyrics/_components/album-lyrics-zine";

export default async function PublicAlbumZinePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	return <PublicAlbumLyricsZine slug={slug} />;
}
```

(Verify the relative depth of the public import resolves to `src/app/lyrics/_components/album-lyrics-zine`; adjust `../` count if the build reports an unresolved path.)

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS; both new routes compile.

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add src/app/lyrics/[slug]/zine/page.tsx src/app/public/lyrics/[slug]/zine/page.tsx
git commit -m "feat: album zine routes"
```

---

## Task 9: "Zine" button on album readers

**Files:**
- Modify: `src/app/lyrics/[slug]/page.tsx`
- Modify: `src/app/public/lyrics/[slug]/page.tsx`

- [ ] **Step 1: Read the reader files to find the no-print toolbar**

Read `src/app/lyrics/[slug]/page.tsx` and locate the `no-print` toolbar containing the existing "Print" / "2-Column" buttons and confirm the `slug` value in scope. Do the same for the public file.

- [ ] **Step 2: Add the button (private reader)**

Ensure `BookOpen` is imported from `lucide-react` and `Link` from `next/link`. In the private reader's `no-print` toolbar, alongside the existing buttons, add:

```tsx
<Button asChild variant="outline">
	<Link href={`/lyrics/${slug}/zine`}>
		<BookOpen className="mr-2 h-4 w-4" />
		Zine
	</Link>
</Button>
```

- [ ] **Step 3: Add the button (public reader)**

Same as Step 2 but in `src/app/public/lyrics/[slug]/page.tsx`, with the public href:

```tsx
<Button asChild variant="outline">
	<Link href={`/public/lyrics/${slug}/zine`}>
		<BookOpen className="mr-2 h-4 w-4" />
		Zine
	</Link>
</Button>
```

(If a reader uses a plain `<a>`/`<button>` toolbar instead of the `Button`/`Link` primitives, match that file's existing pattern for consistency.)

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add src/app/lyrics/[slug]/page.tsx src/app/public/lyrics/[slug]/page.tsx
git commit -m "feat: link album readers to zine view"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run all pure zine tests**

Run: `pnpm exec tsx --test src/lib/zine/zine-layout.test.ts src/lib/zine/zine-pages.test.ts src/lib/zine/zine-booklet.test.ts src/lib/zine/zine-song-header-content.test.ts src/lib/zine/album-song-input.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Biome**

Run: `pnpm check`
Expected: no errors on touched files (run `pnpm check:write` to auto-fix formatting if needed).

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: success.

- [ ] **Step 5: Manual end-to-end**

With `pnpm dev` and `npx convex dev` running:
- `/lyrics/<album-slug>/zine`: pages render in reading order; per-song columns/size/condense controls persist across reload; cover URL + upload + greyscale persist; Print Zine produces the booklet sheets; duplex radios rotate backs.
- `/public/lyrics/<album-slug>/zine`: read-only (no edit controls), still prints.
- `/lyrics/<album-slug>` and `/public/lyrics/<album-slug>`: the new "Zine" button links to the correct route.
- Regression: `/playlist-lyrics/<slug>/zine` and its public mirror still behave exactly as before.

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add -A
git commit -m "test: verify shared lyrics zine across sources"
```

---

## Self-Review notes

- **Spec coverage:** shared module layout (Tasks 2-3), generic shell contract (Task 4), adapters (Tasks 4, 7), album persistence (Task 5), routes & buttons (Tasks 8-9), album data mapping with absent fields (Task 6), testing (Tasks 6, 10). All spec sections mapped.
- **Type consistency:** `ZineSongDisplayInput`/`ZineItemSettings` defined in Task 1, consumed identically in Tasks 4-7. `LyricsZine` prop names (`collectionTitle`, `songs`, `cover`, `itemSettingsById`, `canEdit`, `persistence`) match across Tasks 4 and 7. Mutation arg names (`albumId`, `songId`, `playlistId`, `coverImageUrl`, `storageId`, `greyscale`, `zineLyricsColumnCount`, `zineLyricsFontSizePt`, `zineTitleCondenseScale`) consistent between Task 5 (definitions) and Tasks 4/7 (callers).
- **Default constants:** 9pt / scale 1.0 / 2 columns referenced from `src/lib/zine/zine-layout.ts` — use the actual constants if values differ.
