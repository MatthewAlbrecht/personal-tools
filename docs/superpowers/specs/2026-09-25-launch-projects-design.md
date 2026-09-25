# Launch Projects Design

## Goal

Add a projects column beside the Launch pad so the links for one body of work (local, prod, Vercel, Convex, email) are already visible together. One link can belong to several projects. A project can exist before it has any links.

## Layout

The pad stays the left column: `top` favicon grid, then `pinned` names. The right column is the same width. Each project is a heading with its links already listed underneath, as names, not favicons. At the bottom of that column is a square control the size of a project block, labeled “Add a project.” The name field replaces the label inside that square. Submitting creates an empty project.

Project order in the column is creation order, oldest first. The column does not reorder when a link is clicked.

## Data

`top` and `pinned` stay the only tags. They control the pad and stay independent of projects.

```ts
launchProjects: defineTable({
  name: v.string(),
  createdAt: v.number(),
})

launchBookmarks: defineTable({
  title: v.string(),
  url: v.string(),
  tags: v.array(v.union(v.literal("top"), v.literal("pinned"))),
  projects: v.array(v.object({
    projectId: v.id("launchProjects"),
    name: v.optional(v.string()),
  })),
  clickCount: v.number(),
  lastClickedAt: v.optional(v.number()),
  createdAt: v.number(),
})
```

Drop the `group` string. It cannot represent several projects.

`projects[].name` is an override. When it is absent, the project row shows `title`. Changing `title` updates every project row that has no override. Setting an override changes that project row only. Clearing the override (renaming it back to the current title) makes it follow `title` again.

An empty project is a `launchProjects` row with no bookmark pointing at it.

## Adding a link to a project

Both of these add the same membership. The new row starts with no override, so it shows the pad name.

**From the link.** Hover a specific link and press `g`. A popover lists projects. The newest project is first. Choosing a project adds the link. Choosing a project it already belongs to removes it from that project only.

**From the project.** A plus on the project heading starts add mode for that project. Clicks on specific pad links add them: a pinned row, a single-site tile, or one choice inside an open host popover. Clicking a multi-link site tile does not add every link behind it. A link already in the project is unchanged. Escape ends add mode.

## Renaming

Hover a pad link and press `a` to edit `title`. Hover a project row and press `a` to edit that row’s override. Enter saves and leaves the field, including inside a popover. Escape restores the previous text and leaves the field.

## Deleting

Deleting a project removes the column and every membership in it. It does not delete the pad links. Deleting a pad link removes it from every project.

## Out of scope

Recency sorting, time-of-day suggestions, and profiles. Click counts stay stored and do not change order.
