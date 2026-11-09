# The Henry apartment tracker

**Status:** ready-for-agent

Prototype of the chosen page (Ledger, variant 1) runs at `/prototypes/henry`
until `/henry` ships.

## Problem Statement

I'm looking for an apartment at The Henry in Denver. Its website only shows
what's available right now, and the property prices units with
revenue-management software, so rents move up and down every few days. To
know whether a unit I'd take has come up, or whether one I'm eyeing just got
cheaper, I have to keep checking the site by hand and remember what it said
last time. I can't see how a unit's price has moved, I miss units that list
and lease between my checks, and nothing tells me when something worth
acting on happens.

## Solution

The app checks The Henry's live availability every hour and keeps every
unit's price history from the day tracking starts. A new **The Henry** page,
at the same level as Yu-Gi-Oh, lists every unit on the market in one
sortable table: its price, how that price changed over 3, 7 and 14 days,
its size, floor, layout and move-in date, with new units and units facing
I-25 marked. Tapping a unit shows its price chart and timeline. I can star
units or whole floor plans. My phone gets a push when a unit I'd actually
want comes on the market, or when a starred unit's price drops. The
installed home-screen app opens the website's home page instead of
Yu-Gi-Oh.

## Glossary

- **Unit** — one apartment, identified by SightMap's unit id; shown by its
  number (e.g. 608, where the first digit is the floor).
- **Floor plan** — the layout a unit belongs to: U1 (studio), A1–A9 (1 bed),
  B1–B3 (2 bed), TH (2-bed townhome).
- **Check** — one hourly read of The Henry's availability. It either
  succeeds or fails; only a successful check changes anything.
- **Baseline** — the first successful check. The units it finds are
  "tracked since" that day, not new.
- **On the market / listed** — present in the latest successful check.
- **New** — first seen after the baseline, within the last 7 days.
- **Relisted** — back on the market after going off it, keeping its history.
- **Off the market (gone)** — missing from two successful checks in a row.
- **Price** — base rent, the tracked number. Also recorded: the total
  monthly price with mandatory fees and the lease term the price is quoted
  for.
- **Price point** — a recorded change of price at a moment in time.
- **Change (3d / 7d / 14d)** — current price minus the price at that many
  days ago, or minus the price when tracking or listing began if more
  recent.
- **Starred** — starred itself, or in a starred floor plan.
- **I-25 side** — a unit along the building's highway edge.
- **Push rules** — which new units send a push (see Implementation
  Decisions).

## User Stories

### Checking and history

1. As the renter, I want The Henry checked every hour without me doing anything, so that I hear about changes within about an hour.
2. As the renter, I want every unit's price recorded each time it changes, so that I can see how it moved.
3. As the renter, I want the total monthly price with fees and the lease term kept with each price, so that a jump caused by a different term isn't mistaken for a real price change.
4. As the renter, I want each unit's move-in date and any special offer kept up to date, so that I know when I could move and whether there's a deal.
5. As the renter, I want units that disappear marked off the market only after two checks in a row miss them, so that one bad response doesn't make a unit look leased.
6. As the renter, I want a unit that comes back to be marked relisted with its old history intact, so that I can see what it cost before.
7. As the renter, I want the units already listed on day one treated as the starting point rather than as new, so that I don't get a burst of pushes and a page full of "New" badges at launch.
8. As the renter, I want a failed or empty response ignored, so that a broken page on their side can't wipe out what's on the market.
9. As the renter, I want to be told when checks have been failing for a while, so that I know the tracker is blind rather than assuming nothing changed.

### The page

10. As the renter, I want a The Henry page in the app's navigation, so that I can open it like Yu-Gi-Oh.
11. As the renter, I want a line at the top saying how many units are on the market, how many are new this week, how many went this week and when it last checked, so that I get the state at a glance.
12. As the renter, I want one row per unit with its number, floor plan, beds, sq ft, floor, price, 3d / 7d / 14d change and move-in date, so that I can compare units without opening them.
13. As the renter, I want price drops shown with a down arrow in the app's "good deal" color and rises muted with an up arrow, so that drops stand out.
14. As the renter, I want "–" when a price hasn't changed in that window, so that no change doesn't look like data.
15. As the renter, I want to sort by price, sq ft, floor or any change column, in either direction, so that I can find the cheapest or biggest drops.
16. As the renter, I want starred units pinned to the top and in bold, so that the units I care about are always first.
17. As the renter, I want to filter to All, Starred or New, with counts, so that I can narrow the list.
18. As the renter, I want a "New · Nd" badge on units new this week, so that I can spot recent listings.
19. As the renter, I want an "I-25 side" badge on highway-facing units, so that I don't have to remember which side they're on.
20. As the renter, I want a "Gone this week" list with each unit's last price struck through, so that I can see what got leased and for how much.
21. As the renter, I want the page to say when the last check is more than 3 hours old, so that I don't trust stale numbers.
22. As the renter, I want the page to work on my phone, with the table scrolling inside its box and the page itself not scrolling sideways, so that I can check it from the couch.
23. As the renter, I want the page to look right in light and dark mode, so that it matches the rest of the app.
24. As the renter, I want the page to tell me when tracking has just started and there's no history yet, so that empty change columns make sense.

### A unit's details

25. As the renter, I want to tap a unit to open its details in a drawer (side panel on desktop, bottom sheet on phone), so that I stay on the list.
26. As the renter, I want the drawer to show the price large, plus move-in date, lease term and total with fees, so that I know the real monthly cost.
27. As the renter, I want the drawer to show the 3 / 7 / 14-day changes and the change since it listed or since tracking began, so that I see the trend.
28. As the renter, I want a 14-day price chart in the drawer, so that I can see how it moved.
29. As the renter, I want a timeline of tracking began / listed, each price change with before → after, off the market and relisted, with dates, so that I know the unit's story.
30. As the renter, I want the drawer to list floor plan, layout, sq ft, floor, which side it faces and whether it passes my push rules, so that I have the facts in one place.
31. As the renter, I want to open a gone unit's drawer too, so that I can see what it went for.
32. As the renter, I want a link from the drawer to The Henry's own site, so that I can go apply.

### Stars

33. As the renter, I want to star a unit from its row or its drawer, so that I can mark ones I'm considering.
34. As the renter, I want to star a whole floor plan, so that every unit with that layout counts as starred, including future ones.
35. As the renter, I want units starred through their floor plan to show a lighter star, so that I can tell them from ones I starred directly.
36. As the renter, I want stars kept on the server, so that they're the same on my phone and laptop.

### Pushes

37. As the renter, I want a push when a new unit lists that passes my rules, so that I can act before it's gone.
38. As the renter, I want no push for units facing I-25, so that I'm not pinged about ones I'd never take.
39. As the renter, I want no push for 1-bed units of 800 sq ft or less, so that I only hear about the bigger 1-beds.
40. As the renter, I want pushes for studios only on floors 1 and 7, so that I hear about the studios I like and not the others.
41. As the renter, I want a relisted unit to count as new for pushes, so that I hear when a unit comes back.
42. As the renter, I want a push whenever a starred unit's price drops, by any amount, so that I never miss a cheaper price on a unit I'm watching.
43. As the renter, I want a new or relisted unit that's starred, or in a starred floor plan, to push even when my rules would skip it, so that starring always means "tell me".
44. As the renter, I want the push to say the unit, its layout and size, its price and the change, so that I can decide from the lock screen.
45. As the renter, I want tapping a push to open The Henry with that unit's drawer open, so that I land on the details.
46. As the renter, I want pushes that arrive overnight held until 8am like Yu-Gi-Oh's, so that I'm not woken up.
47. As the renter, I want several overnight events for one unit merged into a single push with its latest state, so that I get one useful push, not three.
48. As the renter, I want a held push dropped if the unit went off the market, was unstarred, or rose back before 8am, so that I'm not told about something that's no longer true.
49. As the renter, I want to turn push on for this device from The Henry page as well as from Yu-Gi-Oh settings, so that I don't have to dig for it.
50. As the renter, I want one per-device push setting to cover both The Henry and Yu-Gi-Oh, so that I don't manage two.
51. As the renter, I want a single push if checks have been failing for 6 hours, once per outage, so that I know to fix it.

### Installed app

52. As the renter, I want the home-screen app to open the website's home page, so that it's my whole site and not just Yu-Gi-Oh.
53. As the renter, I want the installed app named for the whole site, so that the icon label makes sense.
54. As the renter, I want existing installs and Yu-Gi-Oh pushes to keep working through the change, so that nothing I rely on breaks.
55. As the renter, I want push and notification taps to work whichever page the app opens on, so that pushes don't depend on visiting Yu-Gi-Oh first.

## Implementation Decisions

### Source

- Plain HTTP fetch, no browser automation. The Henry's floor-plans page embeds
  SightMap (`https://sightmap.com/embed/er5v5nqmvny`), which loads a public
  JSON API: `GET https://sightmap.com/app/api/v1/960p7z7lw7n/sightmaps/13397`.
  It needs no cookies or headers and has no bot wall; the response is
  gzip-compressed. Verified 2026-11-08.
- The response's `data.units[]` lists only available units (33 on
  2026-11-08). Fields used per unit: `id` (stable key), `unit_number`,
  `floor_id` → `data.floors[]`, `floor_plan_id` → `data.floor_plans[]`
  (plan name is a JSON string like `{"name":"U1"}`; `bedroom_count`,
  `bathroom_count`), `area` (sq ft), `price` (base rent, tracked),
  `total_price` (total monthly with fees), `display_lease_term`,
  `available_on` (`YYYY-MM-DD`), `specials_description`.
- The API ids could change if the property rebuilds its embed. That surfaces
  as failed checks, then the failing-checks push; the fix is updating the
  URL.

### Modules

- **Henry check (Convex action + cron).** An hourly cron runs an action that
  fetches the JSON and hands the raw payload to one internal mutation. The
  action does nothing else (actions are only for external calls).
- **Record check (Convex internal mutation; the test seam).** Validates and
  parses the payload, decides success or failure, then compares it with
  stored state: listings, relistings, price points, gone units, and push
  decisions. Business logic in the Henry model module; pure rules (I-25
  list, push rules, change windows) in a shared pure module that Convex
  imports with relative imports only.
- **Henry queries.** Page data (summary line, listed units with 3/7/14
  changes and badges, gone this week, last successful check, staleness) and
  one unit's details (history, timeline, facts). All reads bounded.
- **Stars (Convex mutations).** Toggle a unit star; toggle a floor-plan
  star. Auth-wrapped, single user.
- **Henry pushes.** Push decisions, the per-unit merge of held pushes, and
  delivery. Reuses Yu-Gi-Oh's Web Push sending and quiet-hours logic. Whether
  Henry gets its own outbox table or a widened shared one is the builder's
  call; Yu-Gi-Oh's outbox is one push per listing and kind ever, which
  doesn't fit Henry's repeating events as is.
- **Installed app.** The manifest, service worker registration and
  notification routing become app-wide (see below).
- **The Henry page.** A new feature route following the prototype's Ledger
  design, plus a unit drawer in the style of Yu-Gi-Oh's drawer. Linked from
  the app nav.

### Check rules

- **Success:** valid JSON with a `units` array whose length is at least half
  the number of units currently listed and not zero (after the baseline).
  Anything else is a **failed** check: recorded, changes nothing.
- **Baseline:** the first successful check records every unit as tracked
  since then: no push, no "New" badge, no listing event. Its timeline starts
  "Tracking began at $X", and changes measure from that price.
- **Listed / relisted:** a unit id not currently on the market. Never seen →
  listed. Seen before → relisted, history kept.
- **Price point:** recorded only when base rent differs from the last
  recorded price; stores time, price, total and lease term.
- **Off the market:** a listed unit absent from two consecutive successful
  checks. Its last price and history stay.
- Each successful check updates the unit's facts, move-in date, specials and
  last seen, and the page's "last checked" time.

### Schema (shape, not final)

- A unit table keyed by SightMap unit id: number, floor, floor plan, beds,
  baths, sq ft, I-25 side, current price, total, lease term, available-on
  (`YYYY-MM-DD` string), specials, first seen, last seen, tracked-since-
  baseline flag, on-market state, consecutive misses, gone-at.
- A price-point table: unit, at (Unix ms), price, total, lease term;
  indexed by unit and time.
- A listing-event table (or equivalent) for the timeline: unit, kind
  (tracking began / listed / relisted / off market), at.
- A check log: at, success or failure, reason, unit count. Retention is the
  builder's call.
- Star tables (or fields): starred units, starred floor plans.
- Henry push records with per-unit merge and delivery state.
- Push subscriptions stay in the existing per-device table, unchanged. No
  rename, no migration.

### I-25 side (fixed list)

Worked out from SightMap's unit geometry (the outer row along the highway
edge). A unit is on the I-25 side if it is: **155; 249, 251, 253, 273, 275;
349–383 odd; 449–483 odd; 549–581 odd; 649–681 odd; 749–779 odd.** Corner
units x47 (incl. 647) sit about 14 m back and don't count. Kept as a fixed
list, not computed at runtime.

### Push rules

A **new-unit push** fires for a listed or relisted unit when it is starred
(itself or its floor plan), or else when none of these hold:

1. it's on the I-25 side;
2. it's 1 bed with 800 sq ft or less;
3. it's a studio on floors 2–6.

On 2026-11-08 data the rules alone pass 12 of 33: studios 733, 743; 1-beds
516, 101, 201, 713; 2-beds 326, 526, 608, 647, 672; townhome 127.

A **drop push** fires when a starred unit's base rent goes down, any amount.

Prototype snippet (the rule as tested against real data):

```ts
function wouldPush(unit: Unit): boolean {
	if (unit.facesI25) return false;
	if (unit.beds === 1 && unit.sqft <= 800) return false;
	if (unit.beds === 0 && unit.floor >= 2 && unit.floor <= 6) return false;
	return true;
}
// + starred (unit or floor plan) overrides to true for new/relisted units
```

**Delivery:** every device with push on; held through the existing quiet
hours (until 8am). One push per unit per delivery: events that pile up for a
unit while held merge into one push with its current price and total change.
At delivery a held push is dropped if the unit is off the market, or, for a
drop, if it's no longer starred or its price is no longer below the price
before the drop. A relisting below the last known price is one push. Tapping
opens The Henry with that unit's drawer open.

**Failing checks:** one push after 6 hours with no successful check, once
per outage.

### The page (Ledger)

- Header: "The Henry", then `33 on the market · 5 new this week · 3 gone
  this week · checked 12 min ago`. After 3 hours without a successful check,
  that line says checks are failing.
- Filter toggle: All / Starred / New, with counts.
- Table columns: star, unit (+ "New · Nd", "I-25 side" badges), plan · beds,
  sq ft, floor, price, 3d, 7d, 14d, move-in ("Now" or a date). Sortable by sq
  ft, floor, price, 3d, 7d, 14d. Starred units pin to the top in bold;
  plan-starred units show a lighter star.
- Change cell: drop = down arrow, `deal-good` token; rise = up arrow,
  muted; none = "–".
- "Gone this week": units off the market in the last 7 days, last price
  struck through; rows open the drawer.
- Drawer: title "Apt N", facts line, large price, availability · term ·
  total with fees, 3/7/14 trio, 14-day step chart, timeline, facts grid
  (floor plan, layout, size, floor, faces, new-unit push yes/no), star
  toggle, link to The Henry's site.
- Phone width: table scrolls inside its bordered box; no page-level
  sideways scroll. Light and dark via semantic tokens.
- shadcn components only (Table, ToggleGroup, Badge, Button, Drawer,
  Separator); forms rules don't apply (no form). Chart: shadcn chart or a
  small step line, builder's call.

### Installed app

- Manifest: start URL `/`, name and short name for the whole site; keep the
  manifest `id` unchanged so Android and desktop installs carry over. iOS
  likely needs a re-add.
- Service worker registration and the per-launch subscription refresh move
  from the Yu-Gi-Oh layout to the root layout. The service worker's fallback
  URL becomes `/`; notification routing stops being Yu-Gi-Oh-specific.
- The per-device push toggle appears on The Henry page and stays in Yu-Gi-Oh
  settings.

## Testing Decisions

- Good tests drive the feature from its edge and assert what I would see:
  the page query's output and the pushes queued or delivered. They never
  assert on internal helpers, table shapes or call order.
- **Seam 1 (the only new seam): Convex functions via `convex-test`**, in the
  edge-runtime environment, matching Yu-Gi-Oh's Seam 1. Tests feed the
  record-check mutation SightMap payloads (fixtures trimmed from the real
  2026-11-08 response, then edited to simulate a new unit, a price drop, a
  missing unit, an empty response) at chosen times, then read the page and
  unit queries and the push records. Covers:
  - baseline: no pushes, no "New", "Tracking began";
  - a new unit listing, with each push rule (I-25 side, 1 bed ≤ 800 sq ft,
    studio by floor, starred unit / starred plan overriding);
  - a price change producing a price point and correct 3/7/14 changes,
    including windows longer than the listing;
  - one missed check keeps the unit; two make it gone; its return is a
    relisting with history;
  - failed and suspiciously short responses change nothing;
  - drop pushes only for starred units, any size;
  - quiet hours, the per-unit merge, and the drop-on-delivery conditions;
  - the failing-checks push, once per outage;
  - star toggles and their effect on the page and pushes.
- The fetch action is thin and not tested beyond a smoke check; its parsing
  is exercised through Seam 1 because the mutation takes the raw payload.
- The existing service-worker test is extended for the new fallback URL and
  routing.
- The existing public-surface lockdown test must keep passing: every new
  public function is auth-wrapped.
- Prior art: Yu-Gi-Oh's push tests (deal checks, quiet hours, delivery), its
  convex-test setup, and its service-worker test.

## Out of Scope

- Other buildings, or a generic apartment tracker.
- History from before tracking starts.
- Telling leased apart from pulled.
- Per-term or per-move-in-date pricing (SightMap's per-unit leasing price
  endpoints).
- Pushes for price rises or for units going off the market.
- Renaming or migrating the push subscription table.
- Editing push rules in the app; they're fixed in code for now.
- A floor-plate map view.

## Further Notes

- **Assumption to confirm:** starring overrides the push rules for new and
  relisted units (story 43). I asked; no answer yet. If not wanted, a starred
  unit or plan only affects drop pushes.
- History starts the day this ships; the first week's 7- and 14-day changes
  will be short.
- The property's pricing moves often; if drop pushes on starred units turn
  out noisy, a threshold is an easy follow-up.
- Delete the prototype route once The Henry page ships.
