# Concert Tabs and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add albums-style Concert Tracker tabs for Upcoming Shows and New Shows, backed by fast Convex queries and a tab-agnostic selected-venue sync button.

**Architecture:** Move `/concerts` to a shared client layout with URL-backed child routes, matching `/albums`. Denormalize date and venue fields onto `userConcertEvents` so tab queries can use Convex indexes, then hydrate canonical event and venue documents for rendering. Keep Ticketmaster sync in Convex actions/mutations and report per-venue canonical insert counts after event dedupe.

**Tech Stack:** Next.js App Router, React 19, Convex, shadcn UI primitives, TypeScript, Biome.

**Commit policy:** Do not commit unless explicitly requested.

---

## Dependency

This plan depends on the in-progress concert DB dedupe work. Before implementation, rebase onto or merge that work and confirm `concertEvents` supports canonical dedupe fields such as `tmEventIds`, `dedupeKey`, `dedupeBaseKey`, and date-range fields. Do not edit `/Users/matthewalbrecht/.cursor/plans/concert_dedupe_db_1224ebb4.plan.md`.

## Intended File Structure

- Modify `convex/schema.ts`: add query-oriented fields/indexes for concert lists.
- Modify `convex/concerts.ts`: add tab queries, derived-field helpers, and backfill/repair mutation.
- Modify `convex/concertActions.ts`: add selected-venue sync orchestration with per-venue summaries.
- Modify `src/app/concerts/page.tsx`: redirect to `/concerts/upcoming`.
- Create `src/app/concerts/layout.tsx`: shared auth state, header, tabs, messages, calendar action, sync button.
- Create `src/app/concerts/upcoming/page.tsx`: Upcoming Shows tab route.
- Create `src/app/concerts/new/page.tsx`: New Shows tab route.
- Create `src/app/concerts/_components/concerts-header.tsx`: title, back link, calendar action, sync button.
- Create `src/app/concerts/_components/concert-tabs.tsx`: URL-backed tabs matching `/albums`.
- Create `src/app/concerts/_components/upcoming-shows-list.tsx`: owned/interested list view.
- Create `src/app/concerts/_components/new-shows-list.tsx`: new shows filters and list.
- Create `src/app/concerts/_components/venue-multiselect.tsx`: shadcn multi-select wrapper using existing `Combobox`.
- Modify `src/app/concerts/_components/concert-event-card.tsx`: only if needed for shared status controls.
- Modify `src/app/concerts/_utils/types.ts`: add sync/query result types.
- Modify `src/app/concerts/_utils/formatters.ts`: add shared date/search label helpers if needed.

## Task 1: Prepare The Route Shell

**Files:**
- Modify: `src/app/concerts/page.tsx`
- Create: `src/app/concerts/layout.tsx`
- Create: `src/app/concerts/_components/concert-tabs.tsx`
- Create: `src/app/concerts/_components/concerts-header.tsx`

- [ ] Replace the current `src/app/concerts/page.tsx` dashboard with a redirect:

```typescript
import { redirect } from "next/navigation";

export default function ConcertsPage() {
	redirect("/concerts/upcoming");
}
```

- [ ] Create `ConcertsLayout` as a client component, following `src/app/albums/layout.tsx`: load `userId` with `useAuthToken`, show loading state, render the shared header, render tab links, then render `{children}`.

- [ ] Define tabs as:

```typescript
const TABS = [
	{ href: "/concerts/upcoming", label: "Upcoming Shows" },
	{ href: "/concerts/new", label: "New Shows" },
] as const;
```

- [ ] Preserve the existing calendar feed action in the shared header. Keep the action menu tab-agnostic.

- [ ] Move selected-venue sync state and messages into the layout/header so the sync button is visible from both tabs.

## Task 2: Add Query Fields And Indexes

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/concerts.ts`

- [ ] Add optional denormalized fields to `userConcertEvents`:

```typescript
venueId: v.optional(v.id("concertVenues")),
eventDate: v.optional(v.string()),
```

- [ ] Add these indexes to `userConcertEvents`:

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

- [ ] In `convex/concerts.ts`, add a helper that derives the sortable event date:

```typescript
function getConcertEventDateKey(event: Doc<"concertEvents">): string | undefined {
	return event.dateRangeStart ?? event.localDate ?? event.dateTime?.slice(0, 10);
}
```

- [ ] Update user event creation and repair paths so every `userConcertEvents` row gets `venueId` and `eventDate` from its canonical event.

- [ ] Add a focused maintenance mutation such as `backfillUserConcertEventQueryFields` to patch old rows. It should fetch each user event, read its canonical event, and patch missing or stale `venueId`/`eventDate`.

## Task 3: Add Tab Queries

**Files:**
- Modify: `convex/concerts.ts`
- Modify: `src/app/concerts/_utils/types.ts`

- [ ] Add `listUpcomingShows` with args:

```typescript
args: {
	userId: v.string(),
	todayDate: v.string(),
	includeInterested: v.optional(v.boolean()),
}
```

- [ ] Query `owned` via `by_userId_userStatus_eventDate` with `eventDate >= todayDate`. If `includeInterested` is true, query `interested` the same way, merge, hydrate event/venue documents, and sort by `eventDate`.

- [ ] Add `listNewShows` with args:

```typescript
args: {
	userId: v.string(),
	todayDate: v.string(),
	venueIds: v.optional(v.array(v.id("concertVenues"))),
	includeActioned: v.optional(v.boolean()),
}
```

- [ ] Default statuses for `listNewShows` to `["new"]`. If `includeActioned` is true, include `interested`, `owned`, and `ignored` as well.

- [ ] If `venueIds` is empty or omitted, query by status/date. If `venueIds` is set, query by venue/status/date for each selected venue/status pair. Merge, hydrate, and sort by date.

- [ ] Do not perform text search in the Convex query for the first pass. The page should client-filter the bounded result set so date order remains authoritative.

## Task 4: Implement Header Sync Action

**Files:**
- Modify: `convex/concertActions.ts`
- Modify: `convex/concerts.ts`
- Modify: `src/app/concerts/_utils/types.ts`
- Modify: `src/app/concerts/layout.tsx`
- Modify: `src/app/concerts/_components/concerts-header.tsx`

- [ ] Add a constant:

```typescript
const MAX_TICKETMASTER_PAGES_PER_VENUE = 5;
```

- [ ] Add a Convex action such as `syncSelectedVenueEvents` that accepts `userId`, loads selected venues, fetches up to 5 pages per venue with `size=199`, calls the existing canonical upsert mutation, and returns per-venue summaries.

- [ ] Ensure the returned `inserted` count is the canonical inserted count from `upsertEventsFromTicketmaster` after dedupe, not the number of raw Ticketmaster events fetched.

- [ ] In the layout/header, call the sync action from the shared button and render a concise message or toast with per-venue new counts.

- [ ] Disable the sync button while syncing and when no selected venues exist.

## Task 5: Build Upcoming Shows

**Files:**
- Create: `src/app/concerts/upcoming/page.tsx`
- Create: `src/app/concerts/_components/upcoming-shows-list.tsx`
- Modify: `src/app/concerts/_utils/formatters.ts`

- [ ] In `upcoming/page.tsx`, compute today's local `YYYY-MM-DD` string on the client and pass it to `api.concerts.listUpcomingShows`.

- [ ] Add a `Show interested` toggle. Default it off.

- [ ] Render a list view ordered by date. Each row should show date, show name, venue name, status badge or label, and existing status actions.

- [ ] Empty states:
  - Owned only: "No upcoming ticketed shows."
  - Owned + interested: "No upcoming owned or interested shows."

## Task 6: Build New Shows

**Files:**
- Create: `src/app/concerts/new/page.tsx`
- Create: `src/app/concerts/_components/new-shows-list.tsx`
- Create: `src/app/concerts/_components/venue-multiselect.tsx`
- Modify: `src/app/concerts/_utils/types.ts`

- [ ] In `new/page.tsx`, query selected venues and `api.concerts.listNewShows`.

- [ ] Use `VenueMultiSelect` at the top of the page. Implement it with the existing `Combobox` in `multiple` mode, chips, and searchable venue labels. Do not use a native select or `DropdownMenu`.

- [ ] Add an `Input` for text search. Client-filter by event name, venue name, and attraction names.

- [ ] Keep the final rendered order date ascending after every venue/text/actioned filter.

- [ ] Default `includeActioned` to false. Add an explicit `Show actioned` toggle only if needed for recovery/review.

- [ ] When a `new` event is marked interested, owned, or ignored, optimistically remove it from the default view after the mutation succeeds.

## Task 7: Preserve Venue Management

**Files:**
- Modify: `src/app/concerts/new/page.tsx`
- Modify or keep: `src/app/concerts/_components/discover-venues-card.tsx`
- Modify or extract from old page: selected venue management UI

- [ ] Keep the current discover venues flow reachable from the New Shows tab, below the primary filters/list or inside a collapsible management section.

- [ ] Keep selected venue nickname editing and unselect behavior reachable.

- [ ] Do not add a separate Venue Settings tab in this implementation unless the user asks.

## Task 8: Verification

**Files:**
- All changed files above.

- [ ] Run typecheck:

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] Run a scoped Biome check on changed files:

```bash
pnpm exec biome check convex/schema.ts convex/concerts.ts convex/concertActions.ts src/app/concerts
```

Expected: exits 0 or reports only issues introduced by the current change, which must be fixed.

- [ ] Manual check in dev:

```bash
pnpm dev
```

Expected manual results:

- `/concerts` redirects to `/concerts/upcoming`.
- The shared header and tabs render on both concert tabs.
- Upcoming defaults to owned shows, sorted soonest first.
- Turning on `Show interested` includes interested shows without changing sort direction.
- New Shows defaults to unactioned `new` rows.
- Venue filter allows multiple selected venues and is not a dropdown.
- Text search narrows results while preserving date order.
- Header sync reports per-venue new canonical counts.
- Calendar feed copy remains available from the shared header.

## Open Assumptions And Blockers

- The dedupe worker must land before this implementation is finalized, because sync counts and status merges depend on canonical event IDs.
- "Actioned" means any user status other than `new`.
- "Max events" means bounded Ticketmaster pagination up to 5 pages of 199 events per selected venue.
- Client-side text filtering is acceptable for the first pass because the query set is bounded by selected venues, status, and upcoming date.
