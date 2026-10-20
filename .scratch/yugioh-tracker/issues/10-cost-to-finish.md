# 10: Cost to finish

**What to build:** Each Deck leads with its estimated cost to finish (remaining Copies x Reference price) and the cheapest buy-it-now total available right now, with subtotals per Section and per Card. The Decks overview shows each Deck's cost to finish.

**Blocked by:** 09 (eBay Reference price and Deal grades)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Graded Listings excluded from both numbers
- [ ] Undecided Cards use their cheapest Candidate
- [ ] Cards without a Reference price are counted and called out rather than silently dropped
- [ ] Default 'by cost' order now uses remaining cost
- [ ] convex-test covers the estimate (Seam 1)
