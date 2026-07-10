# Smart Playlist Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user create named “playlist recipes” at `/smart-playlists` that resolve album filters (For Later or Rankings), expand to full-album tracks, and keep a Spotify playlist updated via cron / Sync now (mirror or add-only), with Convex as membership source of truth.

**Architecture:** Pure filter/hash/diff helpers in `src/lib/smart-playlists/` (node:test). Convex `smartPlaylists` table + CRUD/resolve/snapshot mutations. Sync orchestration in `src/lib/smart-playlists-sync.ts` (same pattern as for-later cron: refresh token → resolve → Spotify PUT/POST → commit snapshot). UI is recipe cards + a single create/edit form. Track expansion goes through `expandAlbumsToTrackUris` with `trackSelection.mode: "allTracks"` so smarter selection can plug in later.

**Tech Stack:** Next.js 15 App Router, Convex, Spotify Web API (`/me/playlists`, `PUT|POST /playlists/{id}/items`), TypeScript, Biome, `node:test` via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-07-10-smart-playlist-recipes-design.md`

**Note vs spec sketch:** This codebase schedules Spotify work via `src/pages/api/cron/*` + `src/lib/*-sync.ts`, not Convex `crons.ts`. Follow that pattern; keep DB writes in Convex.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/smart-playlists/types.ts` | Shared filter / recipe / trackSelection types |
| Create | `src/lib/smart-playlists/rating-range.ts` | Map tier UI → `ratingMin`/`ratingMax` |
| Create | `src/lib/smart-playlists/rating-range.test.ts` | Tier → rating bounds tests |
| Create | `src/lib/smart-playlists/added-window.ts` | Resolve absolute/relative/calendar added windows → ms range at `now` |
| Create | `src/lib/smart-playlists/added-window.test.ts` | Window resolution tests |
| Create | `src/lib/smart-playlists/content-hash.ts` | Stable hash of ordered track URIs |
| Create | `src/lib/smart-playlists/content-hash.test.ts` | Hash stability / change detection |
| Create | `src/lib/smart-playlists/rule-summary.ts` | Plain-language card summary |
| Create | `src/lib/smart-playlists/rule-summary.test.ts` | Summary string tests |
| Create | `src/lib/smart-playlists/expand-tracks.ts` | `expandAlbumsToTrackUris` (`allTracks` only) |
| Create | `src/lib/smart-playlists/expand-tracks.test.ts` | Expansion + unknown mode error |
| Create | `src/lib/smart-playlists/sync-plan.ts` | Mirror vs add-only URI write plan from desired vs snapshot |
| Create | `src/lib/smart-playlists/sync-plan.test.ts` | Diff/plan tests |
| Create | `src/lib/smart-playlists-sync.ts` | Orchestrate resolve → expand → Spotify → Convex commit |
| Create | `convex/_utils/smartPlaylistValidators.ts` | Convex `v` validators mirroring types |
| Modify | `convex/schema.ts` | Add `smartPlaylists` table |
| Create | `convex/smartPlaylists.ts` | CRUD, list, preview, resolve matches, snapshot commit, list active for cron |
| Modify | `src/lib/spotify.ts` | `replacePlaylistItems`, `unfollowPlaylist`; prefer `/items` for new helpers |
| Create | `src/pages/api/cron/sync-smart-playlists.ts` | Cron: auth → sync all active recipes for user |
| Create | `src/app/api/smart-playlists/sync/route.ts` | Sync now (one recipe) |
| Create | `src/app/api/smart-playlists/create/route.ts` | Create Spotify playlist + insert recipe |
| Create | `src/app/smart-playlists/page.tsx` | List page |
| Create | `src/app/smart-playlists/_components/recipe-card.tsx` | Card UI |
| Create | `src/app/smart-playlists/_components/recipe-form.tsx` | Create/edit form + live preview |
| Create | `src/app/smart-playlists/_components/recipe-list.tsx` | List / empty state |
| Modify | `src/app/_components/site-header.tsx` | Nav link |
| Modify | `src/app/page.tsx` | Home tool link (if other tools are listed there) |

---

### Task 1: Rating range + added-window helpers (TDD)

**Files:**
- Create: `src/lib/smart-playlists/types.ts`
- Create: `src/lib/smart-playlists/rating-range.ts`
- Create: `src/lib/smart-playlists/rating-range.test.ts`
- Create: `src/lib/smart-playlists/added-window.ts`
- Create: `src/lib/smart-playlists/added-window.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/smart-playlists/rating-range.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { ratingBoundsFromSelection } from "./rating-range";

test("Holy Moly maps to 13-15", () => {
	assert.deepEqual(ratingBoundsFromSelection({ tier: "Holy Moly" }), {
		ratingMin: 13,
		ratingMax: 15,
	});
});

test("Holy Moly High maps to 15-15", () => {
	assert.deepEqual(
		ratingBoundsFromSelection({ tier: "Holy Moly", subTier: "High" }),
		{ ratingMin: 15, ratingMax: 15 },
	);
});

test("Really Enjoyed or above uses min 10 and no max", () => {
	assert.deepEqual(
		ratingBoundsFromSelection({ minTier: "Really Enjoyed" }),
		{ ratingMin: 10, ratingMax: undefined },
	);
});
```

```typescript
// src/lib/smart-playlists/added-window.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveAddedWindow } from "./added-window";

const now = Date.UTC(2026, 6, 10, 12, 0, 0); // Jul 10 2026

test("calendar month May 2026", () => {
	const range = resolveAddedWindow(
		{ type: "calendar_month", year: 2026, month: 5 },
		now,
	);
	assert.equal(range?.afterMs, Date.UTC(2026, 4, 1, 0, 0, 0));
	assert.equal(range?.beforeMs, Date.UTC(2026, 5, 1, 0, 0, 0));
});

test("relative last 30 days", () => {
	const range = resolveAddedWindow(
		{ type: "relative", unit: "days", amount: 30 },
		now,
	);
	assert.equal(range?.afterMs, now - 30 * 24 * 60 * 60 * 1000);
	assert.equal(range?.beforeMs, undefined);
});

test("absolute passthrough", () => {
	const range = resolveAddedWindow(
		{ type: "absolute", afterMs: 100, beforeMs: 200 },
		now,
	);
	assert.deepEqual(range, { afterMs: 100, beforeMs: 200 });
});
```

- [ ] **Step 2: Run tests — expect FAIL (modules missing)**

Run: `npx tsx --test src/lib/smart-playlists/rating-range.test.ts src/lib/smart-playlists/added-window.test.ts`

- [ ] **Step 3: Implement types + helpers**

```typescript
// src/lib/smart-playlists/types.ts
import type { SubTier, TierName } from "~/lib/album-tiers";

export type SmartPlaylistSource = "forLater" | "rankings";
export type SmartPlaylistSyncMode = "mirror" | "addOnly";

export type TrackSelection = {
	mode: "allTracks";
};

export type AddedWindow =
	| { type: "absolute"; afterMs?: number; beforeMs?: number }
	| { type: "relative"; unit: "days" | "months"; amount: number }
	| { type: "calendar_month"; year: number; month: number }; // month 1-12

export type SmartPlaylistFilters = {
	genreKeys: string[];
	genreMatch: "all" | "any";
	/** When true, genre keys must appear in primaryGenres only */
	primaryGenresOnly: boolean;
	descriptorKeys: string[];
	descriptorMatch: "all" | "any";
	ratingMin?: number;
	ratingMax?: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationBucketKey?: string;
	/** For Later only; evaluated at resolve/sync time */
	addedWindow?: AddedWindow;
};

export type RatingSelection =
	| { tier: TierName; subTier?: SubTier }
	| { minTier: TierName };
```

Implement `ratingBoundsFromSelection` using `getRatingsForTier` from `~/lib/album-tiers` (tier Low = min of that tier; `minTier` → that tier’s Low as `ratingMin`, no max).

Implement `resolveAddedWindow(window, now): { afterMs?: number; beforeMs?: number } | null` — `calendar_month` uses UTC month start/end; `relative` months ≈ `amount * 30` days for v1 (document in comment) or use calendar month math if simple.

- [ ] **Step 4: Re-run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/smart-playlists/
git commit -m "$(cat <<'EOF'
feat(smart-playlists): add rating and added-window helpers

EOF
)"
```

---

### Task 2: Content hash, rule summary, expand-tracks, sync-plan (TDD)

**Files:**
- Create: `src/lib/smart-playlists/content-hash.ts`
- Create: `src/lib/smart-playlists/content-hash.test.ts`
- Create: `src/lib/smart-playlists/rule-summary.ts`
- Create: `src/lib/smart-playlists/rule-summary.test.ts`
- Create: `src/lib/smart-playlists/expand-tracks.ts`
- Create: `src/lib/smart-playlists/expand-tracks.test.ts`
- Create: `src/lib/smart-playlists/sync-plan.ts`
- Create: `src/lib/smart-playlists/sync-plan.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// content-hash.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { hashTrackUris } from "./content-hash";

test("same ordered uris → same hash", () => {
	assert.equal(
		hashTrackUris(["spotify:track:a", "spotify:track:b"]),
		hashTrackUris(["spotify:track:a", "spotify:track:b"]),
	);
});

test("order change → different hash", () => {
	assert.notEqual(
		hashTrackUris(["spotify:track:a", "spotify:track:b"]),
		hashTrackUris(["spotify:track:b", "spotify:track:a"]),
	);
});
```

```typescript
// rule-summary.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { formatRuleSummary } from "./rule-summary";

test("for later folk primary under 30m", () => {
	const s = formatRuleSummary({
		source: "forLater",
		filters: {
			genreKeys: ["folk"],
			genreMatch: "any",
			primaryGenresOnly: true,
			descriptorKeys: [],
			descriptorMatch: "any",
			durationMaxMinutes: 30,
		},
		genreLabels: { folk: "Folk" },
	});
	assert.match(s, /For Later/);
	assert.match(s, /Folk/);
	assert.match(s, /primary/i);
	assert.match(s, /30/);
});
```

```typescript
// expand-tracks.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { expandAlbumsToTrackUris } from "./expand-tracks";

test("allTracks concatenates album track uris in order", () => {
	const uris = expandAlbumsToTrackUris(
		[
			{ albumId: "a1", trackUris: ["spotify:track:1", "spotify:track:2"] },
			{ albumId: "a2", trackUris: ["spotify:track:3"] },
		],
		{ mode: "allTracks" },
	);
	assert.deepEqual(uris, [
		"spotify:track:1",
		"spotify:track:2",
		"spotify:track:3",
	]);
});
```

```typescript
// sync-plan.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { planPlaylistSync } from "./sync-plan";

test("mirror unchanged → skip", () => {
	const plan = planPlaylistSync({
		syncMode: "mirror",
		desiredUris: ["spotify:track:a"],
		syncedUris: ["spotify:track:a"],
		desiredAlbumIds: ["alb1"],
		syncedAlbumIds: ["alb1"],
	});
	assert.equal(plan.action, "skip");
});

test("mirror changed → replaceAll with desired", () => {
	const plan = planPlaylistSync({
		syncMode: "mirror",
		desiredUris: ["spotify:track:a", "spotify:track:b"],
		syncedUris: ["spotify:track:a"],
		desiredAlbumIds: ["alb1"],
		syncedAlbumIds: ["alb1"],
	});
	assert.equal(plan.action, "replaceAll");
	if (plan.action === "replaceAll") {
		assert.deepEqual(plan.uris, ["spotify:track:a", "spotify:track:b"]);
	}
});

test("addOnly only posts new album tracks", () => {
	const plan = planPlaylistSync({
		syncMode: "addOnly",
		desiredUris: ["spotify:track:a", "spotify:track:b", "spotify:track:c"],
		syncedUris: ["spotify:track:a"],
		desiredAlbumIds: ["alb1", "alb2"],
		syncedAlbumIds: ["alb1"],
		desiredAlbumTrackUris: {
			alb1: ["spotify:track:a"],
			alb2: ["spotify:track:b", "spotify:track:c"],
		},
	});
	assert.equal(plan.action, "append");
	if (plan.action === "append") {
		assert.deepEqual(plan.uris, ["spotify:track:b", "spotify:track:c"]);
		assert.deepEqual(plan.nextSyncedAlbumIds, ["alb1", "alb2"]);
	}
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx tsx --test src/lib/smart-playlists/*.test.ts`

- [ ] **Step 3: Implement**

- `hashTrackUris`: use `node:crypto` `createHash("sha256").update(uris.join("\n")).digest("hex")` (this module is used from Next/Node sync, not Convex queries).
- `formatRuleSummary`: build `Source · Genre… · rating · year · duration · added` segments; skip empty.
- `expandAlbumsToTrackUris(albums, trackSelection)`: only `allTracks`; throw on unknown mode.
- `planPlaylistSync`: return discriminated union `{ action: "skip" } | { action: "replaceAll"; uris } | { action: "append"; uris; nextSyncedAlbumIds; nextSyncedUris }`. For add-only, append tracks for albums in `desiredAlbumIds` not in `syncedAlbumIds` (use `desiredAlbumTrackUris`). Empty desired + mirror → `replaceAll` with `uris: []`.

- [ ] **Step 4: Re-run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/smart-playlists/
git commit -m "$(cat <<'EOF'
feat(smart-playlists): add hash, summary, expand, and sync-plan helpers

EOF
)"
```

---

### Task 3: Schema + Convex validators

**Files:**
- Create: `convex/_utils/smartPlaylistValidators.ts`
- Modify: `convex/schema.ts` (append `smartPlaylists` table near other Spotify tables)

- [ ] **Step 1: Add validators**

Mirror `SmartPlaylistFilters` / `AddedWindow` / `TrackSelection` / `source` / `syncMode` with `v.object` / `v.union` / `v.literal`. Export `smartPlaylistFiltersValidator`, `trackSelectionValidator`, etc.

- [ ] **Step 2: Add table to schema**

```typescript
smartPlaylists: defineTable({
  userId: v.string(),
  name: v.string(),
  spotifyPlaylistId: v.string(),
  source: v.union(v.literal("forLater"), v.literal("rankings")),
  filters: smartPlaylistFiltersValidator, // or inline same shape
  syncMode: v.union(v.literal("mirror"), v.literal("addOnly")),
  trackSelection: v.object({ mode: v.literal("allTracks") }),
  isPaused: v.boolean(),
  syncedAlbumIds: v.array(v.string()), // spotifyAlbumId strings for portability
  syncedTrackUris: v.array(v.string()),
  contentHash: v.optional(v.string()),
  matchAlbumCount: v.number(),
  matchTrackCount: v.number(),
  lastSyncedAt: v.optional(v.number()),
  syncStatus: v.union(
    v.literal("never"),
    v.literal("ok"),
    v.literal("error"),
  ),
  lastError: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_and_isPaused", ["userId", "isPaused"]),
```

Import validators into schema file the same way other shared validators are imported, or inline if the project prefers schema self-contained — match existing `convex/schema.ts` style.

- [ ] **Step 3: Ensure Convex picks up schema**

Run: `npx convex codegen` (or rely on running `npx convex dev`). Confirm no schema errors.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_utils/smartPlaylistValidators.ts
git commit -m "$(cat <<'EOF'
feat(smart-playlists): add smartPlaylists schema and validators

EOF
)"
```

---

### Task 4: Convex resolve + CRUD + snapshot

**Files:**
- Create: `convex/smartPlaylists.ts`

- [ ] **Step 1: Implement resolve helpers (internal)**

`resolveMatchingAlbums(ctx, { userId, source, filters, now })` returns ordered:

```typescript
type MatchedAlbum = {
  spotifyAlbumId: string;
  albumId: Id<"spotifyAlbums">;
  name: string;
  artistName: string;
  // optional for preview
};
```

**For Later path:**
- Load active `forLaterAlbumItems` for `userId` (`isActive === true`) via existing index.
- Apply filters in TypeScript (same spirit as for-later UI / recommendation filters):
  - genres / descriptors / year / duration / durationBucketKey using denormalized `filter*` + `primaryGenres` / `secondaryGenres` fields on the item
  - `primaryGenresOnly`: only check `primaryGenres`
  - `ratingMin`/`ratingMax`: join `userAlbums` by `albumId` (or skip albums without rating when bounds set)
  - `addedWindow`: `resolveAddedWindow` logic duplicated in Convex `_utils` **or** pass pre-resolved `{ afterMs, beforeMs }` from the action/sync layer so Convex stays free of `Date.now()` in queries — **prefer:** resolve window in the sync/API layer and pass `addedAfterMs`/`addedBeforeMs` into the query/mutation args. For preview query, client passes `now`.
- Sort by `playlistAddedAt` desc (fallback `firstSeenAt` / `createdAt`).

**Rankings path:**
- Query `albumLibraryItems` for `userId` where `rating` is defined (collect + filter in TS; personal scale is fine).
- Apply `ratingMin`/`ratingMax`, year, genres (`primaryGenresOnly`), descriptors, duration via join to `spotifyAlbums.totalDurationMs` when needed.
- Ignore `addedWindow` for rankings (or reject if set).
- Sort by rating desc, then `position` if available from `userAlbums`, then name.

Do **not** use `Date.now()` inside `query` handlers — take `now: v.number()` for preview.

- [ ] **Step 2: Public API**

- `listRecipes` — query by `userId`, return card fields + `formatRuleSummary` can be client-side; return raw filters + source.
- `getRecipe` — by id, ownership check via `userId` arg (match existing app auth pattern: pass `userId` from client like for-later).
- `previewMatches` — args: `userId`, `source`, `filters`, `now` → `{ albums: MatchedAlbum[]; albumCount: number }` (track count estimated later or 0 until expand).
- `insertRecipe` — mutation after Spotify playlist created (args include `spotifyPlaylistId`).
- `updateRecipe` — name, filters, syncMode, isPaused; **do not** allow changing `source` or `spotifyPlaylistId`.
- `setPaused`, `removeRecipe` — delete Convex row (Spotify unfollow handled by API).
- `commitSyncSuccess` / `commitSyncFailure` — internalMutation or public mutation called only from sync lib with userId ownership:
  - success: set `syncedAlbumIds`, `syncedTrackUris`, `contentHash`, counts, `lastSyncedAt`, `syncStatus: "ok"`, clear `lastError`
  - failure: `syncStatus: "error"`, `lastError` (do not advance snapshot / `lastSyncedAt`)
- `listActiveRecipesForUser` — `isPaused === false` for cron.

Follow project auth pattern used by `forLaterAlbums` (explicit `userId` args). Add `returns` validators on public functions.

- [ ] **Step 3: Manual typecheck**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add convex/smartPlaylists.ts convex/_utils/
git commit -m "$(cat <<'EOF'
feat(smart-playlists): add Convex CRUD and album resolve

EOF
)"
```

---

### Task 5: Spotify replace/unfollow helpers

**Files:**
- Modify: `src/lib/spotify.ts`

- [ ] **Step 1: Add helpers**

```typescript
export async function replacePlaylistItems(
  accessToken: string,
  playlistId: string,
  trackUris: string[],
): Promise<{ snapshot_id: string }> {
  // Max 100 per Spotify docs
  return spotifyFetch<{ snapshot_id: string }>(
    `/playlists/${playlistId}/items`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ uris: trackUris }),
    },
  );
}

export async function addItemsToPlaylist(
  accessToken: string,
  playlistId: string,
  trackUris: string[],
): Promise<{ snapshot_id: string }> {
  return spotifyFetch<{ snapshot_id: string }>(
    `/playlists/${playlistId}/items`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ uris: trackUris }),
    },
  );
}

export async function unfollowPlaylist(
  accessToken: string,
  playlistId: string,
): Promise<void> {
  await spotifyFetch<void>(
    `/playlists/${playlistId}/followers`,
    accessToken,
    { method: "DELETE" },
  );
}
```

Keep existing `addTracksToPlaylist` working for other features (still `/tracks` if needed); new smart-playlist sync should use `/items` helpers.

Also add `getAlbumTrackUris(accessToken, spotifyAlbumId): Promise<string[]>` that pages `GET /albums/{id}/tracks` (limit 50) and maps `trackToUri(id)`.

- [ ] **Step 2: Commit**

```bash
git add src/lib/spotify.ts
git commit -m "$(cat <<'EOF'
feat(spotify): add playlist items replace/add and unfollow helpers

EOF
)"
```

---

### Task 6: Sync orchestration + track URI loading

**Files:**
- Create: `src/lib/smart-playlists-sync.ts`

- [ ] **Step 1: Implement `syncSmartPlaylistRecipe` and `syncAllSmartPlaylistsForUser`**

Flow for one recipe:

1. Load recipe from Convex (`getRecipe`).
2. `now = Date.now()`; resolve added window → pass into Convex `resolveMatchingAlbums` (query or internal via http client).
3. For each matched album, load track URIs:
   - Prefer `spotifyTracksCanonical` via a Convex query `listCanonicalTrackUrisByAlbum(spotifyAlbumId)` if enough tracks (`totalTracks` match); else `getAlbumTrackUris(accessToken, spotifyAlbumId)`.
4. `desiredUris = expandAlbumsToTrackUris(..., trackSelection)`.
5. `contentHash = hashTrackUris(desiredUris)`.
6. `plan = planPlaylistSync(...)`.
7. If `skip`: optionally still `commitSyncSuccess` with same snapshot + updated counts/hash/timestamp **or** only bump `updatedAt` — prefer commit success with identical snapshot so `lastSyncedAt` reflects check.
8. If `replaceAll`: chunk — `replacePlaylistItems` with first ≤100 (or `[]` to clear); then `addItemsToPlaylist` for remaining chunks of 100.
9. If `append`: `addItemsToPlaylist` in chunks of 100.
10. On success → `commitSyncSuccess`. On throw → `commitSyncFailure` with message; rethrow or return `{ success: false }`.

`syncAllSmartPlaylistsForUser({ accessToken, userId })`: list active recipes; sync sequentially; return per-recipe results.

Use `ConvexHttpClient` + `api.smartPlaylists.*` like `src/lib/for-later-albums-sync.ts`.

- [ ] **Step 2: Smoke-test mentally against >100 tracks and empty mirror**

- [ ] **Step 3: Commit**

```bash
git add src/lib/smart-playlists-sync.ts
git commit -m "$(cat <<'EOF'
feat(smart-playlists): add Spotify sync orchestration

EOF
)"
```

---

### Task 7: Cron + Sync now + Create API routes

**Files:**
- Create: `src/pages/api/cron/sync-smart-playlists.ts`
- Create: `src/app/api/smart-playlists/sync/route.ts`
- Create: `src/app/api/smart-playlists/create/route.ts`

- [ ] **Step 1: Cron** — copy auth/token-refresh pattern from `src/pages/api/cron/sync-for-later-albums.ts`; call `syncAllSmartPlaylistsForUser`.

- [ ] **Step 2: Sync now** — App Router `POST` with `Authorization: Bearer` session or `X-Access-Token` + body `{ recipeId, userId }`. Refresh token if needed; call `syncSmartPlaylistRecipe`. Allow even if `isPaused` (per spec).

- [ ] **Step 3: Create** — body `{ userId, name, source, filters, syncMode }`. `createPlaylist(accessToken, userId, name, description)` then `insertRecipe` with empty snapshot, `syncStatus: "never"`. Optionally kick off first sync inline or let client call Sync now — **do first sync inline** so the playlist isn’t empty after create.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/cron/sync-smart-playlists.ts src/app/api/smart-playlists/
git commit -m "$(cat <<'EOF'
feat(smart-playlists): add cron, sync-now, and create API routes

EOF
)"
```

---

### Task 8: UI — list + cards + nav

**Files:**
- Create: `src/app/smart-playlists/page.tsx`
- Create: `src/app/smart-playlists/_components/recipe-list.tsx`
- Create: `src/app/smart-playlists/_components/recipe-card.tsx`
- Modify: `src/app/_components/site-header.tsx`
- Modify: `src/app/page.tsx` (add link alongside For Later if present)

- [ ] **Step 1: Page** — `'use client'`; require auth like for-later; `useQuery(api.smartPlaylists.listRecipes, { userId })`; empty state + “New recipe” → `/smart-playlists/new` or open form drawer.

- [ ] **Step 2: Card** — name, `formatRuleSummary`, Mirror/Add only badge, counts, last sync / error, buttons: Open Spotify (`https://open.spotify.com/playlist/{id}`), Sync now (`fetch /api/smart-playlists/sync`), Edit, Pause toggle, Delete (confirm: keep vs unfollow Spotify — call unfollow when requested then `removeRecipe`).

- [ ] **Step 3: Nav** — add “Smart Playlists” link next to For Later in `site-header.tsx` (auth-only).

- [ ] **Step 4: Commit**

```bash
git add src/app/smart-playlists/ src/app/_components/site-header.tsx src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(smart-playlists): add recipe list UI and nav link

EOF
)"
```

---

### Task 9: UI — create/edit form + preview

**Files:**
- Create: `src/app/smart-playlists/new/page.tsx` and/or edit route `src/app/smart-playlists/[id]/edit/page.tsx`
- Create: `src/app/smart-playlists/_components/recipe-form.tsx`

- [ ] **Step 1: Form fields**

- Name (text)
- Source: For Later | Rankings (disabled when editing)
- Filters: reuse combobox/button patterns from `src/app/for-later-albums/_components/for-later-filters.tsx` where practical (genres, descriptors, year, duration). Add rating controls (tier / sub-tier / “or above”) that write `ratingMin`/`ratingMax` via `ratingBoundsFromSelection`. Add added-window controls only when source is For Later (calendar month + relative last N days/months).
- Sync mode: Mirror | Add only
- Live preview: `useQuery(api.smartPlaylists.previewMatches, { userId, source, filters, now: Date.now() })` — show album count + short list (pass `now` from render; acceptable for personal tool; or refresh `now` on filter change).

- [ ] **Step 2: Submit**

- Create → `POST /api/smart-playlists/create` with access token header.
- Edit → `updateRecipe` mutation; toast; optional “Sync now”.

- [ ] **Step 3: Manual UI pass** — create a For Later folk recipe and a Rankings Holy Moly recipe; confirm cards + Spotify playlist.

- [ ] **Step 4: Commit**

```bash
git add src/app/smart-playlists/
git commit -m "$(cat <<'EOF'
feat(smart-playlists): add create/edit recipe form with live preview

EOF
)"
```

---

### Task 10: Verification checklist + typecheck/lint

- [ ] **Step 1: Run** `pnpm typecheck` and `pnpm check` — fix issues in touched files.

- [ ] **Step 2: Manual verification (from spec)**

- [ ] For Later recipe → Spotify has full album tracks for matches  
- [ ] Rankings Holy Moly recipe → updates when rating changes (mirror removes; add-only keeps)  
- [ ] Unchanged recipe → second sync skips Spotify writes (`action: skip` / same hash)  
- [ ] Paused → cron skips; Sync now still works  
- [ ] >100 tracks → PUT + POST chunking  
- [ ] Empty mirror → clears playlist  

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(smart-playlists): address typecheck and sync edge cases

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| `/smart-playlists` recipe cards | 8 |
| Create/edit filter builder, source-first, sync mode | 9 |
| Mirror vs add-only | 2, 6 |
| Convex snapshot source of truth; no GET playlist | 4, 6 |
| PUT first 100 + POST remainder | 5, 6 |
| Cron + Sync now (works while paused) | 7 |
| `trackSelection.allTracks` extension point | 2, 3 |
| Rankings stay current on tier moves | 4, 6 |
| Added timeframe / rating / genre / duration filters | 1, 4, 9 |
| Error status on card | 4, 6, 8 |
| Nav entry | 8 |

No TBD placeholders left. Relative “months” approximation documented in Task 1. Sync uses Next cron pattern consistent with for-later (intentional deviation from Convex-cron sketch in spec).
