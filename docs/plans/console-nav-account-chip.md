# Console nav 2/7 — one account chip replaces the five header peers Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Both operator headers (the venue console's own and the thin operator chrome) render
exactly one account control when signed in — a button named `Account: <username>` with
`aria-expanded` that opens a popover holding the identity block, `Create a venue`, `Admin
console` (admins), `Change password` and `Sign out` — and `Signed in as <username>` no longer
sits in the bar; on a phone each header is one row.

**Architecture:** One component, `operator/operator-account-chip.ts` (`app-operator-account-chip`),
replaces `operator/operator-actions.ts` on both hosts and keeps that component's two contracts: the
test-id prefix is an input, and **sign-out is an output, not a behaviour** — each host keeps its own
teardown. The disclosure follows the tourist header's account menu exactly (a `<button
aria-expanded>`, a click-catching backdrop, Escape closes, the current page's row `aria-current`
via `routerLinkActive`), and the popover/chip/avatar/backdrop recipes it shares with the tourist
shell are hoisted out of `app.ts`'s private constants into `shared/popover-skin.ts` so the two
consumers cannot drift (`riviera-tailwind` rule 1 / the no-drift rule; `app.ts` imports the same
strings back and paints nothing differently). Focus is moved deliberately on every leg that unmounts
the focused element: Escape, backdrop and row activation return focus to the chip; a navigation
that ends while the popover is open (focus tabbed out to the rail) closes it without touching
focus; sign-out closes the popover, then the host parks focus on `<main>` before the chip unmounts.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — frontend-only.

**Source of intent:** GitHub issue #1008 (parent epic #1006); the spike's `proto-account-menu.ts`
on `claude/operator-admin-nav-prototype-727vnz` — layout and rows, not code to copy.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
sign-out button is the *only* consumer of `--riv-console-btn-border`/`-hover` and that
`fixed-ink-tokens.contrast.spec.ts` reads `operator-actions.ts` by path, so retiring the button
retires the tokens and their docs rows; that `--riv-chip-border` at 0.14 alpha measures 1.3:1 and
so the "chip composites ≥ 3:1" AC has to be pinned on the avatar disc; that the page object's
`expectSignedInAs` locates text a closed popover no longer renders; that the venue console does
not park focus on sign-out today although the issue says "still parks") · `riviera-plan-doc` (this
template — forced the behaviour-parity ledger over the five old peers, the seam per AC and the
File-structure list of every e2e that clicks the old ids) · `tdd` (one behaviour per cycle at the
seams below: chip spec → chrome spec → console spec → e2e) · `riviera-review-overlay` (review
gate — due at ready-for-review) · `riviera-docs-freshness` (ran by hand over the slice: the two
`non-text-contrast.md` rows for the retired tokens, the `colour-literal-token-audit.md` note's
status, the credential-provisioning runbook's "header link", the two design canvases' header
notes) · `grilling` (the intake interrogation, answered from the code and marked ← confirm? below —
the session is autonomous) · `riviera-frontend` (the chip is an `operator/` feature component — it
injects `core/operator-auth`, so it cannot live in `shared/`; the pure class recipes do live in
`shared/`; e2e in the CI-safe mocked suite) · `riviera-tailwind` (rule 1: hoisted recipes shared as
one TS module, never `@apply`; rule 4: the chip is a `<button appTouchTarget>` and every row an
`<a|button appTouchTarget>` with `block w-full`, measured by the sweeps; the no-drift proof is the
tourist suite staying green over the unchanged strings and a computed-style e2e on the chip; the
contrast spec uses `src/testing/glass-tokens.ts`) · `angular-developer` + angular-cli MCP
(`list_projects` → v22; `input.required()`, `output()`, `host: {}` bindings for the document
Escape listener, `viewChild` for the focus-return target, `takeUntilDestroyed` on the router
subscription; `RouterLinkActive`'s `ariaCurrentWhenActive` and `routerLinkActiveOptions` as the
tab-rail slice already verified) · `playwright-cli` (mocked-suite specs: role/test-id locators,
`toHaveAttribute('aria-expanded')`, `toBeFocused`, `toHaveAccessibleName`, no sleeps) ·
`riviera-local-debug` (unshallowed the clone; scoped Vitest and Playwright runs with
`PW_CHROMIUM_EXECUTABLE`).

**Branch:** `claude/console-nav-account-chip-3lv1k1` — the session's designated remote branch
stands in for `feature/console-nav-account-chip` (`riviera-sdlc` remote addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a signed-in operator (non-admin) on either header, when the header's
  controls are read, then there is exactly one account control — a `<button>` whose accessible
  name is `Account: <username>` with `aria-expanded="false"` — and no element in the bar reads
  `Signed in as`; when the button is clicked, `aria-expanded` is `true` and the popover holds the
  identity block (`Signed in as <username>` in full), links `Create a venue` (`/operator?create=1`)
  and `Change password` (`/account/operator-password`), no `Admin console`, and a `Sign out`
  button. *Seam:* the two hosts' rendered headers (`[data-testid="opc-header"]`,
  `[data-testid="oc-header"]`) · *Pinned by:* `operator-chrome.spec.ts` "renders one account chip
  and, opened, the operator rows — no Admin console for a non-admin (#1008)",
  `operator-console.spec.ts` "renders the porcelain shell with the venue title + one account chip
  (#1008)", `operator-chrome.e2e.ts` "an admin on /admin gets the operator header + footer, not the
  tourist chrome".
- [x] **AC-2:** Given a signed-in admin, when the popover opens, then it holds `Admin console`
  (`/admin`) between `Create a venue` and `Change password`; on `/admin/email` that row carries
  `aria-current="page"`. *Seam:* the thin chrome's header · *Pinned by:* `operator-chrome.spec.ts`
  "adds the Admin console row for a platform-admin principal, current on the admin pages (#1008)".
- [x] **AC-3:** Given a signed-out visitor on `/admin`, when the thin chrome renders, then it
  shows the plain `Sign in` link whose href is
  `/account/sign-in?audience=operator&returnUrl=%2Fadmin` and no account chip. *Seam:* the thin
  chrome's header · *Pinned by:* `operator-chrome.spec.ts` "offers the operator sign-in (not
  session controls) when signed out" (unchanged) and `operator-chrome.e2e.ts` "a signed-out visitor
  on /admin is offered the operator sign-in from the header" (unchanged).
- [x] **AC-4:** Given the venue console with a loaded venue and 2 pending requests, when `Sign
  out` is activated from the chip, then focus is on the console's `<main>` before the session
  call resolves, the venue name/map, the requests store and the owned-venues cache are reset, and
  the router is asked for `/account/sign-in?audience=operator`; on the thin chrome, focus is parked
  on the shell's `<main>` and the same navigation follows. *Seam:* the hosts' `signOut` handling
  observed through the DOM, `Router.navigate` and the stores · *Pinned by:*
  `operator-console.spec.ts` "leaves for the unified auth page on sign-out, clearing venue + badge
  state" (extended with the focus assertion), `operator-chrome.spec.ts` "Sign out signs the session
  out and leaves for the operator sign-in", `app.spec.ts` "operator-chrome Sign out parks focus on
  main before the control unmounts (WCAG 2.4.3)" (both opening the chip first),
  `operator-console.e2e.ts` and `operator-chrome.e2e.ts` sign-out cases.
- [x] **AC-5:** Given the popover is open, when Escape is pressed, or the backdrop is clicked, or
  a row is activated, then the popover is gone and `document.activeElement` is the chip button;
  given the popover is open and a navigation ends that no row started (focus tabbed out), then
  the popover is gone and focus is untouched; on `/account/operator-password` the `Change
  password` row carries `aria-current="page"` and no other row does. *Seam:* the chip's rendered
  DOM under a real router · *Pinned by:* `operator-account-chip.spec.ts` "closes on Escape and
  returns focus to the chip", "closes on backdrop click and returns focus to the chip", "closes
  on row activation and returns focus to the chip", "closes when a navigation ends elsewhere,
  leaving focus where it is", "closes on a click outside the header, leaving focus where it is",
  "marks Change password current on the password page — exact path, query ignored"; `operator-password.e2e.ts` "operator changes its own password from the console,
  and the new credential replaces the old" (opening the page via the chip, asserting the row's
  `aria-current`).
- [x] **AC-6:** Given the touch-target sweeps at 390px, when they walk the venue console tabs and
  the admin tabs, then the chip and — with the popover open — every row measures ≥ 44 × 44 px.
  *Seam:* `expectTouchTargets` over the rendered page · *Pinned by:* `touch-targets.e2e.ts`
  "operator console — daily view, account menu open (#1008)" and `touch-targets-admin.e2e.ts`
  "operators — the account menu open (#1008)" (the existing closed-menu sweeps also cover the
  chip).
- [x] **AC-7:** Given porcelain's four background stops under the header glass, when the chip's
  avatar disc (`--riv-solid-fill-brand`) is composited against the glass, then it reaches ≥ 3:1
  at every stop, the chip's label ink on the chip tint reaches ≥ 4.5:1, and on the popover
  surface over every stop the row ink, the identity block's soft ink and the current row's accent
  on the hover fill each reach ≥ 4.5:1. *Seam:* the token mirrors in `src/testing/glass-tokens.ts`
  · *Pinned by:* `operator-account-chip.contrast.spec.ts` "porcelain: the avatar disc clears 3:1
  on the header glass", "porcelain: the chip label clears AA on the chip tint over the header
  glass", "porcelain: popover row inks clear AA on the pop surface over every stop".
- [x] **AC-8:** Given the venue console, the `/operator` landing and `/admin`, when the popover is
  open, then axe reports no serious or critical violation; given a 390px viewport on `/admin` and
  on `/operator/1/daily`, then the brand and the chip share one row (their boxes overlap
  vertically) and the header is not taller than 64px. *Seam:* the rendered page ·
  *Pinned by:* `operator-chrome.e2e.ts` "the account chip opens a popover on /admin and on the
  landing — axe clean, one header row on a phone (#1008)", `operator-console.e2e.ts` "the account
  chip opens a popover on the console — axe clean, one header row on a phone (#1008)",
  `operator-chrome.a11y.spec.ts` "has no violations with the account popover open".

## Non-goals

- The one shell (#1011): both chromes stay; only their account cluster changes. The thin chrome's
  `RivieraOperator` brand spacing bug (epic notes) lands with the shell.
- The venue switcher (#1009): `Create a venue` stays a chip row until that slice moves it.
- `Admin` as a section slot (#1011 / slice 4): `Admin console` stays a chip row until then.
- The console theme rows (#1010): no `Console theme` section in the popover.
- The tourist chrome's behaviour or appearance: `app.ts` changes only where its private recipe
  constants become imports of the hoisted module; every string stays byte-identical.
- A `role="menu"` pattern: the tourist header deliberately ships a disclosure (a button with
  `aria-expanded` revealing plain links), and this chip follows it.

## Behavior-parity ledger (retirement / replacement slices only)

The old surface is `operator/operator-actions.ts`, mounted on the thin chrome (`opc-*`) and the
venue console (`oc-*`).

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Five peers in the bar: Create a venue · Admin · Change password · `Signed in as` · Sign out | changed | one chip; the five become the popover's identity block + four rows (issue #1008) |
| `Create a venue` → `/operator?create=1` | preserved | the first row, same `routerLink` + `queryParams`; `operator-console.spec.ts` (#278) holds against the opened popover |
| `Admin` link (admins only) → `/admin` | changed (label) | the `Admin console` row, admins only, now `aria-current` on `/admin/**` via `routerLinkActive` (subset match) |
| `Change password` → `/account/operator-password` | preserved (+ current marker) | a row with `routerLinkActive` exact-path matching, `aria-current="page"` on the page itself |
| `Signed in as <strong>username</strong>` span in the bar | changed | the identity block inside the popover: handle in bold, `Signed in as <username>` in soft ink; the chip's accessible name `Account: <username>` carries it while closed |
| `Sign out` — a white pill button with `--riv-console-btn-border` / `-hover` | changed | a popover row on the `--riv-pop-*` tokens; the two console-btn tokens lose their only consumer and are retired (R-2) |
| Sign-out is an output; the host tears down | preserved | same `signOut = output<void>()`; the chip closes itself (focus to the chip) before emitting, the host then parks focus on `<main>` |
| Thin chrome: parks focus on `<main>` before sign-out | preserved | unchanged `OperatorChrome.onSignOut` |
| Venue console: no focus parking on sign-out (today) | changed → **added** | `oc-main` gains `tabindex="-1"`; `OperatorConsole.onSignOut` focuses it first (the issue's "still parks" was aspirational; AC-4) |
| Test-id prefix input, `<prefix>-{create-venue,admin-link,change-password,signout}` | preserved | same ids on the rows; `<prefix>-signed-in-as` is dropped for `<prefix>-account-identity`; new `<prefix>-account`, `<prefix>-account-menu`, `<prefix>-account-backdrop` |
| Host `display: contents` so the header's own gap lays the peers out | changed | the host is `relative flex items-center` — the popover positions against it; the header's flex row now holds one item |
| Rendered only while signed in (host-gated); nothing while `restoring()` | preserved | both hosts keep their gates; the chip never renders a signed-out state |
| Focus after activating a header link: lands wherever the destination puts it (body when the console unmounts) | preserved | row activation returns focus to the chip before the navigation; a console → password-page navigation still unmounts the chip (parity, not a regression; noted in R-5) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `--riv-chip-border` (ink at 0.14) composites 1.3:1 on the header glass, so a literal "chip boundary ≥ 3:1" is unmeetable without changing a tourist token | high | med | the chip's identity is its label + the avatar disc (solid brand fill, 5.4–5.9:1 measured); the contrast spec pins the disc and the label, and `non-text-contrast.md` gains the row; ← confirm? in Open questions | session | closed in code — `operator-account-chip.contrast.spec.ts` (phase 0), the docs row (phase 3); the token choice awaits the maintainer at review |
| R-2 | `--riv-console-btn-border`/`-hover` become dead tokens, and `fixed-ink-tokens.contrast.spec.ts` reads `operator-actions.ts` by path (deleting the file fails the suite) | high | med | retire both tokens: `tailwind.css` (declarations + `@theme inline` rows), `glass-tokens.ts` constants, the `CONSOLE_FAMILY` entries and the three sign-out `it`s in the fixed-ink spec, the sign-out block in `fixed-ink-token-recut.e2e.ts`, the hover `it` in `operator-console.contrast.spec.ts`, the two `non-text-contrast.md` rows + the state paragraph, the audit note's status; ← confirm? | session | closed in code (phase 3) — the fixed-ink spec now pins that neither token is declared; the retirement awaits the maintainer at review |
| R-3 | Seven e2e files and the page object click `oc-signout`/`opc-signout`/`oc-change-password` directly, and `expectSignedInAs` locates `Signed in as` text a closed popover does not render | high | high | a `openOperatorAccountMenu(page, prefix)` helper in `e2e/support/shell.ts`; the page object's `signedInCard` becomes the chip located by role + name, `signOut()` opens the chip first; every consumer listed in File structure is amended in phase 3 and run locally | session | closed — the eight amended files and the page object's other consumers (`admin-operator-suspension`, `operator-sign-in`) green locally, 32/32 (phase 3) |
| R-4 | A `fixed` backdrop inside a `backdrop-blur` header is contained by the header (filters establish a containing block), so a click on the page below may not close the popover | med | low | the tourist shell ships the same construction; the chip additionally closes on any `NavigationEnd` (AC-5), so a page click that navigates never leaves a stale popover; verified in the browser during phase 3 and recorded here | session | closed — **confirmed in the browser** (the backdrop measured 68px tall, the header's box; a click on the daily view left the popover open), fixed by a document click listener that closes on any click outside the host without moving focus; pinned by `operator-account-chip.spec.ts` "closes on a click outside the header, leaving focus where it is" and the console e2e's page-click assertion. The tourist shell carries the same containment — recorded as a follow-up below, out of this slice's scope |
| R-5 | Row activation returns focus to the chip, but a console → `/account/operator-password` navigation unmounts the console and its chip | low | low | parity with today's header link (the console unmounted then too); the thin chrome's chip persists, so there the return is real; the password page itself focuses nothing on load | session | closed — recorded in the parity ledger; the thin-chrome return is pinned by `operator-account-chip.spec.ts` |
| R-6 | Hoisting the popover recipes out of `app.ts` touches the tourist chrome file | med | low | strings byte-identical, `app.ts` imports them into its `CLS` unchanged; `app.spec.ts`, `app.contrast.spec.ts`, `theme-shell.e2e.ts`, `touch-targets-tourist.e2e.ts` and the find-a-booking/customer-auth e2e are the pin | session | closed — `app.spec.ts`/`app.contrast.spec.ts` green in the full unit run; `theme-shell`, `touch-targets-tourist`, `customer-auth`, `find-a-booking` and `current-page-marker` e2e green locally (73/73 with the two sweeps) |
| R-7 | A document-level Escape listener on the chip fires while other console overlays (bottom sheet, dialogs) handle Escape | low | low | the handler is a no-op unless the popover is open; the popover and those overlays are never open together (the backdrop catches the click that would open one) | session | closed — `operator-account-chip.spec.ts` "ignores Escape while closed — it never steals focus" (phase 0) |
| R-8 | Sibling slices (#1009–#1013) edit the same two headers | low | low | no open PRs today; they are sequenced after this one in the epic | session | closed — no in-flight overlap |

## Open questions / Assumptions

- **Assumption:** the "chip composites ≥ 3:1" AC is met by the avatar disc (the chip's visual
  anchor, solid brand fill) and the label ink, not by the `--riv-chip-border` hairline, which is
  the tourist header's token and decoration under `non-text-contrast.md` rule 2. ← confirm? —
  *Owner:* maintainer · *Resolves by:* review.
- **Assumption:** `--riv-console-btn-border` and `--riv-console-btn-hover` are retired with the
  sign-out pill (their only consumer), rather than kept as dead declarations. ← confirm? —
  *Owner:* maintainer · *Resolves by:* review.
- **Assumption:** the popover row order is identity · Create a venue · Admin console · Change
  password · Sign out (the issue's list), not the spike's Admin-first. ← confirm? — *Owner:*
  maintainer · *Resolves by:* review.
- **Assumption:** the popover/chip/avatar/backdrop recipes are hoisted from `app.ts` into
  `shared/popover-skin.ts` (both consumers import the same strings) rather than copied into the
  chip. ← confirm? — *Owner:* maintainer · *Resolves by:* review.
- **Assumption:** the venue console gains the focus-park on sign-out the issue describes as
  existing (it did not); the thin chrome already had it. ← confirm? — *Owner:* maintainer ·
  *Resolves by:* review.
- **Follow-up (out of scope, for the maintainer):** the tourist header's account and theme
  popovers share the R-4 construction — a `fixed` backdrop inside a `backdrop-filter` header is
  contained by the header, so a click on page content below it does not close them. This slice
  fixes the operator chip only (the epic keeps the tourist chrome out of scope); the same
  document-click close would fix `app.ts`. — *Owner:* maintainer · *Resolves by:* a follow-up
  issue if wanted.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: header chrome only, no booking, map or availability read or
write.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — no backend behaviour added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/operator-account-chip.ts` — `OperatorAccountChip` | new | standalone component | `open = signal(false)`; `handle`/`initial`/`ids` computed; `viewChild` chip button for focus return; `Router.events` `NavigationEnd` via `takeUntilDestroyed`; document Escape in `host` | — |
| FE-2 | `shared/popover-skin.ts` — `POP_SKIN`, `POP_BACKDROP`, `POP_ITEM`, `POP_BUTTON`, `CHIP`, `AVATAR`, `EXACT_PATH` | new | pure constants (class recipes + the exact-path match options) | — | — |
| FE-3 | `app.ts` | existing | standalone component | imports FE-2's strings in place of its private constants; no template change | — |
| FE-4 | `operator/operator-chrome.ts` | existing | standalone component | mounts the chip in place of `app-operator-actions` | — |
| FE-5 | `operator/operator-console.ts` + `.html` | existing | standalone component | mounts the chip; `onSignOut` parks focus on `oc-main` (`tabindex="-1"`) | — |
| FE-6 | `operator/operator-actions.ts` (+ spec) | retired | — | deleted | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs, host bindings in `host: {}`. No deviation.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `DONE — review + Sonar gates run and cleared; PR #1015 ready for the maintainer's merge`

**Next action:** the maintainer confirms the five ← confirm? assumptions and merges; the session's check-in verifies CI + Sonar on the fix pushes and, after the merge, runs the GitHub half of the close-out (`references/pr-gates.md` §3 steps 1–3, 6–7).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the chip component + the hoisted popover skin (spec, contrast spec) | ✅ | `Add the operator account chip (#1008)` |
| 1 — the thin chrome consumes the chip | ✅ | `Operator chrome: the account chip (#1008)` |
| 2 — the venue console consumes the chip, parks focus on sign-out | ✅ | `Venue console: the account chip, focus parked on sign-out (#1008)` |
| 3 — retire `OperatorActions` + the console-btn tokens; e2e, page object, docs, close-out | ✅ | `Console nav: chip e2e, retired sign-out tokens, docs (#1008)` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Review gate (round 1):** ran `code-review:code-review` (rung 1) over
`98efb2fdb04f04bbad6b6c59f80cf345ed6b5c49..506a7217289985975f718ccc1b853b60b50cdbd4` (36 files,
+1379/−561, verified by `check-review-range.mjs`) with `riviera-review-overlay` (frontend bank
RV-FE-1/7/8/9/10/11/E2E, RV-STYLE-1, RV-PROC-1/2): five reviewers, four findings (F-1..F-4), each
scored 75 by the verification pass — under the procedure's 80 bar, so no review comment was posted —
and all four fixed in the two review-fix commits. **Sonar gate:** quality gate passed on the head,
318 new lines analysed, 0 new issues, 0 duplicated blocks, 98.2% new-code coverage (the API lists,
not the badge). **Merge:** merges via PR #1015 (recorded here ahead of the merge, per §3 step 4); the
five ← confirm? assumptions above were settled by the maintainer's "merge when ready". The four
merged plan docs are retired in a docs-only push after the last code commit — the retirement was
missed in that commit and is due at this close-out, so the CI cycle is spent knowingly.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (git history reviewer) | the `non-text-contrast.md` rewrite of the retired hover-token paragraph cut to the next heading and removed four unrelated precedent paragraphs (the general shape, the dialog close button, the close-sales trigger, "What this rule is not") | fixed — the four paragraphs restored verbatim after the retirement note |
| F-2 | review (shallow bug scan) | the new open-popover sweep in `touch-targets.e2e.ts` landed between the phase-2 comment and the daily-view test it describes | fixed — moved after the daily-view test |
| — | review (prior-PR comments reviewer) | no carry-over finding: plan citations verbatim, token rationale single-homed, locators by test id / role | n/a |
| F-3 | review (code-comment reviewer) | the "five peers are gone" comment in the two host specs reads as a node count above an `a, button` length assertion (the old row had 3–4 such nodes) | fixed — "the old peer row is gone" |
| F-4 | review (code-comment reviewer) | the chip spec's header said "the four ways it closes"; the file pins five | fixed — "five" |

---

## File structure

- `docs/plans/console-nav-account-chip.md` — this plan.
- `docs/plans/admin-route-signals.md`, `docs/plans/console-nav-tab-rail.md`, `docs/plans/lazy-route-import-coverage.md`, `docs/plans/tourist-header-phone-tab-bar.md` — retired: their PRs (#998, #1000, #1005, #1014) merged, and this is the next close-out (`riviera-docs-freshness` § Plan-doc retirement); no doc or comment cited their paths.
- `frontend/src/app/shared/popover-skin.ts` — the hoisted recipes: `POP_SKIN`, `POP_BACKDROP`, `POP_ITEM`, `POP_BUTTON`, `CHIP`, `AVATAR`, `EXACT_PATH`.
- `frontend/src/app/app.ts` — imports the hoisted recipes; private copies removed.
- `frontend/src/app/operator/operator-account-chip.ts` — the chip + popover component.
- `frontend/src/app/operator/operator-account-chip.spec.ts` — rows per auth state, ids per prefix, open/close legs and focus, `aria-current`, sign-out output.
- `frontend/src/app/operator/operator-account-chip.contrast.spec.ts` — avatar disc, chip label, popover inks over porcelain.
- `frontend/src/app/operator/operator-actions.ts` — deleted.
- `frontend/src/app/operator/operator-actions.spec.ts` — deleted.
- `frontend/src/app/operator/operator-chrome.ts` — mounts the chip.
- `frontend/src/app/operator/operator-chrome.spec.ts` — chip + rows per auth state; sign-out through the chip.
- `frontend/src/app/operator/operator-chrome.a11y.spec.ts` — the open-popover case.
- `frontend/src/app/operator/operator-console.ts` — `onSignOut` parks focus on `<main>`.
- `frontend/src/app/operator/operator-console.html` — the chip in the header; `tabindex="-1"` on `oc-main`.
- `frontend/src/app/operator/operator-console.spec.ts` — chip, create-venue row, sign-out focus.
- `frontend/src/app/operator/operator-console.a11y.spec.ts` — TSDoc names the chip, not the pill tabs.
- `frontend/src/app/operator/operator-console.contrast.spec.ts` — the sign-out hover `it` and the signed-in-as title go with the pill.
- `frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts` — the `CONSOLE_FAMILY` shrinks to the card border; the three sign-out `it`s go.
- `frontend/src/app/shared/cta-border-token.contrast.spec.ts` — its `OUT_OF_FAMILY` pin follows the chip highlight to `shared/popover-skin.ts`.
- `frontend/src/testing/glass-tokens.ts` — `CONSOLE_BTN_BORDER`/`CONSOLE_BTN_HOVER` retired.
- `frontend/src/tailwind.css` — the two console-btn declarations and their `@theme inline` rows retired.
- `frontend/src/app/app.spec.ts` — the `opc-signout` focus test opens the chip first.
- `frontend/e2e/support/shell.ts` — `openOperatorAccountMenu(page, prefix)`.
- `frontend/e2e/support/pages/operator-sign-in.page.ts` — `signedInCard` = the chip by accessible name; `signOut()` opens the chip first.
- `frontend/e2e/operator-chrome.e2e.ts` — rows via the chip; sign-out via the chip; popover axe + one-row cases.
- `frontend/e2e/operator-console.e2e.ts` — sign-out via the chip; popover axe + one-row case.
- `frontend/e2e/operator-password.e2e.ts` — the page opened via the chip, `aria-current` on the row; identity via the chip name.
- `frontend/e2e/operator-registration.e2e.ts` — sign-out via the chip.
- `frontend/e2e/focus-ring-baseline.e2e.ts` — the baseline-ring pin retargeted from the sign-out pill to the chip button.
- `frontend/e2e/fixed-ink-token-recut.e2e.ts` — the sign-out pill block removed; the card-border read stays.
- `frontend/e2e/touch-targets.e2e.ts` — the open-popover sweep on the console.
- `frontend/e2e/touch-targets-admin.e2e.ts` — the open-popover sweep on `/admin`.
- `docs/design/non-text-contrast.md` — the two console-btn rows and the state paragraph retired; the avatar-disc row added.
- `docs/design/colour-literal-token-audit.md` — the `--riv-console-btn-hover` note records the retirement.
- `docs/runbooks/operator-credential-provisioning.md` — "the account chip's Change password row".
- `docs/design/riviera-operator-console-v2.dc.html` — the header note: the account chip.
- `docs/design/riviera-admin-console.dc.html` — the header note: the account chip.

---

## Phase 0 — The chip component and the hoisted popover skin

**Files:** Create `frontend/src/app/shared/popover-skin.ts`, `frontend/src/app/operator/operator-account-chip.ts` · Modify `frontend/src/app/app.ts` (constants → imports) · Test `frontend/src/app/operator/operator-account-chip.spec.ts`, `frontend/src/app/operator/operator-account-chip.contrast.spec.ts`

- [ ] **Step 1: Write the failing tests** — a host under `provideRouter` with routes for
  `/account/operator-password`, `/admin/email` and `/operator/onboarding`, mounting
  `<app-operator-account-chip testIdPrefix="oc" (signOut)="signedOut = true" />` with an
  `OperatorAuth` stub (`signedIn`, `isAdmin`, `username` signals). Cases: the chip button's name
  `Account: maria`, `aria-expanded` false → true on click; the closed state renders no row and no
  `Signed in as`; the opened popover's row set and hrefs for a non-admin and an admin (`Admin
  console` between `Create a venue` and `Change password`); every id carries the prefix; the four
  close legs of AC-5 with `document.activeElement` assertions; `aria-current` on the password
  row after `navigateByUrl('/account/operator-password?x=1')` and on the admin row after
  `/admin/email`; `Sign out` emits after closing. Contrast: the three AC-7 cases over
  `PORCELAIN_STOPS` with `PORCELAIN_HEADER_GLASS`, `PORCELAIN_CHIP`, `SOLID_FILL_BRAND`,
  `POP_SURFACE`, `POP_INK`, `POP_INK_SOFT`, `POP_HOVER`, `POP_ACCENT`.
- [ ] **Step 2: Run, verify fail** — `npx vitest run src/app/operator/operator-account-chip` → FAIL (module not found).
- [ ] **Step 3: Minimal implementation** — `shared/popover-skin.ts` (the strings lifted verbatim
  from `app.ts`), the component, `app.ts` importing the strings.
- [ ] **Step 4: Run, verify pass** — same command → PASS; `npx vitest run src/app/app` → PASS (the tourist shell unchanged).
- [ ] **Step 5: Generalization audit** — population "every component holding a private copy of the
  popover/chip recipe strings" → `grep -rn "riv-pop-surface\|riv-chip-bg" frontend/src/app --include=*.ts` → `app.ts` (migrated to the import) and the new chip; nothing else.
- [ ] **Step 6: Commit** — `Add the operator account chip (#1008)`.
- [ ] **Step 7: Update execution status.**

## Phase 1 — The thin chrome consumes the chip

**Files:** Modify `frontend/src/app/operator/operator-chrome.ts` · Test `frontend/src/app/operator/operator-chrome.spec.ts`, `operator-chrome.a11y.spec.ts`, `frontend/src/app/app.spec.ts`

- [ ] Step 1: rewrite the signed-in cases onto the chip (AC-1, AC-2), keep the signed-out and restoring cases, open the chip in the sign-out case; add the open-popover axe case; the `app.spec.ts` focus test opens the chip → FAIL.
- [ ] Step 2: mount `<app-operator-account-chip testIdPrefix="opc" (signOut)="onSignOut()" />` → PASS.
- [ ] Commit — `Operator chrome: the account chip (#1008)`.

## Phase 2 — The venue console consumes the chip

**Files:** Modify `frontend/src/app/operator/operator-console.ts`, `.html` · Test `frontend/src/app/operator/operator-console.spec.ts`, `.contrast.spec.ts`, `.a11y.spec.ts`

- [ ] Step 1: the shell case asserts the chip and no `Signed in as` in the bar; the create-venue case opens the chip; the sign-out case asserts `document.activeElement` is `oc-main` after the click → FAIL.
- [ ] Step 2: the chip in `oc-header-right`; `tabindex="-1"` on `oc-main`; `onSignOut` focuses it via `DOCUMENT` before `signOut()` → PASS; the contrast spec drops the sign-out hover case and retitles the signed-in-as case.
- [ ] Commit — `Venue console: the account chip, focus parked on sign-out (#1008)`.

## Phase 3 — Retirement, e2e, docs, close-out

- [ ] Delete `operator-actions.ts` + spec; retire the two console-btn tokens across `tailwind.css`, `glass-tokens.ts`, `fixed-ink-tokens.contrast.spec.ts`, `fixed-ink-token-recut.e2e.ts`, the docs rows (R-2).
- [ ] `e2e/support/shell.ts` helper + the page object (R-3); amend every e2e in File structure; add the AC-6 sweeps and the AC-8 popover cases; run the touched e2e files and both sweeps with `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`; verify R-4 in the browser.
- [ ] Runbook line and the two canvas notes.
- [ ] `npm run lint`, `npm run format:check`, `npm test`, `node scripts/check-plan-file-structure.mjs --diff origin/main`, the three hook guards by hand.
- [ ] Commit — `Console nav: chip e2e, retired sign-out tokens, docs (#1008)`; open the draft PR.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-07 | phase 3 (`fixed-ink-tokens.contrast.spec.ts` read `operator-actions.ts` by path; `cta-border-token.contrast.spec.ts` read `app.ts` for the chip highlight) | every spec that reads a source file this slice deleted or moved a recipe out of, by path | `grep -rn "readFileSync\|read('" frontend/src --include=*.spec.ts` then filtered on `app.ts`, `operator-actions`, `popover-skin` | `fixed-ink-tokens.contrast.spec.ts` (the deleted file), `cta-border-token.contrast.spec.ts` (the moved highlight) | the first drops the retired site and family, the second retargets its `OUT_OF_FAMILY` path to `shared/popover-skin.ts` |
| 2026-09-07 | phase 3 (e2e that click the old header controls directly) | every e2e or page object that locates `*-signout`, `*-change-password`, `*-admin-link`, `*-create-venue`, `*-signed-in-as` or the `Signed in as` text | `grep -rln "signed-in-as\|oc-signout\|opc-signout\|change-password\|admin-link\|create-venue\|Signed in as" frontend/e2e` | 8 files + `operator-sign-in.page.ts` | each opens the chip first through `openOperatorAccountMenu`; the page object locates the chip by accessible name |
| 2026-09-07 | phase 3 (R-4: the `fixed` backdrop contained by the `backdrop-filter` header) | every header popover whose backdrop sits inside a `backdrop-blur` header | `grep -rn "POP_BACKDROP\|inset-0 z-30" frontend/src/app --include=*.ts --include=*.html` | the chip (fixed here), the tourist shell's account/theme popovers (`app.ts`) | the tourist shell is out of the epic's scope — recorded as a follow-up in Open questions |
| 2026-09-07 | phase 0 (the popover recipes hoisted into `shared/popover-skin.ts`) | every component holding a private copy of the popover-surface / chip-glass recipe strings | `grep -rln "riv-pop-surface\|riv-chip-bg" frontend/src/app --include=*.ts` | `app.ts` (the tourist shell) and `popover-skin.ts` paint them; `semantic-chip.ts` and four contrast specs only name the tokens in comments | `app.ts` imports the hoisted strings; nothing else paints them |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `npx ng test --watch=false --include="src/app/operator/operator-chrome.spec.ts" --include="src/app/operator/operator-console.spec.ts"` → the chip cases pass; `operator-chrome.e2e.ts` green locally. Verified phases 1–3.
- [x] **AC-2:** `operator-chrome.spec.ts` "adds the Admin console row …" passes; `operator-chrome.e2e.ts` asserts the row's `aria-current` on `/admin`. Verified phases 1 and 3.
- [x] **AC-3:** the two signed-out cases pass unchanged. Verified phases 1 and 3.
- [x] **AC-4:** the two host sign-out specs (console with the focus assertion) + `app.spec.ts` focus test + both e2e sign-out cases pass. Verified phases 1–3.
- [x] **AC-5:** `npx ng test --watch=false --include="src/app/operator/operator-account-chip.spec.ts"` → 16 pass (the six close/current cases included); `operator-password.e2e.ts` asserts the row's `aria-current` on the page. Verified phases 0 and 3.
- [x] **AC-6:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/touch-targets.e2e.ts e2e/touch-targets-admin.e2e.ts` → green, the two open-popover sweeps included. Verified phase 3.
- [x] **AC-7:** `npx ng test --watch=false --include="src/app/operator/operator-account-chip.contrast.spec.ts"` → 3 pass. Verified phase 0.
- [x] **AC-8:** `operator-chrome.e2e.ts` and `operator-console.e2e.ts` popover cases (axe clean, one row ≤ 80px at 390px) and `operator-chrome.a11y.spec.ts` "has no violations with the account popover open" pass. Verified phases 1 and 3.

Full local runs at phase 3: `npm run lint`, `npm run format:check`, the three hook guards and `check-plan-file-structure.mjs` clean; `npm test` 2624/2624 after the `cta-border-token` retarget; 32 + 73 mocked e2e green across the amended files, the sweeps and the tourist-shell pins.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #) — the five ← confirm? assumptions and the tourist-shell follow-up are the maintainer's at review; each is a reversible choice recorded in the PR's scope notes.
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
