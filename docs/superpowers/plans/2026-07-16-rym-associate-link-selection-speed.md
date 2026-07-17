# RYM Associate Link Selection Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Speed up RYM scrape selection in both associate drawers by removing redundant projection work and closing the drawer optimistically on click.

**Architecture:** Add a RYM-slice album-library projection patch and a fast-path For Later filter sync that reuse scrape/taxonomy loaded once in the associate mutation. Manual associate mutations pass `refreshMode: "rym-slice"` through `linkRymScrapeToSpotifyAlbum` and drop the duplicate full refresh on the album-library path. On click, close the drawer immediately and overlay linked RYM chrome on the row via a local Map (concerts/rankings pattern); fire the mutation in the background; toast + rollback on failure.

**Tech Stack:** Convex mutations, Next.js 15 client components, TypeScript, Biome, `node:test` via `pnpm exec tsx --test`, sonner toasts

**Spec:** `docs/superpowers/specs/2026-07-16-rym-associate-link-selection-speed-design.md`

## Global Constraints

- Manual link semantics unchanged (`method: "manual"`, same junction writes, same For Later mapped-elsewhere guard)
- Album library still permits one scrape on multiple Spotify albums
- Default `linkRymScrapeToSpotifyAlbum` refresh behavior stays `full` for non-manual callers
- No schema changes
- Classic function declarations; `type` aliases; kebab-case filenames
- Optimistic close on click — do not wait for mutation success to close the drawer
- Optimistic overlay covers linked status + `rymUrl` only (not genres/descriptors)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `convex/_utils/albumLibraryProjection.ts` | `patchAlbumLibraryRymFieldsForAlbum` + optional pure patch builder |
| Create | `convex/_utils/albumLibraryRymPatch.test.ts` | Unit tests for RYM patch field selection |
| Modify | `convex/_utils/albumMatching.ts` | `refreshMode` on `linkRymScrapeToSpotifyAlbum` |
| Modify | `convex/spotify.ts` | Remove duplicate refresh; pass `rym-slice` |
| Modify | `convex/forLaterAlbums.ts` | Fast-path filter sync + optimized associate |
| Modify | `convex/rym-album-library-association-source.test.ts` | Assert single refresh entry point |
| Create | `convex/for-later-rym-associate-speed-source.test.ts` | Source guards for fast-path associate |
| Modify | `src/app/albums/_components/album-rym-associate-drawer.tsx` | Pass scrape summary (`scrapeId` + `rymUrl`) on select |
| Modify | `src/app/for-later-albums/_components/for-later-rym-associate-drawer.tsx` | Same selection payload |
| Modify | `src/app/albums/_components/all-albums-view.tsx` | Optimistic Map + close-first associate handler |
| Modify | `src/lib/hooks/use-for-later-rym-associate-drawer.ts` | Optimistic Map + close-first associate handler |
| Modify | `src/app/for-later-albums/page.tsx` | Merge optimistic overlays onto rows if needed |

---

### Task 1: RYM-slice album library projection helper

**Files:**
- Modify: `convex/_utils/albumLibraryProjection.ts`
- Create: `convex/_utils/albumLibraryRymPatch.test.ts`

**Interfaces:**
- Consumes: `loadRymTaxonomyForScrape` (existing private), `getAlbumLibraryRymStatus` from `albumLibraryRows.ts`
- Produces: `patchAlbumLibraryRymFieldsForAlbum(ctx, { albumId, scrape, linkMethod, linkedAt })`

- [ ] **Step 1: Write the failing test**

```typescript
// convex/_utils/albumLibraryRymPatch.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildAlbumLibraryRymPatchFields } from "./albumLibraryProjection";

test("buildAlbumLibraryRymPatchFields sets only RYM-derived projection fields", () => {
	const patch = buildAlbumLibraryRymPatchFields({
		scrape: {
			_id: "scrape1" as never,
			rymUrl: "https://rateyourmusic.com/release/album/x",
			updatedAt: 1000,
		} as never,
		linkMethod: "manual",
		linkedAt: 2000,
		taxonomy: {
			primaryGenres: [{ key: "rock", label: "Rock" }],
			secondaryGenres: [],
			descriptors: [{ key: "lo-fi", label: "Lo-Fi" }],
		},
		existingUpdatedAt: 500,
	});

	assert.equal(patch.rymStatus, "linked");
	assert.equal(patch.rymScrapeId, "scrape1");
	assert.equal(patch.rymLinkMethod, "manual");
	assert.equal(patch.rymUrl, "https://rateyourmusic.com/release/album/x");
	assert.equal(patch.rymLinkedAt, 2000);
	assert.deepEqual(patch.primaryGenres, [{ key: "rock", label: "Rock" }]);
	assert.deepEqual(patch.descriptors, [{ key: "lo-fi", label: "Lo-Fi" }]);
	assert.equal(patch.updatedAt, 2000);
	assert.equal("listenCount" in patch, false);
	assert.equal("robRankingYears" in patch, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test convex/_utils/albumLibraryRymPatch.test.ts`  
Expected: FAIL — `buildAlbumLibraryRymPatchFields` not exported

- [ ] **Step 3: Implement pure builder + patch function**

In `convex/_utils/albumLibraryProjection.ts`, export:

```typescript
export function buildAlbumLibraryRymPatchFields(args: {
	scrape: Doc<"rateYourMusicScrapes">;
	linkMethod: Doc<"rateYourMusicSpotifyAlbumLinks">["method"];
	linkedAt: number;
	taxonomy: AlbumLibraryTaxonomy;
	existingUpdatedAt: number;
}): Pick<
	Doc<"albumLibraryItems">,
	| "rymStatus"
	| "rymScrapeId"
	| "rymLinkMethod"
	| "rymUrl"
	| "rymLinkedAt"
	| "primaryGenres"
	| "secondaryGenres"
	| "descriptors"
	| "updatedAt"
> {
	return {
		rymStatus: getAlbumLibraryRymStatus(true),
		rymScrapeId: args.scrape._id,
		rymLinkMethod: args.linkMethod,
		rymUrl: args.scrape.rymUrl,
		rymLinkedAt: args.linkedAt,
		primaryGenres: args.taxonomy.primaryGenres,
		secondaryGenres: args.taxonomy.secondaryGenres,
		descriptors: args.taxonomy.descriptors,
		updatedAt: Math.max(
			args.existingUpdatedAt,
			args.linkedAt,
			args.scrape.updatedAt,
		),
	};
}

export async function patchAlbumLibraryRymFieldsForAlbum(
	ctx: MutationCtx,
	args: {
		albumId: Id<"spotifyAlbums">;
		scrape: Doc<"rateYourMusicScrapes">;
		linkMethod: Doc<"rateYourMusicSpotifyAlbumLinks">["method"];
		linkedAt: number;
	},
): Promise<void> {
	const taxonomy = await loadRymTaxonomyForScrape(ctx, args.scrape._id);
	const rows = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
		.collect();

	for (const row of rows) {
		await ctx.db.patch(
			row._id,
			buildAlbumLibraryRymPatchFields({
				scrape: args.scrape,
				linkMethod: args.linkMethod,
				linkedAt: args.linkedAt,
				taxonomy,
				existingUpdatedAt: row.updatedAt,
			}),
		);
	}
}
```

Export `AlbumLibraryTaxonomy` type alias locally if the test import needs it, or keep taxonomy inline in the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test convex/_utils/albumLibraryRymPatch.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/albumLibraryProjection.ts convex/_utils/albumLibraryRymPatch.test.ts
git commit -m "feat: add RYM-slice patch helper for album library projections"
```

---

### Task 2: `refreshMode` on link helper + album library associate

**Files:**
- Modify: `convex/_utils/albumMatching.ts`
- Modify: `convex/spotify.ts`
- Modify: `convex/rym-album-library-association-source.test.ts`

**Interfaces:**
- Consumes: `patchAlbumLibraryRymFieldsForAlbum`, `refreshAlbumLibraryProjectionsForAlbum`
- Produces: `linkRymScrapeToSpotifyAlbum(..., { refreshMode?: "full" | "rym-slice" | "none" })` default `"full"`

- [ ] **Step 1: Write the failing source test**

Add to `convex/rym-album-library-association-source.test.ts`:

```typescript
test("album library manual association does not double-refresh projections", () => {
	const body = getSourceBetween(
		spotifySource,
		"export const associateSpotifyAlbumWithRymScrape = mutation({",
		"// Upsert canonical track data",
	);

	assert.doesNotMatch(body, /refreshAlbumLibraryProjectionsForAlbum/);
	assert.match(body, /refreshMode:\s*"rym-slice"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test convex/rym-album-library-association-source.test.ts`  
Expected: FAIL — body still contains `refreshAlbumLibraryProjectionsForAlbum`

- [ ] **Step 3: Implement refreshMode + remove duplicate refresh**

In `linkRymScrapeToSpotifyAlbum`, extend args:

```typescript
refreshMode?: "full" | "rym-slice" | "none";
```

After link writes:

```typescript
const mode = args.refreshMode ?? "full";
if (mode === "full") {
	await refreshAlbumLibraryProjectionsForAlbum(ctx, args.albumId);
} else if (mode === "rym-slice") {
	const scrape = await ctx.db.get(args.scrapeId);
	if (!scrape) throw new Error("RYM scrape not found");
	await patchAlbumLibraryRymFieldsForAlbum(ctx, {
		albumId: args.albumId,
		scrape,
		linkMethod: args.method,
		linkedAt: args.now,
	});
}
```

In `associateSpotifyAlbumWithRymScrape`, pass `refreshMode: "rym-slice"` and **delete** the trailing `refreshAlbumLibraryProjectionsForAlbum` call.

- [ ] **Step 4: Run tests**

Run: `pnpm exec tsx --test convex/rym-album-library-association-source.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/albumMatching.ts convex/spotify.ts convex/rym-album-library-association-source.test.ts
git commit -m "perf: use RYM-slice refresh on manual album library associate"
```

---

### Task 3: For Later associate fast path

**Files:**
- Modify: `convex/forLaterAlbums.ts`
- Create: `convex/for-later-rym-associate-speed-source.test.ts`

**Interfaces:**
- Consumes: `loadTagsForScrape`, `loadRymGenreParentKeysByChild`, `linkRymScrapeToSpotifyAlbum`
- Produces: `syncForLaterRymLinkFilterProjection(ctx, { item, album, scrape, tags, parentKeysByChild, now })`

- [ ] **Step 1: Write the failing source test**

```typescript
// convex/for-later-rym-associate-speed-source.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("convex/forLaterAlbums.ts", "utf8");

test("for-later manual associate uses fast-path RYM filter sync", () => {
	const body = source.slice(
		source.indexOf("export const associateForLaterAlbumWithRymScrape = mutation({"),
		source.indexOf("export const patchForLaterRymMatch = mutation({"),
	);

	assert.match(body, /loadTagsForScrape\(ctx,\s*args\.scrapeId\)/);
	assert.match(body, /loadRymGenreParentKeysByChild\(ctx\)/);
	assert.match(body, /syncForLaterRymLinkFilterProjection\(/);
	assert.match(body, /refreshMode:\s*"rym-slice"/);
	assert.doesNotMatch(body, /syncForLaterItemFilterProjection\(ctx,\s*args\.itemId\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test convex/for-later-rym-associate-speed-source.test.ts`  
Expected: FAIL

- [ ] **Step 3: Add fast-path sync + wire associate mutation**

Add `syncForLaterRymLinkFilterProjection` near `syncForLaterItemFilterProjection`. Copy the filter-field + facet sync logic from `syncForLaterItemFilterProjection`, but:

- Accept preloaded `item`, `album`, `scrape`, `tags`, `parentKeysByChild`, `now`
- Use `scrape._id` as resolved scrape (no `resolveRymContextForAlbum`)
- Use passed `now` instead of `Date.now()` inside patch

Update `associateForLaterAlbumWithRymScrape`:

```typescript
const tags = await loadTagsForScrape(ctx, args.scrapeId);
const parentKeysByChild = await loadRymGenreParentKeysByChild(ctx);

await linkRymScrapeToSpotifyAlbum(ctx, {
	// ...existing fields
	refreshMode: "rym-slice",
});

await ctx.db.patch(args.itemId, { /* unchanged RYM fields */ });

await syncForLaterRymLinkFilterProjection(ctx, {
	item,
	album: await ctx.db.get(item.albumId),
	scrape,
	tags,
	parentKeysByChild,
	now,
});
```

Load `album` once; if null, still patch item but skip filter sync.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test convex/for-later-rym-associate-speed-source.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/forLaterAlbums.ts convex/for-later-rym-associate-speed-source.test.ts
git commit -m "perf: fast-path filter projection on for-later RYM associate"
```

---

### Task 4: Optimistic associate UX (both surfaces)

**Files:**
- Modify: `src/app/albums/_components/album-rym-associate-drawer.tsx`
- Modify: `src/app/for-later-albums/_components/for-later-rym-associate-drawer.tsx`
- Modify: `src/app/albums/_components/all-albums-view.tsx`
- Modify: `src/lib/hooks/use-for-later-rym-associate-drawer.ts`
- Modify: `src/app/for-later-albums/page.tsx` (only if row merge lives at page level)

**Interfaces:**
- Consumes: scrape list rows already include `rymUrl`
- Produces:
  - `onAssociate: (selection: { scrapeId: Id<"rateYourMusicScrapes">; rymUrl: string }) => void` (fire-and-forget from drawer)
  - Optimistic overlay maps applied when rendering album / for-later rows

- [ ] **Step 1: Change drawer `onAssociate` to pass scrape summary**

In both drawer files, update the prop type and picker:

```tsx
onAssociate: (selection: {
	scrapeId: Id<"rateYourMusicScrapes">;
	rymUrl: string;
}) => void;

// in map:
onSelect={() =>
	onAssociate({
		scrapeId: scrape.scrapeId,
		rymUrl: scrape.rymUrl,
	})
}
```

No spinner / pending row state — close is immediate from the parent.

- [ ] **Step 2: Album library optimistic handler**

In `all-albums-view.tsx`:

```typescript
type OptimisticRymLink = {
	rymStatus: "linked";
	rymUrl: string;
};

const [optimisticRymLinks, setOptimisticRymLinks] = useState(
	() => new Map<string, OptimisticRymLink>(),
);

function applyOptimisticRymLink(
	album: AlbumLibraryRowData,
): AlbumLibraryRowData {
	const overlay = optimisticRymLinks.get(album._id);
	if (!overlay) return album;
	return { ...album, ...overlay };
}

async function handleAssociateRymScrape(selection: {
	scrapeId: Id<"rateYourMusicScrapes">;
	rymUrl: string;
}): Promise<void> {
	if (!rymAssociateAlbum) return;

	const albumId = rymAssociateAlbum._id;
	const albumName = rymAssociateAlbum.name;

	setOptimisticRymLinks((current) => {
		const next = new Map(current);
		next.set(albumId, {
			rymStatus: "linked",
			rymUrl: selection.rymUrl,
		});
		return next;
	});
	setRymAssociateAlbum(null);

	try {
		await associateRymScrape({
			albumId: albumId as Id<"spotifyAlbums">,
			scrapeId: selection.scrapeId,
		});
		toast.success(`Linked RYM page for "${albumName}"`);
	} catch (error) {
		setOptimisticRymLinks((current) => {
			const next = new Map(current);
			next.delete(albumId);
			return next;
		});
		console.error("Failed to associate RYM scrape:", error);
		toast.error("Could not link RYM scrape");
	}
}
```

Where album rows are rendered / mapped for display, run them through `applyOptimisticRymLink`. Clear overlay keys once query data already has `rymStatus === "linked"` and matching `rymUrl` (optional cleanup in a `useEffect`, or leave until next navigation — either is fine if overlays stay small).

- [ ] **Step 3: For Later optimistic handler**

In `use-for-later-rym-associate-drawer.ts`:

```typescript
type OptimisticForLaterRymLink = {
	rymStatus: "matched";
	rymUrl: string;
};

const [optimisticRymLinks, setOptimisticRymLinks] = useState(
	() => new Map<string, OptimisticForLaterRymLink>(),
);

const handleAssociate = useCallback(
	async (selection: {
		scrapeId: Id<"rateYourMusicScrapes">;
		rymUrl: string;
	}): Promise<void> => {
		if (!userId || !row) return;

		const itemId = row.albumItemId;
		const albumName = row.name;

		setOptimisticRymLinks((current) => {
			const next = new Map(current);
			next.set(itemId, {
				rymStatus: "matched",
				rymUrl: selection.rymUrl,
			});
			return next;
		});
		setRow(null);

		try {
			await associateMutation({
				userId,
				itemId,
				scrapeId: selection.scrapeId,
			});
			toast.success(`Linked RYM page for "${albumName}"`);
		} catch (error) {
			setOptimisticRymLinks((current) => {
				const next = new Map(current);
				next.delete(itemId);
				return next;
			});
			console.error("Failed to associate RYM scrape:", error);
			toast.error("Could not link RYM scrape");
		}
	},
	[associateMutation, row, userId],
);

return {
	associateRow: row,
	openAssociateDrawer,
	closeAssociateDrawer,
	handleAssociate,
	optimisticRymLinks,
};
```

On `for-later-albums/page.tsx` (or wherever rows are rendered), merge:

```typescript
function withOptimisticRym(
	row: ForLaterAlbumRowData,
	overlays: Map<string, { rymStatus: "matched"; rymUrl: string }>,
): ForLaterAlbumRowData {
	const overlay = overlays.get(row.albumItemId);
	if (!overlay) return row;
	return { ...row, ...overlay, rymNotOnSite: undefined };
}
```

- [ ] **Step 4: Manual smoke check**

1. `pnpm dev` — `/albums/all`: click scrape → drawer closes instantly; row shows linked URL; success toast; genres appear when query refreshes  
2. Simulate failure (temporarily throw in mutation or disconnect) → overlay gone; error toast  
3. For Later — same happy path

- [ ] **Step 5: Run checks**

Run: `pnpm typecheck && pnpm check`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/albums/_components/album-rym-associate-drawer.tsx \
  src/app/for-later-albums/_components/for-later-rym-associate-drawer.tsx \
  src/app/albums/_components/all-albums-view.tsx \
  src/lib/hooks/use-for-later-rym-associate-drawer.ts \
  src/app/for-later-albums/page.tsx
git commit -m "feat: optimistic RYM associate close and row overlay"
```

---

### Task 5: Mark idea planned

**Files:**
- Modify: `docs/ideas/2026-07-15-speed-up-rym-scrape-link-selection.md`

- [ ] **Step 1: Update idea frontmatter and Notes**

```yaml
status: planned
```

Add Notes bullet:

```markdown
- Planned — spec: `docs/superpowers/specs/2026-07-16-rym-associate-link-selection-speed-design.md`, plan: `docs/superpowers/plans/2026-07-16-rym-associate-link-selection-speed.md`
```

- [ ] **Step 2: Commit docs**

```bash
git add docs/ideas/2026-07-15-speed-up-rym-scrape-link-selection.md \
  docs/superpowers/specs/2026-07-16-rym-associate-link-selection-speed-design.md \
  docs/superpowers/plans/2026-07-16-rym-associate-link-selection-speed.md
git commit -m "docs: plan RYM associate link selection speedup"
```

---

## Self-Review

| Spec requirement | Task |
|------------------|------|
| Remove duplicate album-library refresh | Task 2 |
| RYM-slice projection for manual links | Tasks 1–2 |
| For Later fast-path filter sync | Task 3 |
| Optimistic close + row overlay | Task 4 |
| Tests | Tasks 1–3 |
| Idea status `planned` | Task 5 |

No placeholders remain. Types align across `refreshMode`, patch builder, and `RymAssociateSelection`.

---

**Plan complete.** Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?
