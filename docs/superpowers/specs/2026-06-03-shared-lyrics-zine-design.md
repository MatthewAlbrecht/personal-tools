# Shared Lyrics Zine Design

**Goal:** Make the zine booklet print feature (today only on playlist-lyrics) reusable so the Album Lyrics Aggregator (`/lyrics/[slug]`, `/public/lyrics/[slug]`) gets a "Zine" button with full parity. This is a refactor to share components across both lyrics sources, not a copy-paste.

## Background

Two lyrics product areas exist:

| Feature | Routes | Convex tables | Zine today |
|---------|--------|---------------|------------|
| Album Lyrics Aggregator | `/lyrics`, `/public/lyrics` | `geniusAlbums`, `geniusSongs` | none (browser print only) |
| Playlist Lyrics | `/playlist-lyrics`, `/public/playlist-lyrics` | `playlistLyrics`, `playlistLyricsItems`, `geniusLyricScrapes` | full zine at `/…/zine` |

The existing zine is already cleanly split. Generic/pure today: `zine-layout`, `zine-pages`, `zine-booklet`, `zine-song-header-content`, the components (`zine-cover-page`, `zine-song-page`, `zine-song-header`), the fit hooks, and the print CSS/remeasure. Coupled to playlist-lyrics today: the entry orchestrator (`playlist-lyrics-zine.tsx`), the `buildZineSongDisplayInput` adapter, and persistence (mutations + zine fields on the `playlistLyrics*` tables).

## Approach

Extract a Convex-agnostic generic zine shell + two thin per-source adapters. Persistence mirrors the existing inline-field pattern per source (not a shared settings table — that would force migrating the working playlist zine for no user-visible gain).

### 1. Shared module layout

Move the generic zine code out of `src/app/playlist-lyrics/_components/` and `_utils/` into neutral homes that match repo conventions (`src/lib/` for logic, `src/components/` for UI):

- **`src/lib/zine/`** (pure, with their tests):
  - `zine-types.ts` — `ZineSongDisplayInput`, `ZineItemSettings`, and related types (extracted from `song-display.ts`)
  - `zine-layout.ts`
  - `zine-pages.ts`
  - `zine-booklet.ts`
  - `zine-song-header-content.ts`
- **`src/components/zine/`** (client UI):
  - `lyrics-zine.tsx` — NEW generic entry component (no Convex imports)
  - `zine-cover-page.tsx`
  - `zine-song-page.tsx`
  - `zine-song-header.tsx`
  - `zine-print-styles.tsx`
  - `zine-print-remeasure.ts`
  - `use-auto-fit-text.ts`
  - `use-zine-song-lyrics-fit.ts`
  - `lyrics-renderer.tsx` (shared by zine + both readers)

`lyrics-renderer.tsx` is currently imported by the album readers and the playlist reader via `playlist-lyrics/_components/lyrics-renderer`. After the move, update those imports to `src/components/zine/lyrics-renderer` (or a re-export shim to limit churn — implementation plan decides).

### 2. Generic shell contract

`LyricsZine` owns all display-toggle state, page/booklet building, screen preview, the print DOM, duplex binding, and the cover-editing UI. It has no Convex imports — persistence flows through callbacks.

```typescript
type ZineItemSettings = {
	columnCount?: 1 | 2;
	fontSizePt?: number;
	condenseScale?: number;
};

type LyricsZineProps = {
	collectionTitle: string;
	songs: ZineSongDisplayInput[];
	cover: { imageUrl?: string; greyscale: boolean };
	itemSettingsById: Record<string, ZineItemSettings>;
	canEdit: boolean; // private => editable; public => read-only
	persistence?: {
		saveItemSettings(songId: string, s: ZineItemSettings): void;
		saveCover(
			url: string | undefined,
			storageId?: string,
		): Promise<{ coverImageUrl?: string }>;
		saveGreyscale(on: boolean): void;
		generateUploadUrl(): Promise<string>;
	};
};
```

When `canEdit` is false (or `persistence` is absent), the cover-editing UI and per-song controls are hidden and no mutations run, matching the public playlist zine today.

### 3. Adapters

- **`playlist-lyrics-zine.tsx`** (rewritten thin): fetch `getBySlug` / `getPublicBySlug`, map via the existing playlist mapping (overrides → scrape → fallbacks), supply playlist Convex callbacks, render `<LyricsZine>`. Behavior identical to today.
- **`album-lyrics-zine.tsx`** (new): fetch `geniusAlbums.getAlbumBySlug`, map each `geniusSongs` row → `ZineSongDisplayInput` with:
  - `id` = song `_id`
  - `position` = `trackNumber`
  - `title` = `songTitle`
  - `artistName` = `album.artistName` (constant per album)
  - `albumTitle` = `album.albumTitle`
  - `albumYear`, `albumArtUrl`, `userNote` = absent
  - `about` = `song.about`
  - `lyrics` = `song.lyrics`
  Supply album Convex callbacks, render `<LyricsZine>`.

### 4. Album persistence (Convex)

Mirror the playlist inline-field pattern.

- **`geniusAlbums`** add: `zineCoverImageUrl?`, `zineCoverImageStorageId?`, `zineCoverGreyscale?`.
- **`geniusSongs`** add: `zineLyricsColumnCount?` (`1|2`), `zineLyricsFontSizePt?`, `zineTitleCondenseScale?`.
- **New mutations in `convex/geniusAlbums.ts`** mirroring `convex/playlistLyrics.ts`:
  - `generateZineCoverUploadUrl`
  - `updateZineCoverImage` (url or storageId; deletes prior storage; clears on default)
  - `updateZineCoverGreyscale` (clears field when false)
  - `updateZineSongSettings` (per-song columns/size/condense; clears values at defaults: 2 columns, 9pt, 1.0 scale)
- **`getAlbumBySlug`** returns the resolved cover URL (storage-first, like `resolveZineCoverImageUrl`) plus the per-song zine settings on each song.

### 5. Routes & navigation

- New `src/app/lyrics/[slug]/zine/page.tsx` → `<PrivateAlbumLyricsZine slug=… />`.
- New `src/app/public/lyrics/[slug]/zine/page.tsx` → `<PublicAlbumLyricsZine slug=… />`.
- Add a "Zine" button (BookOpen icon) to both album readers (`src/app/lyrics/[slug]/page.tsx`, `src/app/public/lyrics/[slug]/page.tsx`), linking to the matching zine route — same pattern as the playlist reader.

### 6. Data-shape notes / non-goals

- Album songs lack per-song artist, album art, year, and notes. The existing display toggles already gate these; absent fields simply don't render. Album art toggle has nothing to show for albums.
- Duration is a deterministic placeholder today (`getPlaceholderTrackDurationSeconds`) for both sources — unchanged.
- Intro block uses the existing lorem placeholder for both sources — unchanged.
- No shared `zineSettings` table (rejected: forces playlist migration for no user-visible gain).
- No changes to the existing scroll / 2-column browser print on the readers; the zine remains a separate route.

## Testing

- Move the existing pure-util tests (`zine-layout.test.ts`, `zine-pages.test.ts`, `zine-booklet.test.ts`, `zine-song-header-content.test.ts`) alongside their relocated sources; keep them green.
- Add a small unit test for the album → `ZineSongDisplayInput` mapping.
- `pnpm typecheck` and biome on touched files.
- Convex schema additions require `npx convex dev` / deploy.

## Decisions locked

- Persistence mirrors inline fields per source (Approach A), not a shared table.
- Generic shell is Convex-agnostic via callbacks.
- Album zine gets full parity: cover upload + greyscale + per-song typography.
- Public album zine is read-only, like the public playlist zine.
- Generic code moves to `src/lib/zine/` + `src/components/zine/`.
