# Unify Lyrics Singular Concept Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new-standard unified lyrics model (`lyrics` + `lyricItems`) with one list, one create flow (album/playlist), shared view/edit/zine, and View↔Edit↔Zine navigation — without migrating or redirecting legacy stacks.

**Architecture:** Add new Convex tables and a `convex/lyrics.ts` module. Album create scrapes Genius for tracks/lyrics and Spotify for art/year (`spotifyAlbumId` stored). Playlist create seeds items from Spotify; each item later gets a Genius URL or instrumental/not-on-genius. Replace `/lyrics` UI to use the new model only; leave `/playlist-lyrics/*` and old `geniusAlbums` pages orphaned but untouched.

**Tech Stack:** Next.js 15 App Router, Convex, React, Tailwind, TypeScript, Biome, existing Genius scrape helpers, `~/lib/spotify.ts`, `parseSpotifyAlbumId` / `parseSpotifyPlaylistId`, shared `LyricsZine`, `node:test` via `pnpm exec tsx --test`

**Spec:** `docs/superpowers/specs/2026-07-17-unify-lyrics-singular-concept-design.md`

## Global Constraints

- New standard only — no migration of `geniusAlbums` / `geniusSongs` / `playlistLyrics` / `playlistLyricsItems`
- No redirects from `/playlist-lyrics/*` or old public playlist URLs
- Album: Genius is source of truth for track list + lyrics; Spotify is supplementary (art, year); always store `spotifyAlbumId`
- Playlist: Spotify is source of truth for title, artist, album art, duration, order; Genius only supplies lyrics + credits after paste
- No auto Genius matching for playlist tracks
- Every view/edit/zine page must cross-link View, Edit, Zine
- Reuse `geniusLyricScrapes` as the song scrape cache
- Classic function declarations; `type` aliases; kebab-case filenames
- Env via `~/env.js` only if needed

### Pinned enums

```typescript
type LyricsType = "album" | "playlist";

type LyricItemSourceState =
	| "pending_genius"
	| "ready"
	| "instrumental"
	| "not_on_genius"
	| "failed";
```

### Feature → routes (new)

| Surface | Path |
|---------|------|
| List + create | `/lyrics` |
| View | `/lyrics/[slug]` |
| Edit | `/lyrics/[slug]/edit` |
| Zine | `/lyrics/[slug]/zine` |
| Public list/view/zine | `/public/lyrics`, `/public/lyrics/[slug]`, `/public/lyrics/[slug]/zine` |

Legacy `/lyrics/playlists` and `/playlist-lyrics/*` remain but are out of scope (do not delete in this plan).

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `convex/schema.ts` | Add `lyrics`, `lyricItems` |
| Create | `convex/_utils/lyricsSlug.ts` | Slugify + uniqueness helper |
| Create | `convex/_utils/lyricsSlug.test.ts` | Slug tests |
| Create | `convex/lyrics.ts` | Unified CRUD, create pipelines, item Genius attach, zine mutations (minimal set) |
| Create | `convex/lyrics.source.test.ts` | Source guards for create/source-of-truth |
| Create | `src/app/api/lyrics/create-album/route.ts` | Genius album scrape + Spotify album + Convex create |
| Create | `src/app/api/lyrics/create-playlist/route.ts` | Spotify playlist seed + Convex create |
| Create | `src/app/api/lyrics/attach-genius-song/route.ts` | Scrape Genius song → attach to lyric item |
| Create | `src/app/lyrics/_components/lyrics-nav.tsx` | View / Edit / Zine links |
| Create | `src/app/lyrics/_components/create-lyrics-dialog.tsx` | Album vs playlist create form |
| Create | `src/app/lyrics/_components/unified-lyrics-list.tsx` | New list UI |
| Create | `src/app/lyrics/_components/unified-lyrics-reader.tsx` | View |
| Create | `src/app/lyrics/_components/unified-lyrics-editor.tsx` | Edit |
| Create | `src/app/lyrics/_components/unified-lyrics-zine.tsx` | Zine adapter |
| Modify | `src/app/lyrics/page.tsx` | Use unified list + create |
| Modify | `src/app/lyrics/layout.tsx` | Drop dual tabs requirement (or only show legacy link optionally) |
| Modify | `src/app/lyrics/[slug]/page.tsx` | Unified reader + nav |
| Modify | `src/app/lyrics/[slug]/edit/page.tsx` | Unified editor + nav |
| Modify | `src/app/lyrics/[slug]/zine/page.tsx` | Unified zine + nav |
| Modify | `src/app/public/lyrics/**` | Read unified public queries |
| Modify | `docs/ideas/2026-07-15-unify-lyrics-into-singular-lyric-concept.md` | `status: planned` |

---

### Task 1: Schema + slug helpers

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/_utils/lyricsSlug.ts`
- Create: `convex/_utils/lyricsSlug.test.ts`

**Interfaces:**
- Produces: `lyrics` / `lyricItems` tables; `slugifyLyricsTitle(input: string): string`

- [ ] **Step 1: Write failing slug test**

```typescript
// convex/_utils/lyricsSlug.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { slugifyLyricsTitle } from "./lyricsSlug";

test("slugifyLyricsTitle lowercases and hyphenates", () => {
	assert.equal(slugifyLyricsTitle("Radiohead OK Computer"), "radiohead-ok-computer");
});

test("slugifyLyricsTitle strips punctuation", () => {
	assert.equal(slugifyLyricsTitle("Don't Panic!"), "dont-panic");
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm exec tsx --test convex/_utils/lyricsSlug.test.ts`

- [ ] **Step 3: Implement slug helper + schema**

`convex/_utils/lyricsSlug.ts` — copy the proven `slugify` behavior from `convex/_utils/geniusParser.ts` (or re-export it as `slugifyLyricsTitle` to avoid drift).

In `convex/schema.ts`, add validators near other lyrics tables, then:

```typescript
lyrics: defineTable({
	type: v.union(v.literal("album"), v.literal("playlist")),
	slug: v.string(),
	title: v.string(),
	artistName: v.optional(v.string()), // albums / display
	geniusAlbumUrl: v.optional(v.string()),
	spotifyAlbumId: v.optional(v.string()),
	spotifyPlaylistId: v.optional(v.string()),
	imageUrl: v.optional(v.string()),
	releaseYear: v.optional(v.number()),
	status: v.optional(v.union(v.literal("draft"), v.literal("ready"))),
	// Copy the same optional zine* collection fields used on geniusAlbums / playlistLyrics
	// (cover, greyscale, text layout, intro, display settings, inside back, QR fields if desired)
	createdAt: v.number(),
	updatedAt: v.number(),
})
	.index("by_slug", ["slug"])
	.index("by_updatedAt", ["updatedAt"])
	.index("by_type_updatedAt", ["type", "updatedAt"]),

lyricItems: defineTable({
	lyricsId: v.id("lyrics"),
	position: v.number(),
	songTitle: v.string(),
	artistName: v.optional(v.string()),
	albumTitle: v.optional(v.string()),
	albumArtUrl: v.optional(v.string()),
	durationMs: v.optional(v.number()),
	spotifyTrackId: v.optional(v.string()),
	geniusSongUrl: v.optional(v.string()),
	lyricScrapeId: v.optional(v.id("geniusLyricScrapes")),
	lyrics: v.optional(v.string()),
	about: v.optional(v.string()),
	credits: v.optional(v.array(geniusCreditValidator)),
	sourceState: v.union(
		v.literal("pending_genius"),
		v.literal("ready"),
		v.literal("instrumental"),
		v.literal("not_on_genius"),
		v.literal("failed"),
	),
	scrapeError: v.optional(v.string()),
	// Copy shared item zine/override fields from geniusSongs / playlistLyricsItems
	songTitleOverride: v.optional(v.string()),
	lyricsOverride: v.optional(v.string()),
	durationSecondsOverride: v.optional(v.number()),
	hiddenCreditLabels: v.optional(v.array(v.string())),
	shownCreditLabels: v.optional(v.array(v.string())),
	zineLyricsColumnCount: v.optional(v.union(v.literal(1), v.literal(2))),
	zineLyricsFontSizePt: v.optional(v.number()),
	zineTitleCondenseScale: v.optional(v.number()),
	zineShowCredits: v.optional(v.boolean()),
	zineCollapseWithPrevious: v.optional(v.boolean()),
	createdAt: v.number(),
	updatedAt: v.number(),
})
	.index("by_lyricsId", ["lyricsId"])
	.index("by_lyricsId_position", ["lyricsId", "position"]),
```

When copying zine fields, paste the exact validators already used on `geniusAlbums` / `playlistLyrics` in the same file — do not invent new shapes.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm exec tsx --test convex/_utils/lyricsSlug.test.ts`

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/_utils/lyricsSlug.ts convex/_utils/lyricsSlug.test.ts
git commit -m "feat: add unified lyrics schema and slug helper"
```

---

### Task 2: Core Convex reads + create mutations

**Files:**
- Create: `convex/lyrics.ts`
- Create: `convex/lyrics.source.test.ts`

**Interfaces:**
- Produces:
  - `listRecent`, `getBySlug`, `listPublicRecent`, `getPublicBySlug`
  - `createAlbumLyrics`, `createPlaylistLyrics` (mutations inserting collection + items)
  - `markItemInstrumental`, `markItemNotOnGenius`
  - `attachGeniusScrapeToItem`

- [ ] **Step 1: Write failing source test**

```typescript
// convex/lyrics.source.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("convex/lyrics.ts", "utf8");

test("createAlbumLyrics stores spotifyAlbumId and genius tracks", () => {
	assert.match(source, /export const createAlbumLyrics = mutation/);
	assert.match(source, /spotifyAlbumId/);
	assert.match(source, /geniusAlbumUrl/);
	assert.match(source, /sourceState:\s*"ready"/);
});

test("createPlaylistLyrics seeds pending_genius items", () => {
	assert.match(source, /export const createPlaylistLyrics = mutation/);
	assert.match(source, /spotifyPlaylistId/);
	assert.match(source, /pending_genius/);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm exec tsx --test convex/lyrics.source.test.ts`

- [ ] **Step 3: Implement `convex/lyrics.ts`**

Key mutation shapes:

```typescript
export const createAlbumLyrics = mutation({
	args: {
		title: v.string(),
		artistName: v.string(),
		slug: v.string(),
		geniusAlbumUrl: v.string(),
		spotifyAlbumId: v.string(),
		imageUrl: v.optional(v.string()),
		releaseYear: v.optional(v.number()),
		songs: v.array(
			v.object({
				songTitle: v.string(),
				geniusSongUrl: v.string(),
				position: v.number(),
				lyrics: v.string(),
				about: v.optional(v.string()),
				credits: v.optional(v.array(geniusCreditValidator)),
			}),
		),
	},
	returns: v.object({ lyricsId: v.id("lyrics"), slug: v.string() }),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const now = Date.now();
		// ensure unique slug (append -2, -3 if by_slug hit)
		const lyricsId = await ctx.db.insert("lyrics", {
			type: "album",
			slug: uniqueSlug,
			title: args.title,
			artistName: args.artistName,
			geniusAlbumUrl: args.geniusAlbumUrl,
			spotifyAlbumId: args.spotifyAlbumId,
			imageUrl: args.imageUrl,
			releaseYear: args.releaseYear,
			status: "ready",
			createdAt: now,
			updatedAt: now,
		});
		for (const song of args.songs) {
			await ctx.db.insert("lyricItems", {
				lyricsId,
				position: song.position,
				songTitle: song.songTitle,
				geniusSongUrl: song.geniusSongUrl,
				lyrics: song.lyrics,
				about: song.about,
				credits: song.credits,
				sourceState: "ready",
				createdAt: now,
				updatedAt: now,
			});
		}
		return { lyricsId, slug: uniqueSlug };
	},
});

export const createPlaylistLyrics = mutation({
	args: {
		title: v.string(),
		slug: v.string(),
		spotifyPlaylistId: v.string(),
		imageUrl: v.optional(v.string()),
		tracks: v.array(
			v.object({
				songTitle: v.string(),
				artistName: v.optional(v.string()),
				albumTitle: v.optional(v.string()),
				albumArtUrl: v.optional(v.string()),
				durationMs: v.optional(v.number()),
				spotifyTrackId: v.optional(v.string()),
				position: v.number(),
			}),
		),
	},
	returns: v.object({ lyricsId: v.id("lyrics"), slug: v.string() }),
	handler: async (ctx, args) => {
		// insert type:playlist, status:draft, items with sourceState: pending_genius
	},
});
```

Also implement:

```typescript
export const listRecent = query({ args: { limit?: number }, ... }); // by_updatedAt desc
export const getBySlug = query({ args: { slug }, returns collection + items ordered by position });
export const listPublicRecent / getPublicBySlug // albums always ok; playlists only if status==="ready" OR if all items non-pending — for v1: public playlist only when status === "ready"
```

`attachGeniusScrapeToItem` patches item with scrape fields + `sourceState: "ready"`.  
`markItemInstrumental` / `markItemNotOnGenius` set state and clear pending errors.

- [ ] **Step 4: Run source test + typecheck**

```bash
pnpm exec tsx --test convex/lyrics.source.test.ts
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add convex/lyrics.ts convex/lyrics.source.test.ts
git commit -m "feat: add unified lyrics Convex CRUD and create mutations"
```

---

### Task 3: Create API routes (album + playlist)

**Files:**
- Create: `src/app/api/lyrics/create-album/route.ts`
- Create: `src/app/api/lyrics/create-playlist/route.ts`
- Create: `src/app/api/lyrics/_utils.ts` (Convex client + Genius scrape reuse)

**Interfaces:**
- Consumes: `POST /api/scrape-genius` logic (inline reuse of `extractAlbumTracklistItems` / `buildAlbumSongRecordInput`), `getAlbum` / `getAllPlaylistTracks` from `~/lib/spotify`, `parseSpotifyAlbumId`, `parseSpotifyPlaylistId`
- Produces: JSON `{ slug }` on success

- [ ] **Step 1: Implement create-album route**

Auth: require `session` cookie (same as playlist-lyrics add-song).

Body: `{ spotifyAlbumUrlOrId: string, geniusAlbumUrl: string, accessToken: string }`

Flow:
1. `spotifyAlbumId = parseSpotifyAlbumId(...)` — 400 if invalid  
2. Genius scrape (reuse pattern from `src/app/api/scrape-genius/route.ts`)  
3. `getAlbum(accessToken, spotifyAlbumId)` for `images`, `release_date` → year  
4. `slugifyLyricsTitle(\`${artist} ${albumTitle}\`)`  
5. `createAlbumLyrics` with Genius songs + Spotify metadata  
6. Return `{ slug }`

- [ ] **Step 2: Implement create-playlist route**

Body: `{ spotifyPlaylistUrlOrId: string, accessToken: string }`

Flow:
1. Parse playlist id  
2. `getPlaylist` + `getAllPlaylistTracks`  
3. Map tracks → `{ songTitle, artistName, albumTitle, albumArtUrl, durationMs, spotifyTrackId, position }`  
4. `createPlaylistLyrics` with `status: "draft"`  
5. Return `{ slug }`

- [ ] **Step 3: Manual smoke via curl or UI later** — commit when typecheck passes

```bash
pnpm typecheck
git add src/app/api/lyrics
git commit -m "feat: add unified lyrics create album and playlist API routes"
```

---

### Task 4: Attach Genius song + mark instrumental / not on Genius

**Files:**
- Create: `src/app/api/lyrics/attach-genius-song/route.ts`
- Modify: `convex/lyrics.ts` (ensure attach + mark mutations exist)

**Interfaces:**
- Consumes: pattern from `src/app/api/playlist-lyrics/add-song/route.ts` (`normalizeGeniusSongUrl`, `fetchGeniusSongScrape`, `upsertScrape` on `geniusLyricScrapes`)
- Produces: item updated to `ready` with lyrics/credits; Spotify title/artist/art/duration **unchanged**

- [ ] **Step 1: Write source assertion**

Add to `convex/lyrics.source.test.ts`:

```typescript
test("attachGenius does not overwrite Spotify title fields in mutation args", () => {
	const body = source.slice(
		source.indexOf("export const attachGeniusScrapeToItem"),
		source.indexOf("export const markItemInstrumental"),
	);
	assert.doesNotMatch(body, /songTitle:/);
	assert.match(body, /sourceState:\s*"ready"/);
	assert.match(body, /lyrics:/);
});
```

- [ ] **Step 2: Implement attach route + mark mutations**

Attach mutation patches only: `geniusSongUrl`, `lyricScrapeId`, `lyrics`, `about`, `credits`, `sourceState`, `scrapeError`, `updatedAt`.

Mark instrumental / not_on_genius: set `sourceState`, clear `scrapeError`.

- [ ] **Step 3: Run tests + commit**

```bash
pnpm exec tsx --test convex/lyrics.source.test.ts
git add convex/lyrics.ts convex/lyrics.source.test.ts src/app/api/lyrics/attach-genius-song/route.ts
git commit -m "feat: attach Genius lyrics to playlist items without overwriting Spotify metadata"
```

---

### Task 5: Unified list + create UI

**Files:**
- Create: `src/app/lyrics/_components/create-lyrics-dialog.tsx`
- Create: `src/app/lyrics/_components/unified-lyrics-list.tsx`
- Modify: `src/app/lyrics/page.tsx`
- Modify: `src/app/lyrics/layout.tsx` (remove Albums/Playlists tabs from new list, or leave a small “Legacy playlists” link to `/lyrics/playlists` — optional, one line)

**Interfaces:**
- Consumes: `useSpotifyAuth` for token; create API routes; `api.lyrics.listRecent`
- Produces: create dialog with type toggle + fields; list of unified lyrics linking to `/lyrics/[slug]`

- [ ] **Step 1: Implement create dialog**

Fields:
- Type: album | playlist (radio/toggle)
- Spotify link (always)
- Genius album URL (album only)
- Submit → call create-album or create-playlist → `router.push(/lyrics/${slug}/edit)` for playlist, `/lyrics/${slug}` or edit for album

- [ ] **Step 2: Replace `lyrics/page.tsx` content**

Stop calling `api.geniusAlbums.listRecent` for the main list. Render `UnifiedLyricsList` + create button.

- [ ] **Step 3: Commit**

```bash
git add src/app/lyrics/page.tsx src/app/lyrics/layout.tsx src/app/lyrics/_components/create-lyrics-dialog.tsx src/app/lyrics/_components/unified-lyrics-list.tsx
git commit -m "feat: unified lyrics list and create dialog"
```

---

### Task 6: View, Edit, Zine pages + cross-nav

**Files:**
- Create: `src/app/lyrics/_components/lyrics-nav.tsx`
- Create: `src/app/lyrics/_components/unified-lyrics-reader.tsx`
- Create: `src/app/lyrics/_components/unified-lyrics-editor.tsx`
- Modify: `src/app/lyrics/[slug]/page.tsx`
- Modify: `src/app/lyrics/[slug]/edit/page.tsx`
- Modify: `src/app/lyrics/[slug]/zine/page.tsx` (zine shell in Task 7 if needed; at least mount nav)

**Interfaces:**
- `LyricsNav({ slug, current: "view" | "edit" | "zine" })` renders three links

- [ ] **Step 1: Implement `LyricsNav`**

```tsx
export function LyricsNav({
	slug,
	current,
}: {
	slug: string;
	current: "view" | "edit" | "zine";
}) {
	const links = [
		{ key: "view", href: `/lyrics/${slug}`, label: "View" },
		{ key: "edit", href: `/lyrics/${slug}/edit`, label: "Edit" },
		{ key: "zine", href: `/lyrics/${slug}/zine`, label: "Zine" },
	] as const;
	// highlight current; always render all three
}
```

- [ ] **Step 2: Reader**

Use `api.lyrics.getBySlug`. Show title, art, tracks. For pending playlist items show muted “Needs Genius URL”. Skip empty lyrics bodies in print-style view or show placeholder.

- [ ] **Step 3: Editor**

Album: list tracks (already ready).  
Playlist: each row — Genius URL input + Attach button; Instrumental; Not on Genius; show state badge.

Wire attach API + mark mutations.

- [ ] **Step 4: Mount nav on view/edit/zine pages**

- [ ] **Step 5: Commit**

```bash
git add src/app/lyrics/_components/lyrics-nav.tsx \
  src/app/lyrics/_components/unified-lyrics-reader.tsx \
  src/app/lyrics/_components/unified-lyrics-editor.tsx \
  src/app/lyrics/[slug]
git commit -m "feat: unified lyrics view edit pages with cross navigation"
```

---

### Task 7: Unified zine adapter + public pages

**Files:**
- Create: `src/app/lyrics/_components/unified-lyrics-zine.tsx`
- Modify: `src/app/lyrics/[slug]/zine/page.tsx`
- Modify: `src/app/public/lyrics/page.tsx`, `[slug]/page.tsx`, `[slug]/zine/page.tsx`

**Interfaces:**
- Map `lyricItems` → `ZineSongDisplayInput` like `album-lyrics-zine.tsx` / `playlist-lyrics-zine.tsx`
- Include items with `sourceState` in `ready` | `instrumental` | `not_on_genius` (instrumental/not_on_genius may have empty lyrics — match existing empty handling)
- Exclude `pending_genius` / `failed` from zine pages (or include with empty lyrics — prefer exclude pending)

- [ ] **Step 1: Implement adapter rendering `<LyricsZine>`**

Reuse persistence callbacks patterned on album zine, but call new `api.lyrics.*` zine mutations. For v1, if full zine mutation parity is too large, support **read-only zine first** (`canEdit` true only when mutation set exists). Minimum: private zine preview works; wire cover/item settings mutations by copying the smallest set from `convex/geniusAlbums.ts` zine updates onto `lyrics` / `lyricItems` ids.

- [ ] **Step 2: Point public pages at `listPublicRecent` / `getPublicBySlug`**

Public playlist: only `status === "ready"`. Add a “Mark ready” control on edit for playlists when you want them public (simple mutation `setLyricsStatus`).

- [ ] **Step 3: Commit**

```bash
git add src/app/lyrics/_components/unified-lyrics-zine.tsx src/app/lyrics/[slug]/zine/page.tsx src/app/public/lyrics convex/lyrics.ts
git commit -m "feat: unified lyrics zine adapter and public pages"
```

---

### Task 8: Mark idea planned + verification

**Files:**
- Modify: `docs/ideas/2026-07-15-unify-lyrics-into-singular-lyric-concept.md`

- [ ] **Step 1: Update idea status**

```yaml
status: planned
```

Notes:

```markdown
- Planned — spec: `docs/superpowers/specs/2026-07-17-unify-lyrics-singular-concept-design.md`, plan: `docs/superpowers/plans/2026-07-17-unify-lyrics-singular-concept.md`
```

- [ ] **Step 2: Run checks**

```bash
pnpm typecheck
pnpm check
pnpm exec tsx --test convex/_utils/lyricsSlug.test.ts convex/lyrics.source.test.ts
```

Manual checklist:
1. Create album with Spotify + Genius → tracks from Genius, art/year from Spotify, `spotifyAlbumId` set  
2. Create playlist from Spotify → pending rows; paste Genius; instrumental; not on Genius  
3. View ↔ Edit ↔ Zine links work on all three pages  
4. `/playlist-lyrics` still loads legacy playlists  
5. Old genius album URLs may 404 on new pages — acceptable per spec  

- [ ] **Step 3: Commit docs**

```bash
git add docs/ideas/2026-07-15-unify-lyrics-into-singular-lyric-concept.md \
  docs/superpowers/specs/2026-07-17-unify-lyrics-singular-concept-design.md \
  docs/superpowers/plans/2026-07-17-unify-lyrics-singular-concept.md
git commit -m "docs: plan unified lyrics singular concept"
```

---

## Self-Review

| Spec requirement | Task |
|------------------|------|
| Unified tables, no migration/redirects | Tasks 1–2, Global Constraints |
| Album Genius SoT + Spotify supplementary + store id | Tasks 2–3 |
| Playlist Spotify SoT + Genius lyrics/credits after paste | Tasks 2–4 |
| Instrumental / not on Genius | Task 4 |
| One list + create | Task 5 |
| View↔Edit↔Zine nav | Task 6 |
| Shared zine adapter | Task 7 |
| Public new-model pages | Task 7 |
| Idea planned | Task 8 |

No placeholders remain beyond copying existing zine field validators from schema (explicit instruction). Types align on `LyricItemSourceState` and route paths.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-17-unify-lyrics-singular-concept.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement in this session with checkpoints  

Which approach?
