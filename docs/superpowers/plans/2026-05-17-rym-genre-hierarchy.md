# RYM Genre Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse `genresfromrym.hml`, store every RYM genre, and store every parent-child genre relationship, including duplicate/multiple-parent relationships such as one genre appearing under more than one parent.

**Architecture:** Keep `rateYourMusicGenres` as the canonical genre table used by release scrapes and add one separate edge table for hierarchy relationships. Parse the local RYM genre index HTML with a pure utility, then import the parsed genres and relationships through small Convex internal mutations called by a local batch script.

**Tech Stack:** Convex schema/internal mutations, TypeScript, `node-html-parser`, `node:test`, existing RYM taxonomy helpers, Biome, `pnpm exec convex run`.

---

## Scope Check

This is one subsystem: RYM genre taxonomy storage. It does not change release scraping behavior beyond enriching the existing genre rows with optional metadata and making the genre filter query able to return all imported genres.

## File Structure

- Create `convex/_utils/rymGenreHierarchy.ts`: Pure HTML parser and flattener for the RYM genre index tree.
- Create `convex/_utils/rymGenreHierarchy.test.ts`: Focused parser tests using `node:test`.
- Modify `convex/schema.ts`: Add optional metadata to `rateYourMusicGenres` and add `rateYourMusicGenreRelationships`.
- Modify `convex/_utils/rateYourMusicTaxonomy.ts`: Let `ensureGenreId` update optional genre metadata without changing current release-scrape callers.
- Create `convex/rymGenreHierarchy.ts`: Thin Convex internal mutations for clearing relationships, upserting genre batches, and inserting relationship batches.
- Create `scripts/import-rym-genre-hierarchy.ts`: Local importer that parses `genresfromrym.hml` and calls Convex in chunks.
- Modify `package.json`: Add `import:rym-genres`.
- Modify `convex/rateYourMusicScrapes.ts`: Return the imported genre list by label order and allow more than 500 genres.
- Modify `src/app/for-later-albums/_components/for-later-filters.tsx`: Request enough genre options for the full RYM taxonomy.

## Data Model

`rateYourMusicGenres` remains one row per normalized genre label:

- `key`: existing normalized key from the label, for compatibility with release scrape filters.
- `label`: display label.
- `href`: RYM genre URL path such as `/genre/dark-ambient/`.
- `description`: optional text from the genre index.
- `isTopLevel`: optional boolean for root genre families.
- `createdAt`, `updatedAt`: timestamps.

`rateYourMusicGenreRelationships` stores one row per parent-child edge:

- `parentGenreId`, `childGenreId`: canonical genre row IDs.
- `parentKey`, `childKey`: denormalized keys for easy lookup and repair.
- `position`: child order within that parent in the RYM page.
- `createdAt`, `updatedAt`: timestamps.

This edge table is required because the real HTML contains genres with multiple parents.

### Task 1: Parser Test

**Files:**
- Create: `convex/_utils/rymGenreHierarchy.test.ts`
- Create later: `convex/_utils/rymGenreHierarchy.ts`

- [ ] **Step 1: Write the failing parser test**

Create `convex/_utils/rymGenreHierarchy.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	flattenRymGenreHierarchy,
	parseRymGenreHierarchyHtml,
} from "./rymGenreHierarchy";

const SAMPLE_HTML = `
<ul class="page_genre_index_hierarchy">
	<li class="page_genre_index_hierarchy_item anchor expanded">
		<div class="page_genre_index_hierarchy_item_main">
			<div class="page_genre_index_hierarchy_item_main_inner">
				<h2><a href="/genre/blues/">Blues</a></h2>
				<p class="page_genre_index_hierarchy_item_description">Root blues description.</p>
			</div>
		</div>
		<div class="page_genre_index_hierarchy_item_expanded">
			<p class="page_genre_index_hierarchy_item_description_expanded">Expanded blues description.</p>
			<ul class="hierarchy_list">
				<li class="hierarchy_list_item">
					<div class="hierarchy_list_item_details">
						<a href="/genre/acoustic-blues/">Acoustic Blues</a>
						<p>Developed out of Work Song and Spiritual.</p>
					</div>
					<ul class="hierarchy_list">
						<li class="hierarchy_list_item">
							<div class="hierarchy_list_item_details">
								<a href="/genre/acoustic-texas-blues/">Acoustic Texas Blues</a>
								<p>Laid-back swing rhythms.</p>
							</div>
						</li>
					</ul>
				</li>
			</ul>
			<ul class="hierarchy_list">
				<li class="hierarchy_list_item">
					<div class="hierarchy_list_item_details">
						<a href="/genre/country-blues/">Country Blues</a>
						<p>Rural US South blues.</p>
					</div>
					<ul class="hierarchy_list">
						<li class="hierarchy_list_item">
							<div class="hierarchy_list_item_details">
								<a href="/genre/acoustic-texas-blues/">Acoustic Texas Blues</a>
								<p>Laid-back swing rhythms.</p>
							</div>
						</li>
					</ul>
				</li>
			</ul>
		</div>
	</li>
	<li class="page_genre_index_hierarchy_item anchor expanded">
		<div class="page_genre_index_hierarchy_item_main">
			<div class="page_genre_index_hierarchy_item_main_inner">
				<h2><a href="https://rateyourmusic.com/genre/ambient/">Ambient</a></h2>
				<p class="page_genre_index_hierarchy_item_description">Atmosphere and mood.</p>
			</div>
		</div>
		<div class="page_genre_index_hierarchy_item_expanded">
			<ul class="hierarchy_list">
				<li class="hierarchy_list_item">
					<div class="hierarchy_list_item_details">
						<a href="/genre/dark-ambient/">Dark Ambient</a>
						<p>Ominous atmosphere.</p>
					</div>
				</li>
			</ul>
		</div>
	</li>
</ul>
`;

test("parseRymGenreHierarchyHtml preserves top-level and nested genres", () => {
	const tree = parseRymGenreHierarchyHtml(SAMPLE_HTML);

	assert.equal(tree.length, 2);
	assert.equal(tree[0]?.key, "blues");
	assert.equal(tree[0]?.label, "Blues");
	assert.equal(tree[0]?.href, "/genre/blues/");
	assert.equal(tree[0]?.description, "Expanded blues description.");
	assert.equal(tree[0]?.children.length, 2);
	assert.equal(tree[0]?.children[0]?.key, "acoustic blues");
	assert.equal(tree[0]?.children[0]?.children[0]?.key, "acoustic texas blues");
	assert.equal(tree[1]?.href, "/genre/ambient/");
});

test("flattenRymGenreHierarchy dedupes genres but keeps multiple parent edges", () => {
	const flat = flattenRymGenreHierarchy(parseRymGenreHierarchyHtml(SAMPLE_HTML));

	assert.deepEqual(
		flat.genres.map((genre) => genre.key).sort(),
		[
			"acoustic blues",
			"acoustic texas blues",
			"ambient",
			"blues",
			"country blues",
			"dark ambient",
		],
	);

	assert.deepEqual(
		flat.relationships
			.map((relationship) => [
				relationship.parentKey,
				relationship.childKey,
				relationship.position,
			])
			.sort(),
		[
			["acoustic blues", "acoustic texas blues", 0],
			["ambient", "dark ambient", 0],
			["blues", "acoustic blues", 0],
			["blues", "country blues", 1],
			["country blues", "acoustic texas blues", 0],
		],
	);

	assert.equal(
		flat.genres.find((genre) => genre.key === "blues")?.isTopLevel,
		true,
	);
	assert.equal(
		flat.genres.find((genre) => genre.key === "acoustic blues")?.isTopLevel,
		false,
	);
});
```

- [ ] **Step 2: Run the parser test to verify it fails**

Run:

```bash
node --test convex/_utils/rymGenreHierarchy.test.ts
```

Expected: FAIL with an import/module error because `convex/_utils/rymGenreHierarchy.ts` does not exist.

### Task 2: Parser Implementation

**Files:**
- Create: `convex/_utils/rymGenreHierarchy.ts`
- Test: `convex/_utils/rymGenreHierarchy.test.ts`

- [ ] **Step 1: Implement the pure parser utility**

Create `convex/_utils/rymGenreHierarchy.ts`:

```typescript
import { HTMLElement, parse } from "node-html-parser";
import { taxonomyKeyFromLabel } from "./rateYourMusicTaxonomy";

export type ParsedRymGenreNode = {
	key: string;
	label: string;
	href?: string;
	description?: string;
	children: ParsedRymGenreNode[];
};

export type FlatRymGenre = {
	key: string;
	label: string;
	href?: string;
	description?: string;
	isTopLevel: boolean;
};

export type FlatRymGenreRelationship = {
	parentKey: string;
	childKey: string;
	position: number;
};

export type FlatRymGenreHierarchy = {
	genres: FlatRymGenre[];
	relationships: FlatRymGenreRelationship[];
};

function normalizeText(value: string | undefined): string {
	return (value ?? "").replace(/\s+/g, " ").trim();
}

function hasClass(node: HTMLElement, className: string): boolean {
	return (node.getAttribute("class") ?? "").split(/\s+/).includes(className);
}

function directElementChildren(node: HTMLElement): HTMLElement[] {
	return node.childNodes.filter(
		(child): child is HTMLElement => child instanceof HTMLElement,
	);
}

function directChildrenWithClass(
	node: HTMLElement,
	className: string,
): HTMLElement[] {
	return directElementChildren(node).filter((child) => hasClass(child, className));
}

function firstDirectChildWithClass(
	node: HTMLElement,
	className: string,
): HTMLElement | undefined {
	return directChildrenWithClass(node, className)[0];
}

function normalizeRymGenreHref(rawHref: string | undefined): string | undefined {
	const trimmed = rawHref?.trim();
	if (!trimmed) {
		return undefined;
	}

	const url = new URL(trimmed, "https://rateyourmusic.com");
	const host = url.hostname.toLowerCase();
	if (host !== "rateyourmusic.com" && host !== "www.rateyourmusic.com") {
		return undefined;
	}
	if (!url.pathname.startsWith("/genre/")) {
		return undefined;
	}

	return url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
}

function parseGenreAnchor(
	anchor: HTMLElement | null | undefined,
	description: string | undefined,
): Omit<ParsedRymGenreNode, "children"> | undefined {
	if (!anchor) {
		return undefined;
	}

	const label = normalizeText(anchor.text);
	const key = taxonomyKeyFromLabel(label);
	if (!key) {
		return undefined;
	}

	const href = normalizeRymGenreHref(anchor.getAttribute("href"));
	const normalizedDescription = normalizeText(description);

	return {
		key,
		label,
		...(href ? { href } : {}),
		...(normalizedDescription ? { description: normalizedDescription } : {}),
	};
}

function parseHierarchyListItem(item: HTMLElement): ParsedRymGenreNode | undefined {
	const details = firstDirectChildWithClass(item, "hierarchy_list_item_details");
	if (!details) {
		return undefined;
	}

	const parsed = parseGenreAnchor(
		details.querySelector("a[href*='/genre/']"),
		details.querySelector("p")?.text,
	);
	if (!parsed) {
		return undefined;
	}

	const children = directChildrenWithClass(item, "hierarchy_list")
		.flatMap((list) => directChildrenWithClass(list, "hierarchy_list_item"))
		.map((child) => parseHierarchyListItem(child))
		.filter((child): child is ParsedRymGenreNode => Boolean(child));

	return {
		...parsed,
		children,
	};
}

function parseTopLevelGenre(item: HTMLElement): ParsedRymGenreNode | undefined {
	const mainAnchor = item.querySelector(
		".page_genre_index_hierarchy_item_main_inner h2 a[href*='/genre/']",
	);
	const expanded = item.querySelector(".page_genre_index_hierarchy_item_expanded");
	const expandedDescription = expanded?.querySelector(
		".page_genre_index_hierarchy_item_description_expanded",
	)?.text;
	const collapsedDescription = item.querySelector(
		".page_genre_index_hierarchy_item_description",
	)?.text;

	const parsed = parseGenreAnchor(
		mainAnchor,
		expandedDescription ?? collapsedDescription,
	);
	if (!parsed) {
		return undefined;
	}

	const children = expanded
		? directChildrenWithClass(expanded, "hierarchy_list")
				.flatMap((list) => directChildrenWithClass(list, "hierarchy_list_item"))
				.map((child) => parseHierarchyListItem(child))
				.filter((child): child is ParsedRymGenreNode => Boolean(child))
		: [];

	return {
		...parsed,
		children,
	};
}

export function parseRymGenreHierarchyHtml(html: string): ParsedRymGenreNode[] {
	const root = parse(html);
	const list = root.querySelector("ul.page_genre_index_hierarchy");
	if (!list) {
		return [];
	}

	return directChildrenWithClass(list, "page_genre_index_hierarchy_item")
		.map((item) => parseTopLevelGenre(item))
		.filter((item): item is ParsedRymGenreNode => Boolean(item));
}

export function flattenRymGenreHierarchy(
	nodes: ParsedRymGenreNode[],
): FlatRymGenreHierarchy {
	const genresByKey = new Map<string, FlatRymGenre>();
	const relationshipsByKey = new Map<string, FlatRymGenreRelationship>();

	function upsertGenre(node: ParsedRymGenreNode, isTopLevel: boolean): void {
		const existing = genresByKey.get(node.key);
		genresByKey.set(node.key, {
			key: node.key,
			label: existing?.label ?? node.label,
			...(existing?.href ?? node.href
				? { href: existing?.href ?? node.href }
				: {}),
			...(existing?.description ?? node.description
				? { description: existing?.description ?? node.description }
				: {}),
			isTopLevel: Boolean(existing?.isTopLevel || isTopLevel),
		});
	}

	function visit(
		node: ParsedRymGenreNode,
		parent: ParsedRymGenreNode | undefined,
		position: number,
		isTopLevel: boolean,
	): void {
		upsertGenre(node, isTopLevel);

		if (parent) {
			const relationshipKey = `${parent.key}\u0000${node.key}`;
			if (!relationshipsByKey.has(relationshipKey)) {
				relationshipsByKey.set(relationshipKey, {
					parentKey: parent.key,
					childKey: node.key,
					position,
				});
			}
		}

		node.children.forEach((child, childPosition) => {
			visit(child, node, childPosition, false);
		});
	}

	nodes.forEach((node, position) => {
		visit(node, undefined, position, true);
	});

	return {
		genres: [...genresByKey.values()].sort((a, b) =>
			a.label.localeCompare(b.label),
		),
		relationships: [...relationshipsByKey.values()].sort((a, b) => {
			const parentCompare = a.parentKey.localeCompare(b.parentKey);
			if (parentCompare !== 0) {
				return parentCompare;
			}
			return a.position - b.position;
		}),
	};
}
```

- [ ] **Step 2: Run the parser test to verify it passes**

Run:

```bash
node --test convex/_utils/rymGenreHierarchy.test.ts
```

Expected: PASS with 2 tests passing.

- [ ] **Step 3: Commit**

```bash
git add convex/_utils/rymGenreHierarchy.ts convex/_utils/rymGenreHierarchy.test.ts
git commit -m "test: add RYM genre hierarchy parser"
```

### Task 3: Schema And Taxonomy Metadata

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/_utils/rateYourMusicTaxonomy.ts`

- [ ] **Step 1: Update the RYM genre schema**

In `convex/schema.ts`, replace the current `rateYourMusicGenres` table block with:

```typescript
	// Rate Your Music taxonomy (keys: trim + lowercase; labels: pretty / first-seen)
	rateYourMusicGenres: defineTable({
		key: v.string(),
		label: v.string(),
		href: v.optional(v.string()),
		description: v.optional(v.string()),
		isTopLevel: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	})
		.index("by_key", ["key"])
		.index("by_label", ["label"])
		.index("by_isTopLevel", ["isTopLevel"])
		.index("by_createdAt", ["createdAt"]),

	rateYourMusicGenreRelationships: defineTable({
		parentGenreId: v.id("rateYourMusicGenres"),
		childGenreId: v.id("rateYourMusicGenres"),
		parentKey: v.string(),
		childKey: v.string(),
		position: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_parentGenreId", ["parentGenreId"])
		.index("by_childGenreId", ["childGenreId"])
		.index("by_parentKey", ["parentKey"])
		.index("by_childKey", ["childKey"])
		.index("by_parentGenreId_childGenreId", ["parentGenreId", "childGenreId"]),
```

Leave `rateYourMusicDescriptors`, `rateYourMusicScrapes`, and release link tables unchanged.

- [ ] **Step 2: Update `ensureGenreId` to patch optional metadata**

In `convex/_utils/rateYourMusicTaxonomy.ts`, replace the current `ensureGenreId` function with:

```typescript
export async function ensureGenreId(
	ctx: MutationCtx,
	args: {
		name: string;
		href?: string | undefined;
		description?: string | undefined;
		isTopLevel?: boolean | undefined;
	},
	now: number,
): Promise<Id<"rateYourMusicGenres">> {
	const label = args.name.trim();
	const key = taxonomyKeyFromLabel(label);
	if (!key) {
		throw new ConvexError("Genre label cannot be empty");
	}
	const existing = await ctx.db
		.query("rateYourMusicGenres")
		.withIndex("by_key", (q) => q.eq("key", key))
		.first();

	const href = args.href?.trim() || undefined;
	const description = args.description?.trim() || undefined;

	if (!existing) {
		return await ctx.db.insert("rateYourMusicGenres", {
			key,
			label,
			...(href ? { href } : {}),
			...(description ? { description } : {}),
			...(args.isTopLevel !== undefined ? { isTopLevel: args.isTopLevel } : {}),
			createdAt: now,
			updatedAt: now,
		});
	}

	const patch: Partial<{
		label: string;
		href: string;
		description: string;
		isTopLevel: boolean;
		updatedAt: number;
	}> = {};

	if (label && existing.label !== label) {
		patch.label = label;
	}
	if (href && existing.href !== href) {
		patch.href = href;
	}
	if (description && existing.description !== description) {
		patch.description = description;
	}
	if (
		args.isTopLevel !== undefined &&
		existing.isTopLevel !== args.isTopLevel
	) {
		patch.isTopLevel = args.isTopLevel;
	}
	if (Object.keys(patch).length > 0) {
		patch.updatedAt = now;
		await ctx.db.patch(existing._id, patch);
	}

	return existing._id;
}
```

- [ ] **Step 3: Regenerate Convex types**

Run:

```bash
pnpm exec convex codegen
```

Expected: generated Convex types update without errors.

- [ ] **Step 4: Run focused parser tests**

Run:

```bash
node --test convex/_utils/rymGenreHierarchy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/_utils/rateYourMusicTaxonomy.ts convex/_generated
git commit -m "feat: add RYM genre hierarchy schema"
```

### Task 4: Convex Import Mutations

**Files:**
- Create: `convex/rymGenreHierarchy.ts`

- [ ] **Step 1: Add thin internal mutations**

Create `convex/rymGenreHierarchy.ts`:

```typescript
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import {
	ensureGenreId,
	taxonomyKeyFromLabel,
} from "./_utils/rateYourMusicTaxonomy";

const rymGenreInputValidator = v.object({
	key: v.string(),
	label: v.string(),
	href: v.optional(v.string()),
	description: v.optional(v.string()),
	isTopLevel: v.boolean(),
});

const rymGenreRelationshipInputValidator = v.object({
	parentKey: v.string(),
	childKey: v.string(),
	position: v.number(),
});

async function getGenreIdByKey(
	ctx: MutationCtx,
	key: string,
): Promise<Id<"rateYourMusicGenres">> {
	const genre = await ctx.db
		.query("rateYourMusicGenres")
		.withIndex("by_key", (q) => q.eq("key", key))
		.first();

	if (!genre) {
		throw new ConvexError(`Missing RYM genre for key: ${key}`);
	}

	return genre._id;
}

export const clearRateYourMusicGenreRelationships = internalMutation({
	args: {},
	returns: v.object({
		deleted: v.number(),
	}),
	handler: async (ctx): Promise<{ deleted: number }> => {
		const existing = await ctx.db
			.query("rateYourMusicGenreRelationships")
			.collect();

		for (const relationship of existing) {
			await ctx.db.delete(relationship._id);
		}

		return { deleted: existing.length };
	},
});

export const upsertRateYourMusicGenreBatch = internalMutation({
	args: {
		genres: v.array(rymGenreInputValidator),
	},
	returns: v.object({
		upserted: v.number(),
	}),
	handler: async (ctx, args): Promise<{ upserted: number }> => {
		const now = Date.now();

		for (const genre of args.genres) {
			const key = taxonomyKeyFromLabel(genre.label);
			if (key !== genre.key) {
				throw new ConvexError(
					`Genre key mismatch for ${genre.label}: expected ${key}, received ${genre.key}`,
				);
			}

			await ensureGenreId(
				ctx,
				{
					name: genre.label,
					href: genre.href,
					description: genre.description,
					isTopLevel: genre.isTopLevel,
				},
				now,
			);
		}

		return { upserted: args.genres.length };
	},
});

export const insertRateYourMusicGenreRelationshipBatch = internalMutation({
	args: {
		relationships: v.array(rymGenreRelationshipInputValidator),
	},
	returns: v.object({
		inserted: v.number(),
	}),
	handler: async (ctx, args): Promise<{ inserted: number }> => {
		const now = Date.now();
		let inserted = 0;

		for (const relationship of args.relationships) {
			const parentGenreId = await getGenreIdByKey(ctx, relationship.parentKey);
			const childGenreId = await getGenreIdByKey(ctx, relationship.childKey);

			await ctx.db.insert("rateYourMusicGenreRelationships", {
				parentGenreId,
				childGenreId,
				parentKey: relationship.parentKey,
				childKey: relationship.childKey,
				position: relationship.position,
				createdAt: now,
				updatedAt: now,
			});
			inserted += 1;
		}

		return { inserted };
	},
});
```

- [ ] **Step 2: Regenerate Convex types**

Run:

```bash
pnpm exec convex codegen
```

Expected: generated API includes `internal.rymGenreHierarchy`.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add convex/rymGenreHierarchy.ts convex/_generated
git commit -m "feat: add RYM genre hierarchy import mutations"
```

### Task 5: Import Script

**Files:**
- Create: `scripts/import-rym-genre-hierarchy.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the importer script**

Create `scripts/import-rym-genre-hierarchy.ts`:

```typescript
#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	flattenRymGenreHierarchy,
	parseRymGenreHierarchyHtml,
} from "../convex/_utils/rymGenreHierarchy";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const prod = args.includes("--prod");
const inputArg = args.find((arg) => arg !== "--prod") ?? "genresfromrym.hml";
const inputPath = resolve(root, inputArg);
const BATCH_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function runConvex(functionName: string, payload: unknown): unknown {
	const commandArgs = ["exec", "convex", "run"];
	if (prod) {
		commandArgs.push("--prod");
	}
	commandArgs.push(functionName, JSON.stringify(payload));

	const stdout = execFileSync("pnpm", commandArgs, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	}).trim();

	return stdout ? JSON.parse(stdout) : null;
}

const html = readFileSync(inputPath, "utf8");
const parsed = flattenRymGenreHierarchy(parseRymGenreHierarchyHtml(html));

console.log(
	`Parsed ${parsed.genres.length} unique genres and ${parsed.relationships.length} parent relationships from ${relative(root, inputPath)}`,
);

const clearResult = runConvex(
	"internal.rymGenreHierarchy.clearRateYourMusicGenreRelationships",
	{},
) as { deleted: number };
console.log(`Cleared ${clearResult.deleted} existing parent relationships`);

let totalGenres = 0;
for (const batch of chunk(parsed.genres, BATCH_SIZE)) {
	const result = runConvex(
		"internal.rymGenreHierarchy.upsertRateYourMusicGenreBatch",
		{ genres: batch },
	) as { upserted: number };
	totalGenres += result.upserted;
	console.log(`Upserted ${totalGenres}/${parsed.genres.length} genres`);
}

let totalRelationships = 0;
for (const batch of chunk(parsed.relationships, BATCH_SIZE)) {
	const result = runConvex(
		"internal.rymGenreHierarchy.insertRateYourMusicGenreRelationshipBatch",
		{ relationships: batch },
	) as { inserted: number };
	totalRelationships += result.inserted;
	console.log(
		`Inserted ${totalRelationships}/${parsed.relationships.length} parent relationships`,
	);
}

console.log("Done.");
```

- [ ] **Step 2: Add the package script**

In `package.json`, add this script after `backfill:for-later-projection`:

```json
"import:rym-genres": "tsx scripts/import-rym-genre-hierarchy.ts genresfromrym.hml"
```

The `scripts` section should end like this:

```json
		"infra:destroy": "pulumi destroy",
		"migrate:lyrics": "node scripts/migrate-lyrics-to-prod.js",
		"backfill:for-later-projection": "node scripts/backfill-for-later-filter-projection.mjs",
		"import:rym-genres": "tsx scripts/import-rym-genre-hierarchy.ts genresfromrym.hml"
```

- [ ] **Step 3: Run the parser test**

Run:

```bash
node --test convex/_utils/rymGenreHierarchy.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import-rym-genre-hierarchy.ts package.json
git commit -m "feat: add RYM genre hierarchy importer"
```

### Task 6: Surface All Imported Genres To Filters

**Files:**
- Modify: `convex/rateYourMusicScrapes.ts`
- Modify: `src/app/for-later-albums/_components/for-later-filters.tsx`

- [ ] **Step 1: Update the genre list query**

In `convex/rateYourMusicScrapes.ts`, replace `listRateYourMusicGenreKeys` with:

```typescript
export const listRateYourMusicGenreKeys = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const limit = Math.min(Math.max(args.limit ?? 3000, 1), 3000);

		const rows = await ctx.db
			.query("rateYourMusicGenres")
			.withIndex("by_label")
			.take(limit);

		return rows.map((r) => ({
			key: r.key,
			label: r.label,
		}));
	},
});
```

- [ ] **Step 2: Request the full taxonomy in the filter UI**

In `src/app/for-later-albums/_components/for-later-filters.tsx`, replace:

```typescript
	const genreOptions = useQuery(
		api.rateYourMusicScrapes.listRateYourMusicGenreKeys,
		{
			limit: 500,
		},
	);
```

with:

```typescript
	const genreOptions = useQuery(
		api.rateYourMusicScrapes.listRateYourMusicGenreKeys,
		{
			limit: 3000,
		},
	);
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add convex/rateYourMusicScrapes.ts src/app/for-later-albums/_components/for-later-filters.tsx
git commit -m "feat: list all RYM genres in filters"
```

### Task 7: Import And Verify

**Files:**
- Uses: `genresfromrym.hml`
- Uses: `scripts/import-rym-genre-hierarchy.ts`

- [ ] **Step 1: Verify the HTML contains the full local taxonomy**

Run:

```bash
rg -o 'href="/genre/[^"]+"' genresfromrym.hml | sort -u | wc -l
```

Expected: `2736`.

- [ ] **Step 2: Run all focused parser tests**

Run:

```bash
node --test convex/_utils/rymGenreHierarchy.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full static verification**

Run:

```bash
pnpm typecheck
pnpm check
```

Expected: both commands exit 0.

- [ ] **Step 4: Import into the dev Convex deployment**

Run:

```bash
pnpm import:rym-genres
```

Expected: command exits 0, prints `Parsed 2736 unique genres`, logs batched genre and relationship progress, and ends with `Done.`.

- [ ] **Step 5: Spot-check imported rows in Convex**

Run:

```bash
pnpm exec convex run internal.rymGenreHierarchy.insertRateYourMusicGenreRelationshipBatch '{"relationships":[]}'
```

Expected: `{"inserted":0}`.

Then check the Convex dashboard tables:

- `rateYourMusicGenres` contains rows for `Ambient`, `Blues`, `Acoustic Texas Blues`, and `Dark Ambient`.
- `rateYourMusicGenreRelationships` contains `blues -> acoustic blues`.
- `rateYourMusicGenreRelationships` contains both parent edges for a multiple-parent genre when present in the real HTML.

- [ ] **Step 6: Commit import-related final state**

Only commit source changes. Do not commit generated local data or environment files.

```bash
git status --short
git add convex/_utils/rymGenreHierarchy.ts convex/_utils/rymGenreHierarchy.test.ts convex/schema.ts convex/_utils/rateYourMusicTaxonomy.ts convex/rymGenreHierarchy.ts scripts/import-rym-genre-hierarchy.ts package.json convex/rateYourMusicScrapes.ts src/app/for-later-albums/_components/for-later-filters.tsx convex/_generated
git commit -m "feat: import RYM genre hierarchy"
```

## Acceptance Criteria

- `genresfromrym.hml` parses to `2736` unique genre hrefs before import.
- Every parsed genre is upserted into `rateYourMusicGenres`.
- Every parsed parent-child edge is inserted into `rateYourMusicGenreRelationships`.
- Genres that appear under multiple parents keep all parent edges.
- Existing release scrape ingestion continues to create and link genres by the same lowercase label key.
- The For Later genre filter can request up to 3000 genres, so imported RYM-only genres are not hidden by the previous 500-row cap.
- `node --test convex/_utils/rymGenreHierarchy.test.ts`, `pnpm typecheck`, and `pnpm check` pass.
