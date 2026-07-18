---
name: enrich-for-later-album
description: >-
  Research one for-later album via the authed album-enrichment HTTP API and
  four research subagents, then save results. Supports three modes: schedule
  (drain one incomplete for-later album, gaps only), manual (enrich a named
  or id'd album, full overwrite), and eval (run ≥2 prompt variants of one
  slice into trial storage for compare/promote, never touching live data).
  Use when the user says "enrich this album", "run enrich-for-later-album",
  "drain the enrichment queue", or "eval the why-listen/artist-context/
  cover-descriptors/occasions prompt".
disable-model-invocation: true
---

# Enrich for-later album

Orchestrator playbook for the AI album research enrichment pipeline. This skill only runs when explicitly invoked (`/enrich-for-later-album` or a direct mention) — it writes to production data and must never fire on unrelated conversation.

Full design: `docs/superpowers/specs/2026-07-17-ai-album-research-enrichment-design.md`.

## Configuration

- **Base URL** — the deployed app origin. Use the URL the operator gives you in this conversation, or the value configured as a Cursor Automation / cloud agent secret for this repo (e.g. `BASE_URL`). For local testing against `pnpm dev`, default to `http://localhost:1333`. Never guess a production domain.
- **Auth** — every request needs `Authorization: Bearer $ALBUM_ENRICHMENT_SECRET`. The secret is a Cursor cloud agent / automation secret (or `.env.local` for local testing) — never hardcode it, never print it, never commit it.
- **Endpoints** (all under `$BASE/api/album-enrichment/`):
  - `POST claim` — scheduled mode: claim the next incomplete for-later album
  - `GET resolve?q=...` — manual/eval mode: resolve an album by Convex id, Spotify id, or name
  - `POST save` — persist succeeded slices (`mode: "gaps" | "overwrite"`)
  - `POST trial` / `POST promote-trial` — eval mode only; **not implemented yet** (Task 11). If these routes 404, tell the user eval mode isn't wired up yet and stop; do not fall back to `save`.

## Identity lock (do this before any research, every mode)

Build a **frozen identity packet** from the claim/resolve response — never from a subagent's own guess:

```json
{
  "title": "...",
  "artists": ["...", "..."],
  "releaseYear": 2024,
  "coverImageUrl": "https://...",
  "rymUrl": "https://..."
}
```

`releaseYear`, `coverImageUrl`, `rymUrl` are optional — omit if absent, don't invent them. Pass this exact packet (plus each subagent's slice-specific instructions) into every subagent prompt. Subagents must treat it as ground truth and must not re-resolve, re-search-to-confirm, or second-guess which album/artist they're researching.

## Hard rules (all modes)

- Never launch a research subagent before the identity packet is frozen.
- Never call `save` (or `trial`) when `resolve`/`claim` returned ambiguous candidates — stop and show them instead.
- Never enrich a second album in the same run/turn — one album per invocation, full stop. (Eval mode may run multiple **variants** of the same album+slice in one turn; that's still one album.)
- Eval mode never calls `save` (only `trial`). Scheduled mode never calls `trial`.
- Cover descriptors (`cover-descriptors` subagent) describe the **artwork image** only — color, subject, setting, visual style. They are a different concept from RYM's musical genre/descriptor tags; never let audio-genre language leak into `coverDescriptors` tags.
- A subagent's final message must be pure JSON matching its slice's contract (see below). Strip any extra keys (e.g. `notes`) before building the `save`/`trial` body — the Convex validators reject unknown fields.
- If a subagent fails or returns unusable JSON, drop only that slice; still save/report the slices that succeeded.

## Mode: Schedule (one claim, gaps only)

1. `POST claim` with no body (server fills `userId` from `SPOTIFY_SYNC_USER_ID`).
2. If `{ "empty": true }` → done, report success, stop. This is the normal steady-state outcome — not an error.
3. Otherwise the response is the identity + `missingSlices` (`EnrichmentSliceKey[]`) + `existingSlices`. Build the identity packet from `title`/`artists`/`releaseYear`/`coverImageUrl`/`rymUrl`.
4. Launch **only** the subagents whose slice key appears in `missingSlices`, in parallel. Pass each the identity packet. If `existingSlices` has data for *other* slices, you may include it as light context (e.g. so `why-listen` knows the artist writeup already on file) but it is never required.
5. Collect each subagent's JSON. Drop slices that failed to return valid JSON.
6. `POST save` with `{ albumId, identityPacket, mode: "gaps", <succeeded slice payloads> }`. Only include slice keys you actually have payloads for.
7. Report `savedSlices` from the response. Stop — do not loop to claim another album.

## Mode: Manual (by id or name, full overwrite)

1. Parse the user's target from their message: a Convex `spotifyAlbums` id, a Spotify album id, or a free-text name/artist search string.
2. `GET resolve?q=<target>`.
   - `404` → tell the user nothing matched, stop.
   - `{ kind: "candidates", candidates: [...] }` → **stop and list the candidates** (title + artist + ids) for the user to disambiguate. Do not guess, do not save.
   - `{ kind: "exact", ... }` → continue.
3. Build the identity packet from the exact match's identity fields.
4. Launch **all four** subagents in parallel (`artist-context`, `why-listen`, `cover-descriptors`, `occasions`), each with the identity packet. Manual mode always does a full pass, regardless of `existingSlices`/`missingSlices`.
5. Collect JSON from each; drop any that failed.
6. `POST save` with `{ albumId, identityPacket, mode: "overwrite", <slice payloads for every slice that returned valid JSON> }`.
7. Report `savedSlices` and any slice that failed research (so the user knows to retry just that one).

## Mode: Eval (prompt A/B into trial storage)

Requires Task 11 (`POST trial` route + seeded `.cursor/agents/variants/{slice}/*.md`). If either is missing, stop and say so.

1. Resolve the target album exactly like manual mode (stop on candidates/404).
2. Identity lock as above.
3. Determine which slice(s) to eval from the user's request (one or more of `artistContext`, `whyListen`, `coverDescriptors`, `occasions`).
4. For each chosen slice, list `.cursor/agents/variants/{slice}/` and require **at least 2** variant files. If fewer than 2 exist, tell the user and skip that slice (don't fabricate a second variant).
5. Generate one `trialRunId` for this turn (e.g. a short timestamp-based id) shared across every variant/slice run in this turn.
6. For each variant file, launch it as a subagent (same identity packet + gap context as production, same output contract as its slice) — read the variant file's own frontmatter (`name`, `description`, optional `model`) to decide how to invoke it; do not blend variant instructions together.
7. For each result, `POST trial` with `{ trialRunId, albumId, slice, variantId, promptPath, payload, model? }` where `payload` is the stripped slice JSON (same shape `save` would take for that slice) and `variantId`/`promptPath` identify the specific variant file used.
8. Never call `save` in this mode, regardless of outcome.
9. Print the `trialRunId` and the details-page URL (`$BASE/albums/details/<albumId>`) so the user can open the trials comparison UI. Stop — do not auto-pick a winner or promote.

## Gap-fill context for subagents

When only some slices are missing (schedule mode, or a future manual "gaps only" flag), pass each launched subagent:

- The frozen identity packet (always).
- Any **already-saved** narrative fields relevant to its own slice, if present in `existingSlices`/the claim response — e.g. give `artist-context` the existing `artistWriteup`/`listenIfYouLike` so it refines rather than starts blind. Do not give a subagent another slice's saved data (e.g. don't feed `whyListenPitch` into `cover-descriptors`).

## Subagent output contracts (reference)

Each subagent's **final message must be exactly one JSON object** — no prose before/after, no markdown fence required but acceptable if it wraps a single JSON object. An optional `notes` key for brief source citations is allowed; strip it before saving.

```json
// artist-context
{
  "origin": "...",
  "activeSince": "...",
  "instagramUrl": "https://...",
  "artistWriteup": "...",
  "listenIfYouLike": ["...", "..."]
}

// why-listen
{ "whyListenPitch": "..." }

// cover-descriptors
{ "tags": [{ "label": "Green" }, { "label": "Live show" }] }

// occasions
{ "tags": [{ "label": "Dinner party" }, { "label": "Late night" }] }
```

All fields are optional per-slice (a subagent may return `{}` if it genuinely finds nothing credible) except `whyListen.whyListenPitch` and each tag's `label`, which the server requires when that slice is sent at all. Prefer omitting a slice entirely over sending empty/guessed filler.

## Manual smoke (local)

```bash
BASE=http://localhost:1333
curl -s -X POST "$BASE/api/album-enrichment/claim" \
  -H "Authorization: Bearer $ALBUM_ENRICHMENT_SECRET"

curl -s "$BASE/api/album-enrichment/resolve?q=some+album+name" \
  -H "Authorization: Bearer $ALBUM_ENRICHMENT_SECRET"
```

## Automation notes

- Trigger: cron, run in scheduled mode. Stop condition is `{ empty: true }` from `claim` — that's a clean success, not a failure.
- Required secrets: `ALBUM_ENRICHMENT_SECRET`, base URL.
- Repo: this repository, on the branch that has the routes deployed.
- See Task 9 for the full automation setup checklist.
