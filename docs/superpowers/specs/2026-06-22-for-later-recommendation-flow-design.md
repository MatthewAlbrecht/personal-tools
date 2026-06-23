# For Later Album Recommendation Flow Product/Technical Spec

## Overview

Add a recommendation flow to `/for-later-albums` that helps choose what to listen to from the existing backlog. The flow opens from a page-level button in the for-later header/toolbar and appears in a right-side drawer. It asks one question at a time using button-style radio choices, lets the user jump to any question, and can produce recommendations at any point.

Recommendations are random picks from the full active for-later backlog after applying the answers selected in the drawer. The first version is a focused filtering-and-randomization tool, not a scored recommendation engine.

## Goals

- Add a page-level recommendation trigger to the for-later albums page.
- Open a right-side drawer that matches existing for-later drawer patterns.
- Ask one question at a time with radio choices rendered as buttons.
- Advance automatically after any single-choice answer.
- Let the user jump directly to any question at any time.
- Let the user request recommendations at any time, even with no answers selected.
- Support shuffling the visible genre and descriptor answer choices from values that actually appear in the user's for-later backlog.
- Recommend 1-5 albums, defaulting to 1.
- Choose recommendations randomly from the matching pool.

## Non-Goals

- No AI-generated scoring or explanation.
- No saved recommendation presets.
- No recommendation history.
- No changes to the main page's URL-backed filter behavior.
- No requirement that recommendations respect the current page filters.
- No new dedicated recommendation page.
- No row-level recommendation button in the first implementation.

## Existing Patterns To Match

The for-later albums page already uses:

- `src/app/for-later-albums/page.tsx` as the client route.
- `ForLaterHeader`, `ForLaterFilters`, `ForLaterList`, and `ForLaterRow` for page composition.
- `AlbumRatingDrawer` and `ForLaterRymAssociateDrawer` as right-side drawer patterns.
- `usePaginatedQuery(api.forLaterAlbums.listForLaterAlbumRows, ...)` for the main list.
- Button-group-style fieldsets in `ForLaterFilters` instead of a dedicated `RadioGroup`.
- RYM genre and descriptor filter keys denormalized on for-later items.

The recommendation drawer should reuse these conventions instead of introducing a new modal or page architecture.

## Product Behavior

### Entry Point

Add a `Recommend` button to the for-later page header/toolbar near the existing page actions. It should be available whenever the user is authenticated and the for-later page has enough context to query the backlog.

The button opens a right-side drawer. The drawer should not depend on an album row and should not inherit the current URL filters.

### Drawer Layout

The drawer contains:

- A concise title such as `Find something to listen to`.
- A step navigation row listing all questions.
- The active question body.
- A `Recommend now` action that remains available at every step.
- A compact summary of selected answers.
- Recommendation results after the user requests them.

Question navigation should behave like tabs or pills. Clicking a question label switches the active question without clearing answers.

### Question Order

Use this order:

1. Added timeframe
2. Genre
3. Release time
4. Descriptors
5. Rating
6. Number of recommendations

This starts broad and practical, then narrows by taste metadata, then applies listened/rating preferences, and ends with output size.

### Question Choices

All answer choices should look like actual buttons. Selecting a choice records that answer and advances to the next question, except for the final `# of recs` question where it can stay on the final step or show results if recommendations are already visible.

Added timeframe:

- `day`
- `week`
- `month`
- `2 months`
- `doesn't matter`

Genre:

- Show up to 10 random genre choices drawn from genres that actually appear on active for-later albums.
- Include a `Shuffle genres` button that replaces the visible choices with another random set.
- Include `doesn't matter`.

Release time:

- `new release`
- `recent`
- `modern`
- `old`
- `doesn't matter`

Descriptors:

- Show up to 10 random descriptor choices drawn from descriptors that actually appear on active for-later albums.
- Include a `Shuffle descriptors` button that replaces the visible choices with another random set.
- Include `doesn't matter`.

Rating:

- Filter to albums with listen/rating data only when a rating answer is selected.
- Include rating buckets that match the existing 1-15 rating system at an implementation-friendly level.
- Include `doesn't matter`.

Number of recommendations:

- `1`
- `2`
- `3`
- `4`
- `5`

Default: `1`.

### Recommendation Pool

The starting pool is all active for-later albums for the user, including listened albums and albums without RYM genre/descriptor data.

Exclude albums that are already excluded from normal for-later lists, such as removed rows and rows marked as singles. Preserve existing backlog exclusion semantics instead of inventing a separate eligibility model.

The current page filters do not affect recommendations. The drawer's answers are the only recommendation filters.

### Recommendation Selection

After applying selected answers, choose random albums from the matching pool.

If the matching pool has fewer albums than the selected recommendation count, return all matching albums and make the shortfall clear in the UI.

If no albums match, show a useful empty state and make it easy to loosen filters or request another shuffle of genre/descriptor choices.

## Filter Semantics

### Added Timeframe

Use the album's for-later added date. Prefer `playlistAddedAt`; fall back to `firstSeenAt`, then `createdAt`.

Interpret choices relative to the time the user requests recommendations. The timeframe buckets are mutually exclusive, so broader choices exclude the smaller previous buckets:

- `day`: added in the last 24 hours.
- `week`: added between 1 and 7 days ago, excluding the last 24 hours.
- `month`: added between 1 and 30 days ago, excluding the last 7 days.
- `2 months`: added between 1 and 60 days ago, excluding the last 30 days.
- `doesn't matter`: no added-date constraint.

Pass the current timestamp from the client or an action boundary. Do not call `Date.now()` inside a Convex query.

### Genre

Genre choices come from the user's active for-later backlog, not the global RYM taxonomy. Matching should use the same normalized genre keys used by existing for-later filters.

If an album has no genre keys, it can still be recommended when the genre answer is `doesn't matter`, but it should not match a specific genre answer.

### Release Time

Use release year derived from `spotifyAlbums.releaseDate` or the existing `releaseYear` row field.

Recommended buckets:

- `new release`: current year or previous year.
- `recent`: 2-5 years old.
- `modern`: 6-20 years old.
- `old`: more than 20 years old.
- `doesn't matter`: no release-year constraint.

These bucket labels are intentionally user-facing rather than exact date controls.

### Descriptors

Descriptor choices come from the user's active for-later backlog, not the global descriptor taxonomy. Matching should use the same normalized descriptor keys used by existing for-later filters.

If an album has no descriptor keys, it can still be recommended when the descriptor answer is `doesn't matter`, but it should not match a specific descriptor answer.

### Rating

Rating is optional and should only narrow to listened/rated albums when the user picks a rating bucket. `doesn't matter` leaves listened and unlistened albums in the pool.

Use the existing rating category names and avoid exposing raw 1-15 values as the primary UX. Do not include lower rating categories in this recommendation filter.

Rating choices:

- `Holy Moly`: ratings 13-15.
- `Really Enjoyed`: ratings 10-12.
- `Good`: ratings 7-9.
- `doesn't matter`.

Albums that have been listened to but do not have a rating should not match a specific rating bucket.

## Backend Design

Add dedicated Convex functions for recommendation-specific data instead of reusing the paginated list query.

### Choice Pool Query

Add a query that returns the current visible choices for genre and descriptor pools. The client passes a seed that changes when the user clicks a shuffle button, making the output deterministic for Convex while still feeling random in the UI.

Inputs:

- `userId`
- `genreSeed`
- `descriptorSeed`

Output:

- up to 10 genre options from active for-later album data
- up to 10 descriptor options from active for-later album data

The query should only use values actually present on the user's active for-later albums. If fewer than 10 exist, return fewer. The shuffle should not include duplicate choices in a single visible set.

### Recommendation Query

Add a dedicated query that accepts the drawer answers and returns seeded-random matching album rows. The client passes a new recommendation seed whenever the user clicks `Recommend now` or rerolls results.

Inputs:

- `userId`
- `addedTimeframe`
- `genreKey`
- `releaseTime`
- `descriptorKey`
- `ratingBucket`
- `count`
- `now`
- `seed`

Output:

- recommended album rows using the same row shape the existing list can render, or a recommendation-specific row shape that contains the fields needed by the recommendation result UI.
- total matching count if cheap enough to compute.
- whether the returned count is lower than requested.

Keep filtering and seeded random selection logic in testable TypeScript helpers. Do not introduce a Convex action just to call `Math.random()`.

### Performance Constraints

Do not use the paginated UI list query as the recommendation source. The existing list query is optimized for paginated display and has post-filter scan caps.

The recommendation function should filter on denormalized for-later projection fields where possible:

- active/excluded state
- added date fallback
- release year
- genre keys
- descriptor keys
- rating/listen data

If the first implementation needs a bounded collect because the personal dataset is small, document the cap and keep the filtering helper isolated so it can move to indexes later.

## Frontend Design

Add a recommendation drawer component under `src/app/for-later-albums/_components/`.

Suggested structure:

- `for-later-recommendation-drawer.tsx`
- `use-for-later-recommendation-drawer.ts`
- optional `_utils/recommendation-state.ts` for answer types, labels, and filter helpers shared by component tests.

The drawer should own local state for:

- open/closed state
- active question
- selected answers
- current genre options
- current descriptor options
- recommendation results
- loading/error state

The UI should make partial completion feel intentional. `Recommend now` should work before all questions are answered, with unanswered questions treated as `doesn't matter` and `count` defaulting to 1.

## Error Handling

- If the user has no active for-later albums, disable or empty-state the drawer with a clear message.
- If genre or descriptor pools are empty, show only `doesn't matter` for that question and explain that tags appear after RYM data is linked.
- If recommendation loading fails, keep the selected answers and show a retry action.
- If the filter combination returns no matches, show a no-results state with actions to clear answers or revisit specific questions.
- If fewer results are available than requested, show the available results without treating it as an error.

## Testing Strategy

Add focused tests for pure recommendation filtering and iCal-style route tests are not relevant here.

Recommended coverage:

- Added timeframe boundaries.
- Release time bucket boundaries.
- Rating bucket matching and exclusion of unrated listened albums from rating-specific buckets.
- Genre and descriptor matching against normalized keys.
- `doesn't matter` behavior for every question.
- Count clamping between 1 and 5.
- Random selection returns no duplicates and respects the requested count when enough matches exist.

If component testing is not available in the repo, keep UI verification manual and test the pure state/filter helpers with the existing test runner setup used by nearby utility tests.

## Acceptance Criteria

- `/for-later-albums` has a page-level `Recommend` button in the header/toolbar.
- Clicking `Recommend` opens a right-side drawer.
- The drawer shows one question at a time.
- Answer choices render as buttons and auto-advance after selection.
- The user can jump to any question through the step navigation.
- The user can request recommendations at any point.
- Unanswered questions behave as `doesn't matter`; recommendation count defaults to 1.
- Genre and descriptor questions show up to 10 random choices from the user's active for-later backlog.
- Genre and descriptor shuffle buttons replace the visible choices.
- Recommendations are random matching albums from the full active for-later backlog, independent of current page filters.
- Rating filters only match albums with ratings in the selected bucket.
- No-results, empty-pool, loading, and error states are handled clearly.

## Open Assumptions

- A right-side drawer is the approved container.
- The trigger is page-level, not row-level.
- Recommendations consider the full active for-later backlog by default.
- Listened and unlistened albums are eligible by default.
- Random selection is preferred over ranking or scoring.
- The first implementation uses only the existing `Holy Moly`, `Really Enjoyed`, and `Good` rating tiers instead of raw 1-15 rating choices or lower categories.
