# 07: Drop pushes and the failing-checks push

**What to build:** When a starred unit's base rent drops, by any amount, every device with push on gets a push with the unit, the new price and how much it dropped. It follows the same quiet-hours hold and per-unit merge as new-unit pushes, and a held drop push is dropped at delivery if the unit is off the market, no longer starred, or no longer below the price before the drop. A relisting below its last known price is one push, not two. If no check has succeeded for 6 hours, one push says The Henry checks are failing, once per outage.

**Blocked by:** 06 (New-unit pushes)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (Push rules; Failing checks; stories 42, 44–48, 51)

- [ ] Drop push decided when record check writes a lower price point for a starred unit
- [ ] Merges with any held push for the same unit (latest price, total change since the pushed baseline)
- [ ] Dropped at delivery if off the market, unstarred, or price back at/above the pre-drop price
- [ ] Relisting below last price = one push
- [ ] Failing-checks push after 6 hours without success, once per outage; resets after the next success
- [ ] convex-test covers drop for starred vs not starred, any size, merge, each drop-at-delivery condition, relist-below-price, failing-checks once per outage
