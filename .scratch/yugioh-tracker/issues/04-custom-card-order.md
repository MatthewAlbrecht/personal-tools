# 04: Custom card order

**What to build:** On a Deck I can toggle between 'by cost' and 'custom' ordering, and in custom mode drag Cards to reorder them within a Section.

**Blocked by:** 01 (Decks with Cards and Candidate Printings)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Toggle persists per Deck
- [ ] Drag reorders within a Section only
- [ ] Order survives reload
- [ ] Default 'by cost' order puts unfinished Cards first (by remaining cost once prices exist; by name until then)
