# Yu-Gi-Oh! max-rarity deck tracker

Vocabulary follows the Yu-Gi-Oh glossary (see `GLOSSARY-MAP.md`).

## Problem Statement

I'm building a Yu-Gi-Oh! Deck in max rarity: every Card in a specific, prized Printing (Quarter Century Secret, Starlight and so on). Finishing it means hunting eBay and TCGplayer by hand, card by card, for weeks.

- **eBay searches are noisy.** Many set codes are Overloaded: the same code was printed in several rarities, so a search for the one I want also returns the ones I don't. eBay accepts only about 8 codes per search, so covering a deck means juggling many searches and remembering which exclusions (`-super`, `-ultra`) belong where.
- **Listing titles hide what matters.** Rarity, condition (NM, LP…), how many Copies are in the lot, the language (a Korean or German copy listed among English ones), and whether it's graded all have to be read out of free-text titles.
- **Prices vary wildly.** TCGplayer treats condition as first-class while eBay doesn't, so a single "price" is misleading. I can't easily tell whether a Listing is a good deal.
- **I miss things.** New Listings and auctions ending soon slip by because I'm not checking at the right times.
- **I don't know where I stand.** I have no running picture of what the Deck will cost to finish, or of how it's progressing next to any other Deck I start.

## Solution

A `/yugioh` section of personal-tools that tracks my Decks and watches the marketplaces for me.

- **Decks:** I list each Deck's Cards, the Printings I'd accept for each (Candidate Printings), how many Copies I need, how many I own, and the Lowest acceptable condition per Card.
- **Searches:** the app packs my Printings into eBay Searches with automatic Exclusions. It links each Search as Newly Listed and as Sold, and each Printing to its TCGplayer product page.
- **Capture:** my existing browser extension reads eBay search-results pages and TCGplayer product pages when I (or an automated browser) open them, and sends every Listing to the app. AI reads eBay titles for set code, rarity, condition, Copy count, language and grading. Each Listing is matched to my Printings.
- **Pricing and deals:** the app keeps a separate eBay and TCGplayer Reference price per Printing, built from real sales. It gives each Listing a Deal grade and estimates what the Deck costs to finish.
- **Alerts:** it installs to my phone's home screen and pushes me new good deals and matched auctions about to end.
- **Automation:** a scheduled script on my Mac opens all the Searches and product pages every few hours, then learns when sellers usually post and checks more often around those times.

## User Stories

### Decks and Cards

1. As a collector, I want to create a Deck with a name, so that I can track a max-rarity build.
2. As a collector, I want more than one Deck, so that I can work on a second build without losing the first.
3. As a collector, I want a Decks overview showing each Deck's progress (Copies owned / needed) and cost to finish, so that I can compare where each build stands.
4. As a collector, I want to add a Card to a Deck by typing its name, set code and rarity, so that I control exactly which Printing I'm after.
5. As a collector, I want to record which other rarities share an Overloaded set code when I add a Printing, so that Searches can exclude them.
6. As a collector, I want to add more than one Candidate Printing to a Card, so that I can keep my options open while I'm undecided.
7. As a collector, I want an "add another Printing" action on a Card, so that adding a Candidate is quick.
8. As a collector, I want to remove a Card or a Candidate Printing, so that the Deck reflects my current plan.
9. As a collector, I want to set how many Copies of a Card the Deck needs, so that progress and cost are right.
10. As a collector, I want to assign each Card to a Section (Main, Extra, Side), so that the Deck mirrors how it's played.
11. As a collector, I want to set how many Copies I own, so that the app knows what's left to buy.
12. As a collector, I want to set a Chosen Printing for a Card, so that all its Copies end up as the same Printing.
13. As a collector, I want the other Candidates to stay saved but collapsed once I choose, so that I can switch back.
14. As a collector, I want Listings for un-chosen Candidates to stop counting once I've chosen, so that deals and estimates follow my decision.
15. As a collector, I want to set a Lowest acceptable condition per Card, so that prices and deals reflect what I'd actually buy.
16. As a collector, I want ownership tracked per Deck, so that a Card used in two Decks is counted separately for each.
17. As a collector, I want Listings and prices shared across Decks, so that the same Printing isn't scraped or priced twice.
18. As a collector, I want the Deck page to lead with the estimated cost to finish, so that I see the big number first.
19. As a collector, I want Cards grouped by Section with a subtotal each, so that I can see where the money goes.
20. As a collector, I want unfinished Cards sorted by remaining cost and finished Cards dimmed at the bottom, so that what needs attention is on top.
21. As a collector, I want to switch to a custom order I set by dragging Cards within a Section, so that I can arrange the Deck my way.
22. As a collector, I want each Card to show its TCGplayer product image, so that I can recognize it at a glance.
23. As a collector, I want an AI agent to load my initial card list into the app, so that I don't type the whole Deck by hand.

### Searches and links

24. As a collector, I want my Printings packed automatically into eBay Searches of up to about 8 set codes, so that I cover the Deck with as few searches as possible.
25. As a collector, I want Overloaded set codes to get Exclusions automatically from their other rarities, so that Searches don't return rarities I don't want.
26. As a collector, I want Printings that need the same Exclusions grouped into the same Search, so that an exclusion only applies where it's needed.
27. As a collector, I want each Search as a Newly Listed link and a Sold link, so that I can check new supply and real sale prices in one click.
28. As a collector, I want a link to each Printing's TCGplayer product page, so that I can see its Listings and sales directly.
29. As a collector, I want the TCGplayer product page found automatically when I add a Printing, accepted only if the URL matches the expected product pattern for that card, set and rarity, so that links aren't wrong.
30. As a collector, I want to paste the TCGplayer product URL myself when automatic matching fails, so that every Printing still gets a link.

### Capturing Listings

31. As a collector, I want the extension to read any eBay search-results page I open, so that capture works for the app's Searches and my own.
32. As a collector, I want each eBay Listing stored with its item ID, title, price, shipping, buy-it-now / best offer / auction type, bid count, time left, date listed and seller location, so that I have the full picture.
33. As a collector, I want seeing the same Listing again to update it instead of duplicating it, so that history stays clean.
34. As a collector, I want sold Listings captured the same way, so that real sale prices feed the Reference price.
35. As a collector, I want the extension to read a Printing's TCGplayer product page (current Listings with seller, condition, price, shipping and quantity, plus latest sales with condition), so that TCGplayer is covered without AI.
36. As a collector, I want the extension's status dock to show what was captured on a page, so that I know it worked.
37. As a collector, I want AI to read each new or changed eBay title for set code, rarity, condition (including abbreviations like NM and LP), Copy count, language (from words like "Korean" and codes like `-KR001`) and grading company and grade, so that titles become structured data.
38. As a collector, I want a title read by AI only once, and again only if it changes, so that costs stay low.
39. As a collector, I want each Listing marked as a match to one of my Printings, not a match, or unsure, so that I can trust what's shown.
40. As a collector, I want to override a match, and have my override win on later captures of that Listing, so that the AI's mistakes don't come back.

### Prices and deals

41. As a collector, I want each Listing's Per-copy price (price + shipping + import fees, ÷ Copies in the lot), so that lots and singles compare fairly.
42. As a collector, I want foreign-currency Listings converted with a daily exchange rate, so that every price is in dollars.
43. As a collector, I want import fees estimated from a per-country rate table, with 15% for countries not in it, so that non-US Listings are comparable.
44. As a collector, I want to edit a country's import fee rate, so that I can correct it after a real purchase.
45. As a collector, I want an eBay Reference price per Printing (median Per-copy price of Qualifying sold Listings over the last 60 days), so that eBay deals are judged against real eBay sales.
46. As a collector, I want a TCGplayer Reference price per Printing (median of Qualifying TCGplayer latest sales over the last 60 days, at or above the Card's Lowest acceptable condition), so that TCGplayer deals are judged against real TCGplayer sales.
47. As a collector, I want the two Reference prices kept separate, so that condition differences between marketplaces don't blur them.
48. As a collector, I want "not enough sales" instead of a Reference price when there are fewer than 3 Qualifying sales, so that thin data doesn't mislead me.
49. As a collector, I want the cheapest current Qualifying TCGplayer Listing shown as the "buy now" floor, so that I know the lowest price available right now.
50. As a collector, I want each Listing given a Deal grade against its own marketplace's Reference price (Great ≤80%, Good ≤95%, Fair ≤110%, Poor above), so that I can spot good deals instantly.
51. As a collector, I want graded Listings flagged with company and grade and still given a Deal grade, so that a cheap graded copy stands out.
52. As a collector, I want graded Listings left out of the cost to finish, so that the estimate reflects raw copies I'd play with.
53. As a collector, I want running auctions to get no Deal grade, so that a price that will still change isn't treated as final.
54. As a collector, I want an ended auction to count as a sold Listing, so that it feeds the Reference price.
55. As a collector, I want only Qualifying Listings (matched, English, not graded, at or above the Card's condition or of unknown condition) to feed Reference prices, deals and estimates, so that the numbers reflect what I'd buy.
56. As a collector, I want Listings of unknown condition to count but be flagged, so that I double-check them.
57. As a collector, I want each unfinished Card's cost to finish as remaining Copies × the lower of its two Reference prices, so that I have a realistic estimate.
58. As a collector, I want the cheapest buy-it-now total available right now shown alongside the estimate, so that I know what finishing today would cost.
59. As a collector, I want price history kept, so that I can see trends over time.

### Browsing Listings

60. As a collector, I want the Listings view to show everything by default, with nothing hidden automatically, so that I never miss something the app misjudged.
61. As a collector, I want filters for marketplace, type (buy-it-now / auction / sold), language, condition, graded, match status, location and "new", so that I can narrow down quickly.
62. As a collector, I want my filters kept in the URL, so that I can bookmark a view.
63. As a collector, I want "new" to mean first seen since I last opened that Deck, so that I see exactly what changed.
64. As a collector, I want each Card to show how many new Listings it gets per week, so that I know how scarce it is.
65. As a collector, I want auctions ending soon easy to find, so that I can bid in time.
66. As a collector, I want all Listing data kept indefinitely, so that history and timing stay complete.

### Notifications

67. As a collector, I want to install the site to my phone's home screen, so that it feels like an app.
68. As a collector, I want a push notification for every new Great or Good Qualifying Listing on a Card I still need, so that I can act on deals fast.
69. As a collector, I want deal notifications held between 11pm and 8am, so that I'm not woken up.
70. As a collector, I want a push notification 15 minutes before a matched auction for a Card I still need ends, showing its last seen Per-copy price (with how old it is) against the Reference price and a link, so that I can decide whether to bid.
71. As a collector, I want auction notifications to come through at any hour, so that I never miss an ending.

### Automation

72. As a collector, I want a script on my Mac that drives Chrome, with the extension installed in its own profile, to open every Search's Newly Listed and Sold pages and every Printing's TCGplayer page, so that capture happens without me.
73. As a collector, I want it to run every 3 hours from macOS's scheduler, so that it works even when T3 Code is closed.
74. As a collector, I want the same script triggerable from a T3 Code scheduled task, so that I can run and watch it from there too.
75. As a collector, I want an extra visit about 20 minutes before a matched auction ends, whenever one is due within the next 3 hours, so that the auction notification has a fresh price.
76. As a collector, I want the schedule to check more often during the hours of the week when sellers usually post, once about 4 weeks of listing times are collected, so that I see new Listings sooner.

## Implementation Decisions

**Placement and stack**
- This is a new feature area at `/yugioh` in personal-tools, built on the existing stack (Next.js App Router, Convex, shadcn on Base UI, TanStack Form + Zod, sonner, next-themes) and the existing single-user session auth.

**Domain logic**
- The pure domain logic lives in one shared library module that Convex imports using relative imports. That module owns:
  - **Search packing:** at most ~8 set codes per Search, grouped by identical Exclusions.
  - **Exclusion terms:** derived from an Overloaded set code's other rarities.
  - **Link building:** eBay Newly Listed and Sold URLs (sold uses `LH_Sold=1&LH_Complete=1`, newly listed is sorted by newest) and TCGplayer product and search URLs.
  - **Language:** inferred from set-code region (`-EN`, `-KR`, `-DE`, …).
  - **Calculations:**
    - Per-copy price, including currency conversion and import fees
    - the Qualifying rule
    - Reference price as a median with a 3-sale minimum over 60 days
    - Deal-grade thresholds
    - cost to finish

**Data model (Convex)**
- Decks; Deck Cards, each with Section, copies needed and owned, Lowest acceptable condition, Chosen Printing, custom sort position, and Candidate Printings.
- Printings, shared across Decks, each with set code, rarity, Overloaded rarities and TCGplayer product URL and image.
- Listings, keyed by marketplace + marketplace item ID. Each has captured fields, AI-read fields, match status and a user override flag.
- Listing observations (price over time), sold records, per-country import fee rates, daily exchange rates, push subscriptions, and per-Deck "last viewed" times.
- Calendar-style values follow AGENTS.md rules. All reads are bounded and indexed.

**Ingest**
- The extension posts captured pages to API routes that check the existing extension bearer secret, following the RYM and Bandcamp pattern. The routes forward to internal Convex mutations.
- Ingest is idempotent on marketplace + item ID.
- New or changed eBay titles are queued for AI reading in a Convex action. TCGplayer data is already structured and skips AI.

**AI title reading**
- It uses TypeSafe, which is a new dependency; the user has approved it. It returns typed fields: set code, rarity, condition, copies, language, graded, grading company and grade.
- The AI call sits behind a single interface so tests can supply fixed results.
- Matching to Printings combines the AI-read set code and rarity with the Printing's set code and rarity. A user override always wins.

**TCGplayer product lookup**
- When a Printing is added, AI finds the TCGplayer product URL. It's accepted only if it matches the `tcgplayer.com/product/<id>/…` pattern with a slug that agrees with card, set and rarity; otherwise it's left for the user to paste.
- No daily tcgcsv feed is used.

**Extension**
- The existing RYM/Bandcamp Manifest V3 extension gains content scripts and host permissions for eBay search results and TCGplayer product pages. It reuses the scrape dock and its settings (origin and secret).
- Item pages and seller notes are not scraped.

**Notifications**
- A web app manifest and service worker make the site installable. Web Push uses VAPID keys added through `src/env.js` and Convex env.
- Notification triggers run in Convex: new Great or Good Qualifying Listing, with quiet hours from 11pm to 8am; and matched auction 15 minutes before it ends, at any hour.

**Automation**
- A local script drives Chrome with a dedicated profile that has the extension loaded. It's triggered by both a macOS LaunchAgent and a T3 Code scheduled task.
- It asks the app which pages to visit and when: every 3 hours, extra visits before auctions end, and an adaptive schedule from the hour-of-week distribution of listing times once about 4 weeks of data exist.

**Initial data**
- An AI agent seeds the first Deck from the user's list through internal Convex functions. There is no seed command or import UI.

**Data collection approach**
- Marketplace data is collected by scraping pages in the user's own browser, not through marketplace APIs. TCGplayer's API is closed to new developers, and eBay's sold-listing data needs approval. This is a candidate for an ADR.

## Testing Decisions

**What makes a good test**
- Tests exercise external behavior through the two agreed seams and never assert on internal helpers or schema shape.
- A failing test is written first for each behavior, following the repo's Vitest conventions. New tests use Vitest.

**Seam 1: Convex functions, via `convex-test` with the edge-runtime environment**
- Tests seed Decks, Cards, Printings and condition settings, ingest raw scraped Listings exactly as the extension sends them, and assert on what the Deck, Listings and Searches views return:
  - packed Searches and Exclusions
  - match status and override persistence
  - Qualifying Listings and Per-copy price, including currency and import fees
  - both Reference prices and the thin-data case
  - Deal grades, including graded Listings and running auctions
  - cost to finish and the buy-now floor
  - "new since last visit", weekly listing rate, and auctions ending soon
  - which notifications would fire, including quiet hours
- The AI title reader is replaced with a fixed fake at this seam.
- Prior art: the existing Convex tests such as the public-surface lockdown and launch tests.

**Seam 2: extension page readers**
- Saved HTML fixtures of real eBay search-results pages (active and sold) and TCGplayer product pages go in. The Listing payloads the extension would send come out.
- These tests catch marketplace layout changes.

**Manual only**
- Not automated: real push delivery, the scheduled Chrome runs, and TypeSafe's real accuracy. These are checked by hand during the build.

## Out of Scope

- Tracking what I paid, and a purchase history.
- Scraping eBay item pages or seller notes.
- Marketplace APIs: the eBay Browse or Marketplace Insights APIs, and the TCGplayer API.
- Blending eBay and TCGplayer into a single Reference price (may come later).
- Card prices outside eBay and TCGplayer, such as Cardmarket.
- Automatic hiding of any Listing.
- Card-level free-text notes.
- An import screen or seed command for decklists or `.ydk` files.

## Further Notes

- **Suggested build order** (each phase usable on its own):
  1. Decks, Printings and links
  2. eBay capture and AI reading
  3. Reference prices, deals and cost to finish
  4. Installable app and push
  5. Automated browser and adaptive timing
  6. TCGplayer Listings and sales capture

  Phase 6 can move earlier if the TCGplayer Reference is wanted sooner.
- **eBay limit:** an eBay search takes about 8 codes in `(A,B,C)` form; packing must respect that.
- **Scraping etiquette:** keep the automated browser's cadence modest. It runs on a real profile at human-like intervals.
- **Import duties:** US de minimis changes mean import fees apply to most foreign Listings. The per-country table should be researched once when it's first built.
