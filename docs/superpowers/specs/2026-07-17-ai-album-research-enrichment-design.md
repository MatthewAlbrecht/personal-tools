# AI Album Research Enrichment Design

## Goal

Enrich albums with hard-to-scrape artist/album context by running research in Cursor (skill + subagents + scheduled automation), persist results on the canonical album (`spotifyAlbums`), and inspect all related album data on a polished read-only details page.

v1 only **claims** work from for-later (backfill ~500, then steady-state drain). Storage is album-centric so filters and other domains can widen later without remapping data.

Related idea: `docs/ideas/2026-07-15-ai-album-artist-research-enrichment.md`

## Background

Cursor is better at this kind of open-web research than a thin in-app LLM call. The product already treats `spotifyAlbums` as the singular album identity; for-later is membership/queue state. Existing for-later “descriptors” are **RYM musical** tags — enrichment **cover descriptors** must be named and stored separately.

## Goals & Non-Goals

### In scope (v1)

- Cursor orchestrator skill + four research subagents + identity lock before fan-out
- Per-slice completeness and automatic gap-fill when new required slices are added
- Manual enrich by name or id (full overwrite) + scheduled drain (one album per run)
- Authed HTTP claim/save API
- `albumEnrichments` (1:1) + cover/occasion facet tables
- `/albums/details/:spotifyAlbumsId` kitchen-sink dossier (designed, not a JSON dump)
- Entry points from for-later, `/albums/all`, and direct URL

### Out of scope (v1)

- Filtering/browsing by cover descriptors or occasions in for-later or elsewhere (schema ready only)
- Claiming enrichment for albums not on for-later
- Cursor plugin packaging
- In-app LLM researcher replacing Cursor
- More than one album per automation run
- Migrating enrichment onto for-later rows

## Approaches Considered

### 1. Cursor research pipeline + album store + details page (chosen)

Orchestrator skill claims via HTTP, locks identity, fans out missing-slice subagents, saves via HTTP. Cron drains one incomplete album per run. Details page is the inspector.

**Pros:** Matches Cursor strengths; per-slice gap-fill; album-centric for later filters.  
**Cons:** Cloud agent cost; Automations + secrets dependency; skill quality tuning.

### 2. Single fat Cursor agent (no subagent fan-out)

Same HTTP + schema + details page; one agent writes all slices after identity lock.

**Pros:** Fewer agent files.  
**Cons:** More slice bleed; weaker gap-fill for a single new slice.

### 3. In-app LLM enrichment

Convex/Next actions + model/search APIs; Convex scheduler; same storage/UI.

**Pros:** Fully in-product metering.  
**Cons:** Abandons the “Cursor researches well” premise; more app infra for browsing.

## Architecture

```
Trigger (cron | manual /skill)
        ↓
Orchestrator skill
        ↓
HTTP claim → for-later album missing a required slice
        ↓
Identity lock (frozen packet)
        ↓
Fan-out only missing slice subagents (parallel)
        ↓
Merge → HTTP save (upsert enrichment + replace facets for succeeded slices)
        ↓
Details page reads albumId → Spotify + enrichment + for-later + RYM + library + …
```

### Repo layout

| Piece | Location |
|--------|----------|
| Orchestrator playbook | `.cursor/skills/enrich-for-later-album/SKILL.md` |
| Research subagents | `.cursor/agents/artist-context.md`, `why-listen.md`, `cover-descriptors.md`, `occasions.md` |
| Claim/save + schema | App HTTP routes + Convex |
| Details UI | `src/app/albums/details/[albumId]/` (or equivalent) |
| Schedule | Cursor Automation (cloud); not checked into repo |

### Required slices (app-owned)

Canonical list lives in the **app** (claim logic), not only in the skill:

1. `artistContext`
2. `whyListen`
3. `coverDescriptors`
4. `occasions`

Adding a fifth slice = new field(s)/facets + subagent + append to this list. The same schedule automatically gap-fills albums missing the new slice.

### Run modes

| Mode | Selection | Slice behavior |
|------|-----------|----------------|
| Schedule | Next for-later active item missing ≥1 required slice | Research **gaps only**; never full-overwrite a complete album |
| Manual | By Convex `spotifyAlbums` id, Spotify album id, or name search | **Full overwrite** of all required slices |

**One album per scheduled run.** Do not enrich multiple albums inside a single agent turn (context bleed risk).

## Identity lock

Before any research subagent runs, the orchestrator builds a **frozen identity packet** from stored data (and claim payload), for example:

- `albumId`, `spotifyAlbumId`
- Exact title, artists, release year
- Cover image URL
- Known external links (e.g. RYM) when available

Subagents receive this packet and **must not re-resolve** which album/artist they are researching. Ambiguous manual name search stops for disambiguation; it must not save a guess.

## Research slices

| Slice | Subagent | Output (conceptual) |
|--------|----------|---------------------|
| `artistContext` | `artist-context` | Origin, active-since, Instagram URL, artist writeup, listen-if-you-like list |
| `whyListen` | `why-listen` | Short persuasive pitch (not a plot summary) |
| `coverDescriptors` | `cover-descriptors` | Artwork keyword tags (color, subject, setting, style) |
| `occasions` | `occasions` | Situation/vibe tags (dinner party, road trip, late night, …) |

Gap-fill runs pass **existing enrichment** into the missing-slice subagent(s) as grounding context.

## Data model

### `albumEnrichments` (1:1 with `spotifyAlbums`)

- `albumId` (unique), `spotifyAlbumId` (denormalized)
- `slices`: map of slice key → `{ updatedAt }` for successfully saved slices
- Narrative / structured fields for `artistContext` and `whyListen` (origin, activeSince, instagramUrl, artistWriteup, listenIfYouLike[], whyListenPitch)
- Optional `identityPacket` snapshot from last successful lock
- `lastEnrichedAt`, `createdAt`, `updatedAt`

Indexes: `by_albumId` (unique), `by_spotifyAlbumId`.

### Facet tables (filter-ready)

- `albumCoverDescriptorFacets`: `albumId`, `coverDescriptorKey`, `label` — indexes `by_albumId`, `by_coverDescriptorKey_albumId`
- `albumOccasionFacets`: `albumId`, `occasionKey`, `label` — indexes `by_albumId`, `by_occasionKey_albumId`

On save of a tag slice, **replace** that album’s rows for that facet table (idempotent full rewrite of that slice’s tags).

Do **not** use EAV (row-per-arbitrary-field) or a table per prose slice.

## HTTP API

Shared secret / bearer configured as a cloud agent secret. Fail closed on missing/invalid auth.

### Claim

Returns one eligible album for scheduled mode:

- Active for-later membership
- Missing ≥1 app-required slice on `albumEnrichments` (or no enrichment row yet)
- Payload: identity fields for lock + list of missing slices

Empty queue → clean success / no-op for the skill.

### Save

Body includes `albumId` and succeeded slice payloads. Server:

- Upserts `albumEnrichments` for those slices only
- Marks only succeeded slices in `slices`
- Replaces facet rows for succeeded tag slices
- Leaves failed/missing slices claimable

### Resolve (manual)

Lookup by Convex album id, Spotify album id, or name (candidates if ambiguous). Manual path then overwrites all required slices after identity lock.

## Details page

Route: `/albums/details/:albumId` where `albumId` is `Id<"spotifyAlbums">`.

Read-only **album dossier** using existing design system — curated sections, strong hierarchy, calm empty states. Not a dashboard of generic cards and not a raw dump.

### Section order

1. **Hero** — cover, title, artists, year, Spotify/RYM links, enrichment slice status
2. **Why listen** — pitch when present
3. **Artist context** — writeup, origin, active-since, Instagram, listen-if-you-like
4. **Cover & occasions** — tag chips; empty if not enriched
5. **Library & queue** — for-later membership, listened, RYM match flags, library projection fields
6. **RYM / scrape** — matched URL, confidence, key scrape fields when linked
7. **Listening / ratings** — joinable existing data; honest empties
8. **Raw identity** — compact footer (Convex id, Spotify id)

### Entry

- For-later rows/cards → details
- `/albums/all` rows/cards → details
- Direct URL

Unknown id → not-found. Missing enrichment must not break the page.

## Errors & ops

| Case | Behavior |
|------|----------|
| Claim empty | Skill exits cleanly; automation no-op success |
| Ambiguous manual name | Stop; list candidates; no save |
| Subagent failure | Save other succeeded slices; failed slice retries later |
| Save HTTP error | Do not mark slices done |
| Bad secret | Fail closed |

**Backfill:** schedule until no for-later items miss required slices.  
**Steady state:** same schedule catches new for-later adds.  
**New slice:** bump app required list; schedule gap-fills automatically.

## Success criteria

- Manual enrich by id yields all four slices on the details page
- Schedule drains incomplete for-later albums and skips fully complete ones
- Adding a fifth required slice causes automatic gap-fill without a separate automation
- Details page is a credible dossier reachable from for-later and `/albums/all`
- Cover descriptors never collide with RYM musical descriptor storage/UI naming

## Future widen (non-v1)

- Claim from library / all `spotifyAlbums` once cost is understood
- Product filters on cover descriptors and occasions
- Optional manual “gaps-only” flag (schedule already gap-fills)
- Webhook trigger (“enrich this album now”) reusing the same skill path
