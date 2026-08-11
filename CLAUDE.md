# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

It is the **canonical source** for the bounded-context list and the cross-cutting
invariants that the project skills (the `riviera-*` skills under `.claude/skills/`)
reference by number. When a skill says "invariant #2," it means the numbered list
in this file. Keep this file short and stable; detailed, situational guidance
lives in the skills, not here.

## What this is

A two-sided marketplace web app: tourists pre-book a sunbed **set** (2 loungers +
umbrella, full day) at an Albanian-riviera venue, pick the exact spot from a
visual beach map, and pay in-app; the platform takes a commission per booking and
pays venues out manually. Full design: `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`;
visual design (Liquid Glass v3 tourist + v2 operator console): `docs/design/`.

Current state: full stack built and deployed, served **same-origin by the backend**
(Spring bundles the Angular SPA into its Docker image) at
riviera-sunbed-booking.onrender.com (#110; GitHub Pages retired). Shipped epics: the
tourist Liquid Glass restyle (#133), the operator console (#141, O1–O8 tabs — the legacy
StaffDaily and venue-editor pages are retired; venue creation lives inline on the `/operator`
home since #278, which deleted `venue-admin/` and completed the Liquid Glass surface
coverage), and venue photos end-to-end (#142, ADR-0008). Customer accounts (epic #108) are all but
done — S1–S4 and S6–S9 shipped (Flyway V25–V29); the one remaining slice is **S5 (#116)**:
swap the mocked Google/Apple SSO adapters for real ones. The durable rules that epic
established (per-slice history: the issues + `docs/plans/`):

- **Separate account identity (D-6):** `customer_account` has no FK to the guest row;
  registration never auto-claims a guest email's bookings, and back-linking past guest
  bookings is a **permanent non-goal**. A signed-in booking links via nullable
  `booking.account_id`; `GET /api/me/bookings` is session-principal-scoped (BOLA-safe).
  Guest checkout is byte-for-byte unchanged. First SSO sign-in resolves-or-creates by
  verified email, auto-linking when the email is taken.
- **Login/session machinery lives at the platform edge**, never in modules (RV-BE-11) —
  server-side sessions (Spring Session JDBC), **two principal types** with separate
  authentication managers (D-2), one audience-aware sign-in page at `/account/sign-in`
  (S9); post-sign-in landing is driven by `GET /api/venues/mine` (0 venues → the inline
  create form at `/operator` (#278),
  1 → console, 2+ → picker; `returnUrl` outranks all).
- **Mocked externals are prod-guarded:** the mock SSO IdPs (`@Profile("prod & !sso")`)
  and mock mailer (`@Profile("prod & !mailer")`) cannot reach prod; the real `SmtpMailer`
  shipped in #368 (SMTP relay per ADR-0011, `mailer` profile, fail-at-boot config) and #369
  moved recovery sends **off the request thread** (bounded in-memory `MailDispatcher`, closing
  the timing enumeration oracle), so prod activation is now gated on **#370 provider setup
  alone**; epic #367 absorbed #255. Which vehicle a mail uses follows from its payload
  (ADR-0011 decision 5): **ids-only → Event Publication Registry; bearer-credential → the
  in-memory dispatcher**, because the registry persists payloads into `event_publication`.
  Real SSO adapters are S5.
- **Auth endpoints are non-enumerating + constant-time on their own rate-limit buckets**
  (D-8); email verification is **soft/non-blocking** (SSO counts as provider-verified).
- **Operator lifecycle:** self-registration → admin approval (`PENDING`→`ACTIVE`,
  role-gated `/api/admin/operators`) → **creator-owns-on-create**. No account owns all
  venues (V29); the bootstrap `operator` is demoted to the platform admin (`is_admin`,
  unlocked by `RIVIERA_OPERATOR_PASSWORD`); a venue-scoped edit on a venue you don't own
  is `403 NOT_VENUE_OWNER` **before any existence check**.

## Tech stack (locked)

- **Frontend:** Angular 22 (mobile-friendly responsive web), Tailwind 4, signals,
  standalone components. Unit tests are **Vitest in jsdom** (not Karma); e2e is
  Playwright. Native apps deferred.
- **Backend:** Spring Boot 4 REST API on Java 25, organized as a **Spring
  Modulith** (2.1) with hexagonal (ports/adapters) modules. No Lombok.
- **Persistence:** PostgreSQL via **Spring Data JDBC / `JdbcTemplate` only**.
- **Payments:** Stripe (collection only), behind a payment-gateway interface.
- **Schema migrations:** Flyway (versioned forward migrations).
- **Build:** Gradle (wrapper, `./gradlew`) for the backend; npm scripts for the
  Angular app.

## Commands

Requires **JDK 25**, **Node 26** (`.nvmrc`), and **Docker** for the backend
Testcontainers ITs (they skip cleanly without a daemon, `@EnabledIfDockerAvailable`).

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
npm run lint             # ESLint (angular-eslint)
npm run format:check     # Prettier over the lines this branch wrote (`-- --fix` to apply)
npm test                 # Vitest unit tests, runs once in jsdom
npm run test:a11y        # axe + contrast unit specs only
npm run test:e2e         # Playwright — local-only REAL-backend suite (frontend/e2e/real-backend/)
npm run test:e2e:a11y    # Playwright — the CI-safe mocked suite (frontend/e2e/); what CI runs
npm run build
```

**Cloud-session caveats** (Claude Code on the web): the Gradle wrapper cannot
self-provision behind the repo-scoped proxy, and the bare `test` task can OOM the
sandbox. Load **`riviera-local-debug`** before the first `./gradlew`/`npm` of a
session — it has the working recipe (system `gradle` + JDK-25 toolchain
registration, scoped tests only; CI owns the full suite) and the known
full-suite-only failure class (shared-state beans accumulating across tests).

**CI/CD** (`.github/workflows/`): `ci.yml` runs backend build/test, frontend
lint/format/test/build + e2e, **four** diff-scoped hygiene checks — inline comments
(RV-STYLE-1, #529 — the CI half of the `PostToolUse` guard in
`.claude/settings.json`), the plan doc's File-structure section (#533,
`node scripts/check-plan-file-structure.mjs --diff origin/main` by hand), the two
stranded-focus postures (#621, `node scripts/check-focus-posture.mjs --diff origin/main`;
`--all` sweeps the standing tree, and it is the CI half of a second `PostToolUse` guard — of its
three rules only **the BUSY pair fails a build** (BUSY-1; BUSY-2 since #628 — #625's self-committing
field, `(change)`/`(blur)` + busy `[disabled]` on a `readonly`-lockable kind), while FOCUS-1 prints
and returns 0, since its predicate approximates a
runtime property; FOCUS-1 is scoped **per gating signal** since #624, so a component that moves focus
for one surface no longer stands exempt for a second one, and a focus-trapped modal's teardown counts
as a surface),
and Prettier formatting (#615, `npm run format:check` from `frontend/`; `-- --fix` rewrites
exactly the hunks it reports). The first three share the `Repo hygiene (diff-scoped)` job;
Prettier is a step in the frontend job, which is where the pinned Prettier is installed —
and both jobs are ruleset-required contexts **by name**, so a new job would report without
blocking.
`ci.yml` also runs a SonarCloud scan on every PR; `codeql.yml` scans;
`deploy.yml` deploys the single backend image (which serves the SPA) to Render from `main`. The Sonar merge
bar is stricter than the default quality gate: **0 new issues, 0 duplicated
blocks, ≥80% new-code coverage** — review the issue list, not just the gate
pass/fail (`riviera-sdlc` enforces this). Non-prod backend hosting is
Render + Neon (ADR-0004; see `docs/deploy/`).

## Repo map

- `platform/` — the Spring Boot backend. Base package **`ai.riviera.platform`**
  (groupId `ai.riviera`, artifactId `platform`); one package per module in the
  table below. Flyway migrations: `platform/src/main/resources/db/migration`.
- `frontend/` — the Angular app. Folder taxonomy and import rules are the
  `riviera-frontend` skill's call; Angular language idioms live in the nested
  `frontend/.claude/CLAUDE.md` (loads automatically for frontend work).
- `frontend/e2e/` — the CI-safe mocked Playwright suite;
  `frontend/e2e/real-backend/` — the local-only real-backend suite.
- `docs/` — `architecture/` (domain-model diagrams, improvement plan, tracked by
  epic #93), `adr/` (decisions), `design/` (Liquid Glass visual specs),
  `plans/` (per-slice plan docs), `agents/` (issue-tracker conventions +
  gradle-proxy / docker-testcontainers runbooks), `deploy/` + `runbooks/` (CD and
  ops), `superpowers/specs/` (product design).

## Bounded contexts (Spring Modulith modules)

Each module lives at `ai.riviera.platform.<module>` with the hexagonal layout in
invariant #11.

> **Plus one non-context module: `shared`** (#371) — the **Shared Kernel**, an
> `@ApplicationModule(type = OPEN)` holding `ApiProblem`, `CurrentOperator`, `CurrentCustomer`,
> `InvalidApiRequestException` (#118 — the typed edge-validation signal the advice maps to
> `400 INVALID_REQUEST`; raw `IllegalArgumentException` and non-duplicate
> `DataIntegrityViolationException` propagate as logged 500s instead of masquerading as client
> errors), `ObservabilityMetrics`, `ShutdownBudget` (#456), `ResubmissionThrottle` +
> `ResubmissionOutcome` (#454) and `MdcTaskDecorator` (#455).
> It is *not* a bounded context and owns no aggregate; it exists because the root package was
> doing two jobs with opposite dependency directions — composition root (depends on modules)
> **and** the home of types five modules depended on — which closes cycles by construction.
> The rule it restores: **modules depend on `shared`, the root depends on modules, and nothing
> depends on the root.** Keep it tiny (Evans' warning): admission requires no business logic,
> no module-owned state, and no dependency on a module that depends back — it may only reach
> `customer::api` and `operator::api`; it is not a home for "code used in more than one
> place". Every admission rests on **ownership, never reuse** — the per-type grounds, the
> #410→#455 reversal, and the admission bar live in `RESPONSIBILITIES.md` §`shared`.
> Consequence for tests: `@ApplicationModuleTest` auto-supplies root-package beans but not
> another module's, so a module test mocks the kernel beans it transitively needs (see
> `PayoutModuleTest`).

| Module | Owns | Aggregate root(s) |
|---|---|---|
| `venue` | venue profiles, the beach map / layout, set positions, online-vs-walk-in pool assignment, pricing, booking mode (Instant / Request), amenities + distance-to-water, venue photos (#142, ADR-0008) incl. **platform-admin photo moderation** — the takedown (`DELETE /api/admin/venues/{venueId}/photos/{slot}`, #504) and the read that makes it operable (`GET /api/admin/venues/{venueId}/photos`, #511, the first production caller of `PhotoStorage#listMetadata`): the module's two **ownership-free** photo operations, together on their own `VenuePhotoModeration` port — named for that posture, not for one action — so the venue-scoped `VenuePhotos` contract stays uniformly `assertOwns`-first; the moderation stance it enforces is **ADR-0013**: report-and-remove, no pre-publication review, with the audit trail it requires **shipped by #507** (the platform-wide edge filter over every mutating `/api/admin/**` action — `admin_audit_record`, V38 — plus the console Audit tab; a takedown's confirmation collects optional `X-Audit-Reason` grounds) and its **removal-effectiveness** half closed by #508 — the serving GET now revalidates (`Cache-Control: public, no-cache`) and gates its `304` on `PhotoStorage#exists`, so a takedown reaches shared caches *and* clients already holding the `ETag`, instead of being outlived by a one-year `immutable` TTL; the CDN **purge** a self-owned edge would need is a **precondition on ADR-0008's object-storage flip**, not a standing gap — the edge in front of prod today is Render's Cloudflare zone, which we hold no credential to purge), the signed-in operator's own-venues read (`GET /api/venues/mine`, S9 #277), the owner's per-set daily availability read (`GET /api/venues/{venueId}/availability`, #207 — states via `venue.spi.SetAvailabilityLookup#statesOn`, implemented by `availability`; the tourist map stays state-agnostic), and the commission rate **over time** — the effective-dated schedule (A7 #348, V39) behind `VenueRates#commissionBpsOn` plus the platform-admin rate read/write on a **second** ownership-free port (`VenueCommissionAdministration`); forward-only, so no past service date reprices (invariant #9) and the accrual's live read is unchanged — mechanics in `RESPONSIBILITIES.md` §`venue` | `Venue`, `BeachMap` |
| `availability` | the per-`(set, date)` source-of-truth state (free / booked-online / staff-marked); the only writer of that table | `SetAvailability` |
| `booking` | bookings, booking codes, lifecycle (pending-request/awaiting-payment/confirmed/cancelled/completed/no-show/declined/expired/**withdrawn**), request accept/decline + expiry sweep (#98) + the guest's own **withdraw** (#123, V37 — authorized by the booking code, not venue scope; publishes no event), the staff **check-in** (#583, V40 — QR/typed code scan on the service date; guarded single-use `CONFIRMED`→`COMPLETED`, venue-scoped, no event) and its counterpart the **no-show sweep** (#584, V41 — scheduled guarded bulk `UPDATE`s in **batches** marking past-day `CONFIRMED` bookings `NO_SHOW`; no per-row loop, **no availability write** and no event, since a no-show releases nothing — batched so a run cut off by the bounded scheduled client keeps what it committed); arrivals + takings count `COMPLETED` **and `NO_SHOW`** alongside `CONFIRMED`, and the admin weather refund reaches `NO_SHOW` too (its own `cancelForWeather` — a washed-out past day is exactly where swept rows come from) while the guest cancel stays `CONFIRMED`-only, cancellation-policy enforcement, the retention-basis fact for `customer`'s sweep (`customer.spi.GuestBookingHistory`, #101 Slice 2), the post-commit cancellation **refund** — driven through `payment.api.RefundPort` on this module's own **bounded** executor (#404), re-drivable via the ADMIN `GET`/`POST /api/admin/refund-outbox` scoped to that listener's **exact id**, never the `booking` package prefix (#454; invariant #8, `RefundOutboxScopeIT`) — the withheld-confirmation-mail flag on a **confirmed** booking's read model (`booking.spi.ConfirmationMailDelivery`, implemented by `notification`, #390; disclosed only when `payment.api.CollectionGuarantee` says the wired gateway really collects, so **inert outside the `stripe` profile** — otherwise a free suppression oracle, D-8), and the two reads #380's admin mail-delivery view needs — `BookingNotificationFacts#confirmationFacts` and `CustomerBookings` (split by consumer role per #94; neither publishes `BookingStatus`, both answer `everConfirmed` read from `confirmed_at`). Withdraw-leg concurrency argument, refund-executor rationale and per-issue history: `RESPONSIBILITIES.md` §`booking` | `Booking` |
| `payment` | Stripe collection, PaymentIntents, refunds, webhook handling | `Payment` |
| `payout` | the venue payout ledger (bookings − commission), manual BKT batch reporting; the accrual/reversal pair is **order-independent** since #428 — a refunded cancellation with no `ACCRUAL` yet to mirror *defers* (throws, so its publication stays outstanding and `riviera.outbox.pending` carries it) instead of completing as "nothing to reverse", which silently left the ledger overstating; the inverse of #428's own count-and-complete, because this fact *can* appear later | `PayoutLedgerEntry`, `PayoutBatch` |
| `customer` | tourist identity: guest-checkout contact + the customer account (email + opaque credential hash) for register/sign-in (#111, thin→full) + SSO identity linkage (`(provider, subject)`→account resolve-or-create, #112) + email verification + password recovery/reset tokens + set-password (#113) + GDPR right-to-erasure scrub (#101 Slice 1, ADR-0010: pseudonymize-in-place, retaining the statutory-retention financial records) + the **retention policy** — configured window, expired-basis selection and the scheduled sweep that tombstones guest contacts with no live basis (#101 Slice 2, ships disabled); account identity is separate from the guest row, no FK (D-6, guest-booking back-linking a permanent non-goal) + the **canonical email form** (`customer.vocabulary.Emails`, #386) — the platform's one definition, consumed by the edge and by `notification` (where it is the suppression key's HMAC input); it cannot live in `shared`, which depends on `customer::api` | `Customer`, `CustomerAccount` |
| `operator` | operator accounts + the operator↔venue ownership mapping (per-venue authorization, invariant #13); the **admin-driven lifecycle state** — self-registration + approval (`PENDING`→`ACTIVE`/`REJECTED`, #115) and suspend/reinstate (`ACTIVE`⇄`SUSPENDED`, #128) — + the `is_admin` platform-admin flag | `Operator` |
| `notification` | transactional-mail delivery (#382): the `Mailer` transports (mock vs SMTP, profile-swapped, prod-guarded) and both ADR-0011 decision-5 vehicles — the Event Publication Registry listener for **ids-only** payloads, the bounded in-memory dispatcher for **bearer-credential** ones — each on its own bounded executor, never Boot's shared `applicationTaskExecutor` (#383), since a mail send there sits on the money-path spine's pool (invariants #8/#9). Owns the five registry-borne booking mails (confirmation #371, cancellation/refund #374, payment-due #373, request declined/expired #124), the operator-approval notice (#375), the booking-confirmation delivery log + ADMIN resend (V36, #380), the ADMIN mail-outbox re-drive scoped by listener-id prefix (#405), and the hashed **email-suppression list** (V32–V35, ADR-0012) — *no send to a suppressed address*, enforced at the send chokepoint on both vehicles. Publishes `notification::api` only (`MailSender`; `MailDeliverability` #400) and implements `booking.spi.ConfirmationMailDelivery` (#390 — the inverted edge, so nothing depends on `notification`). **The loss-accounting metrics (`MAIL_*`), the two pools' opposite shed/drop policies, the shutdown-drain claim, and the per-flow abandonment counters are stated once in `RESPONSIBILITIES.md` § `notification` — not duplicated here.** | (none — owns `email_suppression` + `booking_confirmation_mail_attempt` state, no aggregate yet) |
> **`operator` shipped** (#73/#74/#109/#115/#128 + the #326–#359 session-security arc;
> per-issue history lives in the issues and `docs/plans/`). Every venue-scoped application
> service checks `assertOwns` → `403` (pinned by `CrossVenueDenialIT`); each operator has its
> own hashed credential; sessions are server-side in Postgres. The settled rules:
>
> - **Session revocation is edge-orchestrated and synchronous — deliberately not an event.**
>   The module flips state and returns the username; the edge (`PrincipalSessionRevoker`)
>   deletes that principal's `SPRING_SESSION` rows. Fires on suspend/reinstate
>   (`ACTIVE`⇄`SUSPENDED`; an admin cannot suspend itself — `409 CANNOT_SUSPEND_SELF`),
>   genuine credential rotation, password change/reset, and erasure.
> - **The revoke brackets the state change** (#357): revoke before *and* after, so a
>   transient revoke failure leaves the account recoverable by retry instead of committing
>   a transition whose sessions stay alive.
> - **Self-service password change** (#326/#344: `POST /api/auth/operator/password` and the
>   customer twin `POST /api/me/password`, each on its own budget): revoke runs **before**
>   the hash write (two owners — a spanning `@Transactional` would only look atomic); every
>   *other* session dies and the calling one is **re-issued under a new id** via
>   `SessionIdentity#rotate`, which (post-#359) carries attributes over, hard-DELETEs the
>   old row and creates a fresh one — authoritative against overlapping-request writes and
>   exfiltrated cookies, and the same helper is the login fixation defence. The env-managed
>   bootstrap admin refuses self-service (`409 BOOTSTRAP_CREDENTIAL_MANAGED` —
>   `OperatorCredentialInitializer` re-stamps it every boot).
> - **Rate-limit budgets guarding authenticated work refund on a `401`/`403` denied before
>   reaching that work** (#343 — `RateLimitFilter` sits ahead of CSRF/authorization, so
>   anonymous garbage must not drain an operator's budget); the policy is per-budget: a
>   login's `401` is the controller's answer and is still charged.
>
> All login/approval/session machinery stays at the edge (RV-BE-11,
> `OperatorAuthPlacementTests`). See `riviera-modulith` + `RESPONSIBILITIES.md`.

Cross-module collaboration is **events for state changes, `api/` ports for
queries** (invariant #11). The spine flow as built: the availability write happens
at **claim time** — `booking` claims/releases the `(set, date)` row synchronously via
`availability`'s `api/` port (`AvailabilityClaim`), so `availability` has **no event
listener**. `BookingConfirmed` and `BookingCancelled` fan out to **`payout`** (accrue /
reverse a ledger entry, idempotently) and to **`notification`** (the confirmation mail #371,
the cancellation/refund record #374 — same events, a non-money subscriber); the refund on
cancel is driven by `booking`'s own `BookingCancelled` listener calling `payment`'s
`RefundPort`. Three subscribers on `BookingCancelled` is why #405's mail re-drive scopes by
listener id and never by event type. `BookingPaymentDue` (#373) is the third published
event and the one whose *publication site* is the decision: raised **after**
`CheckoutPort.pay` answers `Pending`, from a small transaction of its own
(`PaymentDueAnnouncer`) rather than from the accept transaction — which commits first, so
an event raised there would also fire for the stub's synchronous confirm and for a
PaymentIntent failure that reverts the booking. `notification` is its only subscriber.
`BookingRequestDeclined` and `BookingRequestExpired` (#124) are the fourth and fifth
published events, and their publication site makes the opposite choice for the opposite
reason: raised **inside** `RequestReleaseService`'s winning decline/expire legs, because
there the guarded `UPDATE … RETURNING` itself settles the outcome, so the registry row
commits atomically with the transition. `notification` is again the only subscriber; the
withdraw leg beside them stays silent (#123 — guest-initiated, nothing to notify).

## Cross-cutting invariants

These are the rules every plan, every implementation, and every review checks.
The skills reference them by number.

1. **No JPA/Hibernate — JDBC only.** `spring-boot-starter-data-jpa` must never be
   on the classpath. No `@Entity`, `@OneToMany`, `@ManyToOne`, `mappedBy`,
   `EntityManager`. Use Spring Data JDBC aggregates and/or `JdbcTemplate` with
   explicit SQL. This is the project's defining backend decision.
2. **Availability is the single source of truth, per `(set, date)`.** Every
   channel — an online booking and a staff tap-to-mark walk-in — writes the same
   `availability(set_id, booking_date)` row. A set is held by **at most one party
   per date**. This is enforced in the database (unique constraint) AND in the
   reservation transaction (explicit row lock: `SELECT … FOR UPDATE`, or an
   atomic `INSERT … ON CONFLICT DO NOTHING` claim). The entire business depends on
   never double-selling a set; this is the #1 correctness invariant.
3. **Online and walk-in pools are separate.** Each set carries a pool flag. An
   online booking can only ever target an **online-pool** set. This is collision-
   prevention Layer 1 — it keeps the two channels from drawing on the same
   physical sets in real time.
4. **No same-day booking (v1).** Bookings for a given day close the **evening
   before** (default 18:00 `Europe/Tirane`, configurable). This is collision-
   prevention Layer 2 and also the cancellation cutoff — one rule, two jobs.
   **Closing the sale is not enough — the point of sale is fenced again** at the service
   day's opening (`00:00 Europe/Tirane`, the same instant invariant #10 closes
   cancellation at): the guest's pay deadline is `min(accepted_at + pay-window,
   service-day open)`, the abandoned sweep's third arm expires a booking whose service
   day has opened (so a set stops being held into the day it was sold for), and the
   code-gated view issues no payment credentials past it. Otherwise a request accepted at
   17:30 could still be paid — and confirmed — hours into a day already underway.
   **The confirm path is deliberately NOT fenced**, so this is three layers, not a
   guarantee: a payment already in flight at midnight still confirms, and the sweep is
   `@Profile("stripe")` on a 5-minute cadence rather than an instant at 00:00. The
   argument for that residual is in `RESPONSIBILITIES.md` §`booking` — cite it before
   reading a late confirm as a bug.
5. **Money is integer minor units, never floating point.** Store amounts as
   `long`/`int` minor units (cents) with an explicit ISO currency code. Commission
   and payout arithmetic is exact-integer; rounding rules are written down where
   any division happens. v1 collection currency is **EUR**.
6. **Time: store UTC `Instant`, reason in `Europe/Tirane`.** A "booking date" is a
   `LocalDate` in `Europe/Tirane`; the cutoff in #4 is computed in that zone.
   Never rely on the JVM default timezone. Persist timestamps as UTC.
7. **Booking codes are unguessable bearer credentials.** Staff verify a booking by
   its code on arrival, so a code must carry enough entropy to be unguessable
   (e.g. ≥ 8 random base32 chars), never sequential, and be treated like a secret
   in logs.
8. **Stripe webhooks are the source of truth for payment state — not the client.**
   Never confirm a booking from a client-side "payment succeeded" redirect. The
   `payment` module reconciles state from **signature-verified** Stripe webhooks,
   uses **idempotency keys** on charge/refund creation, and is collection-only
   (no Stripe Connect — see `riviera-stripe-payments`).
9. **The payout ledger is auditable and idempotent.** A booking contributes to a
   venue's payout **exactly once**; refunds reverse it. Payout = Σ(booking amounts
   for the venue in the period) − commission (commission rate stored per venue).
   Payouts are settled manually via BKT; the ledger is the record of what is owed.
10. **Cancellation/refund policy is enforced server-side.** Free cancellation until
    the #4 cutoff → full refund; after → non-refundable (or partial); **and the
    window closes entirely when the service day opens** (`00:00 Europe/Tirane` on
    the booking date) — a guest cancel is then refused, not refunded at a tier, so a
    delivered stay can never be reclaimed (ADR-0005's 2026-08-08 amendment). The
    venue's weather exception → **manual admin-triggered** full refund (v1, no
    forecast automation) is deliberately outside that fence. Refund decisions and
    amounts are computed on the server, then actioned via Stripe.
11. **Spring Modulith boundaries are hexagonal and id-based.** Module layout is the
    **ADR-0007 graduated two-template shape** (as amended by issues #95 and #371 — the latter adding
    a third, *non-context* template: the `shared` OPEN Shared Kernel, which matches neither template
    on purpose and is reserved for technical shared code; see the module table's `shared` note): a full module is
    `ai.riviera.platform.<module>.{api?, spi?, vocabulary?, events?, application, domain,
    adapter/in, adapter/out}` — the published surfaces are top-level named interfaces,
    present only for the kinds the module actually publishes; a thin (serviceless) module
    is `{api, vocabulary?, adapter/out}` only. There is **no** `application/in`|`out`
    split and **no** `infrastructure/*` — direction lives at the adapter layer, and the
    shape is machine-locked by `PackageShapeArchitectureTests`. **The published surface is
    split by kind (issue #95): `api/` holds ports only** — "call-me" interfaces, plain and
    never sealed — **`vocabulary/` the published typed ids/value/outcome types, `events/`
    the published domain-event records**; placement is machine-locked by
    `PublishedSurfacePlacementArchitectureTests`, and `allowedDependencies` grants name
    the narrowest surfaces each consumer needs (a listener-only module depends on
    `<module>::events` + `::vocabulary`, never a command surface). Cross-module access is
    via the other module's `api/` port **or** a domain event — never by importing its
    `application.*`/`adapter.*`/`domain.*`. A cross-module *driven* port — one a module
    needs *another* module to *implement* (dependency inversion, used to keep the graph
    acyclic) — lives in a separate `spi/` named interface, and `<module>::spi` is granted
    only to the implementing module (a driven port implemented by the module's own
    adapters stays internal in `application/`). Event payloads carry **technical ids**
    (`BookingId`, `SetId`, `VenueId`), not mutable business fields or foreign aggregates.
    Details: `docs/adr/ADR-0007-package-structure.md` + `riviera-modulith`.
12. **Schema changes go through Flyway.** Versioned forward migrations under
    `src/main/resources/db/migration`. No hand-run DDL, no ORM schema generation
    (there's no ORM). Every constraint that enforces an invariant (especially #2)
    is created and tested by a migration.
13. **Venue-scoped operations verify the actor owns the venue.** This is a
    multi-tenant marketplace: many independent operators each manage their own
    venue(s). Every operation on venue-owned data — a venue-scoped endpoint
    (`/api/venues/{venueId}/**`: beach-map edits, staff daily bookings, staff
    tap-to-mark, the payout ledger, weather refunds) or the service behind it —
    must verify the **authenticated operator owns the path `venueId`** and reject a
    mismatch with **`403`**. Authorization is **object-level, not role-level**: a
    shared role (e.g. `OPERATOR`) is necessary but **not** sufficient — owning the
    role does not authorize another operator's venue (OWASP API #1, Broken Object
    Level Authorization). The check lives in the **application service**, so no
    driving adapter can bypass it; the operator↔venue ownership mapping is owned by
    the `operator` module and consulted via its `api/` port (id-based, invariant
    #11). Platform-wide admin surfaces (`/api/admin/**`) are role-gated and exempt.
    Reviewed by `riviera-review-overlay` RV-BE-9.

## Provisional decisions

Still open (each a one-line change if reconsidered):

- **Venue payout currency:** EUR vs ALL, set per venue and converted outside the
  app at BKT payout time. (The **collection** currency is not provisional — it is
  EUR, fixed by invariant #5.)

Resolved, no longer provisional: base package `ai.riviera.platform` (shipped);
Flyway over Liquibase (shipped — the plain-SQL migrations under `db/migration`).

## Project skills (`.claude/skills/`)

Repo-scoped — they load when working in this repository (the vendored/external
ones are tracked in `skills-lock.json`; the first-party `riviera-*` skills have no
upstream). Each skill's frontmatter description is the authoritative
"when to load"; this list is the map, not a paraphrase:

- **`riviera-sdlc`** — the SDLC orchestrator; load at the start of any feature work.
- **`riviera-plan-doc`** — plan-doc discipline + the canonical template (plan stage).
- **`riviera-review-overlay`** — the invariant review bank, RV-BE/FE/CT (review gate).
- **`riviera-stripe-payments`** — the locked collect-only payment model (any
  payment/payout/Stripe/commission work).
- **`riviera-java-conventions`** — backend Java idioms (before writing any Java).
- **`riviera-modulith`** — backend module STRUCTURE authority (before any backend
  Java placement/move).
- **`riviera-frontend`** — Angular STRUCTURE authority (before any file under `frontend/`).
- **`riviera-tailwind`** — the styling HOW authority (Tailwind v4, the locked go-forward;
  SCSS retiring); before writing/refactoring any Tailwind under `frontend/src`. Pairs with
  `riviera-frontend` (where files go).
- **`riviera-local-debug`** — build/test run recipes (before the session's first
  `./gradlew`/`npm`).
- **`riviera-docs-freshness`** — substrate-doc staleness audit (merge close-out
  step 5; every epic close-out).
- **`angular-new-app` / `angular-developer`** — official Angular skills; the
  in-repo copies are authoritative here.
- **`playwright-cli`** — Playwright e2e authority; mandatory for any user-facing
  frontend slice.
- **`postgres`** (PlanetScale, MIT, trimmed) — table/schema/index design for
  Flyway migrations.
- **Vendored craft skills** (Matt Pocock, MIT): `grilling`/`grill-me`, `wayfinder` +
  `to-spec` + `to-issues` (the optional *Epic front-end* chain — chart foggy epics →
  epic spec → slice; see `riviera-sdlc`), `implement`, `tdd`, `diagnosing-bugs`,
  `codebase-design`, `domain-modeling`, `triage`, `improve-codebase-architecture` —
  the generic engine the `riviera-*` skills specialize.

## Where things are written down

- **Issue tracker / triage labels / domain-doc layout:** `docs/agents/`.
- **Domain glossary:** `CONTEXT.md`. **Module responsibilities:** `RESPONSIBILITIES.md`.
- **Decisions:** `docs/adr/`. **Roadmap:** `docs/architecture/improvement-plan.md`
  (tracked by epic #93).

## Searching the codebase

Grep/Glob and `git ls-files` are the tools; there is no knowledge-graph index. One rule
worth keeping: **an empty search result is not evidence of absence.** Search tools honour `.gitignore`, and
`platform/.gitignore` ignores `out/` — which is also the name of every hexagonal
`adapter/out` package. Confirm any negative with `git ls-files '*/adapter/out/*.java'`
before concluding a class doesn't exist.
