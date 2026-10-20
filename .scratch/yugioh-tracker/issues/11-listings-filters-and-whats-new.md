# 11: Listings filters and what's new

**What to build:** The Listings view shows everything by default with filters for marketplace, type (buy-it-now / auction / sold), language, condition, graded, match status, location and 'new', kept in the URL. 'New' means first seen since I last opened that Deck. Each Card shows its new Listings per week, and auctions ending soon are easy to find.

**Blocked by:** 07 (AI title reading and matching)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Nothing hidden by default
- [ ] Filters round-trip through the URL
- [ ] Per-Deck last-viewed time updates on visit
- [ ] Weekly new-listing rate per Card
- [ ] Auctions ending soon view or filter
- [ ] convex-test covers 'new' and the weekly rate (Seam 1)
