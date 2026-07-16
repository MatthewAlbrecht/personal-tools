# Music Funnel: Sync detail expand + one-off sources

**Date:** 2026-07-16  
**Status:** Approved design  
**Ideas:**
- `docs/ideas/2026-07-10-expandable-timeline-sync-details.md`
- `docs/ideas/2026-07-10-one-off-playlist-sync-with-related-grouping.md`
- (Related, already shipped — not in scope:) `docs/ideas/2026-07-10-what-you-missed-reveals-sync-details.md` / missed banner + New chrome

## Goal

Let timeline sync rows show exactly which tracks a run added, and support one-shot playlist imports that still participate in encounters/repeats and group under a shared curator — without recurring cron or bulk sync.

## Architecture

Extend existing music-funnel tables and sync pipeline. No parallel import model.

1. **Timeline expand** — lazy query of encounters for a `sourceRunId`, ordered with that run’s repeats-playlist writes first.
2. **One-off sources** — `kind` on `musicFunnelSources`; sync once via a single-source path; then stay out of bulk/cron.

## Product behavior

### Timeline: hide empty runs

- Timeline lists only source runs with `newEncounters > 0`.
- Daily syncs that find nothing do not appear as rows.

### Timeline: expandable sync details

- Each visible source-run row can expand inline (click row or chevron).
- **Multiple rows may be open at once.**
- Expanded panel shows **only new encounters** for that `sourceRunId`.
- **Sort:** tracks this run wrote to the **repeats** destination playlist first (`musicFunnelPlaylistWrites` with `kind: "repeat"` and matching `sourceRunId`); remaining new encounters after. If A and B ever diverge, **playlist-write membership (A) wins**.
- Each track row: track name, primary artist, **small** album artwork when available.
- Repeat-write tracks get a subtle badge or section cue at the top of the list.
- Loading: spinner/skeleton inside the panel.
- Query failure: inline error in the panel (not a page toast).
- Mid-flight sync: show whatever encounters exist for that run (acceptable if the list is still growing).

### One-off sources

- Sources have `kind: "recurring" | "one_off"`.
- **All existing sources default to `recurring`** (migration / read default).
- **One-off means:** sync once when added, then never include in cron or bulk “sync all.” Still visible in history and source lists; still writes encounters and main/repeats playlists like a normal source.
- Create flow: upsert with `kind: "one_off"`, `isActive: true` → run **single-source** sync → on **success** set `isActive: false`. On **failure**, leave retryable (do not deactivate); toast + retry.
- Bulk/cron continue to use `activeOnly: true`. Additionally, bulk sync **skips** any source with `kind === "one_off"` even if somehow still active (guard).
- Same uniqueness as today: one source per `(userId, spotifyPlaylistId)`.

### Curator grouping (related one-offs)

- No separate series table. Related one-offs connect via shared **`curatorName`**.
- Source form curator field uses existing shadcn **`Combobox`** (`~/components/ui/combobox`):
  - Options = distinct `curatorName` values from the user’s sources.
  - Search/filter existing; if no match, offer **Create …** and use the typed value.
- UI may group or badge one-offs by curator so monthly playlists from the same person sit together.
- Recurring sources also use the Combobox (replace free-text curator where applicable).

### Missed banner

- **No change.** Louder “What you missed” + New chrome already shipped.

## Data model

### `musicFunnelSources`

Add:

```ts
kind: v.union(v.literal("recurring"), v.literal("one_off"))
```

- Required going forward; backfill/default existing docs to `"recurring"`.
- `isActive` remains the primary bulk-sync gate; one-offs are deactivated after successful first sync.

### Queries / mutations

- **`listSourceRunEncounters`** (name flexible): args `userId`, `sourceRunId`; returns new encounters for that run plus which track IDs have a repeats playlist write for that `sourceRunId`. Client (or query) sorts repeat-writes first.
- **`listDistinctCuratorNames`**: distinct `curatorName` for the user (or derive client-side from `listSources` — prefer server only if list is large; for personal scale, client derive is fine).
- **`upsertSource`**: accept `kind`; default `"recurring"` when omitted.
- **Single-source sync** entry point: sync API/lib already loops sources — add a path that syncs one `sourceId` (used by one-off create and retry). Reuse the same `syncSourcePlaylist` pipeline.

### Indexes

- Prefer existing `by_sourceId` / encounter indexes. If listing by `sourceRunId` needs an index, add `by_sourceRunId` on `musicFunnelTrackEncounters` (and optionally on writes) rather than scanning.

## UI surfaces

| Surface | Change |
|--------|--------|
| `MusicFunnelTimeline` | Filter `newEncounters > 0`; expandable rows; multi-open; detail list with art |
| Sources / config form | Kind toggle; curator Combobox; one-off create → sync → deactivate |
| Source list | One-off badge / curator grouping affordance |
| Missed banner | Unchanged |

## Error handling

| Case | Behavior |
|------|----------|
| Invalid playlist on one-off create | Fail clearly; no successful “completed” one-off left active without a sync |
| One-off sync failure | Keep source; toast; retry single-source sync |
| Expand query failure | Inline panel error |
| Duplicate Spotify playlist ID | Existing uniqueness — reject/upsert as today |

## Out of scope

- Changing “What you missed” banner behavior or visit cursor
- Cross-device visit persistence
- Auto-creating Spotify destination playlists
- Separate series entity beyond `curatorName`
- Promoting a completed one-off to recurring (future)
- Denormalizing full track lists onto `musicFunnelSourceRuns`

## Success criteria

- Expanding a timeline row shows that run’s new encounters with repeat-playlist writes on top and small album art.
- Timeline does not show runs with zero new encounters.
- Adding a one-off syncs once, then never runs on cron/bulk sync; encounters and playlist writes still work.
- Curator Combobox can select an existing curator or create a new one; related one-offs share that name.
- Existing sources behave as recurring without migration pain.
