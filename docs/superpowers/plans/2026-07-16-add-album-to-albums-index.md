# Add Album to Albums Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users paste a Spotify album URL/URI/ID on `/albums/all` and immediately upsert that album into their library index.

**Architecture:** Dialog on `AllAlbumsView` parses the paste with `parseSpotifyAlbumId`, fetches metadata via existing `GET /api/spotify/album/[albumId]`, then calls a new `addAlbumToLibrary` mutation that upserts `spotifyAlbums` and `albumLibraryItems` for the current user (library only — not For Later).

**Tech Stack:** Next.js 15 App Router, Convex, React, Tailwind, TypeScript, Biome, shadcn Dialog, sonner, `node:test` via `npx tsx --test`

**Spec:** `docs/superpowers/specs/2026-07-16-add-album-to-albums-index-design.md`

## Global Constraints

- Library only — never insert/update `forLaterAlbumItems`
- No schema changes
- Reuse `parseSpotifyAlbumId`, `/api/spotify/album/[albumId]`, `upsertSpotifyAlbumRecord`, `upsertAlbumLibraryProjection`
- Dialog UI (not drawer)
- Classic function declarations; `type` aliases; kebab-case filenames
- Env via `~/env.js` only if needed (this feature should not need new env vars)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `convex/spotify.ts` | Add `addAlbumToLibrary` mutation (upsert album + library projection; return already-in-library) |
| Create | `convex/spotify.add-album-to-library-source.test.ts` | Source-level guard that mutation upserts + projects and returns `alreadyInLibrary` |
| Create | `src/app/albums/_components/add-album-to-library-dialog.tsx` | Dialog UI, paste normalize, fetch + mutate, toasts |
| Modify | `src/app/albums/_components/all-albums-view.tsx` | Header “Add album” button + dialog open state |

Idea already marked `planned` with spec/plan links: `docs/ideas/2026-07-15-add-album-to-albums-index.md`.

---

### Task 1: `addAlbumToLibrary` mutation

**Files:**
- Modify: `convex/spotify.ts` (near `upsertAlbum` / `bulkUpsertDiscographyAlbums`)
- Create: `convex/spotify.add-album-to-library-source.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `upsertSpotifyAlbumRecord`, `upsertAlbumLibraryProjection`, `v` validators already imported in `convex/spotify.ts`
- Produces: `api.spotify.addAlbumToLibrary` with return type `{ albumId: Id<"spotifyAlbums">; name: string; artistName: string; alreadyInLibrary: boolean }`

- [ ] **Step 1: Write the failing source test**

```typescript
// convex/spotify.add-album-to-library-source.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "spotify.ts"),
	"utf8",
);

test("addAlbumToLibrary mutation exists", () => {
	assert.match(source, /export const addAlbumToLibrary = mutation\(/);
});

test("addAlbumToLibrary upserts Spotify album then library projection", () => {
	const mutationIndex = source.indexOf("export const addAlbumToLibrary = mutation(");
	assert.ok(mutationIndex >= 0, "addAlbumToLibrary must exist");

	const handlerSlice = source.slice(mutationIndex, mutationIndex + 2500);
	assert.match(handlerSlice, /await upsertSpotifyAlbumRecord\(/);
	assert.match(handlerSlice, /await upsertAlbumLibraryProjection\(/);
	assert.match(handlerSlice, /alreadyInLibrary/);
	assert.match(handlerSlice, /requireAuth\(ctx\)/);
});

test("addAlbumToLibrary does not touch for-later tables", () => {
	const mutationIndex = source.indexOf("export const addAlbumToLibrary = mutation(");
	const handlerSlice = source.slice(mutationIndex, mutationIndex + 2500);
	assert.doesNotMatch(handlerSlice, /forLaterAlbumItems/);
	assert.doesNotMatch(handlerSlice, /upsertForLaterAlbumItem/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test convex/spotify.add-album-to-library-source.test.ts`  
Expected: FAIL — `addAlbumToLibrary must exist` / no match for export

- [ ] **Step 3: Implement `addAlbumToLibrary`**

Place after `upsertAlbum` in `convex/spotify.ts` (imports for `upsertSpotifyAlbumRecord` and `upsertAlbumLibraryProjection` already exist in this file).

```typescript
export const addAlbumToLibrary = mutation({
	args: {
		userId: v.string(),
		spotifyAlbumId: v.string(),
		name: v.string(),
		artistName: v.string(),
		imageUrl: v.optional(v.string()),
		releaseDate: v.optional(v.string()),
		totalTracks: v.number(),
		genres: v.optional(v.array(v.string())),
	},
	returns: v.object({
		albumId: v.id("spotifyAlbums"),
		name: v.string(),
		artistName: v.string(),
		alreadyInLibrary: v.boolean(),
	}),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const albumId = await upsertSpotifyAlbumRecord(ctx, {
			spotifyAlbumId: args.spotifyAlbumId,
			name: args.name,
			artistName: args.artistName,
			imageUrl: args.imageUrl,
			releaseDate: args.releaseDate,
			totalTracks: args.totalTracks,
			genres: args.genres,
		});

		const existingLibraryRow = await ctx.db
			.query("albumLibraryItems")
			.withIndex("by_userId_albumId", (q) =>
				q.eq("userId", args.userId).eq("albumId", albumId),
			)
			.first();
		const alreadyInLibrary = existingLibraryRow !== null;

		await upsertAlbumLibraryProjection(ctx, {
			userId: args.userId,
			albumId,
		});

		return {
			albumId,
			name: args.name,
			artistName: args.artistName,
			alreadyInLibrary,
		};
	},
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test convex/spotify.add-album-to-library-source.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/spotify.ts convex/spotify.add-album-to-library-source.test.ts
git commit -m "$(cat <<'EOF'
feat(albums): add addAlbumToLibrary mutation with projection

EOF
)"
```

---

### Task 2: `AddAlbumToLibraryDialog`

**Files:**
- Create: `src/app/albums/_components/add-album-to-library-dialog.tsx`

**Interfaces:**
- Consumes: `api.spotify.addAlbumToLibrary`, `parseSpotifyAlbumId`, `useAlbums().getValidAccessToken` / `userId`, `GET /api/spotify/album/[albumId]`
- Produces: `AddAlbumToLibraryDialog({ open, onOpenChange })` — on success closes via `onOpenChange(false)`

- [ ] **Step 1: Create the dialog component**

```typescript
// src/app/albums/_components/add-album-to-library-dialog.tsx
"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { parseSpotifyAlbumId } from "~/lib/parse-spotify-album-id";
import { api } from "../../../../convex/_generated/api";
import { useAlbums } from "../_context/albums-context";

export function AddAlbumToLibraryDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { userId, getValidAccessToken } = useAlbums();
	const addAlbumToLibrary = useMutation(api.spotify.addAlbumToLibrary);
	const [input, setInput] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (!open) {
			setInput("");
			setIsSubmitting(false);
		}
	}, [open]);

	function normalizeInput(value: string): void {
		setInput(parseSpotifyAlbumId(value));
	}

	async function handleAdd(): Promise<void> {
		const spotifyAlbumId = parseSpotifyAlbumId(input);
		if (!spotifyAlbumId) {
			toast.error("Paste a Spotify album URL or ID.");
			return;
		}
		if (!userId) {
			toast.error("Sign in to add albums.");
			return;
		}

		setIsSubmitting(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				toast.error("Not connected to Spotify");
				return;
			}

			const albumResponse = await fetch(
				`/api/spotify/album/${spotifyAlbumId}`,
				{ headers: { "X-Access-Token": accessToken } },
			);
			if (!albumResponse.ok) {
				toast.error("Failed to fetch album from Spotify");
				return;
			}

			const albumData = (await albumResponse.json()) as {
				spotifyAlbumId: string;
				name: string;
				artistName: string;
				imageUrl?: string;
				releaseDate?: string;
				totalTracks: number;
				genres?: string[];
			};

			const result = await addAlbumToLibrary({
				userId,
				spotifyAlbumId: albumData.spotifyAlbumId,
				name: albumData.name,
				artistName: albumData.artistName,
				imageUrl: albumData.imageUrl,
				releaseDate: albumData.releaseDate,
				totalTracks: albumData.totalTracks,
				genres: albumData.genres,
			});

			if (result.alreadyInLibrary) {
				toast.info(
					`"${result.name}" by ${result.artistName} is already in your library`,
				);
			} else {
				toast.success(`Added "${result.name}" by ${result.artistName}`);
			}
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to add album to library:", error);
			toast.error("Failed to add album");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add album</DialogTitle>
					<DialogDescription>
						Paste a Spotify album link, URI, or ID to add it to your library.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="add-album-spotify-input">Spotify album</Label>
					<Input
						id="add-album-spotify-input"
						value={input}
						disabled={isSubmitting}
						placeholder="https://open.spotify.com/album/..."
						onChange={(event) => setInput(event.target.value)}
						onPaste={(event) => {
							event.preventDefault();
							normalizeInput(event.clipboardData.getData("text"));
						}}
						onBlur={(event) => normalizeInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								void handleAdd();
							}
						}}
					/>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={isSubmitting}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={isSubmitting}
						onClick={() => void handleAdd()}
					>
						{isSubmitting ? "Adding…" : "Add"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: Typecheck the new file in context**

Run: `pnpm typecheck`  
Expected: PASS (or only pre-existing unrelated errors — new file must be clean)

- [ ] **Step 3: Commit**

```bash
git add src/app/albums/_components/add-album-to-library-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(albums): add AddAlbumToLibraryDialog for Spotify paste

EOF
)"
```

---

### Task 3: Wire dialog into `/albums/all`

**Files:**
- Modify: `src/app/albums/_components/all-albums-view.tsx`

**Interfaces:**
- Consumes: `AddAlbumToLibraryDialog`
- Produces: Header “Add album” button that opens the dialog when `userId` is present

- [ ] **Step 1: Add open state, import, button, and dialog**

In `all-albums-view.tsx`:

1. Import `Plus` from `lucide-react` (alongside existing icons).
2. Import `AddAlbumToLibraryDialog` from `./add-album-to-library-dialog`.
3. Add `const [addAlbumDialogOpen, setAddAlbumDialogOpen] = useState(false);` with the other component state.
4. Replace the header row that currently only renders `AlbumLibraryAdminMenu`:

```tsx
<div className="flex items-center justify-end gap-2">
	{userId ? (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={() => setAddAlbumDialogOpen(true)}
		>
			<Plus className="mr-1.5 h-4 w-4" />
			Add album
		</Button>
	) : null}
	<AlbumLibraryAdminMenu
		userId={userId}
		isRunningLibraryAction={isRunningLibraryAction}
		isBackfillingLibraryIndex={isBackfillingLibraryIndex}
		isBackfillingTitleKeys={isBackfillingTitleKeys}
		isBackfillingRymLinks={isBackfillingRymLinks}
		isBackfillingReleaseYearSortKey={isBackfillingReleaseYearSortKey}
		onBuildLibraryIndex={() => void handleBackfillLibraryIndex()}
		onBackfillTitleKeys={() => void handleBackfillTitleKeys()}
		onBackfillReleaseYearSortKeys={() =>
			void handleBackfillReleaseYearSortKeys()
		}
		onBackfillRymLinks={() => setBackfillDialogOpen(true)}
	/>
</div>
```

5. Render the dialog near the other dialogs/drawers at the bottom of the return (alongside the existing `AlertDialog` / RYM drawer):

```tsx
<AddAlbumToLibraryDialog
	open={addAlbumDialogOpen}
	onOpenChange={setAddAlbumDialogOpen}
/>
```

`Button` is already imported in this file.

- [ ] **Step 2: Lint the touched files**

Run: `pnpm check`  
Expected: no new issues in the albums files above

- [ ] **Step 3: Manual verification checklist**

With `pnpm dev` + Convex running and Spotify connected:

1. Open `/albums/all` → click **Add album**
2. Paste `https://open.spotify.com/album/<id>` → field normalizes to ID → **Add** → success toast → album appears (set Type to All if it is a ≤2-track single)
3. Re-add same album → info toast “already in library”
4. Paste `spotify:album:<id>` and a raw ID → both work
5. Bad ID → error toast; dialog stays open
6. Confirm album is **not** added to For Later

- [ ] **Step 4: Commit**

```bash
git add src/app/albums/_components/all-albums-view.tsx
git commit -m "$(cat <<'EOF'
feat(albums): wire Add album dialog on /albums/all

EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Paste URL/URI/ID → parse → Spotify fetch → library upsert: Tasks 1–3
- Dialog (not drawer): Task 2–3
- Library only / no for-later: Task 1 source test + mutation body
- Already-in-library toast: Task 1 return + Task 2 toasts
- No schema change: no schema files in plan
- Source test for mutation path: Task 1

**Placeholder scan:** none

**Type consistency:** `addAlbumToLibrary` args/returns match dialog call site; `alreadyInLibrary` naming consistent
