# Forgot-password constant-time Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** `POST /api/auth/customer/forgot-password` does exactly one read (the account lookup) on the
request thread for a known and an unknown email alike; reset-token minting, hashing, storing and the
mail all run on `notification`'s recovery dispatcher.

**Architecture:** `MailSender#sendPasswordReset` takes a deferred link (`Supplier<Optional<URI>>`)
instead of a ready `URI`. `notification` resolves it inside the dispatched task, after the
suppression check and before the send; `auth`'s supplier mints the token and calls
`CustomerAccountRecovery#issuePasswordResetToken`, whose `@Transactional` proxy opens its own
transaction on the drainer thread. Issue option 1, chosen by the user.

**Source of intent:** #1336

**Branch:** `bugfix/forgot-password-constant-time`

## Acceptance criteria

- [x] **AC-1:** Given a known email, when forgot-password is requested, then the request thread reads
  the account once and touches `CustomerAccountRecovery` not at all; the token is issued only when
  the dispatched task runs. *Seam:* `AccountRecoveryController` over `CustomerAccountDirectory` +
  a recording `MailSender` · *Pinned by:* `ForgotPasswordRequestThreadTest`
- [x] **AC-2:** Given an unknown email, when forgot-password is requested, then the request thread
  reads once, dispatches nothing, and answers the same `204` with an empty body as AC-1. *Seam:* as
  AC-1 · *Pinned by:* `ForgotPasswordRequestThreadTest`
- [x] **AC-3:** Given the deferred link runs, then it mints a fresh raw token, stores only its hash
  with `now + resetTokenTtl`, and yields the `/account/reset?token=` link; an erased account yields
  empty. *Seam:* `CustomerRecovery#sendPasswordResetEmail` → `MailSender` · *Pinned by:*
  `CustomerRecoveryTest`
- [x] **AC-4:** Given the dispatched reset task, when the address is suppressed then no token is
  issued; when the link is empty then nothing is sent; when issuance throws then the loss is counted
  as `reason=token-issuance` and logged without the address or the token. *Seam:*
  `TransactionalMailService` (`MailSender`) · *Pinned by:* `TransactionalMailServiceTest`
- [x] **AC-5:** Given a dispatcher that runs the task on another thread, when forgot-password is
  requested twice for one account, then only the second link redeems (superseded, single-use,
  stored hashed) — the transaction holds off the request thread. *Seam:* the HTTP routes against
  Postgres · *Pinned by:* `OffThreadResetIssuanceIT`

## Non-goals

- The verification mail keeps issuing on the caller's thread: register's fresh branch already writes
  the account and sets a session cookie (an accepted residual signal), and the resend is authenticated.
- The PoW fence and the recovery rate-limit bucket are unchanged.

## Risks

- **R-1:** A saturated or shutting-down dispatcher now drops the token with the mail → no orphan
  token; the user re-requests (recovery kinds self-heal, ADR-0011 decision 5). Counted as today.
- **R-2:** The issuance's `FOR NO KEY UPDATE` waits on a concurrent erasure/reset of the same row on the single drainer → `@Transactional(timeout)` on `issuePasswordResetToken` bounds it (review finding; pinned by `CustomerAccountRecoveryIT`).
- **R-3:** A failure log carrying the raw token or address (#7) → the catch logs only kind, reason
  and exception class, pinned by AC-4.

## Modulith

No new port or grant: `auth` already calls `notification::api` and `customer::api`. `MailSender`'s
reset method changes shape (JDK `Supplier`, no new published type). `notification` never sees
`customer`: the supplier is `auth`'s closure.

## Phases

- **Phase 1 — deferred reset link on `MailSender`:** AC-3, AC-4 · red `CustomerRecoveryTest`,
  `TransactionalMailServiceTest`
- **Phase 2 — request-thread proof:** AC-1, AC-2 · red `ForgotPasswordRequestThreadTest`
- **Phase 3 — off-thread transaction IT + docs:** AC-5; `CustomerRecovery` Javadoc,
  `RESPONSIBILITIES.md` §notification/§Platform edge.

## Execution status

- Phase 1: done (deferred reset link on `MailSender`; `CustomerRecoveryTest`, `TransactionalMailServiceTest` green)
- Phase 2: done (`ForgotPasswordRequestThreadTest` green; red against on-thread issuance)
- Phase 3: done (`OffThreadResetIssuanceIT` green on the real dispatcher; Javadoc, RESPONSIBILITIES, runbook)
- Review: 1 finding (unbounded issuance on the drainer) fixed with a transaction timeout; MailSender header + runbook wording
- Next: CI green → Sonar gate → delete plan → READY TO MERGE
