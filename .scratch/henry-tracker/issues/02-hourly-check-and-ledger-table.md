# 02: Hourly check and the Ledger table

**What to build:** Every hour the app reads The Henry's availability from SightMap and records each unit and its price. The first successful check is a silent baseline: those units are "tracked since" that day. Units that appear after it are *listed* (new). A new The Henry page, linked from the app nav, shows a summary line ("33 on the market · N new this week · checked X ago") and one Ledger row per unit on the market: unit number with "New · Nd" and "I-25 side" badges, floor plan · beds, sq ft, floor, price and move-in ("Now" or a date).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (Source; Check rules; Schema; I-25 side; The page; stories 1–4, 7, 10–12, 18–19, 22–24)
Real response for fixtures: `.scratch/henry-tracker/fixtures/sightmap-2026-11-08.json` (trim it to a small test fixture)
Design reference: the prototype at `src/app/prototypes/henry/` (Ledger variant)

- [ ] Hourly Convex cron → a thin action fetches `https://sightmap.com/app/api/v1/960p7z7lw7n/sightmaps/13397` (accepts gzip) and passes the raw payload to one internal record-check mutation (the test seam)
- [ ] Record check parses units (number, floor, floor plan name/beds/baths, sq ft, base rent, total with fees, lease term, available-on `YYYY-MM-DD`, specials) and records units and price points; a price point only when base rent changes
- [ ] First successful check = baseline: no "New", timeline would start "Tracking began"; later unseen units = listed, with first-seen time
- [ ] Each check is logged (success/failure, reason, unit count); invalid JSON / no `units` array = failed and changes nothing
- [ ] I-25 side from the fixed list in the spec (155; 249, 251, 253, 273, 275; odd 349–383, 449–483, 549–581, 649–681, 749–779)
- [ ] Auth-wrapped page query: summary counts, last successful check, listed units sorted by price with badges; reads bounded
- [ ] The Henry page in the app nav; Ledger table with shadcn Table; works at phone width (table scrolls in its box, no page sideways scroll) and in light and dark
- [ ] Empty state before the first check; a note while there's no history yet
- [ ] convex-test (Seam 1) covers baseline, a new listing after it, a price change making a price point, an unchanged price making none, a failed payload changing nothing, the I-25 badge
- [ ] Public-surface lockdown test still passes
- [ ] First real check observed on the dev deployment (left for the user if it can't run here)
