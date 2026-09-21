---
title: Bookcase designer
domain: workshop
kind: feature
size: 5
status: open
captured: 2026-09-20
---

## What this is

A front-elevation drawing of the bookcase from the notebook sketch: two (or more) carcasses side by side, each shelf split into a square vinyl bay and a longer book bay. Within a case the square flips every shelf (top left, next right, and so on). Neighboring cases start on the opposite side so the whole wall is a checker of squares.

The page at `/bookcase` is a shop drawing, not a 3D model. SVG, zoom/pan, sticky spec panel. Greyscale on paper.

## How to read the drawing

You are not a woodworker. These words are the ones the sliders use.

- **Case** — one vertical cabinet. Add more beside the first.
- **Shelf / opening** — the empty space between boards, where books or records sit. "7 shelves" means 7 openings.
- **Shelf thickness** — how fat those horizontal boards are. ¾″ is common plywood.
- **Carcass thickness** — the outside box: left side, right side, top, bottom. Also often ¾″.
- **Middle separator** — the short vertical board that cuts one opening into two. Turn it off and the shelf is one long bay.
- **Vinyl square** — the separator is placed so one bay is as wide as it is tall. A 12″ LP sleeve is about 12⅜″. The opening has to be at least that, plus a little wiggle room.
- **Checker** — top shelf of case 1 has the square on the left; the shelf under it flips to the right. Case 2 starts the opposite way so neighbors never put two squares side by side.

Overall height and width are the outside of whatever combination is on screen, in inches and in feet-and-inches.

## Built now

- Case count, shelf count
- Opening height, inner width
- Shelf thickness, carcass thickness
- Toggle separators, toggle sketched books/records
- Live overall / per-case / bay measurements
- Zoom, pan, fit
- Defaults match the notebook: 2 cases, 7 shelves, separators on
- Config persists in localStorage

## Later

- **Equal-dimension highlighting** — tap a measurement (or a toggle) and light up every member that shares that length. The sketch already marks X = X and Y. Better than a raw "show inches" overlay.
- Per-shelf heights (vinyl rows taller than book rows)
- Shared center wall vs two cases butted together (today each case keeps both sides)
- The little stepped top from the sketch (crown / plinth)
- Cut list: how many boards, what lengths, rough plywood yield
- Material presets: ¾″ plywood, 1x stock
- Export SVG / PNG of the elevation
- Pinch-zoom on trackpad/phone
- Side / top views, or a very simple 3D
- Real object sizes: Folio Society books, 12″ sleeves, 7″ singles
- Inches / cm toggle
- Click a bay to mark it vinyl, books, or empty

## Raw

flat front-facing SVG, zoom, floating spec panel. Sketch is two bookcases, seven shelves, square record slots, longer book bays, mirrored when placed together. Books and vinyls as repeatable fillers. Later: toggle/highlight equal dimensions. Config: separators, opening height, shelf and outline thickness, add cases, add/remove shelves, calculate any combination on screen. Greyscale is fine.
