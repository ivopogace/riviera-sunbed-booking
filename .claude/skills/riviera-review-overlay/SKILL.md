---
name: riviera-review-overlay
description: Project-specific review overlay for the riviera-sunbed-booking repo. Layers onto an active code review (the code-review plugin's /code-review, /review, or another active review engine) to add the RV-BE/RV-FE/RV-CT bank items built from the CLAUDE.md invariants — availability, payments, Modulith boundaries, money/timezone, per-venue authorization. Load whenever reviewing a diff or PR in this repo; it adds bank items, it does not run a review on its own.
---

# Riviera review overlay

## Purpose

A code review (today the `code-review` plugin's `/code-review` / `/review`;
historically the superpowers `*-review-interview` skills) walks its own generic
FE/BE/contract banks. This overlay layers in the **riviera-specific** items — the
`CLAUDE.md` invariants turned into checkable review gates (cited, never restated). It is **content**, not a workflow: bank items, severity hints, and
verification commands contributed to an active review.

## Activation

Load when **both** hold: a review is **active** (`/code-review` / `/review`, or
whatever review engine is running), **and** the work is in the
riviera-sunbed-booking repo (a `CLAUDE.md` with the riviera invariants /
`.claude/skills/riviera-*`, or an `AGENTS.md`/`CLAUDE.md` referencing
`ai.riviera.platform.*` modules). This overlay **never runs alone** — it layers
onto an active review; honor an explicit user invoke by starting the review first.
In the `riviera-sdlc` flow, starting the review is your duty — via the invocation
ladder in riviera-sdlc's `references/pr-gates.md` §1 (`/review <PR>` only as the
degraded fallback); see riviera-sdlc's **Review gate**.
`/security-review` doesn't auto-load this overlay; consult the reference files directly.

When loaded, announce: *"riviera-review-overlay loaded. Adding project-specific bank items."*

## What the overlay adds — reference files loaded by scope

Three reference files hold the bank items, loaded **by the diff's scope** so a
frontend-only review never pays for the backend bank:

- **Backend diff** → `references/backend-conventions.md` — the full backend bank
  (RV-BE-1..18: JDBC-only, Modulith boundaries, availability/concurrency,
  money/timezone, auth, error contract, responsibility placement, package shape,
  Flyway, session lifecycle).
  If the diff changes any **wire shape** (an endpoint, a request/response DTO, an
  error body) — even with no frontend file touched — also load `references/fe-be-contract.md`.
- **Frontend diff** → `references/frontend-conventions.md` — Angular standards,
  beach-map stale-availability handling, money/date rendering, no client secrets,
  and **RV-FE-8** (no *new* cross-feature folder import — the FE mirror of RV-BE-3;
  the frozen set is `riviera-frontend`'s residual table: five behavioral edges
  left after #489 moved the vocabulary to `shared/`).
- **Fullstack diff** → both of the above, plus `references/fe-be-contract.md` —
  API typing, money/date on the wire, webhook-vs-redirect, idempotency.

## Highest-stakes items (call them out every time)

- **RV-BE-1 Availability single-source-of-truth (invariant #2).** Checked first on
  any diff touching `booking`/`availability`/the beach map — a miss is the
  double-booking bug. Default **Blocker**. Full item: `references/backend-conventions.md`.
- **RV-CT-3 / RV-BE-7 Payment confirmation source (invariant #8).** A booking is
  confirmed only on a signature-verified webhook, never the client redirect. Default
  **Blocker**. Full items: `references/fe-be-contract.md` / `references/backend-conventions.md`.
- **RV-BE-9 Per-venue authorization / BOLA (invariant #13).** A touched venue-scoped
  surface must verify the operator owns the path `venueId` in the **application service**
  (`assertOwns`, pinned by `CrossVenueDenialIT`). Default **Blocker**. Full item: `references/backend-conventions.md`.

## RV-STYLE-1 — inline comments are one-liners, or they are not written

An inline code comment must fit on **one line**. If it doesn't fit, don't write it — cut it, or make
the code say it instead (a named constant, an extracted function, a clearer signature). A multi-line
inline comment in the diff is a **Minor** finding; the fix is to shorten it to one line or delete it.

Scope: **inline comments** — `//` / `#` / `/* … */` / `<!-- … -->` sitting inside a body, a template,
or between statements. **Doc comments are exempt**: Javadoc/TSDoc (`/** … */`) on a type, port,
method, or field is the repo's documented convention (`riviera-java-conventions`, and every module's
`api/` surface depends on it) and stays as long as it earns its length. Applies to what the diff
writes; don't reflow untouched comments to satisfy it.

**Don't walk this by hand — run the guard** (#529, after the item was raised on eight consecutive
PRs): `node scripts/check-inline-comments.mjs --diff origin/main` lists every multi-line inline
comment the diff wrote, and the same check runs from a `PostToolUse` hook while the author edits
and as a CI job on the PR. A clean run discharges the mechanical half of this item.

What it does **not** cover, which is what this item is still for:

- **`#` files** (shell, YAML, `.properties`) and **SQL `--`** are outside the tool's four languages
  — `#` because every such file here carries multi-line header prose as its convention, SQL because
  F-6 on PR #522 declined exactly that, citing `V9__payout_ledger.sql`. Judge these by eye, and
  lean toward leaving them alone.
- **A one-line comment that shouldn't exist at all.** The rule's other half is "default to zero
  inline comments in a method"; the guard counts lines, it cannot weigh whether the *why* was
  already available from the code.

The guard is diff-scoped by construction, so it will never flag the pre-existing multi-line blocks
in `SecurityConfig` or `styles.scss` — and neither should you.

## RV-STYLE-2 — formatting is machine-checked; don't review it by hand

`frontend/.prettierrc` is enforced by a **diff-scoped** guard (#615), so a formatting comment on a
frontend diff is either redundant with a gate that already ran or wrong. Two rules follow:

- **Don't hand-flag `printWidth`, quote style, or wrapping** in `frontend/`. If the line is really
  misformatted, the `Format (diff-scoped Prettier, hard gate)` step in the frontend job has already
  failed the PR and named it — the raised-and-fixed round trip on PR #520 and the raised-and-rejected
  one on PR #612 are the two the guard exists to retire. Green means *the guard passed on the lines
  it could read*, which is not quite "every line is fine": a file Prettier cannot parse is skipped
  with a stderr warning nobody sees inside a green step, and a file whose parser it cannot infer is
  skipped silently. So a long line in a **`.html` template or an exotic file type** is still worth a
  glance; a long line in a `.ts` the guard demonstrably read is not.
- **Never ask for a whole-file reformat.** 200 of the tree's files carry pre-existing drift, and
  reformatting one to land an unrelated change buries the change — the call PR #612's review got
  right. The guard judges only the lines the diff wrote, and `npm run format:check -- --fix`
  rewrites only those, so "run Prettier on it" is never the correct ask.

Outside `frontend/` there is no Prettier config at all (`resolveConfig` returns null for `scripts/`,
`docs/` and `platform/`), so formatting there is a matter of matching the surrounding file — judge it
by eye, and lean toward leaving it alone.

## RV-PROC-1 — skill-routing gate honored (when a plan doc is in scope)

Cross-check the plan doc's **Skills consulted** line against what the diff actually
touches, per the `riviera-sdlc` **Skill-routing table** — that table is the
authority; do not re-list it here. A touched area with no matching skill listed (or
no such line at all) is a **Major** finding — the design was likely anchored from
first principles; load the missing skill, re-vet that section, update the line.
Re-walk on **every re-review, including review-fix commits** — fixes change the diff.

## Verification commands surfaced

Backend:
- `./gradlew build` — no JPA on the classpath (a build pulling
  `spring-boot-starter-data-jpa` is itself a finding)
- `./gradlew test --tests "<package>.<ClassName>"` for targeted tests; `--tests
  "*ModularityTests*"` if module structure changed (Modulith verification is a test, not a Gradle task)

Frontend (run in `frontend/`):
- `npm run lint`; `npm run build` if production-build risk
- `npm test` — Vitest via `@angular/build:unit-test` (Angular 22+), once in jsdom;
  NOT Karma — there is no `--browsers=ChromeHeadless` flag

## Red flags specific to this repo

| Thought | Reality |
|---|---|
| "Two reservations rarely collide; a check-then-insert is fine." | Check-then-insert races. Needs a unique constraint + row lock / `ON CONFLICT` (invariant #2). |
| "The frontend confirmed payment, mark the booking paid." | Confirm only on a signature-verified webhook (invariant #8). |
| "I'll use Stripe Connect to pay the venue." | No Connect (invariant #8) — collect-only + manual BKT payout (invariant #9). |
| "Booking codes can be sequential ids." | Unguessable bearer credential (invariant #7). |
| "`gradlew.bat` flipped CRLF→LF — that's corruption, revert it." | Check `.gitattributes` at every level (incl. `platform/.gitattributes`) first: `*.bat text eol=crlf` stores the blob **LF** and checks out CRLF, so an LF blob is the **correct** normalized form — don't "revert" it (git re-normalizes on `add`). Only a wrong **working-tree** EOL is a real finding (PR #37). |

The authoring-idiom red flags (JPA/Lombok, float money, JVM-default-zone time,
cross-module service calls, multi-line comments, …) live in the full table in
`riviera-java-conventions` — stated once there, checked here via the bank items.

## Output integration & done criteria

- Pre-impl checklist: fill the single top-level `### Riviera overlay (if loaded)`
  section (after the FE↔BE contract section), one bullet per item, ✅/❓/⛔. Peer-review
  notes: fill the `### Riviera overlay` subsection under `## Convention checks`; append `### Recommended riviera skills` on any hand-off.
- Done when every item in the scope-loaded reference files is checked (✅/❓/⛔
  pre-impl, ✅/❌/➖ peer-review) and the three highest-stakes items are addressed
  whenever their domain is touched.
- RV-BE-11 checked whenever the diff adds or moves behavior (plan's Module-ownership
  table reconciled against where the code landed); RV-BE-12 whenever it adds or
  moves packages (ADR-0007 two-template layout).
- Hand-offs listed if they apply; verification commands included when relevant.

## Hand-offs & integration

Surface these in the output — the overlay recommends, it does not execute:

- Payment/payout details → `riviera-stripe-payments` (holds the rationale).
- Plan-doc discipline gaps (missing AC, stale execution status) → `riviera-plan-doc`.
- Module-boundary questions → `codebase-design`; the invariant #11 gate here is the check.
- Java idiom violations (JPA, Lombok, field injection, `null` from a port, a public
  JDBC adapter) → `riviera-java-conventions`; the overlay flags the breach.

Not for use outside the riviera-sunbed-booking repo — the items assume its invariants.
`riviera-sdlc` loads this overlay at its Review gate; `triage` manages the issue/PR
lifecycle around the review.
