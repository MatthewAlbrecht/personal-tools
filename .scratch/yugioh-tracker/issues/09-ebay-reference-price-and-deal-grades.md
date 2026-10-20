# 09: eBay Reference price and Deal grades

**What to build:** Each Printing shows an eBay Reference price: the median Per-copy price of Qualifying sold Listings in the last 60 days, or 'not enough sales' under 3. Each eBay Listing gets a Deal grade against it (Great <=80%, Good <=95%, Fair <=110%, Poor above). Graded Listings are flagged with company and grade and still graded; running auctions get no grade; ended auctions count as sales.

**Blocked by:** 07 (AI title reading and matching), 08 (Per-copy price)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Qualifying = matched, English, not graded, at or above the Card's Lowest acceptable condition or unknown condition
- [ ] Unknown-condition Listings count but are flagged
- [ ] Thin data shows 'not enough sales'
- [ ] Deal grade badges on Listings
- [ ] convex-test covers the Qualifying rule, median, thresholds, graded and auction cases (Seam 1)
