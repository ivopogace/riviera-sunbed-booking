# Plan: one emailed-link builder; booking-link key validated beside its prefix (#1622)

Branch: `feature/1622-emailed-link-builder`. Effort for review: high (owner).

## ACs

1. Given any origin `EmailedLinkOrigin.require` accepts (underscored hosts included), when
   `EmailedLink.on(origin)` appends path segments and query params, then the URI is byte-identical
   to `UriComponentsBuilder.fromUriString(origin)…build().encode().toUri()` for origins with no
   percent-escape, over codes/tokens holding characters a path segment or query must encode.
   Seam: `notification.vocabulary.EmailedLink`; pinned by `EmailedLinkTest` (old formula as test oracle).
2. Given an origin whose path is already percent-escaped (`https://app.example/my%20app`), when a
   link is built, then the escape is kept (`/my%20app/booking/…`, never `%2520`), and
   `EmailedLinkOrigin` accepts it. Pinned by `EmailedLinkTest`, `EmailedLinkOriginTest`.
3. A percent-escape in the authority (IPv6 zone id) stays rejected: Spring cannot build on it.
4. `BookingLinks` (×3), `CustomerRecovery#link`, `OperatorApprovalMail` build through `EmailedLink`;
   their existing tests pass unchanged.
5. `BookingLinkProperties`' compact constructor validates through `EmailedLinkOrigin`, naming
   `PREFIX + ".base-url"` from the same constant its `@ConfigurationProperties` declares;
   `BookingLinks` validates nothing. Pinned by `BookingLinkOriginWiringTest` + a properties test.

## Risks

- Invariant #7: booking-code and token links are bearer URLs; tests compare fixture values, nothing logs a link.
- `build(true)` throws on a non-ASCII path; `on` takes the origin's `URI#toASCIIString` form first
  (what `.encode()` produced for it before).

## Modulith

`EmailedLink` is a stateless helper in `notification::vocabulary`, beside `EmailedLinkOrigin`;
`auth` already holds that grant. No new grant, port or event.

## Execution status

- [x] Phase 1: `EmailedLink` + pinning tests; call sites switched; `%` rule narrowed to the authority.
- [x] Phase 2: booking-link validation moved into `BookingLinkProperties`.
- [x] Docs: RESPONSIBILITIES § notification, cd-pipeline, vocabulary package-info.
