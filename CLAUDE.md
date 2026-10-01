# CLAUDE.md

Canonical for the module list and the numbered invariants the `riviera-*` skills cite
("invariant #2" means the list below). Long form: `RESPONSIBILITIES.md`.

## What this is

Tourists pre-book a sunbed **set** (2 loungers + umbrella, full day) at an Albanian-riviera
venue on a visual beach map and pay in-app; the platform takes a per-booking commission and
pays venues out manually. Spring serves the Angular SPA same-origin. Product spec:
`docs/superpowers/specs/`; colour ledger + non-text-contrast rule: `docs/design/`.

## Tech stack (locked)

- **Frontend:** Angular 22, Tailwind 4 (no SCSS), signals, standalone components. Vitest in
  jsdom; Playwright e2e.
- **Backend:** Spring Boot 4, Java 25, Spring Modulith of hexagonal modules. No Lombok.
- **Persistence:** PostgreSQL via `JdbcClient`/`JdbcTemplate` only (#1); Flyway (#12).
- **Payments:** Stripe, collection only, behind a gateway port (`riviera-stripe-payments`).

## Commands

Needs JDK 25, Node 26 (`.nvmrc`), Docker for the Testcontainers ITs (they skip without a
daemon). In a cloud session load `riviera-local-debug` before the first `./gradlew`/`npm`.

**Backend** (from `platform/`):

```bash
./gradlew build                        # compile + full test suite + JaCoCo
./gradlew test --tests "*ClassName*"   # one test class
./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" \
  --tests "*PackageShapeArchitectureTests*" --tests "*DomainPurityArchitectureTests*" \
  --tests "*PublishedSurfacePlacementArchitectureTests*" \
  --tests "*RetiredSetExclusionArchitectureTests*"
                                       # the structural net — run after any backend structure change
./gradlew bootRun                      # API on :8080
```

Structural-net membership rule: `riviera-modulith` § *The structural net*.

**Frontend** (from `frontend/`):

```bash
npm ci
npm start                # dev server on :4200
npm run lint
npm run format:check     # Prettier over src + e2e + eslint-rules + vitest-base.config.ts (`npm run format` applies)
npm test                 # Vitest, jsdom
npm run test:eslint-rules # the local ESLint rules' own suite
npm run test:a11y        # axe + contrast unit specs
npm run test:e2e         # Playwright, local-only REAL-backend suite (frontend/e2e/real-backend/)
npm run test:e2e:a11y    # Playwright, CI-safe mocked suite (frontend/e2e/) — what CI runs
npm run build
```

**CI** (`.github/workflows/ci.yml`): backend build/test, frontend lint/format/test/build +
mocked e2e + eslint-rules suite, the `scripts/check-*.mjs` guards (`check-inline-comments`,
`check-focus-posture` and `check-touch-target` also run as a local `PostToolUse` hook;
`check-comment-only.mjs` is by-hand only), SonarCloud per PR. Sonar bar: **no new bug,
vulnerability or unreviewed hotspot, ≥80% new-code coverage**; smells and duplication judged.
`deploy.yml` deploys the backend image (serves the SPA) to Render from `main`. Line endings
pinned LF by `.gitattributes`.

## Repo map

- `platform/` — backend; base package `ai.riviera.platform`, one package per module. Flyway:
  `platform/src/main/resources/db/migration`.
- `frontend/` — Angular app; folders and imports are `riviera-frontend`'s call, idioms in
  `frontend/.claude/CLAUDE.md`. `frontend/eslint-rules/` = repo-own ESLint rules (for inline
  `template:` rules Sonar can't see). `frontend/e2e/` mocked suite; `frontend/e2e/real-backend/`
  local-only.
- `docs/` — `adr/`, `architecture/`, `design/`, `plans/` (in-flight only), `research/`,
  `agents/` (tracker conventions, runbooks), `deploy/`, `runbooks/`, `superpowers/specs/`.

## Modules (Spring Modulith)

Each at `ai.riviera.platform.<module>`, hexagonal layout (#11). **Read the module's § in
`RESPONSIBILITIES.md` before changing it.** One bounded context, the modules below, no
aggregate-root classes: `domain/` holds rules, state is in tables, lifecycles are guarded SQL
(ADR-0018).

| Module | Owns | Sole writer of |
|---|---|---|
| `venue` | profile, beach map (sets, pools, positions), pricing, booking mode, sales-close, maximum stay, season closure, map pin, photos + moderation, commission-rate schedule | `venue`, `set_position`, `venue_amenity`, `venue_photo(_variant)`, `venue_commission_rate` |
| `availability` | the per-`(set, date)` source of truth | `set_availability` |
| `booking` | bookings + codes, stitched stays (a group of bookings under one code, ADR-0024), lifecycle + sweeps, per-day attendance + stay outcome, request accept/decline, cancellation policy, driving refunds via `payment.api.RefundPort`, remodel claim classification + receipt | `booking`, `stay`, `booking_day`, `remodel_receipt(_move/_outcome/_kept)` |
| `payment` | Stripe collection, PaymentIntents (one may collect for several bookings), per-booking refunds by scope (the whole share, or one day), webhooks | `payment`, `payment_booking`, `payment_refund`, `stripe_webhook_event` |
| `payout` | venue payout ledger, manual BKT batches, platform settings (venue-change fee) | `payout_ledger_entry`, `payout_batch`, `platform_setting` |
| `customer` | guest contact, customer account (sign-in, SSO, verification, password), GDPR erasure + retention sweep, canonical email form | `customer`, `customer_account`, `customer_sso_identity`, `customer_account_token` |
| `operator` | operator accounts, operator↔venue ownership (#13), admin lifecycle + `is_admin`, tourist-visibility answer | `operator`, `operator_venue` |
| `review` | one review per booking, eligibility + window, aggregate rating, admin takedown, erasure tombstone; a leaf (ADR-0015) | `review` |
| `notification` | transactional mail, hashed suppression list, delivery log + admin resend | `email_suppression`, `booking_confirmation_mail_attempt` |
| `itinerary` | the stay read model (D7/D11): the whole-coast verdict per venue for a span (same set · fits with N moves · can't host), served on `GET /api/venues`; the per-venue stitched plan on `GET /api/venues/{id}/itinerary`; the move budget `riviera.itinerary.max-switches` | nothing — a read model over `venue::api` + `availability::api` |
| `remodel` | the beach-map remodel preview + commit (ADR-0020/ADR-0028): composes `venue`'s layout diff and write with `booking`'s claim classification and settlement, supplying `venue.spi.RemodelGate`; assembles, never decides | nothing — a composition over `venue::api` + `booking::api` |

Plus `shared` (closed kernel of edge types like `ApiProblem`, registered in
`@Modulithic(sharedModules)` so every module may use it, depending on no module; admission by
ownership, never reuse) and the closed non-context modules with `allowedDependencies = {}`:
`challenge` (proof of work; writes `challenge_registry`), `audit` (admin audit trail; writes
`admin_audit_record`) and `monitoring` (correlation id, metric names, money-path alert check; writes
nothing). Also closed and non-context, but an adapter layer depending on the surfaces it needs: `auth`
(sign-in and sessions: the `UserDetailsService`s, session establishment, credential stamp and revocation,
SSO, password policy, recovery, the login and self-service controllers; writes nothing). No module writes
the framework tables: `SPRING_SESSION*` (Spring Session, from `auth` and the edge) and `event_publication*` (Modulith's registry; re-driven by the outbox levers).
Every module may depend on `shared`, which depends on no module; the root on modules, nothing on the
root.

**Collaboration:** events for state changes, `api/` ports for queries. Synchronous, state-changing
ports: the availability claim (walked per day by `booking`'s `SpanClaim`), payment collection /
refund / void (`payment::api`), erasure's reach into reviews, the remodel gate + claim settlement,
the reserve's guest-row find-or-create (`customer::api`), onboarding's owner assignment
(`operator::api`).
Events:
`PaymentConfirmed`/`PaymentCanceled` → `booking`; `BookingConfirmed` → `payout`, `notification`;
`BookingCancelled` → those two plus `booking`'s own refund + intent-void listeners;
`StayConfirmed`/`StayCancelled`/`StayMoveDue`/`BookingPaymentDue`/`StayPaymentDue`/
`BookingRequestDeclined`/`StayRequestDeclined`/`BookingRequestExpired`/`StayRequestExpired`/
`BookingMoved` → `notification`; `BookingDayRefunded` → `payout`, `notification` and `booking`'s own
day-refund listener; `ReviewsChanged` → `venue`.

**Platform edge** (`RESPONSIBILITIES.md` § *Platform edge*): server-side sessions carrying an
operator or a customer principal; login and session machinery in `auth`, never in a domain module;
customer account and guest row never linked; auth endpoints non-enumerating and constant-time; mocks
profile-guarded out of prod; revocation orchestrated by `auth`, synchronous; account creation, password recovery
and booking/stay create fenced by `challenge`'s proof-of-work against a single-use registry; every
mutating `/api/admin/**` action audited by the edge; map tiles self-hosted under `/map/**`, no
third-party map host.

## Cross-cutting invariants

Cited by number — **never renumber**. Long form: `RESPONSIBILITIES.md` § *Invariants, long form*.

1. **JDBC only** (ADR-0001) — no JPA; `JdbcOnlyArchitectureTests` fails the build on it.
2. **One availability row per `(set, date)`**, claimed with `FOR UPDATE` / `ON CONFLICT DO
   NOTHING` — never double-sell.
3. **Online bookings target online-pool sets only.**
4. **D sells until the venue's `sales_close` on D** (`Europe/Tirane`); the confirm path is not
   fenced.
5. **Money is integer minor units** + ISO currency.
6. **Store UTC `Instant`, reason in `Europe/Tirane`** — never the JVM default zone.
7. **Booking codes are bearer credentials** — never logged in clear.
8. **Stripe webhooks are the source of truth**, never the client redirect.
9. **The payout ledger is auditable and idempotent**; direction is the entry type, never the
   amount's sign.
10. **Refund policy is server-side** (ADR-0005).
11. **Cross-module access only via `api/` ports or id-based events** (ADR-0007).
12. **Schema changes only via forward Flyway migrations.**
13. **Venue-scoped operations verify ownership in the application service** → `403`.

**Provisional:** venue payout currency EUR vs ALL per venue, converted outside the app.

## Skills

`riviera-sdlc` routes all feature work — start there. `riviera-plan-doc` (plans),
`riviera-review-overlay` (reviews), `riviera-modulith` + `riviera-java-conventions` (backend),
`riviera-frontend` + `riviera-tailwind` (frontend), `riviera-stripe-payments`,
`riviera-local-debug` (before the first build/test), `riviera-docs-freshness` (epic close-out),
`postgres` (migrations), `playwright-cli` (e2e).

Tracker + labels: `docs/agents/`. Glossary: `CONTEXT.md`. Decisions: `docs/adr/`. Roadmap:
`docs/architecture/improvement-plan.md`.

## Searching the codebase

`docs/plans/` holds in-flight work only: a slice deletes its plan in its PR's last commit, so a
merged slice's plan lives in that PR's commits. Nothing durable cites a plan path. Plans retired on
`main` are found with `git log --all --diff-filter=D -- 'docs/plans/<slug>.md'` after
`git fetch --unshallow`.
