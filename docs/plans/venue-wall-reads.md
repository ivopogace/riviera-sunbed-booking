# Venue, remodel, payout and root ITs, and the SNS test PKI, read the context clock (#1842, groups D + E) Implementation Plan

> Test code only. Invariant numbers: `CLAUDE.md`.

**Goal:** with `RIVIERA_TEST_TRAVEL_TO=2038-01-01T10:00:00Z`, the 13 group-D classes (48 tests) and `TemWebhookIT`
(10 tests) are green, and the whole suite is red only on group F (#1854); with the real clock, the suite stays green.

**Architecture:** group D's "today" reads `TiraneDaytimeClock.today(clock)`, stamps `clock.instant()`, seed SQL a bound
`:now`; clock-derived `static final` days become per-test fields set in `@BeforeEach`. Group E: the production verifier
already judges chain and validity on the injected `Clock` (`SnsMessageVerifier`), so `SnsTestPki` mints its
certificates around the clock the contexts read, to the second, through `TestClockTravel.ahead()`; the lifetimes are
unchanged (3650 days; the lapsed cert three days ago to two days ago). `SnsMessageVerifierTest` reads the PKI's clock,
and its literal 2040 expiry probes become "now plus the cert lifetime".

**Source of intent:** #1842 (triage comment, PR order).

**Branch:** `bugfix/venue-wall-reads-1842`

## Acceptance criteria

- [ ] **AC-1:** Given the clock at 2038-01-01T10:00Z, when the 13 group-D classes and `TemWebhookIT` run, then the 58
  tests red on `main` are green. *Seam:* the context `Clock` moved by `TestClockTravel` · *Pinned by:* those classes.
- [ ] **AC-2:** Given the clock at 2038, when the whole suite runs, then the only red is group F
  (`GuestContactRetentionIT`, #1854). *Seam:* same · *Pinned by:* the suite in package batches.
- [ ] **AC-3:** Given the real clock, the touched classes, `SnsMessageVerifierTest` and the rest of the suite are green;
  the expiry, lapsed-cert and rogue-signer refusals still fail for their own reason. *Pinned by:*
  `SnsMessageVerifierTest`, `TemWebhookIT`.
- [ ] **AC-4:** No file under `platform/src/main` in the diff.

## Non-goals

- Group F (#1854), section 1's writers, #1846's residue, sections 3 and 4: later on #1842.

## Risks

- **R-1:** a longer-lived or skipped-validity cert would hide the expiry path → lifetimes unchanged, valid certs start
  one day before the clock's now (a frozen context clock never precedes them), the expiry probe is now + lifetime.
- **R-2:** `SnsMessageVerifierTest`'s literal `2040-01-01` expiry probe flips once now + 3650 days passes 2040
  (from 2030) → relative to the PKI's clock.
- **R-3:** renaming `DAY` to `day` shadows a method's own `day` parameter → checked: those bodies read their parameter.
- **R-4:** an untyped `:now` in `CASE … ELSE` → cast.

## Phases

- **Phase 0 — group D and the SNS test PKI read the clock:** red = the 58 tests at 2038 on `main`.

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** open the draft PR; finish the whole suite at 2038 and with no travel.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — D + E read the clock | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
