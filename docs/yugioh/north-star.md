# North star: Yu-Gi-Oh max-rarity tracker

Why `/yugioh` exists and what matters, so it can guide every ticket. Read it before building, speccing or cutting a feature; when a feature doesn't serve it, that's the reason to cut it, however good it looks.

This doc holds only the why. The what is in the spec (`docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md`), terms are in `src/app/yugioh/GLOSSARY.md`, and the how-it-looks is in `design-direction.md`.

## The mission

**Finish a max-rarity Deck for a fair price, without living on eBay.**

## Who it's for

**One collector: Matt.** He's building a Deck where every Card is a specific, prized Printing (Quarter Century Secret, Starlight). He knows the game and the rarities cold; what he lacks is time to hunt every Card across eBay and TCGplayer, and a trustworthy sense of what "a good price" is. He checks on his iPhone from the home-screen app, between other things, and sits down at the desktop to plan a Deck or dig into Listings.

Nobody else uses it. There is no onboarding, no sharing and no second account to design for.

## What makes it this app

1. **It watches so he doesn't have to.** Searches are packed, captured on a schedule and read by AI. He opens the app to decide, not to search.
2. **It knows what he'd actually buy.** A price only counts if it's for the right Printing, in English, raw, and at or above the Card's Lowest acceptable condition. Everything else is still shown, never hidden, but it doesn't move the numbers.
3. **Every number is honest about its evidence.** Reference prices come from real sales on their own marketplace, never blended; under 3 sales it says "not enough sales" instead of guessing. Unknown condition is flagged, not assumed.
4. **One big number tells him where he stands.** Cost to finish leads every Deck, and the buy-now total sits next to it.

## The test for a feature

**Does it help him buy the right Copy at a fair price sooner, or know where a Deck stands, with less time spent searching?** If it adds a number he can't trust, a reason to open the app that isn't a decision, or a chore to maintain, cut it.

## Guardrails

- **Calm, not compulsive.** Pushes only for what deserves action: a Great or Good Qualifying Listing on a Card he still needs, or a matched auction ending in 15 minutes. Deal pushes respect quiet hours (11pm-8am). No streaks, badges for visiting, or "you missed this" nags. Delight in proportion to rarity (`references/family-values.md`).
- **Never hide, always explain.** Filters narrow; nothing is auto-hidden. A Listing that doesn't count says why (graded, Korean, not a match, below condition).
- **His decision wins.** A match override beats the AI on every later capture. A Chosen Printing redirects deals and estimates at once.
- **Glossary words only.** Card, Printing, Copy, Listing, Reference price, Deal grade. If the UI needs a word the glossary doesn't have, add it there first.
- **Cheap and polite.** AI reads a title once. The automated browser runs at human pace on his own profile.
- **Out of scope stays out:** purchase history, item-page scraping, marketplace APIs, blended prices, other marketplaces, notes, import screens.

## Done looks like

The Deck's Copies owned reaches Copies needed, and he never once wondered whether a price he paid was fair.
