# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

It is the **canonical source** for the bounded-context list and the numbered
cross-cutting invariants the `riviera-*` skills reference ("invariant #2" means
the list below). Keep it short and stable: rules and structure live here;
per-module contracts and history live in `RESPONSIBILITIES.md`; situational
guidance lives in the skills.

## What this is

A two-sided marketplace: tourists pre-book a sunbed **set** (2 loungers +
umbrella, full day) at an Albanian-riviera venue, pick the exact spot from a
visual beach map, and pay in-app; the platform takes a per-booking commission
and pays venues out manually. The full stack is built and deployed, served
same-origin (Spring bundles the Angular SPA) at
riviera-sunbed-booking.onrender.com. Product spec: `docs/superpowers/specs/`;
visual design (Liquid Glass): `docs/design/`; current work: the issue tracker.

## Tech stack (locked)

- **Frontend:** Angular 22 (responsive web; native apps deferred), Tailwind 4
  (SCSS retiring), signals, standalone components. Unit tests are Vitest in
  jsdom (not Karma); e2e is Playwright.
- **Backend:** Spring Boot 4 REST API on Java 25, a **Spring Modulith** with
  hexagonal (ports/adapters) modules. No Lombok.
- **Persistence:** PostgreSQL via **Spring Data JDBC / `JdbcTemplate` only**
  (invariant #1); schema changes via Flyway (invariant #12).
- **Payments:** Stripe, collection only, behind a payment-gateway interface
  (`riviera-stripe-payments`).
- **Build:** Gradle wrapper for the backend; npm scripts for the frontend.

## Commands

Requires **JDK 25**, **Node 26** (`.nvmrc`), and **Docker** for the backend
Testcontainers ITs (they skip cleanly without a daemon). In a Claude Code cloud
session, load **`riviera-local-debug`** before the first `./gradlew`/`npm` —
the wrapper cannot self-provision there and the full test task can OOM the sandbox.

**Backend** (from `platform/`):

```bash
./gradlew build                        # compile + full test suite + JaCoCo
./gradlew test --tests "*ClassName*"   # one test class
./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" \
  --tests "*PackageShapeArchitectureTests*"   # the structural net — run after any backend structure change
./gradlew bootRun                      # run the API on :8080
```

**Frontend** (from `frontend/`):

```bash
npm ci
npm start                # dev server on :4200
npm run lint             # ESLint (type-aware presets)
npm run format:check     # Prettier over frontend/src + frontend/e2e (`npm run format` to apply)
npm test                 # Vitest unit tests, runs once in jsdom
npm run test:a11y        # axe + contrast unit specs only
npm run test:e2e         # Playwright — local-only REAL-backend suite (frontend/e2e/real-backend/)
npm run test:e2e:a11y    # Playwright — the CI-safe mocked suite (frontend/e2e/); what CI runs
npm run build
```

**CI/CD** (`.github/workflows/`): `ci.yml` runs the backend build/test, the
frontend lint/format/test/build + mocked e2e, five hygiene checks under
`scripts/check-*.mjs` (four diff-scoped — inline comments, plan-doc file
structure, focus posture, touch-target declaration, most with a local
`PostToolUse` half; the plan-doc one also judges untracked paths, #654 — plus
the standing-tree cloud Node pin, whose mirror is
`docs/agents/cloud-environment.md`), and a SonarCloud scan per PR. The Sonar merge bar is
stricter than the default gate: **0 new issues, 0 duplicated blocks, ≥80%
new-code coverage** — review the issue list, not just the pass/fail
(`riviera-sdlc` enforces this). `codeql.yml` scans; `deploy.yml` deploys the
single backend image (which serves the SPA) to Render from `main`
(Render + Neon, ADR-0004; see `docs/deploy/`). Line endings are pinned LF by
the root `.gitattributes`.

## Repo map

- `platform/` — the Spring Boot backend. Base package **`ai.riviera.platform`**;
  one package per module below. Flyway: `platform/src/main/resources/db/migration`.
- `frontend/` — the Angular app. Folder taxonomy and import rules are
  `riviera-frontend`'s call; Angular idioms live in `frontend/.claude/CLAUDE.md`
  (loads automatically for frontend work).
- `frontend/e2e/` — the CI-safe mocked Playwright suite;
  `frontend/e2e/real-backend/` — the local-only real-backend suite.
- `docs/` — `architecture/`, `adr/` (decisions), `design/`, `plans/` (per-slice
  plan docs), `research/` (findings behind decisions), `agents/` (issue-tracker
  conventions + runbooks), `deploy/` + `runbooks/`, `superpowers/specs/` (product design).

## Bounded contexts (Spring Modulith modules)

Each module lives at `ai.riviera.platform.<module>` with the hexagonal layout in
invariant #11. **Read the module's § in `RESPONSIBILITIES.md` before changing
it** — that file holds the per-module contracts, settled rules, and history.

| Module | Owns | Aggregate root(s) |
|---|---|---|
| `venue` | venue profiles, beach map/layout, set positions, pool assignment, pricing, booking mode (Instant/Request), amenities, the per-venue sales-close setting, venue photos + platform-admin photo moderation (ADR-0008, ADR-0013), the effective-dated commission-rate schedule | `Venue`, `BeachMap` |
| `availability` | the per-`(set, date)` source-of-truth state (free / booked-online / staff-marked); the only writer of that table | `SetAvailability` |
| `booking` | bookings, booking codes, the full lifecycle (incl. guest withdraw, staff check-in, the no-show sweep), request accept/decline + expiry sweep, cancellation-policy enforcement, driving the post-commit cancellation refund via `payment.api.RefundPort` | `Booking` |
| `payment` | Stripe collection, PaymentIntents, refunds, webhook handling | `Payment` |
| `payout` | the venue payout ledger (bookings − commission), manual BKT batch reporting; accrual/reversal is order-independent and idempotent | `PayoutLedgerEntry`, `PayoutBatch` |
| `customer` | tourist identity: guest-checkout contact, the customer account (register/sign-in, SSO linkage, email verification, password recovery/set), GDPR erasure (ADR-0010) + the retention sweep, and the canonical email form (`customer.vocabulary.Emails`) | `Customer`, `CustomerAccount` |
| `operator` | operator accounts, the operator↔venue ownership mapping (invariant #13), the admin-driven lifecycle (`PENDING`→`ACTIVE`⇄`SUSPENDED`), the `is_admin` flag, the tourist-visibility answer (a venue is visible iff its owner is `ACTIVE`, fail-closed for unowned — #693; `venue` fences its catalogue reads, `booking` its reserve paths) | `Operator` |
| `review` | the review record (stars, comment, display name — one per booking), the eligibility + 60-day review-window policy, the author's own submit/edit/delete lifecycle inside that window, the aggregate rating math (integer tenths, half-up). A **leaf** module: eligibility arrives through `review.spi.CompletedStays` (implemented by `booking`) and the recomputed aggregate leaves as `ReviewsChanged` — ADR-0015 | `Review` |
| `notification` | transactional mail: both ADR-0011 delivery vehicles (Event Publication Registry for ids-only payloads, bounded in-memory dispatcher for bearer-credential ones) on their own bounded executors, the hashed email-suppression list (ADR-0012), the delivery log + admin resend/re-drive | (none — owns mail state, no aggregate yet) |

Plus one **non-context** module: **`shared`**, an OPEN Shared Kernel of
edge/technical types (`ApiProblem`, `CurrentOperator`, `CurrentCustomer`,
`InvalidApiRequestException`, …). Modules depend on `shared`, the root depends
on modules, nothing depends on the root. Admission rests on **ownership, never
reuse**; the bar and per-type grounds are `RESPONSIBILITIES.md` §`shared`.

Cross-module collaboration is **events for state changes, `api/` ports for
queries** (invariant #11). The availability write happens synchronously at
claim time via `availability`'s `AvailabilityClaim` port — `availability` has
no event listener. Six published events: `BookingConfirmed` and
`BookingCancelled` fan out to `payout` and `notification` (and `booking`'s own
`BookingCancelled` listener drives the refund); `BookingPaymentDue`,
`BookingRequestDeclined`, and `BookingRequestExpired` go to `notification`
only; `ReviewsChanged` goes to `venue`, whose listener recomputes its own
rating columns. Publication-site rationale: `RESPONSIBILITIES.md`.

Settled platform-edge rules (detail: `RESPONSIBILITIES.md` + `docs/plans/`):
server-side sessions (Spring Session JDBC) with **two principal types**; all
login/session machinery lives at the edge, never in modules (RV-BE-11);
customer-account identity is separate from the guest row — no FK, no
back-linking of past guest bookings, ever (D-6); auth endpoints are
non-enumerating + constant-time on their own rate-limit buckets (D-8); mocked
externals (SSO IdPs, mailer) are profile-guarded out of prod; session
revocation is edge-orchestrated and synchronous, bracketing the state change.

## Cross-cutting invariants

The rules every plan, implementation, and review checks. Skills reference them
by number — the numbering is stable; never renumber.

1. **No JPA/Hibernate — JDBC only.** `spring-boot-starter-data-jpa` never on the
   classpath; no `@Entity`/`EntityManager`. Spring Data JDBC aggregates and/or
   `JdbcTemplate` with explicit SQL. The project's defining backend decision.
2. **Availability is the single source of truth, per `(set, date)`.** Every
   channel — online booking and staff tap-to-mark — writes the same
   `availability(set_id, booking_date)` row; a set is held by at most one party
   per date. Enforced in the database (unique constraint) AND in the
   reservation transaction (`SELECT … FOR UPDATE` or an atomic
   `INSERT … ON CONFLICT DO NOTHING` claim). The #1 correctness invariant:
   never double-sell a set.
3. **Online and walk-in pools are separate.** Each set carries a pool flag; an
   online booking can only target an online-pool set.
4. **Sales close is venue-controlled, on the day itself.** A date D's online sales
   window runs until the venue's `sales_close` wall-clock time on D — a per-venue
   setting fixed at one of three values (`00:01` opts the venue out of same-day
   sales, `16:00` the default, or `23:59`), `Europe/Tirane`. A pending request's
   response deadline is capped at that same close (`min(created + expiry-window,
   D at sales close)`). Cancellation keeps its own, separate evening-before
   boundary (default 18:00 `Europe/Tirane`, configurable) — the two are no longer
   the same fence. The pay path fences on **the pay deadline having passed**: an
   accepted `AWAITING_PAYMENT` booking's deadline is `min(accepted_at +
   pay-window, end of service day D)` (never past D's end, 00:00 `Europe/Tirane`
   of D+1), a never-accepted one's is D's end with the sweep's TTL as the earlier
   backstop; the abandoned sweep expires a booking once its deadline has passed,
   and the code-gated view issues no payment credentials past it. The confirm
   path is deliberately NOT fenced — a payment in flight at the deadline still
   confirms; read `RESPONSIBILITIES.md` §`booking` before treating a late
   confirm as a bug.
5. **Money is integer minor units, never floating point.** `long`/`int` cents
   with an explicit ISO currency code; exact-integer commission/payout
   arithmetic; rounding rules written down at any division. v1 collection
   currency is **EUR**.
6. **Time: store UTC `Instant`, reason in `Europe/Tirane`.** A "booking date" is
   a `LocalDate` in `Europe/Tirane`. Never rely on the JVM default timezone.
7. **Booking codes are unguessable bearer credentials.** ≥ 8 random base32
   chars, never sequential, treated like a secret in logs.
8. **Stripe webhooks are the source of truth for payment state — not the
   client.** Never confirm a booking from a client-side redirect; reconcile
   from signature-verified webhooks; idempotency keys on charge/refund
   creation; collection-only, no Stripe Connect (`riviera-stripe-payments`).
9. **The payout ledger is auditable and idempotent.** A booking contributes to
   a venue's payout exactly once; refunds reverse it. Payout = Σ(booking
   amounts) − commission (rate stored per venue, effective-dated,
   forward-only). Payouts settle manually via BKT; the ledger is the record.
10. **Cancellation/refund policy is enforced server-side.** Free cancellation
    until the #4 cutoff → full refund; after → non-refundable (or partial);
    the window closes entirely at service-day open (00:00 `Europe/Tirane`) — a
    guest cancel is then refused, not refunded (ADR-0005 as amended). The
    weather exception is a manual admin-triggered full refund, deliberately
    outside that fence. Refund decisions are computed on the server.
11. **Spring Modulith boundaries are hexagonal and id-based.** The ADR-0007
    graduated shape: a full module is `{api?, spi?, vocabulary?, events?,
    application, domain, adapter/in, adapter/out}`; a thin module is
    `{api, vocabulary?, adapter/out}`. No `application/in|out` split, no
    `infrastructure/*`. Published surface split by kind: `api/` ports only,
    `vocabulary/` typed ids/values/outcomes, `events/` domain-event records;
    a cross-module *driven* port lives in `spi/`, granted only to its
    implementing module. Cross-module access is via another module's `api/`
    port or a domain event — never its `application.*`/`adapter.*`/`domain.*`.
    Event payloads carry technical ids, not business fields. Machine-locked by
    `PackageShapeArchitectureTests` +
    `PublishedSurfacePlacementArchitectureTests`; details: ADR-0007 +
    `riviera-modulith`.
12. **Schema changes go through Flyway.** Versioned forward migrations only; no
    hand-run DDL. Every constraint enforcing an invariant (especially #2) is
    created and tested by a migration.
13. **Venue-scoped operations verify the actor owns the venue.** Object-level,
    not role-level (OWASP API #1 BOLA): the `OPERATOR` role is necessary, never
    sufficient. Every `/api/venues/{venueId}/**` operation verifies the
    authenticated operator owns the path `venueId` and rejects a mismatch with
    `403` — in the **application service**, so no driving adapter can bypass
    it; ownership is consulted via `operator`'s `api/` port. Platform-wide
    `/api/admin/**` surfaces are role-gated and exempt. Reviewed as RV-BE-9.

## Provisional decisions

- **Venue payout currency:** EUR vs ALL, per venue, converted outside the app
  at BKT payout time. (Collection currency is not provisional — EUR, invariant #5.)

## Project skills (`.claude/skills/`)

Each skill's frontmatter description is the authoritative "when to load"; the
map: **`riviera-sdlc`** routes all feature work (start there) →
`riviera-plan-doc` (plans), `riviera-review-overlay` (reviews),
`riviera-modulith` + `riviera-java-conventions` (backend), `riviera-frontend` +
`riviera-tailwind` (frontend), `riviera-stripe-payments` (payments/commission),
`riviera-local-debug` (before the session's first build/test),
`riviera-docs-freshness` (merge/epic close-out), `postgres` (migrations),
`playwright-cli` (e2e). The vendored craft skills (`tdd`, `grilling`,
`diagnosing-bugs`, …) are the generic engine the `riviera-*` skills specialize;
vendored ones are tracked in `skills-lock.json`.

## Where things are written down

- **Issue tracker / triage labels / runbooks:** `docs/agents/`.
- **Domain glossary:** `CONTEXT.md`. **Module responsibilities + settled rules:**
  `RESPONSIBILITIES.md`.
- **Decisions:** `docs/adr/`. **Roadmap:** `docs/architecture/improvement-plan.md`.

## Searching the codebase

**An empty search result is not evidence of absence.** Search tools honour
`.gitignore`, and `platform/.gitignore` ignores `out/` — also the name of every
hexagonal `adapter/out` package. Confirm any negative with
`git ls-files '*/adapter/out/*.java'` before concluding a class doesn't exist.
