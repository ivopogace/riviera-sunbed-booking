# Contributing

Welcome! This guide is the practical "how we work" for the Riviera Sunbed Booking
repo. It assumes you're comfortable with Angular and Spring — it focuses on *this
project's* specifics, not the frameworks.

## 1. Orient yourself (15 minutes)

Read these three, in order:

1. [`README.md`](README.md) — the pitch, the stack, the current state.
2. [`docs/architecture/domain-model.md`](docs/architecture/domain-model.md) — the
   bounded contexts, aggregates, and flows as diagrams. This is the fastest way to
   load the mental model.
3. [`CLAUDE.md`](CLAUDE.md) — the conventions and the **12 invariants**. These are
   the canonical rules; everything below is the human-friendly summary.

The full product design lives in
[`docs/superpowers/specs/`](docs/superpowers/specs/) — read it when you need the
*why* behind a decision.

## 2. Current state & setup

Both apps are scaffolded and building. The backend lives in `platform/` (Spring
Boot, Spring Modulith) and the frontend in `frontend/` (Angular). To work locally:

```bash
cd platform && ./gradlew build      # backend: compile + test
cd frontend && npm ci && npm start   # frontend: install + dev server
```

You'll need locally: **JDK 25** (the project's Gradle toolchain), **Node 26.0.0**
(pinned in [`.nvmrc`](.nvmrc)), **Docker** (for the backend Testcontainers ITs against
Postgres), and later a **Stripe test account**. A `riviera-local-debug` skill with the
full set of run recipes is still pending; until it lands, the commands above plus the
per-slice plan docs in `docs/plans/` are the source of truth.

## 3. How we work (spec-driven, vertical slices)

We build in thin **vertical slices** — one path through every layer
(DB → API → UI → tests) that's demoable on its own — never horizontal layers
("all the DB, then all the API"). The pipeline:

| Step | What happens | Supporting skill |
|---|---|---|
| **Spec** | The intent lives in `docs/superpowers/specs/` or a GitHub issue. | — |
| **Plan** | A plan doc in `docs/plans/<slug>.md` with testable acceptance criteria, a risk register, and — if booking/availability is touched — exactly how invariant #2 is upheld. | `riviera-plan-doc` |
| **Slice** | Break the plan into independently-grabbable vertical slices. | `to-issues` *(once adopted)* |
| **Build** | Test-first, red→green→refactor, one behavior at a time. | `tdd` |
| **Review** | The 12 invariants become checkable gates; availability & payment-source are Blockers. | `riviera-review-overlay` |

Keep it right-sized: a one-line fix doesn't need a plan doc. A feature that touches
booking, availability, or money does.

## 4. Branching & commits

- Branch from `main`: `feature/<short-slug>` or `bugfix/<short-slug>`. Create it
  before you start.
- Keep commits focused; reference the issue (`#NN`) in the message.
- Open a PR into `main`. Don't push directly to `main`.
- A PR is reviewable on its own (one vertical slice), and green.

## 5. The invariants you must respect

These are the rules a reviewer will block on. Canonical text + rationale in
[`CLAUDE.md`](CLAUDE.md); the high-frequency ones:

- **#1 JDBC only.** No JPA on the classpath, ever. A `spring-boot-starter-data-jpa`
  dependency is itself a review blocker.
- **#2 Availability is the single source of truth per `(set, date)`.** Both online
  bookings and staff "tap-to-mark" write the same row. A set is held by at most one
  party per date — DB unique constraint **plus** a row lock (`SELECT … FOR UPDATE`)
  or atomic `INSERT … ON CONFLICT DO NOTHING`. A check-then-insert *races* — don't.
- **#5 Money = integer minor units + ISO currency.** Never a `double`/`BigDecimal`
  euro amount on the wire or in the DB.
- **#6 Time:** persist UTC `Instant`; compute the booking-date cutoff in
  `Europe/Tirane`. Never rely on the JVM default zone.
- **#8 Payment state comes from signature-verified Stripe webhooks** — never a
  client-side "payment succeeded" redirect. Idempotency keys on charge/refund. No
  Stripe Connect.
- **#11 Module boundaries.** Cross-module access only via the other module's `api/`
  port or a domain event (id-based payload). Never import its
  `application.*`/`domain.*`/`infrastructure.*`.
- **#12 Schema changes go through Flyway** — versioned forward migrations under
  `src/main/resources/db/migration`. No hand-run DDL.

## 6. Using Claude Code in this repo

This repo ships **repo-scoped skills** (under `.claude/skills/`, tracked in
`skills-lock.json`) that load automatically when you work here with Claude Code:

- **`riviera-sdd`** — the spec-driven-development orchestrator; routes each stage
  (refine → issue → plan → implement → CI → review → merge) to the right skill.
- **`riviera-plan-doc`** — plan-doc discipline (load alongside the planning flow).
- **`riviera-review-overlay`** — turns the invariants into review gates.
- **`riviera-stripe-payments`** — the locked payment model; load it for any
  `payment`/`payout` or Stripe work.
- **`riviera-java-conventions`** — backend Java idioms (JDBC-only, records, typed
  outcomes, Java 25); load before writing/refactoring any Java.
- **`riviera-modulith`** — the Spring Modulith structure authority (module layout,
  `api/` boundaries, events vs ports); load before any backend structural change.
- **`angular-new-app` / `angular-developer`** — scaffolding and Angular standards.

`CLAUDE.md` is the canonical, always-current list of project skills.

Invoke a skill by typing `/<skill-name>`. When in doubt on payments or
availability, load the matching skill first — it carries the context that keeps the
invariants honest.

## 7. Getting unstuck

- Architecture questions → the diagrams in `docs/architecture/domain-model.md`.
- "Why is it this way?" → the design spec in `docs/superpowers/specs/`.
- "Is this allowed?" → `CLAUDE.md` invariants; if still unsure, ask before building
  — a wrong call on availability or payments is expensive to unwind.
