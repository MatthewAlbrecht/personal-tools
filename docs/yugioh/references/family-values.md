# Family Values (Benji Taylor, 2024)

https://benji.org/family-values: how the Family crypto wallet for iOS was designed to feel calm and native. Read the original for its motion demos; these notes summarize it in our words and say how it applies to the Yu-Gi-Oh tracker. Copied from music-and-friendship and adapted.

## Three principles

- **Simplicity: reveal gradually.** Show the essentials up front and bring in the rest when it becomes relevant. Family uses **trays**: sheets that rise over the current screen, each with a title and icon, varying in height so a change of step is visible. They hold short-lived actions (confirmations, warnings, options) without leaving the screen underneath, so the person keeps their place.
- **Fluidity: motion shows where you went.** Transitions carry direction: tabs slide the way you moved, and a button's label morphs (Continue → Confirm) instead of swapping. Elements that persist between screens stay put. No animation exists only for decoration. With the motion removed, the same flows lose their sense of place, which is the test for whether a transition is earning its keep.
- **Delight: in proportion to how often something is used.** The rarer a moment, the more delight it can carry (the article's "delight–impact curve"). Something seen every day gets subtle polish. A once-in-a-while moment, like finishing a backup, can get confetti. Delight goes in the quiet corners too: empty states, deleting, typing an amount.

Underneath all three: polish is thousands of small decisions, and speed, reliability and security are the floor rather than features.

## For this app (`/yugioh`)

- **Drawers are the trays.** The Card drawer, Listing drawer, add-Card form and Listings filters rise over the Deck page and keep its scroll position. Closing one puts you back where you were.
- **Morph in place.** Choosing a Printing collapses the other Candidates under it (height and opacity, ~200 ms); switching back expands them. A Listing's match status changes its badge in place, never by re-rendering the row somewhere else.
- **Persistent pieces stay put.** The Card image and name look the same in the row and at the top of its drawer. The cost-to-finish number in the Deck header never moves when the tab below changes.
- **Delight follows rarity.** Rows, badges and prices are seen every visit, so they get no motion beyond hover and press states. A Card reaching its last Copy gets a small check morph. Finishing a whole Deck, a once-in-months moment, earns the one celebratory touch (see `design-direction.md`, Motion).
- **A transition must explain movement.** Re-sorting, filtering and live price updates cut instantly. If removing an animation loses nothing, cut it.
- **Reduced motion:** every transition falls back to an opacity fade or nothing.
