# 05: Seed my first Deck

**What to build:** An agent takes my card list (names, set codes, rarities, Overloaded info, copies, Sections) and loads it into the app through internal Convex functions, so my first Deck is ready without typing.

**Blocked by:** 01 (Decks with Cards and Candidate Printings)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Internal (not public) Convex functions exist for loading a Deck
- [ ] Agent asks me for the list and confirms anything ambiguous before writing
- [ ] Loaded Deck matches the list: Cards, Candidates, copies, Sections
- [ ] Running it against prod is confirmed with me first
