# Playlist Lyrics Zine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated booklet print view for playlist lyrics where page 1 is the playlist title, each subsequent page is exactly one song (title + lyrics), text auto-scales to fit, and pages are half-letter sized for macOS Preview booklet printing.

**Architecture:** New routes at `/playlist-lyrics/[slug]/zine` (and public mirror) render a separate client component from the existing scroll/print reader. Pure layout helpers compute initial font sizes and pad total page count to a multiple of four. Each song page uses a `useAutoFitText` hook that measures DOM overflow and steps font size down until title stays on one line and lyrics fit inside the printable area. Reuses existing Convex playlist queries and `LyricsRenderer`.

**Tech Stack:** Next.js App Router, React 19 client components, Convex `useQuery`, existing `LyricsRenderer`, node:test + tsx for pure helper tests, inline `@media print` CSS (same pattern as `src/app/articles/print/page.tsx`).

**Commit Policy:** Do not create git commits unless the user explicitly requests them.

---

## File Structure

- Create `src/app/playlist-lyrics/_utils/zine-layout.ts`: half-letter dimensions, line counting, initial font-size estimators.
- Create `src/app/playlist-lyrics/_utils/zine-layout.test.ts`: node:test coverage for layout math.
- Create `src/app/playlist-lyrics/_utils/zine-pages.ts`: build ordered zine page models and pad blank pages to a multiple of four.
- Create `src/app/playlist-lyrics/_utils/zine-pages.test.ts`: node:test coverage for page list construction.
- Create `src/app/playlist-lyrics/_components/use-auto-fit-text.ts`: client hook that shrinks font size until content fits a container.
- Create `src/app/playlist-lyrics/_components/zine-print-styles.tsx`: scoped inline print/screen CSS for zine pages.
- Create `src/app/playlist-lyrics/_components/zine-cover-page.tsx`: cover page (playlist title only).
- Create `src/app/playlist-lyrics/_components/zine-song-page.tsx`: one song per page with auto-fit title + lyrics.
- Create `src/app/playlist-lyrics/_components/playlist-lyrics-zine.tsx`: data fetch, page assembly, print controls.
- Create `src/app/playlist-lyrics/[slug]/zine/page.tsx`: authenticated zine route.
- Create `src/app/public/playlist-lyrics/[slug]/zine/page.tsx`: public zine route.
- Modify `src/app/playlist-lyrics/_components/playlist-lyrics-reader.tsx`: add link/button to open zine view.

---

## Task 1: Zine Layout Helpers And Tests

**Files:**
- Create: `src/app/playlist-lyrics/_utils/zine-layout.ts`
- Create: `src/app/playlist-lyrics/_utils/zine-layout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/playlist-lyrics/_utils/zine-layout.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	computeLyricsFontSize,
	computeSingleLineFontSize,
	countLyricsLines,
	getZineContentBoxPt,
	padZinePageCount,
	ZINE_PAGE,
} from "./zine-layout";

test("countLyricsLines counts blank lines and section headers", () => {
	const lyrics = "[Verse 1]\nFirst line\n\nSecond line\n[Chorus]\nHook";

	assert.equal(countLyricsLines(lyrics, true), 6);
	assert.equal(countLyricsLines(lyrics, false), 4);
});

test("computeSingleLineFontSize shrinks long titles but not short ones", () => {
	const short = computeSingleLineFontSize("Go", 300);
	const long = computeSingleLineFontSize(
		"Some Incredibly Long Song Title That Should Not Fit On One Line At Max Size",
		300,
	);

	assert.equal(short, 24);
	assert.ok(long < short);
	assert.ok(long >= 10);
});

test("computeLyricsFontSize shrinks when line count is high", () => {
	const fewLines = computeLyricsFontSize(10, 400);
	const manyLines = computeLyricsFontSize(80, 400);

	assert.ok(fewLines > manyLines);
	assert.ok(manyLines >= 6);
});

test("padZinePageCount rounds up to a multiple of four", () => {
	assert.equal(padZinePageCount(1), 4);
	assert.equal(padZinePageCount(4), 4);
	assert.equal(padZinePageCount(5), 8);
	assert.equal(padZinePageCount(9), 12);
});

test("getZineContentBoxPt subtracts margins from page size", () => {
	const box = getZineContentBoxPt();

	assert.equal(box.widthPt, (ZINE_PAGE.widthIn - ZINE_PAGE.marginIn * 2) * 72);
	assert.equal(box.heightPt, (ZINE_PAGE.heightIn - ZINE_PAGE.marginIn * 2) * 72);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --import tsx --test src/app/playlist-lyrics/_utils/zine-layout.test.ts
```

Expected: FAIL because `./zine-layout` does not exist.

- [ ] **Step 3: Implement layout helpers**

Create `src/app/playlist-lyrics/_utils/zine-layout.ts`:

```typescript
export const ZINE_PAGE = {
	widthIn: 5.5,
	heightIn: 8.5,
	marginIn: 0.35,
} as const;

const POINTS_PER_INCH = 72;

const TITLE_FONT = {
	maxPt: 24,
	minPt: 10,
	charWidthRatio: 0.55,
	reservedHeightPt: 48,
} as const;

const LYRICS_FONT = {
	maxPt: 9,
	minPt: 6,
	lineHeight: 1.35,
} as const;

export function countLyricsLines(
	lyrics: string,
	showSectionLabels: boolean,
): number {
	return lyrics.split("\n").filter((line) => {
		const trimmed = line.trim();

		if (trimmed === "") {
			return true;
		}

		if (/^\[.*\]$/.test(trimmed) && !showSectionLabels) {
			return false;
		}

		return true;
	}).length;
}

export function getZineContentBoxPt(): { widthPt: number; heightPt: number } {
	const widthPt =
		(ZINE_PAGE.widthIn - ZINE_PAGE.marginIn * 2) * POINTS_PER_INCH;
	const heightPt =
		(ZINE_PAGE.heightIn - ZINE_PAGE.marginIn * 2) * POINTS_PER_INCH;

	return { widthPt, heightPt };
}

export function computeSingleLineFontSize(
	text: string,
	maxWidthPt: number,
): number {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return TITLE_FONT.maxPt;
	}

	let fontSizePt = TITLE_FONT.maxPt;

	while (fontSizePt > TITLE_FONT.minPt) {
		const estimatedWidthPt =
			trimmed.length * fontSizePt * TITLE_FONT.charWidthRatio;

		if (estimatedWidthPt <= maxWidthPt) {
			return fontSizePt;
		}

		fontSizePt -= 0.5;
	}

	return TITLE_FONT.minPt;
}

export function computeLyricsFontSize(
	lineCount: number,
	availableHeightPt: number,
): number {
	if (lineCount <= 0) {
		return LYRICS_FONT.maxPt;
	}

	const maxByHeight =
		availableHeightPt / (lineCount * LYRICS_FONT.lineHeight);
	const fontSizePt = Math.min(LYRICS_FONT.maxPt, maxByHeight);

	return Math.max(LYRICS_FONT.minPt, Math.floor(fontSizePt * 2) / 2);
}

export function getSongPageLayout({
	title,
	lyrics,
	showSectionLabels,
}: {
	title: string;
	lyrics: string;
	showSectionLabels: boolean;
}): {
	titleFontSizePt: number;
	lyricsFontSizePt: number;
} {
	const { widthPt, heightPt } = getZineContentBoxPt();
	const lyricsHeightPt = heightPt - TITLE_FONT.reservedHeightPt;

	return {
		titleFontSizePt: computeSingleLineFontSize(title, widthPt),
		lyricsFontSizePt: computeLyricsFontSize(
			countLyricsLines(lyrics, showSectionLabels),
			lyricsHeightPt,
		),
	};
}

export function padZinePageCount(pageCount: number): number {
	if (pageCount <= 0) {
		return 4;
	}

	return Math.ceil(pageCount / 4) * 4;
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
node --import tsx --test src/app/playlist-lyrics/_utils/zine-layout.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

Skip unless the user explicitly requests a commit.

---

## Task 2: Zine Page Model Builder And Tests

**Files:**
- Create: `src/app/playlist-lyrics/_utils/zine-pages.ts`
- Create: `src/app/playlist-lyrics/_utils/zine-pages.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/playlist-lyrics/_utils/zine-pages.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { buildZinePages } from "./zine-pages";

test("buildZinePages starts with a cover and adds one page per ready song", () => {
	const pages = buildZinePages({
		playlistTitle: "Music Tour 2026",
		songs: [
			{
				id: "song-a",
				position: 1,
				title: "Song A",
				lyrics: "Line one\nLine two",
			},
			{
				id: "song-b",
				position: 2,
				title: "Song B",
				lyrics: "Another song",
			},
		],
	});

	assert.equal(pages.length, 4);
	assert.deepEqual(pages[0], {
		kind: "cover",
		playlistTitle: "Music Tour 2026",
	});
	assert.equal(pages[1]?.kind, "song");
	assert.equal(pages[1]?.songId, "song-a");
	assert.equal(pages[2]?.kind, "song");
	assert.equal(pages[3]?.kind, "blank");
});

test("buildZinePages skips songs without lyrics", () => {
	const pages = buildZinePages({
		playlistTitle: "Draft Packet",
		songs: [
			{
				id: "missing",
				position: 1,
				title: "Missing Lyrics",
				lyrics: "",
			},
			{
				id: "ready",
				position: 2,
				title: "Ready Song",
				lyrics: "Hello",
			},
		],
	});

	assert.equal(pages.length, 4);
	assert.equal(pages.filter((page) => page.kind === "song").length, 1);
	assert.equal(pages[1]?.kind, "song");
	assert.equal(pages[1]?.songId, "ready");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --import tsx --test src/app/playlist-lyrics/_utils/zine-pages.test.ts
```

Expected: FAIL because `./zine-pages` does not exist.

- [ ] **Step 3: Implement page builder**

Create `src/app/playlist-lyrics/_utils/zine-pages.ts`:

```typescript
import { padZinePageCount } from "./zine-layout";

export type ZineSongInput = {
	id: string;
	position: number;
	title: string;
	lyrics: string;
};

export type ZineCoverPage = {
	kind: "cover";
	playlistTitle: string;
};

export type ZineSongPage = {
	kind: "song";
	songId: string;
	position: number;
	title: string;
	lyrics: string;
};

export type ZineBlankPage = {
	kind: "blank";
};

export type ZinePage = ZineCoverPage | ZineSongPage | ZineBlankPage;

export function buildZinePages({
	playlistTitle,
	songs,
}: {
	playlistTitle: string;
	songs: ZineSongInput[];
}): ZinePage[] {
	const readySongs = songs
		.filter((song) => song.lyrics.trim().length > 0)
		.sort((left, right) => left.position - right.position);

	const pages: ZinePage[] = [
		{
			kind: "cover",
			playlistTitle,
		},
		...readySongs.map((song) => ({
			kind: "song" as const,
			songId: song.id,
			position: song.position,
			title: song.title,
			lyrics: song.lyrics,
		})),
	];

	const paddedCount = padZinePageCount(pages.length);
	const blankCount = paddedCount - pages.length;

	for (let index = 0; index < blankCount; index += 1) {
		pages.push({ kind: "blank" });
	}

	return pages;
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
node --import tsx --test src/app/playlist-lyrics/_utils/zine-pages.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

Skip unless the user explicitly requests a commit.

---

## Task 3: Auto-Fit Text Hook

**Files:**
- Create: `src/app/playlist-lyrics/_components/use-auto-fit-text.ts`

- [ ] **Step 1: Implement the hook**

Create `src/app/playlist-lyrics/_components/use-auto-fit-text.ts`:

```typescript
"use client";

import { useLayoutEffect, useRef, useState } from "react";

export function useAutoFitText({
	initialFontSizePt,
	minFontSizePt,
	mode,
	contentKey,
}: {
	initialFontSizePt: number;
	minFontSizePt: number;
	mode: "single-line" | "multiline";
	contentKey: string;
}): {
	containerRef: React.RefObject<HTMLDivElement | null>;
	fontSizePt: number;
} {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [fontSizePt, setFontSizePt] = useState(initialFontSizePt);

	useLayoutEffect(() => {
		setFontSizePt(initialFontSizePt);
	}, [contentKey, initialFontSizePt]);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		let nextFontSizePt = initialFontSizePt;
		container.style.fontSize = `${nextFontSizePt}pt`;

		const fits = (): boolean => {
			if (mode === "single-line") {
				return container.scrollWidth <= container.clientWidth + 1;
			}

			return container.scrollHeight <= container.clientHeight + 1;
		};

		while (nextFontSizePt > minFontSizePt && !fits()) {
			nextFontSizePt -= 0.5;
			container.style.fontSize = `${nextFontSizePt}pt`;
		}

		setFontSizePt(nextFontSizePt);
	}, [contentKey, initialFontSizePt, minFontSizePt, mode]);

	return {
		containerRef,
		fontSizePt,
	};
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS (no errors in the new hook file).

- [ ] **Step 3: Commit**

Skip unless the user explicitly requests a commit.

---

## Task 4: Zine Print Styles And Page Shell Components

**Files:**
- Create: `src/app/playlist-lyrics/_components/zine-print-styles.tsx`
- Create: `src/app/playlist-lyrics/_components/zine-cover-page.tsx`
- Create: `src/app/playlist-lyrics/_components/zine-song-page.tsx`

- [ ] **Step 1: Create scoped print styles**

Create `src/app/playlist-lyrics/_components/zine-print-styles.tsx`:

```tsx
export function ZinePrintStyles() {
	return (
		<style
			dangerouslySetInnerHTML={{
				__html: `
					@media screen {
						.zine-document {
							padding: 1.5rem 0 3rem;
						}

						.zine-page {
							width: 5.5in;
							min-height: 8.5in;
							margin: 0 auto 1.5rem;
							border: 1px solid #d4d4d4;
							box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
							background: #fff;
							color: #000;
							box-sizing: border-box;
						}
					}

					@media print {
						@page {
							size: 5.5in 8.5in;
							margin: 0.35in;
						}

						body {
							margin: 0;
							padding: 0;
							background: #fff !important;
							color: #000 !important;
						}

						.no-print {
							display: none !important;
						}

						header.sticky {
							display: none !important;
						}

						.zine-document {
							padding: 0;
						}

						.zine-page {
							width: auto;
							min-height: 7.8in;
							margin: 0;
							border: none;
							box-shadow: none;
							page-break-after: always;
							break-after: page;
							box-sizing: border-box;
						}

						.zine-page:last-child {
							page-break-after: auto;
							break-after: auto;
						}
					}
				`,
			}}
		/>
	);
}
```

- [ ] **Step 2: Create cover page component**

Create `src/app/playlist-lyrics/_components/zine-cover-page.tsx`:

```tsx
"use client";

import { useAutoFitText } from "./use-auto-fit-text";

export function ZineCoverPage({ playlistTitle }: { playlistTitle: string }) {
	const { containerRef, fontSizePt } = useAutoFitText({
		initialFontSizePt: 28,
		minFontSizePt: 14,
		mode: "single-line",
		contentKey: playlistTitle,
	});

	return (
		<section className="zine-page flex items-center justify-center px-6 py-8">
			<div
				ref={containerRef}
				className="w-full overflow-hidden text-center font-bold leading-none whitespace-nowrap"
				style={{ fontSize: `${fontSizePt}pt` }}
			>
				{playlistTitle}
			</div>
		</section>
	);
}
```

- [ ] **Step 3: Create song page component**

Create `src/app/playlist-lyrics/_components/zine-song-page.tsx`:

```tsx
"use client";

import { getSongPageLayout } from "../_utils/zine-layout";
import { LyricsRenderer } from "./lyrics-renderer";
import { useAutoFitText } from "./use-auto-fit-text";

export function ZineSongPage({
	title,
	lyrics,
}: {
	title: string;
	lyrics: string;
}) {
	const layout = getSongPageLayout({
		title,
		lyrics,
		showSectionLabels: true,
	});

	const titleFit = useAutoFitText({
		initialFontSizePt: layout.titleFontSizePt,
		minFontSizePt: 10,
		mode: "single-line",
		contentKey: `${title}-title`,
	});

	const lyricsFit = useAutoFitText({
		initialFontSizePt: layout.lyricsFontSizePt,
		minFontSizePt: 6,
		mode: "multiline",
		contentKey: `${title}-lyrics`,
	});

	return (
		<section className="zine-page flex flex-col px-6 py-8">
			<div
				ref={titleFit.containerRef}
				className="mb-4 w-full shrink-0 overflow-hidden font-semibold leading-none whitespace-nowrap"
				style={{ fontSize: `${titleFit.fontSizePt}pt` }}
			>
				{title}
			</div>
			<div
				ref={lyricsFit.containerRef}
				className="min-h-0 flex-1 overflow-hidden leading-[1.35]"
				style={{ fontSize: `${lyricsFit.fontSizePt}pt` }}
			>
				<LyricsRenderer lyrics={lyrics} showSectionLabels={true} />
			</div>
		</section>
	);
}
```

- [ ] **Step 4: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Skip unless the user explicitly requests a commit.

---

## Task 5: Playlist Lyrics Zine Container

**Files:**
- Create: `src/app/playlist-lyrics/_components/playlist-lyrics-zine.tsx`

- [ ] **Step 1: Implement zine container**

Create `src/app/playlist-lyrics/_components/playlist-lyrics-zine.tsx`:

```tsx
"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, BookOpen, Printer } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import { buildZinePages } from "../_utils/zine-pages";
import { ZineCoverPage } from "./zine-cover-page";
import { ZinePrintStyles } from "./zine-print-styles";
import { ZineSongPage } from "./zine-song-page";

type PlaylistLyricsZineProps = {
	slug: string;
	variant: "private" | "public";
};

export function PlaylistLyricsZine({ slug, variant }: PlaylistLyricsZineProps) {
	const playlistData = useQuery(
		variant === "public"
			? api.playlistLyrics.getPublicBySlug
			: api.playlistLyrics.getBySlug,
		{ slug },
	);

	if (playlistData === undefined) {
		return <PlaylistLyricsZineSkeleton />;
	}

	if (playlistData === null) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-10 text-center">
				<h1 className="mb-4 font-bold text-2xl">Playlist Not Found</h1>
				<Button asChild>
					<Link href={variant === "public" ? "/public/playlist-lyrics" : "/playlist-lyrics"}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Link>
				</Button>
			</div>
		);
	}

	const readerHref =
		variant === "public"
			? `/public/playlist-lyrics/${slug}`
			: `/playlist-lyrics/${slug}`;

	const pages = buildZinePages({
		playlistTitle: playlistData.playlist.title,
		songs: playlistData.songs.map((song) => ({
			id: song._id,
			position: song.position,
			title: song.songTitleOverride ?? song.scrape?.songTitle ?? "Untitled song",
			lyrics: song.scrape?.lyrics ?? "",
		})),
	});

	function handlePrint() {
		window.print();
	}

	return (
		<>
			<ZinePrintStyles />
			<div className="no-print mx-auto mb-6 max-w-4xl px-4 pt-6">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<Button asChild variant="ghost" className="self-start">
						<Link href={readerHref}>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to Reader
						</Link>
					</Button>
					<div className="flex flex-wrap gap-2">
						<Button onClick={handlePrint}>
							<Printer className="mr-2 h-4 w-4" />
							Print Zine
						</Button>
					</div>
				</div>
				<p className="mt-4 text-muted-foreground text-sm">
					{pages.length} pages (padded for booklet printing). Save as PDF, then
					print from Preview with Layout → Booklet.
				</p>
			</div>

			<div className="zine-document">
				{pages.map((page, index) => {
					if (page.kind === "cover") {
						return (
							<ZineCoverPage
								key={`cover-${index}`}
								playlistTitle={page.playlistTitle}
							/>
						);
					}

					if (page.kind === "song") {
						return (
							<ZineSongPage
								key={page.songId}
								title={page.title}
								lyrics={page.lyrics}
							/>
						);
					}

					return <section key={`blank-${index}`} className="zine-page" aria-hidden="true" />;
				})}
			</div>
		</>
	);
}

export function PrivatePlaylistLyricsZine({ slug }: { slug: string }) {
	return <PlaylistLyricsZine slug={slug} variant="private" />;
}

export function PublicPlaylistLyricsZine({ slug }: { slug: string }) {
	return <PlaylistLyricsZine slug={slug} variant="public" />;
}

function PlaylistLyricsZineSkeleton() {
	return (
		<div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
			<Skeleton className="h-10 w-48" />
			<Skeleton className="mx-auto h-[8.5in] w-[5.5in]" />
		</div>
	);
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

Skip unless the user explicitly requests a commit.

---

## Task 6: Routes And Reader Link

**Files:**
- Create: `src/app/playlist-lyrics/[slug]/zine/page.tsx`
- Create: `src/app/public/playlist-lyrics/[slug]/zine/page.tsx`
- Modify: `src/app/playlist-lyrics/_components/playlist-lyrics-reader.tsx`

- [ ] **Step 1: Add authenticated zine route**

Create `src/app/playlist-lyrics/[slug]/zine/page.tsx`:

```tsx
import type React from "react";
import { PrivatePlaylistLyricsZine } from "../../_components/playlist-lyrics-zine";

export default async function PlaylistLyricsZinePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<React.JSX.Element> {
	const { slug } = await params;

	return <PrivatePlaylistLyricsZine slug={slug} />;
}
```

- [ ] **Step 2: Add public zine route**

Create `src/app/public/playlist-lyrics/[slug]/zine/page.tsx`:

```tsx
import type React from "react";
import { PublicPlaylistLyricsZine } from "../../../playlist-lyrics/_components/playlist-lyrics-zine";

export default async function PublicPlaylistLyricsZinePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<React.JSX.Element> {
	const { slug } = await params;

	return <PublicPlaylistLyricsZine slug={slug} />;
}
```

- [ ] **Step 3: Add zine link to existing reader toolbar**

In `src/app/playlist-lyrics/_components/playlist-lyrics-reader.tsx`:

1. Add `BookOpen` to the lucide import.
2. Inside the private/public toolbar button group (next to Print and 2-Column), add:

```tsx
<Button asChild variant="outline">
	<Link href={variant === "public" ? `/public/playlist-lyrics/${slug}/zine` : `/playlist-lyrics/${slug}/zine`}>
		<BookOpen className="mr-2 h-4 w-4" />
		Zine
	</Link>
</Button>
```

- [ ] **Step 4: Run lint and typecheck**

Run:

```bash
pnpm typecheck
pnpm check
```

Expected: PASS with no new errors.

- [ ] **Step 5: Manual verification**

Run:

```bash
pnpm dev
```

Then in the browser:

1. Open an existing playlist at `/playlist-lyrics/[slug]`.
2. Click **Zine**.
3. Confirm page 1 shows only the playlist title.
4. Confirm each song with lyrics gets its own half-letter page preview.
5. Click **Print Zine** and confirm the browser print preview shows one song per page at 5.5" × 8.5".
6. Save PDF and open in Preview → Print → Layout: Booklet to confirm imposition works.

- [ ] **Step 6: Commit**

Skip unless the user explicitly requests a commit.

---

## Task 7: Run Full Test Suite For Touched Areas

**Files:**
- Test: `src/app/playlist-lyrics/_utils/zine-layout.test.ts`
- Test: `src/app/playlist-lyrics/_utils/zine-pages.test.ts`
- Test: `src/app/playlist-lyrics/_components/lyrics-renderer.test.tsx`

- [ ] **Step 1: Run all playlist-lyrics and zine tests**

Run:

```bash
node --import tsx --test src/app/playlist-lyrics/_utils/zine-layout.test.ts src/app/playlist-lyrics/_utils/zine-pages.test.ts src/app/playlist-lyrics/_components/lyrics-renderer.test.tsx convex/_utils/playlistLyrics.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Final typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

Skip unless the user explicitly requests a commit.

---

## Self-Review

**Spec coverage:**
- Playlist lyrics only → uses existing `getBySlug` / `getPublicBySlug`, no album lyrics routes.
- Front page is playlist name only → `ZineCoverPage`.
- One song per page → `buildZinePages` emits one `song` page per ready track.
- Auto-scale lyrics to fit page → `getSongPageLayout` + `useAutoFitText` multiline mode.
- Title on one line with shrink-to-fit → `whitespace-nowrap` + `useAutoFitText` single-line mode.
- Separate view from existing print reader → new `/zine` routes and components; existing reader unchanged except link.

**Placeholder scan:** No TBD steps; each task includes concrete file paths and code.

**Type consistency:** `ZinePage`, `ZineSongInput`, and component props use the same `title` / `lyrics` / `playlistTitle` field names throughout.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-playlist-lyrics-zine.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
