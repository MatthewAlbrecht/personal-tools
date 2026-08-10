# Bandcamp Album Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture Bandcamp album pages via the existing browser extension into `spotifyAlbums` with `source: "bandcamp"`, upserted by URL, and projected into the user’s library.

**Architecture:** Pure URL/date helpers → schema `bandcampUrl` + source literal → Convex upsert + library mutation → secret-gated Next route → extension FAB content script + service worker POST. App treats Bandcamp like manual for Spotify-only chrome.

**Tech Stack:** Convex, Next.js App Router, Chrome MV3 extension (vanilla JS), node:test, Biome

**Spec:** `docs/superpowers/specs/2026-08-10-bandcamp-album-capture-design.md`

## Global Constraints

- Stay on the **current git branch**; do not create a worktree or new branch.
- Do not touch unrelated dirty working-tree files (zine, genius, idea docs).
- `source: "bandcamp"`; identity = normalized `bandcampUrl` only (never title+artist dedupe).
- Album pages only (`*/album/*`); no auto-capture; floating button required.
- Fields: title, artist string, artwork URL, release date (`YYYY-MM-DD` or `YYYY`), URL.
- Auth: reuse `RYM_EXTENSION_INGEST_SECRET`; library user = `SPOTIFY_SYNC_USER_ID`.
- Never set `spotifyAlbumId` on Bandcamp rows; never invent Spotify IDs.
- Classic function declarations; `type` not `interface`; kebab-case files; tab indentation.
- Commit after each task with a focused message.

## File map

| File | Role |
|------|------|
| `convex/_utils/bandcampAlbumUrl.ts` | Normalize/validate Bandcamp album URLs |
| `convex/_utils/bandcampAlbumUrl.test.ts` | URL tests |
| `convex/_utils/bandcampReleaseDate.ts` | Parse Bandcamp credits date text |
| `convex/_utils/bandcampReleaseDate.test.ts` | Date tests |
| `convex/_utils/bandcampAlbum.ts` | Upsert catalog helper |
| `convex/schema.ts` | `source` + `bandcampUrl` + index |
| `convex/spotify.ts` | `captureBandcampAlbumToLibrary` mutation |
| `convex/spotify.capture-bandcamp-album-source.test.ts` | Source/shape tests |
| `src/app/api/bandcamp/capture/route.ts` | Ingest API |
| `extensions/rym-release-scraper/bandcamp-content.js` | FAB + scrape |
| `extensions/rym-release-scraper/service-worker.js` | Message + POST |
| `extensions/rym-release-scraper/manifest.json` | Matches + version |
| `extensions/rym-release-scraper/options.html` | Copy mention Bandcamp |
| `src/app/robs-rankings/_components/edit-album-dialog.tsx` | Bandcamp badge / copy |
| `src/app/robs-rankings/_components/ranking-board.tsx` | `isManual` includes bandcamp for non-Spotify chrome |

---

### Task 1: Bandcamp URL + release date helpers

**Files:**
- Create: `convex/_utils/bandcampAlbumUrl.ts`
- Create: `convex/_utils/bandcampAlbumUrl.test.ts`
- Create: `convex/_utils/bandcampReleaseDate.ts`
- Create: `convex/_utils/bandcampReleaseDate.test.ts`

**Interfaces:**
- Produces: `normalizeBandcampAlbumUrl(raw: string): string` (throws on invalid)
- Produces: `parseBandcampReleaseDate(raw: string): string | undefined` → `"YYYY-MM-DD" | "YYYY" | undefined`

- [ ] **Step 1: Write failing URL tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBandcampAlbumUrl } from "./bandcampAlbumUrl";

test("normalizeBandcampAlbumUrl canonicalizes https host path", () => {
	assert.equal(
		normalizeBandcampAlbumUrl(
			"http://www.JPlank.bandcamp.com/album/slow-steady/?from=foo#x",
		),
		"https://jplank.bandcamp.com/album/slow-steady",
	);
});

test("normalizeBandcampAlbumUrl rejects non-album paths", () => {
	assert.throws(() =>
		normalizeBandcampAlbumUrl("https://jplank.bandcamp.com/track/slow-steady"),
	);
});

test("normalizeBandcampAlbumUrl rejects non-bandcamp hosts", () => {
	assert.throws(() =>
		normalizeBandcampAlbumUrl("https://example.com/album/slow-steady"),
	);
});
```

- [ ] **Step 2: Run URL tests — expect FAIL**

Run: `node --import tsx --test convex/_utils/bandcampAlbumUrl.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `normalizeBandcampAlbumUrl`**

```ts
export function normalizeBandcampAlbumUrl(raw: string): string {
	const trimmed = raw.trim();
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new Error("Invalid Bandcamp URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Invalid Bandcamp URL protocol");
	}
	const host = url.hostname.toLowerCase().replace(/^www\./, "");
	if (!host.endsWith(".bandcamp.com") && host !== "bandcamp.com") {
		throw new Error("URL must be a bandcamp.com host");
	}
	const path = url.pathname.replace(/\/+$/, "") || "";
	if (!path.includes("/album/")) {
		throw new Error("URL must be a Bandcamp album page");
	}
	return `https://${host}${path}`;
}
```

- [ ] **Step 4: Write failing date tests + implement parser**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseBandcampReleaseDate } from "./bandcampReleaseDate";

test("parseBandcampReleaseDate parses full month day year", () => {
	assert.equal(
		parseBandcampReleaseDate("released May 6, 2026"),
		"2026-05-06",
	);
});

test("parseBandcampReleaseDate falls back to year", () => {
	assert.equal(parseBandcampReleaseDate("released 2024"), "2024");
});

test("parseBandcampReleaseDate returns undefined for garbage", () => {
	assert.equal(parseBandcampReleaseDate("coming soon"), undefined);
});
```

Implementation notes: strip leading `/^released\s+/i`; try `Date.parse` / manual month map for `Month D, YYYY`; else match `/\b(19|20)\d{2}\b/`.

- [ ] **Step 5: Run both test files — expect PASS**

Run: `node --import tsx --test convex/_utils/bandcampAlbumUrl.test.ts convex/_utils/bandcampReleaseDate.test.ts`

- [ ] **Step 6: Commit**

```bash
git add convex/_utils/bandcampAlbumUrl.ts convex/_utils/bandcampAlbumUrl.test.ts convex/_utils/bandcampReleaseDate.ts convex/_utils/bandcampReleaseDate.test.ts
git commit -m "$(cat <<'EOF'
feat(bandcamp): add URL normalize and release date parse helpers

EOF
)"
```

---

### Task 2: Schema — `bandcamp` source + `bandcampUrl` index

**Files:**
- Modify: `convex/schema.ts` (`spotifyAlbums` table ~521–540; optional source union ~1295)
- Modify: `convex/spotify.add-manual-album-to-library-source.test.ts` (widen source regex to allow `bandcamp`)

**Interfaces:**
- Produces: `spotifyAlbums.source` includes `"bandcamp"`; optional `bandcampUrl`; index `by_bandcampUrl`

- [ ] **Step 1: Update failing expectation in manual source test**

Change the source union regex to require all three literals:

```ts
/source:\s*v\.union\(\s*v\.literal\("spotify"\),\s*v\.literal\("manual"\),\s*v\.literal\("bandcamp"\)\s*\)/
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `node --import tsx --test convex/spotify.add-manual-album-to-library-source.test.ts`

- [ ] **Step 3: Update schema**

In `spotifyAlbums`:

```ts
source: v.union(
  v.literal("spotify"),
  v.literal("manual"),
  v.literal("bandcamp"),
),
bandcampUrl: v.optional(v.string()),
```

Add `.index("by_bandcampUrl", ["bandcampUrl"])` on that table.

Also widen the optional source union near schema line ~1295 to include `"bandcamp"` if it mirrors catalog sources.

- [ ] **Step 4: Re-run source test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/spotify.add-manual-album-to-library-source.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): add bandcamp source and bandcampUrl index

EOF
)"
```

---

### Task 3: Convex upsert helper + `captureBandcampAlbumToLibrary`

**Files:**
- Create: `convex/_utils/bandcampAlbum.ts`
- Modify: `convex/spotify.ts` (add mutation near `addManualAlbumToLibrary`)
- Create: `convex/spotify.capture-bandcamp-album-source.test.ts`

**Interfaces:**
- Consumes: `normalizeBandcampAlbumUrl`, `normalizeAlbumTitle` from albumMatching, `upsertAlbumLibraryProjection`
- Produces: `upsertBandcampAlbumRecord(ctx, args) => Promise<{ albumId; alreadyExists }>`
- Produces: `captureBandcampAlbumToLibrary` mutation return `{ albumId, name, artistName, alreadyExists, alreadyInLibrary }`

- [ ] **Step 1: Write failing source test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const spotify = readFileSync(join(process.cwd(), "convex/spotify.ts"), "utf8");
const helper = readFileSync(
	join(process.cwd(), "convex/_utils/bandcampAlbum.ts"),
	"utf8",
);

test("captureBandcampAlbumToLibrary mutation exists", () => {
	assert.match(
		spotify,
		/export const captureBandcampAlbumToLibrary = mutation\(/,
	);
});

test("bandcamp upsert helper writes source bandcamp and never spotifyAlbumId", () => {
	assert.match(helper, /source:\s*"bandcamp"/);
	assert.doesNotMatch(helper, /spotifyAlbumId:/);
	assert.match(helper, /by_bandcampUrl/);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --import tsx --test convex/spotify.capture-bandcamp-album-source.test.ts`

- [ ] **Step 3: Implement `convex/_utils/bandcampAlbum.ts`**

```ts
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeAlbumTitle } from "./albumMatching";
import { normalizeBandcampAlbumUrl } from "./bandcampAlbumUrl";

export async function upsertBandcampAlbumRecord(
	ctx: MutationCtx,
	args: {
		bandcampUrl: string;
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	},
): Promise<{ albumId: Id<"spotifyAlbums">; alreadyExists: boolean }> {
	const bandcampUrl = normalizeBandcampAlbumUrl(args.bandcampUrl);
	const name = args.name.replace(/\s+/g, " ").trim();
	const artistName = args.artistName.replace(/\s+/g, " ").trim();
	if (!name) throw new Error("Album title is required");
	if (!artistName) throw new Error("Artist name is required");

	const albumTitleKey = normalizeAlbumTitle(name);
	const now = Date.now();

	const existing = await ctx.db
		.query("spotifyAlbums")
		.withIndex("by_bandcampUrl", (q) => q.eq("bandcampUrl", bandcampUrl))
		.first();

	if (existing) {
		if (existing.source !== "bandcamp") {
			throw new Error("bandcampUrl collides with a non-bandcamp album");
		}
		await ctx.db.patch(existing._id, {
			name,
			artistName,
			albumTitleKey,
			imageUrl: args.imageUrl,
			releaseDate: args.releaseDate,
			updatedAt: now,
		});
		return { albumId: existing._id, alreadyExists: true };
	}

	const albumId = await ctx.db.insert("spotifyAlbums", {
		source: "bandcamp",
		bandcampUrl,
		name,
		artistName,
		albumTitleKey,
		imageUrl: args.imageUrl,
		releaseDate: args.releaseDate,
		totalTracks: 0,
		createdAt: now,
		updatedAt: now,
	});
	return { albumId, alreadyExists: false };
}
```

- [ ] **Step 4: Add mutation in `convex/spotify.ts`**

Import helper + `upsertAlbumLibraryProjection` (already used). Add:

```ts
export const captureBandcampAlbumToLibrary = mutation({
	args: {
		userId: v.string(),
		bandcampUrl: v.string(),
		name: v.string(),
		artistName: v.string(),
		imageUrl: v.optional(v.string()),
		releaseDate: v.optional(v.string()),
	},
	returns: v.object({
		albumId: v.id("spotifyAlbums"),
		name: v.string(),
		artistName: v.string(),
		alreadyExists: v.boolean(),
		alreadyInLibrary: v.boolean(),
	}),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const { albumId, alreadyExists } = await upsertBandcampAlbumRecord(ctx, {
			bandcampUrl: args.bandcampUrl,
			name: args.name,
			artistName: args.artistName,
			imageUrl: args.imageUrl,
			releaseDate: args.releaseDate,
		});
		const album = await ctx.db.get(albumId);
		if (!album) throw new Error("Album not found after upsert");

		const existingLibraryRow = await ctx.db
			.query("albumLibraryItems")
			.withIndex("by_userId_albumId", (q) =>
				q.eq("userId", args.userId).eq("albumId", albumId),
			)
			.first();
		const alreadyInLibrary = existingLibraryRow !== null;

		await upsertAlbumLibraryProjection(ctx, {
			userId: args.userId,
			albumId,
		});

		return {
			albumId,
			name: album.name,
			artistName: album.artistName,
			alreadyExists,
			alreadyInLibrary,
		};
	},
});
```

- [ ] **Step 5: Run source test — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add convex/_utils/bandcampAlbum.ts convex/spotify.ts convex/spotify.capture-bandcamp-album-source.test.ts
git commit -m "$(cat <<'EOF'
feat(bandcamp): upsert bandcamp albums into library catalog

EOF
)"
```

---

### Task 4: Next ingest route

**Files:**
- Create: `src/app/api/bandcamp/capture/route.ts`

**Interfaces:**
- Consumes: `api.spotify.captureBandcampAlbumToLibrary`, `env.RYM_EXTENSION_INGEST_SECRET`, `env.SPOTIFY_SYNC_USER_ID`, `env.NEXT_PUBLIC_CONVEX_URL`
- Produces: `POST /api/bandcamp/capture` → `{ ok, albumId, alreadyExists, alreadyInLibrary }`

- [ ] **Step 1: Implement route** mirroring `src/app/api/rate-your-music/scrape/route.ts`:

- 503 if secret unset
- 401 if Bearer mismatch
- 400 if missing `bandcampUrl` / `name` / `artistName`
- Optional `imageUrl`, `releaseDate` (strings trimmed)
- `userId: env.SPOTIFY_SYNC_USER_ID`
- Call mutation; return JSON; catch Convex errors as 400

- [ ] **Step 2: Typecheck route imports**

Run: `pnpm exec tsc --noEmit -p tsconfig.json` is heavy; prefer ensuring file imports resolve. At minimum: `pnpm check` on the new file if Biome supports path, or rely on IDE. If Convex API types not regenerated yet, run whatever the repo uses (`npx convex codegen` only if needed and safe on this branch — do not `convex deploy`).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bandcamp/capture/route.ts
git commit -m "$(cat <<'EOF'
feat(api): add bandcamp album capture ingest route

EOF
)"
```

---

### Task 5: Extension — FAB, scrape, sync

**Files:**
- Create: `extensions/rym-release-scraper/bandcamp-content.js`
- Modify: `extensions/rym-release-scraper/service-worker.js`
- Modify: `extensions/rym-release-scraper/manifest.json`
- Modify: `extensions/rym-release-scraper/options.html` (one-line copy that secret also covers Bandcamp)

**Interfaces:**
- Produces: message type `BANDCAMP_ALBUM_CAPTURE` with payload `{ source: "bandcamp.com", bandcampUrl, name, artistName, imageUrl?, releaseDate?, capturedAt }`
- Service worker POSTs to `${origin}/api/bandcamp/capture`

- [ ] **Step 1: Update `manifest.json`**

- Bump version (e.g. `0.1.4` → `0.2.0`)
- Name/description: mention Bandcamp album capture
- `host_permissions`: add `https://*.bandcamp.com/*`
- New content_scripts entry:

```json
{
  "matches": ["https://*.bandcamp.com/album/*"],
  "js": ["bandcamp-content.js"],
  "run_at": "document_idle"
}
```

- [ ] **Step 2: Implement `bandcamp-content.js`**

Requirements:

- Fixed bottom-right floating button, high contrast, distinct from Bandcamp blue (e.g. near-black surface + warm accent border/label — obvious, not stealth).
- Label **Add to library**; while posting disable + show **Saving…**; success **Saved** / flip to **Update in library**; error state with message.
- Scrape:
  - title: `#name-section h2.trackTitle`
  - artist: `#name-section h3 a`
  - art: `#tralbumArt a.popupImage` href
  - credits: `.tralbum-credits` — strip `released `, leave raw text in payload as `releaseDateRaw` **or** parse client-side to `YYYY-MM-DD`/`YYYY`. Prefer client-side parse duplicated lightly OR send raw and let API parse — **spec prefers normalized date in Convex args**. Parse in content script with the same rules (inline small month map) OR send credits text and parse in the Next route. **Plan choice: parse in Next/Convex by accepting either ISO/year or credits text.** Simplest: content script sends `releaseDate` already normalized using an inline `parseBandcampReleaseDate` copy (keep small; comment “keep in sync with convex/_utils/bandcampReleaseDate.ts”).
- Send message `BANDCAMP_ALBUM_CAPTURE`; show backend sync result like RYM toasts (reuse similar toast styling).

- [ ] **Step 3: Extend `service-worker.js`**

- On `BANDCAMP_ALBUM_CAPTURE`: optional local map under key `bandcampAlbumCaptures` keyed by normalized path; `forwardBandcampCaptureToBackend` POSTs to `/api/bandcamp/capture` with same origin/secret helpers as RYM.
- Keep existing RYM handler unchanged.

- [ ] **Step 4: Options copy** — mention Bandcamp uses the same ingest secret.

- [ ] **Step 5: Commit**

```bash
git add extensions/rym-release-scraper/
git commit -m "$(cat <<'EOF'
feat(extension): add Bandcamp album floating capture button

EOF
)"
```

---

### Task 6: App UI — Bandcamp provenance (shadcn)

**Files:**
- Modify: `src/app/robs-rankings/_components/edit-album-dialog.tsx`
- Modify: `src/app/robs-rankings/_components/ranking-board.tsx` (where `isManual={album.source === "manual"}`)

**Interfaces:**
- Treat `"bandcamp"` as non-Spotify for chrome that already special-cases manual.
- Show `Badge` “Bandcamp” when `source === "bandcamp"`.

- [ ] **Step 1: Update edit dialog**

```tsx
{album.source === "manual" && (
  <Badge variant="secondary">Manual</Badge>
)}
{album.source === "bandcamp" && (
  <Badge variant="secondary">Bandcamp</Badge>
)}
```

Adjust description copy so Bandcamp is not described as Spotify-linked.

- [ ] **Step 2: Update ranking board**

Pass non-Spotify flag for both:

```tsx
isManual={album.source === "manual" || album.source === "bandcamp"}
```

(If prop name is awkward, leave name as-is for YAGNI — it already means “no Spotify chrome”.)

- [ ] **Step 3: Grep for other `source === "manual"` UI branches that hide Spotify actions; update only those that would incorrectly show Spotify chrome for Bandcamp. Do not redesign `/albums/all`.**

- [ ] **Step 4: Commit**

```bash
git add src/app/robs-rankings/_components/edit-album-dialog.tsx src/app/robs-rankings/_components/ranking-board.tsx
# plus any other files touched in step 3
git commit -m "$(cat <<'EOF'
feat(ui): show Bandcamp source badge and non-Spotify chrome

EOF
)"
```

---

## Plan self-review

1. **Spec coverage:** URL/date helpers, schema, upsert+library mutation, Next ingest, extension FAB+sync, app badge — all mapped.
2. **Placeholders:** none intentional.
3. **Types:** `captureBandcampAlbumToLibrary` args/returns consistent across Task 3–4; message payload fields match route.

## Execution

User requested **Subagent-Driven Development on this exact branch** — execute Tasks 1–6 continuously without pausing for confirmation between tasks.
