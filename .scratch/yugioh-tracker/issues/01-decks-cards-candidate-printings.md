# 01: Decks with Cards and Candidate Printings

**What to build:** I can create Decks, see each Deck's progress on a Decks overview, and on a Deck page add a Card by typing its name, set code, rarity and any Overloaded rarities. Each Card has a Section, copies needed, copies owned and a Lowest acceptable condition. I can add another Candidate Printing to a Card, set a Chosen Printing (other Candidates stay saved but collapse), and remove Cards or Candidates. Printings are shared across Decks; ownership is per Deck.

**Blocked by:** None (can start immediately)

**Status:** done

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Decks overview lists every Deck with Copies owned / needed
- [x] Add-card form (TanStack Form + Zod) takes name, set code, rarity, Overloaded rarities, Section, copies needed
- [x] Owned count, Lowest acceptable condition and Chosen Printing are editable on the Deck page
- [x] Choosing a Printing collapses the other Candidates; switching back works
- [x] Cards grouped by Section; finished Cards dimmed at the bottom
- [x] The same Printing used in two Decks is one Printing with separate ownership
- [x] Convex functions have args and returns validators, bounded indexed reads, auth-wrapped
- [x] convex-test covers adding, choosing, owning and removing (Seam 1)
- [x] Looks right in light and dark mode

## Notes from the build

**Data model** (`convex/schema.ts`, end of file)
- `yugiohDecks { name }`.
- `yugiohPrintings { cardName, setCode, rarity, overloadedRarities[] }`, index `by_setCode_and_rarity`. Shared across Decks; set code + rarity is unique (enforced in `findOrCreatePrinting`). Adding a set code + rarity already saved under a different Card name throws (`"… is already saved as <name>"`); names compare case- and space-insensitively. Overloaded rarities learned later are merged in. Ticket 03 adds the TCGplayer URL/image fields here.
- `yugiohDeckCards { deckId, cardName, section, copiesNeeded, copiesOwned, lowestAcceptableCondition, chosenPrintingId | null }`, index `by_deckId`. Ownership and condition are per Deck. No sort position yet: ticket 04 adds it (and the By cost / Custom toggle).
- `yugiohCandidatePrintings { deckId, deckCardId, printingId }`, indexes `by_deckCardId_and_printingId`, `by_deckId`, `by_printingId` (use the last to go from a matched Listing's Printing to the Cards that want it). A Card always keeps at least one Candidate.
- Removing a Card deletes its Candidates but never Printings (they keep Listings and price history). There's no deleteDeck or renameDeck yet.

**Convex functions**
- Public, thin: `convex/yugioh/decks.ts` → `api.yugioh.decks.{listDecks, getDeck, createDeck, addCard, updateCard, addCandidatePrinting, choosePrinting, removeCandidatePrinting, removeCard}`. Each calls `requireAuth(ctx)` (the repo's no-op pattern).
- Logic: `convex/model/yugioh/decks.ts` (`addCard`, `findOrCreatePrinting`, `updateCard`, `readDeck`, …). Ticket 05's internal seed functions should call `addCard(ctx, deckId, input)` / `addCandidatePrinting`. `addCard` also takes optional `copiesOwned` and `lowestAcceptableCondition` for that.
- Validators: `convex/model/yugioh/validators.ts` (`yugiohSectionValidator`, `yugiohConditionValidator`), with a compile-time check that they match the domain library.
- `getDeck` returns `sections: [{ section, cards }]` in Main/Extra/Side order with empty Sections dropped. Within a Section, unfinished Cards come first, then finished ones, each sorted by name (`groupCardsBySection(cards, compare)` takes a comparator: ticket 10 passes remaining cost, ticket 04 passes position). Candidates come Chosen first.
- Bounds: `MAX_DECKS` 50, `MAX_CARDS_PER_DECK` 150, `MAX_CANDIDATES_PER_CARD` 10.

**Domain library**: `src/lib/yugioh/deck.ts` (relative imports only) holds Sections, conditions, the rarity list and abbreviations (§6), `normalizeSetCode`/`normalizeRarity` (unknown rarities are title-cased), `suggestRarities`, `deckProgress`, `groupCardsBySection`. Put later pure logic (search packing, links, pricing) beside it in `src/lib/yugioh/`.

**Decisions (assumptions)**
- Copies needed is 1-3 (game limit). Copies owned is 0..needed; lowering needed lowers owned with it.
- Default Lowest acceptable condition is Near Mint.
- A Card with a single, unchosen Candidate shows that Printing on its row; "Undecided · N Printings" only appears with 2 or more Candidates.

**UI patterns for later tickets**
- `src/app/yugioh/_components/yugioh-drawer.tsx`: `YugiohDrawer` (bottom sheet on mobile, right panel `max-w-md` at `md:`). Use it for every /yugioh drawer.
- Card drawer opens via `?card=<deckCardId>`. Rows are `next/link`s with `replace`, and closing uses `router.replace` (`deck-page.tsx`). Copy this for `?listing=`.
- Forms: TanStack Form with `validators: { onChange, onSubmit }` and Zod schemas in `_utils/schemas.ts`. Errors show once a field is touched. Single-field "save on change" forms are in `card-drawer.tsx` (`CopiesStepper`, `ConditionField`).
- Optimistic `updateCard` lives in `_utils/optimistic.ts`.
- `CardArt` (`card-art.tsx`) is the placeholder image slot at 59:86. Ticket 03 swaps in `next/image` there.
- `DeckProgress`, `LoadError`, the `errorMessage(error, fallback)` helper (`_utils/errors.ts`), and types in `_utils/types.ts` (derived from the Convex return types).
- There are no Deck tabs yet: only the Cards route exists. Ticket 02 should add `decks/[deckId]/layout.tsx` with the Cards · Listings · Searches tabs.
- Not done: the 150 ms cross-fade to the Check icon when owned reaches needed (§8). The swap is instant. The hero cost line arrives with ticket 10.

**shadcn / Base UI gotchas**
- Added with the CLI from `https://ui.shadcn.com/r/styles/base-vega/<name>.json`: field, progress, empty, button-group, radio-group, collapsible, spinner. These are Base UI versions; `components.json` still says Radix/new-york.
- With this repo's `~` alias, the CLI writes `import { cn } from "cn"` and offers to install an npm package called `cn`. Fix the import to `~/lib/utils`, don't install `cn`, and decline the overwrite of Radix `label`/`separator`.
- The generated `field.tsx` has one Biome `==` error. It's left as generated.
- The Base UI single Combobox clears free text when it closes. `RarityCombobox` (`printing-fields.tsx`) keeps the typed text as its own item. Use `autoHighlight` so Enter picks a match instead of submitting the form.

**Theme**: `ThemeProvider` (`src/providers/theme-provider.tsx`) is mounted in the root layout with `defaultTheme="light"`, because the app shell (header and sidebar) still hardcodes light colours and looks broken in dark. /yugioh screens were checked in both themes (`localStorage.theme = "dark"`). Switch the provider to "system" once the shell uses tokens.

**Tests**
- `convex/yugioh/decks.test.ts` (Seam 1) and `src/lib/yugioh/deck.test.ts`. Both are in `vitest.config.ts` `include`.
- convex-test files in subdirectories must glob root-relative: `import.meta.glob("/convex/**/*.ts")`.

**Dev data**: driving the UI created three "Agent test Deck" Decks in the dev deployment. There's no delete function yet, so remove them from the dashboard if they're in the way.
