# Launch Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a projects column beside the Launch pad where each project's links are already visible, a link can belong to several projects, and a project row can show a different name than the pad.

**Architecture:** `launchProjects` holds empty-capable project records. Each bookmark stores `projects: { projectId, name? }[]`. Absent `name` means "show the pad title." `top` and `pinned` stay the only tags. Pure membership rules live in `public/launch-model.mjs` and are tested with `node:test`. `public/launch.html` imports that module and renders the column. There is no project test framework in this repo; do not add one.

**Tech Stack:** Convex schema and mutations in `convex/launch.ts`, a static page at `public/launch.html`, shared rules in `public/launch-model.mjs`, Node's built-in test runner.

## Global Constraints

- Pad stays the left column: `top` favicon grid, then `pinned` names.
- Right column is the same width. Each project is a heading plus name rows, not favicons. Oldest project first. Clicks do not reorder.
- "Add a project" is a square at the bottom of the projects column. The name field replaces the label inside that square.
- Tags are only `top` and `pinned`. They do not encode projects.
- Drop the `group` string.
- `projects[].name` omitted means display `title`. Setting the override back to the current title clears it.
- Hover a specific link and press `g`: project list, newest first. Choosing adds, choosing again removes from that project only.
- Plus on a project heading starts add mode. Clicks on a pinned row, a single-site tile, or one choice in an open host popover add that bookmark. A multi-link site tile adds nothing. Escape ends add mode. A link already in the project is unchanged.
- Hover a pad link and press `a` to edit `title`. Hover a project row and press `a` to edit that row's override. Enter saves and leaves the field. Escape restores the previous text and leaves the field.
- Deleting a project removes the column and memberships, not the pad links. Deleting a pad link removes it from every project.
- Do not build recency sorting, time-of-day suggestions, or profiles.

---

### Task 1: Membership rules

**Files:**
- Create: `public/launch-model.mjs`
- Create: `public/launch-model.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `displayName(bookmark, membership)` → `string`
  - `toggleProject(bookmark, projectId)` → next `projects` array
  - `addProject(bookmark, projectId)` → next `projects` array (no-op if present)
  - `renamePad(bookmark, nextTitle)` → `{ title, projects }`
  - `renameInProject(bookmark, projectId, nextName)` → next `projects` array
  - `projectsNewestFirst(projects)` → array sorted by `createdAt` descending

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import {
	addProject,
	displayName,
	projectsNewestFirst,
	renameInProject,
	renamePad,
	toggleProject,
} from "./launch-model.mjs";

const bookmark = {
	title: "Local",
	projects: [],
};

test("displayName uses the pad title when the membership has no override", () => {
	assert.equal(displayName(bookmark, { projectId: "p1" }), "Local");
});

test("displayName uses the override when present", () => {
	assert.equal(
		displayName(bookmark, { projectId: "p1", name: "Dev" }),
		"Dev",
	);
});

test("addProject appends a membership without a name", () => {
	assert.deepEqual(addProject(bookmark, "p1"), {
		title: "Local",
		projects: [{ projectId: "p1" }],
	});
});

test("addProject leaves an existing membership alone", () => {
	const member = addProject(bookmark, "p1");
	assert.deepEqual(addProject(member, "p1"), member);
});

test("toggleProject adds then removes", () => {
	const added = toggleProject(bookmark, "p1");
	assert.equal(added.projects.length, 1);
	assert.deepEqual(toggleProject(added, "p1").projects, []);
});

test("renamePad updates the title and leaves overrides in place", () => {
	const member = {
		title: "Local",
		projects: [{ projectId: "p1" }, { projectId: "p2", name: "Prod app" }],
	};
	assert.deepEqual(renamePad(member, "Moose local"), {
		title: "Moose local",
		projects: [{ projectId: "p1" }, { projectId: "p2", name: "Prod app" }],
	});
});

test("renameInProject stores an override", () => {
	const member = addProject(bookmark, "p1");
	assert.deepEqual(renameInProject(member, "p1", "Dev"), {
		title: "Local",
		projects: [{ projectId: "p1", name: "Dev" }],
	});
});

test("renameInProject clears the override when the name matches the pad title", () => {
	const named = {
		title: "Local",
		projects: [{ projectId: "p1", name: "Dev" }],
	};
	assert.deepEqual(renameInProject(named, "p1", "Local"), {
		title: "Local",
		projects: [{ projectId: "p1" }],
	});
});

test("projectsNewestFirst puts the latest createdAt first", () => {
	const projects = [
		{ _id: "old", createdAt: 1 },
		{ _id: "new", createdAt: 3 },
		{ _id: "mid", createdAt: 2 },
	];
	assert.deepEqual(
		projectsNewestFirst(projects).map((project) => project._id),
		["new", "mid", "old"],
	);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test public/launch-model.test.mjs`

Expected: FAIL, cannot find module `./launch-model.mjs`

- [ ] **Step 3: Write the implementation**

```javascript
export function displayName(bookmark, membership) {
	return membership.name || bookmark.title;
}

export function addProject(bookmark, projectId) {
	if (bookmark.projects.some((item) => item.projectId === projectId)) {
		return bookmark;
	}
	return {
		...bookmark,
		projects: [...bookmark.projects, { projectId }],
	};
}

export function toggleProject(bookmark, projectId) {
	const existing = bookmark.projects.some((item) => item.projectId === projectId);
	if (!existing) return addProject(bookmark, projectId);
	return {
		...bookmark,
		projects: bookmark.projects.filter((item) => item.projectId !== projectId),
	};
}

export function renamePad(bookmark, nextTitle) {
	return { ...bookmark, title: nextTitle };
}

export function renameInProject(bookmark, projectId, nextName) {
	return {
		...bookmark,
		projects: bookmark.projects.map((item) => {
			if (item.projectId !== projectId) return item;
			if (nextName === bookmark.title) return { projectId };
			return { projectId, name: nextName };
		}),
	};
}

export function projectsNewestFirst(projects) {
	return [...projects].sort((a, b) => b.createdAt - a.createdAt);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test public/launch-model.test.mjs`

Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add public/launch-model.mjs public/launch-model.test.mjs
git commit -m "test: define Launch project membership rules"
```

---

### Task 2: Convex projects and membership

**Files:**
- Modify: `convex/schema.ts` (`launchBookmarks` table)
- Modify: `convex/launch.ts`

**Interfaces:**
- Consumes: membership shape `{ projectId, name? }` from Task 1, applied on the server
- Produces:
  - `api.launch.listProjects` → `{ _id, _creationTime, name, createdAt }[]` oldest first
  - `api.launch.createProject({ name })` → project id
  - `api.launch.removeProject({ id })` → null, deletes memberships, keeps bookmarks
  - `api.launch.setProjects({ id, projects })` → null
  - `list` / `create` / `update` bookmarks no longer take `group`. `projects` defaults to `[]` on create. `tags` accepts only `"top"` and `"pinned"`.

- [ ] **Step 1: Add the project table and replace `group`**

In `convex/schema.ts`, replace the `launchBookmarks` table with:

```typescript
	launchProjects: defineTable({
		name: v.string(),
		createdAt: v.number(),
	}),

	launchBookmarks: defineTable({
		title: v.string(),
		url: v.string(),
		tags: v.array(v.union(v.literal("top"), v.literal("pinned"))),
		projects: v.array(
			v.object({
				projectId: v.id("launchProjects"),
				name: v.optional(v.string()),
			}),
		),
		clickCount: v.number(),
		lastClickedAt: v.optional(v.number()),
		createdAt: v.number(),
	}),
```

Existing dev documents still have `group` and string tags. Before `npx convex dev --once`, run a one-off patch only if the push rejects the documents. From the Convex dashboard data view, or a temporary mutation added then deleted in this same task, set each existing bookmark to `projects: []`, drop `group`, and drop any tag that is not `top` or `pinned`. The imported bookmarks only use `top` and `pinned`, so tag filtering is a no-op if the data is unchanged. Do not leave the temporary mutation in the file.

- [ ] **Step 2: Update `convex/launch.ts` validators and mutations**

Replace `bookmarkValidator` and the tag helper:

```typescript
const tagValidator = v.union(v.literal("top"), v.literal("pinned"));

const projectMembershipValidator = v.object({
	projectId: v.id("launchProjects"),
	name: v.optional(v.string()),
});

const bookmarkValidator = v.object({
	_id: v.id("launchBookmarks"),
	_creationTime: v.number(),
	title: v.string(),
	url: v.string(),
	tags: v.array(tagValidator),
	projects: v.array(projectMembershipValidator),
	clickCount: v.number(),
	lastClickedAt: v.optional(v.number()),
	createdAt: v.number(),
});
```

`create` args become `{ title, url, tags }` and the inserted document sets `projects: []`. Remove `group` from `create` and `update`. `update` args become `{ id, title, url, tags, projects }`.

Add:

```typescript
export const listProjects = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("launchProjects"),
			_creationTime: v.number(),
			name: v.string(),
			createdAt: v.number(),
		}),
	),
	handler: async (ctx) => {
		requireAuth(ctx);
		const projects = await ctx.db.query("launchProjects").collect();
		projects.sort((a, b) => a.createdAt - b.createdAt);
		return projects;
	},
});

export const createProject = mutation({
	args: { name: v.string() },
	returns: v.id("launchProjects"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const name = args.name.trim();
		if (!name) throw new Error("Name is required");
		return await ctx.db.insert("launchProjects", {
			name,
			createdAt: Date.now(),
		});
	},
});

export const removeProject = mutation({
	args: { id: v.id("launchProjects") },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Project not found");
		const bookmarks = await ctx.db.query("launchBookmarks").collect();
		for (const bookmark of bookmarks) {
			const projects = bookmark.projects.filter(
				(item) => item.projectId !== args.id,
			);
			if (projects.length !== bookmark.projects.length) {
				await ctx.db.patch(bookmark._id, { projects });
			}
		}
		await ctx.db.delete(args.id);
		return null;
	},
});

export const setProjects = mutation({
	args: {
		id: v.id("launchBookmarks"),
		projects: v.array(projectMembershipValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Bookmark not found");
		await ctx.db.patch(args.id, { projects: args.projects });
		return null;
	},
});
```

`cleanTags` must return only `"top"` and `"pinned"`, in that relative order, deduped.

- [ ] **Step 3: Push and typecheck**

Run: `npx convex dev --once`

Expected: Convex functions ready.

Run: `pnpm exec tsc --noEmit --pretty false`

Expected: exit 0. If `public/launch.html` still sends `group`, that file is not typechecked. The page breaks until Task 3. That is expected.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/launch.ts convex/_generated/api.d.ts
git commit -m "feat: store Launch projects separately from pad tags"
```

---

### Task 3: Projects column

**Files:**
- Modify: `public/launch.html`
- Modify: `public/launch.html` script to import `./launch-model.mjs`

**Interfaces:**
- Consumes: `displayName`, `listProjects`, `createProject`, `removeProject`, bookmark `projects`
- Produces: a `#projects` column. `window.launchProjects` is the latest project array from the subscription, used by Tasks 4–6.

- [ ] **Step 1: Split the page into two columns**

Replace the `main` rule with a row:

```css
body { /* keep the existing font and background */ }
.board {
	display: flex;
	align-items: flex-start;
	gap: 1.5rem;
	padding: 1.25rem 0.85rem 3rem;
}
.column { width: 17.5rem; }
```

```html
<div class="board">
	<main class="column" id="pad">
		<div id="list"></div>
		<p class="status" id="status"></p>
		<div class="add" id="add">...</div>
	</main>
	<aside class="column" id="projects"></aside>
</div>
```

Move the existing list, status, and add form into `#pad`. Delete `main { width: 17.5rem }` so `.column` owns the width.

- [ ] **Step 2: Subscribe to projects and render the column**

In the module script, after the bookmark subscription:

```javascript
import { displayName } from "./launch-model.mjs";

client.onUpdate("launch:listProjects", {}, (projects) => {
	window.launchProjects = projects;
	renderProjects();
});
```

`renderProjects` writes `#projects`. For each project, a `section` with an `h2` of `project.name`, then one `.row` per bookmark whose `projects` contains that `projectId`. The row's label is `displayName(bookmark, membership)`. Each row is a link to `bookmark.url` and includes the existing meatball. Call `watchHover` on the row with the bookmark id, and set `dataset.projectId` on the row so Task 6 can tell a project rename from a pad rename.

Under the sections:

```html
<button type="button" class="add-project" id="add-project">Add a project</button>
```

```css
.add-project {
	width: 100%;
	aspect-ratio: 1.4 / 1;
	margin-top: 0.75rem;
	border: 1px dashed var(--line);
	border-radius: 0.75rem;
	background: transparent;
	color: var(--muted);
	cursor: pointer;
}
```

Clicking it replaces the button with an input and a confirm button inside the same dashed square. Confirm calls `client.mutation("launch:createProject", { name })`. Empty name does nothing. Escape restores the button.

The project heading's meatball calls `client.mutation("launch:removeProject", { id })`.

- [ ] **Step 3: Stop sending `group` from the page**

`createBookmark` and `updateBookmark` drop `group`. `updateBookmark` sends the bookmark's current `projects` array so a pad rename does not wipe memberships. The add form drops the group input.

- [ ] **Step 4: Manual check**

Run the dev server if it is not already up. Open `http://localhost:1333/launch.html`.

Expected: pad unchanged on the left. Right column shows the dashed “Add a project” square. Creating “Moose” shows a Moose heading and no links. Deleting Moose removes the heading. The pad links remain.

- [ ] **Step 5: Commit**

```bash
git add public/launch.html
git commit -m "feat: show Launch projects in a second column"
```

---

### Task 4: Plus-button add mode

**Files:**
- Modify: `public/launch.html`

**Interfaces:**
- Consumes: `addProject` from `public/launch-model.mjs`, `setProjects`
- Produces: `addingProjectId` (string or null). While set, the matching project heading shows the plus as pressed.

- [ ] **Step 1: Add the plus control**

On each project `h2`, append a button labeled `+`. Click sets `addingProjectId` to that project and re-renders projects. Clicking the same plus again clears it. Escape in the existing keydown handler clears `addingProjectId` before it closes menus, and re-renders.

```css
.project-head { display: flex; align-items: center; justify-content: space-between; }
.plus[aria-pressed="true"] { color: var(--ink); }
```

- [ ] **Step 2: Clicks on the pad add the hovered bookmark**

In `pin`, single-site `tile`, and each popover `.choice` link's click handler, before navigation:

```javascript
if (addingProjectId) {
	event.preventDefault();
	const next = addProject(
		{ title: bookmark.title, projects: bookmark.projects || [] },
		addingProjectId,
	);
	client.mutation("launch:setProjects", {
		id: bookmark._id,
		projects: next.projects,
	});
	return;
}
```

Do not add this branch to `siteTile`. A multi-link icon keeps opening its popover during add mode.

`addProject` returns the same object when the membership exists, so a second click sends the same array. That matches “unchanged.”

- [ ] **Step 3: Manual check**

Create Moose. Click its plus. Click one pinned row and one choice inside a Gmail popover. Expected: those two names appear under Moose and the browser does not navigate. Escape, then click a pad link. Expected: navigation works again. Click plus and click the same pinned row again. Expected: still one Moose row.

- [ ] **Step 4: Commit**

```bash
git add public/launch.html
git commit -m "feat: add pad links to a Launch project from its plus button"
```

---

### Task 5: `g` assigns the hovered link

**Files:**
- Modify: `public/launch.html`

**Interfaces:**
- Consumes: `toggleProject`, `projectsNewestFirst`, `hoveredId`, `window.launchProjects`
- Produces: a `.popover.group-picker` that lists project names, newest first

- [ ] **Step 1: Open the picker on `g`**

In the document keydown handler, when the target is not an input and the key is `g` and `hoveredId` is set:

```javascript
event.preventDefault();
const bookmark = bookmarks.find((item) => item._id === hoveredId);
if (!bookmark) return;
openGroupPicker(bookmark, /* element under the pointer */ document.querySelector(".active"));
```

`openGroupPicker` closes any open menu, builds a popover, and lists `projectsNewestFirst(window.launchProjects || [])`. Each button's label is the project name. If `bookmark.projects` contains that id, prefix the label with `✓ `.

Clicking a row:

```javascript
const next = toggleProject(
	{ title: bookmark.title, projects: bookmark.projects || [] },
	project._id,
);
client.mutation("launch:setProjects", {
	id: bookmark._id,
	projects: next.projects,
});
closePopover();
```

Position the popover with the same clamp already used by `openPopover`.

- [ ] **Step 2: Manual check**

Hover a pinned link, press `g`. Expected: Moose is listed, and if a newer project exists it is above Moose. Choose Moose. The link appears under Moose. Press `g` again and choose Moose. The Moose row disappears. The pad link remains. `top` and `pinned` do not change.

- [ ] **Step 3: Commit**

```bash
git add public/launch.html
git commit -m "feat: assign a hovered Launch link to projects with g"
```

---

### Task 6: Rename inside a project

**Files:**
- Modify: `public/launch.html`

**Interfaces:**
- Consumes: `renameInProject`, `renamePad`, `dataset.projectId` on project rows from Task 3
- Produces: `a` on a project row writes `projects[].name`; `a` on a pad link still writes `title`

- [ ] **Step 1: Branch `startRename`**

When the active element has `dataset.projectId`, edit that membership instead of `title`:

```javascript
const projectId = document.querySelector(".active")?.dataset.projectId;
if (projectId) {
	const membership = bookmark.projects.find((item) => item.projectId === projectId);
	const current = displayName(bookmark, membership);
	// swap that row's .title for an input whose value is current
	// Enter calls renameInProject and setProjects, then replaces the input with the saved text
	// Escape puts current back
	return;
}
```

Pad `a` keeps the existing title editor. After Enter on the pad, `renamePad` only changes `title`; pass the existing `projects` through `update`. Rows without an override show the new title. Rows with `name` set do not.

- [ ] **Step 2: Manual check**

Put “Local” in Moose. Hover the Moose row, press `a`, type `Dev`, press Enter. Expected: Moose says Dev, the pad still says Local. Hover the pad link, press `a`, rename it to `Moose dev`, Enter. Expected: the pad changes, Moose still says Dev. On a second link that was never renamed inside Moose, renaming the pad also renames the Moose row.

- [ ] **Step 3: Commit**

```bash
git add public/launch.html
git commit -m "feat: let a Launch project row keep its own name"
```

---

### Task 7: Regression pass

**Files:**
- Test: `public/launch-model.test.mjs`

- [ ] **Step 1: Re-run the model tests**

Run: `node --test public/launch-model.test.mjs`

Expected: PASS, 9 tests

- [ ] **Step 2: Click-through on the dev server**

Open `http://localhost:1333/launch.html`.

Expected:
- Pad grid and pinned list still render.
- A multi-site icon still opens a two-column name grid.
- Enter and Escape still leave a name field, including inside that grid.
- Clicking a link does not move it.
- Projects column matches Tasks 3–6.
