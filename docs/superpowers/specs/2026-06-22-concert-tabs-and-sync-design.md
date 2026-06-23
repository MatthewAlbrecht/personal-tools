# Concert Tabs and Sync Product/Technical Spec

## Overview

Extend the existing Concert Tracker into an albums-style tabbed experience with two primary views:

- **Upcoming Shows**: the user's committed concert schedule, ordered by show date.
- **New Shows**: the working queue of internally synced venue events that have not been actioned yet.

The feature should keep venue/event storage in Convex as the source of truth. Ticketmaster is only a sync source; all filtering, search, status display, and tab content should query the internal DB.

## Goals

- Add URL-backed tabs under `/concerts`, matching the `/albums` route pattern.
- Show a tab-agnostic concert header with a sync button available regardless of the active tab.
- Make Upcoming Shows a date-ordered list of `owned` shows, with an option to include `interested` shows.
- Make New Shows a searchable, filterable, date-ordered queue of internal DB events.
- Hide actioned shows from New Shows by default.
- Filter New Shows by selected venues with a multi-select shadcn control, not a dropdown.
- Keep Convex queries fast with indexes aligned to user, status, venue, and date.
- Report sync results per venue, counting canonical newly inserted events after DB-level dedupe.

## Non-Goals

- No automatic scheduled sync.
- No new venue discovery workflow beyond preserving the current selected venue/discovery surface.
- No artist enrichment, setlist.fm, or Spotify playlist generation.
- No fuzzy search ranking. The requested list order is always soonest to furthest in the future.
- No replacement of the in-progress DB-level event dedupe work.

## Existing Patterns To Match

The `/albums` route uses a shared client layout with:

- `src/app/albums/layout.tsx` for header, shared auth/loading handling, and tab navigation.
- `src/app/albums/page.tsx` redirecting to a default tab route.
- child routes such as `/albums/history` and `/albums/all` for tab content.
- a tab-agnostic sync action in the header.

Concerts should follow that shape:

- `src/app/concerts/layout.tsx` owns the title, subtitle, calendar action menu, sync button, shared messages, and tabs.
- `src/app/concerts/page.tsx` redirects to `/concerts/upcoming`.
- `src/app/concerts/upcoming/page.tsx` renders Upcoming Shows.
- `src/app/concerts/new/page.tsx` renders New Shows.

## Product Behavior

### Shared Concert Header

The header appears on all concert tabs and includes:

- Back link to tools.
- Page title and description.
- Calendar feed action menu, preserving the existing copy-feed behavior.
- Sync button labeled like `Sync venues` or `Sync selected venues`.

Sync behavior:

- Sync all currently selected venues.
- For each selected venue, request the maximum practical upcoming Ticketmaster events.
- Use Ticketmaster `size=199` and bounded pagination. A pragmatic cap is 5 pages per venue, matching the Ticketmaster deep-paging limit of roughly 1,000 results while preventing accidental runaway API usage.
- Upsert events through the canonical Convex event path.
- Return per-venue counts:
  - `inserted`: canonical events that did not exist before this sync.
  - `updated`: canonical events already known and refreshed.
  - `totalFetched`: normalized Ticketmaster events fetched.
  - `failed`: whether that venue failed.
- Notify with a concise per-venue summary, for example: `Synced 3 venues: Mission Ballroom 12 new, Ogden Theatre 4 new, Bluebird Theater 0 new.`

The sync count must use canonical DB inserts after dedupe, not raw Ticketmaster event variants. If the dedupe implementation collapses multiple Ticketmaster IDs into one `concertEvents` row, the sync should count that as one new show.

### Upcoming Shows Tab

Default behavior:

- Query internal Convex data only.
- Show `owned` shows only.
- Sort by show date ascending.
- Render as a list view, not the current card grid.
- Include enough event detail for quick scanning: date, title, venue, status, and primary actions.

Optional toggle:

- Add a `Show interested` control.
- When enabled, include both `owned` and `interested` shows.
- Preserve date ordering across both statuses.

Filtering rules:

- Do not show `new` or `ignored` statuses.
- Do not rely on Ticketmaster fetch state or the current session's loaded events.
- Only show future/upcoming rows by default. Pass today's local date from the client into the Convex query; do not call `Date.now()` inside a Convex query.

### New Shows Tab

Default behavior:

- Query internal Convex data only.
- Default to rows with `userStatus: "new"`.
- Hide actioned statuses by default. "Actioned" means `interested`, `owned`, or `ignored`.
- Always sort by show date ascending, regardless of filters or text search.

Filters:

- Venue filter at the top.
- Venue filter is multi-select, not a native `<select>` and not a dropdown menu.
- Use the existing shadcn-style `Combobox` from `src/components/ui/combobox.tsx` with `multiple`, chips, and searchable options, or add shadcn Command primitives if the team prefers that pattern later.
- Text search at the top for quickly finding shows by event name, venue name, and attraction names.
- Include a clear affordance for resetting filters.

Actioned visibility:

- Default: only `new`.
- Provide an explicit control to include actioned rows if useful for recovery and review.
- If actioned rows are included, preserve the same date order.

Display:

- A list view is preferred for scan speed, but reusing `ConcertEventCard` is acceptable only if the page remains easy to scan.
- Existing status actions should remain available: mark owned, mark interested, ignore.
- Optimistic hide is acceptable when a `new` row is actioned from the default New Shows view.

### Venue Management

The existing selected-venue and discover-venue flows must remain reachable. Do not add a third tab unless the user asks. The simplest acceptable placement is a secondary management section on New Shows below the search/list, or a collapsible shared section in the concert layout.

## Data And Index Requirements

The current schema has canonical `concertEvents` and per-user `userConcertEvents`, but the list queries currently collect user rows, join events, and sort in memory. That is acceptable for a tiny dataset, but this request explicitly asks for fast filtering and sorting.

Add denormalized query fields to `userConcertEvents`:

```typescript
venueId: v.optional(v.id("concertVenues")),
eventDate: v.optional(v.string()),
```

`eventDate` should be the normalized date key used for sorting and range filtering. Prefer `dateRangeStart`, then `localDate`, then the first 10 chars of `dateTime`. Keep the value as `YYYY-MM-DD` so string ordering matches date ordering.

Add indexes:

```typescript
.index("by_userId_eventDate", ["userId", "eventDate"])
.index("by_userId_userStatus_eventDate", ["userId", "userStatus", "eventDate"])
.index("by_userId_venueId_eventDate", ["userId", "venueId", "eventDate"])
.index("by_userId_venueId_userStatus_eventDate", [
	"userId",
	"venueId",
	"userStatus",
	"eventDate",
])
```

Use these indexes as follows:

- Upcoming owned only: query `by_userId_userStatus_eventDate` for `owned` and `eventDate >= today`.
- Upcoming owned + interested: query the same index once for `owned`, once for `interested`, merge, then sort by `eventDate`.
- New Shows default: query `by_userId_userStatus_eventDate` for `new` and `eventDate >= today`.
- New Shows with selected venues: query `by_userId_venueId_userStatus_eventDate` per selected venue/status, merge, then sort.
- New Shows with actioned included: query the required statuses individually and merge.

Also consider adding canonical event indexes aligned to the dedupe model:

```typescript
.index("by_venueId_dateRangeStart", ["venueId", "dateRangeStart"])
.index("by_dateRangeStart", ["dateRangeStart"])
```

Those are not required for the per-user tab queries if `userConcertEvents.eventDate` is denormalized correctly, but they help canonical maintenance and venue-level diagnostics.

## Text Search Strategy

Convex search indexes are available in this repo, but strict date ordering is more important here than relevance ordering. For the first implementation, use indexed status/venue/date queries to return a bounded upcoming working set, then apply client-side text filtering over event name, venue name, and attraction names.

This is pragmatic because the dataset is bounded by selected venues and upcoming Ticketmaster pages. If the selected-venue dataset grows enough that client filtering feels slow, add a dedicated search field such as `filterSearchText` and a Convex `searchIndex`. At that point, the implementation must still re-sort results by `eventDate` before rendering.

## Dependency On DB-Level Dedupe

There is an in-progress DB-level dedupe implementation for concert events. This work should assume that model exists or rebase onto it before implementation.

Requirements:

- Sync uses canonical event upsert results after dedupe.
- Per-venue "new" counts report newly inserted canonical rows, not raw Ticketmaster IDs.
- New Shows and Upcoming Shows render canonical rows, including any collapsed Ticketmaster variants.
- Status updates patch the surviving canonical `eventId` in `userConcertEvents`.
- If dedupe merges existing rows, user statuses should be preserved with the strongest user intent. A reasonable order is `owned > interested > ignored > new`, unless the dedupe worker defines a different policy.

## Error Handling

- If no venues are selected, disable sync and explain that venues must be selected first.
- If one venue sync fails, keep processing the remaining venues and report the failed venue.
- If text search has no matches, show an empty state that distinguishes "no synced shows" from "no matches for these filters".
- If old `userConcertEvents` rows lack `eventDate` or `venueId`, exclude them from indexed future queries until a backfill has populated derived fields.

## Acceptance Criteria

- Visiting `/concerts` redirects to `/concerts/upcoming`.
- `/concerts/upcoming` and `/concerts/new` share the same header and tab navigation.
- Upcoming defaults to owned shows in ascending date order.
- Upcoming can include interested shows without breaking date order.
- New Shows defaults to unactioned `new` shows only.
- New Shows filters by multiple venues through a shadcn multi-select control, not a dropdown.
- New Shows text search filters internal DB rows and keeps date order.
- Header sync pulls bounded max pages for each selected venue and reports new counts by venue.
- Convex query paths use the status/venue/date indexes above and do not rely on broad `.collect()` plus unbounded in-memory sorting.
- Sync counts canonical new events after dedupe.

## Open Assumptions

- "Actioned" means any status other than `new`.
- "Shows I'm going to" means `owned`; "interested in but haven't bought tickets to" means `interested`.
- The first implementation can client-filter text search after indexed date/status/venue narrowing.
- The maximum Ticketmaster pull per venue should be bounded to 5 pages of 199 events unless the user later asks for a different cap.
