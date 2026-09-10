# Music IA & Navigation Redesign

Date: 2026-09-10  
Status: draft for review  
Scope: Information architecture, navigation model, album product model, home. Visual redesign and Cmd+K implementation follow in later plans.

## Problem

The site is a personal tools app, but ~95% of use is music listening. Global nav is a flat header of ~10 equal links. Music features that share one album object (history, ratings, for-later queue, library, enrichment ops) are sold as separate apps. Home is a link dump that does not match usage. Orphaned routes exist (`/spotify-playlister`, `/articles`, `/books`, `/rooleases`). Label collisions (`Albums`, `Rankings`, `Playlists`) hurt scent.

Primary user jobs:

1. **Decide** — What should I listen to (soon)?
2. **Reflect** — What have I listened to, and how does this year look?

## Goals

- Make Decide and Reflect findable in ≤2 clicks from any signed-in entry.
- Treat albums as one product with specialized views, not siloed tools.
- Collapse For Later / Enrichment / Tracks out of primary nav without losing workflows.
- Land signed-in users on a music-first home, not a tool directory.
- Establish sidebar + mobile sheet + Cmd+K as the navigation system (Cmd+K detailed in a follow-on plan).

## Non-goals (this spec)

- Full visual redesign / frontend aesthetic pass.
- Implementing ranking **weights** end-to-end (materialization strategy is in-scope for the data contract below; weight tuning is later).
- Unifying lyrics into a singular entity (existing separate spec).
- Changing public share URL contracts unless noted as redirects.
- Migrating away from dual `forLaterAlbumItems` + `albumLibraryItems` projections (chrome absorption only until a later migrate plan).
- Live Funnel encounter scans powering Home.

### Convex constraints (hard)

- No unbounded `.collect()` for Home or Up Next feeds.
- No `Date.now()` inside Play Next / “gap since listen” **queries** — pass `now` as an argument (same pattern as existing for-later recommendation).
- No full ranked-feed rebuild inside `recordAlbumListen`.
- No reactive multi-table merge that rescans the whole for-later backlog on every invalidation.
- Cmd+K **Play soon** = single-doc patch on a library item, not a feed rebuild.

---

## Product model

### One album system

Every album surface shares:

- Search / filter patterns where relevant
- Album row → **detail drawer** (inspect one album)
- Actions: **Play soon**, Rate, Record listen, Save/remove from queue, Open Spotify, Open full dossier when needed
- Provenance badges when the album appears in recommendation contexts

**Rule:** Drawers inspect and act on one album. Pages compare and organize many albums. Rated reranking stays on-page, not in a drawer.

### Two jobs → two primary surfaces

| Job | Primary surface |
|---|---|
| Decide | **Home** Play Next feed + **Albums → Up Next** for full triage |
| Reflect | **Albums → Recent** and **Albums → Rated** |

Home and Up Next share the **same candidate ranking**. Home shows a top slice (≈10–20). Up Next is the full triage surface with filters and pagination.

### Play soon

First-class album action available anywhere an album appears.

- Adds or boosts the album in the unified candidate pool
- Stronger than passive for-later membership; **do not** overload `forLater` / `isActiveForLater`
- Can pin near the top of Play Next / Up Next
- Clears or decays after a listen, or can be cleared manually
- Covers first-time listens and re-listens (glowing rec, etc.)
- Persistence: fields on `albumLibraryItems` (see data contract) — narrow patches only

### Unified recommendation feed

One ranked list of album candidates, not separate Rec UIs.

Signals (priority order illustrative; exact weights later):

1. Explicit **Play soon** / nudge
2. Active for-later / saved queue membership
3. High rating + single listen or long gap since last listen
4. Existing recommendation-system results (latest saved run or scored into the snapshot — not a live join over all recommendation history)
5. Later: Funnel repeats / trusted-source signals (not on Home v1)

Each row shows why it appears (`Play soon`, `Saved for later`, `Loved once`, `Recommended`, etc.).

**Pick for me** (or “Refresh picks”) is a **mutation** that regenerates the materialized snapshot (optional cron refresh later). It is a UI verb, not a nav destination and not a query that calls `Date.now()`.

### Convex data contract

**Play soon** — extend `albumLibraryItems` only (no new table unless audit history is needed later):

- `playSoon?: { pinnedAt; boostUntil?; clearedAt?; source? }`
- `isPlaySoon: boolean` + `playSoonPinnedAt?: number`
- Indexes e.g. `by_userId_isPlaySoon_playSoonPinnedAt`

**For Later** — keep `forLaterAlbumItems` (+ facets / sync) as Spotify playlist-sync source of truth. Up Next consumes `albumLibraryItems` projections (`forLater`, `isActiveForLater`, `forLaterLastSeenAt`, `appearsInForLater`) plus Play soon flags. Redirect `/for-later-albums` → Up Next is **chrome-only**; dual table+projection remains until a migrate plan.

**Play Next ranking** — materialize, don’t live-merge:

1. Preferred: `playNextSnapshots` (or a small per-user doc) written by Pick for me / scheduled refresh; Home and Up Next **read** top-N / paginated rows from the snapshot.
2. Alternative: batch-updated score fields on `albumLibraryItems` (`playNextScore`, `playNextReason`, `playNextRankedAt`) — not rewritten on every listen or every for-later sync.

Home modules are **several small queries** (narrower invalidation), each bounded with indexed `take` / snapshot reads — not one mega-query and not unbounded collects (legacy full-library collects and Funnel `take(5000)` encounter scans are cautionary patterns, not Home patterns).

---

## Navigation model

### Shell

- **Desktop:** Left sidebar (collapsible) + slim top bar (brand, Cmd+K affordance, account)
- **Mobile:** Hamburger → sheet with the same hierarchy
- Replace the current horizontal scrolling header link farm

### Signed-in sitemap

```text
Home                         Play Next feed + lean Reflect modules

Music
├── Albums                   One product, four views
│   ├── Recent               Chronological listens (month sections)
│   ├── Rated                Year tiers + on-page rerank
│   ├── Up Next              Full prioritized candidate / queue triage
│   └── Library              Searchable catalog
├── Funnel                   Timeline | Repeats (URL-backed tabs)
├── Lyrics                   Album sheets | Playlist sheets
├── Playlists                Smart playlist recipes
└── Shows                    Upcoming | New; Venues via settings control

Other
├── Rob's Top 50             Editor (link to public)
├── Folio Society
└── Birthdays

More
├── Tracks                   Former /albums/tracks
├── Enrichment               Research ops dashboard
├── Categorize tracks        Former Spotify Playlister
├── Rooleases
├── Articles
└── Books

Utility: Sign in / Log out · Cmd+K
```

### Home (signed-in)

Lean music home — not the July “full dashboard” idea.

Dominant:

- **Play Next** top slice of the materialized ranking (≈10–20 rows)
- **Pick for me** / refresh action (mutation → snapshot)

Supporting modules (each its own small bounded query):

- Last few albums listened (`take` recent)
- Albums that still need ratings (indexed filter + `take`)
- Recently added for-later / saved albums (`isActiveForLater` + `forLaterLastSeenAt` index + `take`)

**Not on Home v1:** Funnel repeats (defer until album-level rollup or snapshot include — do not call Funnel’s large encounter scans on `/`).

Each module deep-links into the matching Albums view (or Funnel once included).

### Home (signed-out)

Keep public Rob’s Top 50 as the primary public entry. Sign-in for the rest.

### Default landings

| Entry | Destination |
|---|---|
| `/` signed-in | Music home (Play Next) |
| `/` signed-out | Public-oriented home |
| Post-login | `/` (or `?next=`), **not** `/books` |
| `/albums` | `/albums/recent` (rename from history) |
| Sidebar **Albums** | Last-used Albums view, else Recent |

---

## Albums product (local IA)

One foundational shell. Four specialized views — shared chrome and actions, **not** identical layouts.

### Recent

- Group listens by month (keep distinct sections)
- Volume summary: today / week / month
- Filters: unrated, first listen, release year (and existing useful filters)
- Row → drawer; rate and Play soon from row or drawer

### Rated

- Year selector
- Distinct rating tier sections
- Drag / reorder within and across tiers **on the page**
- Row → drawer for single-album inspect; rerank stays on-page

### Up Next

- Full Decide triage list (replaces daily For Later page chrome)
- Same ranking as Home Play Next; this view is paginated + filterable
- Default sort: Play soon / priority, then other snapshot signals
- Reason badges per row
- **Pick for me** available here and on Home (regenerates snapshot)
- Filters: genre, duration, year, needs RYM, enrichment gaps, source/signal type
- Spotify for-later playlist sync remains a control/plumbing, not the product name
- Recommend flow becomes an action that feeds the snapshot, not a separate top-level concept
- Does not live-scan Funnel’s large encounter tables for ranking

### Library

- Search-first browse of known albums
- Artwork copy/download and dossier entry
- Same drawer and Play soon / Rate actions
- More prominent than today’s usage suggests, because post-restructure it is the catalog entry for albums not already on Recent or Up Next

### Demotions from current Albums tabs

| Current | New |
|---|---|
| History | Recent |
| Rankings | Rated |
| Albums (`/albums/all`) | Library |
| Tracks | More → Tracks |

### For Later & Enrichment

| Current | New |
|---|---|
| `/for-later-albums` as top-level | Chrome absorbed into Up Next + Library status/filters; redirect. Backend dual table+projection unchanged until a migrate plan. |
| `/album-enrichment` in header | More → Enrichment; secondary link from Up Next filters (“needs research”) |

---

## Other Music sections

### Funnel

- Keep Timeline | Repeats as peer views
- Put active tab in the URL so Home can deep-link and refresh preserves state
- Config stays in a drawer

### Lyrics

- Keep Albums | Playlists peer tabs on list routes
- Prefer labels **Album sheets** / **Playlist sheets** in nav copy to avoid collision with Albums product
- Detail / edit / zine remain children without list tabs

### Playlists

- Smart Playlists stay primary under Playlists
- Spotify Playlister → More as **Categorize tracks**

### Shows (Concerts)

- Keep Upcoming | New as tabs
- Venues moves out of the primary tab strip into a settings/gear control (setup, not daily triage)

### Rob’s Top 50

- Other section: editor for signed-in; clear link to public list
- Do not label header “Rob’s Top 50” while landing on the editor without saying so
- Distinct from Albums → Rated

---

## Taxonomy & labeling

| Avoid | Prefer |
|---|---|
| Album Tracker / flat “Albums” everywhere | **Albums** product; Lyrics uses **sheets** |
| Rankings (personal tiers) | **Rated** |
| For Later (as product name) | **Up Next** / **Saved for later** (signal) / sync control |
| Nudge | **Play soon** |
| Rec (nav item) | **Pick for me** (action) |
| Enrichment (primary) | Enrichment under More / research filter |
| Concert Tracker vs Concerts | **Shows** |
| Smart Playlists vs Playlister confusion | Playlists vs **Categorize tracks** |

---

## Route mapping (IA-level)

Exact implementation may use redirects and aliases; intent:

| Old | New |
|---|---|
| `/` | Music home (authed) |
| `/albums` → history | `/albums` → `/albums/recent` |
| `/albums/history` | `/albums/recent` (redirect) |
| `/albums/rankings` | `/albums/rated` (redirect) |
| `/albums/all` | `/albums/library` (redirect) |
| `/albums/tracks` | Keep URL; linked from More only |
| `/for-later-albums` | Redirect → `/albums/up-next` (preserve query filters where possible) |
| `/album-enrichment` | Keep URL; More only |
| `/music-funnel` | Keep; add URL-backed tab |
| `/concerts/*` | Keep; Venues not a peer tab in chrome |
| Login default `/books` | Default `/` |

Public `/public/*` routes unchanged for share links.

---

## Cmd+K (intent only)

Follow-on implementation plan. Index at minimum:

- Albums by title/artist → open drawer or Library result
- Primary destinations: Home, Albums views, Funnel, Lyrics, Playlists, Shows, Other, More items
- Play soon on selected album only if cheap (single `albumLibraryItems` patch — not a Play Next rebuild)

Cmd+K supplements IA; it does not replace the sidebar hierarchy.

---

## Success criteria

- Signed-in `/` answers “what should I play?” without hunting the header.
- Recent keeps month sections + unrated / first-listen / release-year filters.
- Rated keeps tier sections + on-page rerank.
- Play soon works from Home, all Albums views, and the album drawer.
- For Later and Enrichment are not primary nav items; workflows reachable via Up Next / More.
- Tracks not in Albums tab strip.
- Mobile: full nav available via sheet without horizontal scroll of 10 links.
- Findability: Decide and Reflect each ≤2 clicks from sidebar.
- Home modules each return ≤N rows via indexed takes / snapshot reads (no unbounded Home collects).

## Phasing (for later planning)

1. **IA shell** — Sidebar/sheet, label renames, redirects, home skeleton modules (bounded existing queries; no Funnel repeats module yet).
2. **Albums unification** — Shared drawer, view renames, Up Next replacing For Later chrome, Play soon on `albumLibraryItems`.
3. **Unified Play Next ranking** — Materialized snapshot (or scored library fields) + Pick for me mutation; Home top slice + Up Next pagination.
4. **Funnel on Home (optional)** — Include repeats only after album-level rollup / snapshot include.
5. **Visual redesign** — Separate frontend-design pass on the new hierarchy.
6. **Cmd+K** — Command palette on the stable route map.

## Open decisions deferred to implementation plans

- Exact Play soon decay timing (persistence owner locked: `albumLibraryItems` pin + clear after listen / manual clear)
- Exact ranking weights (materialization strategy required; weights tunable later)
- Snapshot table vs scored fields on `albumLibraryItems`
- Whether Albums remembers last-used tab in local storage vs always Recent
- Drawer vs full-page dossier breakpoint details
`)