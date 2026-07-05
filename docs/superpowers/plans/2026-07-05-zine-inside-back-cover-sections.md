# Zine Inside Back Cover Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional inside-back-cover zine page with composable Discography and Recommendations sections, editable on album and playlist lyric edit pages, rendered in the shared `LyricsZine` shell.

**Architecture:** Shared types + pure helpers in `src/lib/zine/`. Convex validator in `convex/_utils/zineInsideBackSections.ts` reused by both `geniusAlbums` and `playlistLyrics`. Extend `buildZinePages` with `kind: "inside-back"`. Shared editor + page renderer in `src/components/zine/`. Thin wiring in album/playlist zine + editor adapters.

**Tech Stack:** Next.js 15 App Router, React 19, Convex, TypeScript, Biome, `node:test` via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-07-05-zine-inside-back-cover-sections-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `convex/_utils/zineInsideBackSections.ts` | Convex validators + normalize/sanitize on save |
| Create | `convex/_utils/zineInsideBackSections.test.ts` | Server-side normalization tests |
| Create | `src/lib/zine/zine-inside-back-sections.ts` | Client-safe types, defaults, visibility helper |
| Create | `src/lib/zine/zine-inside-back-sections.test.ts` | `hasInsideBackContent`, limits |
| Modify | `convex/schema.ts` | `zineInsideBackSections` on both tables |
| Modify | `convex/geniusAlbums.ts` | Extend `updateAlbumOverrides` |
| Modify | `convex/playlistLyrics.ts` | Add `updateZineInsideBackSections` |
| Modify | `src/lib/zine/zine-pages.ts` | `ZineInsideBackPage` + builder arg |
| Modify | `src/lib/zine/zine-pages.test.ts` | Insertion + padding tests |
| Create | `src/components/zine/zine-inside-back-page.tsx` | Print/screen renderer |
| Create | `src/components/zine/zine-inside-back-sections-editor.tsx` | Edit-page section/item UI |
| Modify | `src/components/zine/zine-print-styles.tsx` | Inside-back print CSS |
| Modify | `src/components/zine/lyrics-zine.tsx` | Prop, `buildZinePages`, render branch |
| Modify | `src/app/lyrics/_components/album-lyrics-zine.tsx` | Pass sections from album |
| Modify | `src/app/playlist-lyrics/_components/playlist-lyrics-zine.tsx` | Pass sections from playlist |
| Modify | `src/app/lyrics/_components/album-lyrics-editor.tsx` | Editor card + save |
| Modify | `src/app/playlist-lyrics/_components/playlist-lyrics-editor.tsx` | Editor card + save |

---

### Task 1: Shared types and visibility helper (TDD)

**Files:**
- Create: `src/lib/zine/zine-inside-back-sections.ts`
- Create: `src/lib/zine/zine-inside-back-sections.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/zine/zine-inside-back-sections.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	ZINE_INSIDE_BACK_LIMITS,
	hasInsideBackContent,
} from "./zine-inside-back-sections";

test("hasInsideBackContent is false when sections empty", () => {
	assert.equal(hasInsideBackContent([]), false);
});

test("hasInsideBackContent is true when a discography item has album title", () => {
	assert.equal(
		hasInsideBackContent([
			{
				type: "discography",
				items: [{ albumTitle: "OK Computer", blurb: "Their best." }],
			},
		]),
		true,
	);
});

test("hasInsideBackContent ignores items with blank album title", () => {
	assert.equal(
		hasInsideBackContent([
			{
				type: "recommendations",
				items: [{ albumTitle: "  ", artistName: "Radiohead" }],
			},
		]),
		false,
	);
});

test("limits match spec caps", () => {
	assert.equal(ZINE_INSIDE_BACK_LIMITS.maxSections, 4);
	assert.equal(ZINE_INSIDE_BACK_LIMITS.maxDiscographyItems, 6);
	assert.equal(ZINE_INSIDE_BACK_LIMITS.maxRecommendationItems, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/zine/zine-inside-back-sections.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal module**

```typescript
// src/lib/zine/zine-inside-back-sections.ts
export type ZineDiscographyItem = {
	albumTitle: string;
	artistName?: string;
	year?: string;
	imageUrl?: string;
	blurb: string;
};

export type ZineRecommendationItem = {
	albumTitle: string;
	artistName: string;
	imageUrl?: string;
	similarityBlurb?: string;
};

export type ZineDiscographySection = {
	type: "discography";
	title?: string;
	items: ZineDiscographyItem[];
};

export type ZineRecommendationsSection = {
	type: "recommendations";
	title?: string;
	items: ZineRecommendationItem[];
};

export type ZineInsideBackSection =
	| ZineDiscographySection
	| ZineRecommendationsSection;

export const ZINE_INSIDE_BACK_LIMITS = {
	maxSections: 4,
	maxDiscographyItems: 6,
	maxRecommendationItems: 4,
} as const;

export const ZINE_INSIDE_BACK_DEFAULT_TITLES = {
	discography: "Discography",
	recommendations: "If you liked this album, check out",
} as const;

export function hasInsideBackContent(
	sections: ZineInsideBackSection[] | undefined,
): boolean {
	if (!sections || sections.length === 0) {
		return false;
	}

	return sections.some((section) =>
		section.items.some((item) => item.albumTitle.trim() !== ""),
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/zine/zine-inside-back-sections.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/zine/zine-inside-back-sections.ts src/lib/zine/zine-inside-back-sections.test.ts
git commit -m "feat(zine): add inside-back section types and visibility helper"
```

---

### Task 2: Convex validators and normalization (TDD)

**Files:**
- Create: `convex/_utils/zineInsideBackSections.ts`
- Create: `convex/_utils/zineInsideBackSections.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// convex/_utils/zineInsideBackSections.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeZineInsideBackSections } from "./zineInsideBackSections";

test("normalizeZineInsideBackSections trims strings and drops empty items", () => {
	const result = normalizeZineInsideBackSections([
		{
			type: "discography",
			title: "  My discography  ",
			items: [
				{
					albumTitle: " Kid A ",
					artistName: " Radiohead ",
					year: " 2000 ",
					imageUrl: " https://example.com/kid-a.jpg ",
					blurb: " Experimental pivot. ",
				},
				{ albumTitle: "  ", blurb: "skip me" },
			],
		},
	]);

	assert.equal(result.length, 1);
	assert.equal(result[0]?.type, "discography");
	if (result[0]?.type !== "discography") throw new Error("expected discography");
	assert.equal(result[0].title, "My discography");
	assert.equal(result[0].items.length, 1);
	assert.deepEqual(result[0].items[0], {
		albumTitle: "Kid A",
		artistName: "Radiohead",
		year: "2000",
		imageUrl: "https://example.com/kid-a.jpg",
		blurb: "Experimental pivot.",
	});
});

test("normalizeZineInsideBackSections drops sections with no valid items", () => {
	const result = normalizeZineInsideBackSections([
		{
			type: "recommendations",
			items: [{ albumTitle: "", artistName: "X" }],
		},
	]);
	assert.deepEqual(result, []);
});

test("normalizeZineInsideBackSections enforces item caps", () => {
	const items = Array.from({ length: 8 }, (_, index) => ({
		albumTitle: `Album ${index + 1}`,
		blurb: "note",
	}));
	const result = normalizeZineInsideBackSections([
		{ type: "discography", items },
	]);
	if (result[0]?.type !== "discography") throw new Error("expected discography");
	assert.equal(result[0].items.length, 6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test convex/_utils/zineInsideBackSections.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement validators + normalizer**

```typescript
// convex/_utils/zineInsideBackSections.ts
import { v } from "convex/values";

const zineDiscographyItemValidator = v.object({
	albumTitle: v.string(),
	artistName: v.optional(v.string()),
	year: v.optional(v.string()),
	imageUrl: v.optional(v.string()),
	blurb: v.string(),
});

const zineRecommendationItemValidator = v.object({
	albumTitle: v.string(),
	artistName: v.string(),
	imageUrl: v.optional(v.string()),
	similarityBlurb: v.optional(v.string()),
});

export const zineInsideBackSectionValidator = v.union(
	v.object({
		type: v.literal("discography"),
		title: v.optional(v.string()),
		items: v.array(zineDiscographyItemValidator),
	}),
	v.object({
		type: v.literal("recommendations"),
		title: v.optional(v.string()),
		items: v.array(zineRecommendationItemValidator),
	}),
);

export const zineInsideBackSectionsValidator = v.array(
	zineInsideBackSectionValidator,
);

type StoredSection =
	| {
			type: "discography";
			title?: string;
			items: Array<{
				albumTitle: string;
				artistName?: string;
				year?: string;
				imageUrl?: string;
				blurb: string;
			}>;
	  }
	| {
			type: "recommendations";
			title?: string;
			items: Array<{
				albumTitle: string;
				artistName: string;
				imageUrl?: string;
				similarityBlurb?: string;
			}>;
	  };

function normalizeOptionalString(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === "" ? undefined : trimmed;
}

export function normalizeZineInsideBackSections(
	sections: StoredSection[] | undefined,
): StoredSection[] {
	if (!sections) return [];

	const normalized: StoredSection[] = [];

	for (const section of sections.slice(0, 4)) {
		if (section.type === "discography") {
			const items = section.items
				.map((item) => ({
					albumTitle: item.albumTitle.trim(),
					artistName: normalizeOptionalString(item.artistName),
					year: normalizeOptionalString(item.year),
					imageUrl: normalizeOptionalString(item.imageUrl),
					blurb: item.blurb.trim(),
				}))
				.filter((item) => item.albumTitle !== "" && item.blurb !== "")
				.slice(0, 6);

			if (items.length === 0) continue;

			normalized.push({
				type: "discography",
				title: normalizeOptionalString(section.title),
				items,
			});
			continue;
		}

		const items = section.items
			.map((item) => ({
				albumTitle: item.albumTitle.trim(),
				artistName: item.artistName.trim(),
				imageUrl: normalizeOptionalString(item.imageUrl),
				similarityBlurb: normalizeOptionalString(item.similarityBlurb),
			}))
			.filter(
				(item) => item.albumTitle !== "" && item.artistName !== "",
			)
			.slice(0, 4);

		if (items.length === 0) continue;

		normalized.push({
			type: "recommendations",
			title: normalizeOptionalString(section.title),
			items,
		});
	}

	return normalized;
}
```

- [ ] **Step 4: Run tests**

Run: `npx tsx --test convex/_utils/zineInsideBackSections.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/zineInsideBackSections.ts convex/_utils/zineInsideBackSections.test.ts
git commit -m "feat(zine): add Convex inside-back section validators and normalizer"
```

---

### Task 3: Schema and mutations

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/geniusAlbums.ts`
- Modify: `convex/playlistLyrics.ts`

- [ ] **Step 1: Add schema fields**

In `convex/schema.ts`, import `zineInsideBackSectionsValidator` and add to both `geniusAlbums` and `playlistLyrics`:

```typescript
import { zineInsideBackSectionsValidator } from "./_utils/zineInsideBackSections";

// inside geniusAlbums defineTable({ ... })
zineInsideBackSections: v.optional(zineInsideBackSectionsValidator),

// inside playlistLyrics defineTable({ ... })
zineInsideBackSections: v.optional(zineInsideBackSectionsValidator),
```

- [ ] **Step 2: Extend album mutation**

In `convex/geniusAlbums.ts`:

```typescript
import {
	normalizeZineInsideBackSections,
	zineInsideBackSectionsValidator,
} from "./_utils/zineInsideBackSections";

// updateAlbumOverrides args — add:
zineInsideBackSections: v.optional(zineInsideBackSectionsValidator),

// handler patch — add:
zineInsideBackSections:
	args.zineInsideBackSections === undefined
		? undefined
		: normalizeZineInsideBackSections(args.zineInsideBackSections),
```

Use conditional patch: only include `zineInsideBackSections` in the patch object when `args.zineInsideBackSections !== undefined` (same pattern as other optional override fields).

- [ ] **Step 3: Add playlist mutation**

In `convex/playlistLyrics.ts`:

```typescript
export const updateZineInsideBackSections = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		sections: zineInsideBackSectionsValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const playlist = await ctx.db.get(args.playlistId);
		if (!playlist) throw new Error("Playlist not found");

		await ctx.db.patch(args.playlistId, {
			zineInsideBackSections: normalizeZineInsideBackSections(args.sections),
			updatedAt: Date.now(),
		});

		return null;
	},
});
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (Convex codegen may need `npx convex dev` or deploy push in dev environment)

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/geniusAlbums.ts convex/playlistLyrics.ts
git commit -m "feat(zine): persist inside-back sections on album and playlist"
```

---

### Task 4: Page builder (TDD)

**Files:**
- Modify: `src/lib/zine/zine-pages.ts`
- Modify: `src/lib/zine/zine-pages.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `zine-pages.test.ts`:

```typescript
test("buildZinePages inserts inside-back page before back cover when content exists", () => {
	const pages = buildZinePages({
		playlistTitle: "Test",
		songs: [
			{ id: "a", position: 1, title: "A", artistName: "X", lyrics: "line" },
		],
		insideBack: {
			sections: [
				{
					type: "discography",
					items: [{ albumTitle: "Kid A", blurb: "Great." }],
				},
			],
		},
	});

	assert.equal(pages.length, 4);
	assert.equal(pages[0]?.kind, "cover");
	assert.equal(pages[1]?.kind, "song");
	assert.equal(pages[2]?.kind, "inside-back");
	assert.equal(pages[3]?.kind, "back-cover");
});

test("buildZinePages omits inside-back when no content and includeWhenEmpty false", () => {
	const pages = buildZinePages({
		playlistTitle: "Test",
		songs: [
			{ id: "a", position: 1, title: "A", artistName: "X", lyrics: "line" },
		],
		insideBack: { sections: [], includeWhenEmpty: false },
	});

	assert.equal(pages.length, 4);
	assert.equal(pages[2]?.kind, "back-cover");
});

test("buildZinePages includes empty inside-back when includeWhenEmpty true", () => {
	const pages = buildZinePages({
		playlistTitle: "Test",
		songs: [
			{ id: "a", position: 1, title: "A", artistName: "X", lyrics: "line" },
		],
		insideBack: { sections: [], includeWhenEmpty: true },
	});

	assert.equal(pages[2]?.kind, "inside-back");
	assert.equal(pages[3]?.kind, "back-cover");
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx tsx --test src/lib/zine/zine-pages.test.ts`

- [ ] **Step 3: Implement builder changes**

In `zine-pages.ts`:

```typescript
import type { ZineInsideBackSection } from "./zine-inside-back-sections";
import { hasInsideBackContent } from "./zine-inside-back-sections";

export type ZineInsideBackPage = {
	kind: "inside-back";
	sections: ZineInsideBackSection[];
};

// Add to ZinePage union

export function buildZinePages({
	// ...existing args
	insideBack,
}: {
	// ...existing types
	insideBack?: {
		sections: ZineInsideBackSection[];
		includeWhenEmpty?: boolean;
	};
}): ZinePage[] {
	// ...existing cover/intro/song logic

	const shouldIncludeInsideBack =
		insideBack &&
		(hasInsideBackContent(insideBack.sections) ||
			insideBack.includeWhenEmpty === true);

	if (shouldIncludeInsideBack) {
		pages.push({
			kind: "inside-back",
			sections: insideBack.sections,
		});
	}

	pages.push({ kind: "back-cover" });

	while (pages.length % 4 !== 0) {
		pages.splice(pages.length - 1, 0, { kind: "blank" });
	}

	return pages;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx tsx --test src/lib/zine/zine-pages.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/zine/zine-pages.ts src/lib/zine/zine-pages.test.ts
git commit -m "feat(zine): insert inside-back page before back cover in page builder"
```

---

### Task 5: Inside-back page renderer + print styles

**Files:**
- Create: `src/components/zine/zine-inside-back-page.tsx`
- Modify: `src/components/zine/zine-print-styles.tsx`

- [ ] **Step 1: Create page component**

```tsx
// src/components/zine/zine-inside-back-page.tsx
"use client";

import type {
	ZineInsideBackSection,
	ZineDiscographyItem,
	ZineRecommendationItem,
} from "~/lib/zine/zine-inside-back-sections";
import {
	ZINE_INSIDE_BACK_DEFAULT_TITLES,
	hasInsideBackContent,
} from "~/lib/zine/zine-inside-back-sections";
import { cn } from "~/lib/utils";

export function ZineInsideBackPage({
	sections,
	canEdit,
}: {
	sections: ZineInsideBackSection[];
	canEdit?: boolean;
}) {
	const totalItems = sections.reduce((count, section) => count + section.items.length, 0);
	const compact = totalItems > 5;

	return (
		<section
			className={cn(
				"zine-page zine-page-preview zine-page-inside-back",
				compact && "zine-page-inside-back-compact",
			)}
		>
			<div className="zine-inside-back-inner">
				{hasInsideBackContent(sections) ? (
					sections.map((section, index) => (
						<InsideBackSectionBlock
							key={`${section.type}-${index}`}
							section={section}
						/>
					))
				) : canEdit ? (
					<p className="zine-inside-back-placeholder">
						Inside back cover — add sections on the edit page.
					</p>
				) : null}
			</div>
		</section>
	);
}

function InsideBackSectionBlock({ section }: { section: ZineInsideBackSection }) {
	if (section.type === "discography") {
		return (
			<div className="zine-inside-back-section zine-inside-back-discography">
				<h2 className="zine-inside-back-section-title">
					{section.title?.trim() || ZINE_INSIDE_BACK_DEFAULT_TITLES.discography}
				</h2>
				<ul className="zine-inside-back-discography-list">
					{section.items.map((item, index) => (
						<DiscographyRow key={`${item.albumTitle}-${index}`} item={item} />
					))}
				</ul>
			</div>
		);
	}

	return (
		<div className="zine-inside-back-section zine-inside-back-recommendations">
			<h2 className="zine-inside-back-section-title">
				{section.title?.trim() ||
					ZINE_INSIDE_BACK_DEFAULT_TITLES.recommendations}
			</h2>
			<ul className="zine-inside-back-recommendations-list">
				{section.items.map((item, index) => (
					<RecommendationRow key={`${item.albumTitle}-${index}`} item={item} />
				))}
			</ul>
		</div>
	);
}

function DiscographyRow({ item }: { item: ZineDiscographyItem }) {
	const titleLine = [item.albumTitle, item.year ? `(${item.year})` : ""]
		.filter(Boolean)
		.join(" ");

	return (
		<li className="zine-inside-back-discography-row">
			{item.imageUrl ? (
				<img
					src={item.imageUrl}
					alt=""
					className="zine-inside-back-discography-art"
				/>
			) : (
				<div className="zine-inside-back-discography-art zine-inside-back-art-placeholder" />
			)}
			<div className="zine-inside-back-discography-text">
				<p className="zine-inside-back-item-title">{titleLine}</p>
				{item.artistName ? (
					<p className="zine-inside-back-item-artist">{item.artistName}</p>
				) : null}
				<p className="zine-inside-back-item-blurb">{item.blurb}</p>
			</div>
		</li>
	);
}

function RecommendationRow({ item }: { item: ZineRecommendationItem }) {
	return (
		<li className="zine-inside-back-recommendation-row">
			{item.imageUrl ? (
				<img
					src={item.imageUrl}
					alt=""
					className="zine-inside-back-recommendation-art"
				/>
			) : (
				<div className="zine-inside-back-recommendation-art zine-inside-back-art-placeholder" />
			)}
			<div className="zine-inside-back-recommendation-text">
				<p className="zine-inside-back-item-title">{item.albumTitle}</p>
				<p className="zine-inside-back-item-artist">{item.artistName}</p>
				{item.similarityBlurb ? (
					<p className="zine-inside-back-item-similarity">{item.similarityBlurb}</p>
				) : null}
			</div>
		</li>
	);
}
```

- [ ] **Step 2: Add print/screen CSS**

In `zine-print-styles.tsx`, add rules (mirror intro page pattern — screen + `@media print`):

```css
.zine-page-inside-back { /* top-aligned, full height */ }
.zine-inside-back-inner { padding: calc(var(--zine-page-margin-in, 0.35) * 1in); }
.zine-inside-back-section-title { font-size: 9pt; font-weight: 600; margin-bottom: 6pt; }
.zine-inside-back-discography-row { display: flex; gap: 8pt; margin-bottom: 6pt; }
.zine-inside-back-discography-art { width: 0.55in; height: 0.55in; object-fit: cover; border-radius: 2pt; flex-shrink: 0; }
.zine-inside-back-recommendation-row { display: flex; gap: 10pt; margin-bottom: 8pt; }
.zine-inside-back-recommendation-art { width: 0.65in; height: 0.65in; object-fit: cover; border-radius: 2pt; flex-shrink: 0; }
.zine-inside-back-item-blurb { font-size: 7.5pt; color: var(--muted-foreground); }
.zine-inside-back-item-similarity { font-size: 7.5pt; font-style: italic; }
.zine-page-inside-back-compact .zine-inside-back-discography-art { width: 0.45in; height: 0.45in; }
.zine-page-inside-back-compact .zine-inside-back-recommendation-art { width: 0.55in; height: 0.55in; }
.zine-inside-back-placeholder { font-size: 9pt; color: var(--muted-foreground); }
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/components/zine/zine-inside-back-page.tsx src/components/zine/zine-print-styles.tsx
git commit -m "feat(zine): render inside-back cover page with discography and recommendations"
```

---

### Task 6: Edit-page sections editor

**Files:**
- Create: `src/components/zine/zine-inside-back-sections-editor.tsx`

- [ ] **Step 1: Build shared editor component**

Requirements:
- Controlled `sections` + `onChange`
- Add section button (type select: Discography | Recommendations) — disabled at 4 sections
- Per section: optional title input, move up/down, remove section
- Per item: fields per spec; add/remove item; move up/down within section
- Enforce UI caps: 6 discography items, 4 recommendation items
- Image URL field with thumbnail preview (copy pattern from `playlist-lyrics-editor.tsx` album art override block)
- Use classic function declarations for named components

Props:

```typescript
export function ZineInsideBackSectionsEditor({
	sections,
	onChange,
	disabled,
}: {
	sections: ZineInsideBackSection[];
	onChange: (sections: ZineInsideBackSection[]) => void;
	disabled?: boolean;
}) { /* ... */ }
```

Helper to create empty section:

```typescript
function createEmptySection(type: "discography" | "recommendations"): ZineInsideBackSection {
	return type === "discography"
		? { type: "discography", items: [{ albumTitle: "", blurb: "" }] }
		: { type: "recommendations", items: [{ albumTitle: "", artistName: "" }] };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/zine/zine-inside-back-sections-editor.tsx
git commit -m "feat(zine): add inside-back sections editor for edit pages"
```

---

### Task 7: LyricsZine integration

**Files:**
- Modify: `src/components/zine/lyrics-zine.tsx`

- [ ] **Step 1: Add prop and wire buildZinePages**

```typescript
// props
insideBackSections?: ZineInsideBackSection[];

// state (only if needed for optimistic edit — otherwise pass through directly)
const resolvedInsideBackSections = insideBackSections ?? [];

const pages = buildZinePages({
	// ...existing
	insideBack: {
		sections: resolvedInsideBackSections,
		includeWhenEmpty: canEdit,
	},
});
```

Public behavior: parent passes `undefined` or `[]` when no content — page omitted via `hasInsideBackContent`.

- [ ] **Step 2: Render inside-back in renderPageByReadingIndex**

After `page.kind === "intro"` branch, before `back-cover`:

```typescript
if (page.kind === "inside-back") {
	return (
		<ZineInsideBackPage
			key={`${keyPrefix}-inside-back`}
			sections={page.sections}
			canEdit={canEdit}
		/>
	);
}
```

Ensure screen preview loop and print spread rendering both hit this branch (grep for all `page.kind ===` switches in file).

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/components/zine/lyrics-zine.tsx
git commit -m "feat(zine): render inside-back page in shared LyricsZine shell"
```

---

### Task 8: Album wiring (zine + editor)

**Files:**
- Modify: `src/app/lyrics/_components/album-lyrics-zine.tsx`
- Modify: `src/app/lyrics/_components/album-lyrics-editor.tsx`

- [ ] **Step 1: Pass sections from album to LyricsZine**

In `album-lyrics-zine.tsx`:

```typescript
insideBackSections={albumData.album.zineInsideBackSections ?? []}
```

Public zine: pass `undefined` when `!hasInsideBackContent(albumData.album.zineInsideBackSections)` so empty page is omitted.

- [ ] **Step 2: Add editor card on album edit page**

In `album-lyrics-editor.tsx`:
- Extend `AlbumFormState` with `zineInsideBackSections: ZineInsideBackSection[]`
- Initialize from `album.zineInsideBackSections ?? []` in the existing `useEffect` init block
- Add new `Card` titled **Zine inside back cover** below the intro `IntroContentEditor`
- Wire `ZineInsideBackSectionsEditor` to form state
- Include `zineInsideBackSections` in `handleSaveAlbumOverrides` → `updateAlbumOverrides`

- [ ] **Step 3: Manual smoke test**

1. Open `/lyrics/[slug]/edit`, add a discography section with 2 items, save
2. Open `/lyrics/[slug]/zine` — inside-back page appears before back cover
3. Open public zine — page visible when content exists

- [ ] **Step 4: Commit**

```bash
git add src/app/lyrics/_components/album-lyrics-zine.tsx src/app/lyrics/_components/album-lyrics-editor.tsx
git commit -m "feat(zine): wire inside-back sections on album lyrics zine and editor"
```

---

### Task 9: Playlist wiring (zine + editor)

**Files:**
- Modify: `src/app/playlist-lyrics/_components/playlist-lyrics-zine.tsx`
- Modify: `src/app/playlist-lyrics/_components/playlist-lyrics-editor.tsx`

- [ ] **Step 1: Pass sections from playlist to LyricsZine**

Same pattern as album — `playlist.zineInsideBackSections`, public omits when empty.

- [ ] **Step 2: Add editor card on playlist edit page**

Add card near existing zine-related cards (e.g. after Back cover QR codes card):
- Local state initialized from `playlist.zineInsideBackSections ?? []`
- Save button calls `updateZineInsideBackSections({ playlistId, sections })`
- Reuse `ZineInsideBackSectionsEditor`

- [ ] **Step 3: Manual smoke test**

1. Playlist edit → add recommendations section → save
2. Private + public playlist zine URLs

- [ ] **Step 4: Commit**

```bash
git add src/app/playlist-lyrics/_components/playlist-lyrics-zine.tsx src/app/playlist-lyrics/_components/playlist-lyrics-editor.tsx
git commit -m "feat(zine): wire inside-back sections on playlist lyrics zine and editor"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run unit tests**

```bash
npx tsx --test src/lib/zine/zine-inside-back-sections.test.ts
npx tsx --test src/lib/zine/zine-pages.test.ts
npx tsx --test convex/_utils/zineInsideBackSections.test.ts
```

Expected: all PASS

- [ ] **Step 2: Run typecheck and lint on touched paths**

```bash
pnpm typecheck
pnpm check -- src/lib/zine/zine-inside-back-sections.ts src/lib/zine/zine-pages.ts src/components/zine/zine-inside-back-page.tsx src/components/zine/zine-inside-back-sections-editor.tsx src/components/zine/lyrics-zine.tsx
```

- [ ] **Step 3: Manual print check**

On a zine with discography + recommendations stacked:
- Verify inside-back faces back cover in sheet spread preview
- Print preview: no overflow outside margin box with 6 discography items (compact mode)

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "chore(zine): verify inside-back cover sections implementation"
```

---

## Spec Coverage Self-Review

| Spec requirement | Task |
|------------------|------|
| Inside-back before back cover | Task 4 |
| Section stacking on one page | Task 1 types, Task 5 renderer, Task 6 editor |
| Discography layout (compact rows) | Task 5 |
| Recommendations layout (vertical) | Task 5 |
| Manual image URL per item | Task 6 |
| Both album + playlist | Tasks 3, 8, 9 |
| Public omit when empty | Tasks 7, 8, 9 (`hasInsideBackContent`) |
| Private empty placeholder | Task 5 + `includeWhenEmpty: canEdit` in Task 7 |
| Page count % 4 | Task 4 tests |
| Server normalization + caps | Task 2 |
| Edit on `/edit` pages only | Tasks 6, 8, 9 |
| No Spotify picker / layout sliders | Out of scope — not in plan |

No placeholders remain. Types consistent across Tasks 1–9.
