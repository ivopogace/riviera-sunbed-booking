# RateLimitFilter login-path residuals Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a login `413` aborts instead of draining, a numeric login identity keys on its original text,
an unusable charset is "no identity", and no problem body the app writes carries `instance`.

**Architecture:** the drain is turned off in Tomcat itself (`swallowAbortedUploads=false`, a
`TomcatContextCustomizer` in `web`), not in the filter. `instance` is cleared by one MVC
`ErrorResponse.Interceptor` in `web`, which runs after Spring's request-URI auto-fill, so nothing
needs a placeholder.

**Source of intent:** #1409 (triage brief + owner decisions 2026-10-03, relayed by the wave orchestrator).

**Branch:** `bugfix/1409-ratelimit-login-residuals`

## Acceptance criteria

- [x] **AC-1 (item 1):** Given the shipped Tomcat with `max-swallow-size=33MB`, when a login declares a
  32 MiB body and sends a few bytes, then the `413` arrives with `Connection: close` and the server
  closes the connection within 5 s. *Seam:* the HTTP port. *Pinned by:*
  `LoginBodyTooLargeSwallowIT.declaredOversizedLoginBodyGets413AndTheConnectionClosesWithoutDrainingTheBody`
- [ ] **AC-2 (item 2):** pending the owner's connection-timeout decision (the timeout is per read, not a body deadline).
- [x] **AC-3 (item 3):** Given `"username": <n>e2` twice, when `"username": "<n>e2"` follows, then it
  draws on the same bucket (`429`). *Seam:* `RateLimitFilter` through MockMvc. *Pinned by:*
  `RateLimitFilterTest.anExponentNumericUsernameSharesTheBucketOfItsQuotedTextAsTheControllerBindsIt`
- [x] **AC-4 (item 4):** No problem body carries `instance`: advice-built, controller-built, framework-built
  and filter-chain. *Pinned by:* `ReviewControllerTest.theBookingCodeNeverAppearsIn*ErrorBody`,
  `AuthSessionIT`, `CsrfProtectionIT`, `ChallengeVerificationFilterTest`, `RateLimitFilterTest`
  (`perIpOverLimitIs429`, `expectBodyTooLarge`).
- [x] **AC-5 (item 5):** the unused `ApiProblem` import is gone (compile).
- [x] **AC-6 (item 6):** Given a Content-Type without charset and an unusable servlet encoding, the login
  reaches the chain unbudgeted. *Pinned by:* `RateLimitFilterCharsetTest`.

## Non-goals

- The global body cap (#1414), per-principal budgets (#364).

## Risks

- **R-1:** clearing `instance` in `web` leaves a context without `web` echoing the request URI → every
  code-leak test runs a full context or `@WebMvcTest`; disabling the interceptor fails four
  `ReviewControllerTest` cases (checked by hand).
- **R-2:** `swallowAbortedUploads=false` is app-wide: an oversized multipart photo is aborted too, and a
  client still sending may see a reset instead of the `413` body. Measured on loopback (3/3): the client
  read the full `413` before its writes broke. Not measured through Render's proxy. Recorded in the PR.

## Open questions

- Item 2's Javadoc waits on the owner's connection-timeout decision. — *Owner:* the owner, via the orchestrator.

## Phases

- **Phase 0 — item 1:** red `LoginBodyTooLargeSwallowIT` (measured ~60 s hold), then the customizer.
- **Phase 1 — items 3, 5, 6:** red tests, then the streaming read and the widened catch.
- **Phase 2 — item 4:** test assertions flipped to absence, then `ApiProblem`, the controllers, the
  interceptor, `SecurityProblemResponses`, the docs.

## Execution status

- 2026-10-03: phases 0–2 done locally, green on the scoped tests. Item 2 pending.
