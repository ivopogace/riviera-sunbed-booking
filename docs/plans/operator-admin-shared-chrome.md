# Shared Operator/Admin Shell Chrome Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every operator/admin surface outside the venue console renders a shared porcelain
operator header + the shell footer — never the tourist chrome (which showed "Sign in /
Register" to a signed-in admin) and never no chrome at all.

**Architecture:** The shell (`app.ts`/`app.html`) gains a third chrome mode: routes flagged
`data.operatorChrome` swap the tourist header/footer for a new `OperatorChrome` header
(brand → `/operator`, Create a venue, Admin for admins, Change password, signed-in-as,
Sign out) and pin the app-root subtree porcelain. The decision is shell-level, not
per-page, so no operator page can end up wearing the wrong chrome again; the console
(`/operator/:venueId`, `data.operatorConsole`) keeps its own richer header and gains its
own footer.

**Persistence:** JDBC only (invariant #1). N/A — no backend or schema change; frontend-only slice.

**Source of intent:** user report in-session (operator/admin pages wear the tourist
header/footer; `/account/operator-password` has none), verified by screenshots against the
running stack. No GitHub issue was filed — cloud session, user-driven fix.

**Skills consulted:** `riviera-sdlc` (routing gate — routed every skill below; re-entry rule
applied to the review fixes) · `riviera-plan-doc` (this template — forced the parity ledger
that caught the venue-editor card duplication as a design fact, not a test accident) ·
`tdd` (unit specs for `OperatorChrome`/shell/routes authored with the code, e2e red on the
duplicated session card drove the venue-editor cleanup) · `riviera-review-overlay`
(review gate — RV-FE bank walked; RV-STYLE-1 findings fixed: multi-line inline comments
shortened) · `riviera-docs-freshness` (ran over this diff — no substrate doc states the
chrome flags; app.ts/app.spec.ts comments updated in-diff) · `riviera-frontend`
(placement: `operator/operator-chrome.ts` feature component imported by the root shell —
the `FindBooking` precedent; flags stay in `app.routes.ts`) · `riviera-tailwind`
(utilities not SCSS for the new header + console footer; no `@apply`; consumer-owned
radius; `text-[13px]` idiom) · `angular-developer` + angular-cli MCP (`get_best_practices`
+ `search_documentation`: host-object attr binding, `RouterLink#queryParams`,
`ActivatedRouteSnapshot#data` root→leaf walk) · `playwright-cli` (the mocked-suite e2e
spec: test-id/role locators, web-first expects, no sleeps) · `riviera-local-debug`
(cloud Gradle/JDK recipe for the verification stack; `PW_CHROMIUM_EXECUTABLE` for the
pinned-Playwright browser mismatch).

**Branch:** `claude/operator-admin-ui-header-footer-hu9vtg` — the session's designated
remote branch stands in for `feature/operator-admin-shared-chrome` (cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a route flagged `data.operatorChrome`, when the shell renders, then
  the operator header and the shell footer render and the tourist header does not.
  *Pinned by:* `app.spec.ts` — "renders the shared operator chrome instead of the tourist header on operator-chrome routes"
- [x] **AC-2:** Given a signed-in operator, when the operator header renders, then it shows
  Create a venue, Change password, "Signed in as `<username>`" and Sign out — plus Admin
  iff the principal is a platform admin. *Pinned by:* `operator-chrome.spec.ts` (first two tests)
- [x] **AC-3:** Given a signed-out visitor on an admin page, when the header renders, then
  it offers the operator sign-in and no session controls. *Pinned by:*
  `operator-chrome.spec.ts` — "offers the operator sign-in (not session controls) when signed out"
- [x] **AC-4:** Given Sign out is pressed in the header, when the session ends, then the
  browser lands on `/account/sign-in?audience=operator`. *Pinned by:*
  `operator-chrome.spec.ts` — "Sign out signs the session out…" and e2e `operator-chrome.e2e.ts`
- [x] **AC-5:** Given the route table, then every non-console operator/admin surface
  (`/operator`, `/account/operator-password`, `/venue-admin`, `/admin`, `/admin/email`,
  `/admin/refunds`) carries `operatorChrome` and not `operatorConsole`. *Pinned by:*
  `app.spec.ts` — "flags every non-console operator/admin surface with the shared operator chrome"
- [x] **AC-6:** Given the console (`/operator/:venueId`), when it renders signed-in, then it
  keeps its own header and now renders its own footer. *Pinned by:*
  `operator-console.spec.ts` — porcelain-shell test (oc-footer assertion)
- [x] **AC-7:** The four flows render with no serious axe violations under the new chrome.
  *Pinned by:* `operator-chrome.a11y.spec.ts` + `e2e/operator-chrome.e2e.ts` axe checks

## Non-goals

- No restyle of the venue-editor form itself (still its grandfathered SCSS).
- No change to the tourist chrome or the console header's content.
- No mobile hamburger for the operator header — its few links wrap (flex-wrap), matching
  the console header's behaviour.
- No backend change of any kind.

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Tourist header/footer on `/admin`, `/admin/email`, `/admin/refunds`, `/venue-admin` | changed | Replaced by the operator header + shell footer — the tourist header displayed the *customer* session ("Sign in / Register" while signed in as operator), which was the reported bug |
| No chrome at all on `/account/operator-password`, `/operator` | changed | Operator header + footer now render; the in-card "Back to your console" link is preserved |
| Venue-editor session card: "Signed in as `<user>`" | dropped | Duplicated the new header's signed-in-as (two "Signed in as" + two Sign out buttons broke e2e strict mode); header carries it |
| Venue-editor session card: Change password link (`ve-change-password`) | dropped | The header's Change password link is now reachable from every operator surface — including the no-venue operator this card served (#326 rationale preserved) |
| Venue-editor session card: Sign out (+ navigate to operator sign-in) | dropped | Header Sign out does exactly this (`OperatorChrome.onSignOut`, same navigation) |
| Admin pages' signed-out "Sign in" link → `/venue-admin` | changed | Now `/account/sign-in?audience=operator&returnUrl=<page>` — the old link predated S9's unified auth page and landed on onboarding, not back on the admin page |
| Venue-editor 401-mid-create handling (`sessionLost`) | preserved | Untouched — `failWrite` still drops the lost session |
| Tourist theme choice on tourist pages | preserved | The porcelain pin is scoped to the app-root attr on operator-chrome routes only; `ThemeService`/document attribute untouched |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Operator header renders on a route where `OperatorAuth` fires an unmocked `/me` in specs | med | low | `app.spec.ts` provides an `OperatorAuth` fake alongside the existing `CustomerAuth` fake | session | done — spec suite green |
| R-2 | Porcelain pin on app-root fights a page's own `data-riv-theme` host pin | low | low | Same attribute value (`porcelain`) on both; page-level pins are redundant but harmless | session | done — visual verify |
| R-3 | Removing the venue-editor session card drops a behaviour silently (O6 #176 class) | med | med | Behavior-parity ledger above, row by row; e2e `operator-registration`/`operator-sign-in`/`admin-operator-suspension` re-run green | session | done |
| R-4 | e2e suite can't run in the sandbox (pinned Playwright ≠ pre-installed browser) | high | med | `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/...` (the config's own escape hatch); CI still installs its own browser | session | done — 108/108 |

## Open questions / Assumptions

### Resolved

- **Assumption:** the admin pages should look like operator surfaces (porcelain, operator
  session), not tourist pages — *confirmed by the user* ("would be nice to have the
  operator header and footer there").
- **Assumption:** the console keeps its own header; only a footer is added — confirmed in
  the same exchange (header exists there already; the gap was the footer).

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no booking, beach-map data, or `availability` write
path is touched; this is shell chrome only.

## Spring Modulith: modules / interfaces / events

N/A — frontend-only slice; no backend module, port, or event is created or moved.

## Payment & payout

N/A — no money moves; no payment/payout surface touched.

## Phases

- [x] **Phase 1 — `OperatorChrome` component** (`operator/operator-chrome.ts` + unit spec +
  a11y spec): header with brand/links/session controls, sign-out navigation.
- [x] **Phase 2 — shell wiring** (`app.ts`, `app.html`): third chrome mode
  (`shellChrome(): 'tourist' | 'operator' | 'none'`), porcelain host pin, blob suppression,
  footer shared across both chromes; `app.spec.ts` coverage.
- [x] **Phase 3 — route flags** (`app.routes.ts`): `operatorChrome` on the six non-console
  operator/admin routes; `operatorConsole` stays console-only; `app.spec.ts` route-flag test.
- [x] **Phase 4 — admin sign-in links**: three admin pages point at
  `/account/sign-in?audience=operator&returnUrl=<page>` instead of `/venue-admin`.
- [x] **Phase 5 — console footer** (`operator-console.html` + spec assertion).
- [x] **Phase 6 — venue-editor dedup**: session card removed (ledger above); specs updated.
- [x] **Phase 7 — e2e** (`e2e/operator-chrome.e2e.ts`, mocked CI suite): four flows + axe.

## Execution status

> Stage pointer: **complete** — implemented, reviewed (RV-FE bank + RV-STYLE-1 fixes),
> verified; merged via PR #462. Next action: none.

| Phase | Status | Evidence |
|---|---|---|
| 1–7 | done | `npm run lint` clean · `npm test` 958/958 (121 files) · mocked e2e 108/108 (incl. 4 new) · visual verify on the running stack (screenshots in-session) |

**Findings register:** RV-STYLE-1 (multi-line inline comments in `app.ts`/`app.html`/
`venue-editor.html`/`app.spec.ts`) — fixed, re-linted/re-tested. e2e strict-mode failures
(4 specs) exposed the venue-editor session-card duplication — resolved as Phase 6, ledger
row recorded.

## Self-review checklist

- [x] Every AC pinned by a named test, all green
- [x] Behavior-parity ledger filled for the replaced/retired surfaces
- [x] No open questions remain
- [x] Review overlay bank walked (frontend scope); findings fixed and re-verified
- [x] Skills-consulted line covers every touched area
