### Image mirroring plan (numbered steps)

1. Add images table

- In `convex/schema.ts`, add `folioSocietyImages` with fields: `productId`, `sourcePath`, `sourceUrl`, `position`, `variant` ('hero'|'gallery'|'thumb'), `hash` (sha256), `contentType`, `width?`, `height?`, `storageId`, `createdAt`.
- Indexes: `by_productId`, `by_hash`.

2. Extend details

- In `folioSocietyProductDetails`, add: `localHeroImageId?: string`, `localGalleryImageIds?: string[]` (store Convex `storageId`s).

3. Implement images module

- Create `convex/folioSocietyImages.ts` with:
  - `getByProductId(productId)`
  - `getByHash(hash)`
  - `upsertImage({...})` that inserts or returns existing by `hash`.

4. Mirror action

- In `convex/folioSocietyImages.ts`, add `mirrorImages` action args: `{ productIds?: number[], maxConcurrent?: number, limit?: number }`.
- Build a candidate list from details: `heroImage` + `galleryImages` (ensure absolute URLs, dedupe by `sourcePath`).

5. Fetch + hash

- Fetch each image with realistic headers (Accept, UA, `X-Store-Id: 2`, `Referer` to product page).
- Retry/backoff on 429/5xx; add request timeout.
- Compute sha256 of bytes; detect content-type from response.

6. Store bytes

- If `hash` exists → reuse `storageId`; else `ctx.storage.store(file)` to get `storageId`.
- Write `folioSocietyImages` row with metadata (`position`, `variant`, `hash`, `storageId`, etc.).

7. Link to details

- After mirroring, patch `folioSocietyProductDetails` with `localHeroImageId` and ordered `localGalleryImageIds`.

8. Non-blocking trigger

- In `folioSocietyDetails.enrichDetails`, after successful `upsertDetails`, schedule `mirrorImages` for those products (don’t await). Pass `maxConcurrent` and `limit`.

9. Serve images

- Add Next route `src/app/api/images/[id]/route.ts` that:
  - Accepts `storageId` (or hash).
  - Calls a Convex action to stream or to get a signed URL, then returns bytes with `Content-Type` and `Cache-Control: public, max-age=31536000, immutable`.

10. UI preference

- Update gallery components to prefer local: `localGalleryImageIds.map(id => /api/images/${id})`, fallback to remote when missing. Same for hero image.

11. Safety & filters

- Only mirror whitelisted domains (Folio CDN). Ignore non-image URLs. Enforce max image size.

12. Observability + limits

- Log attempted/reused/stored/failed counts. Cap per-run images (e.g., `limit=50`) and concurrency (3–5). Increment `errorCount` on details if mirroring fails.

13. Dedupe across products

- Reuse by `hash`; allow multiple rows per product referencing the same `storageId` if needed for ordering.

14. Optional GC

- Add a periodic job to delete unreferenced images (no product uses them) after a grace period.
