# ADR-0006: The booking code stays in the URL path (v1)

- **Status:** Accepted
- **Date:** 2026-06-30

## Context

The booking **code** is an unguessable bearer credential (invariant #7: ≥8 random base32
chars, never logged by the app). Two public, unauthenticated endpoints are keyed solely on
it, with the code carried as a **path variable**:

- `GET /api/bookings/{code}` — booking detail + server-computed refund terms (U6).
- `POST /api/bookings/{code}/cancel` — cancel + refund (U6).

The U6 review gate (#11) flagged that a credential in the request line can land in
reverse-proxy/CDN access logs, browser history, and `Referer` headers — outside the app's
"never log the code" discipline. Issue **#56** asks us to **decide and record** whether the
code stays in the path or moves to a header / POST body, weighing the logging-exposure risk
against REST/UX and the existing consumers.

The path is not a greenfield choice: the **merged frontend** already depends on
`GET /api/bookings/{code}` —
- the U4-FE payment flow (`booking-pay.ts`, issue #50) **polls** it ~20×/30s to await
  webhook-driven confirmation,
- `booking-view.ts` reads it for the view/cancel page,
- the booking-confirmation deep-link (`/booking/:code`) is a bookmarkable path URL.

Moving the code out of the path would be a breaking change across all three.

## Decision

**Keep the booking code in the URL path for v1.** Do **not** move it to a header or POST
body now. Mitigate the logging-exposure residual with:

1. **App-level discipline** — the application never logs the code (invariant #7); it is
   treated as a secret in our own logs.
2. **Rate limiting** (issue #56) — per-IP + per-code throttling on the public booking-code
   endpoints raises the cost of the `200`/`404` confirmation oracle.
3. **Entropy** — ≥40 bits of base32 makes enumeration impractical regardless of transport.

The clean transport fix (move the credential out of URL-based logs entirely) is **bundled
with the real authentication model** that will replace the `SecurityConfig` placeholder
(issue #56 AC-3), not done piecemeal here.

## Consequences

- **Backend-only slice.** The rate-limit hardening (issue #56) lands with no frontend change;
  the merged polling/view/deep-link keep working.
- **Residual exposure remains** at the reverse-proxy / CDN / browser-history / `Referer`
  layer — accepted for v1 (non-prod, dummy data per ADR-0004), to be closed with the auth
  model before real personal data is processed.
- **`X-Forwarded-For` is trusted for per-IP keying** without a trusted-proxy allowlist (single
  Render instance, ADR-0004); a forged header can dodge the per-IP limit. The per-code limit
  and code entropy back it up; a proper proxy-trust config is part of the same auth-model
  follow-up.
- A future implementer must not silently "fix" this by changing the URL contract — that
  breaks the merged FE and belongs with the auth model.

## Alternatives considered

- **Move the code to a request header (e.g. `X-Booking-Code`)** — keeps it out of URL-based
  logs/`Referer`, but breaks the merged FE (polling, view, the bookmarkable deep-link) and
  loses REST-style deep-linking. Rejected for v1; reconsider with the auth model.
- **Hybrid: GET keeps the path, cancel moves the code to the POST body** — only the
  state-changing call is de-pathed; still touches the FE cancel call for a partial reduction.
  Rejected: inconsistent surface for marginal benefit while the path GET (the higher-volume,
  polled endpoint) still carries the code.
