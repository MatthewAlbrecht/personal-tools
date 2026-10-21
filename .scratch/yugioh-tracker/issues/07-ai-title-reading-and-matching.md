# 07: AI title reading and matching

**What to build:** Each new or changed eBay title is read by TypeSafe for set code, rarity, condition (incl. NM/LP-style abbreviations), number of Copies, language (words like 'Korean' and codes like -KR001) and grading company and grade. Each Listing is then marked a match to one of my Printings, not a match, or unsure. I can override the match, and my override wins on later captures.

**Blocked by:** 06 (eBay capture into Listings)

**Status:** done

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] TypeSafe added as a dependency (approved)
- [x] AI read runs once per new or changed title, in a Convex action
- [x] AI call sits behind one interface; tests use a fixed fake
- [x] Match / not a match / unsure shown on each Listing
- [x] Manual override persists across re-captures
- [x] convex-test covers matching and override persistence (Seam 1)

## Notes from the build

**Shape: deterministic first, AI for judgment calls**
- Code reads everything a title states exactly (`src/lib/yugioh/title-reading.ts`, relative imports only):
  - set codes: `findSetCodes`, covering `RA01-EN008`, `LOB-005`, `SDK-E001`, `5DS1-EN001` and `SGX1-ENA01`;
  - the language from the region suffix: `languageOfSetCode`, so `-KR` → korean and `-G` → german;
  - the card a code names in any language: `setCodeKey("RA01-KR008")` → `"RA01-008"`, plus `setCodeVariants`;
  - a Graded Listing's company and grade, by regex.
- TypeSafe judges the rest in one `systemOne` call (`convex/model/yugioh/titleReader.ts` → `judgeTitle(title, { setCodes, rarities })`):
  - which set code, only when the title has several;
  - rarity, chosen from the known rarities plus every rarity my Printings use under those codes. A pick below 0.5 probability counts as "not stated";
  - condition (NM/LP/MP/HP/Damaged/not stated), Copies (1-10), language, a graded Noul and the grading company.
- `readTitle(title, judgments)` combines the two:
  - a lone set code in the title beats the AI's pick;
  - the code's language suffix beats the AI's language;
  - a grade in the title only counts when the AI says the Listing is graded ("PSA 10 ready" doesn't count).
- `matchListing(read, printings)`:
  - The card number must agree, in any language: a `-KR` copy of my EN Printing **is a match** and flagged KR. That's on purpose, because the glossary's Qualifying rule needs matched non-English Listings.
  - Same rarity → match.
  - A rarity recorded as Overloaded → not a match.
  - Any other rarity → unsure (could be a misread).
  - No rarity read → match only when the code has one Printing and no Overloaded rarities.
  - No set code in the title → unsure.
- `MatchStatus`, `TitleRead`, `TitleJudgments`, `LANGUAGES`, `LANGUAGE_CODES` and `READ_CONDITIONS` live in the same lib. `titleFlags` and `gradingLabel` are in `listing-format.ts`.

**Data model**: `yugiohListings` gains these fields. All are optional, because pre-07 rows lack them:
- `titleReadStatus` (`reading | read | failed`);
- `titleRead` (`TitleRead | null`);
- `setCodeKey` (`string | null`);
- `matchStatus` (`match | notMatch | unsure`);
- `matchedPrintingId`;
- `matchOverridden`.

It also gains indexes `by_setCodeKey` and `by_matchedPrintingId`. A missing `setCodeKey` field means the Listing was captured before 07. `null` means the title has no single set code.

**Flow**
- Ingest (`ingestEbayListings`) calls `queueTitleRead` on insert and whenever the title changes. That sets `reading`, files the Listing under its lone set code, and schedules `internal.yugioh.titleReading.readTitle`.
- The action runs `getTitleToRead`, then `judgeTitle`, then `saveTitleRead`.
  - A read for an outdated title is dropped.
  - If the AI throws, the Listing is `failed` with `titleRead: null`, and its set code alone decides the match.
  - An override is never touched.
- `findOrCreatePrinting` calls `rematchSetCode` when a Printing is added or learns an Overloaded rarity. That re-matches the Listings under that card from their stored reads, without the AI.
- The override is `api.yugioh.listings.setListingMatch({ listingId, printingId | null })`. Null means "Not a match". It sets `matchOverridden`, which wins over every later read and rematch. Overrides are global, because Listings are shared across Decks, and there's no "undo override".
- `api.yugioh.listings.listListings({ deckId })` is now scoped to the Deck. It returns:
  - Listings under the Deck's Printings' set-code keys (matched or not);
  - Listings matched to its Printings;
  - up to 50 Listings with no single set code (`MAX_LISTINGS_WITHOUT_SET_CODE`).

  Each item now carries `titleRead` and `match: { status: match|notMatch|unsure|reading, printing, overridden }`. `getListing` returns the same view plus observations. The view mapping is `listingView` in `convex/model/yugioh/listings.ts`.
- **Backfill:** `npx convex run yugioh/titleReading:queueUnreadTitles '{}'` queues reads for pre-07 Listings. Run it until it returns `{ queued: 0 }`. It has been run on dev. **Prod is not run**: run it after deploying, if prod has Listings from 06.
- The TypeSafe client moved to `convex/model/yugioh/typesafe.ts`, shared with `tcgplayerPicker.ts`. `TYPESAFE_API_KEY` is still unset in dev, so on dev every read fails over to set-code-only matching.

**UI**
- `listings-page.tsx`: rows open the Listing drawer through `?listing=`, the same pattern as `?card=`.
  - Mobile line 2: the match. It shows "Card · SETCODE ABBR" (only the Card name truncates), an "Unsure" outline badge, "Not a match" with the row at `opacity-60`, or "Reading title…".
  - Line 3: title flags (`TitleFlagBadges`): `PSA 10`, `Condition?` with a dashed border, `KR`, `×3 copies`.
  - Desktop: a "Card / Printing" column, and the whole row links through a stretched link. The eBay button sits above it.
- `listing-drawer.tsx`: price and type; the title; "What the title says" as a `dl`; the Match form; and the "Open on eBay" footer.
  - The Match form is TanStack Form plus `listingMatchSchema`, with a Select of the Deck's Printings plus "Not a match". It notes "Your choice. Kept on future captures."
  - Ticket 08 adds the price breakdown to this drawer.
- The old Radix `Badge` renders a `div`, so lines that hold badges are `div`s. Badge icons are sized with `[&>svg]:size-3` on the className.

**Tests**: `convex/yugioh/matching.test.ts` (Seam 1, 16 tests). It fakes `titleReader` and `tcgplayerSearch` with `vi.mock`, and covers:
- reading once, and again only on a title change;
- the options the AI is given, and the KR suffix;
- AI failure, Overloaded and unsure cases;
- Deck filtering, and Printings added later;
- an override persisting across re-captures and new Printings;
- the backfill.

Also `src/lib/yugioh/title-reading.test.ts` and `titleFlags` in `listing-format.test.ts`. The `listings(t)` helper in `listings.test.ts` now creates a Deck on first use.

**Left for later / open review notes**
- A Listing whose action dies outright (not an AI error) stays `reading`. Nothing sweeps it, and a failed read isn't retried until the title changes. Worth a sweep with ticket 15's automation.
- 250 Listings in one capture schedule 250 TypeSafe calls at once, with no backoff on rate limits.
- `readDeckListings` runs a few index queries per Printing. That's fine for real Decks but unbounded in total for a maxed 1,500-Candidate Deck.
- Lots with several set codes have no `setCodeKey`, so they show in every Deck and never get re-matched.
- The "Below condition" flag waits for ticket 09's Qualifying rule. Flag explanations use `title`, which isn't reachable on touch.
- TypeSafe's real accuracy isn't checked (no key in dev). With a key, check a sample of real titles, especially QCSR wording and lots.

**Dev data**: added test Listings 707000000001-004 to dev. Two have simulated reads; 003 was overridden to "Not a match". The 17 Listings from 06 were backfilled.

