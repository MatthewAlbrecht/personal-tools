# Folio Society Catalog Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/folio-society` with a seasonal cover catalog, Library-style filters, per-edition owned/want, verbosity-3 dates, and settings-only ops chrome.

**Architecture:** Pure helpers derive `edition` / `titleKey` / `seasonSortKey` at write time. Sync + batched internal backfill denormalize those fields onto `folioSocietyReleases`. Catalog query uses a custom season cursor (never `.paginate()` then TS-filter, never full-table `.collect()`). Ownership is a small table keyed by server constant `folio-owner`. The page is a new catalog UI; scrape controls move into a settings sheet.

**Tech Stack:** Next.js 15 App Router, Convex, React 19, Tailwind v4, shadcn (`Sheet`, `Button`, `Input`, `Badge`, `Skeleton`), `node:test` via `pnpm exec tsx --test`, Biome

**Spec:** `docs/superpowers/specs/2026-09-15-folio-society-catalog-design.md`

## Global Constraints

- Classic function declarations; `type` aliases; kebab-case filenames; inline component props
- No `Date.now()` in Convex queries — client passes `now`
- No unbounded `.collect()` of `folioSocietyReleases` or `folioSocietyProductDetails` on the catalog path
- Do not schedule `api.*`; backfill/sync continuation uses `internal.*` only
- Do not put `userId` on ownership mutation args; server sets `"folio-owner"`
- Do not join `folioSocietyProductDetails` in the catalog query
- Expand = full-width grid row break, not cell grow / col-span
- USD prices; USA store
- Copy from the spec string table (no “Release Tracker”, no first-seen on cards)
- Do not commit unrelated dirty workspace files (convex skill dumps, ideas, etc.)

## File map

| File | Responsibility |
|---|---|
| `convex/_utils/folioCatalogFields.ts` | edition, titleKey, season keys, publication parse, searchText |
| `convex/_utils/folioCatalogFields.test.ts` | Unit tests for those helpers |
| `src/app/folio-society/_utils/filter-state.ts` | URL serialize/parse |
| `src/app/folio-society/_utils/filter-state.test.ts` | Filter URL tests |
| `convex/schema.ts` | Release field extensions + `folioSocietyOwnership` |
| `convex/folioSocietyCatalog.ts` | Catalog query, family query, ownership, constants |
| `convex/folioSocietyBackfill.ts` | Internal batch backfill |
| `convex/folioSocietyReleases.ts` | Verbosity 3 sync; persist catalog fields; stop full collect for catalog |
| `src/app/folio-society/_components/folio-filters.tsx` | Rail + Sheet controls |
| `src/app/folio-society/_components/folio-book-card.tsx` | Collapsed tile + expanded row |
| `src/app/folio-society/_components/folio-season-section.tsx` | Season chapter + grid |
| `src/app/folio-society/_components/folio-settings-sheet.tsx` | Sync / enrich / range / images / backfill |
| `src/app/folio-society/_components/folio-catalog-page.tsx` | Page composition |
| `src/app/folio-society/page.tsx` | Wire catalog page |

---

### Task 1: Catalog field helpers (TDD)

**Files:**
- Create: `convex/_utils/folioCatalogFields.ts`
- Create: `convex/_utils/folioCatalogFields.test.ts`

**Interfaces:**

```ts
type FolioEdition = "standard" | "limited" | "signed" | "bundle";

function inferEdition(name: string, hasLaunchOrPublication: boolean): FolioEdition
function makeTitleKey(name: string, authorName?: string): string
function parsePublicationDateToMs(text: string | undefined): number | undefined
function parseLaunchTimeToMs(iso: string | undefined): number | undefined
function seasonFromTimestamp(ms: number): {
  seasonKey: string; // "2026-fall"
  seasonSortKey: string; // "2026-09"
  label: string; // "Fall 2026"
}
function undatedSeason(): { seasonKey: "undated"; seasonSortKey: "0000-00"; label: "Undated" }
function catalogLaunchTime(launchMs?: number, publicationMs?: number): number
function buildSearchText(name: string, authorName?: string): string
```

- [ ] **Step 1: Write the failing tests**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	catalogLaunchTime,
	inferEdition,
	makeTitleKey,
	parsePublicationDateToMs,
	seasonFromTimestamp,
} from "./folioCatalogFields";

test("inferEdition limited and signed", () => {
	assert.equal(inferEdition("Carrie (Limited Edition)", true), "limited");
	assert.equal(inferEdition("Say Nothing (signed edition)", true), "signed");
	assert.equal(inferEdition("Carrie", true), "standard");
});

test("inferEdition bundle only without dates", () => {
	assert.equal(
		inferEdition("The Shirley Jackson Collection", false),
		"bundle",
	);
	assert.equal(
		inferEdition("The Shirley Jackson Collection", true),
		"standard",
	);
});

test("makeTitleKey requires author to join", () => {
	assert.equal(makeTitleKey("Carrie ", "Stephen King"), "stephen king|carrie");
	assert.notEqual(makeTitleKey("Carrie", undefined), makeTitleKey("Carrie", "King"));
	assert.match(makeTitleKey("Carrie (Limited Edition)", "Stephen King"), /\|carrie$/);
});

test("parsePublicationDateToMs accepts DD/MM/YYYY and DD/MM/YY", () => {
	const a = parsePublicationDateToMs("15/09/2026");
	const b = parsePublicationDateToMs("05/05/26");
	assert.ok(a);
	assert.ok(b);
	assert.equal(new Date(a).getUTCFullYear(), 2026);
	assert.equal(new Date(b).getUTCFullYear(), 2026);
});

test("seasonFromTimestamp Fall before Spring and Dec rolls Winter label", () => {
	const fall = seasonFromTimestamp(Date.UTC(2026, 8, 15));
	const spring = seasonFromTimestamp(Date.UTC(2026, 4, 5));
	const dec = seasonFromTimestamp(Date.UTC(2026, 11, 2));
	assert.equal(fall.label, "Fall 2026");
	assert.equal(spring.label, "Spring 2026");
	assert.ok(fall.seasonSortKey > spring.seasonSortKey);
	assert.equal(dec.label, "Winter 2027");
	assert.equal(dec.seasonSortKey, "2026-12");
});

test("catalogLaunchTime prefers launch", () => {
	assert.equal(catalogLaunchTime(100, 50), 100);
	assert.equal(catalogLaunchTime(undefined, 50), 50);
	assert.equal(catalogLaunchTime(undefined, undefined), 0);
});
```

- [ ] **Step 2: Run tests — expect fail**

```bash
pnpm exec tsx --test convex/_utils/folioCatalogFields.test.ts
```

- [ ] **Step 3: Implement helpers** (classic functions, `type` aliases)

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm exec tsx --test convex/_utils/folioCatalogFields.test.ts
```

---

### Task 2: Filter URL state (TDD)

**Files:**
- Create: `src/app/folio-society/_utils/filter-state.ts`
- Create: `src/app/folio-society/_utils/filter-state.test.ts`

Defaults: all collection/edition flags off; bundles off; search empty.

- [ ] **Step 1: Failing tests** for `parseFolioFilters` / `serializeFolioFilters`: empty params → defaults; `owned=1&want=1` round-trips; bundles omitted when false; search `q`.

- [ ] **Step 2: Implement** using the same `setIfPresent` / `setIfNotDefault` style as `src/app/for-later-albums/_utils/filter-state.ts`.

- [ ] **Step 3: `pnpm exec tsx --test src/app/folio-society/_utils/filter-state.test.ts`**

---

### Task 3: Schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] Add optional/required-with-defaults fields on `folioSocietyReleases` from the spec (`launchTime`, `publicationDateText`, `publicationDateTime`, `catalogLaunchTime`, `isComingSoon`, `edition`, `isBundle`, `titleKey`, `authorName`, `searchText`, `seasonKey`, `seasonSortKey`, `heroImageUrl`, `familyHasLimited`, `familyHasSigned`).
- [ ] Indexes: `by_titleKey`, `by_isActive_isBundle_seasonSortKey`, `by_isActive_edition_seasonSortKey`, `by_isActive_catalogLaunchTime`.
- [ ] `searchIndex("search_title_author", { searchField: "searchText", filterFields: ["isActive", "edition", "isBundle"] })`.
- [ ] Table `folioSocietyOwnership` + indexes `by_user_product`, `by_user_status`.
- [ ] On `folioSocietyConfig`: optional `backfillCursorExternalId`, `backfillStatus`.
- [ ] `npx convex dev` / schema push via existing local workflow — do **not** `npx convex deploy`.
- [ ] Source test or typecheck: `pnpm typecheck`

Existing rows lack new fields until backfill. Make new fields optional **or** write defaults in backfill before the catalog query assumes them. Catalog query must treat missing `seasonSortKey` as `0000-00` / undated during rollout.

---

### Task 4: Apply-catalog-fields internal mutation + family flags

**Files:**
- Create: `convex/folioSocietyCatalog.ts` (internal write helpers + later queries)
- Modify: `convex/folioSocietyReleases.ts` create/update args to accept catalog fields

- [ ] `internalMutation applyCatalogFields` patches one release from verbosity-3 payload using Task 1 helpers.
- [ ] After edition/titleKey write, load `by_titleKey` siblings (capped) and set `familyHasLimited` / `familyHasSigned` on the family. Skip join when `makeTitleKey` has no author (solo family).
- [ ] `heroImageUrl` = existing processed hero if we can point-get images by product without collecting all images; else Folio `image` URL. Do not `.collect()` `folioSocietyImages`.
- [ ] Constant `FOLIO_OWNER_USER_ID = "folio-owner"`.

---

### Task 5: Catalog query + ownership (TDD contract)

**Files:**
- Modify: `convex/folioSocietyCatalog.ts`
- Create: `convex/folioSocietyCatalog-source.test.ts`

Public:

- `listCatalogPage` — args: `now`, filters, `cursor`, `pageSizeSeasons`; **returns validator**
- `getFamilyByTitleKey` — expand switcher
- `setOwnership` — `{ productId, status: v.union(v.literal("owned"), v.literal("want"), v.null()) }`, `returns: v.null()`

- [ ] **Step 1: Source tests** asserting:
  - `listCatalogPage` does not call `.collect()` on `folioSocietyReleases`
  - owned/want branch queries `folioSocietyOwnership` `by_user_status` first
  - `now` is an arg; no `Date.now()` in this file’s queries
  - `setOwnership` does not take `userId`
  - `returns:` present on public functions

- [ ] **Step 2: Implement query paths** per spec (default index, edition index, ownership point-gets, searchIndex cap 64). Custom cursor `{ beforeSeasonSortKey }`. Never return a partial season.

- [ ] **Step 3: Implement `setOwnership`**: get by `by_user_product`; insert/patch/delete; reject unknown `productId`; `updatedAt: Date.now()` is OK in **mutations**.

- [ ] **Step 4: Run source tests + `pnpm typecheck`**

---

### Task 6: Sync verbosity 3

**Files:**
- Modify: `convex/folioSocietyReleases.ts`

- [ ] Change load URL `verbosity=1` → `verbosity=3`.
- [ ] Split ID range into chunks of ≤50 ids per `fetch`.
- [ ] On create/update, call `applyCatalogFields` (or inline the same write).
- [ ] Replace `getAllReleases` `.collect()` used for “does this id exist?” with `by_external_id` per product in the chunk.
- [ ] Stop `ctx.scheduler.runAfter(0, api.folioSocietyDetails.enrichDetails, ...)`. If enrichment remains, schedule `internal` only.
- [ ] Source test: file contains `verbosity=3` and does not contain `api.folioSocietyDetails.enrichDetails`.

Do not change the Next cron route except if args need updating.

---

### Task 7: Backfill

**Files:**
- Create: `convex/folioSocietyBackfill.ts`
- Modify: `convex/schema.ts` config fields if not done in Task 3
- Wire start from settings in Task 9

- [ ] `startFolioCatalogBackfill` public mutation → `scheduler.runAfter(0, internal.folioSocietyBackfill.runBatch, { cursor })`.
- [ ] `internalAction runBatch`: ≤25 ids, verbosity 3, then `applyBatch`.
- [ ] `internalMutation applyBatch`: patch fields; write next cursor + status on config; schedule next batch or `done`.
- [ ] Never `getAllReleases` / `getAllDetails`. Page ids via `by_external_id` or config range.
- [ ] Source test: no `api.` in scheduler calls in this file.

---

### Task 8: Filters + settings UI

**Files:**
- Create: `src/app/folio-society/_components/folio-filters.tsx`
- Create: `src/app/folio-society/_components/folio-settings-sheet.tsx`

- [ ] Filters: same rail language as `LibraryFilters` (uppercase micro-labels, segmented/toggles for Owned, Want, LE, Signed, This year, Coming, Bundles; search input; Clear filters).
- [ ] Settings sheet: Sync, Enrich details, Process images, ID range Start/End, Dates filling in from `backfillStatus`. Copy from spec. No “successfully!” toasts.

---

### Task 9: Catalog page + cards

**Files:**
- Create: `folio-book-card.tsx`, `folio-season-section.tsx`, `folio-catalog-page.tsx`
- Modify: `src/app/folio-society/page.tsx`
- Leave old `release-item.tsx` unused or delete only if nothing imports it (this plan’s cleanup).

- [ ] Page: header **Folio Society**, `{n} books`, Settings; desktop rail; mobile Filters `Sheet`; `listCatalogPage` with `now: Date.now()` from client; load more = next season cursor.
- [ ] Season section: Fraunces chapter title + thin rule + cover grid.
- [ ] Card collapsed per spec. Expanded: insert a **full-width row after the open card’s grid row** (CSS grid `grid-column: 1 / -1` on a sibling detail element placed after that row in DOM — not `col-span` on the tile itself). One open per season.
- [ ] Expand loads family + images. Marks call `setOwnership` and do not toggle expand.
- [ ] Empty states from spec (owned+want → “Nothing on your shelf.”).
- [ ] Remove StatsSection, ConfigSection, per-row Process Images from the browse surface.

---

### Task 10: Cleanup + verify

- [ ] `pnpm typecheck`
- [ ] `pnpm check`
- [ ] `pnpm exec tsx --test convex/_utils/folioCatalogFields.test.ts src/app/folio-society/_utils/filter-state.test.ts convex/folioSocietyCatalog-source.test.ts`
- [ ] Browser (when implementing): land on `/folio-society`, newest season, expand row-break, owned/want, filters, settings sync, bundles off by default, infinite scroll older season. Desktop + mobile sheet.

## Test plan (manual)

- [ ] Catalog shows covers grouped by Fall/Spring/… not ID order
- [ ] Bundles hidden until Bundles on
- [ ] LE filter shows LE in its launch season
- [ ] Expand does not shuffle sibling columns
- [ ] Own standard / want LE on the same family
- [ ] Backfill/settings does not block the grid
- [ ] No ID / SKU / first-seen / Process Images on cards
