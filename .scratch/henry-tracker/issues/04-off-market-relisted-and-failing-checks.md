# 04: Off the market, relisted, and failing checks

**What to build:** A unit missing from two successful checks in a row goes off the market and shows in a "Gone this week" list with its last price struck through (its drawer still opens). A unit that comes back is *relisted* with its history kept and a "Relisted" timeline entry; "Off the market" also appears in the timeline. A response that is empty, or under half the size of what's currently listed, counts as a failed check and changes nothing. The summary line counts units gone this week, and after 3 hours without a successful check it says checks are failing.

**Blocked by:** 02 (Hourly check and the Ledger table), 03 (Price changes and the unit drawer — for the timeline and drawer)

**Status:** done

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (Check rules; stories 5–6, 8, 11, 20–21, 31)

- [x] One missed successful check keeps a unit listed; two in a row mark it off the market with a gone-at time
- [x] A unit seen again after going off the market is relisted (not new-from-scratch), history kept
- [x] Empty or < half-size `units` (after the baseline) = failed check; nothing changes, failure logged with a reason
- [x] Failed checks don't count as misses
- [x] "Gone this week" list (last 7 days), last price struck through, opens the drawer
- [x] Timeline shows "Off the market" and "Relisted"
- [x] Summary shows gone this week; header warns when the last successful check is over 3 hours old
- [x] convex-test covers one miss, two misses, relisting, empty and short responses, failed checks not counting as misses

## Notes from the build

- **Representation** (`henryUnits`, no migration): on the market = `status: "onMarket"`, `offMarketAt: null`. Off the market = `status: "offMarket"`, `offMarketAt` = the check that took it off. `missedChecks` counts successful checks in a row it was missing from (reset to 0 whenever it's seen). Relisted = back to `onMarket` with `offMarketAt: null`; there is no separate "relisted" status, only the `relisted` event. New index `by_status_and_offMarketAt` (dev has it).
- **Events**: `henryUnitEventKindValidator` now has `offMarket` (at the unit's last price) and `relisted` (at the price it came back at). If a relisting also changes the price, the price point and the event share a timestamp and the timeline lists the price change above the event. Drawer labels: "Off the market at $X", "Relisted at $X".
- **`listedAt` on relisting**: set to the relisting time, so "New · Nd" and `newThisWeekCount` count from the relisting (a relisted unit is New for 7 days). `firstSeenAt` and all price points are kept, so `sinceStart` still measures from the very first price. The drawer's label for that number is now `sinceLabel()`: "Since listing" (listed, never relisted), "Since first listed" (listed, later relisted) or "Since tracking began".
- **Where record check decides**: `recordUnit` in `convex/model/henry/checks.ts`. No row → listed (or `trackingBegan` on the baseline). Row with `status === "offMarket"` → relisted (`const relisted`, with a comment). **Ticket 06 hooks its new-unit push there**, for both the insert branch (listed) and the `relisted` branch. Misses are handled after all units are recorded, by `recordMiss` for every unit that was on the market before the check and isn't in it. The second miss sets `offMarket` (ticket 07's "held push dropped if gone" can read `status`).
- **Failed checks**: after the baseline, `recordCheck` reads the on-market units (`take(400)`) before touching anything. `shortResponseReason` fails the check with `"No units in the response"` (empty) or `"Only N units, under half of the M on the market"` (`N * 2 < M`, so 16 of 33 fails and 17 passes). The earlier reasons are unchanged: `"Not JSON"`, `"No units array"`, `"Unit X: …"`, `"No units in the first check"`, and fetch failures (`"HTTP 503"`, …). A failed check only writes its `henryChecks` row, so it never counts as a miss and never resets one.
- **Staleness**: `getLedger` returns `checksFailing: boolean`, true when tracking has begun and the latest successful check is over 3 hours before `now` (or none is left after pruning). `lastCheckedAt` is still the latest success, and `lastCheck` has the latest failure's reason. The header then swaps "checked N ago" for "checks failing · last success N ago" in `text-destructive`. Ticket 07's 6-hour push needs its own check in the mutation/cron; this flag is computed from the query's `now`.
- **Gone list query shape**: `getLedger` adds `goneThisWeekCount` and `goneThisWeek: { _id, number, floorPlan, beds, sqft, price (last price), offMarketAt }[]` (`henryGoneUnitValidator`), from `by_status_and_offMarketAt` with `status = "offMarket"`, `offMarketAt >= now - 7 days`, newest first, `take(100)`. The page renders it below the table as "Gone this week" (only when non-empty), with the price struck through. Rows and the unit link open `?unit=N`.
- **Drawer for a gone unit**: `terms()` starts with "Off the market Nov 12" instead of availability, the large price is muted and struck through ("Last price" for screen readers), the 3/7/14 trio is hidden and so is the New badge. The 14-day chart still draws the last price up to today.
- **Tests**: `convex/henry/checks.test.ts` adds `without(...numbers)` and the blocks "off the market", "relisting", "short responses" and "checks failing": one miss, two misses, a miss reset, the 7-day gone window, relisting with history, New from the relisting, a second off-market, empty and short responses (16 vs 17 of 33), and failed checks between misses.
- **Seen in a browser** (dev, 33 units, none gone): `/henry` at 1280 and 430 shows "33 on the market · 0 new this week · 0 gone this week · checked 18 min ago", no errors, no sideways scroll, and the drawer opens as before. The gone list, the failing warning and a gone unit's drawer have only been checked in tests.
