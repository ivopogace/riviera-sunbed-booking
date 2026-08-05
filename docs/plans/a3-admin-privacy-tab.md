# A3 — Admin console Privacy tab Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Give the platform admin a Privacy tab at `/admin/privacy` that actions a data-subject
erasure request by email through a three-stage form → confirm → done flow, collects optional
`X-Audit-Reason` grounds on the irreversible step, explains in an aside exactly what an erasure
erases and what it keeps, and — the whole design constraint — reports an outcome that is identical
whether or not the platform ever held that address.

**Architecture:** The single significant decision is that **the surface has no success/not-found
distinction to render, because the wire has none**. `POST /api/admin/erasure` answers `204` on a real
scrub, on an already-erased subject, and on an address the platform never held (design D-8,
non-enumerating). So the done stage states that property to the admin as a fact rather than showing a
count, and the only failure the page can report is a *rejected request* — never a *missing person*.
Everything else follows the A8 shape: a stateless `@Service` over plain `HttpClient.post`, the
component holding the stage state, `CardGlass` surfaces, and a deliberate focus move on every stage
swap.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only; the backend has existed since #101
(`AdminErasureController` → `customer.api.AccountErasure`) and no schema changes are in scope.

**Source of intent:** epic [#348](https://github.com/ivopogace/riviera-sunbed-booking/issues/348)
(slice A3) — the A8 scope note's four hand-off notes and the Q1 decision comment;
`docs/design/riviera-admin-console.dc.html` (the PRIVACY screen, ~line 586);
`docs/adr/ADR-0010-*` (pseudonymize-in-place, which the aside's copy must stay true to);
`docs/plans/q1-admin-console-tab-ia.md` (tab slot 7); `docs/plans/a8-admin-commissions-tab.md`
(the tab shape this mirrors).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — applied A8 hand-off
note 1 and checked the canvas against the wire: unlike A8's table this panel has no column without a
wire source, so it is buildable as drawn; the gate also caught that the canvas's aside claims
"overwritten in place, not deleted rows", which is ADR-0010's model and had to be verified against
`AccountErasureService` rather than copied on trust) · `riviera-plan-doc` (this template — forced the
Behavior-parity ledger, which is what surfaced that the customer's own erasure UI in
`auth/set-password.ts` is a *precedent to read, not a surface to replace*, so the ledger is N/A and
the Non-goals carry it instead) · `tdd` (each phase writes the failing spec before the component;
every focus guard was re-run with its fix reverted) · `riviera-review-overlay` (review gate — read
**up front** for RV-STYLE-1, the streak A8 broke: every inline comment in this diff is a one-liner;
layered onto the `code-review` fan-out at ready-for-review) · `riviera-docs-freshness` (**due at phase 4**, over
`origin/main...HEAD` — this slice makes the **seventh** console tab, which A8 hand-off note 3
predicts will falsify "the strip ships six" sentences living outside the diff; the run and its
findings are recorded in the Findings register when it happens, not here on trust) · `riviera-frontend` (placement: four files in `admin/`, no import from
`auth/set-password.ts` across features per RV-FE-8, the mocked e2e in `frontend/e2e/`) ·
`riviera-tailwind` (token-first `--riv-card-*` inks, `text-[14px]` not `text-sm`, `CardGlass` carries
no radius so each panel sets its own, the two-column grid collapses by `md:` rather than a media
query) · `angular-developer` + `frontend/.claude/CLAUDE.md` + the **angular-cli MCP**
(`search_documentation` v22 — confirmed `afterNextRender`'s `earlyRead`/`write` phase split is the
documented shape for read-then-write DOM work, per A8 hand-off note 4; Signal Forms for the one
email field, matching `booking-dialog`/`forgot-password`) · `playwright-cli` (the CI-safe mocked
spec, `page.route` recording every request so "no second POST" and "the 204 told us nothing" are
assertions about the wire, not about local UI).

**Branch:** `claude/admin-privacy-tab-a3-57rcu4` — the cloud session's designated remote branch
stands in for `feature/<slug>` (`riviera-sdlc` remote-session addendum). Exists before phase 0.

---

## Acceptance criteria (testable)

> Written at the surface's own boundary: this slice's inner hexagon is the console page + its HTTP
> service against the `POST /api/admin/erasure` contract. The scrub itself (pseudonymize-in-place,
> statutory-retention records kept) is `customer`'s and is pinned by `AccountErasureServiceTest` /
> `AccountErasureIT`; nothing here re-proves it.

- [ ] **AC-1:** Given an admin on `/admin/privacy`, when the page renders, then the erasure form and
  the "What survives an erasure" aside are both present, and the aside names what is erased (name,
  email, phone) and what is kept (bookings, payments, payout ledger entries).
  *Pinned by:* `admin-privacy.spec.ts` › `explains what an erasure erases and what it keeps`
- [ ] **AC-2:** Given a blank or malformed email, when the admin asks to review, then nothing is sent,
  the stage stays on the form, and the field error reads "Enter a valid email address."
  *Pinned by:* `admin-privacy.spec.ts` › `refuses a malformed email without sending anything` and
  › `refuses a blank email without sending anything`
- [ ] **AC-3:** Given a valid email, when the admin asks to review, then the confirm stage replaces
  the form, names the exact address, and **still nothing has been sent**.
  *Pinned by:* `admin-privacy.spec.ts` › `arms a confirmation that names the address, sending nothing`
- [ ] **AC-4:** Given an armed confirmation, when the admin confirms, then the service is called with
  the trimmed address; given grounds were typed, they are passed as the second argument (trimmed);
  given none, the one-argument call is made so no blank header is sent.
  *Pinned by:* `admin-privacy.spec.ts` › `sends the address on confirm`, › `passes typed grounds to
  the erasure`, › `sends no grounds when the field is blank`
- [ ] **AC-5:** Given a completed erasure, when the done stage renders, then it states the
  non-enumeration property explicitly — that the result is the same whether or not the address was
  known — and shows **no** count, no "not found", and no success/absent distinction of any kind.
  *Pinned by:* `admin-privacy.spec.ts` › `states the non-enumeration property on the done stage`
- [ ] **AC-6:** Given grounds typed for one erasure, when the admin starts another, then the grounds
  field and the email field are blank — an unstated reason stays unstated.
  *Pinned by:* `admin-privacy.spec.ts` › `does not carry one request's address or grounds into the next`
- [ ] **AC-7:** Given the erasure request fails, when the response lands, then the confirmation stays
  armed holding what was typed, the failure is announced, and the done stage is not shown.
  *Pinned by:* `admin-privacy.spec.ts` › `keeps the confirmation armed when the request fails`
- [ ] **AC-8:** Given the request is refused `400 INVALID_REQUEST`, when it lands, then the message
  says the platform rejected the address rather than the generic transport failure.
  *Pinned by:* `admin-privacy.spec.ts` › `reports a rejected address distinctly from a transport failure`
- [ ] **AC-9:** Given an in-flight erasure, when the admin looks at the confirmation, then both
  buttons and the grounds field are disabled, so no second POST and no discarded draft is possible.
  *Pinned by:* `admin-privacy.spec.ts` › `locks the confirmation while the erasure is in flight`
- [ ] **AC-10:** Given a non-admin (or signed-out) principal, when the page renders, then no form, no
  tab strip, and no way to reach the endpoint.
  *Pinned by:* `admin-privacy.spec.ts` › `self-gates on the admin session`
- [ ] **AC-11:** Given each of the five stage transitions — form→confirm, confirm→form (cancel),
  confirm→done, done→form (erase another), and confirm→confirm-with-error (a failed request) — then
  focus lands on the panel or control that transition produced, never stranded on `<body>`
  (WCAG 2.4.3, the recurring #148/#351/#462/#505 class).
  *Pinned by:* `admin-privacy.spec.ts` › the five `moves focus…` / `returns focus…` cases, plus
  `e2e/admin-privacy.e2e.ts` › `a failed erasure leaves focus on the confirm button, not on the body`
- [ ] **AC-12:** Given the page rendered at each of the three stages, then axe reports no violations.
  *Pinned by:* `admin-privacy.a11y.spec.ts` (three cases) and `e2e/admin-privacy.e2e.ts`
  (`expectNoSeriousAxeViolations` at 360px)
- [ ] **AC-13:** Given a real render at 360px, when an admin erases a subject, then exactly one POST
  is made carrying exactly `{ email }` plus the grounds header, the page never scrolls sideways, and
  the Privacy pill is the only one marked `aria-current`.
  *Pinned by:* `e2e/admin-privacy.e2e.ts`
- [ ] **AC-14:** Given the console tab strip, when it renders, then `Privacy` appears in slot 7
  (after Photos, before Audit) and the rendered tabs remain a subsequence of
  `ADMIN_CONSOLE_TAB_ORDER`, with the strip still inside its three-row budget at 360px.
  *Pinned by:* the **unedited** `admin-console-tabs.spec.ts` › `renders tabs in the canonical console
  order (Q1, #348)` and the **unedited** `e2e/admin-console-tabs.e2e.ts` ›
  `the tab strip stays within its three-row budget at 360px`

## Non-goals

- **The tourist's own erasure UI.** `POST /api/me/erasure` already has one in
  `auth/set-password.ts` (#101 D5). It is read here for copy and flow precedent and **not imported
  from** — `admin/` may not import another feature (RV-FE-8), and the two surfaces have opposite
  audiences: one erases *yourself* and signs you out, this one erases *someone else* and does not.
- **Any backend change.** The endpoint, its ADMIN gate, its `204`, and its audit record (#507's edge
  filter, which covers `POST` with no instrumentation) all exist. Adding instrumentation here would
  duplicate the audit trail.
- **Telling the admin whether the address was known.** Not a UX gap to fill: it is the property the
  backend deliberately does not expose (design D-8). Any "erased N records" / "no such person" copy
  would re-open the enumeration oracle the `204` closes.
- **Erasure by anything other than an email address** (booking code, name, operator id). The port is
  `eraseByEmail`; a second selector is a backend slice, not a console one.
- **A confirmation typed-to-match ("type ERASE to continue") gate.** The #519 confirm-in-place shape
  is the established pattern for destructive admin actions here, and it is what the canvas draws.
- **Undo, or any local record of what was erased.** The scrub is irreversible by design; the audit
  trail (#507, Audit tab) is where the action is recorded, and that is a different tab.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. `POST /api/admin/erasure` has had **no** UI since #101; the
tourist-side `set-password.ts` erasure is a different endpoint for a different principal and is
untouched by this slice (see Non-goals).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Copy invents a success/not-found distinction the `204` cannot support, re-opening the enumeration oracle (design D-8) | med | high | One outcome path in the component — there is no not-found branch to write; AC-5 pins the non-enumeration sentence and asserts no count is rendered | A3 | open |
| R-2 | Stranded focus on a stage swap — the #148/#351/#462/#505 class, which A8's review fan-out hit **three times**, one of them a half-applied fix | high | med | Five transitions enumerated in AC-11, each with its own spec, and **each guard re-run with its fix reverted** before the phase is called done | A3 | open |
| R-3 | `afterNextRender` written as a bare callback runs in `mixedReadWrite`, which Angular's own docs say never to use when the work divides (A8 hand-off note 4) | med | low | `focusAfterRender` declares `earlyRead` (query) + `write` (focus), copied from `admin-commissions.ts`; verified against the v22 docs via the angular-cli MCP | A3 | open |
| R-4 | A non-Latin-1 character in the grounds aborts the request at the header layer instead of reaching the audit trail | low | med | Sanitize `/[^\x20-\x7e\xa0-\xff]/g → ' '` then trim, and send the header only when non-blank — copied verbatim from `admin-venue-photos.service.ts` | A3 | open |
| R-5 | Double-submit: a second POST for the same address while the first is in flight | low | med | The whole confirmation is disabled while busy (AC-9), matching A8's editor lock | A3 | open |
| R-6 | Inserting the tab out of slot, or pushing the 360px strip to a fourth row | low | med | Insert at slot 7 in `AdminConsoleTabs.tabs`; **no** edit to `admin-console-tabs.spec.ts` or `admin-console-tabs.e2e.ts` — needing one means the insertion is wrong (A8 hand-off note 2) | A3 | open |
| R-7 | The aside's copy drifts from ADR-0010's actual model (pseudonymize-in-place, statutory records retained) | med | med | Copy checked against `AccountErasureService` + ADR-0010 at plan time, and AC-1 pins the two halves so a later copy edit cannot silently drop one | A3 | open |
| R-8 | Docs elsewhere still say the strip ships six tabs — the class A8 hand-off note 3 says lives outside the diff by definition | high | low | Run `riviera-docs-freshness`'s counting sweep over the merge range and patch every site | A3 | open |

## Open questions / Assumptions

- **Assumption:** the client-side format check is a *convenience*, not a security boundary — the
  server still validates and the `400 INVALID_REQUEST` path is handled. — *Owner:* A3 · *Resolves
  by:* phase 1 (AC-8 pins the server path independently of the client check).

### Resolved

- **Open question:** does the canvas's Privacy panel draw anything without a wire source, as its
  commission table did (A8 hand-off note 1)? — **No.** The panel's only dynamic value is the email
  the admin typed; every other element is static copy or a stage toggle. Verified against
  `AdminErasureController` (request `{ email }`, response `204` / `400`) before phase 0, so this
  screen is built as drawn.
- **Open question:** should the confirm stage's grounds field be required, given the action is
  irreversible? — **No.** #519 and A8 both collect grounds as *optional*, and #507's audit record
  captures actor/method/path/outcome regardless; making it mandatory here would make this one admin
  action stricter than suspension and rate changes for no stated reason.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This surface writes no `availability(set_id, booking_date)` row
and reads none; the erasure it triggers pseudonymizes contact details on `customer`-owned rows and
deliberately leaves every booking row in place (ADR-0010), so no set is ever released or claimed by
it.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is touched: `AdminErasureController`,
`customer.api.AccountErasure` and the `SecurityConfig` ADMIN matcher for `/api/admin/erasure` all
exist and are unchanged.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. An erasure is explicitly *not* allowed to touch the financial records:
ADR-0010 retains bookings, payments and payout-ledger entries under statutory retention and only
detaches the person from them, so no money moves and no ledger entry changes.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-privacy.ts` | new | standalone component | signals (`stage`, `submittedEmail`, `reason`, `busy`, `error`) | Signal Forms (`required` + `email` on the one field) |
| FE-2 | `admin/admin-privacy.service.ts` | new | `@Service()` | stateless — `HttpClient.post` | — |
| FE-3 | `admin/admin-console-tabs.ts` | existing | standalone component | — | — |
| FE-4 | `app.routes.ts` | existing | route table | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()` signal APIs, no
`NgOptimizedImage` (no images). No deviation.

## FE↔BE contract

- **New/changed endpoints:** none. Consumed: `POST /api/admin/erasure`, body `{ "email": string }`,
  optional `X-Audit-Reason` header → `204 No Content` on success, on already-erased and on
  nothing-to-erase alike; `400 INVALID_REQUEST` (RFC-7807, `code`) when the email is blank.
  ADMIN-gated; a non-admin is `403`.
- **Client typing:** hand-written typed service (`AdminPrivacyService#erase(email, reason?)
  : Promise<void>`), with `erasureErrorOf` narrowing an `HttpErrorResponse` to
  `'INVALID_REQUEST' | 'UNKNOWN'` via the shared `problemCodeOf`. No `as any`.
- **Money/date on the wire:** N/A — the request carries one string and no amounts or dates.

## Execution status

**Stage pointer:** `plan — committed, entering implement (phase 0)`

**Next action:** write `admin-privacy.service.ts`, then the failing component spec for AC-1..AC-11.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Service + wire contract | | |
| 1 — Component: three stages, grounds, focus | | |
| 2 — Tab slot 7 + lazy route | | |
| 3 — a11y spec + mocked e2e at 360px | | |
| 4 — Docs-freshness counting sweep | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `frontend/src/app/admin/admin-privacy.service.ts` — the one call, grounds sanitization, error narrowing
- `frontend/src/app/admin/admin-privacy.ts` — the three-stage panel + the aside
- `frontend/src/app/admin/admin-privacy.spec.ts` — behaviour + the five focus guards
- `frontend/src/app/admin/admin-privacy.a11y.spec.ts` — axe at each stage
- `frontend/e2e/admin-privacy.e2e.ts` — real render at 360px, wire assertions, the focus bug jsdom can't show
- `frontend/src/app/admin/admin-console-tabs.ts` — Privacy inserted at slot 7
- `frontend/src/app/app.routes.ts` — the lazy `/admin/privacy` route

---

## Phase 0 — Service + wire contract

**Files:** Create `frontend/src/app/admin/admin-privacy.service.ts` · Test via `admin-privacy.spec.ts`

- [ ] **Step 1–4:** the service is exercised through the component's spec (as A8's is), plus the e2e's
      wire assertions; it has no state of its own to test in isolation.
- [ ] **Step 6: Commit** — `git commit -m "Add the admin erasure HTTP client (#348)"`

## Phase 1 — Component: three stages, grounds, focus

**Files:** Create `frontend/src/app/admin/admin-privacy.ts`, `admin-privacy.spec.ts`

- [ ] **Step 1:** write the failing specs for AC-1..AC-11 first.
- [ ] **Step 2:** `cd frontend && npm test` scoped to the new spec → FAIL (component does not exist).
- [ ] **Step 3:** implement the component.
- [ ] **Step 4:** re-run → PASS.
- [ ] **Step 5: Focus-guard reversion proof** — for each of the five `focusAfterRender` calls, delete
      it, re-run the spec, confirm the matching case fails, restore it.
- [ ] **Step 6: Commit** — `git commit -m "Add the admin console's Privacy tab (#348)"`

## Phase 2 — Tab slot 7 + lazy route

**Files:** Modify `admin-console-tabs.ts`, `app.routes.ts`

- [ ] Insert the pill between Photos and Audit; add the lazy route with `operatorChrome: true`.
- [ ] Run `admin-console-tabs.spec.ts` **unedited** → PASS (proves the in-slot insertion, AC-14).

## Phase 3 — a11y spec + mocked e2e at 360px

**Files:** Create `admin-privacy.a11y.spec.ts`, `frontend/e2e/admin-privacy.e2e.ts`

- [ ] axe at all three stages; e2e records every request so AC-13's "exactly one POST" is a wire fact.
- [ ] `npm run test:e2e:a11y` → PASS, including the unedited `admin-console-tabs.e2e.ts` row budget.

## Phase 4 — Docs-freshness counting sweep

- [ ] Run `riviera-docs-freshness` over `origin/main...HEAD`; patch every "six tabs" statement.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-05 | Phase 1 (focus guards) | `afterNextRender` bare callbacks — A8 swept the repo, so this checks the sweep held | `grep -rn "afterNextRender((" frontend/src --include=*.ts \| grep -v spec` | 17 calls across 15 files; the search for bare callbacks returns exactly one — `verify-email.ts`, the annotated no-DOM exemption | none needed — the sweep held, and the new code follows the split shape |
| 2026-08-05 | Phase 0 (grounds header) | `X-Audit-Reason` senders that skip the Latin-1 sanitize | `grep -rln "X-Audit-Reason" frontend/src --include=*.ts` | 3 sending services (operators, venue-photos, commissions) — all sanitize then trim, all send the header only when non-blank | copied the established shape verbatim; no divergence to fix |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-12:** Run `cd frontend && npm test` → the `admin-privacy` specs pass.
- [ ] **AC-12..AC-14:** Run `cd frontend && npm run test:e2e:a11y` → `admin-privacy.e2e.ts` and the
      unedited `admin-console-tabs.e2e.ts` pass.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (justified N/A) (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section filled (justified N/A, frontend-only) (invariant #11).
- [ ] **Payment/payout** section filled (justified N/A) (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A, no dates on this surface.
- [ ] Booking codes unguessable (invariant #7) — N/A, none rendered.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** per `references/pr-gates.md` §1 plus `riviera-review-overlay`.
