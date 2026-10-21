# Design direction: `/yugioh`

What every `/yugioh` screen looks like and how it behaves. Builders follow this; where it disagrees with `AGENTS.md`, `AGENTS.md` wins and this doc gets fixed. Why: `north-star.md`. Who and what for: `docs/ux-discovery/yugioh-tracker.md`. Words: `src/app/yugioh/GLOSSARY.md`. Decisions not in the spec are marked **(assumption)**.

## 1. Direction

- **Design read:** a single-user price-watching tool for a collector. Checked on an iPhone (installed app) in short bursts; planned on desktop. Built inside the existing personal-tools shadcn system.
- **Dials:** Creativity = Safe · Density = Balanced, leaning Packed on Listings · Variance = Uniform · Motion = Static-to-Balanced (Family Values).
- **Theme statement:** *calm, exact binder*. A collector's binder page: quiet neutral chrome, the card art supplies the colour, numbers are precise and aligned. The only colour the app adds is meaning: Deal grades.
- **Not:** foil gradients, holo shimmer on every card, rarity rainbows, gamer neon, red/green stock tickers, dashboards of charts.

## 2. Foundations

### Tokens

- Use only the shadcn semantic tokens in `src/styles/globals.css`: `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border`, `ring`, `destructive`, `primary`. No hex values and no Tailwind palette colours (`text-green-600`) in `/yugioh`.
- **New tokens (added once, by ticket 09):** Deal grade colours, in `:root` and `.dark` plus `@theme inline` so `bg-deal-great`, `text-deal-good` and so on exist. Hue never carries meaning alone (see §6).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--deal-great` | `oklch(0.52 0.14 155)` | `oklch(0.76 0.15 155)` | Great fill and text |
| `--deal-great-foreground` | `oklch(0.99 0 0)` | `oklch(0.18 0.03 155)` | text on a Great fill |
| `--deal-good` | `oklch(0.50 0.10 215)` | `oklch(0.76 0.10 215)` | Good text, tinted fill at /12 |

  Fair and Poor use existing tokens (`text-foreground` and `text-muted-foreground`). Check every pair for ≥ 4.5:1 text contrast in both themes before merging.
- **Theme:** every screen must look right in light and dark. `next-themes` isn't mounted in `src/app/layout.tsx` yet (gap, §12). Until it is, test dark by adding `class="dark"` to `<html>` in devtools.
- **Radius:** the existing `--radius` scale. Card images use `rounded-[3px]` (real card corners), everything else the defaults.

### Typography

- **Families:** the app's own. Source Sans 3 (`font-sans`) for everything. Fraunces (`font-display`) only for the Deck name and the cost-to-finish figure on the Deck page and the Decks overview.
- **Numbers:** every price, count and percentage uses `tabular-nums`. In the Listings table they're left-aligned like the rest of the row (Matt's call), so prices line up on their dollar sign.
- **Set codes:** `font-mono text-[0.8125rem] tracking-tight` (e.g. `RA01-EN008`).

| Role | Class | Where |
|---|---|---|
| Hero figure | `font-display text-4xl md:text-5xl font-semibold tabular-nums` | Cost to finish on the Deck page |
| Page title | `font-display text-2xl md:text-3xl font-semibold` | Deck name, "Decks" |
| Section heading | `text-sm font-semibold uppercase tracking-wide text-muted-foreground` | Main / Extra / Side, drawer groups |
| Row title | `text-[0.9375rem] font-medium` | Card name, Listing price |
| Body | `text-sm` | Everything else |
| Meta | `text-xs text-muted-foreground` | Set code line, "seen 2 h ago", locations |

- Inputs are ≥ 16px on mobile (`text-base md:text-sm`) so iOS doesn't zoom.

### Money and time

- Format money with `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`:
  - totals and subtotals in whole dollars: `$1,240`
  - Listing and Reference prices with cents: `$42.15`
- Original currency appears only in the Listing drawer's breakdown (`£31.00 → $39.37`).
- Dates and times use `date-fns`:
  - relative for freshness: `formatDistanceToNowStrict` → "2h ago"
  - countdowns for auctions: "1h 12m", "14m"
- **Percent of Reference:** `78% of ref`, rounded to a whole number.

### Density and touch

- Mobile rows are at least 56px tall, with tap targets ≥ 44px.
- Page padding is `px-4` on mobile and `md:px-6`.
- Content widths:
  - Deck page: `max-w-5xl`
  - Listings: `max-w-6xl` (more columns)
  - Settings: `max-w-2xl`
- The installed app runs edge to edge: respect `env(safe-area-inset-*)` on sticky bars and drawer footers.

## 3. Information architecture

| Route | Screen | Ticket |
|---|---|---|
| `/yugioh` | Decks overview | 01, 10 |
| `/yugioh/decks/[deckId]` | Deck: Cards by Section (default tab) | 01, 03, 04, 10 |
| `/yugioh/decks/[deckId]/listings` | Deck: Listings for this Deck's Cards, filters in the URL | 06, 07, 09, 11 |
| `/yugioh/decks/[deckId]/searches` | Deck: eBay Searches and TCGplayer links | 02, 03 |
| `/yugioh/settings` | Notifications, import fee rates, exchange rate status | 08, 13 |

- **Layout:** `src/app/yugioh/layout.tsx` holds metadata, service-worker registration (13) and the shared container. Add "Yu-Gi-Oh" to the "more" group in `src/lib/navigation/app-nav.ts` with `matchPrefixes: ["/yugioh"]`.
- **Deck tabs:** Cards · Listings · Searches. Use the existing `Tabs` list styled as navigation, one trigger per route, each rendered as a `next/link`; the active value comes from the pathname. Sticky under the site header (`sticky top-14 z-10 bg-background/95 backdrop-blur`).
- **Drawers are state, not routes:**
  - `?card=<deckCardId>` opens the Card drawer.
  - `?listing=<listingId>` opens the Listing drawer.
  - Both deep-link from pushes and survive reload.
  - Closing a drawer removes the param with `router.replace`, so Back doesn't reopen it.
- **Push targets (assumption):**
  - A deal push opens `/yugioh/decks/[deckId]/listings?listing=<id>`.
  - An auction push opens the eBay item URL directly, since time matters more than context.
  - When a Card is in several Decks, use the most recently viewed Deck.
- **Manifest (13):** `start_url: "/yugioh"`, `scope: "/"`, `display: "standalone"`. Also `theme_color` and `<meta name="theme-color">` for both colour schemes, matching `--background`. **Built in 13:** light only (`#ffffff`), because the root `ThemeProvider` defaults to light; add the dark entry (`#0a0a0a`) when it switches to "system". See `references/ios-web-push.md` §6 for the middleware allowlist.

## 4. Components

Use what's in `src/components/ui/`. Add missing primitives with `pnpm dlx shadcn@latest add <name>` in the ticket that first needs them; never hand-roll them.

| Need | Component | Status |
|---|---|---|
| Deck record on the overview | `Card` | exists |
| Create Deck, add Card, Card details, Listing details, filters on mobile | `Drawer` (vaul): bottom on mobile, `direction="right"` at `md:` and up | exists |
| Remove Card or Candidate | `AlertDialog` | exists |
| Form fields | `Field`, `FieldLabel`, `FieldError`, `FieldDescription` with TanStack Form + Zod | **add `field`** |
| Text, set code, URL paste | `Input`, `InputGroup` (prefix `$` / suffix `%`) | exists |
| Section, Lowest acceptable condition, single filters | `Select` | exists |
| Rarity (with suggestions), Overloaded rarities (multi), location filter | `Combobox` (Base UI) | exists |
| By cost / Custom; Newly listed / Sold; filter chips on desktop | `ToggleGroup` | **add `toggle-group`** |
| Copies owned/needed stepper | `ButtonGroup` with two icon `Button`s and a value | **add `button-group`** |
| Deck progress | `Progress` | **add `progress`** |
| Collapsed un-chosen Candidates | `Collapsible` | **add `collapsible`** |
| Choose a Printing | `RadioGroup` | **add `radio-group`** |
| Push on/off | `Switch` | **add `switch`** |
| Listings on desktop, import-fee rates | `Table` | **add `table`** |
| Grades, flags, rarity, "new" | `Badge` | exists |
| Explanations (thin data, unknown condition, ref math) | `Tooltip` on desktop, `Popover` on touch | exist |
| Empty states | `Empty` | **add `empty`** |
| Loading | `Skeleton` | exists |
| Inline busy (lookups, saving) | `Spinner` | **add `spinner`** |
| Overflow actions on a row | `DropdownMenu` | exists |
| Feedback | `toast` from `sonner` | exists |
| Icons | `lucide-react` | exists |

- **Base UI vs Radix (gap):** `AGENTS.md` says shadcn on Base UI, but most existing primitives (`button`, `select`, `tabs`, `dialog`, …) are Radix and `components.json` is `new-york`. Don't migrate primitives inside a `/yugioh` ticket. Use what exists, and add new ones with the CLI as configured. A Base UI migration is a separate task.
- **Drag to reorder (04):** no drag-and-drop dependency is approved. Stop and ask before adding one (e.g. `@dnd-kit/react`). The fallback that needs no dependency is pointer events on a grip handle, as in `public/launch-dnd.mjs`, with move up/down in each row's `DropdownMenu` for keyboard use.

## 5. Screens

### 5.1 Decks overview `/yugioh`

- **Header:** "Decks" (page title), a "New Deck" `Button` on the right (opens a Drawer with one name field), and a settings icon `Button` linking to `/yugioh/settings`.
- **List:** one `Card` per Deck, linking to the Deck.
  - Line 1: Deck name (`font-display text-xl`), then "N new" `Badge variant="secondary"` if anything is new since the last visit.
  - Line 2: cost to finish (`text-2xl tabular-nums`), then "· $X buy now" in muted text.
  - Line 3: `Progress` for Copies owned / needed, with "23 / 40 Copies" right-aligned.
  - Footer meta, only when relevant: "3 Cards without a price".
- **Mobile:** one column. **Desktop:** `md:grid-cols-2`.
- **Before prices exist (01-09):** show progress only. Leave out the cost line entirely, no "$0".

### 5.2 Deck: Cards `/yugioh/decks/[deckId]`

**Header** (not sticky):

1. Back link "Decks" (`text-sm text-muted-foreground`), then the Deck name.
2. **Cost to finish**, the hero figure, labelled "to finish" below it.
3. Next to it on desktop, below it on mobile: "**$X** buy now" (cheapest buy-it-now total), and "23 / 40 Copies" with a `Progress`.
4. Callout row, only when true, as muted text with an icon, never alarming colour:
   - "3 Cards have no price yet" (opens the filter, or scrolls to them)
   - "Last captured 9h ago" (shown when > 6h)

**Toolbar:** "Add Card" `Button` (opens the add-Card Drawer) and a `ToggleGroup` with By cost / Custom (persisted per Deck, 04).

**Sections:** Main, Extra, Side, in that order, each with a heading row "MAIN · 12 Cards · $640" (subtotal right-aligned). An empty Section is hidden.

**Card row**, the most-seen element. Keep it quiet:

```
[img 40×58] Ash Blossom & Joyous Spring           $116
            RA01-EN008 · QCSR          1 / 3      2 left
            ● Great $42   ·  4 new this week
```

- **Image:** TCGplayer image, `aspect-[59/86]`, 40px wide on mobile and 48px at `md:`, `rounded-[3px] ring-1 ring-border`. Without an image, a `bg-muted` tile of the same size with the set code's prefix in mono.
- **Title:** Card name, one line, truncated.
- **Meta:**
  - the Chosen Printing's set code (mono) and rarity abbreviation
  - "Undecided · 2 Printings" when nothing is chosen
  - Copies owned / needed
- **Right column:** remaining cost (remaining Copies × the lower Reference price, whole dollars), or "No price" in muted text.
- **Third line**, only when there's something to say:
  - the best current Qualifying deal's grade badge and Per-copy price
  - weekly new-Listing rate (11)
- **Finished Card** (owned ≥ needed): `opacity-60`, a `Check` icon in place of the remaining cost, moved to the bottom of its Section in By cost order.
- **Tap or click:** opens the Card drawer (`?card=`). In Custom order (04), a grip handle at the left edge appears and the row stays tappable.
- **Desktop** keeps the same row but widens it: Printing, owned/needed, Reference prices (eBay | TCGplayer) and remaining cost become aligned columns, using CSS grid on the row, not a table.

**Card drawer** (bottom sheet on mobile at ~90% height, right panel `w-[28rem]` on desktop). Order of content:

1. Image (96px wide, 120 on desktop), Card name, Section.
2. **Copies:** owned and needed steppers. Changes save on tap (each is a TanStack form with a one-field Zod schema, submitted on change). Toast only on error.
3. **Lowest acceptable condition:** `Select` (Near Mint, Lightly Played, Moderately Played, Heavily Played).
4. **Printings:** a `RadioGroup` of Candidate Printings. Each item shows:
   - set code, rarity name (full)
   - eBay ref and TCGplayer ref, or "Not enough sales (2 of 3)"
   - buy-now floor
   - TCGplayer link, or the paste field (03)

   Once one is chosen, the others collapse into a `Collapsible` "2 other Printings". "Add another Printing" is a ghost `Button` that reveals an inline form in place.
5. **Listings for this Card:** the top 5 Qualifying Listings by Deal grade, each a compact Listing row, then "All Listings for this Card →" linking to Listings filtered to it.
6. **Footer:** "Remove Card" as a ghost destructive `Button`, confirmed with an `AlertDialog`.

**Add-Card drawer** (01):

- **Fields:** Card name, set code, rarity (`Combobox` with known rarities, free text allowed), Overloaded rarities (`Combobox` multiple, with the hint "Other rarities printed under this set code"), Section, Copies needed (default 1). Copies owned defaults to 0.
- **Submit:** "Add Card". The drawer stays open with the form cleared, and a toast "Added Ash Blossom", so several Cards can go in a row.

### 5.3 Deck: Listings `/yugioh/decks/[deckId]/listings`

- **Default:** every Listing for the Deck's Printings, newest first. Nothing is hidden (11); non-Qualifying Listings are labelled.
- **Quick filters,** always visible as a horizontal row:
  - `ToggleGroup`: All · New · Ending soon · Sold
  - a "Filters" `Button` with an active-count badge
  - Ending soon sorts by end time ascending.
- **Full filters:** in a Drawer on mobile and a `Popover` on desktop.
  - Fields: marketplace, type (buy-it-now / auction / sold), language, condition, graded, match status, location, Card.
  - All live in `searchParams` (11). Applying a filter is a URL change; a form submit isn't needed beyond each field's change.
  - Active filters show as removable `Badge`s under the quick row, plus "Clear".
- **Mobile row:**

```
$42.15 /copy   ● Great 78% of ref          eBay · Buy it now
Ash Blossom · RA01-EN008 QCSR                       US · 3h ago
"Ash Blossom & Joyous Spring RA01-EN008 Quarter Century NM…"   [Unknown condition] [KR]
```

  - Line 1: Per-copy price (row title weight), grade, then marketplace and type right-aligned. An auction shows "Auction · 1h 12m · 4 bids" and no grade.
  - Line 2: matched Card and Printing, then location and freshness on the right.
  - Line 3: the original title, one line, truncated, in `text-xs text-muted-foreground`, then flags.
  - Not a match: the whole row is `opacity-60`, labelled "Not a match".
  - Unsure: an "Unsure" outline badge with `CircleHelp`.
- **Shown at all:** only Listings matched to a Printing the Deck still needs (a Card missing Copies; its Chosen Printing once it has one). Unsure, not-a-match and still-being-read Listings, and Listings for done Cards, aren't shown; Rejected Listings show only under the "Marked wrong" toggle.
- **Desktop (lg and up):** a fixed-layout `Table`. Columns: Card (28×40 art, name, "SETCODE · rarity") · Per-copy · Grade (or, under Marked wrong, the reason) · Condition (acronym, then "Below minimum", "PSA 10", "×3 copies") · Type · Seller · Seen · actions. Every cell is two lines at most, primary then muted, top-aligned, cut short with the whole text on hover; nothing overflows its column. Clicking a row opens the Listing drawer; the row's icon buttons mark it wrong (a menu of reasons, one click) and open the marketplace. A marked row folds away (height and opacity, 200 ms ease-out, instant with reduced motion) and a toast offers Undo.

**Listing drawer** (`?listing=`):

1. Per-copy price large, with the grade badge and "78% of $54.00 eBay ref (11 sales, 60 days)".
2. Breakdown as a definition list:

```
Price           £31.00 → $39.37
Shipping        $4.00
Import fees     $5.64   (UK 13%)
Copies in lot   ÷ 1
Per copy        $49.01
```

3. **What the title says:** set code, rarity, condition (or "Unknown, check photos"), Copies, language, grading. All AI-read, labelled "Read from title".
4. **Match:** a TanStack form with a `Select` of this Deck's Printings plus "Not a match", and a "Save" button. Once overridden, add the note "Your choice. Kept on future captures."
5. **Footer:** "Open on eBay" or "Open on TCGplayer" as the primary full-width `Button`, linking out.

### 5.4 Deck: Searches `/yugioh/decks/[deckId]/searches`

- A callout at the top when true: "2 Printings need a TCGplayer link". Tap it to open the first affected Card drawer.
- **eBay Searches:** one `Card` each, titled "Search 1 · 8 set codes".
  - Body: set codes as mono `Badge variant="outline"`, then Exclusions as `Badge variant="secondary"` with a leading minus ("−super").
  - Footer: two `Button`s, "Newly listed" (primary) and "Sold" (outline), each with `ExternalLink`, both full width on mobile.
- **TCGplayer:** a compact list, one row per Printing: Card name, set code, rarity, "Product page" link or "Search TCGplayer" fallback link (03).
- Link formats: `references/tcgplayer-ebay-links.md`.

### 5.5 Settings `/yugioh/settings`

- **Notifications** `Card`:
  - Inside the installed app with push available: a `Switch` "Deal and auction alerts on this device", with the description "Great and Good deals, 8am-11pm. Auctions 15 minutes before they end, any time."
    - A "Send a test alert" button sits under the switch while it's on (13). Ticket 14 restored the auction wording above.
  - In a Safari tab on iPhone: numbered add-to-home-screen steps instead.
  - On desktop browsers that support push: the same `Switch`.
  - See `references/ios-web-push.md`.
- **Import fees** `Card` (08): a `Table` of Country · Rate. Each rate is an inline TanStack form (`InputGroup` with a `%` suffix) that saves on blur or Enter, with "Other countries: 15%" as a footer row.
- **Exchange rates:** one muted line, "Updated today at 6:00 from <source>". No controls.

## 6. Treatments

### Rarity

- Neutral text, no rarity colours. The card image already shows the foil.
- Full name in drawers and on desktop rows; abbreviation in mobile rows. `Tooltip`/`title` carries the full name.
- **Abbreviations (assumption, owned by one map in the domain library):**

| Rarity | Abbr. |
|---|---|
| Quarter Century Secret Rare | QCSR |
| Starlight Rare | StR |
| Prismatic Secret Rare | PScR |
| Collector's Rare | CR |
| Ultimate Rare | UtR |
| Ghost Rare | GR |
| Secret Rare | ScR |
| Ultra Rare | UR |
| Super Rare | SR |
| Rare | R |
| Common | C |

  Any other rarity shows its full name.

### Card images

- Always `next/image` with explicit `width`/`height` at the 59:86 ratio and `sizes` set.
- `alt` = "<Card name>, <rarity>".
- Never crop, never tint, no hover zoom. The same image size and corner appear in the row and the drawer header so they read as one object.

### Deal grades

Always a text label; hue and fill reinforce it. Show "NN% of ref" beside it wherever there's room.

| Grade | Rule (spec) | Badge |
|---|---|---|
| **Great** | ≤ 80% of ref | solid `bg-deal-great text-deal-great-foreground`, `ArrowDown` icon |
| **Good** | ≤ 95% | tinted `bg-deal-good/12 text-deal-good`, no icon |
| **Fair** | ≤ 110% | `variant="outline"`, `text-foreground` |
| **Poor** | > 110% | quiet muted pill, `bg-muted text-muted-foreground`, same size as the others |
| none | running auction, no Reference price, not matched to a Printing the Deck wants, not English, or below the Card's Lowest acceptable condition. A Graded Listing isn't Qualifying but still gets a grade, with its Graded flag | no grade; auctions show the countdown instead |

- Never red for Poor: overpriced isn't an error.
- `destructive` is reserved for failures and removal.

### Flags

All are outline `Badge`s with an icon, placed after the grade. Flags explain; they don't scold.

| Flag | Badge | Effect |
|---|---|---|
| Graded | `ShieldCheck` "PSA 10" (company and grade) | still graded; tooltip "Graded copies don't count toward cost to finish" |
| Unknown condition | dashed border, `CircleHelp`, "Condition?" | counts; tooltip "Title didn't say. Check the photos." |
| Below condition | "LP" (the read condition), muted | not Qualifying |
| Not English | language code "KR", "DE" | not Qualifying |
| Lot | "×3 copies" | Per-copy already divided |
| Unsure match | "Unsure" | not Qualifying until resolved |
| New since last visit | small uppercase "New" label after the Card name (`bg-primary/10 text-primary`); no dots | none |

### Thin data

- Write "Not enough sales (2 of 3)" in `text-muted-foreground`, never "$0" or "—" alone.
- A Card without any Reference price shows "No price" for its remaining cost and is counted in the header callout.

## 7. States

| Screen | Loading | Empty | Error |
|---|---|---|---|
| Decks overview | 2 `Skeleton` Deck cards | `Empty`: "No Decks yet", "Start a Deck to track what it costs to finish.", [New Deck] | error boundary: "Couldn't load your Decks." [Try again] |
| Deck: Cards | header skeleton (hero figure block) and 6 row skeletons | `Empty`: "No Cards in this Deck", "Add the first Card, or have an agent load your list.", [Add Card] | "Couldn't load this Deck." [Try again]; missing Deck: "This Deck doesn't exist." [Decks] |
| Deck: Listings | 8 row skeletons | none captured: "No Listings yet. They appear after the next capture. Open a Search on the Searches tab to capture now."; filtered to nothing: "Nothing matches these filters." [Clear filters] | as above |
| Deck: Searches | 3 card skeletons | "Add Cards to get Searches." | as above |
| Card drawer | skeleton inside the drawer, header first | n/a | inline message in the drawer |
| TCGplayer lookup (03) | `Spinner` "Finding TCGplayer page…" on the Printing | not found: paste field, "Couldn't find it. Paste the product URL." | rejected paste: `FieldError` "That isn't a TCGplayer product page for this Printing." |

- Each component exports a `ComponentNameSkeleton` with the same dimensions as the real thing (`AGENTS.md`).
- `useQuery` returning `undefined` means loading.
- Mutations: optimistic where cheap (owned count); on failure `toast.error("Couldn't save. Try again.")` and roll back.
- Success toasts only for actions with no visible result on screen (adding a Card while the drawer stays open, saving a fee rate). Never toast a change the user can see happen.

## 8. Motion (Family Values)

See `references/family-values.md`. Implement with CSS transitions, `tw-animate-css` and vaul. No motion library is approved.

| Moment | Frequency | Motion |
|---|---|---|
| Drawer open/close | constant | vaul default rise (or slide from right); the page underneath stays put |
| Row press | constant | `active:bg-muted` only |
| Choose a Printing | occasional | others collapse in place via `Collapsible`, 200 ms `ease-out`, height and opacity |
| Add another Printing | occasional | inline form reveals in place, same timing |
| Owned reaches needed | per Card, rare | remaining cost cross-fades to a `Check` (150 ms). The row moves to the bottom when the drawer closes, without animation |
| Sort toggle, filters, live price updates, new Listings arriving | constant | instant. No list reflow animation |
| Tab change | frequent | instant; header and tabs stay still |
| Deck finished (owned = needed on every Card) | once per Deck | the one celebration: the hero figure morphs from "$0 to finish" to "Complete", with a single soft sheen across the header (≤ 800 ms, plays once, remembered so it never replays) **(assumption)** |

- Under `prefers-reduced-motion`, everything becomes instant or an opacity fade. The finished-Deck sheen is skipped; the text still changes.

## 9. Copy voice

- **Plain, short, specific.** Like a knowledgeable friend reading the listing for you.
- **Glossary words exactly:** Card, Printing, Copy, Listing, Search, Exclusion, Reference price, Per-copy price, Deal grade, Lowest acceptable condition, Section, Candidate, Chosen. Never item, variant, slab, score, build.
- **Casing:** sentence case for labels and buttons. Glossary terms keep their capital in UI text ("2 Copies left", "Reference price").
- **Buttons** are verbs: "Add Card", "Open on eBay", "Choose this Printing", "Remove Card".
- Numbers carry their evidence: "$54 eBay ref · 11 sales", "Last seen $40 · 22m ago".
- **No hype or urgency theatre.** No "Hurry!", no exclamation marks, no emoji.
- **Errors** say what happened and what to do: "Couldn't reach TCGplayer. Paste the product URL instead."

**Push copy:**

- **Deal**
  - title: "Great deal: Ash Blossom QCSR"
  - body: "$42.15 a copy, 78% of $54 ref · eBay, buy it now"
- **Auction**
  - title: "Ending in 15 min: Ash Blossom QCSR"
  - body: "Last seen $40.00 a copy (22m ago) · ref $54 · 4 bids"
- Held deal pushes are delivered at 8am **unchanged**, with no digest wrapper **(assumption)**. Skip a held deal if the Listing has since ended.

## 10. Accessibility

- Grades, flags and match status are text, never colour or icon alone.
- Every icon-only button has an `aria-label`.
- Drawers trap focus and return it to the row that opened them.
- The stepper buttons are labelled "Fewer owned" and "More owned".
- Drag reorder (04) needs a keyboard alternative (move up/down).
- Contrast is ≥ 4.5:1 for text in both themes, including the deal tokens.

## 11. Ticket map

| Ticket | Sections |
|---|---|
| 01 Decks, Cards, Candidates | 3, 4, 5.1, 5.2, 7 |
| 02 Searches | 5.4 |
| 03 TCGplayer link and image | 5.2 Card drawer, 5.4, 6 Card images, 7 |
| 04 Custom order | 4 drag note, 5.2 toolbar, 10 |
| 06-07 Capture, AI, matching | 5.3, 6 Flags |
| 08 Per-copy price | 5.3 breakdown, 5.5 import fees |
| 09 Reference and Deal grades | 2 tokens, 6 Deal grades, 6 Thin data |
| 10 Cost to finish | 5.1, 5.2 header |
| 11 Filters, what's new | 3 drawer params, 5.3 |
| 13-14 PWA and pushes | 3 manifest, 5.5, 9 push copy, `references/ios-web-push.md` |
| 05, 15-17 | no UI beyond "Last captured" in 5.2 |

## 12. Known gaps (not decided by the spec)

- `ThemeProvider` from `next-themes` isn't mounted in the root layout, and the app-shell sidebar hardcodes stone/teal colours. `/yugioh` must still use semantic tokens. Mounting the provider is an `AGENTS.md` requirement for whoever touches the root layout first.
- Most UI primitives are Radix, not Base UI (§4).
- Drag-and-drop for 04 needs either a dependency approval or the hand-rolled fallback.
- Sending Web Push needs `web-push` (or an equivalent), which isn't an approved dependency yet.
- `next.config` needs the TCGplayer image host in `remotePatterns` (03).
- `/sw.js`, the manifest and icons must be added to the middleware allowlist (13).
