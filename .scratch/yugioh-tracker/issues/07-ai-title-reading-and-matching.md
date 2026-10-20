# 07: AI title reading and matching

**What to build:** Each new or changed eBay title is read by TypeSafe for set code, rarity, condition (incl. NM/LP-style abbreviations), number of Copies, language (words like 'Korean' and codes like -KR001) and grading company and grade. Each Listing is then marked a match to one of my Printings, not a match, or unsure. I can override the match, and my override wins on later captures.

**Blocked by:** 06 (eBay capture into Listings)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] TypeSafe added as a dependency (approved)
- [ ] AI read runs once per new or changed title, in a Convex action
- [ ] AI call sits behind one interface; tests use a fixed fake
- [ ] Match / not a match / unsure shown on each Listing
- [ ] Manual override persists across re-captures
- [ ] convex-test covers matching and override persistence (Seam 1)
