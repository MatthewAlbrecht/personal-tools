# Album Library For-Later Membership + Smart Playlist Genres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Denormalize for-later membership onto `albumLibraryItems` and drive smart playlist For Later genre matching from that library projection so preview counts match the For Later list.

**Architecture:** Add `appearsInForLater` to the per-user library projection (mirror of `appearsInRobRankings`). Refresh it from every for-later visibility mutation. Rewrite `resolveForLaterMatches` to load library rows with that flag and match genres from `primaryGenres` / `secondaryGenres` (same as rankings). Join for-later items only for `addedWindow` timestamps. Remove any scrape-link genre fallback.

**Tech Stack:** Convex, TypeScript, Biome, `node:test` via `npx tsx --test`

**Spec:** `docs/superpowers/specs/2026-07-19-album-library-for-later-query-model-design.md`

## Global Constraints

- Phase **1 only** — no library-scoped genre facets, no AI cover/occasion list filters, no For Later UI rewrite.
- `appearsInForLater === true` iff for-later item exists with `isActive === true`, `markedAsSingle !== true`, `removedFromForLater !== true`.
- Smart playlist forLater genres come from **`albumLibraryItems.primaryGenres` / `secondaryGenres`**, not live scrapes and not `forLaterAlbumItems.rymScrapeId`.
- `addedWindow` joins for-later timestamps only; do **not** denorm `forLaterAddedAt` in phase 1.
- Duration continues from `spotifyAlbums.totalDurationMs`.
- Rankings smart playlist path stays unchanged.
- Stay on the current branch/worktree (no new worktree).
- Classic function declarations; `type` aliases; kebab-case files.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `convex/_utils/albumLibraryForLaterMembership.ts` | Pure `computeAppearsInForLater(item)` |
| Create | `convex/_utils/albumLibraryForLaterMembership.test.ts` | Membership predicate tests |
| Modify | `convex/schema.ts` | `appearsInForLater` + index on `albumLibraryItems` |
| Modify | `convex/_utils/albumLibraryProjection.ts` | Load for-later item; set `appearsInForLater` |
| Modify | `convex/_utils/albumLibraryProjection.test.ts` | Source/unit coverage for membership wiring if needed |
| Modify | `convex/forLaterAlbums.ts` | Refresh library on soft-delete / deactivate; backfill mutation |
| Create | `convex/forLaterAlbums.library-membership-source.test.ts` | Source contracts for sync + backfill |
| Modify | `convex/smartPlaylists.ts` | Library-driven `resolveForLaterMatches`; remove scrape fallback |
| Replace | `convex/smartPlaylists.for-later-genre-source.test.ts` | Assert library path, not scrape links |
| Modify | `convex/spotify.ts` | Any validators/types that list library row fields must include `appearsInForLater` if they mirror the schema |

---

### Task 1: Pure membership helper (TDD)

**Files:**
- Create: `convex/_utils/albumLibraryForLaterMembership.ts`
- Create: `convex/_utils/albumLibraryForLaterMembership.test.ts`

**Interfaces:**
- Produces: `computeAppearsInForLater(item: { isActive: boolean; markedAsSingle?: boolean; removedFromForLater?: boolean } | null | undefined): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
// convex/_utils/albumLibraryForLaterMembership.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { computeAppearsInForLater } from "./albumLibraryForLaterMembership";

test("null/undefined item is not in for later", () => {
	assert.equal(computeAppearsInForLater(null), false);
	assert.equal(computeAppearsInForLater(undefined), false);
});

test("active item without soft-delete flags is in for later", () => {
	assert.equal(
		computeAppearsInForLater({ isActive: true }),
		true,
	);
});

test("inactive item is not in for later", () => {
	assert.equal(
		computeAppearsInForLater({ isActive: false }),
		false,
	);
});

test("marked as single is not in for later", () => {
	assert.equal(
		computeAppearsInForLater({
			isActive: true,
			markedAsSingle: true,
		}),
		false,
	);
});

test("removed from for later is not in for later", () => {
	assert.equal(
		computeAppearsInForLater({
			isActive: true,
			removedFromForLater: true,
		}),
		false,
	);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx tsx --test convex/_utils/albumLibraryForLaterMembership.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement helper**

```typescript
// convex/_utils/albumLibraryForLaterMembership.ts
export function computeAppearsInForLater(
	item:
		| {
				isActive: boolean;
				markedAsSingle?: boolean;
				removedFromForLater?: boolean;
		  }
		| null
		| undefined,
): boolean {
	if (!item) {
		return false;
	}
	if (item.isActive !== true) {
		return false;
	}
	if (item.markedAsSingle === true) {
		return false;
	}
	if (item.removedFromForLater === true) {
		return false;
	}
	return true;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx tsx --test convex/_utils/albumLibraryForLaterMembership.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/albumLibraryForLaterMembership.ts convex/_utils/albumLibraryForLaterMembership.test.ts
git commit -m "$(cat <<'EOF'
feat(library): add appearsInForLater membership helper

EOF
)"
```

---

### Task 2: Schema + projection build

**Files:**
- Modify: `convex/schema.ts` (`albumLibraryItems`)
- Modify: `convex/_utils/albumLibraryProjection.ts`
- Modify: `convex/spotify.ts` (only if library row validators/types enumerate fields)

**Interfaces:**
- Consumes: `computeAppearsInForLater`
- Produces: `albumLibraryItems.appearsInForLater: boolean`; index `by_userId_appearsInForLater_createdAt`

- [ ] **Step 1: Write a failing source test for projection wiring**

Append to `convex/_utils/albumLibraryProjection.test.ts` (or create `convex/album-library-for-later-membership-source.test.ts`):

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectionSource = readFileSync(
	join(process.cwd(), "convex", "_utils", "albumLibraryProjection.ts"),
	"utf8",
);
const schemaSource = readFileSync(
	join(process.cwd(), "convex", "schema.ts"),
	"utf8",
);

test("schema defines appearsInForLater on albumLibraryItems", () => {
	assert.match(schemaSource, /appearsInForLater:\s*v\.boolean\(\)/);
	assert.match(
		schemaSource,
		/by_userId_appearsInForLater_createdAt/,
	);
});

test("projection build sets appearsInForLater via membership helper", () => {
	assert.match(projectionSource, /computeAppearsInForLater/);
	assert.match(projectionSource, /appearsInForLater:/);
	assert.match(projectionSource, /forLaterAlbumItems/);
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx tsx --test convex/album-library-for-later-membership-source.test.ts`  
Expected: FAIL on schema/projection assertions

- [ ] **Step 3: Update schema**

In `albumLibraryItems`, next to `appearsInRobRankings`:

```typescript
appearsInForLater: v.boolean(),
appearsInRobRankings: v.boolean(),
```

Add index (near the Rob rankings index):

```typescript
.index("by_userId_appearsInForLater_createdAt", [
	"userId",
	"appearsInForLater",
	"createdAt",
]),
```

Do **not** add to search `filterFields` in phase 1.

- [ ] **Step 4: Update `buildAlbumLibraryProjectionForAlbum`**

Import helper. After loading userAlbum / before return, load for-later item:

```typescript
const forLaterItem = await ctx.db
	.query("forLaterAlbumItems")
	.withIndex("by_userId_albumId", (q) =>
		q.eq("userId", args.userId).eq("albumId", args.albumId),
	)
	.first();

const appearsInForLater = computeAppearsInForLater(forLaterItem);
```

Include `appearsInForLater` on the returned projection object next to `appearsInRobRankings`.

- [ ] **Step 5: Fix any TypeScript / validators**

If `convex/spotify.ts` has an explicit library row validator listing every field, add `appearsInForLater: v.boolean()`. Grep for `appearsInRobRankings` and update siblings.

- [ ] **Step 6: Run source test + typecheck**

Run:

```bash
npx tsx --test convex/album-library-for-later-membership-source.test.ts
pnpm typecheck
```

Expected: PASS (typecheck may still fail until backfill/deploy if generated types lag — run `npx convex codegen` / ensure `convex dev` has picked up schema).

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/_utils/albumLibraryProjection.ts convex/album-library-for-later-membership-source.test.ts convex/spotify.ts
git commit -m "$(cat <<'EOF'
feat(library): denorm appearsInForLater on albumLibraryItems

EOF
)"
```

---

### Task 3: Sync funnel on for-later visibility mutations

**Files:**
- Modify: `convex/forLaterAlbums.ts`
- Create: `convex/forLaterAlbums.library-membership-source.test.ts`

**Interfaces:**
- Consumes: `upsertAlbumLibraryProjection(ctx, { userId, albumId })`
- Produces: soft-delete / deactivate paths refresh library membership

- [ ] **Step 1: Write failing source tests**

```typescript
// convex/forLaterAlbums.library-membership-source.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "forLaterAlbums.ts"),
	"utf8",
);

function sliceHandler(exportName: string): string {
	const start = source.indexOf(`export const ${exportName}`);
	assert.ok(start >= 0, `${exportName} must exist`);
	const next = source.indexOf("\nexport const ", start + 1);
	return source.slice(start, next === -1 ? undefined : next);
}

test("setForLaterAlbumMarkedAsSingle refreshes library projection", () => {
	const body = sliceHandler("setForLaterAlbumMarkedAsSingle");
	assert.match(body, /upsertAlbumLibraryProjection/);
});

test("setForLaterAlbumRemovedFromForLater refreshes library projection", () => {
	const body = sliceHandler("setForLaterAlbumRemovedFromForLater");
	assert.match(body, /upsertAlbumLibraryProjection/);
});

test("markForLaterAlbumsRemoved refreshes library projection per removed item", () => {
	const body = sliceHandler("markForLaterAlbumsRemoved");
	assert.match(body, /upsertAlbumLibraryProjection/);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx tsx --test convex/forLaterAlbums.library-membership-source.test.ts`  
Expected: FAIL (soft-delete handlers lack library upsert)

- [ ] **Step 3: Wire refreshes**

In `setForLaterAlbumMarkedAsSingle` and `setForLaterAlbumRemovedFromForLater`, after patch + filter projection sync:

```typescript
await upsertAlbumLibraryProjection(ctx, {
	userId: args.userId,
	albumId: item.albumId,
});
```

In `markForLaterAlbumsRemoved`, inside the loop after patching each removed item:

```typescript
await upsertAlbumLibraryProjection(ctx, {
	userId: args.userId,
	albumId: item.albumId,
});
```

Confirm upsert path already calls `upsertAlbumLibraryProjection` (existing test). Do not remove that call.

- [ ] **Step 4: Run — expect PASS**

Run: `npx tsx --test convex/forLaterAlbums.library-membership-source.test.ts convex/forLaterAlbums.matching-source.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/forLaterAlbums.ts convex/forLaterAlbums.library-membership-source.test.ts
git commit -m "$(cat <<'EOF'
fix(for-later): refresh library appearsInForLater on visibility changes

EOF
)"
```

---

### Task 4: Backfill mutation

**Files:**
- Modify: `convex/forLaterAlbums.ts`
- Modify: `convex/forLaterAlbums.library-membership-source.test.ts`

**Interfaces:**
- Produces: `backfillMyAppearsInForLater` mutation — re-upserts all `albumLibraryItems` for `args.userId` so `appearsInForLater` is set

- [ ] **Step 1: Write failing source test**

```typescript
test("backfillMyAppearsInForLater refreshes library projections", () => {
	const body = sliceHandler("backfillMyAppearsInForLater");
	assert.match(body, /upsertAlbumLibraryProjection/);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement backfill**

Match neighboring mutations: `requireAuth` + `userId` arg.

```typescript
export const backfillMyAppearsInForLater = mutation({
	args: { userId: v.string() },
	returns: v.object({ processed: v.number() }),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const rows = await ctx.db
			.query("albumLibraryItems")
			.withIndex("by_userId_createdAt", (q) =>
				q.eq("userId", args.userId),
			)
			.collect();
		for (const row of rows) {
			await upsertAlbumLibraryProjection(ctx, {
				userId: args.userId,
				albumId: row.albumId,
			});
		}
		return { processed: rows.length };
	},
});
```

- [ ] **Step 4: Run after schema is live**

From app/client or Convex dashboard with your userId:

```bash
npx convex run forLaterAlbums:backfillMyAppearsInForLater '{"userId":"<your-user-id>"}'
```

- [ ] **Step 5: Run source tests — PASS**

- [ ] **Step 6: Commit**

```bash
git add convex/forLaterAlbums.ts convex/forLaterAlbums.library-membership-source.test.ts
git commit -m "$(cat <<'EOF'
feat(library): backfill appearsInForLater on albumLibraryItems

EOF
)"
```

---

### Task 5: Smart playlist forLater uses library genres

**Files:**
- Modify: `convex/smartPlaylists.ts`
- Replace: `convex/smartPlaylists.for-later-genre-source.test.ts`

**Interfaces:**
- Consumes: `albumLibraryItems` index `by_userId_appearsInForLater_createdAt`; `genreKeySetsFromTags`; `albumMatchesGenreClauses`; for-later join only for addedAt
- Removes: `resolveRymScrapeIdForAlbum`, `loadGenreRoleKeysForScrape` usage from forLater path (keep helpers only if rankings or other code still needs them — rankings uses library tags, so delete scrape helpers if unused)

- [ ] **Step 1: Replace source test (failing against current scrape path)**

```typescript
// convex/smartPlaylists.for-later-genre-source.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "smartPlaylists.ts"),
	"utf8",
);

test("for-later matching loads library rows by appearsInForLater", () => {
	const start = source.indexOf("async function resolveForLaterMatches");
	const end = source.indexOf("async function resolveRankingsMatches", start);
	const body = source.slice(start, end);

	assert.match(body, /albumLibraryItems/);
	assert.match(body, /appearsInForLater/);
	assert.match(body, /primaryGenres/);
	assert.match(body, /secondaryGenres/);
	assert.doesNotMatch(body, /rateYourMusicSpotifyAlbumLinks/);
	assert.doesNotMatch(body, /loadGenreRoleKeysForScrape/);
	assert.doesNotMatch(body, /resolveRymScrapeIdForAlbum/);
});
```

- [ ] **Step 2: Run — expect FAIL** (current code still scrape-oriented or forLater-item oriented)

- [ ] **Step 3: Rewrite `resolveForLaterMatches`**

Target shape:

```typescript
async function resolveForLaterMatches(
	ctx: DbCtx,
	args: {
		userId: string;
		filters: SmartPlaylistFiltersV2;
		now: number;
	},
): Promise<MatchedAlbum[]> {
	const libraryItems = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_userId_appearsInForLater_createdAt", (q) =>
			q.eq("userId", args.userId).eq("appearsInForLater", true),
		)
		.collect();

	const addedRange = args.filters.addedWindow
		? resolveAddedWindow(args.filters.addedWindow, args.now)
		: null;

	const needsDuration =
		args.filters.durationOpenLow !== true ||
		args.filters.durationOpenHigh !== true;

	const parentKeysByChild =
		args.filters.genreClauses.length > 0
			? await loadRymGenreParentKeysByChild(ctx)
			: null;

	// Map albumId → for-later addedAt only when addedWindow active
	const forLaterAddedAtByAlbumId = new Map<
		Id<"spotifyAlbums">,
		number
	>();
	if (addedRange) {
		const forLaterItems = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_active", (q) =>
				q.eq("userId", args.userId).eq("isActive", true),
			)
			.collect();
		for (const item of forLaterItems) {
			if (
				item.markedAsSingle === true ||
				item.removedFromForLater === true
			) {
				continue;
			}
			forLaterAddedAtByAlbumId.set(
				item.albumId,
				item.playlistAddedAt ?? item.firstSeenAt ?? item.createdAt,
			);
		}
	}

	type Candidate = {
		item: Doc<"albumLibraryItems">;
		album: Doc<"spotifyAlbums">;
		sortAt: number;
	};
	const candidates: Candidate[] = [];

	for (const item of libraryItems) {
		if (!yearMatchesFilters(item.releaseYear, args.filters)) {
			continue;
		}

		if (!ratingMatchesBounds(item.rating, args.filters)) {
			continue;
		}

		if (
			!taxonomyKeysPassAgainstSet(
				args.filters.descriptorKeys,
				args.filters.descriptorMatch,
				new Set(item.descriptors.map((d) => d.key)),
			)
		) {
			continue;
		}

		const directGenreKeys = genreKeySetsFromTags(
			item.primaryGenres,
			item.secondaryGenres,
		);
		const primaryKeys =
			parentKeysByChild !== null
				? new Set(
						buildFilterGenreKeysSortedWithAncestors(
							[...directGenreKeys.primary],
							parentKeysByChild,
						),
					)
				: directGenreKeys.primary;
		const secondaryKeys =
			parentKeysByChild !== null
				? new Set(
						buildFilterGenreKeysSortedWithAncestors(
							[...directGenreKeys.secondary],
							parentKeysByChild,
						),
					)
				: directGenreKeys.secondary;

		if (
			!albumMatchesGenreClauses(
				primaryKeys,
				secondaryKeys,
				args.filters.genreClauses,
				args.filters.genreMatch,
			)
		) {
			continue;
		}

		let sortAt = item.createdAt;
		if (addedRange) {
			const addedAt = forLaterAddedAtByAlbumId.get(item.albumId);
			if (addedAt === undefined) {
				continue;
			}
			if (!addedAtMatchesWindow(addedAt, addedRange)) {
				continue;
			}
			sortAt = addedAt;
		}

		const album = await ctx.db.get(item.albumId);
		if (!album) {
			continue;
		}

		if (needsDuration) {
			if (!durationMatchesFilters(album.totalDurationMs, args.filters)) {
				continue;
			}
		}

		candidates.push({ item, album, sortAt });
	}

	candidates.sort((a, b) => b.sortAt - a.sortAt);

	return candidates.map((c) => ({
		spotifyAlbumId: c.item.spotifyAlbumId,
		albumId: c.item.albumId,
		name: c.item.name,
		artistName: c.item.artistName,
		totalTracks: c.album.totalTracks,
	}));
}
```

Delete unused `resolveRymScrapeIdForAlbum` and `loadGenreRoleKeysForScrape` if nothing else references them.

- [ ] **Step 4: Run tests**

```bash
npx tsx --test convex/smartPlaylists.for-later-genre-source.test.ts convex/_utils/smartPlaylistGenreMatch.test.ts
pnpm typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/smartPlaylists.ts convex/smartPlaylists.for-later-genre-source.test.ts
git commit -m "$(cat <<'EOF'
fix(smart-playlists): match for-later genres from album library

EOF
)"
```

---

### Task 6: Rollout verification

**Files:** none (ops + manual)

- [ ] **Step 1: Ensure Convex schema is live** (`npx convex dev` or deploy to the active deployment)

- [ ] **Step 2: Run backfill** for your user (mutation from Task 4)

- [ ] **Step 3: Spot-check data** (Convex dashboard or one-off query): active for-later albums have `appearsInForLater: true`; soft-deleted have `false`; ambient americana album has that genre on `primaryGenres`/`secondaryGenres`

- [ ] **Step 4: Manual UI**

1. Open For Later, filter genre ambient americana — note count.
2. Create/edit smart playlist: source For Later, include ambient americana, role either.
3. Preview count should match (same membership definition).

- [ ] **Step 5: Final commit only if docs/idea status needs update** — optional note in idea file; skip if nothing to change.

- [ ] **Step 6: Commit verification note only if you add a short ops checklist to the plan as done** — no code commit required.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| `appearsInForLater` + index | Task 2 |
| Projection build from for-later membership | Tasks 1–2 |
| Sync on upsert / soft-delete / deactivate | Task 3 (upsert already covered) |
| Backfill | Task 4 |
| Smart playlist library genres + membership | Task 5 |
| Remove scrape-link fallback | Task 5 |
| `addedWindow` join only | Task 5 |
| Duration from Spotify album | Task 5 |
| Manual ambient americana parity | Task 6 |
| Phase 2–3 facets | Explicitly out of this plan |

## Placeholder scan

No TBD steps. Backfill is `backfillMyAppearsInForLater` (authed, current user).

## Type consistency

- Field name: `appearsInForLater` everywhere (not `inForLater` / `isForLater`).
- Index: `by_userId_appearsInForLater_createdAt`.
- Helper: `computeAppearsInForLater`.
- Backfill: `backfillMyAppearsInForLater`.
