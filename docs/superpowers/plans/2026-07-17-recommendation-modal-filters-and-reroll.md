# Recommendation Modal Filters & Re-roll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the for-later recommendation wizard with a flat form (dual-knob ranges, YearRangePicker, listened, multi-genre Any/All), then a results view with prose criteria, re-roll, and start over.

**Architecture:** Evolve `ForLaterRecommendationAnswers` and `candidateMatchesRecommendationAnswers` to range/list semantics; keep `createForLaterRecommendation` + seeded shuffle. Client rewrite of `for-later-recommendation-drawer.tsx` into View A (form) / View B (prose + results). Reuse `YearRangePicker` and shared `Slider`. Schema stores a union of legacy + new answers so existing draw rows still validate.

**Tech Stack:** Next.js 15, Convex, React, Tailwind, existing shadcn Dialog/Slider/Popover, `node:test` via `pnpm exec tsx --test`

**Spec:** `docs/superpowers/specs/2026-07-17-recommendation-modal-filters-and-reroll-design.md`

## Global Constraints

- Recommendations ignore page URL filters (drawer answers only)
- No saved presets UI (separate idea)
- Genre include-only; Any/All = OR/AND; no exclude
- Listened copy: **Any** · **Heard it** · **Not yet**
- Release year uses existing `YearRangePicker` (not a dual-knob)
- Full-span ranges / unset year / Any listened / empty genre chips = unconstrained
- Client passes `now` + `seed`; never `Date.now()` inside Convex queries
- Classic function declarations; `type` aliases; kebab-case filenames
- Env via `~/env.js` only if needed

### Pinned constants

```typescript
const ADDED_DAYS_MIN = 0;
const ADDED_DAYS_MAX = 365;
const DURATION_MINUTES_MIN = 0;
const DURATION_MINUTES_MAX = 120;
const RATING_MIN = 1;
const RATING_MAX = 15;
const DEFAULT_GENRE_BUTTON_LIMIT = 12;
```

### Pinned answers type (live path)

```typescript
type ListenedAnswer = "any" | "heard" | "not_yet";
type GenreMatchAnswer = "any" | "all";

type ForLaterRecommendationAnswers = {
	addedDaysMin: number;
	addedDaysMax: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMs: number;
	durationMaxMs: number;
	ratingMin: number;
	ratingMax: number;
	listened: ListenedAnswer;
	genreKeys: string[];
	genreMatch: GenreMatchAnswer;
	count: number;
};
```

Defaults: full added/duration/rating spans; no year bounds; `listened: "any"`; `genreKeys: []`; `genreMatch: "any"`; `count: 1`.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `convex/_utils/forLaterRecommendations.ts` | New answers type, range/listened/genre matchers, update `candidateMatchesRecommendationAnswers` |
| Modify | `convex/_utils/forLaterRecommendations.test.ts` | Replace/extend matcher tests for new semantics |
| Modify | `convex/schema.ts` | Union legacy + new `answers` on `forLaterAlbumRecommendations` |
| Modify | `convex/forLaterAlbums.ts` | Validators, normalize, candidate builders (`hasListened`), options query search, create/get |
| Modify | `src/app/for-later-albums/_utils/recommendation-state.ts` | Client answers, defaults, range helpers, prose builder |
| Modify | `src/app/for-later-albums/_utils/recommendation-state.test.ts` | Defaults + prose + constrained checks |
| Modify | `src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx` | Flat form + results prose / re-roll / start over |
| Modify | `docs/ideas/2026-07-17-recommendation-modal-filters-and-reroll.md` | `status: planned` + Notes link |

---

### Task 1: Matching helpers for new answers (TDD)

**Files:**
- Modify: `convex/_utils/forLaterRecommendations.ts`
- Modify: `convex/_utils/forLaterRecommendations.test.ts`

**Interfaces:**
- Consumes: `recommendationAddedAt`, `taxonomyKeysPassAgainstSet` from `./forLaterAlbumsUi` (or a tiny local OR/AND helper duplicated if import would cycle — prefer import)
- Produces:
  - Updated `ForLaterRecommendationAnswers` (pinned type above)
  - `ForLaterRecommendationCandidate` gains `hasListened?: boolean`
  - `isAddedDaysRangeUnconstrained(min, max): boolean`
  - `isDurationRangeUnconstrained(minMs, maxMs): boolean`
  - `isRatingRangeUnconstrained(min, max): boolean`
  - `addedDaysRangeMatches(candidate, min, max, now): boolean`
  - `yearRangeMatches(candidate, yearMin?, yearMax?): boolean`
  - `durationRangeMatches(filterDurationMs, minMs, maxMs): boolean`
  - `ratingRangeMatches(rating, min, max): boolean`
  - `listenedMatches(hasListened, listened): boolean`
  - `genreKeysMatch(filterGenreKeysSorted, genreKeys, genreMatch): boolean`
  - Updated `candidateMatchesRecommendationAnswers`
  - Keep old bucket matchers exported only if still needed by tests during transition; otherwise delete unused exports and fix tests in this task

- [ ] **Step 1: Write failing tests for range/listened/genre matchers**

Add (and remove obsolete bucket-era tests that target the old answers shape) in `convex/_utils/forLaterRecommendations.test.ts`:

```typescript
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const NOW = Date.UTC(2026, 5, 22);

function defaultAnswers(
	overrides: Partial<ForLaterRecommendationAnswers> = {},
): ForLaterRecommendationAnswers {
	return {
		addedDaysMin: 0,
		addedDaysMax: 365,
		durationMinMs: 0,
		durationMaxMs: 120 * MINUTE_MS,
		ratingMin: 1,
		ratingMax: 15,
		listened: "any",
		genreKeys: [],
		genreMatch: "any",
		count: 1,
		...overrides,
	};
}

test("full-span ranges and empty genres do not filter", () => {
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({
				playlistAddedAt: NOW - 10 * DAY_MS,
				releaseYear: 1999,
				filterDurationMs: 45 * MINUTE_MS,
				rating: undefined,
				hasListened: false,
				filterGenreKeysSorted: ["ambient"],
			}),
			defaultAnswers(),
			NOW,
		),
		true,
	);
});

test("addedDaysRangeMatches inclusive day-age window", () => {
	assert.equal(
		addedDaysRangeMatches(
			candidate({ playlistAddedAt: NOW - 3 * DAY_MS }),
			2,
			7,
			NOW,
		),
		true,
	);
	assert.equal(
		addedDaysRangeMatches(
			candidate({ playlistAddedAt: NOW - 1 * DAY_MS }),
			2,
			7,
			NOW,
		),
		false,
	);
});

test("yearRangeMatches respects min/max and missing year", () => {
	assert.equal(yearRangeMatches(candidate({ releaseYear: 1971 }), 1970, 1979), true);
	assert.equal(yearRangeMatches(candidate({ releaseYear: undefined }), 1970, 1979), false);
	assert.equal(yearRangeMatches(candidate({ releaseYear: 1980 }), undefined, undefined), true);
});

test("listenedMatches heard / not_yet / any", () => {
	assert.equal(listenedMatches(true, "heard"), true);
	assert.equal(listenedMatches(false, "heard"), false);
	assert.equal(listenedMatches(false, "not_yet"), true);
	assert.equal(listenedMatches(true, "not_yet"), false);
	assert.equal(listenedMatches(false, "any"), true);
});

test("genreKeysMatch OR and AND against filterGenreKeysSorted", () => {
	const keys = ["ambient", "electronic", "drone"];
	assert.equal(genreKeysMatch(keys, ["ambient", "jazz"], "any"), true);
	assert.equal(genreKeysMatch(keys, ["ambient", "jazz"], "all"), false);
	assert.equal(genreKeysMatch(keys, ["ambient", "drone"], "all"), true);
	assert.equal(genreKeysMatch(keys, [], "all"), true);
});

test("constrained rating excludes unrated; listened independent", () => {
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ rating: undefined, hasListened: true }),
			defaultAnswers({ ratingMin: 10, ratingMax: 15 }),
			NOW,
		),
		false,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ rating: 12, hasListened: true }),
			defaultAnswers({ ratingMin: 10, ratingMax: 15, listened: "heard" }),
			NOW,
		),
		true,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ rating: undefined, hasListened: false }),
			defaultAnswers({ ratingMin: 10, ratingMax: 15, listened: "not_yet" }),
			NOW,
		),
		false,
	);
});
```

Update `candidate()` helper to include `hasListened: false` by default.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test convex/_utils/forLaterRecommendations.test.ts`  
Expected: FAIL — missing exports / old type mismatches

- [ ] **Step 3: Implement helpers + rewrite `candidateMatchesRecommendationAnswers`**

In `convex/_utils/forLaterRecommendations.ts`:

- Replace `ForLaterRecommendationAnswers` with the pinned type.
- Add `hasListened?: boolean` on the candidate.
- Implement unconstrained checks: added full span `0–365`; duration `0–120min` in ms; rating `1–15`.
- `addedDaysRangeMatches`: ageDays = floor((now - addedAt) / DAY_MS); require `min <= ageDays <= max` when constrained; future dates fail when constrained.
- `yearRangeMatches`: if both unset, true; if year missing, false when constrained; else inclusive bounds.
- `durationRangeMatches`: missing duration fails when constrained; else inclusive ms bounds.
- `ratingRangeMatches`: if unconstrained, true; else rating defined and in inclusive range.
- `listenedMatches` as above; treat `hasListened === undefined` as `false`.
- `genreKeysMatch`: empty `genreKeys` → true; else Any = some selected key ∈ album keys; All = every selected key ∈ album keys (album keys already include ancestors via projection).
- `candidateMatchesRecommendationAnswers`: exclusions → added → year → duration → rating → listened → genre.

Remove live use of `addedTimeframeMatches` / `releaseTimeMatches` / `ratingTierMatches` / duration bucket answers from `candidateMatchesRecommendationAnswers`. Delete dead types/exports only after tests no longer reference them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test convex/_utils/forLaterRecommendations.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/forLaterRecommendations.ts convex/_utils/forLaterRecommendations.test.ts
git commit -m "$(cat <<'EOF'
refactor: recommendation matching uses ranges and listened filter

EOF
)"
```

---

### Task 2: Schema, validators, Convex create/options path

**Files:**
- Modify: `convex/schema.ts` (`forLaterAlbumRecommendations.answers`)
- Modify: `convex/forLaterAlbums.ts` (validators, normalize, candidates, options query, create/get)

**Interfaces:**
- Consumes: new `ForLaterRecommendationAnswers` + matchers from Task 1
- Produces:
  - `recommendationAnswersValidator` matching pinned type
  - Schema `answers: v.union(legacyAnswersValidator, recommendationAnswersValidator)`
  - `normalizeRecommendationAnswers` for new shape
  - `recommendationCandidateFromItem` / `FromRow` set `hasListened` from `filterHasListened` / `row.hasListened`
  - `listForLaterRecommendationOptions` args: `{ userId, search?: string }` → `{ genres, /* durations optional/unused */ }` flat search over backlog genre keys (top by count when search empty, limit `DEFAULT_GENRE_BUTTON_LIMIT`)

- [ ] **Step 1: Update schema answers to union**

In `convex/schema.ts`, extract current answers object as legacy, add new object:

```typescript
answers: v.union(
  v.object({ /* existing legacy fields unchanged */ }),
  v.object({
    addedDaysMin: v.number(),
    addedDaysMax: v.number(),
    yearMin: v.optional(v.number()),
    yearMax: v.optional(v.number()),
    durationMinMs: v.number(),
    durationMaxMs: v.number(),
    ratingMin: v.number(),
    ratingMax: v.number(),
    listened: v.union(
      v.literal("any"),
      v.literal("heard"),
      v.literal("not_yet"),
    ),
    genreKeys: v.array(v.string()),
    genreMatch: v.union(v.literal("any"), v.literal("all")),
    count: v.number(),
  }),
),
```

- [ ] **Step 2: Replace `recommendationAnswersValidator` + normalize**

In `convex/forLaterAlbums.ts`:

```typescript
const recommendationAnswersValidator = v.object({
	addedDaysMin: v.number(),
	addedDaysMax: v.number(),
	yearMin: v.optional(v.number()),
	yearMax: v.optional(v.number()),
	durationMinMs: v.number(),
	durationMaxMs: v.number(),
	ratingMin: v.number(),
	ratingMax: v.number(),
	listened: v.union(
		v.literal("any"),
		v.literal("heard"),
		v.literal("not_yet"),
	),
	genreKeys: v.array(v.string()),
	genreMatch: v.union(v.literal("any"), v.literal("all")),
	count: v.number(),
});
```

Rewrite `normalizeRecommendationAnswers` to clamp count, clamp/swap inverted ranges, trim genre keys, default `genreMatch` to `"any"`.

Update `createForLaterRecommendation` / `getForLaterRecommendations` to pass normalized new answers through (remove casts to old enums).

- [ ] **Step 3: Candidate builders + cheap filter**

Set `hasListened` on both candidate builders.

In `collectForLaterRecommendationCandidates`, cheap prefilter should use answers with rating unconstrained (`ratingMin: 1`, `ratingMax: 15`) so listened/genre/year/duration/added can filter before hydrate; full answers apply after hydrate (rating needs row).

- [ ] **Step 4: Genre options with search**

Change `listForLaterRecommendationOptions`:

```typescript
args: {
  userId: v.string(),
  search: v.optional(v.string()),
},
returns: v.object({
  genres: v.array(recommendationOptionValidator),
}),
```

When `search` empty: top `DEFAULT_GENRE_BUTTON_LIMIT` by count across `filterGenreKeysSorted` (all keys, not only top-level).  
When `search` present: filter labels/keys by case-insensitive includes, sort by count, same limit.  
Drop `parentGenreKey` / durations from this query return (duration is a slider now). Update any callers.

- [ ] **Step 5: Typecheck Convex surface**

Run: `pnpm typecheck`  
Expected: PASS (or only unrelated pre-existing errors — fix any you introduced)

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/forLaterAlbums.ts
git commit -m "$(cat <<'EOF'
feat: accept range-based for-later recommendation answers

EOF
)"
```

---

### Task 3: Client recommendation-state + prose builder (TDD)

**Files:**
- Modify: `src/app/for-later-albums/_utils/recommendation-state.ts`
- Modify: `src/app/for-later-albums/_utils/recommendation-state.test.ts`

**Interfaces:**
- Produces:
  - Mirror `RecommendationAnswers` = pinned type (client)
  - `createDefaultRecommendationAnswers()`
  - `ADDED_DAYS_MIN/MAX`, `DURATION_MINUTES_MIN/MAX`, `RATING_MIN/MAX` constants (minutes for UI; convert to ms when calling Convex)
  - `answersToMutationPayload(answers)` → Convex answers (`duration*Ms`, etc.)
  - `is*Constrained` helpers mirroring backend full-span rules
  - `buildRecommendationProseClauses(answers, { genreLabelsByKey }): Array<{ id: RecommendationFormFieldId; text: string }>`
  - `RecommendationFormFieldId = "added" | "year" | "duration" | "rating" | "listened" | "genre" | "count"`
  - Remove wizard exports: `QUESTION_ORDER`, `nextRecommendationQuestion`, old option lists no longer used

Prose examples (exact wording can match these):

- year both set equal: `was released in 2026`
- year range: `was released between 2020 and 2024`
- genres Any: `is electronic or ambient`
- genres All: `is electronic and ambient`
- listened not_yet: `I haven't heard yet`
- listened heard: `I've already heard`
- duration max-only feel when min at floor: `runs up to 40 minutes` / if both knobs moved: `runs 20–40 minutes`
- added: `was added 2–14 days ago`
- rating: `is rated 10–15`
- count is not a prose clause (footer only)

Omit unconstrained fields. Lead with `Selecting an album that` only in the UI wrapper, not inside each clause.

- [ ] **Step 1: Write failing tests**

Replace obsolete wizard tests in `recommendation-state.test.ts` with:

```typescript
test("createDefaultRecommendationAnswers uses full spans and any listened", () => {
	const answers = createDefaultRecommendationAnswers();
	assert.equal(answers.addedDaysMin, 0);
	assert.equal(answers.addedDaysMax, 365);
	assert.equal(answers.listened, "any");
	assert.deepEqual(answers.genreKeys, []);
	assert.equal(answers.count, 1);
});

test("buildRecommendationProseClauses omits unconstrained fields", () => {
	assert.deepEqual(
		buildRecommendationProseClauses(createDefaultRecommendationAnswers(), {
			genreLabelsByKey: {},
		}),
		[],
	);
});

test("buildRecommendationProseClauses describes constrained fields", () => {
	const clauses = buildRecommendationProseClauses(
		{
			...createDefaultRecommendationAnswers(),
			yearMin: 2020,
			yearMax: 2024,
			genreKeys: ["electronic", "ambient"],
			genreMatch: "any",
			listened: "not_yet",
			durationMinMs: 0,
			durationMaxMs: 40 * 60 * 1000,
			ratingMin: 1,
			ratingMax: 15,
		},
		{
			genreLabelsByKey: {
				electronic: "Electronic",
				ambient: "Ambient",
			},
		},
	);
	assert.equal(clauses.some((c) => c.id === "year"), true);
	assert.equal(clauses.some((c) => c.id === "genre"), true);
	assert.equal(clauses.some((c) => c.id === "listened"), true);
	assert.equal(clauses.some((c) => c.id === "duration"), true);
	assert.equal(clauses.some((c) => c.id === "rating"), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/app/for-later-albums/_utils/recommendation-state.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `recommendation-state.ts`**

Rewrite the module to the interfaces above. Export `answersToMutationPayload` converting UI minutes sliders into ms if the client state stores minutes — pick **one** representation and stick to it (prefer storing ms in answers to match Convex; sliders convert minutes ↔ ms at the control boundary).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test src/app/for-later-albums/_utils/recommendation-state.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/for-later-albums/_utils/recommendation-state.ts src/app/for-later-albums/_utils/recommendation-state.test.ts
git commit -m "$(cat <<'EOF'
feat: recommendation client state and prose clauses

EOF
)"
```

---

### Task 4: Flat form UI (View A)

**Files:**
- Modify: `src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx`

**Interfaces:**
- Consumes: `createDefaultRecommendationAnswers`, `answersToMutationPayload`, range constants, `YearRangePicker`, `Slider`, `listForLaterRecommendationOptions` with `search`
- Produces: View A form; `Recommend` calls `createForLaterRecommendation` with payload + `now` + new seed; on success switches to View B state

- [ ] **Step 1: Replace wizard body with flat form**

Remove `StepNavigation`, `furthestQuestionIndex`, auto-advance, top-level genre drill state.

Form sections with stable `id`s / `data-field` attributes matching `RecommendationFormFieldId` for scroll-into-view:

1. Added — `Slider` `min={0}` `max={365}` dual value `[addedDaysMin, addedDaysMax]`
2. Release — `<YearRangePicker yearMin={...} yearMax={...} onCommit={...} />`
3. Duration — Slider 0–120 minutes (convert to ms in answers)
4. Rating — Slider 1–15
5. Listened — three `ChoiceButton`s: Any / Heard it / Not yet
6. Genre — search `Input`; Any/All toggle when `genreKeys.length > 0`; removable chips; button grid from query; click adds key if not present, clears search
7. Count — 1–5 buttons

Footer when in form mode: **Recommend** (disabled while recommending or if options prove empty backlog — if options query returns zero genres **and** you can detect zero albums, disable; otherwise allow recommend and rely on empty results).

- [ ] **Step 2: Wire mutation**

```typescript
const result = await createRecommendation({
	userId,
	answers: answersToMutationPayload(answers),
	now: Date.now(),
	seed: createClientSeed(),
});
```

Keep loading/error state. Do not reset answers on success.

- [ ] **Step 3: Manual smoke**

Run: `pnpm dev` → open `/for-later-albums` → Recommend  
Expected: flat form visible; YearRangePicker works; genre search filters buttons; Recommend returns results (Task 5 may still show old results chrome — OK if prose missing until Task 5)

- [ ] **Step 4: Commit**

```bash
git add src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx
git commit -m "$(cat <<'EOF'
feat: flat recommendation form with ranges and genre chips

EOF
)"
```

---

### Task 5: Results prose, edit pens, re-roll, start over (View B)

**Files:**
- Modify: `src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx`

**Interfaces:**
- Consumes: `buildRecommendationProseClauses`
- Produces: View B with prose + pens + **Re-roll** + **Start over**

- [ ] **Step 1: Prose summary UI**

When `recommendationResult || isRecommending || recommendationError`:

```tsx
<p className="text-sm leading-relaxed">
	<span>Selecting an album that </span>
	{clauses.map((clause, index) => (
		<span key={clause.id} className="group/clause relative inline">
			{index > 0 ? <span>, </span> : null}
			{clause.text}
			<button
				type="button"
				className="ml-1 inline-flex opacity-0 transition-opacity group-hover/clause:opacity-100"
				aria-label={`Edit ${clause.id}`}
				onClick={() => handleEditClause(clause.id)}
			>
				{/* Pencil icon from lucide-react */}
			</button>
		</span>
	))}
	<span>.</span>
</p>
```

If `clauses.length === 0`, use: `Selecting an album from your For Later list.`

- [ ] **Step 2: Edit pen → form focus**

`handleEditClause(fieldId)`:

1. Clear result/error (keep answers)
2. Set view to form
3. `requestAnimationFrame` → `document.querySelector(`[data-field="${fieldId}"]`)?.scrollIntoView({ block: "center" })`

- [ ] **Step 3: Footer actions**

Replace **Another recommendation** with:

- **Re-roll** — `handleRecommendNow(answers)` with new seed; do not reset answers
- **Start over** — `resetRecommendationState()` (defaults + form view)

While loading, disable both.

- [ ] **Step 4: Manual verify**

- Recommend with filters → prose mentions only constrained fields  
- Hover pen → form scrolls to field; answers preserved  
- Re-roll → new albums, same filters  
- Start over → defaults + form  
- Close dialog → full reset  

- [ ] **Step 5: Commit**

```bash
git add src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx
git commit -m "$(cat <<'EOF'
feat: recommendation results prose, re-roll, and start over

EOF
)"
```

---

### Task 6: Cleanup, idea status, verification

**Files:**
- Modify: any leftover imports / dead helpers from Tasks 1–5
- Modify: `docs/ideas/2026-07-17-recommendation-modal-filters-and-reroll.md`

- [ ] **Step 1: Grep for dead wizard symbols**

Run: `rg "QUESTION_ORDER|nextRecommendationQuestion|addedTimeframe|releaseTime|ratingTier|parentGenreKey|Another recommendation" src/app/for-later-albums convex -g '!*.md'`  
Expected: no live references (tests for removed APIs gone)

- [ ] **Step 2: Run focused tests + typecheck**

```bash
pnpm exec tsx --test convex/_utils/forLaterRecommendations.test.ts src/app/for-later-albums/_utils/recommendation-state.test.ts
pnpm typecheck
pnpm check
```

Expected: PASS

- [ ] **Step 3: Mark idea planned**

In `docs/ideas/2026-07-17-recommendation-modal-filters-and-reroll.md`:

- Set `status: planned`
- Add Notes bullet:  
  `Planned — spec: \`docs/superpowers/specs/2026-07-17-recommendation-modal-filters-and-reroll-design.md\`, plan: \`docs/superpowers/plans/2026-07-17-recommendation-modal-filters-and-reroll.md\``

- [ ] **Step 4: Commit**

```bash
git add docs/ideas/2026-07-17-recommendation-modal-filters-and-reroll.md
git commit -m "$(cat <<'EOF'
docs: mark recommendation modal idea as planned

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Flat form, no wizard | 4 |
| Dual knobs added/duration/rating | 4 (+ helpers 1, 3) |
| YearRangePicker for release | 4 |
| Listened Any / Heard it / Not yet | 1, 3, 4 |
| Genre search + chips + Any/All, no exclude | 2, 4 |
| Prose + edit pens | 3, 5 |
| Re-roll same filters | 5 |
| Start over | 5 |
| Independent of URL filters | unchanged path; 2/4 |
| Unit tests ranges/listened/genre/prose | 1, 3 |
| No saved presets | out of scope (all tasks) |
| Schema tolerant of legacy draws | 2 |

## Self-review notes

- No TBD placeholders left for required behavior; open copy polish allowed inside prose strings in Task 3/5.
- Types aligned on pinned `ForLaterRecommendationAnswers` across Convex + client.
- Legacy answers remain readable in DB via schema union; mutation writes only new shape.
