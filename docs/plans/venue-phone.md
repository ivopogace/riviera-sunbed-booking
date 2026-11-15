# Venue phone on the booking view and in the guest mails — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** an operator may give their venue a phone number on the venue profile; a guest sees it on the
code-gated booking view's "Need help?" block and in the guest mails' support block, and nowhere public.

**Architecture:** one nullable `venue.phone` column (V86) holding E.164 (`+` and 8–15 digits), validated
by a published `venue.vocabulary.VenuePhone` value type and twinned by a CHECK. It travels to `booking` and
`notification` on the existing unfenced `SetBookingFacts#setBookingInfo` read (`SetBookingInfo#phone`), so
no new port and no anonymous `VenueCatalog` read changes.

**Source of intent:** #1746 (follow-up of #1735); owner decision 2026-11-15: "Only after booking" — the
phone never reaches the public venue page or the venue list read.

**Branch:** `claude/issue-1746-venue-phone-97121f` (stands in for `feature/venue-phone`)

## Acceptance criteria

- [ ] **AC-1:** Given an owner, when they save the profile with phone `+355 69 123 4567`, then the profile
  read returns `+355691234567`; a save without a phone clears it (full replace). *Seam:* `PATCH`/`GET
  /api/venues/{id}/profile` · *Pinned by:* `VenueAdminControllerIT.profilePhoneRoundTripsInE164AndClears`
- [ ] **AC-2:** Given a phone without a country code (`069 123 4567`), letters, or over 15 digits, when the
  owner saves, then `400 INVALID_REQUEST` and nothing is written. *Seam:* `VenuePhone.parse` ·
  *Pinned by:* `VenuePhoneTest`, `VenueAdminControllerIT.profileRejectsANationalPhone`
- [ ] **AC-3:** Given V86, a row may hold `NULL` or an E.164 value and the CHECK refuses anything else.
  *Seam:* the `venue` table · *Pinned by:* `VenuePhoneMigrationIT`
- [ ] **AC-4:** Given a venue with a phone, the anonymous venue list and map reads carry no phone.
  *Seam:* `GET /api/venues`, `GET /api/venues/{id}` · *Pinned by:* `VenueReadControllerIT.publicReadsCarryNoPhone`
- [ ] **AC-5:** Given a booking at a venue with a phone, when the guest reads the booking view, then
  `venuePhone` is the E.164 number; `null` when the venue gave none. *Seam:* `GET /api/bookings/{code}` ·
  *Pinned by:* `ViewBookingServiceTest`, `BookingControllerIT`
- [ ] **AC-6:** Given a venue phone, the booking and stay confirmation mails' support block names it (in the
  guest's locale), rendered even with no platform channel; with no phone the block is as before.
  *Seam:* `Mailer#sendBookingConfirmation` / `#sendStayConfirmation` · *Pinned by:* `SmtpMailerIT`
- [ ] **AC-7:** After #1750, every guest booking mail carrying the support block names the venue phone.
  *Seam:* `SmtpMailer#supportLines` · *Pinned by:* `SmtpMailerIT`
- [ ] **AC-8:** The console venue tab edits the phone (empty clears, a national number shows a field error
  before save); the booking view's "Need help?" block shows a `tel:` link when `venuePhone` is set, and the
  block renders for a phone alone. *Seam:* the components · *Pinned by:* `venue-tab.spec.ts`,
  `booking-view.spec.ts`, mocked e2e `request-to-book.e2e.ts`

## Non-goals

- The phone on the public venue page, venue list, map read or sitemap (owner decision).
- Per-number national formatting for display (the E.164 string is shown as stored).
- A phone on operator-facing mails or the staff lookup.

## Risks

- **R-1:** Full-replace PATCH — a console that does not send `phone` would clear it. → the console form
  round-trips it; the profile's `expectedVersion` token (stale → `409`) already serialises concurrent edits.
- **R-2:** The phone leaking to an anonymous read. → it rides only `SetBookingInfo` (booking/mail) and the
  owner-asserted profile read (#13); AC-4 pins the public reads.
- **R-3:** Mail header injection / malformed copy. → the value is CHECK-constrained digits, never user text.
- **R-4:** Flyway `V86` claimed by the orchestrator; no sibling in wave 5 has a migration.

## Open questions

### Resolved

- Public venue page? — Owner: only after booking (2026-11-15).
- Validation rule — E.164 (ITU-T E.164: country code not starting with 0, at most 15 digits), the same
  shape `RIVIERA_SUPPORT_WHATSAPP` binds to; spaces, dots, dashes and parentheses typed inside a number are
  dropped, a leading `+` optional.

## Modulith

- `venue.vocabulary.VenuePhone` — new published value (vocabulary); consumers: `venue` (profile), and
  `booking`/`notification` read `SetBookingInfo#phone` through grants they already hold.
- `SetBookingInfo` gains `phone` (nullable). No new port, event or grant.
- Owner check: the phone is profile data, `venue`'s Job (RESPONSIBILITIES §venue); the mail renders it as a
  fact read at send time (§notification Not-My-Job: facts via `api/` ports).

## FE↔BE contract

- `GET/PATCH /api/venues/{id}/profile`: `phone: string | null`.
- `GET /api/bookings/{code}`: `venuePhone: string | null`.

## Phases

- **Phase 0 — venue:** V86 + `VenuePhone` + profile round-trip · red `VenuePhoneTest`, `VenueAdminControllerIT`
- **Phase 1 — booking view read:** `SetBookingInfo#phone` → `BookingDetail#venuePhone` · red `ViewBookingServiceTest`
- **Phase 2 — confirmation mails:** facts + `supportLines` · red `SmtpMailerIT`
- **Phase 3 — frontend:** console field + booking-view block + e2e · red specs
- **Phase 4 — after #1750:** phone in every mail the support block reaches · red `SmtpMailerIT`

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** red `VenuePhoneTest`

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — venue | ⏳ | |
| 1 — booking view read | | |
| 2 — confirmation mails | | |
| 3 — frontend | | |
| 4 — after #1750 | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
