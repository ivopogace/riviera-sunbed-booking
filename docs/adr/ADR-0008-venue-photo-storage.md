# ADR-0008: Venue photo storage — Postgres `bytea` behind a swappable storage port

- **Status:** Accepted
- **Date:** 2026-07-11
- **Issue:** #142 (venue photos: operator upload + tourist display)

## Context

The Liquid Glass designs (`docs/design/`, intake note 2026-07-02) reserve space for venue
photos but ship placeholders: the tourist app shows a gradient "Venue photos coming soon" on
Discover cards and the beach-map banner; the operator Venue tab (O8/#177) has three upload
slots (cover / sunbeds / bar). Issue #142 makes them real. This is the **first binary payload
in the system** — every other aggregate is small structured rows, so there is no existing
place to put bytes and the question "where do the images live?" is genuinely open. The reason
#142 sat in `needs-triage` was exactly this storage decision.

Constraints that bound the choice:

- **Scale is small and known (Phase 1).** A handful of Albanian-riviera venues, **≈3 photos
  per venue**, modest anonymous browse. Confirmed with the maintainer at the #142 grill, not
  assumed. Only **resized, capped variants** are stored (≈≤120 KB each; codec — progressive JPEG or
  WebP — is an implementation detail, see the plan) — the full-res upload (up to 25 MB) is
  decoded, resized, and **discarded**, never persisted. So the stored
  footprint is ≈360 KB per venue, sub-megabyte across all Phase-1 venues.
- **The tourist read is public and must not hammer Neon.** Cards + the map banner are served
  to anonymous browsers; a naive "SELECT the blob on every render" would put the free-tier
  serverless Postgres (ADR-0004) in the hot path.
- **DSGVO / erasure (ADR-0004 deferred prod plan, #101).** Photos are venue (business) data,
  not tourist personal data, but erasure still has to be clean and cheap.
- **The stack has no object-store credential today**, and adding a vendor (S3/R2/GCS) means a
  new credential, a new failure mode, and the classic **orphaned-blob** problem (the metadata
  row and the remote object committed non-atomically can drift).

## Decision

Store venue photos as **resized, EXIF-stripped, capped raster variants in a Postgres `bytea`
column**, written
and read **behind a swappable storage port** — the same abstract-seam pattern as
`PaymentGateway` (ADR-0002): the `venue` module's application layer depends on a
`PhotoStorage` **port** (module-internal driven port, `application/`, invariant #11), with a
package-private **`bytea` adapter** as the real implementation and an **in-memory fake** for
application-service unit tests. Object storage + CDN is the documented **scale-out path**,
deferred behind the port as a **one-adapter swap** — not built now.

Why bytea-in-Postgres is the right call *at this scale*:

- **No new vendor or credential** — one less thing to secure, rotate, and pay for.
- **Uploads are atomic with their metadata row** — the blob and its `venue_photo` row commit
  in one transaction, so there is **no orphaned-blob problem** and no reconciliation job.
- **Erasure is a single `DELETE`** — GDPR/#101 erasure of a venue's photos is one SQL
  statement in one transaction, bytes included. No cross-system delete to coordinate.
- **The stored payload is tiny** because we persist only the capped variants, so the usual
  "don't put big blobs in your OLTP database" objection does not bite here.

Serving discipline that keeps Neon out of the tourist hot path (part of this decision, not an
optimisation to add later):

- **Resize at upload → store only the small per-surface variants.** Card, beach-map banner,
  and operator preview are distinct capped targets; the full-res original is never served and
  never stored. Hard **byte + dimension caps** on every stored+served variant; a
  **≈50 MP / 12,000-px decode guard** rejects decompression bombs regardless of byte size.
- **Content-hash immutable URLs.** The serving endpoint is keyed by the variant's content
  hash and returns `Cache-Control: public, max-age=31536000, immutable` + a strong `ETag`, so
  the browser/CDN caches the bytes and the database is hit **≈once per image**, not per view.
  A replaced photo gets a new hash → a new URL; the old URL stays immutable.
- **The `bytea` column never appears in metadata/list queries.** Discovery and the operator
  console select only metadata (ids, slot, dimensions, hash, content-type); the blob is
  `SELECT`ed **only** on the content-hashed serving path — never `SELECT *`.

## The flip threshold (when object storage wins)

Move to an object-store + CDN adapter (the port already isolates the change) when **any** of:

- **Many venues** — tens/hundreds+, where total `bytea` volume starts to weigh on the
  Postgres working set / backups.
- **Large or many photos per venue** — full galleries, or storing full-res masters, pushing
  per-venue payload from ~hundreds of KB toward MB+.
- **Heavy anonymous browse** at a volume where even content-hash caching leaves meaningful
  origin blob reads, and a **CDN edge** materially cuts latency/egress.
- **Prod hardening** — the DSGVO-sovereign migration (ADR-0004 deferred plan) may make an
  EU-region object store with a DPA the natural home for media; revisit then.

Until one of these is true, adding object storage is over-engineering — the same judgment
ADR-0004 applied to EU-sovereign hosting for dummy data.

## Consequences

- The `venue` module owns photo **metadata** (a `venue_photo` table, Flyway V24, invariant
  #12) **and** the storage port; the `bytea` adapter is a package-private `adapter/out` impl
  (invariant #11). Blob bytes are kept in their **own table/column** so metadata reads stay
  lean.
- Binary lands in the DB via **`JdbcClient`/`JdbcTemplate` `setBytes`/`getBytes`** — no JPA
  (invariant #1). Integration tests use Testcontainers Postgres; there is **no external
  bucket to mock** — the in-memory fake covers the application-service unit tests.
- Upload/replace/delete are **venue-scoped** (`/api/venues/{venueId}/**`): `assertOwns` runs
  first in the application service (invariant #13, BOLA), pinned by `CrossVenueDenialIT`. The
  tourist photo read is **public**. **Amended by #504:** deletion additionally has a second,
  **ownership-free** caller — the platform-admin takedown
  `DELETE /api/admin/venues/{venueId}/photos/{slot}`, role-gated on `is_admin` and exempt from
  invariant #13 like every `/api/admin/**` surface, because a reported photo belongs by
  definition to a venue the admin does not own. It is a separate port
  (`VenuePhotoModeration`) so the venue-scoped `VenuePhotos` contract stays uniformly
  ownership-asserting, and it drives this ADR's same single cascading `DELETE`. The storage
  decision below is unchanged.
- Re-rendering trade-off: because we discard the original, changing the resize targets later
  means operators re-upload (acceptable for a handful of venues) rather than a server-side
  re-render from a stored master. Recorded so it is a conscious cost, not a surprise.
- A future implementer must not "fix" this by reaching for S3 before a flip-threshold
  condition holds — the port is the seam for that change when it is actually warranted.

## Alternatives considered

- **Object storage + CDN now (S3 / Cloudflare R2 / GCS).** The textbook answer for media at
  scale, and our documented scale-out path. Rejected **for now**: new vendor + credential,
  non-atomic blob/metadata writes (orphaned-blob problem), and a CDN edge buys little at
  Phase-1 browse volume. Deferred behind the port as a one-adapter swap — see the flip
  threshold.
- **Store the full-res original + resize on serve.** Rejected: bloats the `bytea` footprint
  (25 MB masters × 3 × N), weakening the very rationale for keeping blobs in Postgres, and
  puts resize work on the read path. We resize once at upload and cache immutable variants
  instead.
- **Local filesystem / volume on the app host.** Rejected: Render's free instances have
  **ephemeral** disk (lost on redeploy/restart) and there is no shared volume across
  instances; it also re-introduces a backup story separate from the database.
- **A base64 data-URI baked into the venue JSON.** Rejected: inflates every metadata/list
  response, defeats HTTP caching + `NgOptimizedImage`, and couples blob size to API payload
  size.
