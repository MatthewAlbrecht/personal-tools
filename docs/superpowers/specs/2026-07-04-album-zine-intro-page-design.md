# Album Zine Intro Page Design

**Goal:** Add an optional custom intro page to album lyric zines, inserted after the cover and before song pages, with markdown-lite formatting and per-album layout controls.

## Background

Album zines use the shared `LyricsZine` shell (`cover → songs → back cover`). Users want a dedicated intro page for album notes, dedications, or context — separate from per-song Genius intro text on song pages.

Playlist zines do not need this in v1.

## Page Order

When intro content exists (or in private edit preview when empty), page order becomes:

```text
cover → intro → songs → [blank padding] → back cover
```

`buildZinePages` gains `kind: "intro"`. Blank-page padding logic is unchanged (total page count divisible by four).

## Content Format

Store a single string on `geniusAlbums.introPageContent`.

Markdown-lite only:

- `**bold**`
- `*italic*`
- Blank lines (`\n\n`) separate paragraphs
- Single newlines within a paragraph render as line breaks

No full WYSIWYG, no HTML passthrough, no links in v1.

## Edit Page UX

On `/lyrics/[slug]/edit`, add a **Zine intro page** section:

- Textarea for content
- Toolbar buttons: **Bold**, *Italic* (wrap selection or insert markers at cursor)
- Helper text describing the format

Content saves with other album overrides via `updateAlbumOverrides`.

## Zine Layout Settings

Album-level fields on `geniusAlbums`:

| Field | Type | Default |
|-------|------|---------|
| `zineIntroParagraphSpacingPt` | optional number | 8 |
| `zineIntroMarginPt` | optional number | 12 |
| `zineIntroVerticalAlign` | `"top"` \| `"center"` | `"top"` |
| `zineIntroFontSizePt` | optional number | 10 |

Private zine view (`/lyrics/[slug]/zine`) shows a sticky side panel (same pattern as `ZineTrackLyricsColumnControls`) when viewing the intro page in edit mode:

- Paragraph spacing slider
- Margin slider
- Vertical align toggle (top / centered)
- Font size slider

Settings persist via debounced `updateZineIntroSettings` mutation.

## Rendering

New `ZineIntroPage` component:

- Renders parsed paragraphs with bold/italic spans
- CSS custom properties for font size, margins, paragraph spacing, vertical alignment
- Print styles in `zine-print-styles.tsx` mirror screen preview

Public zine: omit intro page when `introPageContent` is empty/whitespace.

Private zine edit: show empty intro page placeholder so layout can be tuned before writing copy.

## Out of Scope (v1)

- Playlist zine intro pages
- Full markdown / WYSIWYG
- Per-paragraph spacing (album-level only)
- Inline editing of intro content on the zine screen

## Success Criteria

- Optional intro page appears after cover in album zines when content exists
- Bold/italic render correctly in print and screen preview
- Layout controls persist and apply on reload
- Edit page textarea + toolbar saves content
- Existing playlist zines unchanged (no intro prop passed)
