# For Later Albums Phase 3 AI RYM Link Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Goal:** Build the Phase 3 API path that searches for likely Rate Your Music album/EP release URLs for active unmatched For Later album backlog items and stores discovery status on `forLaterAlbumItems`.
> **Policy:** Discovery runs only when this route (or the Phase 4 UI that calls it) is invoked. Playlist sync and Phase 5 cron must never enqueue items (`queued`) or call discovery automatically.
> **Architecture:** Keep URL validation in one shared pure helper, add thin Convex query/mutation functions for candidate selection and status writes, put mockable orchestration in `src/lib/rym-link-discovery.ts`, and make the Next route only parse HTTP input, wire Convex, and call OpenAI web search. The discovered URL remains only a candidate on `forLaterAlbumItems`; it does not create a RYM scrape row.
> **Tech Stack:** Next.js 15 App Router API route, Convex queries/mutations, AI SDK 5 with `@ai-sdk/openai`, Zod, `node:test`, TypeScript, Biome.

---

## File Structure

- Create `convex/_utils/rateYourMusicReleaseUrl.ts`: pure shared RYM release URL normalization and validation for album/EP pages only.
- Create `convex/_utils/rateYourMusicReleaseUrl.test.ts`: `node:test` coverage for accepted album/EP URLs and rejected single, artist, charts, and non-RYM URLs.
- Modify `convex/rateYourMusicScrapes.ts`: replace the local RYM URL normalization/release-kind helpers with imports from `convex/_utils/rateYourMusicReleaseUrl.ts` so scrape ingest and AI discovery use identical URL rules.
- Modify `convex/schema.ts`: add `by_userId_rymDiscoveryStatus` to `forLaterAlbumItems` if Phase 1 did not already add that compound index.
- Modify `convex/forLaterAlbums.ts`: add Phase 3 query/mutations for listing discovery candidates, marking an item as searching, and completing discovery with `found`, `not_found`, or `failed`.
- Create `src/lib/rym-link-discovery.ts`: Zod request/AI schemas, prompt builder, response aggregation, URL rejection logic, and dependency-injected discovery orchestration for tests.
- Create `src/lib/rym-link-discovery.test.ts`: mocked tests for request validation, URL rejection, retry behavior, status updates, and result counts.
- Create `src/app/api/for-later-albums/find-rym-links/route.ts`: POST route that validates request JSON, wires `ConvexHttpClient`, calls `generateObject` with OpenAI Responses web search, and returns the Phase 3 response shape.

## Task 1: Shared RYM Release URL Validation

**Files:**

- Create: `convex/_utils/rateYourMusicReleaseUrl.test.ts`
- Create: `convex/_utils/rateYourMusicReleaseUrl.ts`
- Modify: `convex/rateYourMusicScrapes.ts`
- **Step 1: Write the failing URL validation tests**

Create `convex/_utils/rateYourMusicReleaseUrl.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	getRateYourMusicReleaseKind,
	normalizeRateYourMusicReleaseUrl,
} from "./rateYourMusicReleaseUrl";

test("normalizeRateYourMusicReleaseUrl accepts album and EP release pages", () => {
	assert.equal(
		normalizeRateYourMusicReleaseUrl(
			"https://www.rateyourmusic.com/release/album/artist/title/?utm=x#review",
		),
		"https://rateyourmusic.com/release/album/artist/title",
	);

	assert.equal(
		normalizeRateYourMusicReleaseUrl(
			"rateyourmusic.com/release/ep/artist/title/",
		),
		"https://rateyourmusic.com/release/ep/artist/title",
	);
});

test("getRateYourMusicReleaseKind returns album or ep", () => {
	assert.equal(
		getRateYourMusicReleaseKind(
			"https://rateyourmusic.com/release/album/artist/title",
		),
		"album",
	);
	assert.equal(
		getRateYourMusicReleaseKind(
			"https://rateyourmusic.com/release/ep/artist/title",
		),
		"ep",
	);
});

test("normalizeRateYourMusicReleaseUrl rejects non-album release pages", () => {
	assert.throws(
		() =>
			normalizeRateYourMusicReleaseUrl(
				"https://rateyourmusic.com/release/single/artist/title",
			),
		/album or EP release path/,
	);
	assert.throws(
		() => normalizeRateYourMusicReleaseUrl("https://rateyourmusic.com/artist/x"),
		/album or EP release path/,
	);
	assert.throws(
		() => normalizeRateYourMusicReleaseUrl("https://rateyourmusic.com/charts/"),
		/album or EP release path/,
	);
	assert.throws(
		() => normalizeRateYourMusicReleaseUrl("https://example.com/release/album/x"),
		/rateyourmusic.com/,
	);
});
```

- **Step 2: Run the test to verify it fails**

Run:

```bash
node --test convex/_utils/rateYourMusicReleaseUrl.test.ts
```

Expected output includes:

```txt
not ok 1 - convex/_utils/rateYourMusicReleaseUrl.test.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
```

- **Step 3: Implement the shared helper**

Create `convex/_utils/rateYourMusicReleaseUrl.ts`:

```typescript
export function normalizeRateYourMusicReleaseUrl(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		throw new Error("RYM URL is required");
	}

	const withScheme = /^https?:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		throw new Error("Invalid RYM URL");
	}

	const host = url.hostname.toLowerCase();
	if (host !== "rateyourmusic.com" && host !== "www.rateyourmusic.com") {
		throw new Error("URL must be on rateyourmusic.com");
	}

	url.protocol = "https:";
	url.hostname = "rateyourmusic.com";
	url.hash = "";
	url.search = "";

	let path = url.pathname;
	if (path.length > 1 && path.endsWith("/")) {
		path = path.slice(0, -1);
	}
	url.pathname = path;

	getRateYourMusicReleaseKind(url.href);

	return url.href;
}

export function getRateYourMusicReleaseKind(rymUrl: string): "album" | "ep" {
	const pathname = new URL(rymUrl).pathname;
	if (pathname.includes("/release/ep/")) {
		return "ep";
	}
	if (pathname.includes("/release/album/")) {
		return "album";
	}
	throw new Error("RYM URL must be an album or EP release path");
}
```

- **Step 4: Refactor RYM scrape ingest to import the shared helper**

Modify the imports at the top of `convex/rateYourMusicScrapes.ts`:

```typescript
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	getRateYourMusicReleaseKind,
	normalizeRateYourMusicReleaseUrl,
} from "./_utils/rateYourMusicReleaseUrl";
```

Delete the local `normalizeRateYourMusicReleaseUrl` and `releaseKindFromPathname` functions from `convex/rateYourMusicScrapes.ts`.

In `upsertRateYourMusicScrape`, replace the release-kind line with:

```typescript
const releaseKind = getRateYourMusicReleaseKind(rymUrl);
```

In `getRateYourMusicScrapeByUrl`, keep the existing `try`/`catch` and call the imported `normalizeRateYourMusicReleaseUrl`.

- **Step 5: Run validation**

Run:

```bash
node --test convex/_utils/rateYourMusicReleaseUrl.test.ts
pnpm typecheck
```

Expected output includes:

```txt
# pass 3
```

and:

```txt
tsc --noEmit
```

with exit code `0`.

- **Step 6: Commit**

Run:

```bash
git add convex/_utils/rateYourMusicReleaseUrl.ts convex/_utils/rateYourMusicReleaseUrl.test.ts convex/rateYourMusicScrapes.ts
git commit -m "$(cat <<'EOF'
Add shared RYM release URL validation

EOF
)"
```

## Task 2: Convex Discovery Status API

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/forLaterAlbums.ts`
- **Step 1: Add the discovery-status index if it is missing**

In `convex/schema.ts`, find the `forLaterAlbumItems` table from Phase 1. Ensure the index block includes this compound index:

```typescript
	.index("by_userId_rymDiscoveryStatus", ["userId", "rymDiscoveryStatus"])
```

The final `forLaterAlbumItems` index block should include all existing Phase 1/2 indexes and this index:

```typescript
	.index("by_userId", ["userId"])
	.index("by_userId_active", ["userId", "isActive"])
	.index("by_userId_lastSeenAt", ["userId", "lastSeenAt"])
	.index("by_userId_albumId", ["userId", "albumId"])
	.index("by_userId_spotifyAlbumId", ["userId", "spotifyAlbumId"])
	.index("by_userId_albumTitleKey", ["userId", "albumTitleKey"])
	.index("by_rymScrapeId", ["rymScrapeId"])
	.index("by_rymDiscoveryStatus", ["rymDiscoveryStatus"])
	.index("by_userId_rymDiscoveryStatus", ["userId", "rymDiscoveryStatus"])
```

- **Step 2: Run typecheck to verify generated types expose the table**

Run:

```bash
pnpm typecheck
```

Expected before adding functions: exit code `0`. If Convex generated types are stale, run:

```bash
npx convex codegen
pnpm typecheck
```

Expected output includes:

```txt
tsc --noEmit
```

with exit code `0`.

- **Step 3: Add Convex validators and types**

In `convex/forLaterAlbums.ts`, add these validators near the other Phase 1/2 validators:

```typescript
const rymDiscoveryStatusValidator = v.union(
	v.literal("not_started"),
	v.literal("queued"),
	v.literal("searching"),
	v.literal("found"),
	v.literal("not_found"),
	v.literal("failed"),
);

const rymDiscoveryResultStatusValidator = v.union(
	v.literal("found"),
	v.literal("not_found"),
	v.literal("failed"),
);

const rymDiscoveryConfidenceValidator = v.union(
	v.literal("high"),
	v.literal("medium"),
	v.literal("low"),
);

type RymDiscoveryCandidateStatus =
	| "not_started"
	| "queued"
	| "searching"
	| "found"
	| "not_found"
	| "failed";
```

- **Step 4: Add the candidate eligibility helper**

In `convex/forLaterAlbums.ts`, add this helper after existing private helpers:

```typescript
function canRunRymDiscoveryForItem(
	item: {
		userId: string;
		isActive: boolean;
		rymScrapeId?: unknown;
		rymDiscoveryStatus: RymDiscoveryCandidateStatus;
	},
	userId: string,
	isExplicitRetry: boolean,
): boolean {
	if (item.userId !== userId || !item.isActive || item.rymScrapeId) {
		return false;
	}

	if (item.rymDiscoveryStatus === "not_started") {
		return true;
	}

	if (item.rymDiscoveryStatus === "queued") {
		return true;
	}

	if (!isExplicitRetry) {
		return false;
	}

	return (
		item.rymDiscoveryStatus === "failed" ||
		item.rymDiscoveryStatus === "not_found"
	);
}
```

- **Step 5: Add `listRymDiscoveryCandidates`**

In `convex/forLaterAlbums.ts`, add this query:

```typescript
export const listRymDiscoveryCandidates = query({
	args: {
		userId: v.string(),
		albumItemIds: v.optional(v.array(v.id("forLaterAlbumItems"))),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
		const candidates = [];
		const explicitIds = args.albumItemIds ?? [];

		if (explicitIds.length > 0) {
			for (const itemId of explicitIds) {
				if (candidates.length >= limit) {
					break;
				}

				const item = await ctx.db.get(itemId);
				if (!item || !canRunRymDiscoveryForItem(item, args.userId, true)) {
					continue;
				}

				const album = await ctx.db.get(item.albumId);
				if (!album) {
					continue;
				}

				candidates.push({
					albumItemId: item._id,
					spotifyAlbumId: item.spotifyAlbumId,
					albumTitle: album.name,
					artistName: album.artistName,
					releaseDate: album.releaseDate,
					spotifyAlbumUrl: `https://open.spotify.com/album/${item.spotifyAlbumId}`,
					currentDiscoveryStatus: item.rymDiscoveryStatus,
				});
			}

			return candidates;
		}

		for (const status of ["not_started", "queued"] as const) {
			if (candidates.length >= limit) {
				break;
			}

			const rows = await ctx.db
				.query("forLaterAlbumItems")
				.withIndex("by_userId_rymDiscoveryStatus", (q) =>
					q.eq("userId", args.userId).eq("rymDiscoveryStatus", status),
				)
				.take(limit - candidates.length);

			for (const item of rows) {
				if (!canRunRymDiscoveryForItem(item, args.userId, false)) {
					continue;
				}

				const album = await ctx.db.get(item.albumId);
				if (!album) {
					continue;
				}

				candidates.push({
					albumItemId: item._id,
					spotifyAlbumId: item.spotifyAlbumId,
					albumTitle: album.name,
					artistName: album.artistName,
					releaseDate: album.releaseDate,
					spotifyAlbumUrl: `https://open.spotify.com/album/${item.spotifyAlbumId}`,
					currentDiscoveryStatus: item.rymDiscoveryStatus,
				});
			}
		}

		return candidates;
	},
});
```

- **Step 6: Add status mutations**

In `convex/forLaterAlbums.ts`, add these mutations:

```typescript
export const markRymDiscoverySearching = mutation({
	args: {
		itemId: v.id("forLaterAlbumItems"),
		now: v.number(),
	},
	handler: async (ctx, args): Promise<void> => {
		requireAuth(ctx);

		await ctx.db.patch(args.itemId, {
			rymDiscoveryStatus: "searching",
			rymDiscoveryUpdatedAt: args.now,
			updatedAt: args.now,
		});
	},
});

export const completeRymDiscovery = mutation({
	args: {
		itemId: v.id("forLaterAlbumItems"),
		status: rymDiscoveryResultStatusValidator,
		rymUrl: v.optional(v.string()),
		confidence: v.optional(rymDiscoveryConfidenceValidator),
		reason: v.string(),
		now: v.number(),
	},
	handler: async (ctx, args): Promise<void> => {
		requireAuth(ctx);

		if (args.status === "found") {
			await ctx.db.patch(args.itemId, {
				rymDiscoveryStatus: "found",
				rymCandidateUrl: args.rymUrl,
				rymCandidateConfidence: args.confidence,
				rymDiscoveryReason: args.reason,
				rymDiscoveryUpdatedAt: args.now,
				updatedAt: args.now,
			});
			return;
		}

		await ctx.db.patch(args.itemId, {
			rymDiscoveryStatus: args.status,
			rymCandidateUrl: undefined,
			rymCandidateConfidence: undefined,
			rymDiscoveryReason: args.reason,
			rymDiscoveryUpdatedAt: args.now,
			updatedAt: args.now,
		});
	},
});
```

- **Step 7: Run validation**

Run:

```bash
npx convex codegen
pnpm typecheck
```

Expected output includes:

```txt
Generating server code
tsc --noEmit
```

with exit code `0`.

- **Step 8: Commit**

Run:

```bash
git add convex/schema.ts convex/forLaterAlbums.ts convex/_generated
git commit -m "$(cat <<'EOF'
Add For Later RYM discovery mutations

EOF
)"
```

## Task 3: Mockable Discovery Service

**Files:**

- Create: `src/lib/rym-link-discovery.test.ts`
- Create: `src/lib/rym-link-discovery.ts`
- **Step 1: Write failing service tests with mocks**

Create `src/lib/rym-link-discovery.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	buildRymReleaseSearchPrompt,
	discoverRymLinks,
	findRymLinksRequestSchema,
} from "./rym-link-discovery";

const candidate = {
	albumItemId: "item_1",
	spotifyAlbumId: "spotify_1",
	albumTitle: "Imaginal Disk",
	artistName: "Magdalena Bay",
	releaseDate: "2024-08-23",
	spotifyAlbumUrl: "https://open.spotify.com/album/spotify_1",
	currentDiscoveryStatus: "not_started" as const,
};

test("findRymLinksRequestSchema validates userId and caps limit", () => {
	const parsed = findRymLinksRequestSchema.parse({
		userId: "personal",
		limit: 25,
	});

	assert.equal(parsed.userId, "personal");
	assert.equal(parsed.limit, 25);
	assert.throws(
		() => findRymLinksRequestSchema.parse({ userId: "", limit: 26 }),
		/userId/,
	);
});

test("buildRymReleaseSearchPrompt includes album metadata and URL rejection rules", () => {
	const prompt = buildRymReleaseSearchPrompt(candidate);

	assert.match(prompt, /Imaginal Disk/);
	assert.match(prompt, /Magdalena Bay/);
	assert.match(prompt, /2024-08-23/);
	assert.match(prompt, /\/release\/album\//);
	assert.match(prompt, /\/release\/single\//);
	assert.match(prompt, /non-RYM URLs/);
});

test("discoverRymLinks stores a found album candidate", async () => {
	const completed: unknown[] = [];

	const response = await discoverRymLinks(
		{ userId: "personal", limit: 10 },
		{
			listCandidates: async () => [candidate],
			markSearching: async () => undefined,
			completeDiscovery: async (result) => {
				completed.push(result);
			},
			searchRymRelease: async () => ({
				status: "found",
				rymUrl:
					"https://rateyourmusic.com/release/album/magdalena-bay/imaginal-disk/",
				confidence: "high",
				reason: "The search result title and artist match the Spotify album.",
			}),
			now: () => 1_000,
		},
	);

	assert.equal(response.processed, 1);
	assert.equal(response.found, 1);
	assert.equal(response.failed, 0);
	assert.deepEqual(completed, [
		{
			albumItemId: "item_1",
			status: "found",
			rymUrl:
				"https://rateyourmusic.com/release/album/magdalena-bay/imaginal-disk",
			confidence: "high",
			reason: "The search result title and artist match the Spotify album.",
			now: 1_000,
		},
	]);
});

test("discoverRymLinks rejects singles and stores not_found", async () => {
	const completed: unknown[] = [];

	const response = await discoverRymLinks(
		{ userId: "personal", albumItemIds: ["item_1"], limit: 1 },
		{
			listCandidates: async (request) => {
				assert.deepEqual(request.albumItemIds, ["item_1"]);
				return [candidate];
			},
			markSearching: async () => undefined,
			completeDiscovery: async (result) => {
				completed.push(result);
			},
			searchRymRelease: async () => ({
				status: "found",
				rymUrl:
					"https://rateyourmusic.com/release/single/magdalena-bay/imaginal-disk/",
				confidence: "medium",
				reason: "The model returned a single release.",
			}),
			now: () => 2_000,
		},
	);

	assert.equal(response.processed, 1);
	assert.equal(response.found, 0);
	assert.equal(response.failed, 0);
	assert.equal(response.results[0]?.status, "not_found");
	assert.deepEqual(completed, [
		{
			albumItemId: "item_1",
			status: "not_found",
			reason:
				"Rejected AI URL: RYM URL must be an album or EP release path",
			now: 2_000,
		},
	]);
});

test("discoverRymLinks stores failed when the AI search throws", async () => {
	const response = await discoverRymLinks(
		{ userId: "personal", limit: 10 },
		{
			listCandidates: async () => [candidate],
			markSearching: async () => undefined,
			completeDiscovery: async () => undefined,
			searchRymRelease: async () => {
				throw new Error("OpenAI unavailable");
			},
			now: () => 3_000,
		},
	);

	assert.equal(response.processed, 1);
	assert.equal(response.found, 0);
	assert.equal(response.failed, 1);
	assert.equal(response.results[0]?.status, "failed");
	assert.equal(response.results[0]?.reason, "OpenAI unavailable");
});
```

- **Step 2: Run the test to verify it fails**

Run:

```bash
node --test src/lib/rym-link-discovery.test.ts
```

Expected output includes:

```txt
not ok 1 - src/lib/rym-link-discovery.test.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
```

- **Step 3: Implement the discovery service**

Create `src/lib/rym-link-discovery.ts`:

```typescript
import { z } from "zod";
import { normalizeRateYourMusicReleaseUrl } from "../../convex/_utils/rateYourMusicReleaseUrl";

export const findRymLinksRequestSchema = z.object({
	userId: z.string().min(1, "userId is required"),
	albumItemIds: z.array(z.string().min(1)).optional(),
	limit: z.number().int().min(1).max(25).optional(),
});

export const rymReleaseSearchResultSchema = z.object({
	status: z.enum(["found", "not_found"]),
	rymUrl: z.string().url().optional(),
	confidence: z.enum(["high", "medium", "low"]).optional(),
	reason: z.string().max(500),
});

export type FindRymLinksRequest = z.infer<typeof findRymLinksRequestSchema>;
export type RymReleaseSearchResult = z.infer<
	typeof rymReleaseSearchResultSchema
>;

export type RymDiscoveryCandidate = {
	albumItemId: string;
	spotifyAlbumId: string;
	albumTitle: string;
	artistName: string;
	releaseDate?: string;
	spotifyAlbumUrl?: string;
	currentDiscoveryStatus:
		| "not_started"
		| "queued"
		| "searching"
		| "found"
		| "not_found"
		| "failed";
};

export type RymDiscoveryResponse = {
	processed: number;
	found: number;
	failed: number;
	results: Array<{
		albumItemId: string;
		status: "found" | "not_found" | "failed";
		rymUrl?: string;
		confidence?: "high" | "medium" | "low";
		reason?: string;
	}>;
};

type CompleteDiscoveryArgs = {
	albumItemId: string;
	status: "found" | "not_found" | "failed";
	rymUrl?: string;
	confidence?: "high" | "medium" | "low";
	reason: string;
	now: number;
};

type RymDiscoveryDependencies = {
	listCandidates: (request: Required<Pick<FindRymLinksRequest, "userId">> & {
		albumItemIds?: string[];
		limit: number;
	}) => Promise<RymDiscoveryCandidate[]>;
	markSearching: (albumItemId: string, now: number) => Promise<void>;
	completeDiscovery: (args: CompleteDiscoveryArgs) => Promise<void>;
	searchRymRelease: (
		candidate: RymDiscoveryCandidate,
	) => Promise<RymReleaseSearchResult>;
	now: () => number;
};

export function buildRymReleaseSearchPrompt(
	candidate: RymDiscoveryCandidate,
): string {
	return `Find the canonical Rate Your Music release page for this Spotify album.

Album title: ${candidate.albumTitle}
Artist names: ${candidate.artistName}
Spotify release date: ${candidate.releaseDate ?? "unknown"}
Spotify album URL: ${candidate.spotifyAlbumUrl ?? "unknown"}

Return status "found" only when the URL is a Rate Your Music album or EP release page for the same album.
Allowed URL shapes:
- https://rateyourmusic.com/release/album/artist-name/release-title
- https://rateyourmusic.com/release/ep/artist-name/release-title

Reject these results:
- /release/single/ pages
- /artist/ pages
- /charts/ pages
- reviews, lists, catalog pages, and non-RYM URLs

If the best result is ambiguous or not an album/EP release page, return status "not_found" with a concise reason.`;
}

export async function discoverRymLinks(
	request: FindRymLinksRequest,
	deps: RymDiscoveryDependencies,
): Promise<RymDiscoveryResponse> {
	const limit = Math.min(Math.max(request.limit ?? 10, 1), 25);
	const candidates = await deps.listCandidates({
		userId: request.userId,
		...(request.albumItemIds ? { albumItemIds: request.albumItemIds } : {}),
		limit,
	});

	const results: RymDiscoveryResponse["results"] = [];

	for (const candidate of candidates) {
		const searchingAt = deps.now();
		await deps.markSearching(candidate.albumItemId, searchingAt);

		try {
			const aiResult = await deps.searchRymRelease(candidate);
			const completedAt = deps.now();

			if (aiResult.status === "not_found" || !aiResult.rymUrl) {
				const reason = aiResult.reason || "No album or EP release page found";
				await deps.completeDiscovery({
					albumItemId: candidate.albumItemId,
					status: "not_found",
					reason,
					now: completedAt,
				});
				results.push({
					albumItemId: candidate.albumItemId,
					status: "not_found",
					reason,
				});
				continue;
			}

			let rymUrl: string;
			try {
				rymUrl = normalizeRateYourMusicReleaseUrl(aiResult.rymUrl);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Invalid RYM release URL";
				const reason = `Rejected AI URL: ${message}`;
				await deps.completeDiscovery({
					albumItemId: candidate.albumItemId,
					status: "not_found",
					reason,
					now: completedAt,
				});
				results.push({
					albumItemId: candidate.albumItemId,
					status: "not_found",
					reason,
				});
				continue;
			}

			const confidence = aiResult.confidence ?? "medium";
			await deps.completeDiscovery({
				albumItemId: candidate.albumItemId,
				status: "found",
				rymUrl,
				confidence,
				reason: aiResult.reason,
				now: completedAt,
			});
			results.push({
				albumItemId: candidate.albumItemId,
				status: "found",
				rymUrl,
				confidence,
				reason: aiResult.reason,
			});
		} catch (error) {
			const failedAt = deps.now();
			const reason = error instanceof Error ? error.message : "AI search failed";
			await deps.completeDiscovery({
				albumItemId: candidate.albumItemId,
				status: "failed",
				reason,
				now: failedAt,
			});
			results.push({
				albumItemId: candidate.albumItemId,
				status: "failed",
				reason,
			});
		}
	}

	return {
		processed: results.length,
		found: results.filter((result) => result.status === "found").length,
		failed: results.filter((result) => result.status === "failed").length,
		results,
	};
}
```

- **Step 4: Run service tests**

Run:

```bash
node --test src/lib/rym-link-discovery.test.ts
```

Expected output includes:

```txt
# pass 5
```

- **Step 5: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected output:

```txt
tsc --noEmit
```

with exit code `0`.

- **Step 6: Commit**

Run:

```bash
git add src/lib/rym-link-discovery.ts src/lib/rym-link-discovery.test.ts
git commit -m "$(cat <<'EOF'
Add RYM link discovery service

EOF
)"
```

## Task 4: AI Discovery API Route

**Files:**

- Create: `src/app/api/for-later-albums/find-rym-links/route.ts`
- **Step 1: Write the route**

Create `src/app/api/for-later-albums/find-rym-links/route.ts`:

```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../../convex/_generated/api";
import {
	buildRymReleaseSearchPrompt,
	discoverRymLinks,
	findRymLinksRequestSchema,
	type RymDiscoveryCandidate,
	type RymReleaseSearchResult,
	rymReleaseSearchResultSchema,
} from "~/lib/rym-link-discovery";

const AI_MODEL = "gpt-5-nano-2025-08-07";
const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

const SYSTEM_PROMPT =
	"Find the canonical Rate Your Music release page for the Spotify album. Return only album or EP release pages, never artist pages, charts, reviews, lists, or single releases.";

export async function POST(request: NextRequest): Promise<NextResponse> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = findRymLinksRequestSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{
				error: "Invalid request body",
				issues: parsed.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

	try {
		const response = await discoverRymLinks(parsed.data, {
			listCandidates: async ({ userId, albumItemIds, limit }) =>
				await convex.query(api.forLaterAlbums.listRymDiscoveryCandidates, {
					userId,
					...(albumItemIds ? { albumItemIds: albumItemIds as never } : {}),
					limit,
				}),
			markSearching: async (albumItemId, now) => {
				await convex.mutation(api.forLaterAlbums.markRymDiscoverySearching, {
					itemId: albumItemId as never,
					now,
				});
			},
			completeDiscovery: async ({
				albumItemId,
				status,
				rymUrl,
				confidence,
				reason,
				now,
			}) => {
				await convex.mutation(api.forLaterAlbums.completeRymDiscovery, {
					itemId: albumItemId as never,
					status,
					rymUrl,
					confidence,
					reason,
					now,
				});
			},
			searchRymRelease: searchRymReleaseWithOpenAI,
			now: () => Date.now(),
		});

		return NextResponse.json(response);
	} catch (error) {
		console.error("[for-later-albums/find-rym-links] Discovery failed", error);
		const message =
			error instanceof Error ? error.message : "Failed to find RYM links";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

async function searchRymReleaseWithOpenAI(
	candidate: RymDiscoveryCandidate,
): Promise<RymReleaseSearchResult> {
	const result = await generateObject({
		model: openai.responses(AI_MODEL),
		schema: rymReleaseSearchResultSchema,
		system: SYSTEM_PROMPT,
		prompt: buildRymReleaseSearchPrompt(candidate),
		tools: {
			web_search_preview: openai.tools.webSearchPreview({
				searchContextSize: "low",
			}),
		},
		toolChoice: { type: "tool", toolName: "web_search_preview" },
	});

	return result.object;
}
```

- **Step 2: Run typecheck to catch generated API and route typing issues**

Run:

```bash
pnpm typecheck
```

Expected output:

```txt
tsc --noEmit
```

with exit code `0`.

- **Step 3: Run route-relevant tests**

Run:

```bash
node --test convex/_utils/rateYourMusicReleaseUrl.test.ts
node --test src/lib/rym-link-discovery.test.ts
```

Expected output includes:

```txt
# pass 3
# pass 5
```

- **Step 4: Commit**

Run:

```bash
git add src/app/api/for-later-albums/find-rym-links/route.ts
git commit -m "$(cat <<'EOF'
Add For Later RYM discovery route

EOF
)"
```

## Task 5: End-to-End Verification

**Files:**

- Verify: `convex/_utils/rateYourMusicReleaseUrl.test.ts`
- Verify: `src/lib/rym-link-discovery.test.ts`
- Verify: `src/app/api/for-later-albums/find-rym-links/route.ts`
- Verify: `convex/forLaterAlbums.ts`
- **Step 1: Run all Phase 3 tests**

Run:

```bash
node --test convex/_utils/rateYourMusicReleaseUrl.test.ts src/lib/rym-link-discovery.test.ts
```

Expected output includes:

```txt
# pass 8
# fail 0
```

- **Step 2: Run static checks**

Run:

```bash
pnpm check
pnpm typecheck
```

Expected output includes:

```txt
Checked
tsc --noEmit
```

with exit code `0` for both commands.

- **Step 3: Run a local API smoke test with mocked data unavailable**

Start the app only if it is not already running:

```bash
pnpm dev
```

In another terminal, send an invalid request:

```bash
curl -s -X POST http://localhost:1333/api/for-later-albums/find-rym-links \
	-H 'content-type: application/json' \
	-d '{"userId":"","limit":26}'
```

Expected response:

```json
{"error":"Invalid request body","issues":{"userId":["userId is required"],"limit":["Number must be less than or equal to 25"]}}
```

- **Step 4: Run a local API smoke test for an empty candidate batch**

Use a synthetic user id that has no For Later rows so the route exercises request parsing and Convex candidate lookup without spending OpenAI tokens:

```bash
curl -s -X POST http://localhost:1333/api/for-later-albums/find-rym-links \
	-H 'content-type: application/json' \
	-d '{"userId":"__phase_3_smoke_no_rows__","limit":1}'
```

Expected response when there are no active unmatched `not_started` or `queued` rows:

```json
{"processed":0,"found":0,"failed":0,"results":[]}
```

- **Step 5: Confirm database status semantics**

Inspect the changed `forLaterAlbumItems` row in Convex after a found result. It must have:

```typescript
{
	rymDiscoveryStatus: "found",
	rymCandidateUrl:
		"https://rateyourmusic.com/release/album/magdalena-bay/imaginal-disk",
	rymCandidateConfidence: "high",
	rymDiscoveryReason:
		"The search result title and artist match the Spotify album.",
	rymDiscoveryUpdatedAt: 1710000000000,
	rymScrapeId: undefined
}
```

Inspect the changed row after a rejected single URL, rejected artist URL, rejected charts URL, or model `not_found`. It must have:

```typescript
{
	rymDiscoveryStatus: "not_found",
	rymCandidateUrl: undefined,
	rymCandidateConfidence: undefined,
	rymDiscoveryReason:
		"Rejected AI URL: RYM URL must be an album or EP release path",
	rymDiscoveryUpdatedAt: 1710000000000,
	rymScrapeId: undefined
}
```

Inspect the changed row after an AI exception. It must have:

```typescript
{
	rymDiscoveryStatus: "failed",
	rymCandidateUrl: undefined,
	rymCandidateConfidence: undefined,
	rymDiscoveryReason: "OpenAI unavailable",
	rymDiscoveryUpdatedAt: 1710000000000,
	rymScrapeId: undefined
}
```

- **Step 6: Commit verification fixes if any were required**

If verification changed files, run:

```bash
git add convex/_utils/rateYourMusicReleaseUrl.ts convex/_utils/rateYourMusicReleaseUrl.test.ts convex/rateYourMusicScrapes.ts convex/schema.ts convex/forLaterAlbums.ts src/lib/rym-link-discovery.ts src/lib/rym-link-discovery.test.ts src/app/api/for-later-albums/find-rym-links/route.ts
git commit -m "$(cat <<'EOF'
Verify For Later RYM discovery

EOF
)"
```

Expected output if no files changed:

```txt
nothing to commit, working tree clean
```

## Self-Review Checklist

- Phase 3 scope only: API route, shared URL validation, AI web search, candidate status writes, retry behavior, and tests/mocks.
- `forLaterAlbumItems.rymScrapeId` is never set by AI discovery; only extension ingest and Phase 2 matching create scrape links.
- Default batches process only active unmatched `not_started` or `queued` items.
- Explicit `albumItemIds` retries process only active unmatched `failed` or `not_found` rows plus fresh `not_started` or `queued` rows.
- URL validation accepts only album URLs shaped like `https://rateyourmusic.com/release/album/artist-name/release-title` and EP URLs shaped like `https://rateyourmusic.com/release/ep/artist-name/release-title`.
- URL validation rejects `/release/single/`, `/artist/`, `/charts/`, and non-RYM URLs.
- Request schema enforces `userId`, optional `albumItemIds`, default `limit = 10`, and max `limit = 25`.
- AI model string is centralized as `gpt-5-nano-2025-08-07`.
- OpenAI web search uses `openai.responses(AI_MODEL)`, `openai.tools.webSearchPreview({ searchContextSize: "low" })`, and forced `toolChoice`.

