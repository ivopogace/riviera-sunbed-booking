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
3. [`CLAUDE.md`](CLAUDE.md) — the conventions and the **13 invariants**. These are
   the canonical rules; everything below is the human-friendly summary.

The full product design lives in
[`docs/superpowers/specs/`](docs/superpowers/specs/) — read it when you need the
*why* behind a decision.

Two more you'll reach for constantly rather than read front-to-back:
[`CONTEXT.md`](CONTEXT.md) is the domain glossary, and
[`RESPONSIBILITIES.md`](RESPONSIBILITIES.md) holds the per-module contracts,
settled rules, and history — **read a module's § there before you change it.**

## 2. Current state & setup

The full stack is built and deployed **same-origin**: Spring bundles the Angular SPA into its
Docker image and serves it (#110 — the old GitHub Pages deployment is retired). The backend
lives in `platform/` (Spring Boot, Spring Modulith) and the frontend in `frontend/` (Angular).
To work locally:

```bash
cd platform && ./gradlew build      # backend: compile + test
cd frontend && npm ci && npm start   # frontend: install + dev server
```

You'll need locally: **JDK 25** (the project's Gradle toolchain), **Node 26.0.0**
(pinned in [`.nvmrc`](.nvmrc)), **Docker** (for the backend Testcontainers ITs against
Postgres), and a **Stripe test account** for payment-module work. The full set of
run recipes — including single-test and cloud-session variants — lives in the
`riviera-local-debug` skill (`.claude/skills/riviera-local-debug/`).

One-time git setup: point blame at [`.git-blame-ignore-revs`](.git-blame-ignore-revs)
so the tree-wide Prettier reformat (#631) stays invisible to line-history tools
(GitHub's blame view honors the file automatically):

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

**Line endings need no setup.** [`.gitattributes`](.gitattributes) stores every text file as
LF and checks it out LF in any fresh clone, so don't set `core.autocrlf` — on Windows its
stock `true` is exactly what used to make `npm run format:check` report all 361 files as
unformatted (#636).

A clone made **before** that file landed keeps whatever is already on disk. An attribute
doesn't rewrite existing files, and neither `git checkout` nor `git add --renormalize` will,
because git reads a CRLF working file as *equal* to its LF blob. To renormalize the whole
tree, commit or stash first, then re-checkout it through the new attribute:

```bash
git rm --cached -r .   # drop the index; the files stay on disk
git reset --hard       # rewrite every one of them, now LF
```

Only `frontend/src`, `frontend/e2e`, and `vitest-base.config.ts` are gated, so
`npm run format` from `frontend/` is enough if you'd rather leave the rest alone.
Either way, check with `git ls-files --eol frontend/src` — every row should read
`w/lf`.

**Commits are gated too.** `npm ci` in `frontend/` installs a husky `pre-commit` hook
([`.husky/pre-commit`](.husky/pre-commit)) that runs lint-staged over the files you staged,
with the same scope as the two CI steps. Prettier **writes** and the result is re-staged for
you; ESLint only **checks** — it deliberately does not `--fix`, because #632 measured five
regressions introduced by ESLint's own fixers that neither the linter nor the test suite
caught, only a typecheck. Budget ~5 seconds; the type-aware rules need a TypeScript program.

Two consequences worth knowing. It sets `core.hooksPath` **locally**, so the hook arrives with
`npm install`, not with the clone — if you have never installed in `frontend/`, you have no
hook. And it sees **staged files only**, so it narrows the CI round-trip rather than replacing
it: a staged change that breaks an unstaged file still fails in CI. To skip it deliberately:

```bash
HUSKY=0 git commit …          # this commit only
git config --unset core.hooksPath   # turn it off in your clone
```

## 3. How we work (spec-driven, vertical slices)

We build in thin **vertical slices** — one path through every layer
(DB → API → UI → tests) that's demoable on its own — never horizontal layers
("all the DB, then all the API"). The pipeline:

| Step | What happens | Supporting skill |
|---|---|---|
| **Spec** | The intent lives in `docs/superpowers/specs/` or a GitHub issue. | — |
| **Plan** | A plan doc in `docs/plans/<slug>.md` with testable acceptance criteria, a risk register, and — if booking/availability is touched — exactly how invariant #2 is upheld. | `riviera-plan-doc` |
| **Slice** | Break the plan into independently-grabbable vertical slices. | `to-issues` |
| **Build** | Test-first, red→green, one behavior at a time, at seams agreed before the first test. Refactoring belongs to Review, not the loop. | `tdd` |
| **Review** | The 13 invariants become checkable gates; availability & payment-source are Blockers. The Sonar merge bar is stricter than the default gate: **0 new issues, 0 duplicated blocks, ≥80% new-code coverage** — read the issue list, not just pass/fail. | `riviera-review-overlay` |

Keep it right-sized: a one-line fix doesn't need a plan doc. A feature that touches
booking, availability, or money does.

A plan doc is working state, not a record. It is committed so the work can be followed as
it lands, and deleted at the next close-out after its PR merges (any later slice's merge
close-out or an epic close-out) with its citations repointed to the issue
or PR (`riviera-docs-freshness` § *Plan-doc retirement*). Rationale worth keeping lives in
`RESPONSIBILITIES.md` or an ADR, with a one-line pointer from the Javadoc/TSDoc it constrains
(never an issue number there — `riviera-java-conventions` §6d), or on the issue.

**Merging needs seven green required checks.** The `Riviera Rule Set` ruleset on `main`
requires these status-check contexts by exact name: `Backend (build + test)`,
`Frontend (lint + test + build)`, `Repo hygiene (diff-scoped)`, `Analyze (java-kotlin)`,
`Analyze (javascript-typescript)`, `CodeQL`, and `SonarCloud Code Analysis`. Renaming a
job in `ci.yml` without the matching ruleset edit makes every PR unmergeable (#413/#420,
#539), which is why those job names carry DO-NOT-RENAME comments.

**CI runs guards you can't guess from the framework docs.** Alongside the backend
and frontend jobs, a `Repo hygiene (diff-scoped)` job hard-gates your diff with five of
the [`scripts/check-*.mjs`](scripts/) guards: no multi-line inline comments (RV-STYLE-1),
each plan doc lists the files its diff changed (#533), no stranded focus postures (#621),
touch targets declared (#648), and the cloud setup script's Node pin still matching
[`.nvmrc`](.nvmrc) (#659). Run any of them locally the way CI does —
`node scripts/check-inline-comments.mjs --diff origin/main` — and note the first
four only judge *your diff*, so they stay quiet until you've committed something.

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
  `application.*`/`domain.*`/`adapter.*`.
- **#12 Schema changes go through Flyway** — versioned forward migrations under
  `src/main/resources/db/migration`. No hand-run DDL.
- **#13 Venue-scoped operations verify the actor owns the venue.** Object-level, not
  role-level: on every `/api/venues/{venueId}/**` operation the authenticated
  operator must own the path `venueId` (`403` otherwise), checked in the
  **application service** so no driving adapter can bypass it. The `OPERATOR` role is
  necessary, never sufficient.

## 6. Using Claude Code in this repo

This repo ships **repo-scoped skills** under [`.claude/skills/`](.claude/skills/)
that load automatically when you work here with Claude Code. The ten `riviera-*`
ones are written for this project; the rest are vendored from upstream and pinned in
[`skills-lock.json`](skills-lock.json) (refresh them through that file, don't hand-edit
a vendored skill):

- **`riviera-sdlc`** — the spec-driven-development orchestrator; routes each stage
  (refine → issue → plan → implement → CI → review → merge) to the right skill.
- **`riviera-plan-doc`** — plan-doc discipline (load alongside the planning flow).
- **`riviera-review-overlay`** — turns the invariants into review gates.
- **`riviera-stripe-payments`** — the locked payment model; load it for any
  `payment`/`payout` or Stripe work.
- **`riviera-java-conventions`** — backend Java idioms (JDBC-only, records, typed
  outcomes, Java 25); load before writing/refactoring any Java.
- **`riviera-modulith`** — the Spring Modulith structure authority (module layout,
  `api/` boundaries, events vs ports); load before any backend structural change.
- **`riviera-frontend`** — the frontend structure authority (which folder a file
  belongs in, import direction, lazy routes); load before adding or moving anything
  under `frontend/src` or `frontend/e2e`.
- **`riviera-tailwind`** — how to write the styling (Tailwind v4 is the default;
  SCSS needs a stated justification); load before styling anything.
- **`riviera-local-debug`** — the build/test recipes, including the cloud-session
  and single-test variants; load before the session's first `./gradlew` or `npm`.
- **`riviera-docs-freshness`** — the staleness audit for these substrate docs; load
  at merge close-out and at every epic close-out.
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

## 8. Licensing

This repo is **proprietary** — see [`LICENSE`](LICENSE). Contributions are accepted
only from people authorized by the owner, and by opening a pull request you grant the
owner the rights set out in section 5 of that file. If you're adding a dependency,
check its license is compatible with shipping it in a closed-source product, and say
which license it carries in the PR.
