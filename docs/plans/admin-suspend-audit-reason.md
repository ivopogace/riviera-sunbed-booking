# Admin suspend: optional audit grounds Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The operators tab's suspend confirmation collects optional free-text grounds that
ride the `X-Audit-Reason` header into the #507 admin audit trail, so a suspension's audit
row can carry a *why* — today it is always `null`.

**Architecture:** Frontend-only mirror of the photo-takedown reason pattern (#507 Phase 4):
the reason is component state (a signal) collected inside the existing inline confirmation,
passed to the service, which sends it as a sanitized `X-Audit-Reason` header — no backend
change, because the #507 edge filter already records the header for every mutating
`/api/admin/**` action. The slice also adopts #505's focus-management pattern for the two
confirmation transitions it touches (arm/cancel), closing the recurring WCAG 2.4.3
stranded-focus class on this surface.

**Persistence:** JDBC only (invariant #1). N/A — no schema change; `admin_audit_record`
(V38) already stores the reason.

**Source of intent:** GitHub issue #519 (the residue of #325, closed as superseded by #507).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — resolved the
issue's reinstate judgment-call to suspend-only, surfaced the stranded-focus class the issue
missed, confirmed no in-flight overlap) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger over the confirmation cluster) · `tdd` (each phase red→green:
service spec, component specs, e2e) · `riviera-review-overlay` (review gate — after
ready-for-review) · `riviera-docs-freshness` (ran over the slice diff — 0 findings: no
substrate doc states "only the photo takedown collects grounds"; CLAUDE.md's takedown
sentence stays true) · `riviera-frontend` (placement: all files stay in `admin/`; e2e in the
CI-safe mocked suite) · `angular-developer` + angular-cli MCP (`list_projects` +
`get_best_practices`: v22, signals, native control flow; single optional input handled as a
plain input like the photos precedent, not Signal Forms) · `riviera-tailwind` (the input
mirrors the photos reason-input utility classes verbatim — no new styling surface) ·
`playwright-cli` (e2e authoring: `waitForRequest` to observe the header on the wire instead
of a second competing route) · `riviera-local-debug` (scoped Vitest/Playwright runs; CI owns
the full suite)

**Branch:** `claude/sdlc-325-staleness-check-8reb9o` — the session's designated remote
branch stands in for `feature/admin-suspend-audit-reason` (cloud-session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an armed suspend confirmation with grounds typed, when the admin
  confirms, then the suspend command carries the trimmed grounds and the HTTP request
  carries them as `X-Audit-Reason`. *Pinned by:*
  `admin-operators.spec.ts` "passes typed grounds to the suspend" +
  `admin-operators.service.spec.ts` "sends typed grounds as the X-Audit-Reason header".
- [ ] **AC-2:** Given no grounds (or blank/whitespace-only), when the admin confirms, then
  the request carries **no** `X-Audit-Reason` header. *Pinned by:*
  `admin-operators.service.spec.ts` "sends no header when the grounds are blank".
- [ ] **AC-3:** Given grounds containing non-Latin-1 characters, when sent, then each such
  character becomes a space (header values must be Latin-1; the request must not abort).
  *Pinned by:* `admin-operators.service.spec.ts` "replaces non-Latin-1 characters".
- [ ] **AC-4:** Given grounds typed and the confirmation dismissed, when it is re-armed,
  then the field is blank and an unstated reason stays unstated (no header). *Pinned by:*
  `admin-operators.spec.ts` "does not carry grounds typed for one suspension into the next".
- [ ] **AC-5:** Given the confirmation arms, then focus moves onto the confirm button;
  given it is dismissed, focus returns to the row's Suspend button (WCAG 2.4.3). *Pinned
  by:* `admin-operators.spec.ts` focus cases.
- [ ] **AC-6:** Given the full console flow, when an admin suspends with typed grounds,
  then the browser's suspend request observably carries the header, and the armed
  confirmation (now containing a labelled input) is axe-clean. *Pinned by:*
  `admin-operator-suspension.e2e.ts` (extended first test).

## Non-goals

- **A required reason** — optional at Phase 1, matching #507's takedown decision.
- **Reason capture on reinstate/approve/reject** — reinstate is restorative and one-step
  (no confirmation exists to hang an input on); approve/reject prompts add friction for no
  forensic value. The #507 audit rows still record all four actions.
- **Post-action focus parking** — after *any* of the four actions settles, the list
  reconciles and focus strands; that pre-existing class spans approve/reject/reinstate too
  and deserves its own generalization decision, not a rider here (recorded in the
  Generalization-audit log).
- **Any backend change** — `AdminAuditFilter` + `AdminAuditReasons` already record and
  sanitize the header.

## Behavior-parity ledger (retirement / replacement slices only)

The confirmation cluster is *modified*, not replaced; the ledger keeps its behaviors honest:

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| First Suspend click only arms; no server call | preserved | `confirmingId` arming unchanged; spec re-asserts |
| Confirm click calls `suspend(id)` then reconciles both lists | preserved (signature widens) | `act()` unchanged; service gains optional 2nd arg |
| Cancel disarms without a server call, Suspend button returns | preserved | unchanged; spec re-asserts |
| Buttons disable while any action is in flight (`actingId`) | preserved | input is not disabled mid-flight — it is gone (cluster closes on confirm), matching photos |
| Focus after arm/cancel | changed (was: stranded on `<body>`) | #505 `focusAfterRender` pattern — arm → confirm button, cancel → Suspend button |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Non-Latin-1 grounds abort the whole request (fetch rejects non-ISO-8859-1 header values) | med | high | mirror the photos sanitize: `replace(/[^\x20-\x7e\xa0-\xff]/g, ' ')` + trim; header only when non-blank; AC-3 pins | session | open |
| R-2 | Grounds leak from one confirmation into the next (stale signal) | med | med | single `suspendReason` signal cleared on arm, cancel, and settle; AC-4 pins | session | open |
| R-3 | e2e header assertion races the stateful lifecycle mock (a second `page.route` would shadow it) | med | low | observe via `page.waitForRequest` predicate — reads the request without touching routing | session | open |
| R-4 | Sonar new-code coverage: service header logic untested if only component specs (which stub the service) are added | med | med | dedicated `admin-operators.service.spec.ts` with `HttpTestingController` | session | open |

## Open questions / Assumptions

### Resolved

- **Reinstate too?** (issue #519 left it a judgment call) → **Suspend-only.** Reinstate has
  no confirmation step to hang an input on and is restorative; adding a confirmation would
  be scope creep. Resolved at the intake grill, this doc.
- **Assumption:** the backend accepts `X-Audit-Reason` on `/api/admin/operators/{id}/suspend`
  with no CORS/header friction → verified: same-origin app; `AdminAuditFilter` reads the
  header on every mutating `/api/admin/**` request (`AdminAuditFilter.java:88`).

## Availability & concurrency (invariant #2)

N/A — does not affect availability; no booking/map/availability surface in scope.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. (The consuming backend surface, #507's edge filter, is untouched.)

### Module ownership (§4a)

All in the frontend `admin/` feature; no boundary change. (FE mirror: `admin/` imports only
`core/`/`shared/` — unchanged.)

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-operators.ts` | existing | standalone component | signals (`suspendReason` added); `focusAfterRender` via `afterNextRender` + `Injector` | plain input (photos precedent; not Signal Forms — single optional field) |
| FE-2 | `admin/admin-operators.service.ts` | existing | `@Service()` HTTP client | stateless | — |
| FE-3 | `admin/admin-operators.service.spec.ts` | new | unit spec (`HttpTestingController`) | — | — |
| FE-4 | `frontend/e2e/admin-operator-suspension.e2e.ts` | existing | CI-safe mocked e2e | — | — |

**Standards:** standalone, `inject()`, `@if`/`@for`, signals; the reason input mirrors the
photos tab's markup (label `for`/`id` pair, `maxlength="500"`, identical utility classes).

## FE↔BE contract

No contract change — `X-Audit-Reason` is an existing optional request header consumed by
the #507 edge filter (sanitized server-side by `AdminAuditReasons`, ≤500 chars).

## Execution status

**Stage pointer:** implement (phase 2 green, committing)

**Next action:** Phase 3 — extend the e2e (grounds on the wire + axe).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | e5d9724 |
| 1 — service: optional grounds → header | ✅ | b3ea6d6 |
| 2 — component: input + clearing + focus | ⏳ | |
| 3 — e2e: header on the wire + axe | | |
| 4 — close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `frontend/src/app/admin/admin-operators.service.ts` — `suspend(id, reason?)`; sanitize + conditional header (mirror `admin-venue-photos.service.ts#takedown`)
- `frontend/src/app/admin/admin-operators.service.spec.ts` — new; header present/absent/sanitized via `HttpTestingController`
- `frontend/src/app/admin/admin-operators.ts` — reason input in the confirm cluster; `suspendReason` signal; `focusAfterRender`
- `frontend/src/app/admin/admin-operators.spec.ts` — grounds passed / cleared / focus cases
- `frontend/e2e/admin-operator-suspension.e2e.ts` — fill grounds, `waitForRequest` header assertion; armed-state axe already present

---

## Phases

> Compressed per plan-doc proportionality (the #507 precedent): each phase is TDD (failing
> test → minimal change → scoped run → commit + status update). Scoped commands:
> `npx vitest run src/app/admin/admin-operators.service.spec.ts` (and the component spec);
> `npx playwright test e2e/admin-operator-suspension.e2e.ts` for phase 3. Full suites are CI's.

- [ ] **Phase 0 — plan doc:** commit this document.
- [ ] **Phase 1 — service:** `admin-operators.service.spec.ts` (red: typed grounds → header;
  blank → no header; non-Latin-1 → spaces) → widen `suspend(id, reason?)` (green).
- [ ] **Phase 2 — component:** extend `admin-operators.spec.ts` (red: grounds passed to the
  service trimmed; blank → single-arg call; cleared on cancel/re-arm; focus on arm/cancel)
  → template input + `suspendReason` + `focusAfterRender` (green).
- [ ] **Phase 3 — e2e:** extend `admin-operator-suspension.e2e.ts` — fill "Reason
  (optional)", assert the suspend request's `x-audit-reason` via `waitForRequest`; the
  existing armed-state axe check now covers the labelled input.
- [ ] **Phase 4 — close-out:** docs freshness over the slice diff, self-review checklist,
  finalize this section citing the PR.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-05 | plan (grill) | stranded focus on action-button swap (WCAG 2.4.3, #148/#351/#462/#505 class) | grep `focusAfterRender` under `src/app` + read `admin-operators.ts` transitions | arm/cancel (this slice's cluster) + post-action settle on all four actions | fix arm/cancel here (touched surface); post-action parking deferred as a Non-goal — its own decision, spans approve/reject/reinstate |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..5:** scoped Vitest runs green at the phase commits.
- [ ] **AC-6:** scoped Playwright run green at the phase-3 commit.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1 — no backend code at all).
- [ ] **Availability** N/A justified (invariant #2).
- [ ] **Modulith** N/A justified (invariant #11).
- [ ] **Payment/payout** N/A justified.
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** per `references/pr-gates.md` §1 + `riviera-review-overlay`.
