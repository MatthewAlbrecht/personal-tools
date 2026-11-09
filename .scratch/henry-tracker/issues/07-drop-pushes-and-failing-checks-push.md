# 07: Drop pushes and the failing-checks push

**What to build:** When a starred unit's base rent drops, by any amount, every device with push on gets a push with the unit, the new price and how much it dropped. It follows the same quiet-hours hold and per-unit merge as new-unit pushes, and a held drop push is dropped at delivery if the unit is off the market, no longer starred, or no longer below the price before the drop. A relisting below its last known price is one push, not two. If no check has succeeded for 6 hours, one push says The Henry checks are failing, once per outage.

**Blocked by:** 06 (New-unit pushes)

**Status:** done

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (Push rules; Failing checks; stories 42, 44–48, 51)

- [x] Drop push decided when record check writes a lower price point for a starred unit
- [x] Merges with any held push for the same unit (latest price, total change since the pushed baseline)
- [x] Dropped at delivery if off the market, unstarred, or price back at/above the pre-drop price
- [x] Relisting below last price = one push
- [x] Failing-checks push after 6 hours without success, once per outage; resets after the next success
- [x] convex-test covers drop for starred vs not starred, any size, merge, each drop-at-delivery condition, relist-below-price, failing-checks once per outage

## Notes from the build

- **Drop decision** (`recordUnit`, `convex/model/henry/checks.ts`): after the patch, a lower price than the row's last price calls `pushDrop(ctx, unit, existing.price, now)` (`convex/model/henry/pushes.ts`), which checks `isStarred` (unit or plan) and calls `queueUnitPush(..., "dropped", now, priceBefore)`. Any amount; never on the baseline (insert branch) or a rise. A relisting below its last price calls both `pushNewUnit(..., "relisted")` and `pushDrop`, and the per-unit merge makes them one row, so one push. Unstarred relistings below their last price push only as relisted (no drop wording): drops are a starred-unit thing.
- **Schema** (widen only; dev pushed, existing rows valid): `henryPushes.unitId` is now `Id<"henryUnits"> | null` (null = the failing-checks push), new optional `priceBefore` (the price before the first drop the push carries; set on insert or on the first merge that brings one, then kept, so the text reports the total change), new index `by_unitId_and_createdAt`. `henryPushReasonValidator` gains `dropped` and `checksFailing`.
- **Delivery** (`claimDelivery`): picks the text through `unitMessage` or `checksFailingMessage` (each returns the text, url, tag and topic, or a skip note), then the shared devices / sending / deadline path. A unit push is skipped if off the market ("The unit went off the market."). A push whose reasons are only `dropped` is also skipped if the unit is no longer starred ("The unit is no longer starred.") or its price is at/above `priceBefore` ("The price is back at $2,656 or above."). With `listed`/`relisted` it goes as the new-unit push, with the drop in the body only while the price is still below `priceBefore` (it doesn't recheck the star then).
- **Text** (`unitPushText` in `src/lib/henry/pushes.ts` now takes `news: { kind: "listed" | "relisted", droppedFrom: number | null } | { kind: "dropped", droppedFrom: number }` instead of `relisted: boolean`):
  - drop alone: "Down $41 at The Henry: Apt 608" / "2 bed · 1,091 sq ft · $2,615/mo, was $2,656"
  - listed + drop: "New at The Henry: Apt 608" / "Down $41 · 2 bed · 1,091 sq ft · $2,615/mo"
  - relisted + drop: "Back at The Henry: Apt 608" / "Relisted, down $57 · 2 bed · 1,091 sq ft · $2,599/mo"
  - new and relisted without a drop are unchanged from 06.
- **Failing checks**: every failed check after tracking began goes through `logFailure` in `recordCheck`, which calls `pushChecksFailing(ctx, lastSuccessAt, now)` (`lastSuccessAt` = latest success, else `trackingBeganAt`). At 6 hours (`CHECKS_FAILING_AFTER_MS`) with no unit-less push created since `lastSuccessAt` (`by_unitId_and_createdAt`, `unitId = null`, `.first()`), it inserts one with reason `checksFailing`, held through quiet hours like the rest. The next success resets it, since the next outage's `lastSuccessAt` is later. At delivery it's skipped if a check has succeeded since ("The checks are working again."); otherwise the text is "The Henry checks are failing" / "No successful check since Sun 11:00 AM. Last error: HTTP 503" (the time in the device's zone; the error cut to 60 characters with "…"). URL `/henry`, tag and Topic `henry-checks`. `fetchSightmap` catches every fetch error and returns `fetchFailed`, so a throw still reaches `recordCheck`; only an action that dies outright (it has a 30 s abort) logs nothing, and the next hour's check catches up.
- **Import cycle**: `model/henry/pushes.ts` imports `latestCheck`/`trackingBeganAt` from `./checks`, which imports it back. Only functions cross, so it's safe (commented).
- **Tests**: `convex/henry/pushes.test.ts` adds "drop pushes" (direct star, plan star on an I-25 unit, unstarred, $1, a rise, two overnight drops → one 8am push with the total, listed then dropped → one push, listed/dropped/back up → plain new push, relisted below last price → one push and one row, and drop-at-delivery: unstarred, price back, off market, still starred through its plan) and "the failing-checks push" (once per outage at hour 6, reset after a success with a night outage held to 8am, skipped if recovered by 8am, nothing before tracking began). `src/lib/henry/pushes.test.ts` covers the texts.
- **Not seen in a browser**: there's no UI change. No real push was sent from dev.
