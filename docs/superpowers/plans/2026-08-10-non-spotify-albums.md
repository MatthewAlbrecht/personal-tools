# Non-Spotify Albums Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add albums that are not on Spotify to the library, optionally record a listen, and use existing RYM associate flows.

**Architecture:** Keep `spotifyAlbums` as the catalog; add `source` and make `spotifyAlbumId` optional. New `addManualAlbumToLibrary` mutation inserts manuals and projects into `albumLibraryItems`. Extend Add album dialog with Spotify | Manual tabs (shadcn). Listens and RYM continue to key off Convex `albumId`.

**Tech Stack:** Convex, Next.js App Router, React, shadcn/ui (Dialog, Tabs, Checkbox, Input), existing album matching + library projection helpers, node:test + tsx.

**Spec:** `docs/superpowers/specs/2026-08-10-non-spotify-albums-design.md`

## Global Constraints

- Work on **main** in this worktree only (user-directed); do not create a feature branch or new worktree.
- Do **not** invent fake Spotify IDs; manuals have no `spotifyAlbumId`.
- Do **not** create a parallel `manualAlbums` table.
- Do **not** rename `spotifyAlbums` in this plan.
- Duplicate key: `normalizeAlbumTitle(name)` + `normalizeArtistName(artistName)` only (year not part of key).
- Manual required fields: title, artist, year; cover URL optional.
- Optional listen in the same Manual create flow (checkbox + date).
- UI must match existing albums / shadcn patterns; add `tabs` via shadcn CLI if missing.
- Commit only files for this feature; leave unrelated dirty zine/other diffs untouched.
- Classic function declarations; `type` aliases; inline component props per project rules.
- Env via `~/env.js` only when env is needed (likely not for this feature).

## File map

| File | Role |
|------|------|
| `convex/schema.ts` | Optional `spotifyAlbumId`, add `source` on catalog + optional on library |
| `convex/_utils/upsertSpotifyAlbumRecord.ts` | Tag `source: "spotify"` on upsert/insert |
| `convex/_utils/albumLibraryProjection.ts` | Copy optional `spotifyAlbumId` |
| `convex/_utils/manualAlbum.ts` (create) | Duplicate find + insert manual + listen helper |
| `convex/spotify.ts` | `addManualAlbumToLibrary`; listen-by-albumId; set source on Spotify add |
| `convex/spotify.add-manual-album-to-library-source.test.ts` (create) | Source-level tests |
| `src/components/ui/tabs.tsx` | shadcn Tabs |
| `src/app/albums/_components/add-album-to-library-dialog.tsx` | Spotify \| Manual tabs + form |
| `src/app/albums/details/.../album-details-view.tsx` | Guard Spotify link when no ID |
| `docs/ideas/2026-08-10-add-non-spotify-albums-with-listens-and-rym.md` | status → done when shipped |

---

### Task 1: Schema — optional Spotify ID + source

**Files:**
- Modify: `convex/schema.ts` (`spotifyAlbums`, `albumLibraryItems`)
- Test: `convex/spotify.add-manual-album-to-library-source.test.ts` (create; schema string assertions)

**Interfaces:**
- Produces: `spotifyAlbums.source: "spotify" | "manual"`; `spotifyAlbumId` optional on `spotifyAlbums` and `albumLibraryItems`

- [ ] **Step 1: Write failing source test**

Create `convex/spotify.add-manual-album-to-library-source.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "convex/schema.ts"), "utf8");

test("spotifyAlbums declares optional spotifyAlbumId and source union", () => {
	assert.match(schema, /spotifyAlbums:\s*defineTable\(\{[\s\S]*?spotifyAlbumId:\s*v\.optional\(v\.string\(\)\)/);
	assert.match(schema, /source:\s*v\.union\(\s*v\.literal\("spotify"\),\s*v\.literal\("manual"\)\s*\)/);
});

test("albumLibraryItems spotifyAlbumId is optional", () => {
	assert.match(
		schema,
		/albumLibraryItems:\s*defineTable\(\{[\s\S]*?spotifyAlbumId:\s*v\.optional\(v\.string\(\)\)/,
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test convex/spotify.add-manual-album-to-library-source.test.ts`  
Expected: FAIL (required `spotifyAlbumId` / missing `source`)

- [ ] **Step 3: Update schema**

In `spotifyAlbums`:
- `spotifyAlbumId: v.optional(v.string())`
- `source: v.union(v.literal("spotify"), v.literal("manual"))`

In `albumLibraryItems`:
- `spotifyAlbumId: v.optional(v.string())`

Keep indexes as-is (`by_spotifyAlbumId` still valid for optional fields).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test convex/spotify.add-manual-album-to-library-source.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/spotify.add-manual-album-to-library-source.test.ts
git commit -m "$(cat <<'EOF'
feat(albums): allow optional Spotify ID and album source on catalog

EOF
)"
```

---

### Task 2: Tag Spotify upserts with source + optional projection ID

**Files:**
- Modify: `convex/_utils/upsertSpotifyAlbumRecord.ts`
- Modify: `convex/_utils/albumLibraryProjection.ts`
- Modify: `convex/spotify.add-manual-album-to-library-source.test.ts`

**Interfaces:**
- Consumes: schema from Task 1
- Produces: `upsertSpotifyAlbumRecord` always writes `source: "spotify"`; projection sets `spotifyAlbumId: album.spotifyAlbumId` (may be undefined)

- [ ] **Step 1: Extend failing tests**

Append to the test file:

```ts
const upsert = readFileSync(
	join(process.cwd(), "convex/_utils/upsertSpotifyAlbumRecord.ts"),
	"utf8",
);
const projection = readFileSync(
	join(process.cwd(), "convex/_utils/albumLibraryProjection.ts"),
	"utf8",
);

test("upsertSpotifyAlbumRecord sets source spotify on insert and patch", () => {
	assert.match(upsert, /source:\s*"spotify"/);
});

test("album library projection copies optional spotifyAlbumId from album", () => {
	assert.match(projection, /spotifyAlbumId:\s*album\.spotifyAlbumId/);
});
```

- [ ] **Step 2: Run tests — expect fail on source tagging**

Run: `pnpm exec tsx --test convex/spotify.add-manual-album-to-library-source.test.ts`

- [ ] **Step 3: Implement**

In `upsertSpotifyAlbumRecord` patch + insert objects, add `source: "spotify"`.

In `buildAlbumLibraryProjectionForAlbum`, keep `spotifyAlbumId: album.spotifyAlbumId` (TypeScript should accept optional). Fix any type errors from required string assumptions in this file only.

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/upsertSpotifyAlbumRecord.ts convex/_utils/albumLibraryProjection.ts convex/spotify.add-manual-album-to-library-source.test.ts
git commit -m "$(cat <<'EOF'
feat(albums): tag Spotify upserts with source and allow null Spotify IDs in projection

EOF
)"
```

---

### Task 3: Manual album helpers + `addManualAlbumToLibrary` mutation

**Files:**
- Create: `convex/_utils/manualAlbum.ts`
- Modify: `convex/spotify.ts`
- Modify: `convex/spotify.add-manual-album-to-library-source.test.ts`

**Interfaces:**
- Produces:
  - `findAlbumByNormalizedTitleArtist(ctx, { name, artistName }): Promise<Doc<"spotifyAlbums"> | null>`
  - `insertManualAlbum(ctx, args): Promise<Id<"spotifyAlbums">>`
  - `recordManualListenForAlbum(ctx, { userId, albumId, listenedAt }): Promise<{ recorded: boolean; reason?: string }>`
  - `addManualAlbumToLibrary` mutation args/returns per spec

- [ ] **Step 1: Write failing source tests for mutation + helpers**

```ts
const spotify = readFileSync(join(process.cwd(), "convex/spotify.ts"), "utf8");
const manual = readFileSync(
	join(process.cwd(), "convex/_utils/manualAlbum.ts"),
	"utf8",
);

test("addManualAlbumToLibrary mutation exists", () => {
	assert.match(spotify, /export const addManualAlbumToLibrary = mutation\(/);
});

test("manualAlbum helpers cover duplicate find, insert, and listen", () => {
	assert.match(manual, /export async function findAlbumByNormalizedTitleArtist/);
	assert.match(manual, /export async function insertManualAlbum/);
	assert.match(manual, /export async function recordManualListenForAlbum/);
	assert.match(manual, /source:\s*"manual"/);
});
```

- [ ] **Step 2: Run — expect fail (missing files/exports)**

- [ ] **Step 3: Implement `convex/_utils/manualAlbum.ts`**

```ts
// findAlbumByNormalizedTitleArtist: by_albumTitleKey then filter normalizeArtistName
// insertManualAlbum: insert source manual, no spotifyAlbumId, releaseDate = String(year), totalTracks 0, albumTitleKey
// recordManualListenForAlbum: port logic from addManualAlbumListen using albumId directly + refreshForLaterProjectionsForUserAlbum / library refresh as existing listen path does
```

Wire `addManualAlbumToLibrary` in `convex/spotify.ts`:
- Validate year 1000–9999, non-empty name/artist
- Duplicate → upsert library projection; optional listen; return `alreadyExists: true`
- Else insert + project + optional listen
- `returns` validator matching spec fields

Refactor `addManualAlbumListen` to call `recordManualListenForAlbum` after resolving Spotify ID → album (behavior unchanged for Spotify path).

- [ ] **Step 4: Run tests — expect pass; run `pnpm typecheck`**

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/manualAlbum.ts convex/spotify.ts convex/spotify.add-manual-album-to-library-source.test.ts
git commit -m "$(cat <<'EOF'
feat(albums): add manual album to library mutation with optional listen

EOF
)"
```

---

### Task 4: shadcn Tabs + Add album dialog Manual mode

**Files:**
- Create: `src/components/ui/tabs.tsx` (via CLI)
- Modify: `src/app/albums/_components/add-album-to-library-dialog.tsx`

**Interfaces:**
- Consumes: `api.spotify.addManualAlbumToLibrary`
- UI: Tabs Spotify | Manual; Manual form fields per spec

- [ ] **Step 1: Add Tabs component**

Run: `pnpm dlx shadcn@latest add tabs -y`  
(If interactive flags differ, use project’s established non-interactive pattern.)

- [ ] **Step 2: Implement dialog IA**

Update `AddAlbumToLibraryDialog`:
- `Tabs` default value `"spotify"`
- Spotify tab: keep existing paste flow
- Manual tab: Title, Artist, Year (`inputMode="numeric"` maxLength 4), Cover URL optional + img preview when `https?://` URL, Checkbox “Also record a listen”, date input when checked (default today as `YYYY-MM-DD`, convert to ms at local noon or start-of-day consistently)
- Submit calls `addManualAlbumToLibrary`
- Toasts for success / already exists / errors
- On duplicate success that added to library, toast accordingly
- Reset Manual fields when dialog closes
- Match existing dialog spacing/classes; no new visual system

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/tabs.tsx src/app/albums/_components/add-album-to-library-dialog.tsx package.json pnpm-lock.yaml components.json
git commit -m "$(cat <<'EOF'
feat(albums): add Manual tab to Add album dialog for non-Spotify albums

EOF
)"
```

(Only stage lockfile/components.json if the CLI actually changed them.)

---

### Task 5: Guard Spotify chrome for manuals + mark idea done

**Files:**
- Modify: `src/app/albums/details/[albumId]/_components/album-details-view.tsx`
- Modify: `docs/ideas/2026-08-10-add-non-spotify-albums-with-listens-and-rym.md`

- [ ] **Step 1: Guard Spotify URL/ID display**

Only render Open Spotify / Spotify ID when `hero.spotifyAlbumId` (or equivalent) is a non-empty string. Optional small “Manual” badge near title when `source === "manual"` if `source` is available on the details query payload; if details query does not expose `source`, skip badge rather than widening query scope beyond one field.

- [ ] **Step 2: Ensure details/library types allow optional `spotifyAlbumId`**

Update `src/app/albums/_utils/types.ts` if library row types still require `spotifyAlbumId: string`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

- [ ] **Step 4: Update idea status to `done` with short Done notes pointing at spec/plan**

- [ ] **Step 5: Commit**

```bash
git add src/app/albums/details/[albumId]/_components/album-details-view.tsx src/app/albums/_utils/types.ts docs/ideas/2026-08-10-add-non-spotify-albums-with-listens-and-rym.md
git commit -m "$(cat <<'EOF'
feat(albums): hide Spotify actions for manual albums

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Optional Spotify ID + source | 1–2 |
| Manual create mutation | 3 |
| Optional listen | 3–4 |
| Duplicate title+artist | 3 |
| Dialog tabs + Manual form | 4 |
| RYM via existing albumId | satisfied by catalog insert (no new task) |
| Hide Spotify chrome | 5 |
| No fake IDs / no parallel table | Global Constraints |

## Manual verification

1. `/albums/all` → Add album → Manual → fill title/artist/year → Add → row appears.
2. Repeat same title/artist → blocked/reused, no second catalog row.
3. Create with “Also record a listen” → listen count updates.
4. Open RYM associate for that album → link a scrape.
5. Spotify tab still adds by URL.
