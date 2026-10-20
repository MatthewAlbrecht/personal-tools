# 08: Per-copy price

**What to build:** Every Listing shows a Per-copy price: price plus shipping plus import fees, converted to dollars with a daily exchange rate, divided by the number of Copies in the Listing. Import fees come from a per-country rate table (10% when a country isn't listed) that I can edit.

**Blocked by:** 06 (eBay capture into Listings)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Daily exchange-rate refresh
- [ ] Per-country import fee table researched and seeded once; editable in the app
- [ ] US Listings have no import fee
- [ ] Copies in the lot come from AI reading (defaults to 1 when unknown)
- [ ] convex-test covers conversion, fees and lot division (Seam 1)
