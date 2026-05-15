# For Later Albums Phase 2: Bidirectional RYM Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link For Later Spotify backlog albums to Rate Your Music scrapes automatically when either side arrives first.

**Architecture:** Add one focused Convex utility module for album/artist normalization, link upserts, and bidirectional matching. The playlist upsert path calls Spotify-to-RYM matching after it writes a `forLaterAlbumItems` row, while RYM scrape ingest calls RYM-to-For-Later matching after taxonomy sync. `rateYourMusicSpotifyAlbumLinks` remains the source of truth, with `forLaterAlbumItems.rymScrapeId` and `rateYourMusicScrapes.spotifyAlbumConvexId` patched as denormalized conveniences.

**Tech Stack:** Convex mutations/helpers, TypeScript, `node:test`, Biome, existing `spotifyAlbums`, `rateYourMusicScrapes`, `forLaterAlbumItems`, and `rateYourMusicSpotifyAlbumLinks` tables.

---

## File Structure

- Create `convex/_utils/albumMatching.ts`: pure normalization helpers plus Convex matching helpers for exact Spotify id and title-plus-one-artist matching.
- Create `convex/_utils/albumMatching.test.ts`: `node:test` unit tests for title normalization, artist normalization, one-artist overlap, and title/artist candidate selection.
- Create `convex/forLaterAlbums.matching-source.test.ts`: source-contract test proving the Phase 1 For Later upsert flow calls `matchRymForForLaterAlbum` and returns/counts matches.
- Create `convex/rateYourMusicScrapes.matching-source.test.ts`: source-contract test proving RYM scrape ingest calls `matchForLaterAlbumsForRymScrape` after taxonomy sync.
- Modify `convex/forLaterAlbums.ts`: compute or preserve `albumTitleKey` and `artistKeys`, call `matchRymForForLaterAlbum` after each item upsert, and return whether a match was created.
- Modify `convex/rateYourMusicScrapes.ts`: call `matchForLaterAlbumsForRymScrape` after `syncReleaseTaxonomy`.
- Modify `src/lib/for-later-albums-sync.ts`: increment `rymMatchesCreated` from the `upsertForLaterAlbumItem` mutation result.

Do not edit `docs/for-later-albums-prd.md`. This plan assumes Phase 1 already added `forLaterAlbumItems`, `forLaterSyncRuns`, `rateYourMusicSpotifyAlbumLinks`, and `convex/forLaterAlbums.ts`.

---

## Phase 2 Boundaries

Build only these behaviors:

- A RYM scrape with `spotifyAlbumId` matching `spotifyAlbums.spotifyAlbumId` links with method `spotify_id`.
- If no exact Spotify id match exists, equal normalized album title plus any one normalized artist overlap links with method `title_artist`.
- Spotify playlist upsert links an existing RYM scrape when the backlog row is written.
- RYM scrape upsert links existing For Later backlog rows after scrape data and taxonomy rows are saved.
- `rateYourMusicScrapes.spotifyAlbumConvexId` is patched only when one canonical Spotify album match is confident.

Do not build AI discovery, UI filters, cron automation, manual link UI, or any Phase 3-5 behavior.

Phase 1 contract expected by this plan:

```typescript
export const upsertForLaterAlbumItem = mutation({
	args: {
		userId: v.string(),
		albumId: v.id("spotifyAlbums"),
		spotifyAlbumId: v.string(),
		albumName: v.string(),
		artistNames: v.array(v.string()),
		sourceTrackIds: v.array(v.string()),
		playlistAddedAt: v.optional(v.number()),
		now: v.number(),
	},
});
```

If this contract is missing, Phase 1 is incomplete and must be finished before implementing Phase 2.

---

## Task 1: Matcher Unit Tests

**Files:**
- Create: `convex/_utils/albumMatching.test.ts`
- Create in Task 2: `convex/_utils/albumMatching.ts`

- [ ] **Step 1: Write failing matcher tests**

Create `convex/_utils/albumMatching.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	artistKeysIntersect,
	buildArtistKeys,
	findTitleArtistMatch,
	normalizeAlbumTitle,
	normalizeArtistName,
} from "./albumMatching";

test("normalizeAlbumTitle trims, lowercases, and collapses whitespace", () => {
	assert.equal(normalizeAlbumTitle("  Dragon   New Warm Mountain  "), "dragon new warm mountain");
});

test("normalizeAlbumTitle removes conservative edition suffixes", () => {
	assert.equal(normalizeAlbumTitle("Fetch the Bolt Cutters (Deluxe Edition)"), "fetch the bolt cutters");
	assert.equal(normalizeAlbumTitle("Blue Rev (2022 Remaster)"), "blue rev");
});

test("normalizeAlbumTitle keeps ordinary parentheticals", () => {
	assert.equal(normalizeAlbumTitle("Sometimes I Might Be Introvert (Live)"), "sometimes i might be introvert (live)");
});

test("normalizeArtistName trims, lowercases, and collapses whitespace", () => {
	assert.equal(normalizeArtistName("  Big   Thief "), "big thief");
});

test("buildArtistKeys removes blank artist names", () => {
	assert.deepEqual(buildArtistKeys(["Big Thief", "  ", "Adrianne Lenker"]), [
		"big thief",
		"adrianne lenker",
	]);
});

test("artistKeysIntersect returns one shared normalized artist key", () => {
	assert.equal(
		artistKeysIntersect(["phoebe bridgers", "lucy dacus"], ["Julien Baker", "Phoebe Bridgers"]),
		"phoebe bridgers",
	);
});

test("artistKeysIntersect returns null when no artist overlaps", () => {
	assert.equal(artistKeysIntersect(["weyes blood"], ["jessica pratt"]), null);
});

test("findTitleArtistMatch matches same normalized title and one artist overlap", () => {
	const match = findTitleArtistMatch(
		{
			albumTitleKey: normalizeAlbumTitle("The Record"),
			artistKeys: buildArtistKeys(["boygenius", "Phoebe Bridgers"]),
		},
		[
			{
				id: "scrape_1",
				albumTitle: "The Record",
				artistNames: ["boygenius"],
			},
		],
	);

	assert.deepEqual(match, {
		candidate: {
			id: "scrape_1",
			albumTitle: "The Record",
			artistNames: ["boygenius"],
		},
		matchedArtistKey: "boygenius",
	});
});

test("findTitleArtistMatch rejects same title with no artist overlap", () => {
	const match = findTitleArtistMatch(
		{
			albumTitleKey: normalizeAlbumTitle("Rat Saw God"),
			artistKeys: buildArtistKeys(["Wednesday"]),
		},
		[
			{
				id: "scrape_2",
				albumTitle: "Rat Saw God",
				artistNames: ["MJ Lenderman"],
			},
		],
	);

	assert.equal(match, null);
});
```

- [ ] **Step 2: Run the matcher tests and verify failure**

Run:

```bash
node --test convex/_utils/albumMatching.test.ts
```

Expected: FAIL with an import error such as `Cannot find module` for `convex/_utils/albumMatching.ts`.

---

## Task 2: Pure Matching Helpers

**Files:**
- Create: `convex/_utils/albumMatching.ts`
- Test: `convex/_utils/albumMatching.test.ts`

- [ ] **Step 1: Implement pure helper exports**

Create `convex/_utils/albumMatching.ts`:

```typescript
import type { Id } from "../_generated/dataModel";

export type RymMatchMethod = "spotify_id" | "title_artist";

export type RymMatchResult = {
	scrapeId?: Id<"rateYourMusicScrapes">;
	method?: RymMatchMethod;
	matchedArtistKey?: string;
};

type TitleArtistTarget = {
	albumTitleKey: string;
	artistKeys: string[];
};

type TitleArtistCandidate = {
	albumTitle: string;
	artistNames: string[];
};

export function normalizeAlbumTitle(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/\s+\((deluxe|explicit|clean|remaster(ed)?|bonus|bonus tracks|anniversary edition).*\)$/i, "");
}

export function normalizeArtistName(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildArtistKeys(values: string[]): string[] {
	return values.map(normalizeArtistName).filter((value) => value.length > 0);
}

export function artistKeysIntersect(left: string[], right: string[]): string | null {
	const leftKeys = new Set(left.map(normalizeArtistName));
	for (const key of right.map(normalizeArtistName)) {
		if (key && leftKeys.has(key)) {
			return key;
		}
	}
	return null;
}

export function findTitleArtistMatch<TCandidate extends TitleArtistCandidate>(
	target: TitleArtistTarget,
	candidates: TCandidate[],
): { candidate: TCandidate; matchedArtistKey: string } | null {
	for (const candidate of candidates) {
		if (normalizeAlbumTitle(candidate.albumTitle) !== target.albumTitleKey) {
			continue;
		}

		const matchedArtistKey = artistKeysIntersect(
			target.artistKeys,
			buildArtistKeys(candidate.artistNames),
		);
		if (matchedArtistKey) {
			return { candidate, matchedArtistKey };
		}
	}

	return null;
}
```

This file imports `Id` for the `RymMatchResult` type. Task 3 adds the Convex DB context imports when the matching entry points are implemented.

- [ ] **Step 2: Run matcher tests and verify pass**

Run:

```bash
node --test convex/_utils/albumMatching.test.ts
```

Expected: PASS with exit code 0 and a final summary showing `# fail 0`.

- [ ] **Step 3: Run Biome on the helper and test**

Run:

```bash
pnpm exec biome check --write convex/_utils/albumMatching.ts convex/_utils/albumMatching.test.ts
```

Expected: PASS with exit code 0. Biome may write formatting fixes; rerun the same command if it reports files changed.

- [ ] **Step 4: Commit pure helpers**

Run:

```bash
git add convex/_utils/albumMatching.ts convex/_utils/albumMatching.test.ts
git commit -m "$(cat <<'EOF'
feat: add for later RYM matching helpers

EOF
)"
```

Expected: commit succeeds if commits are authorized.

---

## Task 3: Convex Matching Helpers

**Files:**
- Modify: `convex/_utils/albumMatching.ts`
- Test: `convex/_utils/albumMatching.test.ts`

- [ ] **Step 1: Extend tests to require Convex matching entry points**

Append these tests to `convex/_utils/albumMatching.test.ts`:

```typescript
import {
	matchForLaterAlbumsForRymScrape,
	matchRymForForLaterAlbum,
} from "./albumMatching";

test("albumMatching exports the For Later to RYM matching entry point", () => {
	assert.equal(typeof matchRymForForLaterAlbum, "function");
});

test("albumMatching exports the RYM scrape to For Later matching entry point", () => {
	assert.equal(typeof matchForLaterAlbumsForRymScrape, "function");
});
```

Because ESM imports must stay at the top of the file, merge the new imported names into the existing import block instead of leaving a second import block below the tests. The final import block should be:

```typescript
import {
	artistKeysIntersect,
	buildArtistKeys,
	findTitleArtistMatch,
	matchForLaterAlbumsForRymScrape,
	matchRymForForLaterAlbum,
	normalizeAlbumTitle,
	normalizeArtistName,
} from "./albumMatching";
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test convex/_utils/albumMatching.test.ts
```

Expected: FAIL with a named export error for `matchForLaterAlbumsForRymScrape` or `matchRymForForLaterAlbum`.

- [ ] **Step 3: Replace helper file with complete matching implementation**

Replace `convex/_utils/albumMatching.ts` with:

```typescript
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type RymMatchMethod = "spotify_id" | "title_artist";

export type RymMatchResult = {
	scrapeId?: Id<"rateYourMusicScrapes">;
	method?: RymMatchMethod;
	matchedArtistKey?: string;
};

type TitleArtistTarget = {
	albumTitleKey: string;
	artistKeys: string[];
};

type TitleArtistCandidate = {
	albumTitle: string;
	artistNames: string[];
};

export function normalizeAlbumTitle(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/\s+\((deluxe|explicit|clean|remaster(ed)?|bonus|bonus tracks|anniversary edition).*\)$/i, "");
}

export function normalizeArtistName(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildArtistKeys(values: string[]): string[] {
	return values.map(normalizeArtistName).filter((value) => value.length > 0);
}

export function artistKeysIntersect(left: string[], right: string[]): string | null {
	const leftKeys = new Set(left.map(normalizeArtistName));
	for (const key of right.map(normalizeArtistName)) {
		if (key && leftKeys.has(key)) {
			return key;
		}
	}
	return null;
}

export function findTitleArtistMatch<TCandidate extends TitleArtistCandidate>(
	target: TitleArtistTarget,
	candidates: TCandidate[],
): { candidate: TCandidate; matchedArtistKey: string } | null {
	for (const candidate of candidates) {
		if (normalizeAlbumTitle(candidate.albumTitle) !== target.albumTitleKey) {
			continue;
		}

		const matchedArtistKey = artistKeysIntersect(
			target.artistKeys,
			buildArtistKeys(candidate.artistNames),
		);
		if (matchedArtistKey) {
			return { candidate, matchedArtistKey };
		}
	}

	return null;
}

function getRymArtistNames(scrape: Doc<"rateYourMusicScrapes">): string[] {
	return scrape.artists.map((artist) => artist.name);
}

async function upsertRymSpotifyAlbumLink(
	ctx: MutationCtx,
	args: {
		scrapeId: Id<"rateYourMusicScrapes">;
		albumId: Id<"spotifyAlbums">;
		spotifyAlbumId?: string;
		method: RymMatchMethod;
		matchedArtistKey?: string;
		now: number;
	},
): Promise<void> {
	const existing = await ctx.db
		.query("rateYourMusicSpotifyAlbumLinks")
		.withIndex("by_scrapeId_albumId", (q) =>
			q.eq("scrapeId", args.scrapeId).eq("albumId", args.albumId),
		)
		.first();

	const patch = {
		spotifyAlbumId: args.spotifyAlbumId,
		method: args.method,
		matchedArtistKey: args.matchedArtistKey,
		updatedAt: args.now,
	};

	if (existing) {
		await ctx.db.patch(existing._id, patch);
		return;
	}

	await ctx.db.insert("rateYourMusicSpotifyAlbumLinks", {
		scrapeId: args.scrapeId,
		albumId: args.albumId,
		...patch,
		createdAt: args.now,
	});
}

async function patchForLaterItemMatch(
	ctx: MutationCtx,
	args: {
		forLaterAlbumItemId: Id<"forLaterAlbumItems">;
		scrapeId: Id<"rateYourMusicScrapes">;
		method: RymMatchMethod;
		now: number;
	},
): Promise<void> {
	await ctx.db.patch(args.forLaterAlbumItemId, {
		rymScrapeId: args.scrapeId,
		rymMatchMethod: args.method,
		rymMatchedAt: args.now,
		updatedAt: args.now,
	});
}

async function patchScrapeAlbumConvexId(
	ctx: MutationCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
	albumId: Id<"spotifyAlbums">,
): Promise<void> {
	await ctx.db.patch(scrapeId, { spotifyAlbumConvexId: albumId });
}

export async function matchRymForForLaterAlbum(
	ctx: MutationCtx,
	args: {
		userId: string;
		forLaterAlbumItemId: Id<"forLaterAlbumItems">;
		spotifyAlbumId: string;
		albumTitleKey: string;
		artistKeys: string[];
		now: number;
	},
): Promise<RymMatchResult> {
	const item = await ctx.db.get(args.forLaterAlbumItemId);
	if (!item || item.userId !== args.userId || item.spotifyAlbumId !== args.spotifyAlbumId) {
		return {};
	}

	const exactScrape = await ctx.db
		.query("rateYourMusicScrapes")
		.withIndex("by_spotifyAlbumId", (q) => q.eq("spotifyAlbumId", args.spotifyAlbumId))
		.first();

	if (exactScrape) {
		await upsertRymSpotifyAlbumLink(ctx, {
			scrapeId: exactScrape._id,
			albumId: item.albumId,
			spotifyAlbumId: args.spotifyAlbumId,
			method: "spotify_id",
			now: args.now,
		});
		await patchForLaterItemMatch(ctx, {
			forLaterAlbumItemId: item._id,
			scrapeId: exactScrape._id,
			method: "spotify_id",
			now: args.now,
		});
		await patchScrapeAlbumConvexId(ctx, exactScrape._id, item.albumId);
		return { scrapeId: exactScrape._id, method: "spotify_id" };
	}

	const scrapes = await ctx.db
		.query("rateYourMusicScrapes")
		.withIndex("by_updatedAt")
		.order("desc")
		.collect();
	const titleArtistMatch = findTitleArtistMatch(
		{ albumTitleKey: args.albumTitleKey, artistKeys: args.artistKeys },
		scrapes.map((scrape) => ({
			...scrape,
			artistNames: getRymArtistNames(scrape),
		})),
	);

	if (!titleArtistMatch) {
		return {};
	}

	await upsertRymSpotifyAlbumLink(ctx, {
		scrapeId: titleArtistMatch.candidate._id,
		albumId: item.albumId,
		spotifyAlbumId: args.spotifyAlbumId,
		method: "title_artist",
		matchedArtistKey: titleArtistMatch.matchedArtistKey,
		now: args.now,
	});
	await patchForLaterItemMatch(ctx, {
		forLaterAlbumItemId: item._id,
		scrapeId: titleArtistMatch.candidate._id,
		method: "title_artist",
		now: args.now,
	});
	await patchScrapeAlbumConvexId(ctx, titleArtistMatch.candidate._id, item.albumId);

	return {
		scrapeId: titleArtistMatch.candidate._id,
		method: "title_artist",
		matchedArtistKey: titleArtistMatch.matchedArtistKey,
	};
}

export async function matchForLaterAlbumsForRymScrape(
	ctx: MutationCtx,
	args: {
		scrapeId: Id<"rateYourMusicScrapes">;
		spotifyAlbumId?: string;
		albumTitle: string;
		artists: Array<{ name: string }>;
		now: number;
	},
): Promise<number> {
	const userId = process.env.SPOTIFY_SYNC_USER_ID;
	if (!userId) {
		throw new Error("SPOTIFY_SYNC_USER_ID not configured");
	}

	const matchedAlbumIds = new Set<Id<"spotifyAlbums">>();
	let matchesCreated = 0;

	if (args.spotifyAlbumId) {
		const album = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_spotifyAlbumId", (q) => q.eq("spotifyAlbumId", args.spotifyAlbumId))
			.first();

		if (album) {
			const items = await ctx.db
				.query("forLaterAlbumItems")
				.withIndex("by_userId_spotifyAlbumId", (q) =>
					q.eq("userId", userId).eq("spotifyAlbumId", args.spotifyAlbumId ?? ""),
				)
				.collect();

			for (const item of items) {
				await upsertRymSpotifyAlbumLink(ctx, {
					scrapeId: args.scrapeId,
					albumId: item.albumId,
					spotifyAlbumId: args.spotifyAlbumId,
					method: "spotify_id",
					now: args.now,
				});
				await patchForLaterItemMatch(ctx, {
					forLaterAlbumItemId: item._id,
					scrapeId: args.scrapeId,
					method: "spotify_id",
					now: args.now,
				});
				matchedAlbumIds.add(item.albumId);
				matchesCreated += 1;
			}

			if (matchedAlbumIds.size === 1) {
				await patchScrapeAlbumConvexId(ctx, args.scrapeId, album._id);
			}

			return matchesCreated;
		}
	}

	const albumTitleKey = normalizeAlbumTitle(args.albumTitle);
	const rymArtistKeys = buildArtistKeys(args.artists.map((artist) => artist.name));
	const candidates = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_userId_albumTitleKey", (q) =>
			q.eq("userId", userId).eq("albumTitleKey", albumTitleKey),
		)
		.collect();

	for (const item of candidates) {
		const matchedArtistKey = artistKeysIntersect(item.artistKeys, rymArtistKeys);
		if (!matchedArtistKey) {
			continue;
		}

		await upsertRymSpotifyAlbumLink(ctx, {
			scrapeId: args.scrapeId,
			albumId: item.albumId,
			spotifyAlbumId: item.spotifyAlbumId,
			method: "title_artist",
			matchedArtistKey,
			now: args.now,
		});
		await patchForLaterItemMatch(ctx, {
			forLaterAlbumItemId: item._id,
			scrapeId: args.scrapeId,
			method: "title_artist",
			now: args.now,
		});
		matchedAlbumIds.add(item.albumId);
		matchesCreated += 1;
	}

	if (matchedAlbumIds.size === 1) {
		const [albumId] = matchedAlbumIds;
		if (albumId) {
			await patchScrapeAlbumConvexId(ctx, args.scrapeId, albumId);
		}
	}

	return matchesCreated;
}
```

- [ ] **Step 4: Run matcher tests and verify pass**

Run:

```bash
node --test convex/_utils/albumMatching.test.ts
```

Expected: PASS with exit code 0 and a final summary showing `# fail 0`.

- [ ] **Step 5: Run Biome on the matcher files**

Run:

```bash
pnpm exec biome check --write convex/_utils/albumMatching.ts convex/_utils/albumMatching.test.ts
```

Expected: PASS with exit code 0. Biome may write formatting fixes; rerun the same command if it reports files changed.

- [ ] **Step 6: Commit Convex matching helpers**

Run:

```bash
git add convex/_utils/albumMatching.ts convex/_utils/albumMatching.test.ts
git commit -m "$(cat <<'EOF'
feat: match for later albums to RYM scrapes

EOF
)"
```

Expected: commit succeeds if commits are authorized.

---

## Task 4: For Later Upsert Flow

**Files:**
- Modify: `convex/forLaterAlbums.ts`
- Modify: `src/lib/for-later-albums-sync.ts`
- Create: `convex/forLaterAlbums.matching-source.test.ts`

- [ ] **Step 1: Write failing source-contract test**

Create `convex/forLaterAlbums.matching-source.test.ts`:

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "convex", "forLaterAlbums.ts"), "utf8");

test("For Later album upsert imports RYM matching helpers", () => {
	assert.match(source, /matchRymForForLaterAlbum/);
	assert.match(source, /normalizeAlbumTitle/);
	assert.match(source, /buildArtistKeys/);
});

test("For Later album upsert calls RYM matching after item upsert", () => {
	const upsertIndex = source.indexOf("upsertForLaterAlbumItem");
	const matchIndex = source.indexOf("await matchRymForForLaterAlbum");

	assert.ok(upsertIndex >= 0, "upsertForLaterAlbumItem must exist");
	assert.ok(matchIndex > upsertIndex, "matchRymForForLaterAlbum must be called in the upsert flow");
	assert.match(source, /rymMatch/);
});
```

- [ ] **Step 2: Run source-contract test and verify failure**

Run:

```bash
node --test convex/forLaterAlbums.matching-source.test.ts
```

Expected: FAIL because `convex/forLaterAlbums.ts` does not yet import or call `matchRymForForLaterAlbum`.

- [ ] **Step 3: Add imports to `convex/forLaterAlbums.ts`**

Add this import near existing `_utils` imports:

```typescript
import {
	buildArtistKeys,
	matchRymForForLaterAlbum,
	normalizeAlbumTitle,
} from "./_utils/albumMatching";
```

- [ ] **Step 4: Compute match keys in the upsert payload**

Inside `upsertForLaterAlbumItem.handler`, before the `ctx.db.insert` or `ctx.db.patch` call that writes `forLaterAlbumItems`, compute keys from the Phase 1 album input:

```typescript
const albumTitleKey = normalizeAlbumTitle(args.albumName);
const artistKeys = buildArtistKeys(args.artistNames);
```

The resulting write to `forLaterAlbumItems` must include:

```typescript
albumTitleKey,
artistKeys,
```

- [ ] **Step 5: Call `matchRymForForLaterAlbum` after the item is written**

After the code has an `itemId: Id<"forLaterAlbumItems">`, call the matcher:

```typescript
const rymMatch = await matchRymForForLaterAlbum(ctx, {
	userId: args.userId,
	forLaterAlbumItemId: itemId,
	spotifyAlbumId: args.spotifyAlbumId,
	albumTitleKey,
	artistKeys,
	now,
});
```

The call must happen after the row exists, because the matcher reads the row to get `albumId` and patches the same row if it finds a scrape.

- [ ] **Step 6: Return match status from the upsert mutation**

Make `upsertForLaterAlbumItem.handler` return this shape:

```typescript
return {
	itemId,
	created,
	rymMatch,
	rymMatchCreated: rymMatch.scrapeId !== undefined,
};
```

The existing `created` boolean must continue to mean "inserted a new For Later row in this call" so Phase 1 sync stats remain stable.

- [ ] **Step 7: Count matches in sync utility**

In `src/lib/for-later-albums-sync.ts`, inside the loop that calls `api.forLaterAlbums.upsertForLaterAlbumItem`, increment the Phase 1 `rymMatchesCreated` counter:

```typescript
const upsertResult = await convex.mutation(api.forLaterAlbums.upsertForLaterAlbumItem, {
	userId,
	spotifyAlbumId: album.spotifyAlbumId,
	albumId,
	albumName: album.name,
	artistNames: album.artistNames,
	sourceTrackIds: album.sourceTrackIds,
	playlistAddedAt: album.playlistAddedAt,
	now,
});

if (upsertResult.rymMatchCreated) {
	rymMatchesCreated += 1;
}
```

This keeps `forLaterSyncRuns.rymMatchesCreated` accurate for matches created during playlist sync.

- [ ] **Step 8: Run source-contract test and verify pass**

Run:

```bash
node --test convex/forLaterAlbums.matching-source.test.ts
```

Expected: PASS with exit code 0 and a final summary showing `# fail 0`.

- [ ] **Step 9: Run matcher tests**

Run:

```bash
node --test convex/_utils/albumMatching.test.ts
```

Expected: PASS with exit code 0 and a final summary showing `# fail 0`.

- [ ] **Step 10: Commit For Later upsert wiring**

Run:

```bash
git add convex/forLaterAlbums.ts src/lib/for-later-albums-sync.ts convex/forLaterAlbums.matching-source.test.ts
git commit -m "$(cat <<'EOF'
feat: match RYM scrapes during for later upserts

EOF
)"
```

Expected: commit succeeds if commits are authorized.

---

## Task 5: RYM Scrape Upsert Flow

**Files:**
- Modify: `convex/rateYourMusicScrapes.ts`
- Create: `convex/rateYourMusicScrapes.matching-source.test.ts`
- Test: `convex/_utils/albumMatching.test.ts`

- [ ] **Step 1: Write failing RYM scrape source-contract test**

Create `convex/rateYourMusicScrapes.matching-source.test.ts`:

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "convex", "rateYourMusicScrapes.ts"), "utf8");

test("RYM scrape ingest imports For Later matching", () => {
	assert.match(source, /matchForLaterAlbumsForRymScrape/);
});

test("RYM scrape ingest matches after taxonomy sync", () => {
	const taxonomyIndex = source.indexOf("await syncReleaseTaxonomy(ctx, scrapeId, args, now)");
	const matchIndex = source.indexOf("await matchForLaterAlbumsForRymScrape");

	assert.ok(taxonomyIndex >= 0, "taxonomy sync call must exist");
	assert.ok(matchIndex > taxonomyIndex, "matching must run after taxonomy sync");
	assert.match(source, /scrapeId/);
	assert.match(source, /spotifyAlbumId: args\.spotifyAlbumId/);
	assert.match(source, /albumTitle: args\.albumTitle/);
	assert.match(source, /artists: args\.artists/);
});
```

- [ ] **Step 2: Run source-contract test and verify failure**

Run:

```bash
node --test convex/rateYourMusicScrapes.matching-source.test.ts
```

Expected: FAIL because `convex/rateYourMusicScrapes.ts` does not yet import or call `matchForLaterAlbumsForRymScrape`.

- [ ] **Step 3: Import the RYM-to-For-Later matcher**

In `convex/rateYourMusicScrapes.ts`, add this import after the taxonomy import block:

```typescript
import { matchForLaterAlbumsForRymScrape } from "./_utils/albumMatching";
```

- [ ] **Step 4: Call matcher after taxonomy sync**

In `upsertRateYourMusicScrape.handler`, immediately after:

```typescript
await syncReleaseTaxonomy(ctx, scrapeId, args, now);
```

add:

```typescript
await matchForLaterAlbumsForRymScrape(ctx, {
	scrapeId,
	spotifyAlbumId: args.spotifyAlbumId?.trim() || undefined,
	albumTitle: args.albumTitle,
	artists: args.artists,
	now,
});
```

Keep `return scrapeId;` after the matching call.

- [ ] **Step 5: Run RYM scrape source-contract test and verify pass**

Run:

```bash
node --test convex/rateYourMusicScrapes.matching-source.test.ts
```

Expected: PASS with exit code 0 and a final summary showing `# fail 0`.

- [ ] **Step 6: Run matcher tests**

Run:

```bash
node --test convex/_utils/albumMatching.test.ts
```

Expected: PASS with exit code 0 and a final summary showing `# fail 0`.

- [ ] **Step 7: Commit RYM scrape wiring**

Run:

```bash
git add convex/rateYourMusicScrapes.ts convex/rateYourMusicScrapes.matching-source.test.ts
git commit -m "$(cat <<'EOF'
feat: match for later albums during RYM scrape ingest

EOF
)"
```

Expected: commit succeeds if commits are authorized.

---

## Task 6: Typecheck, Lint, And Acceptance Verification

**Files:**
- Verify: `convex/_utils/albumMatching.ts`
- Verify: `convex/_utils/albumMatching.test.ts`
- Verify: `convex/forLaterAlbums.ts`
- Verify: `convex/forLaterAlbums.matching-source.test.ts`
- Verify: `convex/rateYourMusicScrapes.ts`
- Verify: `convex/rateYourMusicScrapes.matching-source.test.ts`
- Verify: `src/lib/for-later-albums-sync.ts`

- [ ] **Step 1: Run all Phase 2 tests**

Run:

```bash
node --test convex/_utils/albumMatching.test.ts convex/forLaterAlbums.matching-source.test.ts convex/rateYourMusicScrapes.matching-source.test.ts
```

Expected: PASS with exit code 0 and a final summary showing `# fail 0`.

- [ ] **Step 2: Run Biome on changed files**

Run:

```bash
pnpm exec biome check --write convex/_utils/albumMatching.ts convex/_utils/albumMatching.test.ts convex/forLaterAlbums.ts convex/forLaterAlbums.matching-source.test.ts convex/rateYourMusicScrapes.ts convex/rateYourMusicScrapes.matching-source.test.ts src/lib/for-later-albums-sync.ts
```

Expected: PASS with exit code 0. Biome may write formatting fixes; rerun the same command until it exits without further changes.

- [ ] **Step 3: Run TypeScript typecheck**

Run:

```bash
SKIP_ENV_VALIDATION=1 pnpm typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Manually verify acceptance scenarios in code**

Confirm these code facts before marking Phase 2 complete:

```text
1. matchRymForForLaterAlbum queries rateYourMusicScrapes.by_spotifyAlbumId before title/artist fallback.
2. Exact id matches write rateYourMusicSpotifyAlbumLinks.method = "spotify_id".
3. Title/artist fallback requires normalizeAlbumTitle equality and artistKeysIntersect non-null.
4. Title/artist matches write rateYourMusicSpotifyAlbumLinks.method = "title_artist".
5. Same title with no artist overlap returns no match.
6. RYM scrape ingest still calls releaseKindFromPathname before writing, so /release/single/ URLs remain rejected by existing validation.
7. rateYourMusicScrapes.spotifyAlbumConvexId is patched only after an exact match or one title/artist canonical album match.
```

- [ ] **Step 5: Commit final verification fixes**

If verification required fixes, run:

```bash
git add convex/_utils/albumMatching.ts convex/_utils/albumMatching.test.ts convex/forLaterAlbums.ts convex/forLaterAlbums.matching-source.test.ts convex/rateYourMusicScrapes.ts convex/rateYourMusicScrapes.matching-source.test.ts src/lib/for-later-albums-sync.ts
git commit -m "$(cat <<'EOF'
fix: finalize bidirectional RYM matching verification

EOF
)"
```

Expected: commit succeeds if commits are authorized. If Step 1 through Step 4 passed without changes, skip this commit.

---

## Execution Notes

- Use classic function declarations for named functions.
- Use `type` aliases instead of interfaces.
- Keep `rateYourMusicSpotifyAlbumLinks` as the source of truth for RYM-to-Spotify album links.
- Keep `forLaterAlbumItems.rymScrapeId`, `forLaterAlbumItems.rymMatchMethod`, `forLaterAlbumItems.rymMatchedAt`, and `rateYourMusicScrapes.spotifyAlbumConvexId` as denormalized convenience fields only.
- Do not add global title/artist matching across every `spotifyAlbums` row in Phase 2. Limit RYM-to-Spotify fallback matching to For Later backlog rows scoped by `SPOTIFY_SYNC_USER_ID`.
- Do not add new schema fields to `rateYourMusicScrapes` in this phase. Spotify-to-RYM title/artist fallback scans existing RYM scrapes by `by_updatedAt` and compares normalized keys in memory, which is acceptable for this personal app phase.
- Preserve existing RYM album/EP release-kind validation. `/release/single/` must stay rejected by `upsertRateYourMusicScrape`.

## Self-Review Checklist

- Phase 2 user stories map to tasks: exact Spotify id matching is Task 3, title plus one artist matching is Task 3, scrape-after-sync matching is Task 5, and sync-after-scrape matching is Task 4.
- The plan contains no Phase 3 AI discovery, Phase 4 UI filters, or Phase 5 automation work.
- Every changed file has a stated responsibility and verification command.
- The plan uses concrete code snippets, exact commands, and expected outcomes.
