# Music Funnel Repeats Type Filter, Density & Album Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter the unified repeats feed by type, densify rows (type icons, no artwork/meta clutter), raise the feed cap to 100, and gate album repeats to Spotify `album` / `compilation` only (with ingest + one-shot backfill of `spotifyAlbumType`).

**Architecture:** Persist `spotifyAlbumType` from playlist payloads (already on Spotify’s simplified album object; currently dropped). Gate album repeats in both `computeAlbumRepeatSummaries` (sync analytics) and `buildAlbumRepeats` (Convex UI). Silent client backfill uses existing `getAlbums` + new list/patch Convex APIs. UI keeps one `listRepeats` feed; chips filter client-side; `RepeatRow` becomes icon-led and minimal.

**Tech Stack:** Next.js 15 App Router, Convex, React, Tailwind, lucide-react, TypeScript, Biome, `node:test` via `pnpm exec tsx --test`

**Spec:** `docs/superpowers/specs/2026-07-17-repeats-type-filter-density-and-album-gate-design.md`

## Global Constraints

- Album repeat types only: Spotify `album` | `compilation` (exclude `single` and missing)
- Fail closed on missing `spotifyAlbumType` until backfilled
- Do **not** reuse album-library `albumType` (track-count heuristic)
- Type filter: single-select All / Tracks / Albums / Artists; local state only (no URL)
- Dense row: type icon + title + `N×` + New + contributing icon+count (album/artist); no artwork, type text label, sources, or first/last-seen
- Feed cap: **100** rows; no pagination
- Classic function declarations; `type` aliases; kebab-case filenames; env via `~/env.js` if needed
- New-since-visit / missed-banner semantics unchanged (counts may drop after album gate)

### Pinned types

```typescript
type SpotifyAlbumType = "album" | "single" | "compilation";

function qualifiesAsMusicFunnelAlbumRepeat(
	spotifyAlbumType: SpotifyAlbumType | undefined,
): boolean {
	return spotifyAlbumType === "album" || spotifyAlbumType === "compilation";
}
```

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/spotify.ts` | Add `album_type` on `SpotifyTrack.album` and `SpotifyAlbum` |
| Modify | `src/lib/music-funnel-sync-utils.ts` | Persist type on normalize; gate `computeAlbumRepeatSummaries`; export qualify helper |
| Modify | `src/lib/music-funnel-sync-utils.test.ts` | Normalize + album-gate tests; default fixtures to `album` |
| Modify | `convex/schema.ts` | Optional `spotifyAlbumType` on `musicFunnelTrackEncounters` |
| Modify | `convex/musicFunnel.ts` | Validators, insert, `EncounterLike`, gate `buildAlbumRepeats`, `listRepeats` default 100, list/patch for backfill |
| Create | `src/lib/music-funnel-backfill-album-types.ts` | Silent backfill: list missing ids → `getAlbums` → patch |
| Modify | `src/lib/music-funnel-sync.ts` | Opportunistic backfill after a successful sync (or call from page — see Task 4) |
| Modify | `src/app/music-funnel/_components/music-funnel-repeat-lists.tsx` | Chips, dense row, `limit: 100` |
| Modify | `src/app/music-funnel/_components/music-funnel-missed-banner.tsx` | `limit: 100` to match feed |
| Modify | `docs/ideas/2026-07-17-repeats-type-filter-and-denser-rows.md` | `status: planned` + Notes link |
| Modify | `docs/ideas/2026-07-17-stricter-album-type-for-repeats.md` | `status: planned` + Notes link |

---

### Task 1: Persist + gate album type in sync utils (TDD)

**Files:**
- Modify: `src/lib/spotify.ts`
- Modify: `src/lib/music-funnel-sync-utils.ts`
- Modify: `src/lib/music-funnel-sync-utils.test.ts`

**Interfaces:**
- Consumes: `PlaylistTrackItem` / `SpotifyTrack.album.album_type`
- Produces: `NormalizedMusicFunnelTrack.spotifyAlbumType?: SpotifyAlbumType`; `MusicFunnelEncounterLike.spotifyAlbumType?: SpotifyAlbumType`; `qualifiesAsMusicFunnelAlbumRepeat`; gated `computeAlbumRepeatSummaries`

- [ ] **Step 1: Extend Spotify types**

In `src/lib/spotify.ts`, add `album_type` to both places:

```typescript
// On SpotifyTrack.album:
album: {
	id: string;
	name: string;
	album_type: "album" | "single" | "compilation";
	images: Array<{ url: string; height: number; width: number }>;
};

// On SpotifyAlbum (near top of file):
export type SpotifyAlbum = {
	id: string;
	name: string;
	album_type: "album" | "single" | "compilation";
	// ...existing fields
};
```

- [ ] **Step 2: Write failing tests**

Update `createPlaylistTrackItem` to include `album_type: "album"` on the album object.

Update `createEncounter` to accept optional `spotifyAlbumType` and **default to `"album"`** so existing album/artist tests keep passing.

Extend normalize expectation and add gate tests:

```typescript
import {
	// existing imports...
	qualifiesAsMusicFunnelAlbumRepeat,
} from "./music-funnel-sync-utils";

// In normalize test deepEqual, add:
spotifyAlbumType: "album",

test("normalizePlaylistTrack copies album_type when present", () => {
	const item = createPlaylistTrackItem();
	if (item.track) {
		item.track.album.album_type = "compilation";
	}
	assert.equal(normalizePlaylistTrack(item)?.spotifyAlbumType, "compilation");
});

test("qualifiesAsMusicFunnelAlbumRepeat allows album and compilation only", () => {
	assert.equal(qualifiesAsMusicFunnelAlbumRepeat("album"), true);
	assert.equal(qualifiesAsMusicFunnelAlbumRepeat("compilation"), true);
	assert.equal(qualifiesAsMusicFunnelAlbumRepeat("single"), false);
	assert.equal(qualifiesAsMusicFunnelAlbumRepeat(undefined), false);
});

test("computeAlbumRepeatSummaries excludes singles and missing album type", () => {
	const singles = computeAlbumRepeatSummaries([
		createEncounter({
			sourceId: sourceA,
			spotifyTrackId: "t1",
			spotifyAlbumId: "single-1",
			spotifyAlbumType: "single",
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "t2",
			spotifyAlbumId: "single-1",
			spotifyAlbumType: "single",
		}),
	]);
	assert.equal(singles.length, 0);

	const missing = computeAlbumRepeatSummaries([
		createEncounter({
			sourceId: sourceA,
			spotifyTrackId: "t3",
			spotifyAlbumId: "unknown-1",
			spotifyAlbumType: undefined,
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "t4",
			spotifyAlbumId: "unknown-1",
			spotifyAlbumType: undefined,
		}),
	]);
	assert.equal(missing.length, 0);
});

test("computeAlbumRepeatSummaries keeps compilations with 2+ sources", () => {
	const repeats = computeAlbumRepeatSummaries([
		createEncounter({
			sourceId: sourceA,
			spotifyTrackId: "t1",
			spotifyAlbumId: "comp-1",
			spotifyAlbumType: "compilation",
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "t2",
			spotifyAlbumId: "comp-1",
			spotifyAlbumType: "compilation",
		}),
	]);
	assert.equal(repeats.length, 1);
	assert.equal(repeats[0]?.spotifyAlbumId, "comp-1");
});
```

For `createEncounter`, when `spotifyAlbumType` is explicitly `undefined`, omit the field (do not default). Pattern:

```typescript
function createEncounter({
	// ...
	spotifyAlbumType = "album" as SpotifyAlbumType | undefined,
	omitAlbumType = false,
}: {
	// ...
	spotifyAlbumType?: SpotifyAlbumType;
	omitAlbumType?: boolean;
}): MusicFunnelEncounterLike {
	const base = { /* existing fields */ };
	if (!omitAlbumType && spotifyAlbumType !== undefined) {
		return { ...base, spotifyAlbumType };
	}
	if (!omitAlbumType && spotifyAlbumType === undefined) {
		return base; // missing type
	}
	return { ...base, spotifyAlbumType };
}
```

Simpler approach that works: default param `spotifyAlbumType: SpotifyAlbumType | undefined = "album"`, and for missing-type cases pass a sentinel by using overload — easiest:

```typescript
spotifyAlbumType?: SpotifyAlbumType | null; // null = omit field; undefined default album
// in body:
if (spotifyAlbumType !== null) {
  encounter.spotifyAlbumType = spotifyAlbumType ?? "album";
}
```

Use `null` in the missing-type test: `spotifyAlbumType: null`.

- [ ] **Step 3: Run tests — expect FAIL**

Run: `pnpm exec tsx --test src/lib/music-funnel-sync-utils.test.ts`  
Expected: FAIL (missing exports / fields / gate)

- [ ] **Step 4: Implement**

```typescript
// music-funnel-sync-utils.ts
export type SpotifyAlbumType = "album" | "single" | "compilation";

export function qualifiesAsMusicFunnelAlbumRepeat(
	spotifyAlbumType: SpotifyAlbumType | undefined,
): boolean {
	return spotifyAlbumType === "album" || spotifyAlbumType === "compilation";
}

// Add to NormalizedMusicFunnelTrack + MusicFunnelEncounterLike:
spotifyAlbumType?: SpotifyAlbumType;

// In normalizePlaylistTrack, after albumName:
const albumType = item.track.album.album_type;
if (
	albumType === "album" ||
	albumType === "single" ||
	albumType === "compilation"
) {
	normalized.spotifyAlbumType = albumType;
}

// In computeAlbumRepeatSummaries, after sourceIds.length < 2 check:
if (!qualifiesAsMusicFunnelAlbumRepeat(first.spotifyAlbumType)) {
	return null;
}
```

Resolve type from the group: use `first.spotifyAlbumType` only if all rows share the same album id (they do). Prefer first defined type in the group if some rows are patched:

```typescript
const albumType = rows
	.map((row) => row.spotifyAlbumType)
	.find(
		(value): value is SpotifyAlbumType =>
			value === "album" || value === "single" || value === "compilation",
	);
if (!qualifiesAsMusicFunnelAlbumRepeat(albumType)) {
	return null;
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm exec tsx --test src/lib/music-funnel-sync-utils.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/spotify.ts src/lib/music-funnel-sync-utils.ts src/lib/music-funnel-sync-utils.test.ts
git commit -m "$(cat <<'EOF'
feat: gate music-funnel album repeats by Spotify album_type

EOF
)"
```

---

### Task 2: Schema + Convex ingest + gated `buildAlbumRepeats` + limit 100

**Files:**
- Modify: `convex/schema.ts` (`musicFunnelTrackEncounters`)
- Modify: `convex/musicFunnel.ts`

**Interfaces:**
- Consumes: `track.spotifyAlbumType` from `recordTrackEncounters` args
- Produces: encounters with `spotifyAlbumType`; gated album repeats; `listRepeats` default limit 100

- [ ] **Step 1: Schema**

In `musicFunnelTrackEncounters` table definition, after `albumImageUrl`:

```typescript
spotifyAlbumType: v.optional(
	v.union(
		v.literal("album"),
		v.literal("single"),
		v.literal("compilation"),
	),
),
```

- [ ] **Step 2: Validators + EncounterLike + insert**

Add shared validator near top of `convex/musicFunnel.ts`:

```typescript
const spotifyAlbumTypeValidator = v.union(
	v.literal("album"),
	v.literal("single"),
	v.literal("compilation"),
);
```

Add `spotifyAlbumType: v.optional(spotifyAlbumTypeValidator)` to:
- `encounterInputValidator`
- `encounterLikeValidator`

Extend `EncounterLike` type with `spotifyAlbumType?: "album" | "single" | "compilation"`.

In `recordTrackEncounters` insert, include when present:

```typescript
albumImageUrl: track.albumImageUrl,
...(track.spotifyAlbumType !== undefined
	? { spotifyAlbumType: track.spotifyAlbumType }
	: {}),
playlistAddedAt: track.playlistAddedAt,
```

In `encounterDocToLike`:

```typescript
if (row.spotifyAlbumType !== undefined) {
	like.spotifyAlbumType = row.spotifyAlbumType;
}
```

- [ ] **Step 3: Gate `buildAlbumRepeats`**

Duplicate the qualify helper locally (Convex cannot import `~/lib`):

```typescript
function qualifiesAsMusicFunnelAlbumRepeat(
	spotifyAlbumType: "album" | "single" | "compilation" | undefined,
): boolean {
	return spotifyAlbumType === "album" || spotifyAlbumType === "compilation";
}
```

Inside `buildAlbumRepeats`, after resolving `first` / `sourceIds.length >= 2`:

```typescript
const albumType = rows
	.map((row) => row.spotifyAlbumType)
	.find(
		(value): value is "album" | "single" | "compilation" =>
			value === "album" || value === "single" || value === "compilation",
	);
if (!qualifiesAsMusicFunnelAlbumRepeat(albumType)) {
	return null;
}
```

- [ ] **Step 4: Raise `listRepeats` default to 100**

```typescript
const limit = clampLimit(args.limit, 100, 100);
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`  
Expected: PASS (or only pre-existing unrelated errors)

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/musicFunnel.ts
git commit -m "$(cat <<'EOF'
feat: store spotifyAlbumType on funnel encounters and gate album repeats

EOF
)"
```

---

### Task 3: List/patch APIs + silent backfill helper

**Files:**
- Modify: `convex/musicFunnel.ts`
- Create: `src/lib/music-funnel-backfill-album-types.ts`
- Modify: `src/lib/music-funnel-sync.ts` (call after successful sync)

**Interfaces:**
- Consumes: `getAlbums(accessToken, ids)` from `~/lib/spotify`
- Produces: `listAlbumIdsMissingSpotifyAlbumType`, `patchEncountersSpotifyAlbumType`, `backfillMusicFunnelAlbumTypes`

- [ ] **Step 1: Convex list query**

```typescript
export const listAlbumIdsMissingSpotifyAlbumType = query({
	args: { userId: v.string() },
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("musicFunnelTrackEncounters")
			.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
			.collect();
		const missing = new Set<string>();
		for (const row of rows) {
			if (row.spotifyAlbumType === undefined) {
				missing.add(row.spotifyAlbumId);
			}
		}
		return [...missing];
	},
});
```

- [ ] **Step 2: Convex patch mutation**

```typescript
export const patchEncountersSpotifyAlbumType = mutation({
	args: {
		userId: v.string(),
		patches: v.array(
			v.object({
				spotifyAlbumId: v.string(),
				spotifyAlbumType: spotifyAlbumTypeValidator,
			}),
		),
	},
	returns: v.object({
		patchedEncounters: v.number(),
		albumsPatched: v.number(),
	}),
	handler: async (ctx, args) => {
		let patchedEncounters = 0;
		for (const patch of args.patches) {
			const rows = await ctx.db
				.query("musicFunnelTrackEncounters")
				.withIndex("by_userId_spotifyAlbumId", (q) =>
					q
						.eq("userId", args.userId)
						.eq("spotifyAlbumId", patch.spotifyAlbumId),
				)
				.collect();
			for (const row of rows) {
				if (row.spotifyAlbumType === undefined) {
					await ctx.db.patch(row._id, {
						spotifyAlbumType: patch.spotifyAlbumType,
					});
					patchedEncounters += 1;
				}
			}
		}
		return {
			patchedEncounters,
			albumsPatched: args.patches.length,
		};
	},
});
```

- [ ] **Step 3: Client backfill helper**

```typescript
// src/lib/music-funnel-backfill-album-types.ts
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { getAlbums } from "~/lib/spotify";

export async function backfillMusicFunnelAlbumTypes({
	convex,
	userId,
	accessToken,
}: {
	convex: ConvexHttpClient;
	userId: string;
	accessToken: string;
}): Promise<{ albumIds: number; patchedEncounters: number }> {
	const albumIds = await convex.query(
		api.musicFunnel.listAlbumIdsMissingSpotifyAlbumType,
		{ userId },
	);
	if (albumIds.length === 0) {
		return { albumIds: 0, patchedEncounters: 0 };
	}

	const albums = await getAlbums(accessToken, albumIds);
	const patches = albums
		.filter(
			(
				album,
			): album is NonNullable<typeof album> & {
				album_type: "album" | "single" | "compilation";
			} =>
				album !== null &&
				(album.album_type === "album" ||
					album.album_type === "single" ||
					album.album_type === "compilation"),
		)
		.map((album) => ({
			spotifyAlbumId: album.id,
			spotifyAlbumType: album.album_type,
		}));

	if (patches.length === 0) {
		return { albumIds: albumIds.length, patchedEncounters: 0 };
	}

	const result = await convex.mutation(
		api.musicFunnel.patchEncountersSpotifyAlbumType,
		{ userId, patches },
	);
	return {
		albumIds: albumIds.length,
		patchedEncounters: result.patchedEncounters,
	};
}
```

Note: `getAlbums` may return null slots for missing albums — filter those out. `syncMusicFunnel` already constructs a `ConvexHttpClient`; pass that instance into this helper.

- [ ] **Step 4: Wire silent call after sync**

In `src/lib/music-funnel-sync.ts`, after a successful overall sync (where you already have `accessToken`, `userId`, `convex`), call:

```typescript
try {
	await backfillMusicFunnelAlbumTypes({ convex, userId, accessToken });
} catch (error) {
	console.error("music-funnel album type backfill failed", error);
}
```

Do not surface a UI control. Failure must not fail the sync.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`  
Expected: PASS for touched files

- [ ] **Step 6: Commit**

```bash
git add convex/musicFunnel.ts src/lib/music-funnel-backfill-album-types.ts src/lib/music-funnel-sync.ts
git commit -m "$(cat <<'EOF'
feat: backfill missing music-funnel spotifyAlbumType from Spotify

EOF
)"
```

---

### Task 4: Type chips + dense `RepeatRow` + limit 100 on client

**Files:**
- Modify: `src/app/music-funnel/_components/music-funnel-repeat-lists.tsx`
- Modify: `src/app/music-funnel/_components/music-funnel-missed-banner.tsx`

**Interfaces:**
- Consumes: `api.musicFunnel.listRepeats` with `limit: 100`
- Produces: client type filter + densified rows

- [ ] **Step 1: Bump query limits**

In both `music-funnel-repeat-lists.tsx` and `music-funnel-missed-banner.tsx`:

```typescript
const repeats = useQuery(api.musicFunnel.listRepeats, {
	userId,
	limit: 100,
});
```

- [ ] **Step 2: Add filter state + chips**

In `MusicFunnelRepeatLists`:

```typescript
import { useState } from "react";
import { Disc3, Music2, User } from "lucide-react";
import { cn } from "~/lib/utils";

type RepeatTypeFilter = "all" | "track" | "album" | "artist";

const FILTERS: Array<{ id: RepeatTypeFilter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "track", label: "Tracks" },
	{ id: "album", label: "Albums" },
	{ id: "artist", label: "Artists" },
];

// inside component:
const [typeFilter, setTypeFilter] = useState<RepeatTypeFilter>("all");
const filtered =
	repeats === undefined
		? undefined
		: typeFilter === "all"
			? repeats
			: repeats.filter((repeat) => repeat.type === typeFilter);
```

Render chips under the section header (button group, not cards):

```tsx
<div className="flex flex-wrap gap-2">
	{FILTERS.map((filter) => (
		<button
			key={filter.id}
			type="button"
			onClick={() => setTypeFilter(filter.id)}
			className={cn(
				"rounded-md px-2.5 py-1 text-sm",
				typeFilter === filter.id
					? "bg-foreground text-background"
					: "bg-muted text-muted-foreground hover:text-foreground",
			)}
		>
			{filter.label}
		</button>
	))}
</div>
```

Empty states:

- `repeats.length === 0` → keep “No cross-source repeats yet.”
- `filtered.length === 0` → `No {Tracks|Albums|Artists} repeats.` based on filter

- [ ] **Step 3: Dense `RepeatRow`**

Replace artwork + subtitle/sources/timestamps with:

```tsx
function RepeatRow({
	repeat,
	visitSince,
}: {
	repeat: NonNullable<typeof api.musicFunnel.listRepeats._returnType>[number];
	visitSince: number | null;
}) {
	const isNew =
		visitSince !== null && isNewSince(repeat.becameRepeatAt, visitSince);
	const title =
		repeat.type === "track"
			? repeat.trackName
			: repeat.type === "album"
				? repeat.albumName
				: repeat.name;

	return (
		<li>
			<MusicFunnelNewChrome isNew={isNew}>
				<div className="flex items-center gap-2.5 py-1">
					<RepeatTypeIcon type={repeat.type} />
					<p className="min-w-0 flex-1 truncate font-medium">{title}</p>
					{(repeat.type === "album" || repeat.type === "artist") && (
						<span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs tabular-nums">
							<Music2 className="size-3.5" aria-hidden />
							{repeat.contributingTrackCount}
						</span>
					)}
					<span className="shrink-0 font-semibold tabular-nums text-sm">
						{repeat.sourceCount}×
					</span>
					{isNew ? <MusicFunnelNewBadge /> : null}
				</div>
			</MusicFunnelNewChrome>
		</li>
	);
}

function RepeatTypeIcon({
	type,
}: {
	type: "track" | "album" | "artist";
}) {
	const className = cn(
		"flex size-7 shrink-0 items-center justify-center rounded",
		type === "track" && "bg-sky-500/15 text-sky-700 dark:text-sky-300",
		type === "album" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
		type === "artist" && "bg-violet-500/15 text-violet-700 dark:text-violet-300",
	);
	return (
		<span className={className} aria-label={type}>
			{type === "track" ? (
				<Music2 className="size-3.5" />
			) : type === "album" ? (
				<Disc3 className="size-3.5" />
			) : (
				<User className="size-3.5" />
			)}
		</span>
	);
}
```

Remove unused `Image`, `formatRelativeTime`, and old `getRepeatDisplay` helpers if nothing else needs them.

Tighten `MusicFunnelNewChrome` padding if rows still feel tall — only adjust the chrome wrapper usage/classes in this file; do not redesign timeline New chrome.

- [ ] **Step 4: Manual check**

1. Open `/music-funnel` → Repeats.
2. Chips filter All / Tracks / Albums / Artists; empty copy when none.
3. Rows are single-line-ish: icon, title, optional contributing count, multiplier, New.
4. Run a sync (or trigger backfill path); after backfill, Albums should not show singles/EPs.
5. Missed banner still loads; album “new” counts align with gated feed.

- [ ] **Step 5: Lint / typecheck**

Run: `pnpm check` and `pnpm typecheck`  
Expected: clean for touched files

- [ ] **Step 6: Commit**

```bash
git add src/app/music-funnel/_components/music-funnel-repeat-lists.tsx src/app/music-funnel/_components/music-funnel-missed-banner.tsx
git commit -m "$(cat <<'EOF'
feat: densify music-funnel repeats rows and add type filter chips

EOF
)"
```

---

### Task 5: Mark ideas planned

**Files:**
- Modify: `docs/ideas/2026-07-17-repeats-type-filter-and-denser-rows.md`
- Modify: `docs/ideas/2026-07-17-stricter-album-type-for-repeats.md`

- [ ] **Step 1: Update frontmatter + Notes**

Set `status: planned` on both. Add Notes bullet:

```markdown
- Planned — spec: `docs/superpowers/specs/2026-07-17-repeats-type-filter-density-and-album-gate-design.md`, plan: `docs/superpowers/plans/2026-07-17-repeats-type-filter-density-and-album-gate.md`
```

- [ ] **Step 2: Commit**

```bash
git add docs/ideas/2026-07-17-repeats-type-filter-and-denser-rows.md docs/ideas/2026-07-17-stricter-album-type-for-repeats.md docs/superpowers/plans/2026-07-17-repeats-type-filter-density-and-album-gate.md
git commit -m "$(cat <<'EOF'
docs: plan music-funnel repeats filter, density, and album gate

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Type chips All/Tracks/Albums/Artists, client filter | Task 4 |
| Empty filter copy | Task 4 |
| Cap 100, no pagination | Tasks 2 + 4 |
| Dense row: type icons, no art, multiplier, New, contributing icon+count | Task 4 |
| Drop sources / timestamps / type text label | Task 4 |
| Gate album/compilation only; exclude single + missing | Tasks 1–2 |
| Persist `album_type` on ingest (no extra call) | Tasks 1–2 |
| One-shot backfill via Spotify album lookup | Task 3 |
| Sync analytics aligned (`computeAlbumRepeatSummaries`) | Task 1 |
| Missed banner / New unchanged semantics | Task 4 (limit only) |
| Ideas → planned | Task 5 |
