# Concert Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Convex-backed concert tracker that saves selected Ticketmaster venues, syncs upcoming events for those venues, tracks user event statuses, and exposes a private subscribed iCalendar feed.

**Architecture:** Ticketmaster access happens in Convex actions, not through a Next.js proxy route. Convex stores canonical venues/events separately from per-user venue selections and event statuses. The Next app calls Convex actions for discovery/fetching and Convex mutations for persistence.

**Tech Stack:** Next.js App Router, React 19, Convex, TypeScript, Biome.

**Commit policy:** Do not commit unless explicitly requested.

---

## Implemented File Structure

- `convex/_utils/ticketmasterConcerts.ts`: Ticketmaster URL building, response normalization, venue extraction.
- `convex/concertActions.ts`: Convex actions for Ticketmaster discovery and per-venue event fetches.
- `convex/concerts.ts`: Convex queries/mutations for venue selection, event upsert, status updates, and calendar feed tokens.
- `convex/schema.ts`: concert venue/event/status/feed tables.
- `src/app/concerts/page.tsx`: persisted concert dashboard.
- `src/app/api/concerts/ical/route.ts`: private subscribed calendar feed.
- `src/app/api/concerts/_ical.ts`: iCalendar rendering helpers.
- `src/app/_components/site-header.tsx`: Concerts nav link.
- `src/middleware.ts`: protects `/concerts`.

## Execution Tasks

- [x] Add canonical venue/event schema and per-user overlay tables.
- [x] Add Convex DB functions for selected venues, event upserts, event statuses, and calendar feed tokens.
- [x] Move Ticketmaster discovery/sync into Convex actions.
- [x] Remove the Next.js Ticketmaster proxy route.
- [x] Wire `/concerts` to Convex actions and mutations.
- [x] Add private `.ics` feed route.
- [x] Protect `/concerts` with middleware.
- [x] Run focused verification.

## Runtime Requirement

Set `TICKETMASTER_API_KEY` in the Convex deployment environment, not only `.env.local`:

```bash
npx convex env set TICKETMASTER_API_KEY "<ticketmaster-api-key>"
```

The Next app no longer reads `TICKETMASTER_API_KEY` directly for concerts.
