# 12: TCGplayer capture and Reference price

**What to build:** When I open a Printing's TCGplayer product page, the extension reads its current Listings (seller, condition, price, shipping, quantity) and latest sales (with condition) without AI. Each Printing gets a TCGplayer Reference price (median of Qualifying sales in 60 days at or above the Card's condition, min 3) shown separately from eBay's, plus the cheapest current Qualifying TCGplayer Listing as the 'buy now' floor. TCGplayer Listings get Deal grades against the TCGplayer Reference, and cost to finish uses the lower of the two References.

**Blocked by:** 03 (TCGplayer product link and image), 09 (eBay Reference price and Deal grades)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Extension handles TCGplayer product pages
- [ ] Saved HTML fixtures of a TCGplayer product page produce the expected payloads (Seam 2)
- [ ] eBay and TCGplayer Reference prices never blended
- [ ] convex-test covers the TCGplayer Reference, floor and cost-to-finish choice (Seam 1)
