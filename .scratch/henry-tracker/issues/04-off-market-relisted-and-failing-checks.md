# 04: Off the market, relisted, and failing checks

**What to build:** A unit missing from two successful checks in a row goes off the market and shows in a "Gone this week" list with its last price struck through (its drawer still opens). A unit that comes back is *relisted* with its history kept and a "Relisted" timeline entry; "Off the market" also appears in the timeline. A response that is empty, or under half the size of what's currently listed, counts as a failed check and changes nothing. The summary line counts units gone this week, and after 3 hours without a successful check it says checks are failing.

**Blocked by:** 02 (Hourly check and the Ledger table), 03 (Price changes and the unit drawer — for the timeline and drawer)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (Check rules; stories 5–6, 8, 11, 20–21, 31)

- [ ] One missed successful check keeps a unit listed; two in a row mark it off the market with a gone-at time
- [ ] A unit seen again after going off the market is relisted (not new-from-scratch), history kept
- [ ] Empty or < half-size `units` (after the baseline) = failed check; nothing changes, failure logged with a reason
- [ ] Failed checks don't count as misses
- [ ] "Gone this week" list (last 7 days), last price struck through, opens the drawer
- [ ] Timeline shows "Off the market" and "Relisted"
- [ ] Summary shows gone this week; header warns when the last successful check is over 3 hours old
- [ ] convex-test covers one miss, two misses, relisting, empty and short responses, failed checks not counting as misses
