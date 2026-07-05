# Zine Inside Back Cover Sections Design

**Goal:** Add an optional inside-back-cover page (the page that faces the back cover when the booklet is closed) with composable content sections. v1 ships two section types — **Discography** and **If you liked this album** — on both album and playlist lyric zines.

## Background

Zine page order today:

```text
cover → [intro] → songs → [blank padding] → back cover
```

Saddle-stitch imposition places the page immediately before `back-cover` on the inside of the back cover spread. That slot is currently filled by blank padding pages when the song count does not land on a sheet boundary.

Users want that inside-back slot to carry curated album context: a compact discography list and/or “if you liked this, check out…” recommendations — without wasting print space.

## Clarifying Questions (defaults assumed below)

Answer these before implementation if any default is wrong:

1. **Section stacking:** Should discography and recommendations both appear on the *same* inside-back page when configured, or is it one section type per zine? **Assumed:** both can stack on one page, in user-defined order.
2. **Album art for section items:** Manual image URL only, or Spotify album picker in v1? **Assumed:** manual URL + title/artist/year text fields in v1; Spotify picker deferred.
3. **Discography scope on album zines:** Same artist’s other releases, or arbitrary albums? **Assumed:** arbitrary — user enters whatever albums they want.
4. **Edit UX:** Content edited on the main `/edit` page only (like intro content), or also inline on the private zine view? **Assumed:** edit page for content; private zine shows read-only preview with empty-state placeholder when editing an empty page.
5. **Playlist intro parity:** Album zines already have an intro page; playlist zines do not. This feature applies to both lyric types but does not add playlist intro pages. **Confirmed by user request.**

## Page Order

When at least one section has content (or private edit preview when empty), page order becomes:

```text
cover → [intro] → songs → inside-back → [blank padding] → back cover
```

`inside-back` is always inserted **immediately before** `back-cover`. Existing blank-page padding logic is unchanged: total page count remains divisible by four; blanks insert before `back-cover`, after `inside-back` when present.

### Visibility rules

| Context | Show inside-back page when |
|---------|---------------------------|
| Public zine | At least one section has ≥1 item with a non-empty title |
| Private zine (edit) | Always when user has opened zine from edit flow, including empty placeholder |

Omit the page entirely on public views when all sections are empty or all items lack titles.

## Section Model (extensible)

Store an ordered array of sections. Each section has a `type` discriminator so future section kinds can be added without schema migration beyond validator union expansion.

```typescript
type ZineInsideBackSection =
  | ZineDiscographySection
  | ZineRecommendationsSection;

type ZineDiscographySection = {
  type: "discography";
  title?: string; // default render: "Discography"
  items: ZineDiscographyItem[];
};

type ZineDiscographyItem = {
  albumTitle: string;
  artistName?: string;
  year?: string;
  imageUrl?: string;
  blurb: string; // one sentence
};

type ZineRecommendationsSection = {
  type: "recommendations";
  title?: string; // default render: "If you liked this album, check out"
  items: ZineRecommendationItem[];
};

type ZineRecommendationItem = {
  albumTitle: string;
  artistName: string;
  imageUrl?: string;
  similarityBlurb?: string; // short note on shared vibe
};
```

### Limits (space-conscious)

Soft caps enforced in the edit UI (not hard server rejects):

| Section | Max items | Blurb guidance |
|---------|-----------|----------------|
| Discography | 6 | ~120 chars; single sentence |
| Recommendations | 4 | ~80 chars similarity blurb |

When item count exceeds what fits at default sizing, the renderer applies progressive compaction (smaller art, tighter line-height) before clipping with a dev-only overflow warning in private edit mode. Print must never spill outside the page margin box.

## Rendering

New `ZineInsideBackPage` component in `src/components/zine/`.

### Layout — Discography section

Compact horizontal rows, stacked vertically:

```text
[Section title — optional, small caps or semibold 9pt]

[0.55in art]  Album Title (Year)
              Artist Name
              One-sentence blurb in muted smaller type

[0.55in art]  ...
```

- Art: square, `object-fit: cover`, rounded corners matching zine aesthetic
- Text column: album title + year on one line; artist below; blurb below that
- Row gap: ~6pt; section bottom margin before next section: ~10pt

### Layout — Recommendations section

Vertical list, slightly more breathing room than discography:

```text
[Section title — optional]

[0.65in art]  Album Title
              Artist Name
              Optional similarity blurb (italic, smaller)

[0.65in art]  ...
```

- Items separated by a hairline rule or 8pt gap (match existing zine divider patterns if any)
- Omit similarity line when empty

### Shared page chrome

- Uses standard zine page dimensions (`ZINE_PAGE`: 5.5×8.5in, 0.35in margin)
- Content top-aligned; no vertical centering (maximize usable space)
- Section titles: 9pt semibold, letter-spacing consistent with song section labels
- Print styles in `zine-print-styles.tsx` mirror screen preview

### Empty / placeholder (private edit)

When page is shown but all sections empty:

```text
Inside back cover — add sections on the edit page.
```

## Data & Persistence

### Schema

Add to **both** `geniusAlbums` and `playlistLyrics`:

```typescript
zineInsideBackSections: v.optional(v.array(zineInsideBackSectionValidator))
```

Define `zineInsideBackSectionValidator` in `convex/_utils/` (or colocated with other zine validators) and reuse in both tables.

No per-section layout sliders in v1 — fixed compact layout constants in CSS. Layout tuning can follow the intro-page pattern in a later iteration if needed.

### Mutations

| Source | Mutation | Notes |
|--------|----------|-------|
| Album | Extend `updateAlbumOverrides` | Accept optional `zineInsideBackSections` |
| Playlist | New or extend existing playlist metadata mutation | Same shape as album |

Validate:

- Array length ≤ 4 sections total (discography + recommendations + future types)
- Item arrays respect soft max lengths server-side (6 / 4)
- `albumTitle` required per item; trim strings; empty items filtered on save

### Adapters

Both `AlbumLyricsZine` and `PlaylistLyricsZine` pass `insideBackSections` into shared `LyricsZine` → `buildZinePages`.

## Page Builder Changes

`src/lib/zine/zine-pages.ts`:

```typescript
export type ZineInsideBackPage = {
  kind: "inside-back";
  sections: ZineInsideBackSection[];
};

// buildZinePages gains optional:
insideBack?: {
  sections: ZineInsideBackSection[];
  includeWhenEmpty?: boolean;
};
```

Insertion logic:

```typescript
// after song pages
if (insideBack && (hasContent || insideBack.includeWhenEmpty)) {
  pages.push({ kind: "inside-back", sections: insideBack.sections });
}
pages.push({ kind: "back-cover" });
// existing blank padding loop
```

Add unit tests mirroring intro-page tests:

- Inside-back appears before back-cover
- Blank padding still yields count % 4 === 0
- Page omitted when no content and not `includeWhenEmpty`
- Both section types render in order

## Edit Page UX

### Album (`/lyrics/[slug]/edit`)

New card: **Zine inside back cover**, below the existing intro page card.

Per section (add/remove/reorder):

- Section type select: Discography | Recommendations
- Optional section title override
- Repeatable item rows with fields per type
- Add item / remove item buttons
- Drag handle or move up/down for section + item order (simple up/down buttons acceptable for v1)

Save with album overrides (same Save button pattern as intro content, or autosave on blur — match intro card behavior).

### Playlist (`/playlist-lyrics/[slug]/edit`)

Same UI component, shared as `ZineInsideBackSectionsEditor`, wired to playlist persistence.

### Item fields (both types)

| Field | Discography | Recommendations |
|-------|-------------|-----------------|
| Album title | required | required |
| Artist name | optional | required |
| Year | optional | — |
| Image URL | optional | optional |
| Blurb | required (sentence) | — |
| Similarity blurb | — | optional |

Show thumbnail preview when `imageUrl` is valid (same pattern as playlist album art override).

## Approaches Considered

### A. Single composable page with section array (recommended)

One `inside-back` page kind; ordered typed sections. Easy to extend; one print page to reason about; matches user’s “grow into different page types or sections” direction.

### B. Separate page kind per section type

`discography-page` and `recommendations-page` as distinct `ZinePage` kinds. Simpler v1 types but breaks when both sections should share one sheet; adds imposition complexity if ever multi-page.

### C. Freeform markdown block

Single markdown string like intro page. Fast to ship but poor control over album art + row layout; fights space constraints.

**Recommendation:** Approach A.

## Out of Scope (v1)

- Spotify album picker for section items (manual URL only)
- Per-section font/spacing sliders on zine view
- Multiple inside-back pages (only one sheet slot)
- Public edit routes
- Auto-populating discography from artist Spotify catalog
- Links / QR codes on recommendation rows
- Playlist zine intro page (separate feature)

## Success Criteria

- Inside-back page renders on the sheet face opposite the back cover in print preview
- Discography rows show optional art + title/year/artist + one-line blurb compactly
- Recommendations list shows art + title/artist + optional similarity note vertically
- Both section types can coexist on one page in configured order
- Content persists on album and playlist zines via edit pages
- Public zines omit the page when empty; private edit zines show placeholder
- Page count remains divisible by four for all song counts 0–15+
- Existing zines without `zineInsideBackSections` unchanged

## Testing

- Unit tests: `buildZinePages` insertion + padding
- Unit tests: section content visibility helpers (pure functions)
- Manual: 2-item discography + 3-item recommendations on 4-page and 8-page zines
- Manual: print preview matches screen layout
- `pnpm typecheck` + scoped Biome on touched files
