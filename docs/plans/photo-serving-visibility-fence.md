# Photo serving visibility fence Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** `GET /api/venues/{venueId}/photos/{hash}` (body and `304` path) answers `404` for a venue
that is not tourist-visible, unless the caller is the venue's owning operator or a platform admin.

**Architecture:** The fence lives in `VenuePhotoService` (the application service, so no driving
adapter can skip it), which takes a `PhotoViewer` the controller resolves from the session
(anonymous / operator id / admin). Visible → public response as today; bypassed → the same bytes
under `Cache-Control: private, no-cache`, so a shared cache never stores a hidden venue's photo.

**Source of intent:** #1335 (option 1, chosen by the user 2026-10-01).

**Branch:** `bugfix/photo-serving-visibility-fence`

## Acceptance criteria

- [x] **AC-1:** Given a venue whose owner is `ACTIVE`, when anyone reads a stored variant (bytes or
  matching `If-None-Match`), then it serves as today with `Cache-Control: no-cache, public`.
  *Seam:* `GET /api/venues/{id}/photos/{hash}` · *Pinned by:* `VenuePhotoServingIT` (existing cases,
  venues now seeded with an ACTIVE owner)
- [x] **AC-2:** Given a venue whose owner is `PENDING` or `SUSPENDED` (or no owner), when an
  anonymous caller or a non-owning operator reads a stored variant, then `404` for both the bytes
  and the `304` path, with no blob read. *Seam:* the route · *Pinned by:*
  `VenuePhotoServingIT.hiddenVenuePhotoIs404ToTheAnonymousCaller`,
  `…hiddenVenueRevalidationIs404`, `…hiddenVenuePhotoIs404ToANonOwningOperator`
- [x] **AC-3:** Given a hidden venue, when its owning operator (PENDING) or an admin reads the
  variant, then the bytes / `304` come back with `Cache-Control: no-cache, private`. *Seam:* the
  route · *Pinned by:* `VenuePhotoServingIT.ownerPreviewsAHiddenVenuePhotoPrivately`,
  `…adminPreviewsAHiddenVenuePhotoPrivately`
- [x] **AC-4:** The fence decision order (visible → public; else admin / owner → private; else
  absent) holds at the service. *Seam:* `VenuePhotos#serve/#exists` · *Pinned by:*
  `VenuePhotoServiceTest`

## Non-goals

- Fencing the upload response URL or the admin/operator reads that embed serving URLs: they are
  owner/admin-only already, and the bypass keeps their previews working.
- A `Vary: Cookie` header: a visible venue's response is identical for every viewer, and a
  bypassed one is `private`.

## Risks

- **R-1: shared cache stores a hidden venue's photo fetched by its owner** → bypassed responses
  are `private`; pinned by AC-3.
- **R-2: BOLA on the bypass (#13)** → the owner bypass asks `VenueOwnership#ownedVenues` in the
  service; only a `ROLE_OPERATOR` principal resolves to an operator id; a non-owner gets `404`
  (not `403`, so the hidden photo's existence does not leak).
- **R-3: cost** → one `VenueVisibility#isVisible` read per request, ownership read only when hidden.
- **R-4: sold-booking surfaces show photos of a later-suspended venue** → none do (booking,
  notification, itinerary, review, customer carry no photo URL; grep at plan time).

## Modulith

No new cross-module dependency: `venue` already depends on `operator::api` (`VenueVisibility`,
`VenueOwnership`). `shared.CurrentOperator` gains a non-throwing `optional` and an `isAdmin`
reading of the session principal (edge glue, as `CurrentCustomer#optional`).

## Phases

- **Phase 0 — service fence + viewer:** `VenuePhotoServiceTest` red, then `PhotoViewer`, the
  fenced `serve`/`exists` returning the audience.
- **Phase 1 — edge + HTTP:** `VenuePhotoServingIT` red (new cases + owner seeding), then
  `CurrentOperator`, controller cache directive.
- **Phase 2 — docs:** ADR-0013 amendment, `RESPONSIBILITIES.md` § venue, `VenueVisibility` Javadoc.

## Execution status

- [x] Phase 0 — `VenuePhotoServiceTest` 16/16 green
- [x] Phase 1 — `VenuePhotoServingIT` 11/11 green (5 new cases red on the old code first);
  `CurrentOperatorTest`; structural net green
- [x] Phase 2 — ADR-0013, `RESPONSIBILITIES.md` § venue + § operator, `VenueVisibility` Javadoc
- [ ] Draft PR, CI, review, Sonar
