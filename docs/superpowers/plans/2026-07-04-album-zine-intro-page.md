# Album Zine Intro Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional album zine intro page with markdown-lite content, edit-page authoring, and zine layout controls.

**Architecture:** Pure intro content parser + layout resolver in `src/lib/zine/`. Extend `buildZinePages` with `kind: "intro"`. Album-only wiring through `album-lyrics-zine.tsx` and edit page. Convex schema + mutations for content and layout settings.

**Tech Stack:** Next.js App Router, React 19, Convex, TypeScript, `node:test` via `npx tsx --test`.

---

## File Structure

- Create `src/lib/zine/zine-intro-content.ts` — parse markdown-lite intro text
- Create `src/lib/zine/zine-intro-content.test.ts`
- Create `src/lib/zine/zine-intro-layout.ts` — defaults + resolve settings
- Create `src/components/zine/zine-intro-page.tsx` — intro page renderer
- Create `src/app/lyrics/_components/intro-content-editor.tsx` — textarea + B/I toolbar
- Modify `convex/schema.ts` — intro fields on `geniusAlbums`
- Modify `convex/geniusAlbums.ts` — `updateAlbumOverrides`, `updateZineIntroSettings`
- Modify `src/lib/zine/zine-pages.ts` + `zine-pages.test.ts`
- Modify `src/lib/zine/zine-types.ts` — `ZineIntroSettings` export
- Modify `src/components/zine/lyrics-zine.tsx` — render intro, sticky controls
- Modify `src/components/zine/zine-print-styles.tsx` — intro print CSS
- Modify `src/app/lyrics/_components/album-lyrics-zine.tsx` — pass intro + persistence
- Modify `src/app/lyrics/_components/album-lyrics-editor.tsx` — intro content editor

---

### Task 1: Intro content parser (TDD)

- [ ] Write failing tests in `zine-intro-content.test.ts`
- [ ] Implement `parseIntroContent()` returning paragraph/span tree
- [ ] Run `npx tsx --test src/lib/zine/zine-intro-content.test.ts`

### Task 2: Layout defaults

- [ ] Create `zine-intro-layout.ts` with `ZINE_INTRO_DEFAULTS` and `resolveZineIntroSettings()`

### Task 3: Schema + Convex mutations

- [ ] Add fields to `geniusAlbums` in `schema.ts`
- [ ] Extend `updateAlbumOverrides` with `introPageContent`
- [ ] Add `updateZineIntroSettings` mutation
- [ ] Run `pnpm typecheck`

### Task 4: Page builder

- [ ] Add `ZineIntroPage` type and optional intro arg to `buildZinePages`
- [ ] Update `zine-pages.test.ts`
- [ ] Run `npx tsx --test src/lib/zine/zine-pages.test.ts`

### Task 5: UI components

- [ ] Create `ZineIntroPage` component
- [ ] Add print styles
- [ ] Create `IntroContentEditor` for edit page

### Task 6: LyricsZine integration

- [ ] Optional `introPage` prop + persistence hook
- [ ] Render intro in `renderPageByReadingIndex` and screen preview loop
- [ ] Add `ZineIntroLayoutControls` sticky panel

### Task 7: Album wiring

- [ ] Wire `album-lyrics-zine.tsx`
- [ ] Wire `album-lyrics-editor.tsx`
- [ ] Run `pnpm typecheck` and relevant tests
