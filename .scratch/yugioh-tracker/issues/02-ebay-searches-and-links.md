# 02: eBay Searches and links

**What to build:** Each Deck shows its eBay Searches: Printings packed into groups of up to about 8 set codes, Printings needing the same Exclusions grouped together, Exclusions derived automatically from Overloaded rarities. Each Search has a Newly Listed link and a Sold link.

**Blocked by:** 01 (Decks with Cards and Candidate Printings)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] No Search exceeds 8 set codes
- [ ] Exclusions (e.g. -super, -ultra) only apply to Searches containing an Overloaded set code that needs them
- [ ] Newly Listed link sorts by newest; Sold link includes sold and completed filters
- [ ] Un-chosen Candidates drop out of Searches once a Chosen Printing is set
- [ ] Searches update when Cards or Printings change
- [ ] Tested through Convex views (Seam 1), with packing logic in the shared library module
