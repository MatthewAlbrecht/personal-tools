# AI Album Research Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claim for-later albums missing enrichment slices, research them via Cursor skill/subagents, persist album-centric enrichment + facets over authed HTTP, and ship a polished `/albums/details/[albumId]` dossier with entry links from for-later and `/albums/all`.

**Architecture:** Pure slice helpers decide “what’s missing.” Convex owns `albumEnrichments` + cover/occasion facet tables and claim/save/resolve/details queries. Next.js App Router routes authenticate with `ALBUM_ENRICHMENT_SECRET` and call Convex via `ConvexHttpClient`. Cursor skill + four agents perform research (identity lock → gap fan-out → save). Automation is configured in Cursor cloud (not in repo).

**Tech Stack:** Next.js 15 App Router, Convex, TypeScript, Biome, `node:test` via `npx tsx --test`, Cursor skills/agents/automations

**Spec:** `docs/superpowers/specs/2026-07-17-ai-album-research-enrichment-design.md`

## Global Constraints

- Claim source v1: active for-later membership only; storage is album-centric (`spotifyAlbums` id)
- Required slices (app-owned): `artistContext`, `whyListen`, `coverDescriptors`, `occasions`
- Schedule: one album per run; gaps-only; never full-overwrite a complete album
- Manual: by Convex album id, Spotify album id, or name; full overwrite of all required slices
- Identity lock before research; subagents must not re-resolve the album
- Cover descriptors ≠ RYM musical descriptors (separate tables/names)
- HTTP fail-closed on missing/invalid `Authorization: Bearer <ALBUM_ENRICHMENT_SECRET>`
- `userId` for claim scope is `SPOTIFY_SYNC_USER_ID` (string AUTH username), same as other crons
- Classic function declarations; `type` aliases; kebab-case filenames; env via `~/env.js`
- No in-app LLM researcher for production enrich; no product filters for cover/occasions in v1; no plugin packaging
- Prompt eval is explicit skill path only; schedule never writes trials; trials never become live without promote
- Judge kinds: `artistContext` mixed, `whyListen`/`occasions` human, `coverDescriptors` auto

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/album-enrichment/types.ts` | Slice keys, tag types, claim/save payloads |
| Create | `src/lib/album-enrichment/slices.ts` | Required list, missing slices, normalize tag keys |
| Create | `src/lib/album-enrichment/slices.test.ts` | Slice helper tests |
| Modify | `convex/schema.ts` | `albumEnrichments`, facet tables |
| Create | `convex/albumEnrichment.ts` | Claim, save, resolve, details query/mutations |
| Modify | `src/env.js` | `ALBUM_ENRICHMENT_SECRET` |
| Create | `src/app/api/album-enrichment/_auth.ts` | Bearer check helper |
| Create | `src/app/api/album-enrichment/claim/route.ts` | Scheduled claim |
| Create | `src/app/api/album-enrichment/save/route.ts` | Partial/full save |
| Create | `src/app/api/album-enrichment/resolve/route.ts` | Manual lookup |
| Create | `.cursor/skills/enrich-for-later-album/SKILL.md` | Orchestrator playbook |
| Create | `.cursor/agents/artist-context.md` | Artist/context researcher (production) |
| Create | `.cursor/agents/why-listen.md` | Pitch researcher (production) |
| Create | `.cursor/agents/cover-descriptors.md` | Cover tag researcher (production) |
| Create | `.cursor/agents/occasions.md` | Occasion tag researcher (production) |
| Create | `.cursor/agents/variants/**` | Prompt candidate files for eval (`{slice}/{variantId}.md`) |
| Create | `src/app/albums/details/[albumId]/page.tsx` | Details route |
| Create | `src/app/albums/details/[albumId]/_components/album-details-view.tsx` | Dossier UI |
| Create | `src/app/albums/details/[albumId]/_components/enrichment-trials.tsx` | Side-by-side trials + promote |
| Create | `src/app/api/album-enrichment/trial/route.ts` | Persist trial (+ optional auto-judge) |
| Create | `src/app/api/album-enrichment/promote-trial/route.ts` | Promote trial → live slice |
| Create | `src/lib/album-enrichment/judge-kinds.ts` | Per-slice judge kind map |
| Create | `convex/albumEnrichmentTrials.ts` (or extend `albumEnrichment.ts`) | Trials CRUD + promote + list |
| Modify | for-later row + all-albums row components | Details entry links |
| Modify | `docs/ideas/2026-07-15-ai-album-artist-research-enrichment.md` | `status: planned` + links |

---

### Task 1: Slice helpers (TDD)

**Files:**
- Create: `src/lib/album-enrichment/types.ts`
- Create: `src/lib/album-enrichment/slices.ts`
- Create: `src/lib/album-enrichment/slices.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type EnrichmentSliceKey = "artistContext" | "whyListen" | "coverDescriptors" | "occasions"`
  - `const REQUIRED_ENRICHMENT_SLICES: EnrichmentSliceKey[]`
  - `type SlicePresence = Partial<Record<EnrichmentSliceKey, { updatedAt: number }>>`
  - `function missingEnrichmentSlices(slices: SlicePresence | undefined): EnrichmentSliceKey[]`
  - `function isEnrichmentComplete(slices: SlicePresence | undefined): boolean`
  - `function normalizeEnrichmentTagKey(label: string): string`
  - `function normalizeEnrichmentTags(tags: Array<{ label: string }>): Array<{ key: string; label: string }>`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/album-enrichment/slices.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	REQUIRED_ENRICHMENT_SLICES,
	isEnrichmentComplete,
	missingEnrichmentSlices,
	normalizeEnrichmentTagKey,
	normalizeEnrichmentTags,
} from "./slices";

test("REQUIRED_ENRICHMENT_SLICES has four keys", () => {
	assert.deepEqual(REQUIRED_ENRICHMENT_SLICES, [
		"artistContext",
		"whyListen",
		"coverDescriptors",
		"occasions",
	]);
});

test("missingEnrichmentSlices treats undefined as all missing", () => {
	assert.deepEqual(missingEnrichmentSlices(undefined), [
		"artistContext",
		"whyListen",
		"coverDescriptors",
		"occasions",
	]);
});

test("missingEnrichmentSlices returns only absent keys", () => {
	assert.deepEqual(
		missingEnrichmentSlices({
			artistContext: { updatedAt: 1 },
			whyListen: { updatedAt: 1 },
		}),
		["coverDescriptors", "occasions"],
	);
});

test("isEnrichmentComplete true only when all required present", () => {
	assert.equal(isEnrichmentComplete(undefined), false);
	assert.equal(
		isEnrichmentComplete({
			artistContext: { updatedAt: 1 },
			whyListen: { updatedAt: 1 },
			coverDescriptors: { updatedAt: 1 },
			occasions: { updatedAt: 1 },
		}),
		true,
	);
});

test("normalizeEnrichmentTagKey lowercases and kebab-cases", () => {
	assert.equal(normalizeEnrichmentTagKey("  Live Show "), "live-show");
	assert.equal(normalizeEnrichmentTagKey("Dinner Party"), "dinner-party");
});

test("normalizeEnrichmentTags dedupes by key and trims labels", () => {
	assert.deepEqual(
		normalizeEnrichmentTags([
			{ label: "Green" },
			{ label: " green " },
			{ label: "Live Show" },
		]),
		[
			{ key: "green", label: "Green" },
			{ key: "live-show", label: "Live Show" },
		],
	);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/album-enrichment/slices.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement helpers**

```typescript
// src/lib/album-enrichment/types.ts
export type EnrichmentSliceKey =
	| "artistContext"
	| "whyListen"
	| "coverDescriptors"
	| "occasions";

export type SlicePresence = Partial<
	Record<EnrichmentSliceKey, { updatedAt: number }>
>;

export type EnrichmentTag = {
	key: string;
	label: string;
};
```

```typescript
// src/lib/album-enrichment/slices.ts
import type { EnrichmentSliceKey, EnrichmentTag, SlicePresence } from "./types";

export const REQUIRED_ENRICHMENT_SLICES: EnrichmentSliceKey[] = [
	"artistContext",
	"whyListen",
	"coverDescriptors",
	"occasions",
];

export function missingEnrichmentSlices(
	slices: SlicePresence | undefined,
): EnrichmentSliceKey[] {
	return REQUIRED_ENRICHMENT_SLICES.filter((key) => slices?.[key] == null);
}

export function isEnrichmentComplete(
	slices: SlicePresence | undefined,
): boolean {
	return missingEnrichmentSlices(slices).length === 0;
}

export function normalizeEnrichmentTagKey(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function normalizeEnrichmentTags(
	tags: Array<{ label: string }>,
): EnrichmentTag[] {
	const seen = new Set<string>();
	const out: EnrichmentTag[] = [];
	for (const tag of tags) {
		const label = tag.label.replace(/\s+/g, " ").trim();
		if (!label) continue;
		const key = normalizeEnrichmentTagKey(label);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push({ key, label });
	}
	return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/album-enrichment/slices.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/album-enrichment/types.ts src/lib/album-enrichment/slices.ts src/lib/album-enrichment/slices.test.ts
git commit -m "feat(album-enrichment): add required-slice helpers"
```

---

### Task 2: Schema

**Files:**
- Modify: `convex/schema.ts`

**Interfaces:**
- Consumes: nothing
- Produces: tables `albumEnrichments`, `albumCoverDescriptorFacets`, `albumOccasionFacets`

- [ ] **Step 1: Add tables to schema**

Add near other album tables (after `spotifyAlbums` / library block is fine):

```typescript
albumEnrichments: defineTable({
	albumId: v.id("spotifyAlbums"),
	spotifyAlbumId: v.string(),
	slices: v.object({
		artistContext: v.optional(v.object({ updatedAt: v.number() })),
		whyListen: v.optional(v.object({ updatedAt: v.number() })),
		coverDescriptors: v.optional(v.object({ updatedAt: v.number() })),
		occasions: v.optional(v.object({ updatedAt: v.number() })),
	}),
	origin: v.optional(v.string()),
	activeSince: v.optional(v.string()),
	instagramUrl: v.optional(v.string()),
	artistWriteup: v.optional(v.string()),
	listenIfYouLike: v.optional(v.array(v.string())),
	whyListenPitch: v.optional(v.string()),
	identityPacket: v.optional(
		v.object({
			title: v.string(),
			artists: v.array(v.string()),
			releaseYear: v.optional(v.number()),
			coverImageUrl: v.optional(v.string()),
			rymUrl: v.optional(v.string()),
		}),
	),
	lastEnrichedAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
})
	.index("by_albumId", ["albumId"])
	.index("by_spotifyAlbumId", ["spotifyAlbumId"]),

albumCoverDescriptorFacets: defineTable({
	albumId: v.id("spotifyAlbums"),
	coverDescriptorKey: v.string(),
	label: v.string(),
})
	.index("by_albumId", ["albumId"])
	.index("by_coverDescriptorKey_albumId", [
		"coverDescriptorKey",
		"albumId",
	]),

albumOccasionFacets: defineTable({
	albumId: v.id("spotifyAlbums"),
	occasionKey: v.string(),
	label: v.string(),
})
	.index("by_albumId", ["albumId"])
	.index("by_occasionKey_albumId", ["occasionKey", "albumId"]),
```

- [ ] **Step 2: Ensure Convex picks up schema**

With `npx convex dev` already running (or start it), confirm no schema errors in the Convex CLI output.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(album-enrichment): add enrichment and facet tables"
```

---

### Task 3: Convex claim / save / resolve

**Files:**
- Create: `convex/albumEnrichment.ts`

**Interfaces:**
- Consumes: `REQUIRED_ENRICHMENT_SLICES` / `missingEnrichmentSlices` / `normalizeEnrichmentTags` — **re-implement the same logic inside Convex** (Convex cannot import from `src/lib`). Duplicate the small helpers at the top of `convex/albumEnrichment.ts` or in `convex/_utils/albumEnrichmentSlices.ts` and keep them in sync with Task 1.
- Produces:
  - `claimNextForLater` mutation → `{ album } | { empty: true }`
  - `saveSlices` mutation → `{ albumId, savedSlices }`
  - `resolveAlbum` query → single match or `{ candidates: [...] }` or null

- [ ] **Step 1: Add `convex/_utils/albumEnrichmentSlices.ts` mirroring Task 1**

Copy the required-slice constants and `missingEnrichmentSlices` / `normalizeEnrichmentTags` into Convex `_utils` (same behavior as `src/lib/album-enrichment/slices.ts`). Add `convex/_utils/albumEnrichmentSlices.test.ts` with the same cases as Task 1 (import from the Convex util).

Run: `npx tsx --test convex/_utils/albumEnrichmentSlices.test.ts`  
Expected: PASS

- [ ] **Step 2: Implement `claimNextForLater`**

```typescript
// convex/albumEnrichment.ts (sketch)
export const claimNextForLater = mutation({
	args: { userId: v.string() },
	returns: v.union(
		v.object({
			empty: v.literal(true),
		}),
		v.object({
			empty: v.literal(false),
			albumId: v.id("spotifyAlbums"),
			spotifyAlbumId: v.string(),
			forLaterItemId: v.id("forLaterAlbumItems"),
			title: v.string(),
			artists: v.array(v.string()),
			releaseYear: v.optional(v.number()),
			coverImageUrl: v.optional(v.string()),
			rymUrl: v.optional(v.string()),
			missingSlices: v.array(enrichmentSliceKeyValidator),
			existingSlices: slicePresenceValidator,
		}),
	),
	handler: async (ctx, args) => {
		// 1. Load active for-later items for userId (isActive true), newest lastSeenAt first
		// 2. Skip soft-deleted: markedAsSingle / removedFromForLater when those hide from lists
		//    (match whatever for-later list already excludes)
		// 3. For each item, load spotifyAlbums + albumEnrichments by albumId
		// 4. missing = missingEnrichmentSlices(enrichment?.slices)
		// 5. Return first with missing.length > 0, including identity fields + missingSlices
		// 6. If none: { empty: true }
	},
});
```

Use existing for-later list exclusion rules from `convex/forLaterAlbums.ts` / projection helpers so claim matches what the user sees as active queue.

- [ ] **Step 3: Implement `saveSlices`**

Args (conceptual):

```typescript
{
	albumId: Id<"spotifyAlbums">,
	identityPacket: { title, artists, releaseYear?, coverImageUrl?, rymUrl? },
	artistContext?: {
		origin?, activeSince?, instagramUrl?, artistWriteup?, listenIfYouLike?: string[]
	},
	whyListen?: { whyListenPitch: string },
	coverDescriptors?: { tags: Array<{ label: string }> },
	occasions?: { tags: Array<{ label: string }> },
	mode: "gaps" | "overwrite",
}
```

Behavior:

- Load album; throw if missing
- Upsert `albumEnrichments` by `by_albumId`
- For `mode: "overwrite"`, clear narrative fields for slices being written, then set; for tag slices replace all facet rows for that album in that table
- For `mode: "gaps"`, only write slices that are currently missing (ignore payload for already-present slices)
- Set `slices[key] = { updatedAt: now }` only for slices actually written
- Update `lastEnrichedAt`, `updatedAt`, store `identityPacket`
- Return `{ albumId, savedSlices: EnrichmentSliceKey[] }`

Tag slice write: `normalizeEnrichmentTags` → delete existing facet rows for `albumId` → insert new rows.

- [ ] **Step 4: Implement `resolveAlbum`**

```typescript
export const resolveAlbum = query({
	args: {
		userId: v.string(),
		q: v.string(),
	},
	returns: v.union(
		v.null(),
		v.object({
			kind: v.literal("exact"),
			albumId: v.id("spotifyAlbums"),
			spotifyAlbumId: v.string(),
			title: v.string(),
			artists: v.array(v.string()),
			// ... identity fields + missingSlices + existingSlices
		}),
		v.object({
			kind: v.literal("candidates"),
			candidates: v.array(
				v.object({
					albumId: v.id("spotifyAlbums"),
					spotifyAlbumId: v.string(),
					title: v.string(),
					artistName: v.string(),
				}),
			),
		}),
	),
	handler: async (ctx, args) => {
		// Trim q
		// If looks like Id<"spotifyAlbums"> / exists via ctx.db.get → exact
		// Else by_spotifyAlbumId exact → exact
		// Else search for-later + albumLibraryItems for user by title/artist substring (cap 10)
		// 0 → null; 1 → exact; many → candidates
	},
});
```

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/albumEnrichmentSlices.ts convex/_utils/albumEnrichmentSlices.test.ts convex/albumEnrichment.ts
git commit -m "feat(album-enrichment): claim, save, and resolve in Convex"
```

---

### Task 4: Details dossier query

**Files:**
- Modify: `convex/albumEnrichment.ts`

**Interfaces:**
- Consumes: tables from Task 2; existing for-later / library / RYM / userAlbums patterns
- Produces: `getAlbumDetails` query returning a single read model for the UI

- [ ] **Step 1: Implement `getAlbumDetails`**

```typescript
export const getAlbumDetails = query({
	args: {
		userId: v.string(),
		albumId: v.id("spotifyAlbums"),
	},
	returns: v.union(v.null(), albumDetailsValidator),
	handler: async (ctx, args) => {
		const album = await ctx.db.get(args.albumId);
		if (!album) return null;

		const enrichment = await ctx.db
			.query("albumEnrichments")
			.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
			.unique();

		const coverDescriptors = await ctx.db
			.query("albumCoverDescriptorFacets")
			.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
			.collect();

		const occasions = await ctx.db
			.query("albumOccasionFacets")
			.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
			.collect();

		// Join for-later item (by_userId_albumId), albumLibraryItems, RYM link/scrape,
		// userAlbums rating/listens — reuse existing helpers where they exist.
		// Return structured sections matching the details UI (hero, enrichment, library, rym, listens, ids).
	},
});
```

Define `albumDetailsValidator` explicitly (no `v.any()`). Include `missingSlices` computed via `missingEnrichmentSlices`.

- [ ] **Step 2: Smoke via Convex dashboard or `npx convex run`**

Run a get against a known album id; expect null or a populated object without thrown errors.

- [ ] **Step 3: Commit**

```bash
git add convex/albumEnrichment.ts
git commit -m "feat(album-enrichment): add getAlbumDetails dossier query"
```

---

### Task 5: Authed HTTP routes

**Files:**
- Modify: `src/env.js`
- Create: `src/app/api/album-enrichment/_auth.ts`
- Create: `src/app/api/album-enrichment/claim/route.ts`
- Create: `src/app/api/album-enrichment/save/route.ts`
- Create: `src/app/api/album-enrichment/resolve/route.ts`

**Interfaces:**
- Consumes: Convex functions from Tasks 3–4; `env.ALBUM_ENRICHMENT_SECRET`; `env.SPOTIFY_SYNC_USER_ID`
- Produces: HTTP JSON endpoints for the Cursor skill

- [ ] **Step 1: Add env var**

In `src/env.js` server schema + `runtimeEnv`:

```typescript
ALBUM_ENRICHMENT_SECRET: z.string().min(16),
// runtimeEnv:
ALBUM_ENRICHMENT_SECRET: process.env.ALBUM_ENRICHMENT_SECRET,
```

Add the secret to `.env.local` (and deployment / Cursor cloud agent secrets). Do not commit the value.

- [ ] **Step 2: Auth helper**

```typescript
// src/app/api/album-enrichment/_auth.ts
import { NextResponse } from "next/server";
import { env } from "~/env.js";

export function unauthorizedIfNotEnrichmentSecret(
	request: Request,
): NextResponse | null {
	const expected = `Bearer ${env.ALBUM_ENRICHMENT_SECRET}`;
	if (request.headers.get("authorization") !== expected) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	return null;
}
```

- [ ] **Step 3: Claim route**

`POST /api/album-enrichment/claim`

- Auth via helper
- `ConvexHttpClient` + `api.albumEnrichment.claimNextForLater({ userId: env.SPOTIFY_SYNC_USER_ID })`
- Return 200 with body from Convex (`empty: true` is success)

- [ ] **Step 4: Save route**

`POST /api/album-enrichment/save`

- Auth
- Parse JSON body; validate required `albumId` + at least one slice payload + `mode`
- Call `saveSlices`
- Return saved slice list

- [ ] **Step 5: Resolve route**

`GET /api/album-enrichment/resolve?q=...`

- Auth
- Call `resolveAlbum` with `SPOTIFY_SYNC_USER_ID`
- Return exact / candidates / 404

- [ ] **Step 6: Manual smoke**

```bash
curl -s -X POST "$BASE/api/album-enrichment/claim" \
  -H "Authorization: Bearer $ALBUM_ENRICHMENT_SECRET"
# expect empty or album payload

curl -s "$BASE/api/album-enrichment/resolve?q=some-spotify-id" \
  -H "Authorization: Bearer $ALBUM_ENRICHMENT_SECRET"
```

- [ ] **Step 7: Commit**

```bash
git add src/env.js src/app/api/album-enrichment
git commit -m "feat(album-enrichment): add authed claim/save/resolve HTTP API"
```

---

### Task 6: Cursor skill + research subagents

**Files:**
- Create: `.cursor/skills/enrich-for-later-album/SKILL.md`
- Create: `.cursor/agents/artist-context.md`
- Create: `.cursor/agents/why-listen.md`
- Create: `.cursor/agents/cover-descriptors.md`
- Create: `.cursor/agents/occasions.md`

**Interfaces:**
- Consumes: HTTP API from Task 5
- Produces: invokable `/enrich-for-later-album` playbook + four subagents

- [ ] **Step 1: Write orchestrator skill**

`SKILL.md` must include:

- Frontmatter `name: enrich-for-later-album` and description covering schedule + manual + **eval**
- Base URL from env/docs note (deployment URL); `Authorization: Bearer` from secrets
- **Scheduled path:** POST claim → if empty exit success → build identity packet from claim → launch only subagents for `missingSlices` → merge → POST save with `mode: "gaps"` → stop (one album)
- **Manual path:** parse user target (id/name) → GET resolve → if candidates, stop and list → identity lock → launch **all four** subagents → POST save with `mode: "overwrite"`
- **Eval path:** resolve album → identity lock → for chosen slice(s), load ≥2 variants from `.cursor/agents/variants/{slice}/` → run each variant (same packet) → POST trial per result (not live save) → print `trialRunId` + details URL → stop
- Hard rules: never research without frozen packet; never save on ambiguous resolve; never enrich a second album in the same run; eval never writes live enrichment; schedule never writes trials
- Gap-fill: pass existing enrichment fields into subagent prompts when only some slices missing

- [ ] **Step 2: Write four production agent files**

Each agent `.md`:

- Frontmatter `name` + `description` (when to delegate); optional `model` per slice if desired
- System prompt: research only inside the provided identity packet; return structured JSON for its slice only; cite sources briefly in notes if useful but JSON is the contract

Expected JSON shapes:

```json
// artist-context
{
  "origin": "...",
  "activeSince": "...",
  "instagramUrl": "https://...",
  "artistWriteup": "...",
  "listenIfYouLike": ["...", "..."]
}

// why-listen
{ "whyListenPitch": "..." }

// cover-descriptors
{ "tags": [{ "label": "Green" }, { "label": "Live show" }] }

// occasions
{ "tags": [{ "label": "Dinner party" }, { "label": "Late night" }] }
```

- [ ] **Step 3: Commit**

```bash
git add .cursor/skills/enrich-for-later-album .cursor/agents/artist-context.md .cursor/agents/why-listen.md .cursor/agents/cover-descriptors.md .cursor/agents/occasions.md
git commit -m "feat(album-enrichment): add Cursor skill and research subagents"
```

---

### Task 7: Details page UI

**Files:**
- Create: `src/app/albums/details/[albumId]/page.tsx`
- Create: `src/app/albums/details/[albumId]/_components/album-details-view.tsx`
- Create: optional skeleton colocated after main component in the same file or `album-details-view.tsx`

**Interfaces:**
- Consumes: `api.albumEnrichment.getAlbumDetails`
- Produces: `/albums/details/[albumId]` dossier

- [ ] **Step 1: Page shell**

Server or client page that reads `albumId` from params, resolves `userId` the same way other album pages do (`useAuthToken` / AUTH username pattern used on `/albums/all`), calls `getAlbumDetails`, renders not-found when null.

- [ ] **Step 2: Build `AlbumDetailsView`**

Read-only layout per spec section order:

1. Hero (cover, title, artists, year, Spotify + RYM links, slice status pills)
2. Why listen
3. Artist context
4. Cover & occasions chips
5. Library & queue
6. RYM / scrape
7. Listening / ratings
8. Raw identity footer

Design bar: use existing tokens/components (`Button`, typography, spacing). One vertical composition, not a wall of identical cards. Calm empty states (“Not enriched yet”) — never crash when enrichment is missing.

- [ ] **Step 3: Visual pass in browser**

Open a known album id and a garbage id (404). Confirm hierarchy and empty enrichment still useful.

- [ ] **Step 4: Commit**

```bash
git add src/app/albums/details
git commit -m "feat(album-enrichment): add album details dossier page"
```

---

### Task 8: Entry links from for-later and `/albums/all`

**Files:**
- Modify: `src/app/for-later-albums/_components/for-later-row.tsx` (dropdown + optional title link)
- Modify: `src/app/albums/_components/all-albums-view.tsx` (row menu / title link to details)
- Touch only what’s needed for discoverability

**Interfaces:**
- Consumes: `albumId` already on row data types
- Produces: navigation to `/albums/details/${albumId}`

- [ ] **Step 1: For-later**

Add a “Album details” item (and/or make the album title a `Link`) using `row.albumId`.

- [ ] **Step 2: All albums**

Same for library rows (`album._id` / `albumId` field already on `AlbumLibraryRowData` — use the Convex `spotifyAlbums` id, not Spotify string id).

- [ ] **Step 3: Manual check**

From for-later and `/albums/all`, open details for one album each.

- [ ] **Step 4: Commit**

```bash
git add src/app/for-later-albums/_components/for-later-row.tsx src/app/albums/_components/all-albums-view.tsx
git commit -m "feat(album-enrichment): link for-later and library rows to details"
```

---

### Task 9: Automation handoff + idea status

**Files:**
- Modify: `docs/ideas/2026-07-15-ai-album-artist-research-enrichment.md`
- No repo file for the Cursor Automation itself

**Interfaces:**
- Consumes: skill from Task 6; secrets + deployment URL
- Produces: planned idea status; operator checklist for cron

- [ ] **Step 1: Update idea frontmatter/notes**

```yaml
status: planned
```

Notes bullet:

```markdown
- Planned — spec: `docs/superpowers/specs/2026-07-17-ai-album-research-enrichment-design.md`, plan: `docs/superpowers/plans/2026-07-17-ai-album-research-enrichment.md`
```

- [ ] **Step 2: Document automation setup in the skill or a short note at bottom of SKILL.md**

Include:

- Trigger: cron (suggest daily or every few hours during backfill)
- Prompt: run `/enrich-for-later-album` in scheduled mode (one album)
- Secrets: `ALBUM_ENRICHMENT_SECRET`, deployment base URL
- Repo: this repository checked out
- Stop condition: claim returns `empty: true` (success no-op)

Do **not** claim the automation was created from chat unless `/automate` was actually run with the user.

- [ ] **Step 3: Commit**

```bash
git add docs/ideas/2026-07-15-ai-album-artist-research-enrichment.md .cursor/skills/enrich-for-later-album/SKILL.md
git commit -m "docs: mark album enrichment idea planned"
```

---

### Task 10: Trial storage + judge kinds + auto-judge

**Files:**
- Modify: `convex/schema.ts` — add `albumEnrichmentTrials`
- Create: `src/lib/album-enrichment/judge-kinds.ts` (+ tests)
- Create: `src/lib/album-enrichment/auto-judge.ts` (+ tests) — pure checks where possible; optional model call only for cover grounding / source consistency notes
- Extend: `convex/albumEnrichment.ts` (or `albumEnrichmentTrials.ts`) — `saveTrial`, `listTrialsForAlbum`, `setTrialVerdict`, `promoteTrial`

**Interfaces:**
- `judgeKindForSlice(slice)` → `auto` | `human` | `mixed` per spec table
- `saveTrial` appends row; does **not** touch `albumEnrichments`
- `promoteTrial` reuses live single-slice save semantics; sets `promotedAt` on the trial; marks sibling trials in the same `trialRunId`+slice as `reject` if they were `undecided` (optional but preferred)

- [ ] **Step 1: Schema + judge-kind helpers (TDD)**
- [ ] **Step 2: Convex trial mutations/queries**
- [ ] **Step 3: Auto-judge for `artistContext` factual fields + `coverDescriptors`**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(album-enrichment): trial storage and auto-judge"
```

---

### Task 11: Eval HTTP routes + skill eval path + seed variants

**Files:**
- Create: `src/app/api/album-enrichment/trial/route.ts`
- Create: `src/app/api/album-enrichment/promote-trial/route.ts`
- Modify: `.cursor/skills/enrich-for-later-album/SKILL.md` — document eval path
- Create: `.cursor/agents/variants/{slice}/v1.md` — copy of each production prompt as baseline candidate (four slices)
- Create: at least one alternate variant for `why-listen` and `artist-context` to exercise the loop

**Interfaces:**
- Trial POST body: `trialRunId`, `albumId`, `slice`, `variantId`, `promptPath`, `payload`, optional `model`
- Promote POST body: `trialId`
- Skill eval: one album, one or more slices, ≥2 variants each; never live save

- [ ] **Step 1: HTTP routes (fail closed on auth)**
- [ ] **Step 2: Skill eval path + variant folder convention**
- [ ] **Step 3: Seed baseline + one alternate writing variant**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(album-enrichment): eval HTTP and prompt variants"
```

---

### Task 12: Details trials UI (compare + promote)

**Files:**
- Create: `src/app/albums/details/[albumId]/_components/enrichment-trials.tsx`
- Modify: `album-details-view.tsx` — mount trials section when trials exist
- Wire promote + verdict via Convex client mutations (authed app user) **or** bearer HTTP from a small server action — prefer Convex mutations for UI (same auth as rest of app); keep HTTP promote for skill/automation use

**UI:**
- Group by `trialRunId` then slice
- Side-by-side for human/mixed writing fields
- Show auto-check chips/notes for auto/mixed factual
- Win / reject / Promote to live
- After promote, live dossier sections refresh; trial retained

- [ ] **Step 1: List + compare UI**
- [ ] **Step 2: Verdict + promote actions**
- [ ] **Step 3: Manual smoke — eval two why-listen variants, promote winner, confirm live pitch**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(album-enrichment): trials compare and promote UI"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| For-later claim only | 3, 5 |
| Album-centric storage + facets | 2, 3 |
| Per-slice gap-fill / app-owned required list | 1, 3, 6 |
| Manual overwrite by name/id | 3, 5, 6 |
| Schedule one album / gaps-only | 6, 9 |
| Identity lock | 6 |
| Four research slices | 6 |
| Authed HTTP | 5 |
| Details dossier | 4, 7 |
| Entry from for-later + `/albums/all` | 8 |
| No product filters v1 | (explicit non-goal; facets only) |
| Idea → planned | 9 |
| Prompt eval trials + per-slice judge | 10–12 |
| Eval never writes live until promote | 10, 11 |
| Human compare + promote UI | 12 |

## Placeholder / consistency check

- Slice key names identical in lib, Convex util, schema `slices` object, and skill
- HTTP uses `ALBUM_ENRICHMENT_SECRET`; claim user is `SPOTIFY_SYNC_USER_ID`
- Details route param is Convex `spotifyAlbums` id
- Cover facet keys use `coverDescriptorKey`, not RYM `descriptorKey`
