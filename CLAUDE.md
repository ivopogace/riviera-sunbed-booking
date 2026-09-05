# CLAUDE.md

Guidance for Claude Code in this repository. Canonical for the module list and the numbered
cross-cutting invariants the `riviera-*` skills cite ("invariant #2" means the list below).
Every rule's long form is in `RESPONSIBILITIES.md`; situational guidance lives in the skills.

## What this is

A two-sided marketplace: tourists pre-book a sunbed **set** (2 loungers + umbrella, full
day) at an Albanian-riviera venue, pick the exact spot on a visual beach map, and pay
in-app; the platform takes a per-booking commission and pays venues out manually. Spring
serves the Angular SPA same-origin at riviera-sunbed-booking.onrender.com. Product spec:
`docs/superpowers/specs/`; visual design (Liquid Glass): `docs/design/`; current work: the
issue tracker.

## Tech stack (locked)

- **Frontend:** Angular 22 (responsive web), Tailwind 4 (SCSS retired), signals, standalone
  components. Unit tests are Vitest in jsdom (not Karma); e2e is Playwright.
- **Backend:** Spring Boot 4 REST API on Java 25, a **Spring Modulith** of hexagonal
  (ports/adapters) modules. No Lombok.
- **Persistence:** PostgreSQL via **Spring Data JDBC / `JdbcTemplate` only** (invariant #1);
  schema changes via Flyway (invariant #12).
- **Payments:** Stripe, collection only, behind a payment-gateway port
  (`riviera-stripe-payments`).
- **Build:** Gradle wrapper for the backend; npm scripts for the frontend.

## Commands

Requires **JDK 25**, **Node 26** (`.nvmrc`), and **Docker** for the backend Testcontainers
ITs (they skip cleanly without a daemon). In a Claude Code cloud session, load
**`riviera-local-debug`** before the first `./gradlew`/`npm` — the wrapper cannot
self-provision there and the full test task can OOM the sandbox.

**Backend** (from `platform/`):

```bash
./gradlew build                        # compile + full test suite + JaCoCo
./gradlew test --tests "*ClassName*"   # one test class
./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" \
  --tests "*PackageShapeArchitectureTests*" --tests "*DomainPurityArchitectureTests*" \
  --tests "*PublishedSurfacePlacementArchitectureTests*"
                                       # the structural net — run after any backend structure change
./gradlew bootRun                      # run the API on :8080
```

**Frontend** (from `frontend/`):

```bash
npm ci
npm start                # dev server on :4200
npm run lint             # ESLint (type-aware presets)
npm run format:check     # Prettier over frontend/src + frontend/e2e + vitest-base.config.ts (`npm run format` to apply)
npm test                 # Vitest unit tests, runs once in jsdom
npm run test:a11y        # axe + contrast unit specs only
npm run test:e2e         # Playwright — local-only REAL-backend suite (frontend/e2e/real-backend/)
npm run test:e2e:a11y    # Playwright — the CI-safe mocked suite (frontend/e2e/); what CI runs
npm run build
```

**CI/CD** (`.github/workflows/`): `ci.yml` runs the backend build/test, the frontend
lint/format/test/build + mocked e2e, the diff-scoped hygiene guards `scripts/check-*.mjs`
(most also run as a local `PostToolUse` hook; `check-comment-only.mjs` and
`check-review-range.mjs` are by-hand verifiers, not CI gates), and a SonarCloud scan per PR.
The Sonar merge bar is **0 new issues, 0 duplicated blocks, ≥80% new-code coverage** — review the
issue list, not just the pass/fail. `codeql.yml` scans; `deploy.yml` deploys the single
backend image (which serves the SPA) to Render from `main` (ADR-0004; `docs/deploy/`).
Line endings are pinned LF by the root `.gitattributes`.

## Repo map

- `platform/` — the Spring Boot backend. Base package **`ai.riviera.platform`**; one
  package per module below. Flyway: `platform/src/main/resources/db/migration`.
- `frontend/` — the Angular app. Folder taxonomy and import rules are `riviera-frontend`'s
  call; Angular idioms live in `frontend/.claude/CLAUDE.md` (loads automatically for
  frontend work). `frontend/e2e/` is the CI-safe mocked Playwright suite;
  `frontend/e2e/real-backend/` the local-only real-backend suite.
- `docs/` — `architecture/`, `adr/` (decisions), `design/`, `plans/` (in-flight plan docs
  only), `research/` (findings behind decisions), `agents/` (issue-tracker conventions +
  runbooks), `deploy/` + `runbooks/`, `superpowers/specs/` (product design).

## The nine domain modules (Spring Modulith)

Each module lives at `ai.riviera.platform.<module>` with the hexagonal layout of invariant
#11. **Read the module's § in `RESPONSIBILITIES.md` before changing it** — it holds the
per-module contract and the settled rules. The platform is **one bounded context** with twelve
modules, and it has no aggregate-root classes: `domain/` holds the rules, the state is in the
tables, and the lifecycles are guarded SQL (ADR-0018).

| Module | Owns | Tables it owns (sole writer) |
|---|---|---|
| `venue` | venue profile, beach map (sets, pools, positions), pricing, booking mode, sales-close setting, photos + moderation (ADR-0008/0013), commission-rate schedule | `venue`, `set_position`, `venue_amenity`, `venue_photo(_variant)`, `venue_commission_rate` |
| `availability` | the per-`(set, date)` source-of-truth state; the only writer of that table | `set_availability` |
| `booking` | bookings and codes, the whole lifecycle and its sweeps, request accept/decline, cancellation policy, driving refunds via `payment.api.RefundPort` | `booking` |
| `payment` | Stripe collection, PaymentIntents, refunds, webhook handling | `payment`, `stripe_webhook_event` |
| `payout` | the venue payout ledger and manual BKT batches | `payout_ledger_entry`, `payout_batch` |
| `customer` | tourist identity: guest contact, the customer account (sign-in, SSO, verification, password), GDPR erasure (ADR-0010) + retention sweep, the canonical email form | `customer`, `customer_account`, `customer_sso_identity`, `customer_account_token` |
| `operator` | operator accounts, operator↔venue ownership (invariant #13), the admin-driven lifecycle and `is_admin`, the tourist-visibility answer | `operator`, `operator_venue` |
| `review` | reviews (one per booking), eligibility + window, the aggregate rating, the listed page, admin takedown, erasure tombstone; a **leaf** module (ADR-0015) | `review` |
| `notification` | transactional mail: the two ADR-0011 vehicles, the hashed suppression list (ADR-0012), delivery log + admin resend | `email_suppression`, `booking_confirmation_mail_attempt` |

Plus **`shared`**, an OPEN Shared Kernel of edge/technical types (`ApiProblem`,
`CurrentOperator`, …); admission rests on **ownership, never reuse** (`RESPONSIBILITIES.md`
§`shared`). Modules depend on `shared`, the root on modules, nothing on the root. And two closed
non-context modules, `allowedDependencies = {}` — **`challenge`** (proof of work) and **`audit`**
(the admin audit trail): a mechanism the edge calls through a port is a module, its fence stays in
the root (ADR-0017). Their surfaces and contracts are `RESPONSIBILITIES.md` §s.

**Collaboration:** events for state changes, `api/` ports for queries (invariant #11); the
availability claim and the erasure reach into reviews are synchronous ports. The eight
events: `PaymentConfirmed`/`PaymentCanceled` → `booking`; `BookingConfirmed`/
`BookingCancelled` → `payout`, `notification` (and `booking`'s own refund listener);
`BookingPaymentDue`, `BookingRequestDeclined`, `BookingRequestExpired` → `notification`;
`ReviewsChanged` → `venue`.

**Platform edge** (settled; `RESPONSIBILITIES.md` § *Platform edge*): server-side sessions
with two principal types; login machinery at the edge, never in modules; customer account
and guest row never linked; auth endpoints non-enumerating and constant-time; mocks
profile-guarded out of prod; revocation edge-orchestrated and synchronous; the public writes that
cost money or inventory fenced at the edge, verified by the `challenge` module's self-hosted
proof-of-work challenge against a Postgres single-use registry (ADR-0016, ADR-0017); every mutating
`/api/admin/**` action past the gate audited automatically by the edge's fence (ADR-0013).

## Cross-cutting invariants

The rules every plan, implementation, and review checks. Skills cite them by number — the
numbering is stable; **never renumber**. Mechanisms and edge cases: `RESPONSIBILITIES.md`
§ *Invariants, long form*.

1. **No JPA/Hibernate — JDBC only.** `spring-boot-starter-data-jpa` never on the
   classpath; no `@Entity`/`EntityManager`. Every driven adapter is hand-written `JdbcClient`
   SQL — there is not one `CrudRepository`, `@Table` or `@Id` in the tree. The Spring Data JDBC
   starter is on the classpath and its aggregate mapping stays available, but reaching for it is
   a departure from the tree's one uniform choice, not a coin flip (`riviera-java-conventions`
   §1a says when it would earn its keep).
2. **Availability is the single source of truth, per `(set, date)`.** One
   `availability(set_id, booking_date)` row per set and date, enforced by a unique constraint
   AND in the reservation transaction (`FOR UPDATE` or `INSERT … ON CONFLICT DO NOTHING`).
   Never double-sell a set.
3. **Online and walk-in pools are separate.** Online bookings target online-pool sets only.
4. **Sales close is venue-controlled, on the day itself.** Date D sells until the venue's
   `sales_close` on D (`00:01`, `16:00` default, `23:59`; `Europe/Tirane`). The pay path
   fences on the pay deadline; the confirm path deliberately does not.
5. **Money is integer minor units, never floating point**, with an explicit ISO currency
   code; rounding written down at any division. Collection currency is **EUR**.
6. **Time: store UTC `Instant`, reason in `Europe/Tirane`.** Never the JVM default zone.
7. **Booking codes are unguessable bearer credentials.** ≥ 8 random base32 chars, secret in
   logs.
8. **Stripe webhooks are the source of truth for payment state — not the client.** Never
   confirm from a redirect; idempotency keys on charge/refund; collection-only, no Connect.
9. **The payout ledger is auditable and idempotent.** A booking accrues once, a refund
   reverses it; payout = Σ amounts − commission (per-venue, effective-dated, forward-only).
10. **Cancellation/refund policy is enforced server-side.** Free until the #4 cutoff, then
    non-refundable; the window closes at service-day open (ADR-0005). The weather refund is a
    manual admin action outside that fence.
11. **Spring Modulith boundaries are hexagonal and id-based** (ADR-0007): cross-module access
    only via another module's `api/` port or a domain event; event payloads carry technical ids
    and values, never a foreign aggregate — `BookingConfirmed` deliberately carries
    `amountMinor`, which is what lets `payout` accrue without calling back. Machine-locked; the
    package shape is in `riviera-modulith`.
12. **Schema changes go through Flyway.** Versioned forward migrations only; every
    invariant-enforcing constraint is created and tested by one.
13. **Venue-scoped operations verify the actor owns the venue** (object-level, BOLA): in the
    application service via `operator`'s port, `403` on mismatch; `/api/admin/**` is
    role-gated and exempt. Reviewed as RV-BE-9.

## Provisional decisions

- **Venue payout currency:** EUR vs ALL, per venue, converted outside the app at BKT
  payout time. (Collection currency is not provisional — EUR, invariant #5.)

## Project skills (`.claude/skills/`)

Each skill's frontmatter description is the authoritative "when to load". **`riviera-sdlc`**
routes all feature work (start there) → `riviera-plan-doc` (plans), `riviera-review-overlay`
(reviews), `riviera-modulith` + `riviera-java-conventions` (backend), `riviera-frontend` +
`riviera-tailwind` (frontend), `riviera-stripe-payments` (payments/commission),
`riviera-local-debug` (before the session's first build/test), `riviera-docs-freshness`
(merge/epic close-out), `postgres` (migrations), `playwright-cli` (e2e). The vendored craft
skills (`tdd`, `grilling`, …) are the generic engine the `riviera-*` skills specialize.

## Where things are written down

- **Issue tracker / triage labels / runbooks:** `docs/agents/`.
- **Domain glossary:** `CONTEXT.md`. **Module responsibilities + settled rules:** `RESPONSIBILITIES.md`.
- **Decisions:** `docs/adr/`. **Roadmap:** `docs/architecture/improvement-plan.md`.

## Searching the codebase

**An empty search result is not evidence of absence.** Search tools honour `.gitignore`,
and `platform/.gitignore` ignores `out/` — also the name of every hexagonal `adapter/out`
package. Confirm any negative with `git ls-files '*/adapter/out/*.java'` before concluding
a class doesn't exist.

**`docs/plans/` holds only in-flight work.** A plan doc is deleted at the next close-out
after its PR merges (`riviera-docs-freshness` § *Plan-doc retirement*); docs cite the issue or PR and
doc comments point at `RESPONSIBILITIES.md` or an ADR, never a plan path. Don't read old plans for rationale — it is on the issue, the PR,
the ADRs, and the Javadoc/TSDoc. A retired plan is recoverable by slug:
`git log --all --diff-filter=D -- 'docs/plans/<slug>.md'`.
