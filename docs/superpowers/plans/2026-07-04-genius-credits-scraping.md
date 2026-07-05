# Genius Credits Scraping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape structured Genius song credits for future lyric scrapes and store them on both album songs and playlist lyric scrape records.

**Architecture:** Add one shared credits extractor in `convex/_utils/geniusParser.ts`, then thread its `GeniusCredit[]` result through the playlist scrape builder, playlist scrape storage, album Convex storage, and the `/api/scrape-genius` album scrape route used by `/lyrics`. Existing records remain valid because `credits` is optional.

**Tech Stack:** TypeScript, Convex validators/schema, Next.js API routes, `node-html-parser`, `node:test` via `pnpm exec tsx --test`.

---

## File Structure

- Modify `convex/_utils/geniusParser.ts`: export shared `GeniusCredit` types and `extractCredits(html)`.
- Create `convex/_utils/geniusParser.test.ts`: focused parser tests for credits extraction.
- Modify `convex/_utils/playlistLyrics.ts`: include `credits` in `GeniusSongScrapeInput` and `buildGeniusSongScrape`.
- Modify `convex/_utils/playlistLyrics.test.ts`: assert playlist scrape builder includes structured credits.
- Modify `convex/schema.ts`: add optional `credits` arrays to `geniusSongs` and `geniusLyricScrapes`.
- Modify `convex/playlistLyrics.ts`: add validators and write `credits` through upsert/sync/public-private return shapes.
- Modify `convex/geniusAlbums.ts`: add validator, `createSong` argument, and Convex action extraction.
- Modify `src/app/api/scrape-genius/route.ts`: extract credits in the Next album scraper response.
- Modify `src/app/lyrics/page.tsx`: pass `song.credits` to `createSongMutation`.

Do not add UI display or backfill behavior in this plan.

---

### Task 1: Shared Credits Parser

**Files:**
- Modify: `convex/_utils/geniusParser.ts`
- Create: `convex/_utils/geniusParser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `convex/_utils/geniusParser.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { extractCredits } from "./geniusParser";

const creditsHtml = `
	<div data-testid="song-info-outer">
		<div data-testid="song-info">
			<div id="song-info"></div>
			<div class="SongInfo__Title">Credits</div>
			<div class="SongCredits__Columns">
				<div class="Credit__Container">
					<div class="Credit__Label">Released on</div>
					<div class="Credit__Contributor">October 6, 2014</div>
				</div>
				<div class="Credit__Container">
					<div class="Credit__Label">Producer</div>
					<div class="Credit__Contributor">
						<div><a href="https://genius.com/artists/Flying-lotus">Flying Lotus</a></div>
					</div>
				</div>
				<div class="Credit__Container">
					<div class="Credit__Label">Writers</div>
					<div class="Credit__Contributor">
						<div>
							<a href="/artists/Niki-randa">Niki Randa</a>
							&amp;
							<a href="https://genius.com/artists/Flying-lotus">Flying Lotus</a>
						</div>
					</div>
				</div>
				<div class="SongTags__Container">
					<div class="SongTags__Title">Tags</div>
					<div><a href="https://genius.com/tags/rock">Rock</a></div>
				</div>
			</div>
		</div>
	</div>
`;

test("extractCredits returns structured credits from Genius song info", () => {
	assert.deepEqual(extractCredits(creditsHtml), [
		{
			label: "Released on",
			contributors: [{ name: "October 6, 2014" }],
		},
		{
			label: "Producer",
			contributors: [
				{
					name: "Flying Lotus",
					url: "https://genius.com/artists/Flying-lotus",
				},
			],
		},
		{
			label: "Writers",
			contributors: [
				{
					name: "Niki Randa",
					url: "https://genius.com/artists/Niki-randa",
				},
				{
					name: "Flying Lotus",
					url: "https://genius.com/artists/Flying-lotus",
				},
			],
		},
	]);
});

test("extractCredits returns undefined when credits are absent", () => {
	assert.equal(
		extractCredits('<div data-testid="song-info"><div>Tags</div></div>'),
		undefined,
	);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec tsx --test convex/_utils/geniusParser.test.ts
```

Expected: FAIL because `extractCredits` is not exported.

- [ ] **Step 3: Implement parser and exported types**

In `convex/_utils/geniusParser.ts`, add imports at the top:

```typescript
import { NodeType, parse as parseHTML } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
```

Add these exports after the file header:

```typescript
export type GeniusCreditContributor = {
	name: string;
	url?: string;
};

export type GeniusCredit = {
	label: string;
	contributors: GeniusCreditContributor[];
};
```

Add this function near the existing extraction functions:

```typescript
export function extractCredits(html: string): GeniusCredit[] | undefined {
	const root = parseHTML(html);
	const songInfo =
		root.querySelector('[data-testid="song-info"]') ??
		root.querySelector('[data-testid="song-info-outer"]');
	if (!songInfo) return undefined;

	const creditsTitle = songInfo
		.querySelectorAll("div")
		.find((element) => normalizeText(element.textContent) === "Credits");
	if (!creditsTitle) return undefined;

	const section = getElementParent(creditsTitle) ?? songInfo;
	const credits: GeniusCredit[] = [];

	for (const element of section.querySelectorAll("div")) {
		if (element === creditsTitle) continue;
		if (isTagsElement(element)) continue;

		const children = getElementChildren(element);
		if (children.length < 2) continue;

		const label = normalizeText(children[0]?.textContent ?? "");
		if (!label || label === "Credits" || label === "Tags") continue;

		const contributorElement = children[1];
		if (!contributorElement) continue;

		const contributors = extractCreditContributors(contributorElement);
		if (contributors.length === 0) continue;

		if (credits.some((credit) => credit.label === label)) continue;
		credits.push({ label, contributors });
	}

	return credits.length > 0 ? credits : undefined;
}
```

Add helpers below it:

```typescript
function extractCreditContributors(element: HTMLElement): GeniusCreditContributor[] {
	const links = element.querySelectorAll("a");
	if (links.length > 0) {
		return links
			.map((link) => {
				const name = normalizeText(link.textContent);
				const url = normalizeGeniusUrl(link.getAttribute("href"));
				if (!name) return undefined;
				return url ? { name, url } : { name };
			})
			.filter((contributor): contributor is GeniusCreditContributor =>
				Boolean(contributor),
			);
	}

	const name = normalizeText(element.textContent);
	return name ? [{ name }] : [];
}

function getElementChildren(element: HTMLElement): HTMLElement[] {
	return element.childNodes.filter(
		(child): child is HTMLElement => child.nodeType === NodeType.ELEMENT_NODE,
	);
}

function getElementParent(element: HTMLElement): HTMLElement | undefined {
	const parent = element.parentNode;
	return parent?.nodeType === NodeType.ELEMENT_NODE
		? (parent as HTMLElement)
		: undefined;
}

function isTagsElement(element: HTMLElement): boolean {
	return normalizeText(element.textContent).startsWith("Tags");
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function normalizeGeniusUrl(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	if (trimmed.startsWith("https://genius.com/")) return trimmed;
	if (trimmed.startsWith("/")) return `https://genius.com${trimmed}`;
	return trimmed;
}
```

- [ ] **Step 4: Run parser tests to verify they pass**

Run:

```bash
pnpm exec tsx --test convex/_utils/geniusParser.test.ts
```

Expected: PASS with 2 tests.

---

### Task 2: Playlist Scrape Builder Includes Credits

**Files:**
- Modify: `convex/_utils/playlistLyrics.ts`
- Modify: `convex/_utils/playlistLyrics.test.ts`

- [ ] **Step 1: Write failing playlist scrape builder test**

In `convex/_utils/playlistLyrics.test.ts`, add this test after the existing `buildGeniusSongScrape extracts ready scrape input from Genius HTML` test:

```typescript
test("buildGeniusSongScrape includes structured Genius credits", () => {
	const html = `
		<h1 class="SongHeader__Title"><span>Coronus, The Terminator</span></h1>
		<h2 class="SongHeader__Title">
			<div class="HoverMarquee"><span>Flying Lotus</span></div>
		</h2>
		<a class="PrimaryAlbum__Title" href="/albums/Flying-lotus/Youre-dead">You're Dead!</a>
		<div data-lyrics-container="true">The days of men are coming to an end</div>
		<div data-testid="song-info">
			<div class="SongInfo__Title">Credits</div>
			<div class="SongCredits__Columns">
				<div class="Credit__Container">
					<div class="Credit__Label">Producer</div>
					<div class="Credit__Contributor">
						<a href="https://genius.com/artists/Flying-lotus">Flying Lotus</a>
					</div>
				</div>
				<div class="Credit__Container">
					<div class="Credit__Label">Released on</div>
					<div class="Credit__Contributor">October 6, 2014</div>
				</div>
			</div>
		</div>
	`;

	const result = buildGeniusSongScrape({
		canonicalUrl:
			"https://genius.com/Flying-lotus-coronus-the-terminator-lyrics",
		html,
	});

	assert.deepEqual(result.credits, [
		{
			label: "Producer",
			contributors: [
				{
					name: "Flying Lotus",
					url: "https://genius.com/artists/Flying-lotus",
				},
			],
		},
		{
			label: "Released on",
			contributors: [{ name: "October 6, 2014" }],
		},
	]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test convex/_utils/playlistLyrics.test.ts
```

Expected: FAIL because `result.credits` is undefined.

- [ ] **Step 3: Thread credits through playlist scrape input**

In `convex/_utils/playlistLyrics.ts`, change the import from `geniusParser` to include types and extractor:

```typescript
import {
	type GeniusCredit,
	extractAlbumMetadata,
	extractCredits,
	extractSongTitle,
} from "./geniusParser";
```

Add `credits` to `GeniusSongScrapeInput`:

```typescript
export type GeniusSongScrapeInput = {
	canonicalUrl: string;
	songTitle: string;
	artistName: string;
	albumTitle?: string;
	albumYear?: string;
	albumArtUrl?: string;
	lyrics: string;
	about?: string;
	credits?: GeniusCredit[];
};
```

Inside `buildGeniusSongScrape`, compute credits:

```typescript
const credits = extractCredits(html);
```

Return credits only when present:

```typescript
return {
	canonicalUrl,
	songTitle,
	artistName: metadata.artistName,
	albumTitle: album.albumTitle,
	albumYear: album.albumYear,
	...(albumArtUrl ? { albumArtUrl } : {}),
	lyrics,
	about,
	...(credits ? { credits } : {}),
};
```

- [ ] **Step 4: Run playlist utility tests**

Run:

```bash
pnpm exec tsx --test convex/_utils/playlistLyrics.test.ts
```

Expected: PASS, including the new credits builder test.

---

### Task 3: Playlist Credits Storage

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/playlistLyrics.ts`

- [ ] **Step 1: Add Convex schema field**

In `convex/schema.ts`, add this validator near the top after imports:

```typescript
const geniusCreditValidator = v.object({
	label: v.string(),
	contributors: v.array(
		v.object({
			name: v.string(),
			url: v.optional(v.string()),
		}),
	),
});
```

Add `credits: v.optional(v.array(geniusCreditValidator)),` to `geniusLyricScrapes` after `about`.

- [ ] **Step 2: Add playlist validators and types**

In `convex/playlistLyrics.ts`, add this validator after `itemScrapeStateValidator`:

```typescript
const geniusCreditValidator = v.object({
	label: v.string(),
	contributors: v.array(
		v.object({
			name: v.string(),
			url: v.optional(v.string()),
		}),
	),
});
```

Add `credits: v.optional(v.array(geniusCreditValidator)),` to:

- `scrapeValidator`
- `publicScrapeValidator`
- `syncScrapeInputValidator`
- `upsertScrape.args`

Add `credits?: Array<{ label: string; contributors: Array<{ name: string; url?: string }> }>;` to `ScrapeUpsertInput`.

Add a reusable local type above `ScrapeUpsertInput` so normalization can stay type-safe:

```typescript
type GeniusCreditInput = {
	label: string;
	contributors: Array<{
		name: string;
		url?: string;
	}>;
};
```

Then use it in `ScrapeUpsertInput`:

```typescript
credits?: GeniusCreditInput[];
```

- [ ] **Step 3: Store credits in upsert path**

In `upsertScrapeRow`, add credits to the `scrape` object:

```typescript
credits: normalizeCredits(input.credits),
```

Add this helper near `normalizeOptionalString`:

```typescript
function normalizeCredits(
	credits: ScrapeUpsertInput["credits"],
): GeniusCreditInput[] | undefined {
	if (!credits || credits.length === 0) return undefined;

	const normalized: GeniusCreditInput[] = [];

	for (const credit of credits) {
		const label = normalizeOptionalString(credit.label);
		if (!label) continue;

		const contributors: GeniusCreditInput["contributors"] = [];
		for (const contributor of credit.contributors) {
			const name = normalizeOptionalString(contributor.name);
			if (!name) continue;

			const url = normalizeOptionalString(contributor.url);
			contributors.push(url ? { name, url } : { name });
		}

		if (contributors.length > 0) {
			normalized.push({ label, contributors });
		}
	}

	return normalized.length > 0 ? normalized : undefined;
}
```

In `toPublicItemWithScrape`, include:

```typescript
credits: item.scrape.credits,
```

- [ ] **Step 4: Run verification for playlist storage**

Run:

```bash
pnpm exec tsx --test convex/_utils/playlistLyrics.test.ts
pnpm typecheck
```

Expected: utility tests pass and TypeScript exits 0.

---

### Task 4: Album Credits Storage and `/lyrics` Flow

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/geniusAlbums.ts`
- Modify: `src/app/api/scrape-genius/route.ts`
- Modify: `src/app/lyrics/page.tsx`

- [ ] **Step 1: Add schema field for album songs**

In `convex/schema.ts`, add `credits: v.optional(v.array(geniusCreditValidator)),` to `geniusSongs` after `about`.

- [ ] **Step 2: Update `convex/geniusAlbums.ts` validators and Convex action path**

Change imports:

```typescript
import {
	extractAbout,
	extractAlbumMetadata,
	extractAlbumTracklist,
	extractCredits,
	extractLyrics,
	extractSongTitle,
	slugify,
} from "./_utils/geniusParser";
```

Add the local Convex validator near the top:

```typescript
const geniusCreditValidator = v.object({
	label: v.string(),
	contributors: v.array(
		v.object({
			name: v.string(),
			url: v.optional(v.string()),
		}),
	),
});
```

Add `credits: v.optional(v.array(geniusCreditValidator)),` to `createSong.args`.

Write it during insert:

```typescript
credits: args.credits,
```

In `scrapeAndStoreAlbum`, after `const about = extractAbout(songHtml);`, add:

```typescript
const credits = extractCredits(songHtml);
```

Pass it into `createSong`:

```typescript
credits,
```

If the imported `GeniusCredit` type is not needed after implementation, remove it.

- [ ] **Step 3: Update `/api/scrape-genius` response path**

In `src/app/api/scrape-genius/route.ts`, import the shared extractor and type:

```typescript
import {
	type GeniusCredit,
	extractCredits,
} from "../../../../convex/_utils/geniusParser";
```

Add `credits?: GeniusCredit[];` to `SongData`.

After extracting `about`, add:

```typescript
const credits = extractCredits(songHtml);
```

Include it in the pushed song:

```typescript
credits,
```

- [ ] **Step 4: Pass credits from `/lyrics` page into Convex**

In `src/app/lyrics/page.tsx`, update the `createSongMutation` call:

```typescript
await createSongMutation({
	albumId,
	songTitle: song.songTitle,
	geniusSongUrl: song.geniusSongUrl,
	trackNumber: song.trackNumber,
	lyrics: song.lyrics,
	about: song.about,
	credits: song.credits,
});
```

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm exec tsx --test convex/_utils/geniusParser.test.ts convex/_utils/playlistLyrics.test.ts
pnpm typecheck
pnpm check
```

Expected:

- Parser tests pass.
- Playlist utility tests pass.
- TypeScript exits 0.
- Biome check exits 0.

---

## Execution Notes

- Do not backfill existing records.
- Do not add UI rendering for credits.
- Do not store raw HTML.
- If a test fails because Genius markup parsing is too broad, narrow parsing around the `Credits` title and row structure rather than relying on full CSS class names.
- Do not commit implementation changes unless the user explicitly authorizes commits for the execution phase.
