# 03: Price changes and the unit drawer

**What to build:** The Ledger shows each unit's 3d, 7d and 14d price change (drops with a down arrow in the good-deal color, rises muted with an up arrow, "–" for none; a window longer than the unit's listing or tracking measures from its first price). Every numeric column sorts both ways. Tapping a unit opens its drawer (right panel on desktop, bottom sheet on phone): large price, availability · lease term · total with fees, the 3/7/14 changes and change since listing/tracking, a 14-day price step chart, a timeline (tracking began / listed, each change before → after, with dates), a facts grid (floor plan, layout, size, floor, faces I-25 or not), and a link to The Henry's site.

**Blocked by:** 02 (Hourly check and the Ledger table)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (The page; stories 13–15, 25–30, 32)

- [ ] Page query returns 3/7/14 changes per unit, computed from price points at "now"
- [ ] Unit details query: history, timeline entries, facts; bounded reads
- [ ] Change cells, sorting by sq ft, floor, price, 3d, 7d, 14d (both directions), default price ascending
- [ ] Drawer with the contents above, shadcn Drawer in the Yu-Gi-Oh drawer style; the URL can open a unit's drawer (e.g. `?unit=608`) for push taps later
- [ ] 14-day chart (shadcn chart or a small step line)
- [ ] convex-test covers the 3/7/14 changes (incl. windows longer than the listing) and the timeline order
- [ ] Phone width and dark mode look right
