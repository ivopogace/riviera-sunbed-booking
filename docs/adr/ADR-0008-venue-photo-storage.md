# ADR-0008: Venue photo storage — Postgres `bytea` behind a swappable storage port

- **Status:** Accepted
- **Date:** 2026-07-11
- **Issue:** #142 (venue photos: operator upload + tourist display)

## Context

Venue photos are the **first binary payload in the system** — every other aggregate is small
structured rows, so the question "where do the images live?" was genuinely open. Constraints:

- **Scale is small and known (Phase 1).** A handful of Albanian-riviera venues, ≈3 photos per
  venue, modest anonymous browse. Only **resized, capped variants** are stored (≈≤120 KB each);
  the full-res upload (up to 25 MB) is decoded, resized and **discarded**. The stored footprint is
  ≈360 KB per venue, sub-megabyte across all Phase-1 venues.
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

- **Resize at upload → store only the small per-surface variants.** Card, beach-map banner and
  operator preview are distinct capped targets; the full-res original is never served and never
  stored. Hard byte + dimension caps on every variant; a ≈50 MP / 12,000-px decode guard rejects
  decompression bombs regardless of byte size.
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
