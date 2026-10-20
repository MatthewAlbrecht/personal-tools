# 16: Pre-auction refresh visits

**What to build:** When a matched auction is due to end within the next 3 hours, the automated browser makes an extra visit about 20 minutes before it ends so the auction push has a fresh price.

**Blocked by:** 14 (Auction-ending pushes), 15 (Automated browser runs)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Visit plan includes timed extra visits
- [ ] Extra visits only for matched auctions on Cards still needed
- [ ] convex-test covers visit-plan output (Seam 1)
