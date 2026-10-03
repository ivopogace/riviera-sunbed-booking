# Request-body cap for `/api/**` Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** every POST/PUT/PATCH body under `/api/**` is capped at 64 KiB (the layout writes at
256 KiB, the Stripe webhook at 1 MiB, multipart exempt, login on its own 8 KiB rule) and a larger one is refused `413` before
CSRF and the proof-of-work claim.

**Architecture:** one `OncePerRequestFilter` in `web`'s API chain, registered right after
`RateLimitFilter`. A declared length past the cap is refused unread; an unknown length is read to
cap + 1 and replayed; a declared length within the cap passes unread (the container ends the stream
at it). Login is exempt only while `RateLimitFilter` caps it, so a body is never read twice.

**Source of intent:** #1414 (triage brief + re-check comment; owner decisions relayed by the wave
orchestrator).

**Branch:** `feature/request-body-cap`

## Acceptance criteria

- [ ] **AC-1:** Given a 65 KiB JSON `POST /api/bookings` carrying a solved challenge, when sent,
  then `413 PAYLOAD_TOO_LARGE` without `instance`, and `ProofOfWorkChallenges.verify` is never
  called. *Seam:* the API chain · *Pinned by:* `RequestBodyCapFilterTest`
- [ ] **AC-2:** Given a 63 KiB JSON booking create, when sent, then it reaches the controller.
  *Seam:* the API chain · *Pinned by:* `RequestBodyCapFilterTest`
- [ ] **AC-3:** Given a chunked JSON body past 64 KiB, then `413`; within it, the controller binds
  the replayed body. *Seam:* the API chain over MockMvc and over Tomcat · *Pinned by:*
  `RequestBodyCapFilterTest`, `RequestBodyCapIT`
- [ ] **AC-4:** Given a 2 MB multipart photo upload, then no `413` from the cap. *Pinned by:*
  `RequestBodyCapFilterTest`
- [ ] **AC-5:** Given a Stripe webhook body of 100 KiB, then it reaches the controller; past
  1 MiB, `413`. *Pinned by:* `RequestBodyCapFilterTest`
- [ ] **AC-6:** Chain order: an oversized fenced create without a challenge gets `413`, not
  `400 CHALLENGE_REQUIRED`; an oversized CSRF-guarded POST without a token gets `413`, not `403`.
  *Pinned by:* `RequestBodyCapFilterTest`
- [ ] **AC-7:** Login: with the rate limiter on, its 8 KiB rule answers (no second read); with it
  off, the 64 KiB cap applies. *Pinned by:* `RateLimitFilterTest` (existing),
  `RequestBodyCapFilterTest`, `RateLimitDisabledTest`

## Non-goals

Connector-level settings; per-endpoint caps; changing the login cap; slow-drip bodies under the cap
(#1439); setting `Connection: close` by hand (`OversizedBodyConfig` aborts after any 413).

## Risks

- **R-1:** a replayed body loses form parameters → only an unknown-length body is wrapped, and no
  `/api/**` endpoint binds a form body.
- **R-2:** a test in the shared web-slice context trips the per-IP limiter → unique client IP per
  request (`SessionLoginSupport.uniqueClientIp()`).
- **R-3:** the 413 body logs a booking code → never log the path.

## Phases

- **Phase 0 — cap + order:** the filter, its registration, the shared 413 body · red
  `RequestBodyCapFilterTest`
- **Phase 1 — Tomcat proof + docs:** `RequestBodyCapIT`; RESPONSIBILITIES.md §`web` + §Platform edge.

## Execution status

- [x] Phase 0 — filter, order, shared 413 body (`RequestBodyCapFilterTest`)
- [x] Phase 1 — `RequestBodyCapIT` (2/2 on Tomcat); RESPONSIBILITIES.md §`web` + §Platform edge
- [x] Owner decision (2026-10-03): 256 KiB for the three layout writes; pinned at a 1040-set layout
  (~223 KB, two-byte labels) and one past 256 KiB
- [ ] Review gate (high) · Sonar · plan removed
