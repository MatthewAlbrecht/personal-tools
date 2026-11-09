# 03: Price changes and the unit drawer

**What to build:** The Ledger shows each unit's 3d, 7d and 14d price change (drops with a down arrow in the good-deal color, rises muted with an up arrow, "–" for none; a window longer than the unit's listing or tracking measures from its first price). Every numeric column sorts both ways. Tapping a unit opens its drawer (right panel on desktop, bottom sheet on phone): large price, availability · lease term · total with fees, the 3/7/14 changes and change since listing/tracking, a 14-day price step chart, a timeline (tracking began / listed, each change before → after, with dates), a facts grid (floor plan, layout, size, floor, faces I-25 or not), and a link to The Henry's site.

**Blocked by:** 02 (Hourly check and the Ledger table)

**Status:** done

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (The page; stories 13–15, 25–30, 32)

- [x] Page query returns 3/7/14 changes per unit, computed from price points at "now"
- [x] Unit details query: history, timeline entries, facts; bounded reads
- [x] Change cells, sorting by sq ft, floor, price, 3d, 7d, 14d (both directions), default price ascending
- [x] Drawer with the contents above, shadcn Drawer in the Yu-Gi-Oh drawer style; the URL can open a unit's drawer (e.g. `?unit=608`) for push taps later
- [x] 14-day chart (shadcn chart or a small step line)
- [x] convex-test covers the 3/7/14 changes (incl. windows longer than the listing) and the timeline order
- [x] Phone width and dark mode look right

## Notes from the build

- **Change rule**: `src/lib/henry/changes.ts` (pure, relative imports only; `changes.test.ts`). `priceChange(points, price, now, days)` = `price` minus the price in force at `now - days`, or minus the first point's price when that's later; 0 with no history. `priceChanges(points, price, now)` → `{ d3, d7, d14 }`. Also `CHANGE_WINDOWS`, `LONGEST_CHANGE_WINDOW` (14 days, ms) and the `PriceAt` / `PriceChanges` types.
- **Ledger**: `api.henry.ledger.getLedger({ now })` units now carry `changes: { d3, d7, d14 }` (`henryPriceChangesValidator`). Per unit, `readPriceChanges` (`convex/model/henry/units.ts`) reads the price point in force 14 days back plus every point since (`take(400)`).
- **Unit details query**: `api.henry.units.getUnit({ number: string, now: number })` → `HenryUnitDetails | null` (`henryUnitDetailsValidator`). The shape is a Ledger unit (facts, `_id`, `newDays`, `changes`) plus `status`, `listedAt`, `firstSeenAt`, `offMarketAt`, `sinceStart` (price minus its very first price point), `history` (price points, oldest first, the latest 500) and `timeline` (newest first). It's looked up by number through the new `henryUnits.by_number` index, newest row first. Logic: `readUnitDetails` in `convex/model/henry/units.ts`, which also holds `ledgerUnit` (the shared row mapper) and `newDays`.
- **Timeline entries** (`henryTimelineEntryValidator`): `{ kind: <henryUnitEventKindValidator>, at, price }` for every `henryUnitEvents` row (latest 100), plus `{ kind: "priceChange", at, from, to }` for each price point after the one before it. When two entries share a timestamp, the price change lists above the event. **Ticket 04**: add `offMarket` / `relisted` to `henryUnitEventKindValidator`. They flow through the query unchanged. The drawer's `EVENT_LABELS` record (`unit-drawer.tsx`) is typed on the kinds, so TypeScript asks for their labels (`(price) => string`).
- **URL**: `/henry?unit=<number>` opens the drawer (`UNIT_PARAM` in `ledger-page.tsx`). A row click, or the unit-number link in it, uses `router.replace` without scrolling. Closing removes the param, and other params are kept. `page.tsx` wraps the page in Suspense for `useSearchParams`. An unknown number shows a "No apt N" empty state. Off-market units (ticket 04) open the same way, because `getUnit` doesn't filter by status.
- **Drawer**: `UnitDrawer` in `src/app/henry/_components/unit-drawer.tsx`. Like the Yu-Gi-Oh drawer, it's a right panel at `md:` and up and a 90dvh bottom sheet below that. It keeps the last unit rendered while it closes. **Star button (ticket 05)**: put it at the end of the title row in `UnitDetailsView` (marked with a comment). The new-unit push fact (ticket 06) goes in the `dl` facts grid there. Off-market text (ticket 04) goes in `terms()`, and the trio should be hidden when the unit is gone.
- **Other pieces**: `PriceChange` / `PriceChangeTrio` (`price-change.tsx`): a drop is `text-deal-good` with a down arrow, a rise is muted with an up arrow, no change is "–", and screen readers get "Down", "Up" or "No change". `PriceStepChart` (`price-step-chart.tsx`): a dependency-free SVG step line whose axis starts at the first price point when that's inside the 14 days. `UnitBadges` (`unit-badges.tsx`) is shared by the row and the drawer. Sorting is in `src/lib/henry/sort.ts` (`sortUnits`, `nextSort`, `DEFAULT_SORT` = price ascending, ties go to the cheaper unit; `sort.test.ts`).
- **Tests**: `convex/henry/checks.test.ts` now asserts history and the timeline through `getUnit`, so no test reads tables through `t.run`. `NEW_UNIT` / `withNewUnit(price)` are top-level helpers. The "price changes" block builds a 12-day history and covers 3/7/14 changes (including windows longer than tracking or the listing), changes moving with `now`, the drawer fields, timeline order and an unknown unit.
- **Seen in a browser** (dev deployment, 33 baseline units, all "–"): the Ledger and drawer at 1280px and 430px, light and dark. There was no page-level sideways scroll at 430. `?unit=608` opens the drawer, Escape clears the param, `?unit=999` shows the empty state, and Sq ft sorts both ways. No unit on dev has a price change yet, so the drop color and a stepped chart line have only been checked in tests.
- **Motion**: only vaul's built-in drawer slide, the same as Yu-Gi-Oh. The chart and the change cells don't animate, because they're numbers being read.
