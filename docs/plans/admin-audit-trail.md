# Admin Audit Trail (+ console Audit tab) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every mutating `/api/admin/**` action by an authenticated principal writes a
persisted audit record (actor, method, path, outcome status, UTC timestamp, optional
sanitized reason), readable by a platform admin via `GET /api/admin/audit` and browsable
in a new admin-console **Audit** tab; the Photos-tab takedown confirmation collects an
optional reason.

**Architecture:** The audit record is a **composition-root concern, not a bounded
context** — one `OncePerRequestFilter` registered after the security chain records every
mutating `/api/admin/**` request that reached past the gate, so blanket coverage costs
one edge class instead of per-action instrumentation in five modules and no module's
`RESPONSIBILITIES.md` grows a job it shouldn't own. Reason capture is likewise generic:
an optional `X-Audit-Reason` request header (sanitized at the edge), so any admin write
can carry grounds without touching any API's body contract.

**Persistence:** JDBC only (invariant #1). One new table `admin_audit_record` via
Flyway **V38** (verified free on `main` and unclaimed by any open PR — all open PRs are
Dependabot bumps).

**Source of intent:** GitHub issue **#507** (+ ADR-0013, which states the audit record
as a requirement of the report-and-remove stance; re-prioritized by the #511 amendment).
The user explicitly pulled the browse UI **into** scope, superseding the issue's Phase-1
"API/DB-readable is enough" out-of-scope note.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
#507 is `needs-triage` with four open decisions, that no backend exists yet, and that the
UI was originally out of scope; V38 verified free) · `riviera-plan-doc` (this template —
forced the triage decisions to be written down before code) · `tdd` (each phase red→green
on a named test) · `riviera-review-overlay` (review gate — after PR ready-for-review) ·
`riviera-docs-freshness` (ran over the slice at close-out — RESPONSIBILITIES.md/CLAUDE.md
statements "no admin surface logs its action" go stale with this slice) · `postgres`
(BIGINT identity PK, TIMESTAMPTZ, `CHECK`-free text columns, composite read index,
index-the-query-shape) · `riviera-modulith` (confirmed composition-root placement — the
root depends on modules, nothing depends on the root; no new module, no shared-kernel
admission) · `riviera-java-conventions` (records, package-private edge classes, JdbcClient
text-block SQL, §10 log/CRLF-injection guard for the reason header, §6b error contract) ·
`riviera-frontend` (admin/ feature placement, flat lazy routes, tab pattern) ·
`riviera-tailwind` (porcelain admin styling conventions) · `angular-developer` + the
**angular-cli MCP** (`list_projects` + `get_best_practices` for the v22 workspace —
signals, `@Service`, native control flow; the MCP was enabled mid-session at the user's
direction) · `playwright-cli` (mocked-suite e2e spec authoring; suite placement per
RV-FE-E2E).

**Branch:** `claude/angular-mcp-admin-dashboard-wwwjnc` — the cloud session's designated
remote branch stands in for `feature/admin-audit-trail` (riviera-sdlc remote addendum).

---

## Triage decisions (the four #507 open questions, settled)

Recorded here because the issue is `needs-triage` and the user directed the slice to
proceed; these will be posted back to #507 at PR time.

1. **Scope: blanket.** Every mutating (`POST`/`PUT`/`PATCH`/`DELETE`) `/api/admin/**`
   request that reached past the security gate with an authenticated principal is
   recorded, with its response status — including application-level failures. Uniform
   policy is more defensible than an "irreversible only" list and is *less* code (one
   filter vs. per-action instrumentation). Requests rejected by the security chain
   itself (anonymous 401, CSRF 403, wrong-role 403) never reach the filter and are not
   recorded — the audit answers "what did an authenticated principal do past the gate",
   not "who knocked".
2. **Placement: composition root.** An audit of edge-authenticated admin actions is
   edge machinery (the RV-BE-11 family), not a bounded context; no module owns
   `/api/admin/**` as a namespace (its controllers live in five modules *and* the root).
   A new `audit` module would own no aggregate and fail the shared-kernel admission bar.
   The filter, the JDBC writer, and the read controller all live in
   `ai.riviera.platform` (root), like `RateLimitFilter`/`CorrelationIdFilter`.
3. **Reason capture: optional, generic.** A sanitized `X-Audit-Reason` request header
   recorded verbatim-after-sanitization (control chars stripped, trimmed, capped at 500
   chars, blank → NULL). The Photos-tab takedown confirmation gains an optional reason
   field (the #507 comment's suggestion: the confirmation is already a stop). Not
   required — who+what+when is the floor, grounds are encouraged not enforced.
4. **Retention: Phase-1 indefinite, a named non-goal.** The record names an operator
   (not a tourist); ADR-0010's scrub does not reach it, and volume is tiny. A retention
   window (compare #101 Slice 2) is deferred — see Non-goals.

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an authenticated admin session, when a mutating `/api/admin/**`
  action completes (any outcome status), then an `admin_audit_record` row exists with
  the acting principal's username, HTTP method, request path, response status, and a UTC
  `occurred_at`. *Pinned by:* `AdminAuditTrailIT.recordsMutatingAdminActionWithOutcome`
- [ ] **AC-2:** Given the request carries `X-Audit-Reason`, when the record is written,
  then the stored reason is sanitized — CR/LF and control characters stripped, trimmed,
  capped at 500 chars; a blank/absent header stores NULL. *Pinned by:*
  `AdminAuditReasonsTest.sanitizesReasons` + `AdminAuditTrailIT.recordsSanitizedReason`
- [ ] **AC-3:** Given an anonymous or security-rejected mutating request to
  `/api/admin/**`, then **no** audit record is written; given an authenticated admin
  `GET` under `/api/admin/**`, then no record is written either (reads are not audited).
  *Pinned by:* `AdminAuditTrailIT.doesNotRecordAnonymousOrReadRequests`
- [ ] **AC-4:** Given recorded actions, when an admin calls `GET /api/admin/audit`, then
  entries return newest-first with actor/method/path/status/reason/occurredAt; a plain
  `OPERATOR` gets `403`; anonymous gets `401`. *Pinned by:*
  `AdminAuditTrailIT.adminReadsAuditNewestFirst` + `EndpointRoleGateCoverageTest`
- [ ] **AC-5:** Given the admin opens the console's **Audit** tab, then entries render
  (actor, action, outcome, time, reason) with loading/error/empty states and the same
  self-gating as sibling tabs (restoring / signed-out / non-admin). *Pinned by:*
  `admin-audit.spec.ts` + `admin-audit.a11y.spec.ts` + `e2e/admin-audit.e2e.ts`
- [ ] **AC-6:** Given the admin confirms a photo takedown having typed a reason, then the
  `DELETE` carries that reason in `X-Audit-Reason`; with the field left empty, no header
  is sent. *Pinned by:* `admin-venue-photos.spec.ts` (service + confirm-flow cases)

## Non-goals

- **Tamper-evidence** (hash chaining, append-only enforcement) — a determined admin with
  DB access can rewrite history; deliberately out (per #507).
- **Retention/expiry of audit rows** — Phase-1 indefinite; revisit alongside the #101
  retention family if volume or policy demands it.
- **Auditing non-`/api/admin` operator actions** (venue-scoped writes, weather refunds) —
  those are owner-scoped operations under invariant #13, a different accountability model.
- **Recording denied-at-the-gate attempts** (401/403 from the security chain) and
  request bodies — the record is action-level, not a request log.
- **Search/filter/pagination UI** beyond "latest N" — the tab is a recent-actions view;
  the table is queryable by SQL when an investigation needs more.
- **A required reason** on takedown — optional at Phase 1.

## Behavior-parity ledger

N/A — new behavior, replaces nothing. (The Photos-tab change is additive: an optional
field on an existing confirmation; the existing confirm/cancel flow is untouched, pinned
by the existing `admin-venue-photos.spec.ts` cases which must stay green unmodified
except for the new field.)

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Audit insert fails after the action succeeded (write-after design) → action without record | low | med | Insert failure is caught narrowly (`DataAccessException`), logged at ERROR; accepted Phase-1: the audited actions are themselves writes on the same database, so audit-fails-while-action-succeeds needs a mid-request DB failure window. Write-ahead + outcome-update rejected as Phase-1 overkill; noted for a tamper-evidence follow-up if ever built. | edge | accepted (documented here + in the filter Javadoc) |
| R-2 | Filter ordering wrong → runs before security, records anonymous noise / misses principal | low | high | Registered via `FilterRegistrationBean` with an order **after** the security chain (`SecurityProperties.DEFAULT_FILTER_ORDER` is -100; ours is positive); `AdminAuditTrailIT` pins both directions (records admin, skips anonymous). | edge | closed by AC-1/AC-3 tests |
| R-3 | Reason header is an injection vector (CRLF into logs/UI, oversized payload) | med | med | §10 guard: strip control chars, trim, cap 500 before persisting; never logged raw; Angular templates escape on render. `AdminAuditReasonsTest` pins the sanitizer. | edge | closed by AC-2 |
| R-4 | V38 collision with an in-flight PR | low | med | Verified: all open PRs are Dependabot; V38 free on `main`. If a parallel slice appears, whoever merges second renumbers. | plan | closed at grill gate |
| R-5 | `/api/admin/payout-batches` is OPERATOR-gated (not ADMIN) — blanket recording captures operator-actor rows | med | low | Deliberate: the record stores the *actor*, whoever the namespace admitted; the read surface stays ADMIN-only. Documented in the filter Javadoc. | edge | accepted |
| R-6 | New `GET /api/admin/audit` misses a role gate | low | high | Explicit `hasRole(ADMIN)` rule in `SecurityConfig`; `EndpointRoleGateCoverageTest` covers the path. | edge | closed by AC-4 |

## Open questions / Assumptions

### Resolved

- **Assumption:** the user's "create the ui part" implies the full vertical slice
  (backend record + read API + tab), since no audit backend exists to put a UI on —
  *resolved by proceeding; the issue's four triage questions settled per the Triage
  decisions section (user directed continuation without blocking).*
- **Open question:** does adding `X-Audit-Reason` need a CORS change? — *No:
  `WebCorsConfig` allows all headers (`setAllowedHeaders(List.of("*"))`). Resolved at
  plan time.*

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No write path touches
`availability(set_id, booking_date)`; the slice records HTTP-level admin actions and
reads them back. The only concurrency note: concurrent admin actions insert independent
audit rows (append-only, no unique constraint — a log that rejects a duplicate action
record would lie, same reasoning as V36).

## Spring Modulith — modules, interfaces, events

**Modules touched:** none. All new backend code lives in the **composition root**
(`ai.riviera.platform`), which depends on modules and is depended on by nothing
(pinned by `CompositionRootDisciplineTests`/`ModularityTests`). No new `api/`/`spi/`
ports, no events, no `allowedDependencies` change, no shared-kernel admission.

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | *(root — not a module)* | existing | — | Cross-cutting edge concern over `/api/admin/**`; see Triage decision 2 |

**Cross-module named interfaces:** none added.
**Domain events:** none added.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner | Justification |
|---|---|---|
| Record a mutating `/api/admin/**` action (filter + JDBC writer) | composition root | The `/api/admin` namespace's controllers span five modules + the root; no module's Job line covers "the platform's admin accountability record", and `shared`'s admission bar ("no module-owned state") rejects it — `RESPONSIBILITIES.md` §`shared` explicitly leaves composition-root work at the root. Same home as `RateLimitFilter` (edge policy over many modules' endpoints). |
| Read the audit trail (`GET /api/admin/audit`) | composition root | Reads root-owned state; a driving adapter over no module. Sibling precedent: `AdminErasureController`/`AdminOperatorController` live at the root when the surface is platform-wide. |
| Collect a takedown reason in the console | `frontend admin/` feature | The admin console feature already owns the Photos tab; additive field. |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (The filter observes `/api/admin/refund-outbox` presses like
any other admin write; it never touches payment state.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-audit.ts` | new | standalone component (lazy route `/admin/audit`) | signals; load-on-admin-confirmed effect (sibling-tab pattern) | none |
| FE-2 | `admin/admin-audit.service.ts` | new | `@Service()` HTTP client | stateless; component holds state | — |
| FE-3 | `admin/admin.model.ts` | modify | types | `AdminAuditEntryView` added | — |
| FE-4 | `admin/admin-console-tabs.ts` | modify | tab strip | +1 tab (`/admin/audit`, testId `admin-tab-audit`) | — |
| FE-5 | `app.routes.ts` | modify | route table | lazy route + title, `operatorChrome` | — |
| FE-6 | `admin/admin-venue-photos.ts` (+ service) | modify | existing component | reason signal cleared on confirm open/close | single optional text input (no form machinery needed) |

**Standards:** standalone, `inject()`, `@if`/`@for`, signals; a11y per axe (labels on
the reason input, `aria-live` notices, table semantics). Angular-cli MCP
`get_best_practices` loaded for the v22 workspace.

## FE↔BE contract

- **New endpoint:** `GET /api/admin/audit?limit=N` (ADMIN) →
  `[{ id: number, occurredAt: string (ISO instant), actor: string, method: string,
  path: string, status: number, reason: string | null }]`, newest-first; `limit`
  optional, default 50, clamped to [1, 200].
- **New request header** on any `/api/admin/**` write: `X-Audit-Reason` (optional,
  free text ≤500 after sanitization). Sent by the Photos-tab takedown when a reason
  was typed.
- **Client typing:** hand-written typed service (`AdminAuditEntryView` in
  `admin/admin.model.ts`); no `as any`.
- **Dates on the wire:** `occurredAt` as ISO-8601 UTC instant; rendered client-side
  with `DatePipe`.

## Execution status

**Stage pointer:** plan committed → implement (phase 1)

**Next action:** Phase 1 — write `AdminAuditReasonsTest` (red), then V38 + `AdminAuditLog`
+ `AdminAuditFilter` (green); load `riviera-local-debug` before the first gradle run.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ⏳ | |
| 1 — V38 + filter + writer (record path) | | |
| 2 — read API + role gate | | |
| 3 — console Audit tab | | |
| 4 — takedown reason + e2e | | |
| 5 — close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| *(none yet)* | | | |

---

## File structure

**Backend (all root package `ai.riviera.platform`, package-private):**
- `platform/src/main/resources/db/migration/V38__admin_audit_record.sql` — the table + read index
- `AdminAuditLog.java` — JdbcClient writer + reader (one class, two methods; the port
  stays internal — no module calls it)
- `AdminAuditFilter.java` — OncePerRequestFilter; match + sanitize + record-after
- `AdminAuditController.java` — `GET /api/admin/audit`
- `ObservabilityConfig.java` *(or a small `AdminAuditConfig`)* — filter registration after the security chain
- `SecurityConfig.java` — the ADMIN rule for `/api/admin/audit`
- Tests: `AdminAuditReasonsTest.java` (sanitizer, no context),
  `AdminAuditTrailIT.java` (Testcontainers end-to-end), `EndpointRoleGateCoverageTest` row

**Frontend:**
- `frontend/src/app/admin/admin-audit.service.ts`, `admin-audit.ts`,
  `admin-audit.spec.ts`, `admin-audit.a11y.spec.ts` — the tab
- `frontend/src/app/admin/admin.model.ts`, `admin-console-tabs.ts`,
  `admin-venue-photos.ts`, `admin-venue-photos.service.ts` (+ specs), `app.routes.ts` — modifications
- `frontend/e2e/admin-audit.e2e.ts` — mocked-suite e2e + axe

---

## Phases

> Compressed per plan-doc proportionality: each phase is TDD (failing test → minimal
> code → scoped run → commit), with the exact test/code in the diff rather than
> duplicated here; scoped commands per `riviera-local-debug`.

- [ ] **Phase 0 — plan doc:** commit this document.
- [ ] **Phase 1 — record path:** V38; `AdminAuditReasonsTest` (sanitizer red→green);
  `AdminAuditTrailIT` cases AC-1/AC-2/AC-3 (red) → `AdminAuditLog` + `AdminAuditFilter`
  + registration (green). Scoped: `--tests "*AdminAudit*"`.
- [ ] **Phase 2 — read path:** `AdminAuditTrailIT` AC-4 (red) → `AdminAuditController`
  + `SecurityConfig` rule (green); `EndpointRoleGateCoverageTest` updated. Scoped:
  `--tests "*AdminAudit*" --tests "*EndpointRoleGate*"` + the structural net.
- [ ] **Phase 3 — Audit tab:** `admin-audit.spec.ts` + a11y spec (red) → service,
  component, tab row, route (green). Scoped: `npx vitest run src/app/admin`.
- [ ] **Phase 4 — takedown reason + e2e:** `admin-venue-photos.spec.ts` new cases (red)
  → reason field + header (green); `e2e/admin-audit.e2e.ts` (mocked suite, axe). Full
  FE lint+test+build.
- [ ] **Phase 5 — close-out:** docs freshness (RESPONSIBILITIES.md §root note,
  CLAUDE.md's "#507 tracked" wording, ADR-0013's open-consequence row), issue #507
  labels + triage comment, execution-status final state.

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| *(none yet)* | | | | | |

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-4:** `gradle test --tests "*AdminAudit*" --tests "*EndpointRoleGate*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** admin Vitest specs + mocked-suite e2e → PASS.
- [ ] **AC-6:** `admin-venue-photos.spec.ts` reason cases → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A (invariant #2 untouched).
- [ ] Pool + cutoff rules honored (invariants #3, #4 — untouched).
- [ ] **Modulith** section filled; no cross-module imports added; composition-root
      discipline pinned by existing architecture tests (invariant #11).
- [ ] **Payment/payout** N/A.
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone correct: `occurred_at TIMESTAMPTZ`, UTC instant (invariant #6).
- [ ] Booking codes never appear in audit paths recorded (admin namespace only,
      invariant #7).
- [ ] Flyway V38 present; constraints tested via `AdminAuditTrailIT` (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 plus `riviera-review-overlay`, not the overlay alone.
