# ADR-0008: Venue photo storage — Postgres `bytea` behind a swappable storage port

- **Status:** Accepted
- **Date:** 2026-07-11
- **Issue:** #142 (venue photos: operator upload + tourist display)

## Context

Venue photos are the **first binary payload in the system** — every other aggregate is small
structured rows, so the question "where do the images live?" was genuinely open. Constraints:

- **Scale is small and known (Phase 1).** A handful of Albanian-riviera venues, ≈3 photos per
  venue, modest anonymous browse. Only **resized, capped renditions** are stored; the full-res
  upload (up to 25 MB) is decoded, resized and **discarded**. Measured against synthetic noise, so
  an upper bound a real photograph stays under, swept across aspects 2:3 to 8:3: the largest single
  rendition is ≈808 KB (the 4:3 lightbox) and one photo runs ≈615 KB–1.26 MB across its renditions
  depending on aspect, so a three-slot venue holds ≈1.8–3.7 MB. The same sweep on photo-like
  content gives ≈144–237 KB per photo and ≈0.4–0.7 MB per venue. Still single-digit megabytes
  across all Phase-1 venues, which is what the `bytea` decision below is sized for.
- **The tourist read is public and must not hammer Neon.** Cards and the map banner are served
  to anonymous browsers; a "SELECT the blob on every render" would put the free-tier serverless
  Postgres (ADR-0004) in the hot path.
- **DSGVO / erasure.** Photos are venue (business) data, not tourist personal data, but erasure
  still has to be clean and cheap.
- **The stack has no object-store credential**, and adding a vendor (S3/R2/GCS) means a new
  credential, a new failure mode, and the classic **orphaned-blob** problem (the metadata row and
  the remote object committed non-atomically can drift).

## Decision

Store venue photos as **resized, EXIF-stripped, capped raster variants in a Postgres `bytea`
column**, written and read **behind a swappable storage port** — the same abstract-seam pattern as
`PaymentGateway` (ADR-0002): the `venue` module's application layer depends on a `PhotoStorage`
**port** (module-internal driven port, invariant #11), with a package-private **`bytea` adapter** as
the real implementation and an **in-memory fake** for application-service unit tests. Object
storage + CDN is the documented **scale-out path**, deferred behind the port as a one-adapter swap.

Why bytea-in-Postgres is right *at this scale*: no new vendor or credential; uploads are atomic
with their metadata row (no orphaned-blob problem, no reconciliation job); erasure is a single
`DELETE` in one transaction, bytes included; and the stored payload is tiny, so the usual "don't
put big blobs in your OLTP database" objection does not bite.

Serving discipline that keeps Neon out of the tourist hot path (part of this decision):

- **Resize at upload → store only the small per-surface renditions.** Card, beach-map banner,
  lightbox and operator preview are distinct capped targets. `CARD` and `BANNER` each carry a
  second rendition at twice the density so the browser can pick per rendered box from a `srcset`;
  `LIGHTBOX` carries one because its near-square box already *is* the DPR-2 size for the viewer it
  serves, and `PREVIEW` one because the operator slot is small and authenticated. The full-res
  original is never served and never stored. A rendition whose box is larger than the source is
  skipped rather than upscaled — which governs the retina tier and the lightbox baseline alike —
  and both are encoded at a lower JPEG quality, which a high-density display hides. Hard byte +
  dimension caps on every rendition; a ≈50 MP / 12,000-px decode guard rejects decompression bombs
  regardless of byte size.
- **A rendition added later cannot be backfilled.** Discarding the original is what makes a photo
  stored before a surface or a density existed publish fewer candidates until it is re-uploaded —
  the accepted cost of not keeping masters. Each tourist read falls back to its next-best stored
  surface, so such a photo is degraded, never absent.
- **Content-hash URLs, revalidated.** The serving endpoint is keyed by the variant's content hash
  and returns a strong `ETag`, so a client stores the bytes once and thereafter reuses them via
  `304` — the database is hit ≈once per image, not per view. A replaced photo gets a new hash →
  a new URL. The directive is `Cache-Control: public, no-cache`, and the `304` is gated on the
  variant still existing (`PhotoStorage#exists`, a blob-free index probe): a takedown (ADR-0013)
  mints nothing, it deletes, and a year-long `immutable` TTL would leave a removed photo in shared
  caches and in every `ETag` holder's browser. `*.onrender.com` is Cloudflare-fronted on Render's
  own zone, which we cannot purge, so the origin header is the only lever over that edge. What
  this costs is the zero-RTT window — one conditional request per image per view, resolved on an
  index probe with an empty body; the `bytea` column is still read only on a genuine `200`.
- **The `bytea` column never appears in metadata/list queries.** Discovery and the operator
  console select only metadata; the blob is `SELECT`ed only on the content-hashed serving path.

## The flip threshold (when object storage wins)

Move to an object-store + CDN adapter when **any** of: many venues (tens/hundreds+, where total
`bytea` volume weighs on the Postgres working set / backups); large or many photos per venue
(full galleries, or full-res masters); heavy anonymous browse where a CDN edge materially cuts
latency/egress; or prod hardening, where the DSGVO-sovereign migration (ADR-0004) may make an
EU-region object store with a DPA the natural home for media.

**Precondition on the flip.** Whichever migration crosses this threshold ships a **purge on
takedown** in the same slice: the storage port's delete path must invalidate the removed variants'
URLs at the CDN. Today the serving header alone controls every cache, which works precisely
because no cache we could purge is under our control; a self-owned CDN holding bytes we can purge
but don't is a regression of the guarantee. It is also the point at which a longer TTL becomes
affordable again.

## Consequences

- The `venue` module owns photo **metadata** (`venue_photo`) **and** the storage port; the `bytea`
  adapter is a package-private `adapter/out` implementation. Blob bytes are kept in their own
  table/column so metadata reads stay lean.
- Binary lands in the DB via `JdbcClient`/`JdbcTemplate` `setBytes`/`getBytes` — no JPA
  (invariant #1). Integration tests use Testcontainers Postgres; the in-memory fake covers the
  application-service unit tests.
- Upload/replace/delete are **venue-scoped** (`/api/venues/{venueId}/**`): `assertOwns` runs first
  in the application service (invariant #13), pinned by `CrossVenueDenialIT`. The tourist photo
  read is **public**. Deletion and the blob-free `listMetadata` read have a second,
  **ownership-free** caller — the platform-admin moderation surface
  (`GET`/`DELETE /api/admin/venues/{venueId}/photos…`), role-gated on `is_admin` and exempt from
  invariant #13 like every `/api/admin/**` surface. It is a separate port
  (`VenuePhotoModeration`) so the venue-scoped `VenuePhotos` contract stays uniformly
  ownership-asserting, and it drives this ADR's same single cascading `DELETE`; neither
  moderation operation reads the `bytea` column.
- Because we discard the original, changing the resize targets later means operators re-upload
  rather than a server-side re-render from a stored master. Acceptable for a handful of venues.
- A future implementer must not "fix" this by reaching for S3 before a flip-threshold condition
  holds — the port is the seam for that change when it is warranted.

## Alternatives considered

- **Object storage + CDN now (S3 / Cloudflare R2 / GCS).** The textbook answer for media at scale,
  and our documented scale-out path. Rejected for now: new vendor + credential, non-atomic
  blob/metadata writes, and a CDN edge buys little at Phase-1 browse volume.
- **Store the full-res original + resize on serve.** Rejected: bloats the `bytea` footprint
  (25 MB masters × 3 × N) and puts resize work on the read path.
- **Local filesystem / volume on the app host.** Rejected: Render's free instances have ephemeral
  disk and no shared volume across instances; it also re-introduces a backup story separate from
  the database.
- **A base64 data-URI baked into the venue JSON.** Rejected: inflates every metadata/list
  response, defeats HTTP caching + `NgOptimizedImage`, and couples blob size to API payload size.

## Amendment log

- #504 / #511 — the ownership-free admin moderation caller on a separate port.
- #508 — the serving cache directive changed from `public, max-age=31536000, immutable` to
  `public, no-cache` with an existence-checked `304`, and purge-on-takedown became a
  precondition on the object-storage flip.
- #1041 — a rendition is keyed by surface **and** density: the two tourist surfaces gained a
  scale-2 rendition so the browser can choose from a `srcset`. The stored-footprint figures above
  are the measurement that followed, and discarding the original became a stated consequence
  rather than only a privacy property — it is what makes the new tier un-backfillable.
- #1070 — a fourth rendition target, `LIGHTBOX`, fit within a near-square **2200 × 1800** box at
  scale 1 only: DPR 2 over the modal viewer's painted maximum of 1100 × 900 CSS px, measured with
  `getBoundingClientRect` rather than derived from the markup. The viewer drew from the 8:3
  `BANNER` box, which cannot carry a tall image — a 2:3 upload stored 640 × 960 where the box asks
  1200 × 1800. Because the box is near-square the binding axis flips with the aspect at 11:9:
  below it the height binds, above it the width. The footprint figures above were re-taken across
  2:3 to 8:3 on one generator so the before and after are comparable. Three decisions ride with it:
  - **The viewer reads its own candidate list**, not a widened shared one, so a 2200px-wide
    candidate is never offered to the beach-map band or the gallery grid.
  - **A phone pays for that.** With a `LIGHTBOX` row present the list holds one candidate, so a
    390px viewport at DPR 2 fetches 2200w (≈97 KB) where its measured 358px box needs 716 device
    px and `BANNER@1` (720w, ≈23 KB) covered it. Accepted: the viewer is a deliberate tourist
    action and never the LCP element. A merged `LIGHTBOX + BANNER` ladder would restore the choice
    but is non-monotone past ≈2.3:1, where `BANNER@2` (2560w) is wider than `LIGHTBOX` (2200w).
  - **`BANNER` gains no scale-3 rung**, the question #1072 handed here. At DPR 3 the gallery hero's
    measured 730.7 × 360 box is short by a uniform **11%** at every aspect from 2:3 to 16:9 — not
    the 1%/11% split first reported, which was a 3:2-only artefact. A `BANNER@3` rung would cost a
    measured 50–105 KB on every photo and would buy pixels the tree now already holds: the
    `LIGHTBOX` rendition is wide enough to cover that box's DPR-3 need in all five aspects. If the
    11% is ever judged worth closing, offering the existing `LIGHTBOX` candidate to the hero's list
    is the byte-free route and a third density is not.
  The flip threshold is re-read and **unchanged**: the worst case is a three-slot venue at ≈3.7 MB
  of incompressible noise and a real photograph stays near 0.7 MB, so none of the four conditions
  is met by one more rendition at Phase-1 scale.
