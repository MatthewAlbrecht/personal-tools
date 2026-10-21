# UX discovery: Yu-Gi-Oh max-rarity tracker (`/yugioh`)

Discovery for the 17 tickets in `.scratch/yugioh-tracker/issues/`. Run non-interactively on 2026-10-20 from the spec (`docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md`) and the glossary (`src/app/yugioh/GLOSSARY.md`). No user research exists beyond the spec, which is the user's own account. Anything not in the spec is marked **(assumption)**. `ux-validate` checks built work against this doc.

## 1. Problem brief

- **Problem:** finishing a max-rarity Deck means weeks of hand-searching eBay and TCGplayer, card by card, with no reliable sense of a fair price or of what's left to spend.
- **Affected user:** one collector (Matt), the only user.
- **Current alternatives:** eBay saved searches and manual searches, TCGplayer product pages, memory, maybe a spreadsheet **(assumption)**.
- **Why they fail:**
  - Overloaded set codes return unwanted rarities.
  - eBay's ~8-code limit means juggling many searches, each with its own Exclusions.
  - Titles hide rarity, condition, lot size, language and grading.
  - eBay and TCGplayer prices aren't comparable, and condition muddies both.
  - New Listings and ending auctions slip by.
  - There's no running cost to finish, per Deck or across Decks.
- **Scope:** new feature area in an existing app (personal-tools), reusing its auth, stack and Chrome extension.

## 2. Persona

### Matt, the max-rarity collector (primary, and only)

- **Context:** knows Yu-Gi-Oh, the rarities and the set codes well. Building one Deck now, likely a second later.
- **Devices:** mostly an iPhone, using the installed home-screen app with pushes, in short sessions between other things. Also the desktop, for planning a Deck, reviewing Searches and digging into Listings.
- **Goals:**
  - Every Card in the Printing he wants.
  - Never overpay.
  - Spend minutes a day on this, not hours.
- **Frustrations:** noisy searches, title parsing, missed auctions, not knowing the total.
- **Tech comfort:** high. He built the extension and runs scripts on his Mac. He tolerates setup but not daily chores.
- **Behaviours (assumption):**
  - Opens the app when a push arrives, or idly a few times a day.
  - Buys on eBay or TCGplayer himself, then updates Copies owned in the app.
  - Won't type a whole Deck; an agent seeds it.

## 3. Jobs to be done

### Primary job

**When** a Copy I still need comes up for sale, **I want to** know within minutes whether it's the right Printing at a good price, **so I can** buy it before someone else does and never overpay.

- **Functional:** spot a Qualifying Listing, judge its Per-copy price against the Reference price, then open it on the marketplace.
- **Emotional:**
  - Confident the deal is real: right Printing, English, raw, acceptable condition.
  - Calm that nothing is slipping by.
- **Social:** minor. A collector who paid fair prices for a deck he's proud of.
- **Importance 9 · satisfaction today 3 · opportunity 15.**

### Secondary jobs

| Job | Imp. | Sat. | Opp. |
|---|---|---|---|
| **When** I open a Deck, **I want to** see what it will cost to finish and what's left, **so I can** pace spending and decide what to chase next. | 8 | 2 | 14 |
| **When** I'm planning a Deck, **I want to** record each Card's Candidate Printings, Copies and condition once, **so I can** have the app search for exactly that without me remembering Exclusions. | 7 | 3 | 11 |
| **When** an auction for a Card I need is about to end, **I want to** see its current price against the Reference price, **so I can** decide to bid in time. | 7 | 2 | 12 |
| **When** I'm undecided between Printings, **I want to** compare their prices and supply, **so I can** choose the one I'll commit every Copy to. | 6 | 3 | 9 |

### Job map (primary job)

| Stage | Today | Opportunity (ticket) |
|---|---|---|
| Define | Remembers which Cards and Printings are still needed | Deck with Copies owned/needed, finished Cards dimmed (01) |
| Locate | Runs many eBay searches by hand, wading through wrong rarities | Packed Searches with Exclusions, captured on a schedule (02, 06, 15, 17) |
| Prepare | Reads titles for rarity, condition, lot size, language and grading | AI title reading and matching, flags (07) |
| Confirm | Guesses whether a price is good | Per-copy price, Reference price, Deal grade (08, 09, 12) |
| Execute | Buys on the marketplace | Push → Listing → "Open on eBay" (13, 14) |
| Monitor | Mental total, if any | Cost to finish, buy-now total, per-Section subtotals (10) |
| Resolve | Notices a wrong match only after clicking | Match override that sticks (07) |
| Conclude | Updates nothing | Bumps Copies owned; the Card dims and drops out of pushes (01) |

### Competing solutions

| Solution | Strength | Weakness | Switching cost |
|---|---|---|---|
| eBay saved searches + email alerts | Free, built in | Noisy, no Exclusion logic per code, no price judgement | Low |
| TCGplayer Market Price | Instant number | Its own blended figure, condition-blind on eBay | None |
| Spreadsheet (assumption) | Flexible | Manual, stale | Low |

**Key insight:** what's missing isn't more Listings, it's **trust**: knowing a Listing really is the Printing he wants, and that its price is good compared with real sales on the same marketplace.

## 4. Journeys

### Current state: finishing a Deck by hand

| Phase | Action and touchpoint | Feeling | Pain |
|---|---|---|---|
| Plan | Writes the list in notes or his head | Neutral | Overloaded codes and Exclusions to remember |
| Search | Runs 5-10 eBay searches and TCGplayer pages on his phone or desktop, several times a day | Frustrated | Wrong rarities, Korean copies, lots and slabs mixed in |
| Judge | Opens Listings, reads titles, checks sold Listings | Anxious | No baseline, so he can't tell a good deal |
| Miss | An auction ends or a cheap BIN sells while he's busy | Annoyed | Timing |
| Buy | Buys on the marketplace | Relieved, unsure | Was it fair? |
| Track | Updates notes, if at all | Uncertain | No total, no progress |

**Moments of truth:**

- **The first glance at a Listing:** is it even the right Printing?
- **The price judgement:** is this good?
- **The miss:** a deal or an auction ending he didn't see.

### Desired state

| Phase | Action and touchpoint | Target feeling | Design opportunity | Signal |
|---|---|---|---|---|
| Plan (desktop) | An agent seeds the Deck; Matt tweaks Candidates, Copies and condition in drawers | In control | Deck page, Card drawer (01, 05) | Deck seeded with no hand typing |
| Watch (no touchpoint) | The Mac's automated browser captures every eBay Search about 4 times a day (around 7 AM, 11 AM, 3 PM and 7 PM, sometimes one skipped), and every TCGplayer product page about twice a day | Unbothered | Automation (15-16, daily plan) | Newest eBay capture about 4 h old in the daytime, at most about 8 h on a day with a skipped slot |
| Alert (iPhone, lock screen) | Push: "Great deal · Ash Blossom QCSR · $42 vs $58 ref" | Alert, not alarmed | Deal and auction pushes (13, 14) | Pushes he opens; few false positives |
| Judge (iPhone, in app) | Tap the push → Listing drawer: Per-copy breakdown, Deal grade, flags → Open on eBay | Confident | Listing drawer, flags (09) | Seconds from tap to marketplace |
| Buy (marketplace) | Buys on eBay or TCGplayer | Satisfied | Out of scope | n/a |
| Update (iPhone) | Bumps Copies owned in the Card drawer; the Card dims, its cost leaves the total | Progress | Stepper and morph (01, 10) | Owned count rises |
| Review (either device) | Opens the Deck: cost to finish, buy-now total, Sections, new Listings since last visit | Oriented | Deck header, "new" (10, 11) | Cost to finish trends down |
| Correct (either device) | Marks a wrong match "Not a match"; it never comes back | Trusting | Match override (07) | Override rate falls over time |

**Failure paths that must be designed:**

- Capture stale: the Mac is asleep, or the extension secret is wrong. The Deck header shows "Last captured 9 h ago".
- AI unsure. The Listing shows an "Unsure" match until he decides.
- Thin data: "Not enough sales (2 of 3)" instead of a Reference price, and the Card is counted as "no price" in cost to finish.
- No TCGplayer link: a paste field on the Printing.
- Push not available: in a Safari tab, show the add-to-home-screen steps.

### Gap analysis

| Phase | Gap | Priority |
|---|---|---|
| Judge | Trustworthy Qualifying rule, Reference prices and Deal grade | High |
| Watch | Automated capture and packed Searches | High |
| Alert | Pushes with quiet hours and auction timing | High |
| Review | Cost to finish and "new since last visit" | High |
| Plan | Deck editing UI (seeded by an agent) | Medium |
| Correct | Sticky overrides | Medium |

## 5. Success metrics (light)

Single user, so there's no analytics SDK and no event pipeline. Every signal below is derivable from tables the spec already defines; a later ticket can surface them on `/yugioh/settings` if wanted **(assumption)**.

- **North star:** **Copies owned / Copies needed** per Deck reaches 100%, with cost to finish trending down week on week. Baseline 0%.
- **Health (guardrails):**

| Metric | From | Worry when |
|---|---|---|
| Capture freshness: age of newest Listing observation | Listing observations | > 6 h (the adaptive schedule's floor) |
| Unsure match share among new eBay Listings | Listings match status | > 15% for a week: tune the title reader |
| Override share: overrides ÷ AI-matched Listings | user override flag | rising, meaning the AI is wrong too often |
| Printings without a TCGplayer URL | Printings | any, for more than a day |
| Cards with "not enough sales" | Reference prices | > 25% of unfinished Cards: cost to finish isn't trustworthy |

- **Input signals:**

| Signal | Predicts | From |
|---|---|---|
| Deal pushes sent per week | Whether alerts are calm (aim: a handful, not dozens) | push send log (assumption: a sent-at field per Listing) |
| Lag from listedAt to firstSeen | Whether adaptive timing works | Listings |
| Days since last Deck visit | Whether the app still earns a visit | per-Deck last viewed |

- **Qualitative:** Matt notes in `docs/ideas/` anything he had to check by hand that the app should have told him.

**Response:**

- Freshness slips: check the LaunchAgent and the extension secret before anything else.
- Unsure or override share rises: add title-reader fixtures and tighten matching.
- Pushes feel noisy: raise the bar (Great only), never add more kinds.

## 6. Design principles (from this discovery)

1. **Decide in one screen.** The Listing drawer holds everything needed to act: Per-copy breakdown, Deal grade, Reference price, flags and the marketplace link.
2. **Evidence beside every number.** Show the sale count behind a Reference price, the age of a last-seen auction price, and the Copies in a lot.
3. **Show everything, count only what qualifies.** Non-Qualifying Listings stay visible, labelled with the reason.
4. **Phone first for watching, desktop for planning.** Both must work fully; their emphasis differs.
5. **Calm.** Pushes are for action. No badges for visiting.

## 7. Assumptions and risks

- **Assumption:** purchases happen off-app; Matt updates Copies owned by hand afterwards. Purchase history is out of scope.
- **Assumption:** a deal push opens the Listing in the app. An auction push opens the marketplace item directly, because time matters more than context.
- **Assumption:** the Listings view is per Deck (filtered to its Cards), since "new" is defined per Deck.
- **Risk:** marketplace layout changes break capture silently. Mitigation: Seam 2 fixtures, plus the freshness indicator in the Deck header.
- **Risk:** iOS drops push subscriptions after silent pushes. Mitigation: `docs/yugioh/references/ios-web-push.md`.
- **Risk:** TCGplayer slug matching is fuzzy. Mitigation: the paste fallback.

## 8. Next steps

Builders follow `docs/yugioh/design-direction.md`. Run `ux-validate` against this doc on every ticket with UI.
