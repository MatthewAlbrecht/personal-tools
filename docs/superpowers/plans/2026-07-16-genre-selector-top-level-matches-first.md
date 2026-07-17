# Official shadcn Combobox + Genre Top-Level Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled Combobox with official shadcn (Base UI), migrate all call sites, then pin matching top-level genres to the top of genre search results with a muted “Top” badge.

**Architecture:** Install registry Combobox (`@base-ui/react`). Rename our form `InputGroup` → `FieldGroup` so shadcn’s `input-group` can land. Migrate for-later, smart-playlists, and venues to the official chips/anchor API. Keep pin/badge logic outside the registry file via `resolveComboboxFilteredItems` + Base UI `filteredItems` / controlled input on genre pickers only. Keyboard scroll comes from Base UI — do not add custom `scrollIntoView`.

**Tech Stack:** shadcn/ui Combobox, `@base-ui/react`, Next.js 15, TypeScript, Biome, `node:test` via `pnpm exec tsx --test`.

**Spec:** `docs/superpowers/specs/2026-07-16-genre-selector-top-level-matches-first-design.md`

## Global Constraints

- Official shadcn Combobox only — delete hand-rolled behavior; do not reimplement listbox keyboard scrolling
- Empty genre input → top-level keys only; no “Top” badge
- Non-empty genre input → stable-partition top-level matches first; muted trailing **Top** text on pinned rows
- Descriptors / venues: default Combobox filtering; no pin/badge
- Do not migrate unrelated Radix primitives to Base UI in this plan

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Rename | `src/components/ui/input-group.tsx` → `field-group.tsx` | Form label+field wrapper (avoid name clash) |
| Modify | `src/app/folio-society/_components/config-section.tsx` | Import `FieldGroup` |
| Add (CLI) | `src/components/ui/input-group.tsx` | Official shadcn InputGroup (Combobox chrome) |
| Replace (CLI) | `src/components/ui/combobox.tsx` | Official shadcn Combobox |
| Possibly modify | `src/components/ui/button.tsx` | Registry may need `icon-xs` (or adapt chip remove) |
| Create | `src/components/ui/combobox-filter.ts` | Pure filter + pin partition |
| Create | `src/components/ui/combobox-filter.test.ts` | Helper unit tests |
| Modify | `src/app/for-later-albums/_components/for-later-filters.tsx` | Official API + genre pin/badge |
| Modify | `src/app/smart-playlists/_components/recipe-form.tsx` | Official API + genre pin/badge |
| Modify | `src/app/concerts/_components/venue-multiselect.tsx` | Official API |

---

### Task 1: Free the `InputGroup` name (FieldGroup rename)

**Files:**
- Create: `src/components/ui/field-group.tsx` (move contents from `input-group.tsx`, rename export)
- Delete: `src/components/ui/input-group.tsx` (after move)
- Modify: `src/app/folio-society/_components/config-section.tsx`

**Interfaces:**
- Consumes: existing form InputGroup API
- Produces: `FieldGroup` with the same props (`label`, `htmlFor?`, `className?`, `labelClassName?`, `children`)

- [ ] **Step 1: Create `field-group.tsx` and update Folio consumer**

`src/components/ui/field-group.tsx`:

```tsx
import type * as React from "react";
import { cn } from "~/lib/utils";
import { Label } from "./label";

function FieldGroup({
	label,
	htmlFor,
	className,
	labelClassName,
	children,
}: {
	label: string;
	htmlFor?: string;
	className?: string;
	labelClassName?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={cn("space-y-2", className)}>
			<Label htmlFor={htmlFor} className={labelClassName}>
				{label}
			</Label>
			{children}
		</div>
	);
}

export { FieldGroup };
```

In `config-section.tsx`, replace:

```ts
import { InputGroup } from "~/components/ui/input-group";
```

with:

```ts
import { FieldGroup } from "~/components/ui/field-group";
```

and rename every `<InputGroup` / `</InputGroup>` to `<FieldGroup` / `</FieldGroup>`.

Delete `src/components/ui/input-group.tsx`.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/field-group.tsx \
  src/app/folio-society/_components/config-section.tsx
git rm src/components/ui/input-group.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): rename form InputGroup to FieldGroup

EOF
)"
```

---

### Task 2: Install official shadcn Combobox

**Files:**
- Replace: `src/components/ui/combobox.tsx`
- Create/replace: `src/components/ui/input-group.tsx` (shadcn registry)
- Possibly modify: `src/components/ui/button.tsx` (if registry needs new sizes)
- `package.json` / lockfile: add `@base-ui/react`

**Interfaces:**
- Consumes: shadcn registry
- Produces: official exports (`Combobox`, `ComboboxChips`, `ComboboxChip`, `ComboboxChipsInput`, `ComboboxContent`, `ComboboxEmpty`, `ComboboxItem`, `ComboboxList`, `ComboboxValue`, `useComboboxAnchor`, …)

- [ ] **Step 1: Add Combobox via CLI (overwrite)**

From repo root:

```bash
pnpm dlx shadcn@latest add combobox --overwrite -y
```

If the CLI asks about `base`, choose / configure **base-ui** for this component (Combobox registry depends on `@base-ui/react`).

Confirm:

- `package.json` includes `@base-ui/react`
- `src/components/ui/combobox.tsx` imports from `@base-ui/react`
- `src/components/ui/input-group.tsx` is the **shadcn** input chrome (addons), not the old form wrapper

If `button` is missing `size: "icon-xs"` and TypeScript fails on ComboboxChipRemove, either:

- pull the matching button size from the current shadcn button registry, **or**
- locally adjust the Combobox chip-remove `size` prop to an existing size (`icon` / `sm`) — prefer matching registry when cheap.

Fix import aliases if the CLI wrote `@/` instead of `~/` (this repo uses `~/`).

- [ ] **Step 2: Typecheck Combobox module in isolation**

```bash
pnpm typecheck
```

Expected: may FAIL until Task 3 migrates call sites (hand-rolled props like `browseItems` / `getItemLabel` / old `ComboboxTrigger` usage). That is OK if errors are only at the three consumers. If errors are inside the new `combobox.tsx` / `input-group.tsx` / `button.tsx`, fix those before continuing.

- [ ] **Step 3: Commit registry install**

```bash
git add package.json pnpm-lock.yaml \
  src/components/ui/combobox.tsx \
  src/components/ui/input-group.tsx \
  src/components/ui/button.tsx
git commit -m "$(cat <<'EOF'
feat(ui): replace hand-rolled Combobox with shadcn Base UI

EOF
)"
```

(Only stage `button.tsx` if it changed.)

---

### Task 3: Migrate venues Combobox to official API

**Files:**
- Modify: `src/app/concerts/_components/venue-multiselect.tsx`

**Interfaces:**
- Consumes: official Combobox chips + `useComboboxAnchor`
- Produces: same venue multi-select UX (search + chips)

- [ ] **Step 1: Rewrite venue multiselect**

Replace the hand-rolled trigger/chips pattern with the official multiple + anchor pattern. Shape:

```tsx
"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxValue,
	useComboboxAnchor,
} from "~/components/ui/combobox";
import { cn } from "~/lib/utils";
// ... keep existing SelectedConcertVenueRow types / props

export function VenueMultiselect({
	venues,
	value,
	onValueChange,
}: {
	// keep existing prop types
}) {
	const anchor = useComboboxAnchor();
	const items = useMemo(() => /* existing venue id strings */, [venues]);
	const venueLabels = useMemo(() => /* existing map */, [venues]);

	return (
		<Combobox
			items={items}
			multiple
			value={value}
			onValueChange={onValueChange}
			itemToStringLabel={(id) => venueLabels.get(id as Id<"concertVenues">) ?? id}
		>
			<ComboboxChips ref={anchor} className="w-full">
				<ComboboxValue>
					{(values: string[]) => (
						<>
							{values.map((item) => (
								<ComboboxChip key={item}>{venueLabels.get(item as Id<"concertVenues">) ?? item}</ComboboxChip>
							))}
							<ComboboxChipsInput
								placeholder={values.length > 0 ? "Add venue..." : "Filter venues..."}
							/>
						</>
					)}
				</ComboboxValue>
			</ComboboxChips>
			<ComboboxContent anchor={anchor}>
				<ComboboxEmpty>No venues found.</ComboboxEmpty>
				<ComboboxList>
					{(item) => {
						const venueId = item as Id<"concertVenues">;
						const isSelected = value.includes(venueId);
						return (
							<ComboboxItem key={item} value={item}>
								<Check
									className={cn(
										"mr-2 size-4",
										isSelected ? "opacity-100" : "opacity-0",
									)}
								/>
								{venueLabels.get(venueId) ?? item}
							</ComboboxItem>
						);
					}}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
```

**Adapt to the exact official `ComboboxValue` / `ComboboxChip` API** from the installed file and [shadcn Combobox multiple docs](https://ui.shadcn.com/docs/components/base/combobox) — the registry may use children-as-function or selected-item props slightly differently than the sketch above. Match the installed component’s types; do not invent props.

Remove unused imports (`ComboboxTrigger`, etc.).

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: venues file clean; for-later / smart-playlists may still fail until Task 4.

- [ ] **Step 3: Manual smoke (concerts)**

Open concerts venue filter: type to filter, select/deselect chips, ArrowDown through a long list — highlight stays visible.

- [ ] **Step 4: Commit**

```bash
git add src/app/concerts/_components/venue-multiselect.tsx
git commit -m "$(cat <<'EOF'
refactor(concerts): migrate venue Combobox to shadcn Base UI

EOF
)"
```

---

### Task 4: Migrate for-later + smart-playlists Comboboxes (no pin yet)

**Files:**
- Modify: `src/app/for-later-albums/_components/for-later-filters.tsx`
- Modify: `src/app/smart-playlists/_components/recipe-form.tsx`

**Interfaces:**
- Consumes: official Combobox API
- Produces: genres + descriptors working with default filtering (temporary: empty genre browse shows **all** genres until Task 6 wires `filteredItems`)

- [ ] **Step 1: Migrate both feature files to chips + anchor pattern**

For **each** Combobox (genre and descriptor) in both files:

1. Remove `ComboboxTrigger` wrapper.
2. Add `const genreAnchor = useComboboxAnchor()` / `descriptorAnchor` (or one anchor per Combobox instance — each Combobox needs its own anchor ref).
3. Use `itemToStringLabel={formatGenreOption}` / `formatDescriptorOption` instead of `getItemLabel`.
4. Drop `browseItems` prop for now (gone from API).
5. Match official chip rendering like Task 3.

Keep existing filter state wiring (`value` / `onValueChange` / `multiple`).

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 3: Manual smoke**

- `/for-later-albums` — genre + descriptor Comboboxes select/clear
- `/smart-playlists` — same
- Arrow keys scroll highlight into view

- [ ] **Step 4: Commit**

```bash
git add src/app/for-later-albums/_components/for-later-filters.tsx \
  src/app/smart-playlists/_components/recipe-form.tsx
git commit -m "$(cat <<'EOF'
refactor: migrate genre and descriptor Comboboxes to shadcn

EOF
)"
```

---

### Task 5: Pure filter/pin helper (TDD)

**Files:**
- Create: `src/components/ui/combobox-filter.ts`
- Test: `src/components/ui/combobox-filter.test.ts`

**Interfaces:**
- Consumes: none
- Produces:

```ts
export type ComboboxFilterArgs = {
	items: string[];
	browseItems?: string[];
	filter: string;
	getItemLabel: (item: string) => string;
};

export type ComboboxFilterResult = {
	filteredItems: string[];
	pinnedKeys: ReadonlySet<string>;
};

export function resolveComboboxFilteredItems(
	args: ComboboxFilterArgs,
): ComboboxFilterResult;
```

- [ ] **Step 1: Write failing tests**

Create `src/components/ui/combobox-filter.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveComboboxFilteredItems } from "./combobox-filter";

const labels: Record<string, string> = {
	rock: "Rock",
	"indie rock": "Indie Rock",
	"art rock": "Art Rock",
	jazz: "Jazz",
	"free jazz": "Free Jazz",
};

function getItemLabel(item: string): string {
	return labels[item] ?? item;
}

test("empty filter returns browseItems when provided", () => {
	const result = resolveComboboxFilteredItems({
		items: ["rock", "indie rock", "jazz", "free jazz"],
		browseItems: ["rock", "jazz"],
		filter: "  ",
		getItemLabel,
	});
	assert.deepEqual(result.filteredItems, ["rock", "jazz"]);
	assert.equal(result.pinnedKeys.size, 0);
});

test("empty filter without browseItems returns items", () => {
	const items = ["rock", "indie rock"];
	const result = resolveComboboxFilteredItems({
		items,
		filter: "",
		getItemLabel,
	});
	assert.deepEqual(result.filteredItems, items);
	assert.equal(result.pinnedKeys.size, 0);
});

test("search pins matching browseItems first and keeps stable order within groups", () => {
	const result = resolveComboboxFilteredItems({
		items: ["indie rock", "art rock", "rock", "free jazz", "jazz"],
		browseItems: ["rock", "jazz"],
		filter: "rock",
		getItemLabel,
	});
	assert.deepEqual(result.filteredItems, ["rock", "indie rock", "art rock"]);
	assert.deepEqual([...result.pinnedKeys].sort(), ["rock"]);
});

test("search without browseItems filters only and does not pin", () => {
	const result = resolveComboboxFilteredItems({
		items: ["indie rock", "art rock", "rock"],
		filter: "rock",
		getItemLabel,
	});
	assert.deepEqual(result.filteredItems, ["indie rock", "art rock", "rock"]);
	assert.equal(result.pinnedKeys.size, 0);
});

test("match is case-insensitive on label or key", () => {
	const result = resolveComboboxFilteredItems({
		items: ["free jazz", "jazz"],
		browseItems: ["jazz"],
		filter: "JAZZ",
		getItemLabel,
	});
	assert.deepEqual(result.filteredItems, ["jazz", "free jazz"]);
	assert.ok(result.pinnedKeys.has("jazz"));
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm exec tsx --test src/components/ui/combobox-filter.test.ts
```

- [ ] **Step 3: Implement helper**

Create `src/components/ui/combobox-filter.ts`:

```ts
export type ComboboxFilterArgs = {
	items: string[];
	browseItems?: string[];
	filter: string;
	getItemLabel: (item: string) => string;
};

export type ComboboxFilterResult = {
	filteredItems: string[];
	pinnedKeys: ReadonlySet<string>;
};

export function resolveComboboxFilteredItems(
	args: ComboboxFilterArgs,
): ComboboxFilterResult {
	const q = args.filter.trim().toLowerCase();
	const emptyPinned = new Set<string>();

	if (!q) {
		return {
			filteredItems: args.browseItems ?? args.items,
			pinnedKeys: emptyPinned,
		};
	}

	const matched = args.items.filter((item) => {
		const label = args.getItemLabel(item).toLowerCase();
		return label.includes(q) || item.toLowerCase().includes(q);
	});

	if (!args.browseItems || args.browseItems.length === 0) {
		return { filteredItems: matched, pinnedKeys: emptyPinned };
	}

	const browseSet = new Set(args.browseItems);
	const pinned: string[] = [];
	const rest: string[] = [];
	for (const item of matched) {
		if (browseSet.has(item)) {
			pinned.push(item);
		} else {
			rest.push(item);
		}
	}

	return {
		filteredItems: [...pinned, ...rest],
		pinnedKeys: new Set(pinned),
	};
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec tsx --test src/components/ui/combobox-filter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/combobox-filter.ts src/components/ui/combobox-filter.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add Combobox filter pin helper

EOF
)"
```

---

### Task 6: Wire genre pin + “Top” badge on for-later and smart-playlists

**Files:**
- Modify: `src/app/for-later-albums/_components/for-later-filters.tsx` (genre Combobox only)
- Modify: `src/app/smart-playlists/_components/recipe-form.tsx` (genre Combobox only)

**Interfaces:**
- Consumes: `resolveComboboxFilteredItems`; Base UI `inputValue` / `onInputValueChange` / `filteredItems`
- Produces: empty browse = top-level; search = pinned top-level first + **Top** badge

- [ ] **Step 1: Control genre list via helper**

For each genre Combobox:

1. Add state: `const [genreInput, setGenreInput] = useState("")`
2. Compute:

```ts
const genreList = resolveComboboxFilteredItems({
	items: genreKeysPool,
	browseItems: topLevelGenreKeysPool,
	filter: genreInput,
	getItemLabel: formatGenreOption,
});
```

3. On `Combobox` root, pass (names per installed Base UI types — verify against `@base-ui/react` Combobox.Root props):

```tsx
<Combobox
	items={genreKeysPool}
	filteredItems={genreList.filteredItems}
	inputValue={genreInput}
	onInputValueChange={(next, _details) => {
		setGenreInput(typeof next === "string" ? next : "");
	}}
	multiple
	value={filters.genreKeys}
	onValueChange={(genreKeys) => {
		// keep existing patch; clear input if official API does not already
		patchFilters({ genreKeys: genreKeys as string[] });
	}}
	itemToStringLabel={formatGenreOption}
>
```

If the installed API uses a slightly different `onInputValueChange` signature, match the type exactly.

4. In the genre `ComboboxList` item render:

```tsx
{(item) => (
	<ComboboxItem key={item} value={item}>
		<span className="flex min-w-0 flex-1 items-center justify-between gap-2">
			<span className="min-w-0 truncate">{formatGenreOption(item)}</span>
			{genreList.pinnedKeys.has(item) ? (
				<span className="shrink-0 text-muted-foreground text-xs">Top</span>
			) : null}
		</span>
	</ComboboxItem>
)}
```

Leave **descriptor** Comboboxes on default filtering (no `filteredItems` / no badge).

- [ ] **Step 2: Typecheck + unit tests**

```bash
pnpm typecheck
pnpm exec tsx --test src/components/ui/combobox-filter.test.ts
```

Expected: PASS

- [ ] **Step 3: Manual smoke**

1. For-later genres — empty: top-level only, no badges
2. Type `rock` (or similar) — top-level matches first with **Top**; subgenres below without badge
3. Descriptors unchanged
4. Smart-playlists genre field — same
5. ArrowDown past fold — highlight stays visible (Base UI)

- [ ] **Step 4: Commit**

```bash
git add src/app/for-later-albums/_components/for-later-filters.tsx \
  src/app/smart-playlists/_components/recipe-form.tsx
git commit -m "$(cat <<'EOF'
feat(genres): pin top-level Combobox matches with Top badge

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Replace hand-rolled with official shadcn Combobox | Task 2 |
| Rename form InputGroup → FieldGroup | Task 1 |
| Migrate venues | Task 3 |
| Migrate for-later + smart-playlists | Task 4 |
| Empty genre browse = top-level, no badge | Task 5 + 6 |
| Search pin + Top badge | Task 5 + 6 |
| Descriptors/venues no pin | Task 3–4, Task 6 leaves descriptors alone |
| Keyboard scroll via Base UI (no custom scrollIntoView) | Task 2 (implicit) |
| Helper unit tests | Task 5 |
| Manual smoke | Tasks 3, 4, 6 |
