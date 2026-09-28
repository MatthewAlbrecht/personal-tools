---
title: Launch drag-and-drop
status: implementation-ready
date: 2026-09-25
---

# Launch drag-and-drop design

## Goal

Add tactile, accessible drag-and-drop ordering to the static Launch page without delaying its cached first paint.

The system must:

- reorder Top links;
- reorder Pinned links;
- move a link between Top and Pinned;
- add a pad link to a project at the exact dropped position;
- reorder links inside a project;
- add a project link to another project at the exact dropped position;
- reorder projects;
- update the UI immediately, then reconcile safely with Convex.

This design preserves the current compact, monochrome Launch aesthetic, right-click menus, `a` / `l` / `g` / `e` / `c` shortcuts, and pinned popover keyboard targets. It does not introduce React, shadcn, or a drag-and-drop framework.

## Current constraints

`public/launch.html` paints the `launch-bookmarks` and `launch-projects` localStorage snapshots synchronously, then loads the Convex browser client and `launch-model.mjs` from a module script. Top and project links are favicon tiles; Pinned links are text rows. Projects and project memberships currently inherit bookmark creation order because no explicit order exists.

Current data permits both `top` and `pinned` tags, neither tag, and membership in any number of projects. Rendering resolves ambiguous tags by showing `top` items only in Top and untagged items in Pinned. The drag system must remove that ambiguity.

`requireAuth` is currently a no-op because access is expected to be enforced by the Next.js middleware/session-cookie boundary. New Launch APIs must call it for consistency, but this is not equivalent to server-side Convex authorization. See Open risks.

## Vocabulary and data semantics

Use these terms consistently in code and user-facing text:

- **Pad**: the entire left column.
- **Top**: the favicon grid at the top of the Pad.
- **Pinned**: the named rows below Top.
- **Project**: a right-column collection. Use “project,” not “group,” in all new labels and announcements.
- **Project membership**: one bookmark’s presence in one project, including its project-specific display name, environment, and position.
- **Zone**: Top, Pinned, or one specific project’s link list.
- **Project list**: the ordered list of project sections.

### Membership rules

1. Every bookmark belongs to exactly one Pad zone: Top or Pinned.
2. A bookmark may also belong to zero, one, or many projects.
3. Adding a Pad bookmark to a project does not remove it from the Pad.
4. Adding a project bookmark to another project does not remove its original membership.
5. A bookmark may appear only once in a given project.
6. Moving Top ↔ Pinned is a move, not a copy.
7. Project-specific `name` and `environment` stay attached to that project membership when it is reordered.

The existing `tags` field remains for a surgical migration, but after migration it must contain exactly one value: `["top"]` or `["pinned"]`. Do not add a third tag for projects. Normalize historical data as follows:

- both tags → Top;
- only `top` → Top;
- only `pinned` → Pinned;
- neither tag → Pinned.

New and updated bookmarks must enforce this invariant server-side. A later cleanup may replace `tags` with a scalar `padZone`, but that is not required for this feature.

## Ordering model

Use contiguous integer positions, starting at `0`:

- `launchBookmarks.padPosition` orders a bookmark within its one Pad zone;
- `launchBookmarks.projects[].position` orders that membership within its project;
- `launchProjects.position` orders project sections.

Sort by `position`, then `_creationTime` as a deterministic migration/error fallback. Positions are scoped to their zone, so `padPosition: 0` may exist once in Top and once in Pinned.

### Why integers

The Launch page is a small personal dataset and every reorder already needs a transaction to enforce zone and membership invariants. Integer renumbering is easier to inspect, test, migrate, and repair than fractional values or LexoRank. It avoids precision exhaustion, rank-string rules, and background compaction.

Every successful layout mutation compacts only the affected lists to `0…n-1` in the same transaction:

- Top ↔ Pinned compacts both Pad zones;
- project-link changes compact the source and target project when both differ;
- project reorder compacts the project list;
- same-zone reorder compacts that zone only.

The UI may calculate a preview by array insertion, but it never invents persisted positions.

## Interaction model

### Drag handles and gesture safety

Links remain normal links. Do not make the anchor itself draggable and do not use native HTML `draggable`, which produces inconsistent touch behavior and browser ghost images.

Each sortable item gets a dedicated handle:

- Top/project tile: a visually quiet grip in a reserved 16 × 16 px corner area.
- Pinned row: a reserved 16 × 24 px grip before the favicon.
- Project: a 24 × 24 px grip before the heading.

The reserved space exists in the first-paint markup/CSS so enhancement causes no layout shift. Handles are transparent until hover, focus-visible, or active drag. Each handle is a `button` with a specific accessible name such as `Move GitHub` or `Move Moose project`.

Only primary-button pointer input on the handle can start a drag. Right-click continues to open the existing context menu. Clicking or tapping the anchor continues to open the link. Dragging must not trigger click, navigation, menu opening, hover shortcuts, or project add mode.

### Pointer and mouse

1. On mouse/trackpad `pointerdown`, record the item and pointer position and call `setPointerCapture`.
2. Start dragging only after movement exceeds 4 CSS px. Before that threshold, pointer-up is an ordinary handle click and focuses the handle.
3. Once dragging starts, suppress text selection and link activation for that pointer only.
4. Use pointer coordinates with `document.elementsFromPoint()` to resolve targets; do not depend on stale event targets after pointer capture.
5. Pointer-up on a valid insertion slot commits. Pointer-up elsewhere cancels.
6. `Escape`, `pointercancel`, lost capture, window blur, or document visibility loss cancels and restores the pre-drag optimistic view.

### Touch

- Touch drag begins after a 250 ms long-press on the handle with no more than 8 CSS px movement.
- Before activation, normal page scrolling remains available.
- After activation, the handle uses pointer capture and prevents scrolling for that pointer while the rest of the page remains unchanged.
- A short tap focuses the handle and does not open the link.
- Trigger one light vibration (`navigator.vibrate?.(10)`) at pickup only; absence or denial is harmless.
- Use the same drop resolution and autoscroll behavior as mouse.

### Keyboard

The focused handle provides sortable keyboard interaction:

- `Space` or `Enter`: pick up the item.
- `ArrowUp` / `ArrowDown`: move one insertion slot in a vertical list.
- Top grid only: `ArrowLeft` / `ArrowRight` move one visual slot; `ArrowUp` / `ArrowDown` move by the current four-column grid geometry while clamping to the list.
- `Home` / `End`: move to first/last slot in the current zone.
- Link drag only: `Tab` and `Shift+Tab` cycle eligible zones in DOM order (Top, Pinned, then projects); retain the closest valid index in the newly selected zone. Arrow keys then choose the exact insertion slot.
- Project drag: only the project list is eligible.
- `Space` or `Enter`: drop.
- `Escape`: cancel.

Pickup immediately announces the item, current zone, position, total, and available keys. Each move announces the prospective zone and position. Drop announces success; cancel announces that no changes were made.

After drop or cancel, restore focus to the moved item’s handle in its resulting/original location. If a server rollback occurs, restore focus to that item’s handle in the rolled-back location. If the item was deleted remotely, focus the zone heading or Pad container and announce that the item is no longer available.

Keyboard DnD handling runs before the existing document shortcut handler and calls `preventDefault()` plus `stopPropagation()` only for the keys it owns while a handle is focused or a drag is active. Outside that state, all existing shortcuts and popover keyboard-target rules remain unchanged.

### Reduced motion

Honor `prefers-reduced-motion: reduce`:

- no animated displacement, overlay lift, snap-back, or autoscroll easing;
- DOM order and insertion indicators still update immediately;
- use opacity/border changes only.

## Visual behavior

The visual direction is the existing Launch language: white cards, zinc lines, restrained shadows, compact radii, and no new accent palette.

### Pickup and overlay

Every bookmark drag uses the same compact favicon-box overlay, regardless of origin:

- 44 × 40 px;
- current `.tile` white surface, zinc border, and rounded corners;
- the bookmark favicon (or existing letter fallback) centered at 22 px;
- slight `translateY(-2px)` and existing menu-strength shadow;
- `aria-hidden="true"` and `pointer-events: none`.

Project drag uses a compact heading chip containing the project name, not a favicon box.

The overlay follows the pointer using `transform: translate3d(...)` in `requestAnimationFrame`. It never participates in layout.

### Origin placeholder and live displacement

At pickup, retain an origin placeholder with the source item’s measured width and height. The source item becomes visually hidden but remains represented in the sortable model.

As the active insertion index changes:

1. mutate only the in-memory preview order;
2. render/move existing DOM nodes into preview order;
3. animate affected siblings from prior to new bounds using FLIP transforms, 120 ms `cubic-bezier(.2,.8,.2,1)`;
4. keep the insertion indicator visible at the current slot.

Items must visibly shift during drag, not wait for drop. Do not re-render the entire page on every pointer move; recalculate only when the resolved target/index changes.

### Insertion indicators

- Top/project grids: a dashed compact tile-sized slot.
- Pinned: a 2 px horizontal rule spanning the row content.
- Project list: a 2 px horizontal rule between project sections.

An empty project displays a tile-sized dashed slot while it is a valid target. Empty Top/Pinned zones retain a stable, initially hidden minimum-height drop rail so they can receive items without creating layout shift after enhancement.

### Valid and invalid targets

- Valid target: insertion indicator plus a subtle `--ink` border on the receiving zone.
- Invalid target: no insertion indicator; overlay opacity drops to 0.55 and the live-region says “Can’t drop here” once per target transition.
- The add-project button, menus, popovers, dialogs, inputs, and project action buttons are invalid targets.
- While any dialog, menu, popover, rename input, URL input, environment picker, or project add mode is active, drag pickup is disabled. Opening one while dragging cancels first.

Project sections do not auto-expand because they are not collapsible. Hovering a project target for 400 ms may strengthen its border, but must not alter its structure.

### Autoscroll

During pointer drag, scroll the nearest scrollable ancestor; for the current page this is normally the viewport:

- activate within 48 px of the top or bottom edge;
- speed scales from 4 to 18 px per animation frame based on edge proximity;
- stop immediately when the pointer leaves the edge, the drag ends, or reduced motion is enabled (with reduced motion, use a fixed 10 px step rather than easing).

Recompute the target after every autoscroll frame.

### Success and failure

The optimistic arrangement remains in place on drop. Set `data-pending="true"` on affected items/zones and show a low-key dotted outline; do not dim content or disable links.

Do not toast routine success. Announce “Moved [name] to [zone], position [n]” in the polite live region.

On failure, animate back unless reduced motion is enabled, restore the authoritative arrangement, focus the item, and show one persistent inline status near the existing `#status`:

- `Couldn’t save that move. Your previous order is restored.`
- Offline: `You’re offline. Reconnect, then try the move again.`
- Conflict after one automatic retry: `The layout changed elsewhere. Review the latest order and try again.`

Status text must be selectable and remain until the next successful operation or explicit dismissal; do not use a transient toast.

## Drop matrix

| Drag source | Drop target | Result |
|---|---|---|
| Top link | Top slot | Reorder Top |
| Pinned link | Pinned slot | Reorder Pinned |
| Top link | Pinned slot | Move to Pinned at exact slot; remove Top tag |
| Pinned link | Top slot | Move to Top at exact slot; remove Pinned tag |
| Top/Pinned link | Project slot | Add membership at exact slot; Pad placement unchanged |
| Project link | Same project slot | Reorder that membership |
| Project link | Different project slot | Add membership at exact slot; source membership remains |
| Project link | Project where already present | Reorder existing target membership to the dropped slot; source membership remains |
| Project heading handle | Project-list slot | Reorder projects |

Intentionally unsupported:

- Project link → Top/Pinned: rejected. A project appearance does not identify whether the user intends to move the Pad copy, and every bookmark already has exactly one Pad placement. Use the Pad copy to move between Top and Pinned.
- Dropping a project link outside a project does not remove membership. Removal stays in the existing project picker/menu so an imprecise drag cannot delete organization.
- Bookmark → project heading without an insertion slot is invalid; exact placement is required.
- Project → project contents, bookmark → project-list gaps, and all cross-type drops are invalid.
- Multi-selection and bulk drag are out of scope.

## Progressive enhancement and first paint

### Critical path

No drag library, drag module, Convex request, or feature-detection work may block cached first paint.

The existing synchronous sequence remains:

1. read bookmark/project snapshots from localStorage;
2. render the Pad and projects;
3. paint.

The first-paint renderer must include stable data attributes, reserved handle space, empty-zone minimum heights, and the small set of DnD state styles. It must not attach DnD listeners.

### Enhancement timing

After the initial synchronous `render(bookmarks); renderProjects();`:

1. schedule `requestAnimationFrame`;
2. inside it, dynamically import `./launch-dnd.mjs`;
3. initialize after import resolves;
4. if `requestAnimationFrame` is unavailable, use `setTimeout(..., 0)`;
5. `requestIdleCallback` may be used after the first frame for nonessential measurements, with a 500 ms timeout, but not as the only initialization path.

`launch-dnd.mjs` uses event delegation on `#pad` and `#projects`, so Convex-driven renders do not attach duplicate listeners. Initialization must be idempotent and expose `destroy()` for tests.

Enhancement failure leaves a fully working non-drag page. Existing menus, shortcuts, link navigation, rename controls, and project picker remain the fallback.

### Layout stability budget

- DnD initialization must produce cumulative layout shift `0`.
- Handle slots and empty-zone drop rails are reserved by first-paint CSS.
- The drag overlay is appended only after pickup and is fixed-position.
- No favicon is re-fetched solely for the overlay; clone the rendered favicon/letter node.

## Client state and reconciliation

### State layers

Maintain three explicit layers:

- `confirmed`: latest authoritative Convex layout and `layoutVersion`;
- `pendingOperations`: ordered local operations not yet acknowledged;
- `view`: `confirmed` with all pending operations replayed through pure model functions.

Never mutate `confirmed` in place. Rendering and localStorage use `view`.

Each operation contains:

```js
{
  operationId,       // crypto.randomUUID()
  kind,              // movePadLink | placeProjectLink | moveProject
  itemId,
  sourceZone,
  targetZone,
  targetIndex,
}
```

Use identity plus destination index, not a complete client-supplied reordered array. The server derives canonical lists and validates membership.

### State machine

`idle → pressed → dragging → optimisticPending → confirmed`

Side exits:

- `pressed → idle` for click/short tap;
- `dragging → idle` for cancel;
- `optimisticPending → rolledBack` for definitive failure;
- `optimisticPending → rebasing → optimisticPending|confirmed` for subscription updates/conflicts.

Only one physical/keyboard drag may be active. A second pointer cannot start another drag. After the first drop, another drag may start while its mutation is pending; it becomes the next queued operation.

### Queue and race handling

1. On drop, apply the operation to `view` synchronously, write the combined local snapshot synchronously, mark affected nodes pending, and enqueue the operation.
2. Send mutations serially. The head operation sends the current confirmed `layoutVersion` as `expectedVersion`.
3. On success, replace `confirmed` with the returned canonical snapshot/version, remove that operation by `operationId`, replay remaining operations, rewrite the snapshot, and render.
4. The server deduplicates a retried `operationId`; a duplicate returns the already-current canonical state without applying twice.
5. On a version conflict, fetch/use the newest authoritative layout, replay the same intent by item identity and target zone/index, and retry once with the new version.
6. If the item or target project no longer exists, or the second attempt conflicts, remove that operation and all later operations that depend on the missing item/zone; rebuild from authoritative state and show the conflict message.
7. On a transport error while `navigator.onLine !== false`, retry with exponential delays of 250 ms, 1 s, and 3 s. Keep the pending preview during these transient retries.
8. When offline, do not claim the operation is saved. Keep it pending in memory only, show the offline status, and retry when `online` fires during the same page session. A reload discards unsent operations and uses the last confirmed snapshot.

### Convex subscription updates

The layout subscription returns one atomic snapshot, not separate bookmark and project streams. When an update arrives:

- if its version is lower than `confirmed`, ignore it;
- if equal, ignore duplicate rendering;
- if higher, replace `confirmed`, remove any pending operation IDs listed as applied by the response if present, replay remaining local operations, and render;
- never overwrite `view` directly while operations are pending.

This lets unrelated remote edits (rename, environment, add/delete) flow through while preserving local optimistic ordering. Pure replay must retain remote non-order fields and apply only the pending operation’s ordering/membership intent.

## Local snapshot

Replace the two independently written ordering snapshots with one versioned key:

`launch-layout-v2`

```js
{
  schemaVersion: 2,
  layoutVersion: number,
  bookmarks: [...],
  projects: [...],
  savedAt: number
}
```

First paint reads this combined snapshot to avoid bookmark/project tearing. For one release, if v2 is absent, read the existing `launch-bookmarks` and `launch-projects` keys, normalize their inferred order in memory, and paint them. The first authoritative response writes v2.

Write the optimistic `view` immediately on drop so same-tab navigation/reload reflects the visible order. Also retain a separate in-memory `confirmed` snapshot. Do not persist unsent operation IDs or claim pending state across reload; if a mutation fails definitively, overwrite v2 with the rolled-back authoritative state.

All existing bookmark/project subscription paths that write the legacy keys must stop once v2 is active.

## Pure model module

Extend `public/launch-model.mjs` with framework-free helpers. Named functions use classic declarations.

Required responsibilities:

- normalize historical Pad tags into one zone;
- derive sorted Top, Pinned, project memberships, and projects;
- remove/insert an item with clamped index;
- apply each operation immutably;
- compact positions;
- reject invalid operations with a typed result;
- replay pending operations over an authoritative snapshot;
- identify dependent operations for rollback;
- produce concise live-region text.

The page and Convex helper logic should share behavior through equivalent tests, not by importing browser `.mjs` into Convex.

## Convex schema and API

### Schema migration

Add optional fields first:

```ts
launchProjects: defineTable({
  name: v.string(),
  position: v.optional(v.number()),
  createdAt: v.number(),
})

launchBookmarks: defineTable({
  // existing fields
  padPosition: v.optional(v.number()),
  projects: v.array(v.object({
    projectId: v.id("launchProjects"),
    name: v.optional(v.string()),
    environment: v.optional(environmentValidator),
    position: v.optional(v.number()),
  })),
})

launchLayoutState: defineTable({
  key: v.literal("default"),
  version: v.number(),
  recentOperationIds: v.array(v.string()),
  updatedAt: v.number(),
}).index("by_key", ["key"])
```

No new ordering index is needed. Launch already reads the bounded personal dataset and ordering spans embedded project memberships. The state table’s `by_key` index guarantees the singleton lookup.

Backfill in one authenticated development mutation or migration:

1. normalize each bookmark to one Pad tag;
2. assign `padPosition` from current rendered order independently in Top and Pinned;
3. assign each membership position from current bookmark creation order per project;
4. assign project positions from current `createdAt` order;
5. create the singleton state at version `1`.

After production data is backfilled and verified, make all three position fields required. Until then, reads use `_creationTime` / `createdAt` fallback and return canonical numeric positions.

### Atomic query

Add `getLayout`:

- kind: public query;
- args: `{}`;
- returns: `{ version, bookmarks, projects }` with full explicit validators;
- auth: `requireAuth(ctx)`;
- behavior: read the singleton plus bounded Launch tables, normalize legacy missing positions in the returned projection, and return one coherent snapshot.

Retain `list` and `listProjects` only during migration. The enhanced page subscribes exclusively to `getLayout`.

### Transactional mutation

Add `applyLayoutOperation`:

```ts
args: {
  operationId: v.string(),
  expectedVersion: v.number(),
  operation: v.union(
    v.object({
      kind: v.literal("movePadLink"),
      bookmarkId: v.id("launchBookmarks"),
      targetZone: v.union(v.literal("top"), v.literal("pinned")),
      targetIndex: v.number(),
    }),
    v.object({
      kind: v.literal("placeProjectLink"),
      bookmarkId: v.id("launchBookmarks"),
      sourceProjectId: v.optional(v.id("launchProjects")),
      targetProjectId: v.id("launchProjects"),
      targetIndex: v.number(),
    }),
    v.object({
      kind: v.literal("moveProject"),
      projectId: v.id("launchProjects"),
      targetIndex: v.number(),
    }),
  ),
}
```

Returns a discriminated union:

```ts
v.union(
  v.object({
    status: v.literal("applied"),
    operationId: v.string(),
    version: v.number(),
    bookmarks: v.array(bookmarkValidator),
    projects: v.array(projectValidator),
  }),
  v.object({
    status: v.literal("conflict"),
    operationId: v.string(),
    version: v.number(),
    bookmarks: v.array(bookmarkValidator),
    projects: v.array(projectValidator),
  }),
)
```

Rules:

- call `requireAuth(ctx)`;
- validate `operationId` as non-empty and at most 100 characters in handler;
- require finite integer `targetIndex >= 0`, then clamp to list length;
- verify the bookmark/project exists;
- verify `sourceProjectId` membership when supplied;
- if `operationId` is in `recentOperationIds`, return `applied` with current canonical state without another write;
- if `expectedVersion !== version`, return `conflict` with no writes;
- otherwise apply and compact all affected lists, increment version once, append/dedupe the operation ID, retain the newest 50 IDs, and return the canonical snapshot;
- all reads and writes occur in this one mutation transaction.

`placeProjectLink` preserves existing membership metadata if the target membership exists. For a new target membership, create `{ projectId, position }` with no name or environment override. When source and target projects are the same, it is a reorder. When they differ, the source membership is untouched.

Keep the public wrapper thin:

```ts
handler: async (ctx, args) => {
  requireAuth(ctx);
  return await applyLayoutOperation(ctx, args);
}
```

Put validation-independent ordering logic in typed plain functions in a focused Convex helper module. Use `MutationCtx`, `Doc`, and `Id`; no `any`. Every public/internal function requires `args` and `returns`. Await every database operation.

Existing create/update/project mutations must assign or preserve canonical positions and increment the same layout version whenever they change the layout snapshot. Otherwise a subscription could change without a version change. `setProjects` should remain only as a compatibility API during migration and must canonicalize membership positions.

### Authentication note

Match the current Launch API by calling `requireAuth`, but do not describe this as secure Convex authorization: the inspected helper is a no-op. Before exposing the Convex deployment beyond the current private route assumptions, replace it with a real `ctx.auth.getUserIdentity()`-based wrapper and per-user data ownership. That security change is broader than drag-and-drop.

## Rendering integration

Add stable DOM contracts:

- `data-sort-kind="bookmark"` / `"project"`;
- `data-bookmark-id`, `data-project-id`, and `data-zone`;
- `data-position`;
- `data-drag-handle`;
- `data-drop-list` and `data-drop-zone`;
- one `aria-live="polite" aria-atomic="true"` visually hidden region;
- `aria-describedby` from each handle to concise hidden instructions.

Do not use DOM index as identity. Host popovers may show the same bookmark in another representation; only the canonical Pad tile/row and project tile are sortable.

Before a full `render()` or `renderProjects()`, the page calls the DnD controller’s `beforeRender()`. It cancels an active drag without committing, captures focus identity, and suppresses stale FLIP measurements. After rendering, call `afterRender()` to restore focus and pending markers.

## Accessibility details

- Handles are real buttons and meet a 24 × 24 px pointer target through transparent padding without changing visible density.
- Use `aria-pressed="true"` while a handle owns a keyboard drag; do not use deprecated `aria-grabbed` or `aria-dropeffect`.
- Drop indicators are visual only; the live region communicates equivalent information.
- Focus rings use the page’s existing dark 2 px outline and are never removed.
- Color is never the only valid/invalid signal; shape, opacity, and announcements also change.
- Screen-reader instructions are terse and item-specific.
- Existing anchor labels, menu keyboard targets, and right-click behavior remain intact.

Recommended copy:

- Pickup: `Moving GitHub. Top, position 2 of 6. Use arrow keys to move, Tab to change section, Enter to drop, or Escape to cancel.`
- Preview: `Pinned, position 1 of 4.`
- Drop: `Moved GitHub to Pinned, position 1.`
- Cancel: `Move canceled. GitHub returned to Top, position 2.`
- Pending status: `Saving order…`

## Testing plan

### Pure model tests (`public/launch-model.test.mjs`)

- normalize both/neither tags;
- reorder first/middle/last in each zone;
- Top ↔ Pinned removes the old tag and compacts both zones;
- insertion index clamps safely;
- add to empty/non-empty project at exact index;
- same-project reorder preserves `name` and `environment`;
- cross-project add preserves source and does not duplicate target;
- project reorder;
- replay two queued operations over a newer authoritative snapshot;
- remove dependent operations when item/project disappears;
- failed operation rollback restores exact prior state;
- live-region copy uses “project,” Top, and Pinned consistently.

### Page/source contract tests (`public/launch-page.test.mjs`)

- initial cached render calls occur before dynamic DnD import;
- no static or dynamic DnD dependency appears in `<head>` or before initial render;
- dynamic import points to `launch-dnd.mjs`;
- delegated handle/drop-zone data attributes exist;
- live region exists;
- existing `a`, `l`, `g`, `e`, `c`, Escape, contextmenu, and keyboard-target contracts remain;
- localStorage uses `launch-layout-v2` and legacy fallback;
- menus/dialogs disable or cancel pickup;
- reduced-motion media query exists.

### Convex tests

Use `convex-test` for:

- validators and auth wrapper invocation;
- exact position writes and compaction for every operation kind;
- stale `expectedVersion` returns conflict without writes;
- duplicate `operationId` is idempotent;
- version increments once per applied transaction;
- missing bookmark/project rejection;
- existing membership metadata preservation;
- project add/reorder and Pad move transactionality;
- create/delete/update APIs keep positions and version coherent.

### Browser interaction tests

Add Playwright (or the repository’s chosen browser harness if one is introduced) only for real interaction coverage; keep source-contract tests in Node.

Cover:

- mouse threshold: click below 4 px does not drag or navigate;
- handle drag reorders with live sibling displacement before pointer-up;
- Top ↔ Pinned exact insertion;
- Pad → empty and populated project exact insertion;
- project → project additive semantics;
- project reorder;
- invalid target cancellation;
- right-click menu and normal link click remain functional;
- keyboard pickup, cross-zone Tab, arrows, Home/End, drop, cancel, and focus restoration;
- touch short tap vs 250 ms long-press and 8 px tolerance;
- viewport autoscroll and target recomputation;
- reduced-motion behavior;
- immediate optimistic DOM and localStorage update before mutation resolves;
- pending marker while delayed;
- rollback and status copy after rejection;
- offline queue and online retry;
- two rapid sequential drops serialize and reconcile;
- remote Convex update during one pending operation rebases without flicker or lost rename/environment;
- remote deletion of dragged/pending item;
- first paint still displays cached content with DnD request artificially delayed/failed;
- CLS is zero across enhancement.

## Rollout

### Phase 1: data and pure ordering

- Add optional position/state fields.
- Backfill and verify canonical invariants.
- Add `getLayout` and transactional operation API.
- Add pure model and Convex tests.
- Keep DnD disabled.

Gate: all existing Launch behavior works; every returned layout has deterministic contiguous positions; legacy snapshot fallback works.

### Phase 2: keyboard and pointer behind a local flag

- Add stable DOM contracts and reserved handle/drop geometry.
- Add deferred `launch-dnd.mjs`.
- Enable with `localStorage["launch-dnd-enabled"] === "1"` for manual testing.
- Complete keyboard, mouse, optimistic queue, rollback, and browser tests.

Gate: no first-paint regression, no shortcut/menu regression, and all operation types reconcile under delay/conflict.

### Phase 3: touch and general enablement

- Add long-press, autoscroll, reduced-motion polish, and touch tests.
- Enable by default; retain a one-release kill switch query/local flag that prevents module initialization.
- Monitor Convex errors and user-visible rollback status.

Gate: acceptance criteria below pass on current Safari and Chromium desktop plus iOS Safari touch.

**Rollout status (2026-09-25):** Default-on was enabled before the physical iOS Safari touch gate was completed. Automated desktop and synthetic touch coverage does not substitute for that on-device check, and no physical-device result is claimed. This is a known rollout limitation. The query/local kill switch is the fallback for native-touch regressions, and post-enable monitoring of Convex errors and user-visible rollback status remains outstanding.

### Phase 4: tighten schema

- Confirm no missing positions or ambiguous tags remain.
- Make position fields required.
- Remove legacy snapshot writes and compatibility read APIs after one stable release.

## Acceptance criteria

1. Cached links and projects paint before the DnD module is requested; delaying or failing that request does not affect first paint or non-DnD behavior.
2. Enhancement causes zero layout shift.
3. Mouse, touch, and keyboard can perform every supported matrix operation.
4. Surrounding items visibly reposition before drop.
5. Every bookmark drag overlay uses the compact favicon box, including Pinned-origin drags.
6. Top and Pinned are mutually exclusive after every mutation.
7. Project membership remains additive and supports multiple projects without duplicates.
8. Exact insertion order survives reload and appears in the next cached first paint.
9. Optimistic UI changes in the same task as drop, before the backend resolves.
10. Stale versions, duplicate requests, remote updates, rapid sequential drops, offline state, and server failures never silently lose or duplicate membership.
11. Failure restores authoritative order, focus, local snapshot, and clear status text.
12. Existing shortcuts, popover keyboard targeting, link activation, right-click menus, rename inputs, and environment picker behavior pass regression tests.
13. Reduced-motion users get immediate nonanimated reordering with complete keyboard/screen-reader feedback.

## Open risks and recommended defaults

### Convex authorization boundary

Inspection cannot prove that the static public page and direct Convex endpoint are protected as intended because `requireAuth` is a no-op.

**Default:** match the existing helper for this surgical feature, document the limitation, and schedule real Convex identity/ownership as separate security work before broader exposure.

### Dataset growth

Current Launch queries collect all bookmarks/projects, and integer compaction rewrites affected lists. The inspected code gives no explicit maximum.

**Default:** treat Launch as a bounded personal dataset and cap each Pad zone/project at 250 bookmarks and projects at 100 in mutation validation. If real use approaches those limits, move project memberships to a relational table and reconsider fractional ranks.

### Browser harness

The repository currently uses Node source/model tests and has no configured browser test framework.

**Default:** use Playwright for the interaction suite because pointer, touch, focus, autoscroll, and first-paint timing cannot be proven with regex/source tests. Do not replace existing Node tests.

