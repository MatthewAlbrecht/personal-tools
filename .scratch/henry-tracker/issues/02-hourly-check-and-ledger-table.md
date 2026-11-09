# 02: Hourly check and the Ledger table

**What to build:** Every hour the app reads The Henry's availability from SightMap and records each unit and its price. The first successful check is a silent baseline: those units are "tracked since" that day. Units that appear after it are *listed* (new). A new The Henry page, linked from the app nav, shows a summary line ("33 on the market · N new this week · checked X ago") and one Ledger row per unit on the market: unit number with "New · Nd" and "I-25 side" badges, floor plan · beds, sq ft, floor, price and move-in ("Now" or a date).

**Blocked by:** None (can start immediately)

**Status:** done

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (Source; Check rules; Schema; I-25 side; The page; stories 1–4, 7, 10–12, 18–19, 22–24)
Real response for fixtures: `.scratch/henry-tracker/fixtures/sightmap-2026-11-08.json` (trim it to a small test fixture)
Design reference: the prototype at `src/app/prototypes/henry/` (Ledger variant)

- [x] Hourly Convex cron → a thin action fetches `https://sightmap.com/app/api/v1/960p7z7lw7n/sightmaps/13397` (accepts gzip) and passes the raw payload to one internal record-check mutation (the test seam)
- [x] Record check parses units (number, floor, floor plan name/beds/baths, sq ft, base rent, total with fees, lease term, available-on `YYYY-MM-DD`, specials) and records units and price points; a price point only when base rent changes
- [x] First successful check = baseline: no "New", timeline would start "Tracking began"; later unseen units = listed, with first-seen time
- [x] Each check is logged (success/failure, reason, unit count); invalid JSON / no `units` array = failed and changes nothing
- [x] I-25 side from the fixed list in the spec (155; 249, 251, 253, 273, 275; odd 349–383, 449–483, 549–581, 649–681, 749–779)
- [x] Auth-wrapped page query: summary counts, last successful check, listed units sorted by price with badges; reads bounded
- [x] The Henry page in the app nav; Ledger table with shadcn Table; works at phone width (table scrolls in its box, no page sideways scroll) and in light and dark (built with semantic tokens and the prototype's scroll box; not eyeballed in a browser, see below)
- [x] Empty state before the first check; a note while there's no history yet
- [x] convex-test (Seam 1) covers baseline, a new listing after it, a price change making a price point, an unchanged price making none, a failed payload changing nothing, the I-25 badge
- [x] Public-surface lockdown test still passes
- [x] First real check observed on the dev deployment (left for the user if it can't run here)

Left for you: a look at `/henry` in the browser (phone width, light and dark). The page is behind the session login, so the build didn't sign in to check it visually.

## Notes from the build

- **Tables** (`convex/schema.ts`):
  - `henryUnits`: the facts (`sightmapId, number, floor, floorPlan, beds, baths, sqft, facesI25, price, totalPrice, leaseTermMonths | null, availableOn (YYYY-MM-DD), specials | null`, spread from `henryUnitFactsValidator`) plus `status: "onMarket" | "offMarket"`, `firstSeenAt`, `lastSeenAt`, `listedAt | null` (when it came on the market after the baseline; null for baseline units), `missedChecks` (always 0 so far), `offMarketAt | null`. `status`, `missedChecks` and `offMarketAt` exist for ticket 04 so it needs no migration. Indexes: `by_sightmapId`, `by_status_and_price`, `by_firstSeenAt`.
  - `henryPricePoints`: `unitId, at, price, totalPrice, leaseTermMonths`; `by_unitId_and_at`. The first point is the price the unit was first seen at; later ones only when base rent changes.
  - `henryUnitEvents`: `unitId, kind, at, price`; `by_unitId_and_at`. Kinds so far: `trackingBegan` (baseline units) and `listed`. Ticket 04 adds `offMarket` / `relisted` to `henryUnitEventKindValidator`.
  - `henryChecks`: `at, outcome: "success" | "failure", reason | null, unitCount | null`; `by_at`, `by_outcome_and_at`. Kept 30 days, 5 pruned per check.
- **The baseline** is "no `henryUnits` row yet" (`trackingBeganAt()` = earliest `firstSeenAt`), not the check log, which is pruned. An empty first response fails instead of becoming the baseline.
- **Record check** (the seam): `internal.henry.checks.recordCheck({ now: number, result: { kind: "response", body: string } | { kind: "fetchFailed", reason: string } })` → `null`. Logic in `convex/model/henry/checks.ts` (`recordCheck`, `trackingBeganAt`, `latestCheck`). Units absent from a check are untouched for now: ticket 04 increments `missedChecks` there and relists at the `// Ticket 04` comment in `recordUnit`.
- **Fetch**: `internal.henry.checks.checkSightmap` (hourly cron "henry check sightmap" in `convex/crons.ts`). It slims the ~850 KB response to the parsed fields with `slimSightmapResponse` before calling the mutation, because Convex strings max out at 1 MB. Parsing and validation live in `parseSightmap` (`convex/model/henry/sightmap.ts`). Any unreadable unit fails the whole check with a reason like `Unit 999002: unknown floor plan nope`. `total_price` is an array; the first value is used. "15 Months" becomes `leaseTermMonths: 15`.
- **Page query**: `api.henry.ledger.getLedger({ now })` → `{ trackingBeganAt | null, lastCheckedAt | null (latest success), lastCheck: { at, outcome, reason, unitCount } | null, onMarketCount, newThisWeekCount, units: [...facts minus sightmapId, _id, newDays | null] }`. Units are on the market, cheapest first, `take(400)`. `newDays` is whole days since `listedAt`, while that's under 7. Validators are in `convex/model/henry/validators.ts` (`henryLedgerValidator`). Ticket 03 extends `henryLedgerUnitValidator` with the 3/7/14 changes; ticket 04 adds gone units and staleness (`lastCheck` is already there for the failing warning).
- **Pure helpers**: `src/lib/henry/units.ts` has `isI25Side` (the spec's fixed list), `bedLabel`, `formatMoney` and `moveInLabel(availableOn, today)`. Push rules (06) and change windows (03) belong next to them.
- **Page**: `src/app/henry/` (`layout.tsx`, `page.tsx`, `_components/ledger-page.tsx`), using `useMinuteClock` for `now`. The nav has its own "The Henry" group with one "Units" item (`src/lib/navigation/app-nav.ts`).
- **Tests**: `convex/henry/checks.test.ts` (convex-test, edge runtime). The fixture is `convex/henry/fixtures/sightmap-2026-11-08.json`: all 33 units, trimmed to the parsed fields. `payload(edit)` returns the fixture as a string with `data.units` edited; `withPrice(number, price)` is one such edit. The history and timeline assertions read `henryPricePoints` / `henryUnitEvents` through `t.run` until ticket 03's unit query exists; switch them to that query then.
- **Dev deployment**: the cron is live on dev (`fantastic-tapir`). The baseline of 33 units was recorded 2026-11-08 by the first cron run, and a manual `npx convex run henry/checks:checkSightmap` added a second success with no new price points.
