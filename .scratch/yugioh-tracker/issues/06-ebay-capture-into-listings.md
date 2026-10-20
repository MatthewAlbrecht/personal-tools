# 06: eBay capture into Listings

**What to build:** When I open any eBay search-results page (active or sold), the extension reads every result and sends it to the app. Each Listing is stored by marketplace item ID with title, price, shipping, type (buy-it-now / best offer / auction), bids, time left, date listed, seller location and sold status; seeing it again updates it. The extension's dock shows how many were captured, and a basic Listings view shows them.

**Blocked by:** 01 (Decks with Cards and Candidate Printings)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Added to the existing RYM/Bandcamp extension (new content script, host permission, service-worker handler)
- [ ] Ingest API route checks the existing extension bearer secret and forwards to internal Convex mutations
- [ ] Ingest is idempotent on marketplace + item ID; price changes are recorded as observations
- [ ] Saved HTML fixtures of eBay active and sold search pages produce the expected payloads (Seam 2)
- [ ] convex-test covers ingest and dedupe (Seam 1)
- [ ] Listings view lists captured Listings newest first
