# ADR-0006: The booking code stays in the URL path (v1)

- **Status:** Accepted
- **Date:** 2026-06-30

## Context

The booking **code** is an unguessable bearer credential (invariant #7). Public, unauthenticated
endpoints are keyed solely on it, with the code carried as a **path variable**:
`GET /api/bookings/{code}` (detail + server-computed refund terms) and the `cancel`, `withdraw`
and `review` verbs beneath it. A credential in the request line can land in reverse-proxy/CDN
access logs, browser history, and `Referer` headers — outside the app's "never log the code"
discipline. Issue #56 asked whether the code stays in the path or moves to a header / POST body.

The path is not a greenfield choice: the frontend depends on `GET /api/bookings/{code}` — the
payment flow **polls** it (~20×/30s) to await webhook-driven confirmation, the view/cancel page
reads it, and the booking-confirmation deep-link (`/booking/:code`) is a bookmarkable path URL.

## Decision

**Keep the booking code in the URL path for v1.** Do **not** move it to a header or POST body.
Mitigate the logging-exposure residual with:

1. **App-level discipline** — the application never logs the code (invariant #7) and never
   echoes it in an error body.
2. **Rate limiting** — per-IP + per-code throttling on the public booking-code endpoints raises
   the cost of the `200`/`404` confirmation oracle. Per-IP keying uses `ClientIpResolver`: the
   `X-Forwarded-For` walk is honored only when the socket peer is a trusted proxy
   (`riviera.ratelimit.trusted-proxies`), and behind a trusted peer the resolver prefers a
   configurable edge-supplied client-IP header (`riviera.ratelimit.client-ip-header`, shipped
   `CF-Connecting-IP`), because `*.onrender.com` is Cloudflare-fronted and the hop Render appends
   is a per-request-varying edge node, not the client. From any other peer the header is ignored.
3. **Entropy** — ≥40 bits of base32 makes enumeration impractical regardless of transport.

The clean transport fix (move the credential out of URL-based logs entirely) is bundled with a
future authentication model for the guest flow, not done piecemeal.

## Consequences

- **Residual exposure remains** at the reverse-proxy / CDN / browser-history / `Referer` layer —
  accepted for v1, to be closed with the auth model before real personal data is processed.
- A future implementer must not silently "fix" this by changing the URL contract — that breaks
  the frontend's polling, view and deep-link, and belongs with the auth model.

## Alternatives considered

- **Move the code to a request header (e.g. `X-Booking-Code`)** — keeps it out of URL-based
  logs/`Referer`, but breaks the merged frontend and loses REST-style deep-linking. Rejected for
  v1; reconsider with the auth model.
- **Hybrid: GET keeps the path, cancel moves the code to the POST body** — only the
  state-changing call is de-pathed. Rejected: inconsistent surface for marginal benefit while
  the path GET (the higher-volume, polled endpoint) still carries the code.

## Amendment log

- 2026-07-22, #129 — trusted-proxy CIDR list for the `X-Forwarded-For` walk, closing the
  forged-header bypass on every per-IP dimension.
- 2026-07-22, #286 — the edge-supplied client-IP header preferred behind a trusted peer.
