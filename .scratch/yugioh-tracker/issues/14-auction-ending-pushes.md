# 14: Auction-ending pushes

**What to build:** 15 minutes before a matched auction for a Card I still need ends, I get a push showing its last seen Per-copy price, how old that price is, the Reference price, and a link, at any hour.

**Blocked by:** 11 (Listings filters and what's new), 13 (Installable app and deal pushes)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Fires once per auction
- [ ] Ignores quiet hours
- [ ] Only for matched auctions on Cards still needed
- [ ] convex-test covers trigger timing and selection (Seam 1)
