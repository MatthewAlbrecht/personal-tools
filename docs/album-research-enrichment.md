# Album Research Enrichment

Album research enrichment is a Cursor-driven system: an explicit Cursor skill locks an album's stored identity, delegates four independent research slices to subagents, and persists successful results through authenticated application endpoints. Production research does not run through an in-app LLM.

## Research slices

- `artistContext` — artist background, links, writeup, and similar-listening context
- `whyListen` — a short, album-specific listening pitch
- `coverDescriptors` — visual artwork tags, separate from RYM musical descriptors
- `occasions` — situations and settings where the album fits

## v1 boundaries

Scheduled work is claimed only from active for-later albums, while enrichment remains attached to the canonical `spotifyAlbums` record. v1 does not add browsing or filtering by cover descriptors or occasions, claim albums outside for-later, package the workflow as a plugin, or replace Cursor research with an in-app researcher.

## Run modes

- **Schedule:** claim the next incomplete for-later album, research missing slices only, save in gaps mode, and stop after that one album. An empty claim is a normal successful no-op.
- **Manual:** resolve an album by Convex album id, Spotify album id, or name, then research all four slices and overwrite the returned slices. Ambiguous matches stop for operator selection.
- **Eval:** resolve one album and, for each selected slice with at least two available prompt variants, run those variants and save trial rows only. Skip any selected slice with fewer than two variants. Review and promote trials on the album details page; eval never writes live enrichment directly.

## Operator configuration

- `ALBUM_ENRICHMENT_SECRET` is the bearer secret required by every album-enrichment API route. Configure it in the deployment and Cursor Automation/cloud-agent environment; use `.env.local` for local operation. Never commit or print it.
- `SPOTIFY_SYNC_USER_ID` scopes claim and resolve operations to the operator's album data and is read by the application.
- `BASE_URL` is the operator-provided deployed app origin. Never guess a production domain. For local `pnpm dev`, default to `http://localhost:1333`.

All endpoints are under `$BASE_URL/api/album-enrichment`:

- `POST /claim` — claim one scheduled album; `{ "empty": true }` is success
- `GET /resolve?q=...` — resolve a manual or eval target
- `POST /save` — persist successful live slices
- `POST /trial` — persist one eval variant without changing live enrichment
- `POST /promote-trial` — promote one stored trial to its live slice

Payload contracts intentionally live with the routes and orchestrator skill rather than in this stable overview.

## Operations and UI

A Cursor Automation may invoke `/enrich-for-later-album` on a cron. Each scheduled invocation handles at most one album and never loops; failed slices remain eligible for a later run. The operator dashboard is available at `/album-enrichment`. Album dossiers and trial review/promotion are available at `/albums/details/<albumId>`.

## Code and documentation map

- Orchestrator: [`.cursor/skills/enrich-for-later-album/SKILL.md`](../.cursor/skills/enrich-for-later-album/SKILL.md)
- Research prompts: [`.cursor/agents/`](../.cursor/agents/)
- HTTP routes: [`src/app/api/album-enrichment/`](../src/app/api/album-enrichment/)
- Convex storage and operations: [`convex/albumEnrichment.ts`](../convex/albumEnrichment.ts)
- Operator dashboard route: `/album-enrichment`
- Album dossier and trial review: [`src/app/albums/details/[albumId]/`](../src/app/albums/details/%5BalbumId%5D/)
- [Original idea](ideas/2026-07-15-ai-album-artist-research-enrichment.md)
- [Design specification](superpowers/specs/2026-07-17-ai-album-research-enrichment-design.md)
- [Historical implementation plan](superpowers/plans/2026-07-17-ai-album-research-enrichment.md)
