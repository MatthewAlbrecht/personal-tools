# 01: Decks with Cards and Candidate Printings

**What to build:** I can create Decks, see each Deck's progress on a Decks overview, and on a Deck page add a Card by typing its name, set code, rarity and any Overloaded rarities. Each Card has a Section, copies needed, copies owned and a Lowest acceptable condition. I can add another Candidate Printing to a Card, set a Chosen Printing (other Candidates stay saved but collapse), and remove Cards or Candidates. Printings are shared across Decks; ownership is per Deck.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Decks overview lists every Deck with Copies owned / needed
- [ ] Add-card form (TanStack Form + Zod) takes name, set code, rarity, Overloaded rarities, Section, copies needed
- [ ] Owned count, Lowest acceptable condition and Chosen Printing are editable on the Deck page
- [ ] Choosing a Printing collapses the other Candidates; switching back works
- [ ] Cards grouped by Section; finished Cards dimmed at the bottom
- [ ] The same Printing used in two Decks is one Printing with separate ownership
- [ ] Convex functions have args and returns validators, bounded indexed reads, auth-wrapped
- [ ] convex-test covers adding, choosing, owning and removing (Seam 1)
- [ ] Looks right in light and dark mode
