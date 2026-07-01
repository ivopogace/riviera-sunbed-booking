<!--
Riviera SDLC PR template. Fill what applies; mark the rest N/A — don't delete sections.
The invariant checklist mirrors the plan-doc self-review subset that the review gate
checks. "Green CI" is necessary, not sufficient — the review gate must have run.
-->

## What & why

<!-- One or two sentences. What slice is this and what does it deliver? -->

Closes #<!-- issue --> · Plan: `docs/plans/<slug>.md`

## Acceptance criteria → tests

<!-- Every AC from the issue/plan, each with the test class that proves it.
     An AC with no passing test is not done. -->

- [ ] **AC-1:** <given/when/then> — pinned by `<TestClass.method>`
- [ ] **AC-2:** …

## Invariant checklist (CLAUDE.md)

<!-- Tick what applies; N/A the rest with a reason. These are the cross-cutting
     gates the review overlay walks; an unticked applicable box blocks merge. -->

- [ ] **#1 JDBC only** — no `spring-boot-starter-data-jpa`, no `@Entity`/`EntityManager`.
- [ ] **#2 Availability single source of truth** — `(set,date)` writes go through the
  `availability` module; unique constraint + atomic claim; a concurrency test proves
  two simultaneous claims can't both win. *(or N/A — no availability/booking/map change)*
- [ ] **#3/#4 Pool + cutoff** — online claims target ONLINE-pool sets; same-day booking
  closed at the evening-before cutoff. *(or N/A)*
- [ ] **#5 Money** — integer minor units + ISO currency; no floating point. *(or N/A)*
- [ ] **#6 Time** — store UTC `Instant`; reason/cut off in `Europe/Tirane`; `TIMESTAMPTZ`,
  `booking_date` as `DATE`. *(or N/A)*
- [ ] **#7 Booking codes** — unguessable, non-sequential, never logged in clear. *(or N/A)*
- [ ] **#8 Payments** — confirm only on a signature-verified Stripe webhook (never the
  client redirect); idempotency keys; collect-only, no Connect. *(or N/A)*
- [ ] **#9 Payout ledger** — exactly-once accrual, reversal on refund; auditable. *(or N/A)*
- [ ] **#10 Refunds** — policy computed server-side. *(or N/A)*
- [ ] **#11 Modulith boundaries** — cross-module only via `api/` ports or id-based events;
  no internal imports; `ApplicationModules.verify()` passes.
- [ ] **#12 Flyway** — schema changes are versioned forward migrations; invariant-enforcing
  constraints are tested. *(or N/A)*

## Gates

- [ ] CI is green (build + tests + scans).
- [ ] Tests run for real (Testcontainers ITs **not** skipped — `skipped=0`).
- [ ] **SDLC review gate run** (`riviera-review-overlay` + `/code-review` on the diff);
  findings resolved or deferred with a follow-up issue.
- [ ] **Skills consulted** line in the plan doc covers every area the diff touches
  (`postgres` for migrations, `codebase-design` for module seams, `angular-developer` +
  angular-cli MCP for FE, `riviera-stripe-payments` for money).

## Scope notes

<!-- Anything intentionally deferred / out of scope, with where it lands. -->
