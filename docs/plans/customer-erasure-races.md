# Customer account writes serialize with erasure Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** no SSO identity, recovery token or password lands on an erased customer account; at most one reset
link is live; a lost first SSO sign-in leaves no stray account.

**Architecture:** every account-scoped write takes the live account row first, in a statement of its own
(`CustomerAccountStore#lockLiveAccount`, `FOR NO KEY UPDATE`), the order erasure and token redemption already
take (#1305). A missing row means erased. To make that lock reachable between SSO's find-or-create and its
identity insert, the SSO resolution moves from one adapter method into `CustomerAccountService`, over store
steps. Each step is a pause point for the race ITs.

**Source of intent:** #1307 (sweep for #1298). The password change on an erased account and a reset or verify
link redeemed after erasure were fixed by #1315 and #1316.

**Branch:** `bugfix/customer-erasure-races`

## Acceptance criteria

- [ ] **AC-1 (SSO link after erasure):** Given a first SSO sign-in that found account A by email and is
  waiting on its identity insert, when A's erasure runs, then no identity for A survives the erasure.
  *Seam:* `SsoAccountProvisioning.resolveOrCreate` racing `AccountErasure.eraseAccount` · *Pinned by:*
  `CustomerErasureRaceIT.anSsoIdentityNeverOutlivesItsAccountsErasure` (red on `main`: the identity survives).
- [ ] **AC-2 (SSO re-resolves):** Given a first SSO sign-in paused after finding A by email, when A's erasure
  commits, then the sign-in links a fresh live account under that email. *Pinned by:*
  `CustomerErasureRaceIT.anSsoSignInWhoseAccountWasErasedMeanwhileGetsAFreshAccount`.
- [ ] **AC-3 (stale identity):** Given an identity whose account is erased (left by the old race), when its
  subject signs in, then it resolves to a fresh live account and the identity moves to it. *Pinned by:*
  `CustomerErasureRaceIT.anIdentityOfAnErasedAccountIsAdoptedByAFreshOne` (red on `main`: resolves to the
  erased account).
- [ ] **AC-4 (token after erasure):** Given an erasure paused after its tombstone, when a reset token is
  issued for that account, then it is never stored and the issue answers "not issued". *Seam:*
  `CustomerAccountRecovery.issuePasswordResetToken` · *Pinned by:*
  `CustomerErasureRaceIT.aTokenIssuedDuringAnErasureIsNeverStored` (red on `main`).
- [ ] **AC-5 (one live link):** Given a reset issue paused after its insert, when a second issue for the same
  account runs, then exactly one reset token is live, the second's. *Pinned by:*
  `CustomerErasureRaceIT.twoConcurrentResetIssuesLeaveOneLiveLink` (red on `main`: two live).
- [ ] **AC-6 (reset retires the rest):** Given two live reset tokens of one account, when one is redeemed,
  then the other is consumed. *Pinned by:* `CustomerAccountRecoveryIT.aResetRetiresTheAccountsOtherResetLinks`.
- [ ] **AC-7 (no stray):** Given two first SSO sign-ins with one subject and different emails, both waiting on
  a third's identity insert, when it commits, then both resolve to its account and neither leaves an account
  behind. *Pinned by:* `CustomerErasureRaceIT.concurrentFirstSignInsOfOneSubjectLeaveNoStrayAccount`.
- [ ] **AC-8 (guards):** `updatePasswordHash` and `markEmailVerified` write nothing to an erased account.
  *Pinned by:* `JdbcCustomerAccountsIT`.
- [ ] **AC-9:** the recovery, SSO, erasure and lock-order suites and the structural net stay green.

## Non-goals

- Where the auth classes live (#1317).
- Any change to what a guest or operator sees: an erased account's request answers exactly as an unknown one.

## Risks

- **R-1 (a new cycle):** each new lock is checked against every writer of the account row and its children.
  - Erasure: the account `UPDATE` (a `FOR UPDATE`, `email` is unique), then identities, then tokens.
  - Redemption: the account, then the token.
  - Issue: the account, then its tokens, then the insert (a key-share check, compatible with our own lock).
  - SSO: the account, then the identity insert, which may wait on a concurrent insert of the same subject.
    That sign-in holds only its own account, so no cycle.
- **R-2 (unbounded retry):** re-resolving after an erasure is a bounded loop. Each turn needs another erasure to
  commit, so the bound only ends a pathological run.
- **R-3 (D-8 non-enumeration):** an issue refused for an erased account sends no mail. The mail is off-thread,
  so the answer's timing is unchanged.
- **R-4 (Flyway):** `V73` deletes identities and tokens left on erased accounts. It is free on `main` and
  claimed by no open PR.

## Modulith

- `CustomerAccountRecovery#issueEmailVerificationToken` / `#issuePasswordResetToken` answer whether a token
  was stored. The only consumer is the edge's `CustomerRecovery`, which mails only then. No new port or grant.
- The store's SSO steps are `customer`-internal (`CustomerAccountStore`).

## Phases

- **Phase 0 — split:** SSO resolution moves into the service over store steps, no behaviour change;
  `CustomerAccountServiceTest` and `JdbcCustomerAccountsIT` stay green.
- **Phase 1 — red:** the `CustomerErasureRaceIT` cases, the reset-retire IT and the guard ITs.
- **Phase 2 — SSO:** AC-1, AC-2, AC-3, AC-7.
- **Phase 3 — tokens:** AC-4, AC-5, AC-6.
- **Phase 4 — guards and cleanup:** AC-8, `V73`.
- **Phase 5 — docs:** `RESPONSIBILITIES.md` §customer and Javadoc.

## Execution status

**Stage pointer:** plan

**Next action:** phase 0.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — split | | |
| 1 — red | | |
| 2 — SSO | | |
| 3 — tokens | | |
| 4 — guards | | |
| 5 — docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
