# Launch Drag-and-Drop Implementation Plan

> Execute this plan task-by-task. Add each failing test before its implementation and verify the failure is caused by the missing behavior. Do not commit unless the user separately asks.

**Goal:** Add tactile, accessible ordering to the static Launch page while preserving cached first paint, existing interactions, additive project membership, and safe Convex reconciliation.

**Architecture:** Keep `public/launch.html` as the synchronous first-paint renderer and interaction host. Extend `public/launch-model.mjs` with immutable layout/operation helpers. Add `public/launch-dnd.mjs` as an idempotent, dynamically imported native Pointer Events controller. Store one atomic `launch-layout-v2` snapshot. Add typed ordering helpers plus one atomic query and one transactional mutation on the Convex side. Use contiguous integer positions and a singleton version row.

**UI direction:** Preserve the current compact white/zinc Launch language. Handles reserve space before enhancement but remain visually quiet. Bookmark pickup uses a 44 × 40 px favicon box; project pickup uses a compact heading chip. Dashed tile slots, 2 px insertion rules, subtle receiving-zone borders, a dotted pending outline, and 120 ms FLIP displacement supply feedback without a new accent palette.

**Native accessibility reference:** Apply Dialog/Popover conventions without shadcn or React: real named buttons, visible focus, focus capture/restoration, Escape cancellation, modal/menu state disabling, terse hidden instructions, and a polite atomic live region. Do not install shadcn or migrate the page.

**Environment invariant:** A project may contain multiple memberships with the same environment, including multiple `prod` memberships. Ordering and drag operations must preserve each membership’s `name` and `environment` byte-for-byte; they must never infer, clear, replace, deduplicate, or otherwise alter environment metadata.

## Current-State Mismatches This Plan Resolves

- `convex/schema.ts` has no `padPosition`, membership `position`, project `position`, or `launchLayoutState`.
- `convex/launch.ts` sorts by creation time, allows ambiguous/empty Pad tags through `cleanTags`, and its create/update/project APIs do not maintain a shared layout version.
- `public/launch.html` reads and writes separate `launch-bookmarks` and `launch-projects` snapshots and subscribes to `launch:list` and `launch:listProjects` independently, so the two halves can tear.
- `render()` currently shows a bookmark in both Top and Pinned when both tags exist; the migration must normalize both tags to Top and neither to Pinned.
- `renderProjects()` iterates bookmarks in Pad order rather than membership position; `projectsNewestFirst()` conflicts with ordered project rendering.
- The first-paint markup has no reserved handles, empty-zone rails, stable sortable identities, live region, or post-paint enhancement hook.
- Menus/dialogs still use “group” copy (`Add to group`, `Save & add to groups`, `Add to groups`) although new interaction copy must say “project.”
- `requireAuth` is currently a no-op. New APIs must call it for consistency, but the implementation must not claim this provides Convex-side authorization.
- The repository has Node source/model tests but no configured Convex runtime or browser harness. Those are introduced only where the specification requires transactional and real interaction proof.

## Recommended Sequence and Parallelization

Recommended sequence: Tasks 1–5 establish schema, canonical model behavior, migration, and APIs; Tasks 6–8 establish atomic client state and stable DOM contracts; Tasks 9–13 implement interaction and reconciliation; Tasks 14–15 finish browser/performance coverage and schema tightening.

After Task 5, Task 6 (client cache/state) and the non-rendering portions of Task 14 (browser harness setup) can proceed in parallel. After Task 8, Task 9 (pointer mechanics), Task 11 (keyboard mechanics), and Task 13 (conflict/reduced-motion regression tests) can be developed in parallel against the same `launch-dnd.mjs` controller contract, then integrated in the recommended order below. Do not parallelize schema/API work before the shared validators and operation semantics are fixed.

---

## Phase 1 — Ordering Foundations

### Task 1: Define canonical ordering and operation model

**Purpose/outcome:** Establish immutable, framework-free behavior for normalization, sorting, exact insertion, metadata preservation, replay, rollback dependencies, and live-region copy before changing persistence or UI.

**Files:**
- Modify: `public/launch-model.test.mjs`
- Modify: `public/launch-model.mjs`

**Symbols/insertion locations:**
- Add after `displayName`: `normalizePadTags`, `padZoneForBookmark`, `sortLayout`, `removeAndInsert`, `compactPadZone`, `compactProjectMemberships`, `compactProjects`.
- Add near the end: `applyLayoutOperation`, `replayLayoutOperations`, `removeDependentOperations`, `layoutAnnouncement`.
- Preserve existing helpers and classic named function declarations.

**Failing tests first:**
- Both tags normalize to `["top"]`; only `top` stays Top; only `pinned` and neither normalize to `["pinned"]`.
- Sorting uses numeric `position` first and `_creationTime`/`createdAt` as deterministic fallback.
- First/middle/last reorder and out-of-range insertion clamp correctly.
- Top ↔ Pinned removes the old tag and compacts both zones to `0…n-1`.
- Pad → empty/populated project inserts exactly and leaves Pad tags/position unchanged.
- Same-project reorder preserves `name` and every environment value.
- Cross-project placement leaves source membership intact, adds no duplicate target, and repositions an existing target membership.
- Two memberships in one project may both be `prod` (and likewise any environment); neither changes during reorder/replay.
- Project reorder compacts positions.
- Replay of two queued operations over a newer authoritative snapshot retains remote title, URL, name, and environment edits.
- Dependency removal drops operations referencing a deleted bookmark/project and later operations depending on that missing identity.
- Rollback reproduces the exact authoritative snapshot.
- Typed invalid results cover unsupported project→Pad, cross-type, missing item, and missing target.
- Announcement assertions use exact copy:
  - `Moving GitHub. Top, position 2 of 6. Use arrow keys to move, Tab to change section, Enter to drop, or Escape to cancel.`
  - `Pinned, position 1 of 4.`
  - `Moved GitHub to Pinned, position 1.`
  - `Move canceled. GitHub returned to Top, position 2.`
  - `Can’t drop here.`

**Implementation steps:**
1. Define a plain layout shape `{ version, bookmarks, projects }` and operation kinds `movePadLink`, `placeProjectLink`, and `moveProject`.
2. Return new arrays/objects from every helper; never mutate `confirmed` input.
3. Represent invalid application as `{ ok: false, reason }`; successful application as `{ ok: true, layout, affectedZones }`.
4. Clamp destination indexes after removing the moving item from a same-list reorder.
5. For a new project membership create only `{ projectId, position }`; for an existing membership copy all fields and change only `position`.
6. Keep announcement formatting centralized and use “project,” “Top,” and “Pinned.”

**Verify:**
```bash
node --test public/launch-model.test.mjs
```

**Completion criteria:** All new model tests pass; existing URL, favicon, environment, rename, and project-picker tests remain green; no ordering helper changes environment metadata.

### Task 2: Add optional ordering schema and shared validators

**Purpose/outcome:** Make the database accept old and new rows during a safe backfill and provide one source for explicit API return validators.

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/_utils/launchLayout.ts`
- Create: `convex/launch-layout-source.test.ts`

**Symbols/insertion locations:**
- In `launchProjects`, add optional `position`.
- In `launchBookmarks`, add optional `padPosition`; add optional membership `position`.
- Add `launchLayoutState` immediately after Launch tables with `by_key`.
- In `_utils/launchLayout.ts`, export environment/tag/membership/bookmark/project/snapshot/operation validators and inferred types.

**Failing tests first:**
- Source test asserts all three optional position fields exist.
- Source test asserts `launchLayoutState` has literal key `"default"`, version, recent operation IDs, updated time, and `.index("by_key", ["key"])`.
- Validator tests accept duplicate `prod`, `qa`, `stage`, `dev`, or `local` environments in one project.
- Validator tests reject unknown operation kinds and omit no public return shape fields.

**Implementation steps:**
1. Derive validators with Convex validator composition where possible; include `_id` and `_creationTime` in returned bookmark/project validators.
2. Define `layoutSnapshotValidator`, applied/conflict result validators, and operation union matching the specification.
3. Keep positions optional only for the migration phase.
4. Do not add ordering indexes; Launch is a bounded personal dataset and memberships are embedded.

**Verify:**
```bash
pnpm exec vitest run convex/launch-layout-source.test.ts
pnpm typecheck
pnpm exec biome check convex/schema.ts convex/_utils/launchLayout.ts convex/launch-layout-source.test.ts
```

Node 22's native test runner does not load this TypeScript file without an
additional loader. Use the existing Vitest/convex-test harness; do not change
production module loading to make the obsolete `node --test` command work.

**Completion criteria:** Schema accepts legacy rows, validator shapes are reusable by query/mutation code, and environment duplication is explicitly allowed.

### Task 3: Add and verify the one-time canonical backfill

**Purpose/outcome:** Normalize existing rows into deterministic contiguous ordering and initialize layout version 1 without silently changing membership metadata.

**Files:**
- Modify: `convex/launch.ts`
- Create: `convex/launch-migration.test.ts`

**Symbols/insertion locations:**
- Add plain helper `buildLaunchBackfillPatches` in `convex/_utils/launchLayout.ts`.
- Add temporary/public development mutation `backfillLayoutOrdering` near other project mutations, with `args: {}` and an explicit summary return validator.
- Add read-only `verifyLayoutOrdering` query with explicit counts/violation arrays while rollout is active.

**Failing tests first:**
- Backfill maps both tags to Top, neither to Pinned, and assigns independent Top/Pinned positions from current `_creationTime` render order.
- Membership positions are assigned per project from bookmark `_creationTime`.
- Project positions follow current `createdAt` ascending order.
- Existing membership `name` and `environment` survive exactly, including repeated `prod`.
- Running the backfill twice is idempotent and does not reset a newer version.
- Singleton state is created once at version 1.

**Implementation steps:**
1. Call `requireAuth(ctx)` in both functions and document that it is currently a no-op boundary.
2. Read the bounded Launch dataset in one mutation, calculate all patches in plain typed helpers, await each patch, then create the singleton if absent.
3. Reject duplicate singleton rows in verification rather than guessing.
4. Return counts for bookmarks, projects, memberships, normalized tags, and repaired positions.
5. Run only with `npx convex dev`; never deploy from this task.

**Verify:**
```bash
node --test convex/launch-migration.test.ts
npx convex dev --once
pnpm typecheck
```

**Completion criteria:** Development data reports one singleton, no ambiguous tags, no missing/duplicate/gapped positions, and unchanged membership metadata.

### Task 4: Implement atomic layout query and transactional operation API

**Purpose/outcome:** Expose one coherent reactive snapshot and one idempotent version-checked transaction for every supported drop.

**Files:**
- Modify: `convex/launch.ts`
- Modify: `convex/_utils/launchLayout.ts`
- Create: `convex/launch-layout.test.ts`
- Modify: `package.json`
- Create: `vitest.config.ts`

**Symbols/insertion locations:**
- Add plain functions `readCanonicalLayout`, `applyLayoutOperationToDocuments`, `validateTargetIndex`.
- Add public `getLayout` and `applyLayoutOperation`.
- Add required test setup (`convex-test`, Vitest, edge runtime) only in this task.

**Failing tests first:**
- `getLayout` returns one versioned snapshot with canonical fallback positions.
- Every public function invokes `requireAuth`, and args/returns validators are present.
- All three operation kinds write exact positions and compact only affected lists.
- Top ↔ Pinned compacts both zones and enforces exactly one Pad tag.
- Same-project and cross-project placement preserve all membership metadata; new target membership has no `name`/`environment`.
- Multiple equal environments in one project remain valid and untouched.
- Stale `expectedVersion` returns `conflict` and performs zero writes.
- Duplicate `operationId` returns `applied` without applying twice.
- Empty/over-100-character operation IDs and non-finite/non-integer/negative indexes reject; large valid indexes clamp.
- Missing bookmark/project and false `sourceProjectId` membership reject.
- Applied transaction increments version exactly once and keeps only the latest 50 deduplicated IDs.
- Dataset caps reject Pad/project lists over 250 and projects over 100.

**Implementation steps:**
1. Keep public wrappers thin: call `requireAuth(ctx)` and delegate.
2. Use `by_key` with `.unique()` for singleton lookup.
3. Perform all reads, compaction writes, operation-ID update, version increment, and canonical return construction in one mutation transaction.
4. Use explicit table-name overloads for `get`, `patch`, `replace`, and `delete`; await every write.
5. Return the current canonical snapshot on both `applied` and `conflict`.
6. Do not import browser `.mjs`; mirror semantics through equivalent tests.

**Verify:**
```bash
pnpm exec vitest run convex/launch-layout.test.ts
pnpm typecheck
pnpm exec biome check convex/launch.ts convex/_utils/launchLayout.ts convex/launch-layout.test.ts vitest.config.ts
```

**Completion criteria:** Transaction tests prove ordering, conflict, idempotency, limits, validators, and metadata preservation.

### Task 5: Make every existing Launch mutation version-coherent

**Purpose/outcome:** Ensure rename, URL/environment updates, create/delete, project picker changes, and project changes cannot alter a subscribed snapshot without a version increment.

**Files:**
- Modify: `convex/launch.ts`
- Modify: `convex/launch-layout.test.ts`
- Modify: `convex/launch-environments.test.ts`

**Symbols/insertion locations:**
- Update `create`, `update`, `remove`, `createProject`, `renameProject`, `removeProject`, `setProjects`, and `setProjectEnvironment`.
- Add plain helpers `nextPadPosition`, `canonicalizeSetProjects`, `bumpLayoutVersion`.

**Failing tests first:**
- `create` normalizes tags to one zone and appends at that zone’s final position.
- `update` cannot persist both/no Pad tags and preserves/canonicalizes membership positions.
- `setProjects` deduplicates project IDs, preserves metadata, assigns positions, and never enforces unique environments.
- Create/delete compacts affected positions; delete project removes memberships and compacts project positions.
- Rename, URL, and environment changes increment version once although positions do not change.
- `setProjectEnvironment` modifies only the selected membership; duplicate same-environment siblings remain unchanged.
- `list`/`listProjects` remain compatibility APIs but return canonical order during migration.

**Implementation steps:**
1. Replace `cleanTags` with deterministic one-zone normalization.
2. Route every snapshot-changing mutation through one version bump in the same transaction.
3. Keep `click` outside layout versioning because click counters are not part of ordering/render layout semantics unless `getLayout` returns them; if returned, document and test the chosen behavior consistently.
4. Keep `setProjects` only for current picker/add-dialog compatibility until those flows migrate.

**Verify:**
```bash
pnpm exec vitest run convex/launch-layout.test.ts
node --test convex/launch-environments.test.ts
pnpm typecheck
```

**Completion criteria:** No existing mutation can produce a changed `getLayout` payload at the same version, and environment behavior stays non-unique.

---

## Phase 2 — Atomic Cache and Progressive DOM Contracts

### Task 6: Replace split snapshots with `launch-layout-v2`

**Purpose/outcome:** Make cached first paint atomic, versioned, and backward compatible for one release.

**Files:**
- Modify: `public/launch-model.mjs`
- Modify: `public/launch-model.test.mjs`
- Modify: `public/launch.html`
- Modify: `public/launch-page.test.mjs`

**Symbols/insertion locations:**
- Add `LAYOUT_STORAGE_KEY`, `readLayoutSnapshot`, `writeLayoutSnapshot`, `inferLegacyLayout`.
- Replace `load`, `loadProjects`, `save`, and `saveProjects` with `loadInitialLayout` and `saveLayout`.
- Initialize `confirmed`, `pendingOperations`, and `view`; point `bookmarks`/`window.launchProjects` at `view`.

**Failing tests first:**
- Valid v2 wins over legacy keys and requires `schemaVersion: 2`.
- Missing/corrupt v2 falls back to both legacy keys, normalizes inferred positions, and does not write v2 before authority arrives.
- One synchronous read supplies bookmarks/projects for initial `render(bookmarks); renderProjects();`.
- Optimistic `view` writes v2 synchronously but operation IDs/pending state are never persisted.
- Definitive rollback overwrites v2 with authoritative `confirmed`.
- Page source stops writing legacy keys once v2 is active.

**Implementation steps:**
1. Keep legacy key constants/read path for one-release fallback only.
2. Store `{ schemaVersion: 2, layoutVersion, bookmarks, projects, savedAt }`.
3. Catch JSON/quota/private-mode failures; preserve functional rendering.
4. Subscribe only to `launch:getLayout` once client integration switches; remove split writes.

**Verify:**
```bash
node --test public/launch-model.test.mjs public/launch-page.test.mjs
```

**Completion criteria:** Initial Pad/projects always come from one snapshot, old users still paint, and pending operation IDs never survive reload.

### Task 7: Reserve stable sortable DOM and accessibility structure

**Purpose/outcome:** Add zero-shift handle/drop geometry and semantic contracts to first-paint rendering without attaching drag listeners.

**Files:**
- Modify: `public/launch.html`
- Modify: `public/launch-page.test.mjs`

**Symbols/insertion locations:**
- Update CSS for `.tile-wrap`, `.row`, `.project-head`, `.top-grid`, project grids, empty rails.
- Update `render`, `tile`, `pin`, `projectTile`, and `renderProjects`.
- Add `dragHandle`, hidden instruction node, `#launch-dnd-live`, and persistent/dismissible status structure near `#status`.

**Failing tests first:**
- Canonical sortable nodes expose `data-sort-kind`, IDs, `data-zone`, and `data-position`.
- Lists expose `data-drop-list`/`data-drop-zone`; project-list gaps are distinct from project content slots.
- Handle is a `button`, has `data-drag-handle`, exact `aria-label="Move …"`, and `aria-describedby`.
- Top/project handles reserve a 16 × 16 corner; Pinned reserves 16 × 24 before favicon; project reserves a 24 × 24 heading slot with at least 24 px pointer target.
- Empty Top/Pinned rails and empty-project tile slot exist without post-enhancement layout change.
- Live region is `aria-live="polite" aria-atomic="true"` and visually hidden.
- Existing anchors, contextmenu, shortcuts, menu targets, and environment picker contracts remain.

**Implementation steps:**
1. Add handles as siblings of anchors, never make anchors draggable, and never set native `draggable`.
2. Use identity attributes, never DOM indexes, for operation creation.
3. Render Pad zones explicitly even when empty so drop rails are stable.
4. Keep popover copies non-sortable; only canonical Pad/project tiles receive handles.
5. Use existing dark 2 px focus outline on `:focus-visible`.
6. Rename new/adjacent visible copy to “project” where touched; do not broaden into unrelated copy cleanup.

**Verify:**
```bash
node --test public/launch-page.test.mjs
```

**Completion criteria:** The unenhanced page looks unchanged at rest, all handles/drop lists are discoverable, and no listener/module request exists before first paint.

### Task 8: Attach an idempotent controller after first paint

**Purpose/outcome:** Load DnD only after the cached render has painted and preserve a fully functional fallback if enhancement fails.

**Files:**
- Create: `public/launch-dnd.mjs`
- Create: `public/launch-dnd.test.mjs`
- Modify: `public/launch.html`
- Modify: `public/launch-page.test.mjs`

**Symbols/insertion locations:**
- Export `initializeLaunchDnd(options)` returning `{ beforeRender, afterRender, cancel, destroy, getState }`.
- After the existing synchronous `render(bookmarks); renderProjects();`, schedule `requestAnimationFrame(() => import("./launch-dnd.mjs"))`, with `setTimeout(..., 0)` fallback.
- Store controller as `window.launchDndController`.

**Failing tests first:**
- Initial render calls occur textually before import scheduling.
- No DnD import/script/request exists in `<head>` or before initial render.
- Import failure is caught and leaves status/non-DnD behavior untouched.
- Initialization is idempotent, delegates only on `#pad`/`#projects`, and `destroy()` removes listeners.
- `beforeRender()` cancels active drag/captures focus identity; `afterRender()` restores focus/pending markers.
- Local flag supports Phase 2 enablement; kill switch can prevent initialization.

**Implementation steps:**
1. Pass model/state callbacks and DOM roots into the module rather than reaching through many globals.
2. Use delegated pointer/keydown listeners so rerenders never duplicate listeners.
3. Make optional nonessential measurement use `requestIdleCallback` with 500 ms timeout, never as sole initialization.
4. Wrap full `render()`/`renderProjects()` through controller hooks once initialized.

**Verify:**
```bash
node --test public/launch-dnd.test.mjs public/launch-page.test.mjs
```

**Completion criteria:** Cached content renders before module request; delayed/failed import cannot break links, menus, shortcuts, or subscriptions.

---

## Phase 3 — Drag Mechanics and Accessible Operations

### Task 9: Implement pointer/touch drag session and tactile preview

**Purpose/outcome:** Provide thresholded pickup, compact overlay, origin placeholder, live displacement, insertion feedback, cancellation, vibration, and autoscroll.

**Files:**
- Modify: `public/launch-dnd.mjs`
- Modify: `public/launch-dnd.test.mjs`
- Modify: `public/launch.html` (DnD state CSS only)

**Symbols/insertion locations:**
- Add `createPressedSession`, `activatePointerDrag`, `resolveDropTarget`, `updatePreview`, `animateFlip`, `scheduleOverlayFrame`, `updateAutoscroll`, `cancelDrag`.

**Failing tests first:**
- Only primary-button handle `pointerdown` is eligible; second pointers are ignored.
- Mouse starts after distance exceeds 4 CSS px; below threshold pointer-up only focuses handle.
- Touch starts after 250 ms with ≤8 px movement; early movement/short tap keeps scrolling and does not drag.
- Pointer capture is set; target resolution uses `document.elementsFromPoint()`.
- Overlay is 44 × 40 for every bookmark origin, clones the rendered favicon/letter without refetch, is fixed/hidden from AT/non-interactive, and uses translate3d in rAF.
- Project overlay is a compact project-name chip.
- Placeholder preserves measured origin dimensions; siblings move before drop through 120 ms `cubic-bezier(.2,.8,.2,1)` FLIP.
- Indicators are dashed tile slots for grids/empty projects and 2 px rules for Pinned/project-list.
- Invalid targets set overlay opacity 0.55 and announce once per target transition.
- Autoscroll starts within 48 px, scales 4–18 px/frame, recomputes target each frame, and stops on exit/end.
- Pickup vibrates once for 10 ms on touch when supported.
- Escape, pointercancel, lost capture, blur, and hidden document restore pre-drag view.

**Implementation steps:**
1. Track state `idle → pressed → dragging`; suppress selection/navigation only after activation.
2. Recalculate/render only when target zone/index changes.
3. Use FLIP on existing moved nodes, not a full page render per pointer move.
4. Mark valid receiving zone with subtle `--ink` border; invalid state also changes overlay opacity/announcement.
5. Cancel if a dialog/menu/popover/input/project-add mode opens.

**Verify:**
```bash
node --test public/launch-dnd.test.mjs
```

**Completion criteria:** Unit DOM tests prove gesture thresholds, visuals, cancellation, and autoscroll calculations; no anchor behavior is intercepted before pickup.

### Task 10: Wire every supported drop to exact immutable operations

**Purpose/outcome:** Connect pointer previews/drops to the full matrix while rejecting unsupported cross-type operations.

**Files:**
- Modify: `public/launch-dnd.mjs`
- Modify: `public/launch-dnd.test.mjs`
- Modify: `public/launch-model.test.mjs`

**Symbols/insertion locations:**
- Add `operationFromDrop`, `eligibleDropLists`, `commitPreview`.

**Failing tests first:**
- Top↔Top, Pinned↔Pinned, and Top↔Pinned produce `movePadLink` with exact index.
- Pad→project adds at exact index and retains Pad placement.
- Project→same project reorders that membership.
- Project→different project adds/repositions target while retaining source membership.
- Project→project already containing bookmark reorders existing target with no duplicate.
- Project heading→project-list reorders project sections.
- Project→Pad, bookmark→project heading, project→contents, bookmark→project-list gap, outside drop, and cross-type drops reject/cancel.
- Every environment/name field is unchanged by every path.

**Implementation steps:**
1. Resolve source from stable IDs and source zone, not the current DOM index.
2. Use the same model operation to create live preview and final optimistic state.
3. Require an exact project insertion slot; heading alone is invalid.
4. Leave membership removal exclusively in existing picker/menu behavior.

**Verify:**
```bash
node --test public/launch-model.test.mjs public/launch-dnd.test.mjs
```

**Completion criteria:** Every supported matrix row produces exactly one valid operation, every unsupported row cancels, and project membership stays additive.

### Task 11: Add keyboard drag, focus restoration, and final copy

**Purpose/outcome:** Make all supported operations usable from handles with predictable focus and concise screen-reader feedback.

**Files:**
- Modify: `public/launch-dnd.mjs`
- Modify: `public/launch-dnd.test.mjs`
- Modify: `public/launch.html`

**Symbols/insertion locations:**
- Add `handleDragKeydown`, `moveKeyboardSlot`, `cycleKeyboardZone`, `restoreDragFocus`, `announce`.
- Invoke DnD key handling before the current document shortcut handler.

**Failing tests first:**
- Space/Enter pickup/drop; Escape cancel.
- Vertical arrows move one slot; Home/End move first/last.
- Top grid Left/Right move one visual slot and Up/Down move by current four-column geometry with clamping.
- Tab/Shift+Tab cycles eligible bookmark zones in DOM order and retains closest valid index.
- Project drag cannot leave project list.
- Owned keys call both `preventDefault` and `stopPropagation`; unrelated keys/outside state still reach `a/l/g/e/c` and popover handling.
- `aria-pressed="true"` exists only during keyboard drag; no deprecated ARIA attributes.
- Drop/cancel restores moved handle; rollback restores rolled-back handle.
- Remote deletion focuses zone heading/Pad and announces `GitHub is no longer available.`

**Implementation steps:**
1. On pickup, announce item, zone, position/total, and keys using the exact Task 1 formatter.
2. On each preview announce only `[Zone/project], position N of M.`
3. On drop announce `Moved [name] to [zone], position [n].`
4. On cancel announce `Move canceled. [name] returned to [zone], position [n].`
5. Give every handle an item-specific hidden instruction and preserve visible focus.

**Verify:**
```bash
node --test public/launch-dnd.test.mjs public/launch-page.test.mjs
```

**Completion criteria:** Keyboard can execute every supported operation, focus survives rerenders/rollback, and existing shortcuts are unchanged outside drag ownership.

### Task 12: Implement optimistic queue, subscription rebase, rollback, and offline retry

**Purpose/outcome:** Reconcile immediate local movement safely with Convex versions, remote edits, multiple pending operations, transport errors, and offline sessions.

**Files:**
- Modify: `public/launch-model.mjs`
- Modify: `public/launch-model.test.mjs`
- Modify: `public/launch.html`
- Modify: `public/launch-dnd.mjs`
- Create: `public/launch-state.test.mjs`

**Symbols/insertion locations:**
- Add `createLaunchLayoutStore` with `getView`, `drop`, `receiveSnapshot`, `processQueue`, `retryOnline`, `rollback`.
- Replace split subscription callbacks with `launch:getLayout`.
- Use `crypto.randomUUID()` for operation IDs.

**Failing tests first:**
- Drop updates DOM/model and v2 storage synchronously before mutation promise settles.
- Queue sends serially; a second rapid drop waits behind the first.
- Success replaces `confirmed`, removes by operation ID, replays remainder, writes cache, and rerenders.
- Higher subscription version replaces confirmed and replays pending intent while retaining remote rename/environment updates; equal/lower versions do not rerender.
- First conflict rebases same identity/index intent and retries once.
- Second conflict or missing item/target removes dependent operations and restores authority.
- Online transport errors retry after 250 ms, 1 s, and 3 s while preview stays pending.
- Offline keeps pending only in memory, writes status, sends nothing until `online`, and reload cannot claim it.
- Duplicate acknowledgment cannot double-apply.
- Failure restores DOM, cache, focus, and exact authoritative metadata.

**Implementation steps:**
1. Keep `confirmed`, `pendingOperations`, and derived `view` separate; never mutate confirmed.
2. On drop write `view` and cache in the same synchronous task, mark affected nodes/zones `data-pending="true"`, and announce `Saving order…`.
3. Clear status on next successful operation or explicit dismiss only.
4. Use exact persistent status copy:
   - `Couldn’t save that move. Your previous order is restored.`
   - `You’re offline. Reconnect, then try the move again.`
   - `The layout changed elsewhere. Review the latest order and try again.`
5. Do not dim/disable links while pending; use a low-key dotted outline.

**Verify:**
```bash
node --test public/launch-model.test.mjs public/launch-state.test.mjs public/launch-dnd.test.mjs
```

**Completion criteria:** Deterministic fake-client tests cover delay, conflict, duplicate, remote update, deletion, failure, offline, and rapid queues with no lost/duplicated membership.

### Task 13: Finish reduced motion and interaction conflict rules

**Purpose/outcome:** Remove motion when requested and guarantee drag does not conflict with navigation, context menus, overlays, forms, shortcuts, or add mode.

**Files:**
- Modify: `public/launch.html`
- Modify: `public/launch-dnd.mjs`
- Modify: `public/launch-page.test.mjs`
- Modify: `public/launch-dnd.test.mjs`

**Symbols/insertion locations:**
- Add `@media (prefers-reduced-motion: reduce)`.
- Add `isPickupBlocked` and overlay-open cancellation calls to `openMenu`, `openProjectMenu`, `openGroupPicker`, `openEnvironmentPicker`, `openAddLinkDialog`, rename/URL inputs, and project add mode.

**Failing tests first:**
- Reduced motion disables FLIP, overlay lift, snap-back, and easing while retaining immediate DOM reorder, indicator, opacity/border feedback, and announcements.
- Reduced-motion autoscroll uses fixed 10 px steps.
- Active menu/popover/dialog/input/environment picker/add mode blocks pickup.
- Opening any of those during drag cancels first.
- Right-click never picks up and still opens existing menu.
- Handle drag never fires anchor click/recordClick/navigation.
- Short handle click focuses only.
- Existing `a/l/g/e/c`, Escape precedence, keyboard target pinning, and normal link clicks pass.

**Implementation steps:**
1. Read `matchMedia("(prefers-reduced-motion: reduce)")` at session start and listen for changes.
2. Keep indicators and order updates immediate under reduced motion.
3. Centralize conflict detection rather than duplicating selectors in event handlers.
4. Preserve add dialog/menu focus semantics and native button labels.

**Verify:**
```bash
node --test public/launch-page.test.mjs public/launch-dnd.test.mjs
```

**Completion criteria:** No interaction mode can accidentally start or survive a conflicting drag, and reduced-motion behavior remains fully informative.

---

## Phase 4 — Browser Proof, Rollout, and Tightening

### Task 14: Add browser interaction and first-paint regression coverage

**Purpose/outcome:** Prove real pointer/touch/focus/autoscroll behavior and the first-paint/CLS guarantees that source tests cannot establish.

**Files:**
- Modify: `package.json`
- Create: `playwright.config.mjs`
- Create: `tests/launch-dnd.spec.mjs`
- Create: `tests/fixtures/launch-dnd.html` or add deterministic request interception within the spec

**Symbols/insertion locations:**
- Add `test:launch-browser` script.
- Build fixture helpers for seeded v2 storage, delayed/rejected Convex mutation, synthetic subscription updates, and reduced-motion emulation.

**Failing tests first:**
- Mouse <4 px does not drag/navigate; valid handle drag displaces siblings before pointer-up.
- Top↔Pinned exact insertion; Pad→empty/populated project exact insertion.
- Same/cross-project additive placement and project reorder.
- Invalid target cancellation, normal click, and contextmenu regression.
- Keyboard pickup, arrows, grid geometry, zone Tab cycle, Home/End, drop/cancel, and focus restoration.
- Touch short tap versus 250 ms long-press and 8 px tolerance; one pickup vibration via stub.
- Viewport autoscroll and target recomputation.
- Immediate DOM/localStorage optimistic update before delayed mutation.
- Pending marker, rollback/status, offline→online retry, and two-drop serialization.
- Remote update during pending preserves remote rename/environment with no duplicate/flicker; remote deletion restores fallback focus.
- DnD module delayed/failed: cached content paints first and all non-DnD behavior works.
- Performance observer/layout-shift entries attributable to enhancement total exactly 0.
- Reduced-motion animation durations/transforms are absent while order/announcements update.

**Implementation steps:**
1. Add Playwright only now, as explicitly required by the specification; do not replace Node tests.
2. Test current Chromium and WebKit desktop plus an iPhone WebKit project.
3. Mock only the Convex transport boundary; exercise production `launch.html`, `launch-model.mjs`, and `launch-dnd.mjs`.
4. Capture before/after bounding boxes for live displacement and layout stability assertions.

**Verify:**
```bash
pnpm exec playwright install chromium webkit
pnpm test:launch-browser
node --test public/launch-model.test.mjs public/launch-page.test.mjs public/launch-dnd.test.mjs public/launch-state.test.mjs
pnpm typecheck
pnpm check
```

**Completion criteria:** Browser suite passes in Chromium/WebKit desktop and iPhone WebKit; cached paint precedes delayed DnD request and enhancement CLS is zero.

**Touch coverage limitation (2026-09-25):** Chromium runs CDP-emulated touch. Desktop WebKit and iPhone WebKit run synthetic touch `PointerEvent`s through the production handlers (tap focus, 250 ms/8 px boundaries, drop, no navigation). Real native iOS Safari touch (UIKit gesture arbitration, scroll versus long-press, haptics) cannot be automated by Playwright and remains a manual on-device check; the suite annotates it as `manual-limitation`, not as an automated pass.

### Task 15: Roll out safely, then tighten schema after verification

**Purpose/outcome:** Enable progressively, verify canonical production data, and remove migration-only looseness only after a stable release.

**Files:**
- Modify: `public/launch.html`
- Modify: `public/launch-page.test.mjs`
- Modify later: `convex/schema.ts`
- Modify later: `convex/launch.ts`
- Modify later: `convex/launch-layout.test.ts`

**Symbols/insertion locations:**
- Phase 2 flag: `localStorage["launch-dnd-enabled"] === "1"`.
- Phase 3 default enablement with one-release kill switch query/local flag.
- Phase 4: make three position fields required; retire compatibility reads/writes and migration endpoint only after checks.

**Failing tests first:**
- Flag off skips module initialization during private rollout; flag on initializes.
- Default-on respects explicit kill switch.
- Verification query reports zero missing/gapped positions and ambiguous tags before required schema test changes.
- Required validators reject missing positions after tightening.
- Legacy snapshot/API code is removed only in final phase.

**Implementation steps:**
1. Run the backfill and verification against development first.
2. Enable locally behind the flag; complete all browser/regression checks.
3. Enable by default after Safari/Chromium/iOS gates pass; retain kill switch for one release.
4. After stable production verification, require `launchProjects.position`, `launchBookmarks.padPosition`, and membership `position`.
5. Remove legacy snapshot writes/read fallback, `list`/`listProjects` compatibility usage, and temporary migration function only after the one-release window.
6. Keep the no-op `requireAuth` limitation documented as separate security work; do not expand this feature into auth migration.

**Staged rollout note (2026-09-25):** Phase 3 was enabled by default while the physical iOS Safari touch gate was still open. No on-device iOS Safari test has been performed or claimed. This is a known rollout limitation: the retained local/query kill switch is the fallback if native touch behavior causes regressions. Post-enable Convex error monitoring and user-visible rollback-status monitoring also remain outstanding. Phase 4 schema tightening and compatibility/migration removal remain deferred because production backfill verification, the open physical-device gate, and a stable one-release window cannot be proven from the development workspace.

**Phase 3 implementation status (2026-09-25):**
- `loadLaunchDnd` now initializes by default. Kill switches: `?launch-dnd=0` (checked first, independent of storage access) and `localStorage["launch-dnd-disabled"] === "1"`; either wins over everything else.
- The Phase 2 opt-in key `launch-dnd-enabled` is no longer read. Prior opt-in users (`"1"`) stay enabled because enablement is now the default; any other stored value (including `"0"`) never meant "kill" and is ignored. Only `launch-dnd-disabled`/the query parameter disable.
- Tests: `launch-page.test.mjs` executes the extracted `loadLaunchDnd` in a VM for default-on, blocked storage, prior opt-in, and each kill switch (including kill + opt-in); Playwright `enhancement is on by default…` and `query and local kill switches…` cover the same in all three projects.
- Development backfill/verification (`dev:fantastic-tapir-210`): `verifyLayoutOrdering` reported `valid: true` with 45 bookmarks, 3 projects, 10 memberships, 1 singleton, and no violations; `backfillLayoutOrdering` returned `alreadyInitialized: true`, zero normalized tags and repaired positions (idempotent no-op at layout version 2).
- Rollout gate status: desktop/synthetic browser coverage passed, but the physical iOS Safari touch gate remains open. Default-on therefore does not represent full gate compliance.
- Monitoring status: post-enable Convex errors and user-visible rollback events have not yet been monitored. Until that monitoring and the physical-device check are complete, the kill switch remains the operational fallback.

**Phase 4 deferral (not done):** Required position validators, removal of `backfillLayoutOrdering`/`verifyLayoutOrdering`, `list`/`listProjects`/`setProjects` compatibility, and the one-release legacy cache read fallback all stay. `convex/launch-layout-source.test.ts` (`Task 15 Phase 4 tightening stays deferred…`) asserts these endpoints remain exported and positions remain optional; it must be inverted, together with the "Required validators reject missing positions" and "Legacy snapshot/API code is removed" tests, only after (1) production `verifyLayoutOrdering` returns `valid: true` and (2) one stable release with the default-on flag has shipped. Neither gate is provable from this workspace. The kill switch is likewise retained until that window closes.

**Verify:**
```bash
npx convex dev --once
pnpm exec vitest run convex/launch-layout.test.ts
node --test public/launch-model.test.mjs public/launch-page.test.mjs public/launch-dnd.test.mjs public/launch-state.test.mjs
pnpm test:launch-browser
pnpm typecheck
pnpm check
```

**Completion criteria:** Canonical data has required contiguous positions, feature gates behave as intended, compatibility code is removed only after the stable window, and all suites pass.

---

## Final Verification Matrix

| Spec acceptance criterion | Automated proof | Manual/browser proof |
|---|---|---|
| 1. Cached content paints before DnD request; failure preserves fallback | `launch-page.test.mjs` ordering contracts | Playwright delayed/failed module request |
| 2. Enhancement causes zero layout shift | Reserved-geometry source tests | Chromium only: `layout-shift` PerformanceObserver CLS = 0. WebKit/iPhone WebKit expose no `layout-shift` entries, so they substitute identical before/after sortable bounding boxes, unchanged board box, and zero DOM mutations across enhancement (annotated `limitation`, not a CLS measurement) |
| 3. Mouse, touch, keyboard perform every supported operation | Model/DnD operation matrix tests | Desktop Chromium/WebKit + iPhone WebKit Playwright matrix; touch is CDP-emulated (Chromium) or synthetic `PointerEvent` (WebKit). Physical iOS Safari touch is a manual gate (see checklist), not an automated pass |
| 4. Surrounding items reposition before drop | FLIP unit assertions | Bounding boxes change before pointer-up |
| 5. Every bookmark overlay is compact favicon box | Overlay DOM/style tests | Pinned-, Top-, and project-origin screenshot/geometry checks |
| 6. Top/Pinned remain mutually exclusive | Model, migration, Convex transaction tests | Reload after cross-zone move |
| 7. Project membership is additive/no duplicates | Model and Convex tests | Cross-project and existing-target browser drops |
| 8. Exact insertion survives reload/cached paint | Snapshot/model/transaction tests | Reload and inspect first cached frame |
| 9. Optimistic UI changes before backend resolves | Store fake-client test | Delayed-mutation browser assertion |
| 10. Conflicts, duplicates, remote updates, rapid drops, offline, failures are safe | Convex/store state-machine tests | Delayed/conflict/offline browser scenarios |
| 11. Failure restores order, focus, cache, and clear status | Store/DnD focus tests | Rejected mutation browser check with exact copy |
| 12. Existing shortcuts, targets, links, menus, rename, environment picker regressions pass | `launch-page.test.mjs`, `launch-dnd.test.mjs`, environment tests | Keyboard/right-click/manual smoke pass |
| 13. Reduced motion is immediate, nonanimated, and fully announced | Media-query/DnD tests | Playwright reduced-motion emulation |

## Final Manual Smoke Checklist

- At rest, Launch retains the compact current spacing, typography, white cards, zinc borders, and restrained shadows.
- Handle affordances are quiet until hover/focus/drag and never cover favicon, label, environment badge, plus, or menu controls.
- Top/project insertion uses a compact dashed tile; Pinned/project-list insertion uses a crisp 2 px rule.
- The 44 × 40 overlay uses the existing favicon/letter node and menu-strength shadow; no new favicon request occurs.
- Valid zones show both an insertion shape and border; invalid zones show no indicator, lowered overlay opacity, and one announcement.
- Pending items remain fully usable with a dotted outline.
- Persistent failure status is selectable, dismissible, and uses the exact approved text.
- Two or more memberships in one project can display the same environment. Reordering or copying never changes environment labels.
- Normal links, right-click menus, project plus mode, rename/URL inputs, environment picker, add-link dialog, and `a/l/g/e/c` shortcuts behave exactly as before.
- **Manual gate — physical iOS Safari (not yet performed):** on a real iPhone, a short tap on a handle focuses without dragging or navigating; a vertical swipe starting on a handle scrolls the page; a ~250 ms long-press picks up with one haptic (where supported) and drags Top↔Pinned and Pad→project; drop does not navigate. Playwright cannot automate UIKit gesture arbitration or haptics.
- With no flags, DnD initializes; `?launch-dnd=0` or `localStorage["launch-dnd-disabled"] = "1"` leaves the complete non-DnD page with no `launch-dnd.mjs` request.
