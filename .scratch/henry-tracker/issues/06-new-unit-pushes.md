# 06: New-unit pushes

**What to build:** When a unit lists or relists, every device with push on gets a push saying the unit, its layout and size, its price — unless it faces I-25, is a 1-bed of 800 sq ft or less, or is a studio on floors 2–6. A unit that's starred (itself or via its floor plan) always pushes. Pushes found in quiet hours are held until 8am; events for one unit that pile up while held merge into a single push with its latest state, and a held push is dropped if the unit has gone off the market by delivery. Tapping the push opens The Henry with that unit's drawer open. The push toggle for this device is shown on The Henry page.

**Blocked by:** 01 (Installed app opens the website), 04 (Off the market, relisted, and failing checks), 05 (Stars)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (Push rules; stories 37–41, 43–50). Note the spec's flagged assumption: starring overrides the rules (story 43) — not yet confirmed by the user.

- [ ] Push rule as in the spec (prototype snippet), plus the star override; baseline units never push
- [ ] Push decided inside record check for listed and relisted units; sent to all subscribed devices via the existing Web Push sending
- [ ] Quiet hours reused from Yu-Gi-Oh; held pushes merge per unit; dropped at delivery if the unit is off the market
- [ ] Push text: unit, layout, sq ft, price (copywriting rules); tag per unit; URL opens `/henry` with the unit's drawer
- [ ] Shared push toggle on The Henry page
- [ ] Yu-Gi-Oh push behaviour unchanged (its tests pass)
- [ ] convex-test covers each rule, the star override, baseline silence, relisting, quiet-hours hold, merging, drop-on-delivery
- [ ] A real push received on the phone (left for the user)
