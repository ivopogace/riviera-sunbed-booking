# Admin console Refunds tab (#460) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Give the #454 refund-outbox re-drive its missing button — a `/admin/refunds`
console tab on the Email tab's exact pattern, showing the outstanding count and driving
`POST /api/admin/refund-outbox/resubmit` with all three typed outcomes rendered honestly.

**Architecture:** The one real decision is *how* to mirror: #454's own Sonar gate failed
(F-3) when the refund lever copied the mail lever's once-only policy verbatim, and was
fixed by extracting the shared mechanism (`shared.ResubmissionThrottle`). The frontend
mirror walks into the same trap — a copied component class body is a duplicated block
under the 0-duplicated-blocks merge bar — so this slice extracts the shared lever state
machine (`admin/admin-outbox-lever.ts`: status/loading/loadError/busy/notice signals +
load/resubmit/reconcile/describe) and has **both** tabs delegate to it. The untouched,
still-green mail specs are the parity proof for the Email-tab refactor.

**Persistence:** JDBC only (invariant #1). No tables/migrations touched — frontend-only.

**Source of intent:** GitHub issue #460 (from #454's deliberate backend-only scope);
wire shapes: `docs/plans/refund-outbox-resubmission.md` §FE↔BE contract, verified against
`AdminRefundOutboxController` on `main`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
the #454 wire shapes byte-for-byte on `main`, found no in-flight overlap, surfaced the
F-3 duplication precedent that shaped the architecture) · `riviera-plan-doc` (this
template — forced the behavior-parity ledger for the Email-tab refactor) · `tdd` (each
phase: failing spec first, component/e2e specs before implementation) ·
`riviera-review-overlay` (review gate — runs when the PR goes ready-for-review) ·
`riviera-docs-freshness` (ran over `origin/main...HEAD` pre-merge — counting sweep
caught 2 stale tab-count facts in untouched TSDoc (`admin-console-tabs.ts` "two tabs",
`admin-mail-outbox.ts` "a third tab"), both patched; + 1 runbook pointer
(`observability.md` now names the `/admin/refunds` button); renamed `Mail*View` types
have zero substrate hits) · `riviera-frontend` (placement: everything in the existing `admin/` feature
folder, flat; route in `app.routes.ts`, lazy + titled; e2e in the CI-safe mocked suite)
· `riviera-tailwind` (test-hook/testid convention, `text-[Npx]` idiom, porcelain tokens
reused verbatim from the Email tab — no new styles invented) · `angular-developer` +
angular-cli MCP (`list_projects` → v22 workspace; `get_best_practices` → signals,
`@Service`, inline template, native control flow, no `standalone:`/`OnPush` noise) ·
`playwright-cli` (e2e authoring: stateful `page.route` mock, role/testid locators, the
shared `expectNoSeriousAxeViolations` policy) · `codebase-design` (loaded at the review
gate's fix round per F-1 — re-vetted the `OutboxLever` seam: small interface, two real
adapters at `AdminOutboxPort`, deletion test holds; design confirmed unchanged) ·
`domain-modeling` (same round — the slice consumes #454's vocabulary, introduces no new
term; no CONTEXT.md/ADR change).

**Branch:** `claude/admin-refunds-tab-2q8qq7` — the session's designated remote branch
stands in for `feature/admin-refunds-tab` (riviera-sdlc cloud addendum), cut from
`main@c6e31d1` (includes PR #459's backend).

---

## Acceptance criteria (testable)

> Written at the application boundary: the console drives the admin's refund-outbox
> port and reports its typed answers; the HTTP plumbing is the adapter detail.

- [x] **AC-1:** Given a signed-in admin on `/admin/refunds` with a non-empty outbox,
  when they press Resubmit, then the outstanding count was already visible before the
  press, the outcome is announced in the live region, and a `COOLING_DOWN` /
  `ALREADY_RUNNING` answer is reported as a refusal with the retry window — never as a
  failure. *Pinned by:* `admin-refund-outbox.e2e.ts` (mocked CI-safe suite) +
  `admin-refund-outbox.spec.ts` (all three outcomes + the rejected-promise error path).
- [x] **AC-2:** Given a non-admin operator or a signed-out visitor on `/admin/refunds`,
  when the page renders, then no Resubmit control and no tab strip are offered and no
  outbox read is issued — matching the `/admin` self-gate (backend role gate stays the
  authority). *Pinned by:* `admin-refund-outbox.spec.ts` (forbidden / signed-out /
  restoring states) + `admin-refund-outbox.e2e.ts` (signed-out visitor).
- [x] **AC-3:** Given the tab renders in any state (outstanding, empty, post-press),
  when axe runs, then no serious violations, and the tab strip exposes the current tab
  via `aria-current="page"`. *Pinned by:* `admin-refund-outbox.a11y.spec.ts` +
  `admin-console-tabs.spec.ts` + axe passes in `admin-refund-outbox.e2e.ts`.
- [x] **AC-4:** No response field beyond counts/outcome/seconds is rendered or typed —
  the client consumes exactly `{outstanding, cooldownRemainingSeconds}` and
  `{outcome, resubmitted, cooldownRemainingSeconds}` (invariant #7: no booking ids or
  codes, and no invented columns). *Pinned by:* the shared view types in
  `admin.model.ts` (structural — the service compiles against them, no `any`), checked
  by review against the diff.

## Non-goals

- **Any backend change.** The endpoints shipped in #454 (PR #459) and are final here.
- **Per-publication listing** — a #454/#405 non-goal for invariant-#7 reasons (the
  serialized publications are exactly where booking ids live).
- **Commissions/Payouts tabs** — no backend exists; same boundary #405 drew.
- **Polling/auto-refresh of the cooldown** — the window is a server fact rendered at
  answer time; the button stays enabled (the #405 stale-number argument, kept).
- **A generic tab-page layout component** — three tabs still don't justify it (#405
  said the same at two); the shared piece this slice extracts is the lever state
  machine, not the page shell.

## Behavior-parity ledger (Email-tab refactor)

> The Refunds tab is new behavior; the parity obligation is the **Email tab**, whose
> component body is refactored to delegate to the extracted `OutboxLever`. Its own
> specs (`admin-mail-outbox.spec.ts`, `admin-mail-outbox.a11y.spec.ts`,
> `admin-mail-outbox.e2e.ts`) are deliberately **not modified beyond type imports** —
> they are the proof. Every behavior below is asserted by one of them today.

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| Status loaded once, only after restore settles + `isAdmin` | preserved | `effect` + `loaded` flag stay in the component; body calls `lever.load()` |
| Count shown before any press; empty state says so plainly | preserved | `lever.status()` rendered by the unchanged template branches |
| Resubmit disables only for its own round-trip | preserved | `lever.busy()` on the unchanged button binding |
| Three outcomes described; refusals never read as errors | preserved | `OutboxLever.describe` — copy identical; success phrase is the per-tab constructor arg |
| Rejected resubmit → error notice, no count claimed | preserved | `OutboxLever.resubmit` catch — copy identical |
| Post-press reconcile re-reads status; a failed re-read drops the count to unknown instead of overwriting the outcome | preserved | `OutboxLever.reconcile` — same try/catch shape |
| Initial-load failure → `role="alert"` + Retry | preserved | `lever.loadError()` + `lever.load()` on the unchanged template branch |
| Nested #380 delivery card renders inside the admin branch | preserved | untouched — stays in the mail template only |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Sonar duplicated-blocks between the two outbox surfaces (the exact F-3 trap from #454, now in TS) | high (if mirrored naively) | high (0-duplicated-blocks merge bar) | Extract `OutboxLever`; both components delegate; shared view types in `admin.model.ts` replace a third copy of the wire shapes | session | closed — Sonar on PR #461: 0 duplicated blocks, 0.0% density (API-verified, `new_lines: 326`) |
| R-2 | The Email-tab refactor silently drops a shipped behavior (the O6 #176 class) | low | high | Behavior-parity ledger above; mail specs/e2e untouched beyond type imports and must stay green | session | closed — mail specs untouched & green (950/950); review agent 3 verified the ledger against the pre-refactor history |
| R-3 | AC-4 drift — client invents fields the contract doesn't carry (invariant #7) | low | med | Typed views only, no `any`; template renders `outstanding`/`resubmitted`/seconds/outcome copy exclusively; review checks | session | closed — overlay walk verified types byte-for-byte against `AdminRefundOutboxController` |
| R-4 | Tab-strip active-state regression (`/admin` is a prefix of `/admin/refunds`) | low | low | `routerLinkActiveOptions {exact:true}` already set; tabs spec gains the third route + assertions | session | closed — tabs spec + e2e assert `aria-current` isolation both ways |
| R-5 | Frontend dependency PRs (Dependabot #332–#341) merge mid-slice and conflict on `package-lock` | low | low | None shared with this diff's files; merge-from-main before ready-for-review per SDLC | session | closed — merged `origin/main` pre-ready; nothing had landed |

## Open questions / Assumptions

(none open)

### Resolved

- **Assumption:** success copy for the refund lever reads "Handed N back to be
  retried." — the mail tab's "for delivery" is mail-specific; the refund listener
  re-attempts the gateway call, so "retried" is the honest verb. Copy is a
  self-decided naming/style call per plan-doc rule 2. → shipped as assumed in
  `b14cc2a` (component + specs + e2e all pin the phrase).

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` Frontend-only; the lever re-drives existing
`BookingCancelled` publications, and even on the backend the #454 sweep is scoped to the
refund listener's exact id, never touching availability writes.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No backend code in scope; the consumed endpoints shipped in #454.
Module ownership: all files land in the existing `admin/` feature folder (the
`riviera-frontend` taxonomy), importing only `core/` (`OperatorAuth`) and `shared/`
(`CardGlass`) — no cross-feature import.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment logic in scope on the client.` The tab renders counts, an outcome
token, and seconds; the refund decision/amount stay server-side (#10), the money moves
on `booking`'s own listener, and the re-drive's scoping away from the payment→confirm
spine is pinned server-side by `RefundOutboxScopeIT` (#454). Nothing here re-decides or
re-renders money.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-outbox-lever.ts` | new | plain exported class (no decorator) | signals owned by the class; `effect` stays in components | — |
| FE-2 | `admin/admin-refund-outbox.service.ts` | new | `@Service()` HTTP client | stateless | — |
| FE-3 | `admin/admin-refund-outbox.ts` | new | standalone component, inline template | `inject()`, delegates to `OutboxLever` | none |
| FE-4 | `admin/admin-mail-outbox.ts` | refactor | standalone component | delegates to `OutboxLever`; template branches unchanged | none |
| FE-5 | `admin/admin.model.ts` | modify | shared `OutboxStatusView` / `ResubmissionResultView` replace the Mail-specific pair (one wire shape, deliberately identical on both endpoints) | — | — |
| FE-6 | `admin/admin-console-tabs.ts` | modify | third tab entry (Refunds) | — | — |
| FE-7 | `app.routes.ts` | modify | lazy `/admin/refunds` route + title | — | — |

**Standards:** standalone components, `inject()`, native control flow, signals; no
`standalone:`/`OnPush` flags (v22 defaults); porcelain theme pinned on the host exactly
as the sibling tabs do. No deviation.

## FE↔BE contract

`No contract change` — this slice is the first consumer of the #454 shapes, verbatim:

- `GET /api/admin/refund-outbox` → `{ outstanding: number, cooldownRemainingSeconds: number }`
- `POST /api/admin/refund-outbox/resubmit` → `{ outcome: 'RESUBMITTED'|'ALREADY_RUNNING'|'COOLING_DOWN', resubmitted: number, cooldownRemainingSeconds: number }`
- Client typing: hand-written shared view interfaces in `admin.model.ts`; no `any`.
- Money/date on the wire: `N/A` — counts and seconds only, never a booking id or code
  (invariant #7).

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh
> session, re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `DONE — all gates green; merged via PR #461`

**Next action:** none — slice complete. (Close-out: issue #460 closes via the PR; no
parent epic checklist applies; docs-freshness ran pre-merge and its three patches landed
with the review-fix round.)

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ✅ | `ab33e7c`; draft PR #461 |
| 1 — Shared `OutboxLever` + Email-tab delegation (parity) | ✅ | full `npm test` (935) + lint green; mail specs untouched beyond type imports |
| 2 — Refunds tab: service, component, specs, tab strip, route | ✅ | TDD red (missing module) → green; 950 tests + lint pass; `app.spec.ts` route inventory gained `admin/refunds` (restyled, non-legacy) | 
| 3 — Mocked CI-safe e2e + full frontend verification | ✅ | 4 new e2e green; full mocked suite 104/104; `npm run build` clean (pre-existing SCSS budget warnings only) |
| 4 — Gates + close-out | ✅ | review gate: `/code-review` 5-agent fan-out + overlay walk (F-1..F-3, all fixed); Sonar gate API-verified (0 issues, 0 dup blocks, 92.05% cov); docs-freshness pre-merge (3 patches) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | `/code-review` agent 4 (RV-PROC-1, Major — the #447/#459 recurrence) | `codebase-design`/`domain-modeling` missing from *Skills consulted* though the slice designed a new seam (`OutboxLever`/`AdminOutboxPort`) | fixed — both loaded for the fix round, seam re-vetted (holds), line updated |
| F-2 | `/code-review` overlay agent (RV-STYLE-1, Minor) | Multi-line `/** */` above an `it()` in `admin-refund-outbox.spec.ts` (not a type/method — not TSDoc-exempt) | fixed — collapsed to one line |
| F-3 | `/code-review` overlay agent (RV-STYLE-1, Minor) | Same pattern in `admin-refund-outbox.a11y.spec.ts` | fixed — collapsed to one line |

---

## File structure

- `frontend/src/app/admin/admin-outbox-lever.ts` — the shared lever state machine:
  `OutboxLever` (status/loading/loadError/busy/notice signals; `load`, `resubmit`,
  private `describe`/`reconcile`) over an `AdminOutboxPort`; the per-tab success phrase
  is a constructor argument. The FE mirror of #454's `shared.ResubmissionThrottle`
  extraction.
- `frontend/src/app/admin/admin.model.ts` — `OutboxStatusView` +
  `ResubmissionResultView` (shared wire shape of both outbox endpoints, replacing the
  Mail-specific pair; docs cite both backend records and invariant #7).
- `frontend/src/app/admin/admin-refund-outbox.service.ts` — `@Service()` HTTP client
  for `/api/admin/refund-outbox` (+ `/resubmit`), `implements AdminOutboxPort`.
- `frontend/src/app/admin/admin-refund-outbox.ts` — the Refunds tab: auth self-gate →
  tab strip → glass card (count / empty) → Resubmit → polite live-region notice.
  `data-testid="admin-refunds-*"`.
- `frontend/src/app/admin/admin-refund-outbox.spec.ts` — unit spec: count-first, all
  three outcomes, error paths, reconcile, gates (AC-1/2).
- `frontend/src/app/admin/admin-refund-outbox.a11y.spec.ts` — axe (outstanding/empty)
  + live-region attributes (AC-3).
- `frontend/src/app/admin/admin-mail-outbox.ts` — refactor to delegate to `OutboxLever`
  (template branches byte-identical; class body shrinks).
- `frontend/src/app/admin/admin-mail-outbox.service.ts` — `implements AdminOutboxPort`
  + shared type imports (signature unchanged).
- `frontend/src/app/admin/admin-mail-outbox.spec.ts` / `.a11y.spec.ts` — type-import
  rename only (Mail* → shared names); assertions untouched.
- `frontend/src/app/admin/admin-console-tabs.ts` — third entry
  `{ path: '/admin/refunds', label: 'Refunds', testId: 'admin-tab-refunds' }`.
- `frontend/src/app/admin/admin-console-tabs.spec.ts` — third route + href/aria-current
  coverage.
- `frontend/src/app/app.routes.ts` — lazy `/admin/refunds` route, `title: 'Refunds — Riviera'`.
- `frontend/e2e/admin-refund-outbox.e2e.ts` — CI-safe mocked e2e: stateful refund-outbox
  mock (first press resubmits, later presses cool down), axe at each state, tab-strip
  `aria-current`, signed-out gate.

---

## Phase 1 — Shared `OutboxLever` + Email-tab delegation

**Files:** Create `admin/admin-outbox-lever.ts` · Modify `admin.model.ts`,
`admin-mail-outbox.ts`, `admin-mail-outbox.service.ts`, spec type imports.

- [x] Step 1: consolidate the wire-view types; extract `OutboxLever` with the mail
  tab's exact semantics (the mail specs are the pre-existing failing net: any drift
  turns them red).
- [x] Step 2: refactor `admin-mail-outbox.ts` to delegate; template branches unchanged.
- [x] Step 3: `npm test -- admin-mail-outbox` (both spec files) → green; `npm run lint`.
- [x] Step 4: commit + tick this table.

## Phase 2 — Refunds tab

**Files:** Create `admin-refund-outbox.service.ts`, `admin-refund-outbox.ts`,
`admin-refund-outbox.spec.ts`, `admin-refund-outbox.a11y.spec.ts` · Modify
`admin-console-tabs.ts`, `admin-console-tabs.spec.ts`, `app.routes.ts`.

- [x] Step 1: write the failing unit + a11y specs (mirroring the mail specs' shape,
  refund copy/testids) and the tabs-spec additions → red.
- [x] Step 2: implement service + component + tab entry + route → green.
- [x] Step 3: `npm test` (full — it's one fast jsdom run) + `npm run lint`.
- [x] Step 4: commit + tick this table.

## Phase 3 — Mocked CI-safe e2e + verification

- [x] Step 1: author `frontend/e2e/admin-refund-outbox.e2e.ts` per `playwright-cli`
  best practice on the mail e2e's stateful-mock pattern.
- [x] Step 2: `npm run test:e2e:a11y` locally (Chromium is pre-installed) → green.
- [x] Step 3: `npm run build` → clean.
- [x] Step 4: commit + tick this table; merge latest `origin/main`; mark PR ready.

## Phase 4 — Gates + close-out

- [x] Review gate (`/code-review` per the invocation ladder + `riviera-review-overlay`),
  Sonar gate (issue list, not just the gate), findings re-enter at Implement.
- [x] `riviera-docs-freshness` over the merge range; finalize this doc citing
  `merged via PR #NN`; merge; close-out checklist.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-31 | Phase 4 — docs-freshness counting sweep (third tab = the Nth-instance trigger) | tab-count statements ("two tabs", "third tab") + renamed `Mail*View` types | `grep -rniE '(the\|both\|only) (two\|2)\b…' + "third tab\|two tabs"` over frontend/src, substrate docs | 2 stale facts (`admin-console-tabs.ts`, `admin-mail-outbox.ts`) + 1 runbook enrichment | all 3 patched in the fix round |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `npm test` (refund spec: count-first, three outcomes, error paths) + `npm run test:e2e:a11y` (104/104 incl. the 4 new) → pass. Verified at commit `979ee6a` + fix round.
- [x] **AC-2:** `npm test` (forbidden / signed-out / restoring states; no status read issued) + e2e signed-out test → pass. Verified at commit `979ee6a`.
- [x] **AC-3:** `admin-refund-outbox.a11y.spec.ts` (axe both states + live region) + `admin-console-tabs.spec.ts` (aria-current isolation both ways) + e2e axe passes → pass. Verified at commit `979ee6a`.
- [x] **AC-4:** shared view types carry exactly `outstanding`/`cooldownRemainingSeconds`/`outcome`/`resubmitted`; overlay walk verified byte-for-byte against `AdminRefundOutboxController`; no `any`. Verified at the review gate.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — frontend-only, vacuously true but checked.
- [x] **Availability** section justified N/A (invariant #2).
- [x] **Modulith** section justified N/A; no cross-feature FE import (the FE mirror of #11).
- [x] **Payment/payout** section justified N/A; nothing re-decides money (#10).
- [x] Booking codes: none on this surface (invariant #7 — AC-4).
- [x] **Frontend** standards met; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — invocation ladder + overlay, not the overlay alone.
