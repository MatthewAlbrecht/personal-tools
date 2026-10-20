# 03: TCGplayer product link and image

**What to build:** When I add a Printing, AI finds its TCGplayer product page. The URL is accepted only if it matches the tcgplayer.com/product/<id>/... pattern with a slug that agrees with card, set and rarity; otherwise I'm asked to paste it. The Card shows its TCGplayer image and a link to the product page.

**Blocked by:** 01 (Decks with Cards and Candidate Printings)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Lookup runs when a Printing is added, not on a schedule
- [ ] URLs that fail the pattern check are rejected and the Printing shows a paste field
- [ ] Pasted URLs go through the same pattern check
- [ ] Card image appears on the Deck page via next/image
- [ ] Without a product URL, the Printing falls back to a TCGplayer search link
