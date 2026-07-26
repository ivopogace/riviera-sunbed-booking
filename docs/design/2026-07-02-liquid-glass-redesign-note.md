# Liquid Glass redesign — design intake note (2026-07-02)

Source-of-intent record for the visual redesign imported from Claude Design
(project `73dfb0cd-c6f2-42e1-831b-287db5ddc63c`; first export 2026-07-02, the
**gap-fill v3 export later the same day supersedes it** — see "v3 gap-fill"
below). The design artifacts live next to this note and are the authoritative
visual spec:

- `riviera-sunbeds-liquid-glass-v3.dc.html` — the **tourist** app (Discover,
  Beach map, booking dialog + confirmation, My bookings + cancel, theme
  switcher, responsive header/nav — plus, from v3: the full Request-to-Book
  guest lifecycle, the real Payment page, Find-a-booking, cutoff explainers,
  venue description, and load-failure states).
- `riviera-operator-console-v2.dc.html` — the **operator console** (stats
  strip, Layout editor with paint tool, Row pricing, Daily view with arrivals,
  Venue details incl. photos + amenity chips — plus, from v2: the **Requests**
  queue tab and the **Payouts** ledger/statement tab with the weather-refund
  action).
- `riviera-sign-in.dc.html` — the **unified sign-in/register page** (one page
  for both sides; registration picks Tourist vs Venue operator; operator
  registration ends in a pending-approval notice). Visual spec for epic #108
  (#111/#112/#115), implementing the maintainer's unified-auth decision.
- `riviera-admin-console.dc.html` — the **platform-admin console** (approvals,
  operator accounts, daily payouts, privacy/erasure, plus the signed-out and
  no-access gates). **Not part of the Claude Design import** — drawn in-repo on
  2026-07-26, after the admin surface had accumulated endpoint-by-endpoint
  (#115/#128/#101) with UI for only some of them. Visual spec for epic #348.
  Same conventions as the files above (porcelain glass, demo logic only), with
  one addition: it carries a **responsive layer** (media queries in the helmet
  block, since the canvas format is inline-styled) so the console works on a
  phone down to 360px — the payout table becomes one labelled card per venue.

Both are self-contained design-canvas files; open them in a browser
(`support.js` / `image-slot.js` alongside are the canvas runtime). The `.dc.html`
script blocks contain **demo logic only** (fake data, fake payment, fake auth) —
they specify look, layout, copy, and interaction shape, **not** behavior. Real
behavior stays with the backend contracts and the invariants in `CLAUDE.md`.

## Scope decisions (maintainer, 2026-07-02)

1. **Two epics, sequential.** Tourist redesign epic first; Operator Console
   restyle is its own epic implemented right after, reusing the glass
   tokens/components the tourist epic builds.
2. **Restyle-first.** The tourist epic restyles the *shipped* tourist surface.
   The design's auth modal, SSO buttons, and account-backed bookings are the
   UI for epic #108's open slices (#111 S2 accounts, #112 S4 mocked SSO,
   #114 S3 signed-in my-bookings) and ship with those slices — not here. When
   those slices are built, this design is their visual spec.
3. **Themes: two now, infra for all.** Ship `riviera` (dark glass, default) and
   `porcelain` (light) as CSS-token themes with a switcher, localStorage
   persistence, and `prefers-color-scheme` default. The other 12 palettes in
   the design file are follow-up data, not code.
4. **Amenities + distance-to-water: fullstack slice** in the tourist epic
   (Flyway migration, `venue` module surface, editor input, discovery/map
   chips). The operator design's "Commodities" chip editor is the operator-side
   UI intent for the same data.
5. **Guest "My bookings": device-local list now.** FE-only: booking codes are
   remembered on-device (localStorage) at checkout and listed under
   "My bookings", each entry opening the existing per-code booking view.
   #114 later merges this with account-backed bookings.

## v3 gap-fill (same day, second export)

After T1 shipped, a gap analysis (backend capability vs designed UI) fed a
design brief back to Claude Design; the v3 export answers it. What v3 adds —
and where each lands:

| v3 addition | Lands in |
|---|---|
| Request-to-Book guest lifecycle: request-mode dialog ("Send request"), Request-sent screen, status banners (pending + withdraw, accepted + Pay-now + deadline, declined, expired), full status-chip union incl. COMPLETED/NO_SHOW | #137 (dialog/request), #138 (detail banners/chips) |
| Real Payment page (Payment-Element container, summary, "Confirming your booking…" webhook-wait state, payment-failed + retry) | #137 |
| Find-a-booking (code entry; nav item replaces the dead "How it works") | new tourist-epic slice (T8) |
| Cutoff explainer ("Book by 6 PM the day before"), date picker excludes today | #135/#136 (copy), behavior already server-enforced (invariant #4) |
| Venue description on the map header | #136 |
| Discover/map load-failure states with retry | #135/#136 |
| Operator **Requests** tab (queue, accept/decline, expiry-race error copy, badge count) | operator epic #141 (mandatory slice) |
| Operator **Payouts** tab (per-booking gross/commission/net, refund reversals, "owed to you", per-period statement for the manual bank batch, weather-refund action with confirm) | operator epic #141 (mandatory slice) |
| Unified sign-in/register page (account-type choice at registration; operator branch ends in pending-approval) | epic #108 — #111 (page + tourist branch), #115 (operator branch), #112 (SSO buttons) |

The v3 diffs to previously-designed screens were audited at intake: all
additive and on-brief; no unsolicited restyle. The demo-logic caveat still
applies (script blocks specify look/interaction, never behavior — statuses,
refunds, cutoffs, payment truth all stay server-side per the invariants).

## Reconciliations against current reality

The design was drawn against a pre-#98 snapshot of the frontend. Deltas the
restyle must respect:

- **Request-to-Book is shipped and must survive.** The design's booking dialog
  always ends in "Pay"; the real dialog keeps the #98 branch — REQUEST venues
  get request-to-book (→ restyled `/booking/requested`), accepted requests get
  "Pay now". The `Instant Book` / `Request to Book` mode chip from the design
  applies to both card and map header.
- **Payment stays webhook-true (invariant #8).** The design's step-2 "Visa ····
  4242 / Pay" is a mock. The real flow keeps the Stripe Payment Element page
  (`/booking/pay`), restyled in glass; no client-side confirmation.
- **Cancellation copy** in the design matches invariants #4/#10 (free until the
  evening-before cutoff → full refund; after → non-refundable). Server computes
  refunds; the FE renders the server's answer, not its own date math.
- **Venue photos are deferred by the design itself** (tourist file shows a
  gradient placeholder "Venue photos coming soon"; operator file has upload
  slots). Filed as a follow-up, not part of either restyle epic.
- **Booking codes** are displayed prominently (dashed card) — codes remain
  bearer credentials (invariant #7): no codes in URLs beyond the existing
  `/booking/:code` deep link, no logging.
- **`buildVenues()`/`seedBookings()` demo data** (ratings, amenities, venues)
  is illustrative only. All data comes from the real APIs; amounts render from
  integer minor units (invariant #5) via the existing `shared/money.ts`.

## Design → work mapping

| Design element | Where it lands |
|---|---|
| Glass tokens, animated themed background, header/nav (mobile menu), theme switcher | Tourist epic slice 1 (foundation) |
| Discover: hero, filter bar + result count, glass venue cards + availability bar | Tourist epic slice 2 |
| Beach map: header, availability bar, photo placeholder, pannable row map, per-row prices, legend, sea/promenade banners | Tourist epic slice 3 |
| Booking dialog (2-step), confirmed dialog, `/booking/pay`, `/booking/requested` restyle | Tourist epic slice 4 |
| Booking view + cancel flow restyle | Tourist epic slice 5 |
| Guest my-bookings device-local list | Tourist epic slice 6 |
| Amenities + to-water (BE + editor + tourist chips) | Tourist epic slice 7 |
| Operator console restyle (all tabs) | Operator epic |
| Auth modal, SSO buttons, user menu | Epic #108 (#111/#112/#114) — design is their visual spec |
| Auth **surface split** (tourist modal vs operator sign-in card) | **Overridden** (maintainer, 2026-07-02): one unified sign-in/register page for both sides; registration chooses the account type. Styling per the designs; split per the #108 comment |
| Venue photos (upload + display) | Follow-up issue |
| Remaining 12 theme palettes | Follow-up issue |
| Platform-admin console (approvals, operators, daily payouts, privacy) | Epic #348 — added 2026-07-26, outside the original import |
