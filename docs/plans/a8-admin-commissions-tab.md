# A8 — Admin console Commissions tab Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Give the platform admin a Commissions tab at `/admin/commissions` that lists every venue
with its commission rate, changes one rate in place through a percent editor that shows the exact
basis points it will store, collects optional `X-Audit-Reason` grounds on the write, and explains —
accurately, not aspirationally — what a forward-only rate change does and when it starts showing up.

**Architecture:** The single significant decision is that **the surface holds one type and one parse
for a venue's rate**, because A7's `PUT` answers the same object shape as one list element: the write
splices its response back into the list the component already holds instead of re-fetching. The write
is a plain `HttpClient.put` — `httpResource` is explicitly not for mutations — and the percent↔bps
conversion is promoted to `shared/commission-rate.ts` rather than written a third time (two operator
surfaces already render `${bps / 100}%` inline, and `admin/` may not import `operator/`, RV-FE-8).

**Persistence:** JDBC only (invariant #1). N/A — frontend-only; A7 (PR #522) shipped `V39
venue_commission_rate` and no schema changes are in scope here.

**Source of intent:** epic [#348](https://github.com/ivopogace/riviera-sunbed-booking/issues/348)
(slice A8) — its A7 scope note's four hand-off notes and the Q1 decision comment;
`docs/design/riviera-admin-console.dc.html` (the Commissions screen + its header's commission
decision list); `docs/plans/a7-commission-rate-backend.md` (the wire contract);
`docs/plans/q1-admin-console-tab-ia.md` (tab slot 2).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — flagged that the
canvas's Owner/Last-changed columns have no wire source, so the table it draws cannot be built as
drawn) · `riviera-plan-doc` (this template — forced the behavior-parity ledger, which is what caught
the two operator call sites the shared helper must not change) · `tdd` (each phase writes the failing
spec before the component) · `riviera-review-overlay` (review gate — read **up front**, not after, for RV-STYLE-1: it had been
raised on eight consecutive PRs touching these files, and every inline comment this diff adds is a
one-liner; layered onto the `code-review` fan-out at ready-for-review) ·
`riviera-docs-freshness` (**ran** over `origin/main...HEAD` — 5 findings, all from the counting
sweep and all patched: this slice makes the **sixth** console tab, and three TSDoc/spec comments plus
the tab e2e's header still said the strip ships five) ·
`riviera-frontend` (placement: four files in `admin/`, the percent helper promoted to `shared/` rather
than imported across features, the mocked e2e in `frontend/e2e/`) · `riviera-tailwind` (token-first
`--riv-card-*` inks, `text-[14px]` not `text-sm`, `CardGlass` carries no radius so each card sets its
own) · `angular-developer` + `frontend/.claude/CLAUDE.md` + the **angular-cli MCP**
(`get_best_practices` + `search_documentation` v22 — verified `@Service`, signals/`computed`, native
control flow and the `effect`-for-imperative-APIs use case; the doc check is what caught F-5's render
phase and F-6's wrong citation) · `playwright-cli` (the CI-safe mocked spec,
stateful `page.route` so "the rate stuck" is the server's answer and not a local edit).

**Branch:** `claude/admin-commissions-tab-a8-5y0mdi` — the cloud session's designated remote branch
stands in for `feature/<slug>` (`riviera-sdlc` remote-session addendum). Exists before phase 0.

---

## Acceptance criteria (testable)

> Written at the surface's own boundary: this slice's inner hexagon is the console page + its HTTP
> service against A7's wire contract. The backend behaviour these criteria ride on
> (forward-only scheduling, 0..10000 validation, ADMIN gating) is A7's and is pinned by A7's tests.

- [x] **AC-1:** Given an admin on `/admin/commissions`, when the venues read answers, then every
  venue renders with its rate as a percentage **and** the exact stored basis points beside it.
  *Pinned by:* `admin-commissions.spec.ts` › `lists every venue with its rate in percent and basis points`
- [x] **AC-2:** Given a venue at 1500 bps, when the admin opens its editor and types `12.5`, then the
  surface shows `1250 bps` as the value it will store, before anything is sent.
  *Pinned by:* `admin-commissions.spec.ts` › `shows the exact basis points a typed percent will store`
- [x] **AC-3:** Given an open editor, when the admin saves `12.5`, then the service is called with
  `commissionBps: 1250` — never a percent — and the row shows the **response's** rate without a
  second list read. *Pinned by:* `admin-commissions.spec.ts` › `sends basis points and splices the response back into the list`
- [x] **AC-4:** Given an open editor with grounds typed, when the admin saves, then the grounds reach
  the service as a third argument (trimmed); given no grounds, the two-argument call is made so no
  blank header is sent. *Pinned by:* `admin-commissions.spec.ts` › `passes typed grounds to the write` and › `sends no grounds when the field is blank`
- [x] **AC-5:** Given grounds typed for one venue and then dismissed, when the admin opens any
  editor again, then the field is blank — an unstated reason stays unstated.
  *Pinned by:* `admin-commissions.spec.ts` › `does not carry a reason typed for one change into the next`
- [x] **AC-6:** Given a percent outside 0..100 or not a number, when the admin saves, then nothing is
  sent and the editor states why. *Pinned by:* `admin-commissions.spec.ts` › `refuses a rate outside 0–100% without sending anything`
- [x] **AC-7:** Given a rate equal to the venue's current one, when the admin saves, then nothing is
  sent — a no-op write would still schedule a superseding row and record an audit entry.
  *Pinned by:* `admin-commissions.spec.ts` › `refuses a change that is already the venue's rate`
- [x] **AC-8:** Given the write fails, when the response lands, then the row keeps its old rate, the
  editor stays open with what was typed, and the failure is announced.
  *Pinned by:* `admin-commissions.spec.ts` › `keeps the old rate and the typed draft when the write fails`
- [x] **AC-9:** Given the write answers `404`, when it lands, then the message says the venue is gone
  rather than the generic failure — a mistyped/stale id must fail loudly (A7 chose not to blur venue
  existence). *Pinned by:* `admin-commissions.spec.ts` › `reports a vanished venue distinctly from a generic failure`
- [x] **AC-10:** Given a non-admin (or signed-out) principal, when the page renders, then no venue
  list, no tab strip and no read at all. *Pinned by:* `admin-commissions.spec.ts` › `self-gates on the admin session`
- [x] **AC-11:** Given the editor opens, is dismissed, and a save completes, then focus lands on the
  percent field, returns to Edit, and returns to Edit respectively — never stranded on `<body>`
  (WCAG 2.4.3, the recurring #148/#351/#462/#505 class).
  *Pinned by:* `admin-commissions.spec.ts` › the three `moves focus…` cases, plus
  › `returns focus to Save when the write fails, rather than stranding it` (the fourth transition,
  added by review finding F-3b), `e2e/admin-commissions.e2e.ts` ›
  `a failed write leaves focus on Save, not on the body`, and the three Retry-path cases added by
  F-3d (`offers a retry…`, `keeps focus on Retry when the retried load fails again`, `lands focus on
  the empty notice when the retry finds no venues`)
- [x] **AC-12:** Given the page rendered — list, open editor, and post-save — then axe reports no
  violations. *Pinned by:* `admin-commissions.a11y.spec.ts` (both cases) and
  `e2e/admin-commissions.e2e.ts` (`expectNoSeriousAxeViolations` at 360px)
- [x] **AC-13:** Given a real render at 360px, when an admin changes a rate, then the change survives
  a re-read of the list (the server really took it), the page never scrolls sideways, and the
  Commissions pill is the only one marked `aria-current`.
  *Pinned by:* `e2e/admin-commissions.e2e.ts`
- [x] **AC-14:** Given the console tab strip, when it renders, then `Commissions` appears in slot 2
  and the rendered tabs remain a subsequence of `ADMIN_CONSOLE_TAB_ORDER`.
  *Pinned by:* the **unedited** `admin-console-tabs.spec.ts` › `renders tabs in the canonical console order (Q1, #348)`
- [x] **AC-15:** Given the promoted percent helper, when the two operator surfaces render a rate,
  then the output is byte-identical to the inline expressions they replace.
  *Pinned by:* `shared/commission-rate.spec.ts` plus the untouched `venue-tab.spec.ts` /
  `console-stats-strip.spec.ts` continuing to pass.

## Non-goals

- **Any change to commission or payout math** (invariants #5/#9). The console renders and triggers;
  the backend decides. No client-side commission arithmetic beyond percent↔bps at the field edge.
- **Backdating a rate, or any effective-date control.** A7's request carries no effective date on
  purpose; the schedule is forward-only and computed server-side.
- **Optimistic-concurrency tokens on the write.** A rate is a scalar set outright, not a loaded form
  that can go stale (A7's `SetCommissionRequest` TSDoc). No version, no `If-Match`.
- **A rate-history view.** `venue_commission_rate` holds the schedule, but A7 exposes no read of it,
  so "last changed" cannot be shown. The canvas draws that column; it is deliberately absent here.
- **An owner column.** The A7 wire returns no owner (`AdminVenueCommissionsResponse` states why: a
  rate decision does not turn on ownership). The canvas draws it; it cannot be built.
- **Search, filter, sort or paging** over the venue list. A7 returns the whole list; the wrapper
  object leaves room for a page window later.
- **Switching the Photos tab's venue picker to the new admin read.** Decided deliberately, kept as
  is — see the Open questions' `### Resolved` entry.
- **Widening the operator's profile `PATCH` to write the rate.** O8 #177 stands.
- **A9's stat strip / A3's Privacy tab / A6's Payouts tab.** Separate slices.

## Behavior-parity ledger (retirement / replacement slices only)

> This slice adds a new surface, but it **does** replace two inline expressions with a shared
> helper, so the ledger covers that move rather than being `N/A`.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `console-stats-strip.ts:90` — `commissionPct(bps)` returns `` `${bps / 100}%` `` | preserved | calls `formatCommissionPercent(bps)`, whose body is that exact expression; the method stays as the template's call site |
| `venue-tab.ts:119` — `commissionPct` computed, `bps === null ? '—' : `${bps / 100}%`` | preserved | the `null → '—'` branch stays **at the call site** (it is that surface's empty-state rule, not the formatter's); only the non-null arm delegates |
| Both surfaces' trailing-zero behaviour (`1500 → "15%"`, not `"15.00%"`) | preserved | `${bps / 100}%` relies on JS number stringification; the helper is that expression verbatim, pinned by `shared/commission-rate.spec.ts` |
| Neither surface parsed a percent (creation takes bps directly, `venue-create-card.ts`) | unchanged | `commissionPercentToBps` is **new**; no existing caller is switched onto it |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The explainer promises the takings strip agrees with the ledger — it does not (hand-off note 1: the ledger prices each **booking** at accrual, the strip applies one rate to a service date's aggregate) | high (it is the intuitive copy) | high — a false guarantee on a money surface | copy states the narrow guarantee (*a past service date never re-prices*) and names the divergence explicitly; a unit spec asserts the divergence sentence is present, so a later copy edit cannot silently drop it | this slice | closed |
| R-2 | The copy presents "reporting moves tomorrow" and "the list shows the new number now" as a contradiction (hand-off note 2) | med | med — an admin distrusts the surface | one paragraph holds both: the **live** rate moves immediately and is what the next accrual uses; **reporting** moves from tomorrow because invariant #4 closed today's bookings the evening before | this slice | closed |
| R-3 | Rounding enters through the wire (a percent, or a rounded bps, sent unseen) | med | high — invariant #5 | the wire value is always the integer bps; the editor renders the exact integer it will store as the admin types, so any rounding is visible before it is sent; `commissionPercentToBps` returns `null` (not a coerced 0) for junk | this slice | closed |
| R-4 | The `X-Audit-Reason` header carries a non-Latin-1 character and the browser aborts the request | med (Albanian/Greek text is natural here) | med — the write silently fails | sanitize `/[^\x20-\x7e\xa0-\xff]/g → ' '`, trim, and send the header **only** when non-blank — copied in spirit from `admin-venue-photos.service.ts` | this slice | closed |
| R-5 | A no-op save writes a superseding schedule row and an audit record for nothing | med | low | the editor refuses a rate equal to the venue's current one (AC-7) | this slice | closed |
| R-6 | An out-of-order write response paints one venue's rate onto another row | low (the write is per-row and keyed by id) | med | the splice matches on `venueId`, so a late response updates its own row or none; there is no shared "selected venue" the way the Photos tab has | this slice | closed |
| R-7 | The tab is appended out of slot and the Q1 order guard has to be edited | low | med — the guard exists to catch exactly this | insert at index 1 of `tabs`; **if `admin-console-tabs.spec.ts` needs an edit, the insertion is wrong** | this slice | closed |
| R-8 | RV-STYLE-1 (multi-line inline comments) — raised on eight consecutive PRs touching these files | high | low individually, but it is the repo's most recurrent finding | the rule was read **before** authoring; every explanation goes in TSDoc, inline comments are one line or absent | this slice | closed |
| R-9 | Promoting the percent helper changes operator-console output | low | med | the helper's body is the replaced expression verbatim; the parity ledger enumerates each call site; the two operator specs are left untouched so they act as the regression proof | this slice | closed |

## Open questions / Assumptions

None open.

### Resolved

- **Open question:** should the Photos tab (#511) switch its venue picker from the public
  `GET /api/venues` to A7's new `GET /api/admin/venues`? — **Resolved: no, keep the public
  catalogue.** The stale claim in `admin-venue-photos.service.ts`'s TSDoc ("an admin venue endpoint
  … does not exist and which this slice deliberately does not add") is corrected in this slice,
  because A7 added exactly that endpoint — but the *decision* it justified still holds, on
  different grounds than the ones that are now stale. The admin read carries `commissionBps`, a
  commercial term; a photo moderator has no need to read what the platform charges a venue, and
  routing the moderation picker through it would put a commercial figure on a content-moderation
  surface for no gain (need-to-know, the same instinct as the wire's own "no owner travels"). The
  catalogue also remains complete — every venue, no publish filter — so nothing is hidden from a
  moderator by staying on it. The TSDoc is rewritten to state that reason instead of the stale one.
  *Resolved:* plan stage, this slice.
- **Open question:** does the canvas's five-column table (Venue / Owner / Commission / Last changed /
  Action) get built as drawn? — **Resolved: no — one labelled card per venue at every width.** Two
  of its five columns have no wire source (owner and last-changed are both deliberately absent from
  A7's contract), leaving a three-column table thinner than the card it is supposed to collapse into
  at 360px. The canvas's own phone layout already turns the table into one labelled card per row, so
  the card **is** the drawn design at the width the project actually gates on; building it at every
  width drops a breakpoint's worth of divergence and lets the inline editor expand in place without
  a `colspan` row. *Resolved:* plan stage, this slice.
- **Assumption:** the rendered strip stays a subsequence of `ADMIN_CONSOLE_TAB_ORDER` with no spec
  edit, and the unregistered `/admin/commissions` route in `admin-console-tabs.spec.ts`'s test router
  does not break `routerLinkActive` (it compares URLs; it does not resolve routes). — **Verified in
  phase 1** by running that spec unmodified.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No booking, beach map or `availability` row is read or written.
The commission rate is a venue-level commercial term; changing it claims no `(set, date)` row and
cannot double-sell anything. Its own concurrency story is A7's (the forward-only schedule write), and
this surface adds no second writer.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No file under `platform/` is touched. The endpoints this slice consumes
(`GET /api/admin/venues`, `PUT /api/admin/venues/{venueId}/commission`) shipped with A7 on `venue`'s
`VenueCommissionAdministration` port and are unchanged here.

## Payment & payout (invariants #5, #8, #9, #10)

No money moves in this slice, but it **sets the rate that later splits money**, so the money-adjacent
rules that bind it are stated rather than waived:

- **Money:** the rate travels as integer basis points, 0..10000, exactly as stored (invariant #5).
  The percent is a rendering; `commissionPercentToBps` rounds to whole basis points at the field edge
  and the surface displays that integer before the write, so no rounding travels unseen.
- **Payout-ledger effect:** none, by construction. A payout-ledger entry persists its own
  `commissionMinor` at accrual (invariant #9), so a rate change cannot reprice one. The forward-only
  schedule (A7, `V39`) is what keeps a past service date from re-pricing in reporting.
- **The guarantee the copy may state:** *a past service date never re-prices*. The copy may **not**
  state that the takings strip agrees with the ledger — the ledger is per booking at accrual, the
  strip is one rate per service date, so a booking confirmed before a change but served after it
  accrued at the old rate while the strip shows the new one (hand-off note 1).
- **Refund policy / confirmation trigger / idempotency:** `N/A — no charge, refund or webhook in
  scope`.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-commissions.ts` | new | standalone component | signals (`venues`, `editingId`, `draftPercent`, `reason`, `busy`, `notice`, `editorError`, `loading`, `loadError`); `computed` for the live bps preview | native `<input type="number">` + `<input type="text">`, read on `(input)` — one field per open editor, so Signal Forms would add a schema for two inputs |
| FE-2 | `admin/admin-commissions.service.ts` | new | `@Service()`, stateless | none — the component holds page state; session cookie + CSRF come from `apiSessionInterceptor` | — |
| FE-3 | `admin/admin.model.ts` | modified | types | — | — |
| FE-4 | `admin/admin-console-tabs.ts` | modified | standalone component | — | — |
| FE-5 | `app.routes.ts` | modified | lazy route at `/admin/commissions` | — | — |
| FE-6 | `shared/commission-rate.ts` | new | pure functions | — | — |
| FE-7 | `admin/admin-venue-photos.service.ts` | modified | TSDoc only | — | — |
| FE-8 | `operator/console-stats-strip.ts`, `operator/venue-tab.ts` | modified | call sites of FE-6 | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()` signal APIs, `@Service()`,
`afterNextRender` for focus moves. **Deviation documented:** the editor uses plain
`(input)`-bound signals rather than Signal Forms — the surrounding admin tabs (#511, #519) all use
this shape, two fields do not earn a schema, and the validation the field needs (percent → exact bps)
is the shared parse, not a validator.

**Why `HttpClient.put` and not `httpResource`:** `httpResource` is explicitly not for mutations
(angular.dev/guide/http/http-resource — *Response parsing and validation*); it models a reactive
**read**. Hand-off note 4.

## FE↔BE contract

- **Endpoints consumed (no change — A7, PR #522):**
  - `GET /api/admin/venues` → `{ venues: [{ venueId, name, beach, commissionBps, payoutCurrency }] }`
    — an object wrapping the array, leaving room for a total/page window later.
  - `PUT /api/admin/venues/{venueId}/commission`, body `{ commissionBps: <int 0..10000> }` → `200`
    with **one** object of the same shape as a list element; `404 NO_SUCH_VENUE`;
    `400 INVALID_REQUEST` (missing or out of range). Both ADMIN-gated.
- **Client typing:** one hand-written interface, `VenueCommissionView` in `admin/admin.model.ts`,
  and **one parse** (`toVenueCommission`) used by both the list read and the write response — which
  is what lets the write's answer be spliced into the list instead of triggering a re-fetch
  (hand-off note 3). No `as any`.
- **Money/rate on the wire:** integer basis points, never a percent, never a float. `1500 = 15.00%`.
- **Audit grounds:** optional `X-Audit-Reason` request header, sanitized to Latin-1 and sent only
  when non-blank. #507's edge filter records the audit with **zero instrumentation here**.

## Execution status

**Stage pointer:** `merge close-out` — all gates run and clear. Merged via PR #525.

**Next action:** none — tick A8 on epic #348's checklist with PR #525.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | `4781a50` |
| 1 — shared percent↔bps helper + operator call sites | ✅ | `ef60894` |
| 2 — model + service (one type, one parse, grounds header) | ✅ | `29ac2eb` |
| 3 — the tab component (list, editor, explainer, focus) | ✅ | `29ac2eb` |
| 4 — tab slot 2 + lazy route + Photos TSDoc correction | ✅ | `29ac2eb` |
| 5 — a11y spec + mocked e2e at 360px | ✅ | `29ac2eb` |
| 6 — review gate + close-out | ✅ | `35733a8`, `4902db5`, `e2dce3f`, `2dc384e`, `9505073` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review — overlay walk (RV-FE-1, self) | Cancel stayed enabled while a write was in flight, so an admin could dismiss the editor mid-request and then watch the row change anyway when the response landed. Undoing it locally would be the worse lie — the server had taken the write — so the fix is to lock the editor, not to revert. | fixed-in-`35733a8` |
| F-2 | review — overlay walk (a11y, self) | The explainer panel was a `<div>` carrying `aria-labelledby`, which names nothing on a role-less element. | fixed-in-`35733a8` (`<section>`, so the name lands on a real region) |
| F-3 | sonar gate | Quality Gate passed — 0 new issues, 0 accepted issues, 0 security hotspots, **0.0% duplication**, **90.6% coverage on new code** (bar: 0/0/≥80%). Issue list pulled, nothing to triage. | closed — no action |
| F-3b | review — `/code-review` fan-out, bug scan (reviewer 2/5) | **Stranded focus on a failed save.** Disabling Save while the write is in flight blurs it to `<body>`; re-enabling it afterwards does not bring focus back. Open, dismiss and save-success all moved focus deliberately — the failure path, where the admin most needs to retry, was the one of four transitions left unhandled (WCAG 2.4.3, the recurring #148/#351/#462/#505 class). Shipped untested: the existing failure spec asserted the message and the retained draft, never `document.activeElement`. | fixed-in-`e2dce3f` (focus returns to Save; guard proven red-first in the unit spec, plus a real-browser e2e because jsdom does not reproduce the disabled-element blur) |
| F-3c | review — `/code-review` fan-out, git-history reviewer (3/5) | **F-1's lock was half-applied.** Disabling Save and Cancel left both editor *fields* live, so a percent or reason typed while the request was in flight was silently discarded by the `closeEditor()` on success — the same "watch it change anyway" surprise F-1 set out to remove. `operator/pricing-tab.html` has disabled its own money input during a save since that file's first commit, so the shape was established, not invented; the Commissions editor was the only in-place numeric editor in the repo without it. F-1's own regression guard asserted the buttons only, so nothing would have caught a recurrence. | fixed-in-`2dc384e` (both fields carry `[disabled]="busy()"`; the guard now asserts fields as well as buttons) |
| F-3d | review — `/code-review` fan-out, prior-findings reviewer (4/5) | **A second stranded-focus site: Retry.** Pressing Retry after a failed list load sets `loading`, which swaps the branch and unmounts the button that was just activated, dropping focus to `<body>`. Unlike F-3b this one reproduces in jsdom, yet the existing retry spec asserted only the reloaded content. Same class as `create-venue-into-console.md` F-2. | fixed-in-`9505073` (a `retry()` handler lands focus on what the retry produced — the list, the empty notice, or Retry itself if it failed again; all three proven red-first) |
| F-3e | review — `/code-review` fan-out, prior-findings reviewer (4/5) | **The plan doc's File-structure section under-counted the diff** (13 of 20 paths — the three committed screenshots, `app.spec.ts`, and the two comment-only sweep edits were absent). A documented recurring class: raised on #438, on #522 as F-5, and on Q1 as F-3. | fixed-in-`9505073` (all 20 paths listed with a one-line reason; the section's blockquote now states the rule and its four sightings, so the next slice inherits it) |
| F-5 | angular-cli MCP verification (`search_documentation`, v22) | **`afterNextRender` was called with a bare callback**, which Angular runs in the `mixedReadWrite` phase — the one its own docs say to *"never use if it is possible to divide the work among the other phases"*, warning it *"may worsen application performance by causing additional DOM reflows"*. Here it divides exactly: locating the element is a read, focusing it is a write. | fixed-in-`e94ea96` for this slice's own call site, then **swept repo-wide at the maintainer's request** (`cab2df7`): all 17 DOM call sites across 14 files now declare `earlyRead`/`write`. `operator-home.ts` was the interesting one — it already named a phase, but `read`, and the docs say *"Never write to the DOM in this phase"*, so a focus call there was mislabelled rather than merely unlabelled. `verify-email.ts` is deliberately left bare and annotated: it touches no DOM, so no phase applies and naming one would be false documentation. |
| F-6 | angular-cli MCP verification (`search_documentation`, v22) | The `httpResource`-is-not-for-mutations citation (inherited verbatim from #348's hand-off note 4) pointed at the guide's *Response parsing and validation* section. The tip actually lives under *Using httpResource*. The rule was applied correctly; only the pointer was wrong. | fixed-in-`e94ea96` (both TSDocs now cite the right section and quote the tip) |
| F-4 | CI gate | All 7 checks green on `a78d466`, and re-green on each later push: backend build+test, frontend lint+test+build, e2e, CodeQL (java-kotlin + javascript-typescript), SonarCloud. | closed — no action |

---

## File structure

- `docs/plans/a8-admin-commissions-tab.md` — this plan.
- `frontend/src/app/shared/commission-rate.ts` — the percent↔bps boundary: `formatCommissionPercent`,
  `commissionPercentToBps`, `commissionBpsToPercentInput`. Pure, no HTTP, no state.
- `frontend/src/app/shared/commission-rate.spec.ts` — its unit spec.
- `frontend/src/app/admin/admin.model.ts` — **modify:** add `VenueCommissionView`.
- `frontend/src/app/admin/admin-commissions.service.ts` — the two calls + the one parse + the
  sanitized grounds header.
- `frontend/src/app/admin/admin-commissions.ts` — the tab: gate, list, inline editor, explainer,
  live region, focus moves.
- `frontend/src/app/admin/admin-commissions.spec.ts` — unit spec (AC-1..AC-11).
- `frontend/src/app/admin/admin-commissions.a11y.spec.ts` — axe, list + open editor (AC-12).
- `frontend/src/app/admin/admin-console-tabs.ts` — **modify:** insert `Commissions` at index 1.
- `frontend/src/app/app.routes.ts` — **modify:** lazy `/admin/commissions` route.
- `frontend/src/app/admin/admin-venue-photos.service.ts` — **modify:** TSDoc correction only.
- `frontend/src/app/operator/console-stats-strip.ts`, `frontend/src/app/operator/venue-tab.ts` —
  **modify:** call the promoted helper.
- `frontend/e2e/admin-commissions.e2e.ts` — the CI-safe mocked spec at 360px (AC-13).
- **The `afterNextRender` phase sweep (F-5, at the maintainer's request)** — `admin/admin-audit.ts`,
  `admin/admin-operators.ts`, `admin/admin-venue-photos.ts`, `auth/auth-page.ts`,
  `auth/forgot-password.ts`, `auth/operator-password.ts`, `auth/reset-password.ts`,
  `auth/set-password.ts`, `auth/verify-email.ts`, `booking/booking-dialog.ts`,
  `booking/booking-pay.ts`, `booking/find-booking.ts`, `operator/operator-home.ts`,
  `operator/payout-statement.ts` — behaviour-preserving phase declarations, no logic touched.
- `frontend/src/app/admin/admin-console-tabs.spec.ts` — **modify: comment only.** The insertion needs
  no spec change (that is the Q1 guard working); the docs-freshness counting sweep found its
  explanation still said "the five that ship today", which the sixth tab falsified. No assertion moves.
- `frontend/e2e/admin-console-tabs.e2e.ts` — **modify: comment only**, same sweep — its header framed
  Q1 as taking the strip "from five tabs to eight" and skipped six in the measured row budget.
- `frontend/src/app/app.spec.ts` — **modify:** the route table's `OPERATOR_SURFACE_PATHS` list, which
  enumerates every `operatorChrome` path; a new admin route that is not in it fails the
  legacy-surface assertion.
- `docs/plans/a8-admin-commissions-tab/commissions-list-360.png` — the resting state at the 360px bar:
  evidence the card-per-venue layout fits the width the project gates on.
- `docs/plans/a8-admin-commissions-tab/commissions-editor-360.png` — the editor open at 360px, showing
  the bps preview and the grounds field in the width where they are tightest.
- `docs/plans/a8-admin-commissions-tab/commissions-editor-1280.png` — the desktop render: the evidence
  for the one decision that departs from the design canvas (card list, not its five-column table), so
  the departure outlives the session that made it.

---

## Phase 1 — The shared percent↔bps boundary

**Files:** Create `frontend/src/app/shared/commission-rate.ts` · Test
`frontend/src/app/shared/commission-rate.spec.ts` · Modify
`frontend/src/app/operator/console-stats-strip.ts`, `frontend/src/app/operator/venue-tab.ts`

- [x] **Step 1: Write the failing spec** — format is the two operator expressions verbatim; parse
  rejects junk, blank, and out-of-range without coercing, and rounds to whole basis points.
- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include="src/app/shared/commission-rate.spec.ts"`
  → FAIL, module not found.
- [x] **Step 3: Minimal implementation** — the three functions.
- [x] **Step 4: Run it, verify it passes** — 39 passed across `commission-rate`, `venue-tab` and
  `console-stats-strip`, the latter two untouched, which is the parity proof.
- [x] **Step 5: Generalization-audit pass** — searched every `bps / 100` site; see the log.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status**

## Phase 2 — Model + service

**Files:** Modify `frontend/src/app/admin/admin.model.ts` · Create
`frontend/src/app/admin/admin-commissions.service.ts`

- [x] `VenueCommissionView` mirrors `AdminVenueCommissionsResponse.VenueCommission` exactly.
- [x] `venues()` reads the wrapper object and maps through `toVenueCommission`.
- [x] `setCommission(venueId, commissionBps, reason?)` is a plain `HttpClient.put`, maps the response
      through the **same** `toVenueCommission`, and attaches the sanitized `X-Audit-Reason` header
      only when the grounds are non-blank.
- [x] Commit + status update.

## Phase 3 — The tab component

**Files:** Create `frontend/src/app/admin/admin-commissions.ts`,
`frontend/src/app/admin/admin-commissions.spec.ts`

- [x] The three-branch auth gate (restoring / signed-out / not-admin), matching its siblings.
- [x] One `appCardGlass` card per venue: name + beach, rate as percent with the exact bps beneath,
      payout currency, and an Edit button.
- [x] The inline editor: percent field, live "stores N bps" preview, "was X% (N bps)", optional
      grounds, Save + Cancel, a one-line timing note, and an always-present assertive error region.
- [x] The forward-only explainer panel — five short cards, carrying R-1's and R-2's exact claims.
- [x] Splice, never re-fetch. Focus moves on open / dismiss / save.
- [x] Commit + status update.

## Phase 4 — Tab slot + route + the stale TSDoc

**Files:** Modify `frontend/src/app/admin/admin-console-tabs.ts`, `frontend/src/app/app.routes.ts`,
`frontend/src/app/admin/admin-venue-photos.service.ts`

- [x] Insert `Commissions` at **index 1** of `tabs`; run `admin-console-tabs.spec.ts` **unmodified**.
- [x] Lazy route at `/admin/commissions` with `data: { operatorChrome: true }`, matching the five siblings.
- [x] Rewrite the Photos service's stale TSDoc paragraph with the decision recorded above.

## Phase 5 — a11y spec + mocked e2e

**Files:** Create `frontend/src/app/admin/admin-commissions.a11y.spec.ts`,
`frontend/e2e/admin-commissions.e2e.ts` · Modify `frontend/src/app/app.spec.ts` (the route table's
operator/admin-surface list, which enumerates every `operatorChrome` path)

- [x] axe over the list and over an open editor.
- [x] Playwright at 360px against a **stateful** mock, so "the new rate stuck" is the server's answer.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-05 | Phase 1 — promoting the percent formatter | inline bps→percent rendering | `grep -rn "bps / 100\|/ 100" frontend/src/app --include=*.ts \| grep -v spec` | 4: `console-stats-strip.ts:90`, `venue-tab.ts:121`, `money.ts:22`, `money.ts:38` | Fixed the two commission sites onto the helper. The two `money.ts` hits are the **euros↔minor** boundary (invariant #5 money, not a rate) and are deliberately left alone — sharing a divisor is not sharing a concept. |
| 2026-08-05 | Phase 2 — the `X-Audit-Reason` sanitizer | the Latin-1 header guard | `grep -rn "x20-\\\\x7e" frontend/src/app --include=*.ts` | 2: `admin-venue-photos.service.ts:75`, the new `admin-commissions.service.ts` | Left as two sites, deliberately. The brief says to copy it "verbatim in spirit"; a third caller is the point at which a `shared/` helper earns itself, and #519's `admin-operators.service.ts` uses a third shape again. Recorded as the trigger rather than pre-empted, so the next admin write that needs grounds promotes all three at once. |

---

## Acceptance-criteria verification (final)

Commands run at `9505073`, on Node 26 in `frontend/`:

- [x] **AC-1..AC-11:** `npx ng test --watch=false --include="src/app/admin/admin-commissions.spec.ts"`
  → **25 passed**. Three of them (the Retry-focus trio) and the save-failure focus guard were each
  verified to FAIL with their fix reverted, so they pin behaviour rather than describe it.
- [x] **AC-12:** `npx ng test --watch=false --include="src/app/admin/admin-commissions.a11y.spec.ts"`
  → 2 passed; plus four `expectNoSeriousAxeViolations` calls at 360px in the e2e.
- [x] **AC-13:** `npx playwright test --config playwright.a11y.config.ts admin-commissions`
  → **6 passed** at 360px against a stateful mock.
- [x] **AC-14:** `npx ng test --watch=false --include="src/app/admin/admin-console-tabs.spec.ts"`
  → 9 passed. **No assertion in that file was touched** — the only edit is a comment the
  docs-freshness sweep corrected (see F-3e's row and the File-structure note).
- [x] **AC-15:** `commission-rate.spec.ts` (10) + the untouched `venue-tab.spec.ts` /
  `console-stats-strip.spec.ts` → passed, which is the parity proof.
- [x] **Whole suite, unscoped:** `npm test` → **1165 passed / 139 files**; `npm run test:a11y` →
  **321 passed / 54 files**; the full mocked e2e suite → **138 passed**; `npm run lint` clean.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — frontend-only slice, no `platform/` file touched.
- [x] **Availability** section filled — justified `N/A`, with the reason.
- [x] Pool + cutoff rules honored (invariants #3, #4) — invariant #4 is *cited* by the explainer copy
      as the reason reporting moves tomorrow; no cutoff arithmetic runs on the client.
- [x] **Modulith** section filled — `N/A — frontend-only`.
- [x] **Payment/payout** section filled — no money moves; the rate travels as exact integer bps.
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — no client-side date arithmetic; the copy names
      `Europe/Tirane` because the *server's* schedule boundary is in that zone.
- [x] Booking codes unguessable (invariant #7) — no booking code on this surface.
- [x] Flyway migration present for schema changes (invariant #12) — none in scope.
- [x] **Frontend** standards met; the Signal-Forms deviation is documented above; no `as any`.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] **Close-out written in THIS PR** — citing `merged via PR #525`.
- [x] **The review gate ran in full** — `riviera-review-overlay` layered onto the `code-review`
      plugin's workflow, run at ladder rung 1 after the maintainer authorized the subagents: five
      independent reviewers (CLAUDE.md adherence, bug scan, git-history context, prior-PR findings,
      comment compliance). Four findings, all fixed and re-verified; two of the five reviewers
      independently found the save-failure focus bug, which is the fan-out earning its cost.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
