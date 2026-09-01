---
name: riviera-review-overlay
description: >-
  Riviera-specific review bank items (RV-BE/RV-FE/RV-CT/RV-STYLE/RV-PROC) layered onto an
  active /code-review. Load whenever reviewing a diff or PR in this repo; it adds items to
  a running review, it does not run one.
---

# Riviera review overlay

Bank items, severity hints, and verification commands contributed to an active review. It
is content, not a workflow: it never runs alone. Load when a review is active (`/code-review`
or another engine) and the work is in this repo; on an explicit user invoke, start the
review first (the invocation ladder in `riviera-sdlc` `references/pr-gates.md` §1).
`/security-review` doesn't auto-load this overlay; consult the reference files directly.

When loaded, announce: *"riviera-review-overlay loaded. Adding project-specific bank items."*

## Reference files, loaded by the diff's scope

- **Backend diff** → `references/backend-conventions.md` (RV-BE-1..18: JDBC-only, Modulith
  boundaries, availability/concurrency, money/timezone, auth, error contract, responsibility
  placement, package shape, Flyway, session lifecycle). If the diff changes any wire shape
  (an endpoint, a DTO, an error body) — even with no frontend file touched — also load
  `references/fe-be-contract.md`.
- **Frontend diff** → `references/frontend-conventions.md` (Angular standards, Tailwind,
  forms, beach-map stale-availability handling, money/date rendering, no client secrets,
  e2e suite placement, RV-FE-8 no new cross-feature import, RV-FE-9 focus moves on
  destroy, RV-FE-10 live regions outlive their content, RV-FE-11 field errors name their
  control).
- **Fullstack diff** → both, plus `references/fe-be-contract.md`.

## Highest-stakes items (call them out every time)

- **RV-BE-1 Availability single-source-of-truth (invariant #2).** Checked first on any
  diff touching `booking`/`availability`/the beach map. Default **Blocker**.
- **RV-CT-3 / RV-BE-7 Payment confirmation source (invariant #8).** A booking is confirmed
  only on a signature-verified webhook, never the client redirect. Default **Blocker**.
- **RV-BE-9 Per-venue authorization / BOLA (invariant #13).** A touched venue-scoped
  surface verifies the operator owns the path `venueId` in the application service
  (`assertOwns`, pinned by `CrossVenueDenialIT`). Default **Blocker**.

## RV-STYLE-1 — inline comments are one-liners, or they are not written

An inline comment (`//`, `#`, `/* … */`, `<!-- … -->` inside a body, template, or between
statements) must fit on one line; otherwise cut it or make the code say it. A multi-line
inline comment the diff wrote is a **Minor** finding. Doc comments (Javadoc/TSDoc on a type,
port, method, or field) are exempt. Don't reflow untouched comments.

Run the guard rather than walking it by hand: `node scripts/check-inline-comments.mjs
--diff origin/main` (also a `PostToolUse` hook and a CI job). It is diff-scoped; a clean run
discharges the mechanical half. What it does not cover: `#` files (shell, YAML,
`.properties`) and SQL `--` — judge by eye and lean toward leaving them alone — and a
one-line comment that shouldn't exist at all (the rule's other half is "default to zero
inline comments in a method").

## RV-STYLE-2 — formatting is `prettier --check`'s job, not the reviewer's

The frontend job's Format step runs `prettier --check src e2e` whole-scope, so don't
hand-flag `printWidth`, quote style, or wrapping in `frontend/src` or `frontend/e2e` — a
misformatted line would have failed the PR. A dirty file is fixed with `npm run format`,
never by a review comment. Outside that scope (`scripts/`, `docs/`, `platform/`, and
`frontend/`'s root files — tool- or prose-owned, listed in `.prettierignore`), formatting
is a matter of matching the surrounding file; judge by eye, lean toward leaving it alone.

## RV-PROC-1 — skill-routing gate honored (when a plan doc is in scope)

Cross-check the plan doc's **Skills consulted** line against what the diff touches, per
the `riviera-sdlc` Skill-routing table. A touched area with no matching skill listed (or no
such line) is a **Major** finding — load the missing skill, re-vet that section, update the
line. Re-walk on every re-review, including review-fix commits.

## Verification commands

The command set is CLAUDE.md §Commands. Modulith verification is a test, not a Gradle task
(`./gradlew test --tests "*ModularityTests*"` when structure changed); `npm test` is
Vitest-in-jsdom — there is no `--browsers=ChromeHeadless` flag.

## Red flags specific to this repo

| Thought | Reality |
|---|---|
| "`gradlew.bat` flipped CRLF→LF — that's corruption, revert it." | Check `.gitattributes` at every level (incl. `platform/.gitattributes`) first: `*.bat text eol=crlf` stores the blob LF and checks out CRLF, so an LF blob is the correct normalized form. Only a wrong working-tree EOL is a finding. |

The authoring-idiom red flags (JPA/Lombok, float money, JVM-default-zone time,
cross-module service calls, multi-line comments) live in `riviera-java-conventions`.

## Output integration & done criteria

- Pre-impl checklist: fill the single top-level `### Riviera overlay (if loaded)` section
  (after the FE↔BE contract section), one bullet per item, ✅/❓/⛔. Peer-review notes: fill
  the `### Riviera overlay` subsection under `## Convention checks`; append
  `### Recommended riviera skills` on any hand-off.
- Done when every item in the scope-loaded reference files is checked and the three
  highest-stakes items are addressed whenever their domain is touched.
- RV-BE-11 checked whenever the diff adds or moves behavior (plan's Module-ownership table
  reconciled against where the code landed); RV-BE-12 whenever it adds or moves packages.

## Hand-offs

The overlay recommends, it does not execute: payment/payout details →
`riviera-stripe-payments`; plan-doc gaps (missing AC, stale execution status) →
`riviera-plan-doc`; module-boundary questions → `codebase-design`; Java idiom violations →
`riviera-java-conventions`. `triage` manages the issue lifecycle around the review (PRs
are not a triage surface — `docs/agents/issue-tracker.md`).
