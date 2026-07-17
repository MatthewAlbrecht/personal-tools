# Recommendation modal: flat form, ranges, listened filter, re-roll

**Date:** 2026-07-17  
**Status:** Approved design  
**Idea:** `docs/ideas/2026-07-17-recommendation-modal-filters-and-reroll.md`

## Overview

Redesign the for-later recommendation dialog from a one-question-at-a-time wizard into a single flat form, then a results view with a prose criteria summary, re-roll, and start over. Numeric filters become dual-knob ranges (except release year, which reuses the existing for-later `YearRangePicker`). Genre becomes multi-include with Any/All (OR/AND) matching. A listened filter is added with copy: **Any** · **Heard it** · **Not yet**.

This pass does **not** include saved recommendation presets (separate open idea: `docs/ideas/2026-07-17-save-recommendation-presets-for-quick-rerun.md`).

## Goals

- Show all recommendation controls at once (no wizard / step navigation).
- Dual-knob ranges for added timeframe, duration, and rating.
- Reuse `YearRangePicker` for release year (same control as for-later page filters).
- Add listened filter: Any / Heard it / Not yet.
- Genre: search-filtered button grid → include chips; Any/All match mode; no exclude.
- After recommend: prose summary of constrained criteria + results; hover edit pens return to the form focused on that field.
- Re-roll: same answers and count, new random draw.
- Start over: clear answers and return to the form.
- Keep recommendations independent of page URL filters.
- Keep seeded random selection and existing result card presentation.

## Non-Goals

- Saved presets / named criteria for later reuse (harvested separately).
- Genre exclude.
- Wizard / step navigation (remove).
- AI scoring or ranked recommendations.
- Changing main for-later list filter UX beyond reusing `YearRangePicker` as a component.
- Syncing recommendation answers to URL query params.

## Current State

- Entry: Recommend button on `/for-later-albums` opens `ForLaterRecommendationDrawer` (Dialog).
- UI is a step wizard (`QUESTION_ORDER`) with auto-advance after answers.
- Answers today: added timeframe buckets, single genre (top-level → subgenre drill), release era buckets, duration buckets, rating tiers, count 1–5.
- Footer: **Recommend now**; after results, **Another recommendation** resets all state.
- Backend: `createForLaterRecommendation` mutation + `candidateMatchesRecommendationAnswers` helpers; may persist draw rows to `forLaterAlbumRecommendations` (history of draws — not the same as user-named presets).

## Product Behavior

### View A — Flat form

Single scrollable form inside the existing dialog shell.

Controls (top to bottom, approximate):

1. **Added** — dual-knob range in days ago (e.g. 0 … N). Full span = unconstrained.
2. **Release year** — `YearRangePicker` (`yearMin` / `yearMax`). Empty / “Any year” = unconstrained.
3. **Duration** — dual-knob range in minutes (mapped to ms for matching). Full span = unconstrained.
4. **Rating** — dual-knob range on the 1–15 scale. Full span = unconstrained.
5. **Listened** — three choices: **Any** · **Heard it** · **Not yet**.
6. **Genre** — search input above a button grid of genres from the user’s active for-later backlog; selecting a genre adds an include chip and clears search / restores default visible buttons. Selected chips are removable. **Any / All** toggles match mode for the selected set (OR / AND). With zero chips, genre is unconstrained (ignore match mode).
7. **# of recs** — 1–5 buttons; default 1.

Primary action: **Recommend**.

### View B — Results

Shown after a successful recommend request (and while loading / on error for that request).

- **Prose summary** of constrained criteria only, in coherent sentences/clauses, e.g.  
  *Selecting an album that was released in 2020–2024, is electronic or ambient, I haven’t heard yet, runs under 40 minutes…*
- Each clause has a **hover-revealed edit pen** that switches back to View A with that control focused/scrolled into view. Answers are preserved.
- Result cards remain as today (cover, title/artist, year, listened, RYM, rating, Spotify link, tags).
- Footer:
  - **Re-roll** — same answers + count, new client seed; replace results.
  - **Start over** — reset to default answers; return to View A.
- Closing the dialog still resets state (same as today).

### Genre UX details

- Include-only (no exclude popover).
- Search narrows which buttons are shown; empty search shows a default set (implementation may keep “top by count” or similar — preserve “quick” feel).
- Multi-select chips; match mode **Any** = album matches if it has any selected genre key (including hierarchy rules already used for for-later genre matching where applicable); **All** = album must match every selected genre key.
- Do not require the top-level → subgenre two-step for this dialog.

### Range semantics

| Control | Constrained when | Unconstrained when |
|--------|------------------|--------------------|
| Added | Either knob not at full default span | Full span |
| Release year | `yearMin` and/or `yearMax` set | Both unset (“Any year”) |
| Duration | Either knob not at full default span | Full span |
| Rating | Either knob not at full 1–15 span | Full 1–15 span |
| Listened | Heard it / Not yet | Any |
| Genre | One or more chips | No chips |

Concrete default min/max for added days and duration minutes should be chosen in implementation from backlog bounds or sensible caps (document in plan); full span must mean “no filter.”

### Listened vs rating

- Listened filter and rating range are independent.
- If rating is constrained, only albums with a numeric rating in `[ratingMin, ratingMax]` match.
- Unlistened albums never have a rating, so a constrained rating range + **Not yet** yields an empty pool (valid; show no-match empty state).
- **Heard it** without a rating constraint includes listened albums regardless of whether they have a rating.

### Matching pool

Unchanged intent: full active for-later backlog for the user, independent of page URL filters. Preserve existing exclusion semantics (removed, singles, etc.).

### Selection

Seeded random draw of `count` albums from the matching pool. Shortfall and zero-match UX as today (clear messaging; not an error).

## Answers Model

Live form answers (client + mutation input) become range/list oriented:

```ts
type RecommendationAnswers = {
  addedDaysMin: number;
  addedDaysMax: number;
  yearMin?: number;
  yearMax?: number;
  durationMinMs: number;
  durationMaxMs: number;
  ratingMin: number; // always 1–15; unconstrained iff min===1 && max===15
  ratingMax: number;
  listened: "any" | "heard" | "not_yet";
  genreKeys: string[];
  genreMatch: "any" | "all";
  count: number; // 1–5
};
```

Remove from the **live** form path: `addedTimeframe`, single `genreKey`, `releaseTime` era, `ratingTier`, `durationBucket` / `durationTier`, `descriptorKey` (descriptors remain out of this dialog unless already unused).

Legacy fields on previously stored `forLaterAlbumRecommendations` documents may still exist; this design does not require a migration UI. New draws write the new answers shape (validator update). If old rows must remain readable elsewhere, keep a tolerant reader — out of scope unless something already depends on them.

## Backend

- Update `recommendationAnswersValidator` and `ForLaterRecommendationAnswers` / `candidateMatchesRecommendationAnswers` for the new fields.
- Update `createForLaterRecommendation` (and any preview query if kept) to accept the new answers; client still passes `now` and `seed` (no `Date.now()` inside queries).
- Genre options: support optional search string over genres present on active for-later items; return a flat list suitable for the button grid (counts optional but useful). Drop required `parentGenreKey` drill for this UI path (may leave unused args temporarily if cheaper).
- Pure helpers stay unit-tested: range bounds, listened, genre Any/All, full-span = unconstrained, count clamp, seeded selection.

## Frontend

- Rewrite `for-later-recommendation-drawer.tsx` around View A / View B; remove step navigation and auto-advance.
- Reuse `YearRangePicker` from for-later components.
- Use existing shadcn/radix `Slider` in dual-thumb mode for added / duration / rating.
- Add prose builder helper (answers → clauses) with stable clause ids for edit pens.
- Keep `use-for-later-recommendation-drawer` as open/close only unless more state belongs in the hook.

## Error / Empty Handling

- No active for-later albums: empty form message; Recommend disabled.
- Genre search with no hits: empty button area; chips unchanged.
- Load/create failure: keep answers; show error on results view; Re-roll retries.
- Zero matches: prose + empty message; Re-roll and edit pens available.
- Fewer than requested: show available rows + shortfall notice (as today).

## Testing

Unit tests for:

- Full-span ranges do not filter.
- Added / duration / rating / year bound matching.
- Listened Any / Heard it / Not yet.
- Genre OR vs AND with multiple keys.
- Constrained rating excludes unlistened.
- Prose builder omits unconstrained clauses and covers constrained ones.
- Count clamp 1–5; seeded selection uniqueness / count.

Manual: form layout, YearRangePicker, genre search/chips, results prose + pens, Re-roll, Start over, dialog close reset.

## Acceptance Criteria

- Dialog opens to a flat form with all controls visible.
- Added, duration, and rating use dual-knob ranges; release year uses `YearRangePicker`.
- Listened uses Any / Heard it / Not yet.
- Genre supports search, include chips, and Any/All match mode without exclude.
- Recommend shows prose (constrained fields only) + results.
- Edit pens return to the form focused on the relevant control with answers preserved.
- Re-roll keeps filters and count; Start over clears and returns to the form.
- Recommendations ignore page URL filters.
- Helpers covered by unit tests as listed above.

## Open Implementation Choices (defer to plan)

- Exact default max for “added days” and duration minutes (from data vs fixed caps).
- Default visible genre buttons when search is empty (e.g. top N by count).
- Whether genre matching reuses page-filter hierarchy expansion for selected keys.
- Exact prose wording per clause (copy polish during implementation).
