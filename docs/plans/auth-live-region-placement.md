# Auth Live-Region Placement Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Each of the five auth outcome regions announces its sentence to assistive tech —
by outliving the branch that produces its text, or by receiving focus — and each is pinned
by a spec that fails if the region moves back inside its branch.

**Architecture:** The tree already holds three correct shapes for this, and the right one
differs per surface, so this is a per-site choice, not one blanket swap. A surface whose
trigger is **destroyed** by the transition takes the `erase-done` shape (focus moves onto the
notice, which announces it and also rescues focus from `<body>` — WCAG 2.4.3); a **loading**
surface takes `shared/load-announcer.ts`, which RV-FE-10 mandates over a hand-rolled region;
a surface whose trigger **survives** takes the `oppw-notice` shape (a persistent region,
present but empty, whose text is all that changes). No new mechanism is invented.

**Persistence:** N/A — frontend-only, no table and no migration touched (invariant #1 not in
play).

**Source of intent:** GitHub issue #1076 (surfaced by the review gate on #1075, the `<output>`
sweep for #1042).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed no open
PRs to collide with, and caught that the issue's five-site list omits a sixth lookalike,
`oppw-notice`, which is already correct and is the model for site 5) · `riviera-plan-doc` (this
template — forced the per-site shape decision into the ACs, and the Behavior-parity ledger that
caught the `toBeHidden()` e2e assertions) · `tdd` (each site red-first: the spec asserts element
identity or the focus move, both of which fail against today's shape) · `riviera-review-overlay`
(RV-FE-10 is the rule under repair; its mutation-check requirement shaped every AC) ·
`riviera-docs-freshness` (**ran** over `0c079160..fc42c418`, 1 finding — no substrate doc states anything this slice falsified, and no doc counts the load-announcer's adopters; the finding is a close-out obligation rather than drift: `docs/plans/output-live-region-idiom.md` is a merged slice's plan due for retirement, and its one deferred residual is issue #1076, which this PR closes) · `riviera-frontend`
(placement: all five edits stay in the existing `auth/` feature folder, no new file, no import
direction change) · `angular-developer` + angular-cli MCP
(`get_best_practices` for the v22 posture — **loaded late, at the review gate, not before phase 0**:
RV-PROC-1 caught the placeholder. Re-vetted all four components against it and found nothing to
change; the static `loadingLabel`/`readyLabel` attribute bindings onto `input.required<string>()`
are the shape `set-password.ts` already uses) · `playwright-cli` (loaded before phase 4 — put the
real-browser half in `frontend/e2e/`, the CI-safe mocked suite, and settled the promise-gated
`page.route` registered last so it wins over the recovery mock) · `riviera-tailwind`
(**also loaded late**, same finding. It changed the diff: its no-drift rule and the #828 precedent
put a `toHaveCSS('margin-bottom', '20px')` pin on the hoisted region's reserved space, which
nothing else was holding. Otherwise clean — no new token, no `@apply`, no SCSS to migrate, no new
interactive control, no `outline-none`) · `riviera-local-debug` (scoped Vitest runs; `PW_CHROMIUM_EXECUTABLE`
for the mocked e2e suite in this cloud session)

**Branch:** `claude/sdlc-1076-yhknnr` — the cloud session's designated remote branch stands in
for `bugfix/auth-live-region-placement` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the forgot-password page with an email entered, when the request
  succeeds and the form branch is replaced, then focus is on the `forgot-sent` notice (which
  is therefore announced) rather than stranded on `<body>` by the destroyed submit button.
  *Seam:* the rendered `ForgotPassword` component DOM at `/account/forgot`, by `data-testid` ·
  *Pinned by:* `forgot-password.spec.ts` › `parks focus on the sent confirmation, whose trigger the branch destroyed (#1076)`

- [x] **AC-2:** Given the reset-password page with a valid token and matching passwords, when
  the reset succeeds, then focus is on the `reset-done` notice and the submit button is gone.
  *Seam:* the rendered `ResetPassword` component DOM at `/account/reset`, by `data-testid` ·
  *Pinned by:* `reset-password.spec.ts` › `parks focus on the done confirmation, whose trigger the branch destroyed (#1076)`

- [x] **AC-3:** Given the verify-email page mounted in its `verifying` state, when verification
  succeeds, then the **same** `load-announcer` element that held `Verifying your email…` now
  holds `Your email is verified. Thanks!` — element identity asserted across the transition,
  not merely the presence of text. *Seam:* the rendered `VerifyEmail` component DOM at
  `/account/verify`, by `data-testid` · *Pinned by:* `verify-email.spec.ts` ›
  `announces through one region that survives verifying → verified (#1076)`

- [x] **AC-4:** Given the verify-email page in either announced state, then the visible copy
  beside the announcer carries `aria-hidden="true"`, so the sentence has exactly one source
  (RV-FE-10). *Seam:* same as AC-3 · *Pinned by:* `verify-email.spec.ts` ›
  `announces through one region that survives verifying → verified (#1076)`

- [x] **AC-5:** Given a verification that fails (`invalid-token` or a transport error), when the
  page settles, then the announcer is empty and the failure is carried by the branch's
  `role="alert"` panel — `[ready]` is true in exactly one of the four branches, so an exit
  nobody described is silent rather than lying. *Seam:* same as AC-3 · *Pinned by:*
  `verify-email.spec.ts` › `leaves the announcer silent on an invalid token (#1076)`, ›
  `… on a transport error (#1076)`, › `… on a link with no token at all (#1076)` (one `it.each`)

- [x] **AC-6:** Given the signed-in account page before any resend or save, when a resend
  outcome or a password save lands, then the **same** `setpw-notice` element that was present
  and empty beforehand now holds the sentence. *Seam:* the rendered `SetPassword` component DOM
  at `/account/password`, by `data-testid` · *Pinned by:* `set-password.spec.ts` ›
  `announces the resend outcome through a region that predates it (#1076)`

- [x] **AC-7:** Given a repeated resend with the same outcome, when the second response lands,
  then the notice text passed through empty in between, so the region mutates and re-announces
  instead of holding an unchanged string. *Seam:* same as AC-6 · *Pinned by:*
  `set-password.spec.ts` › `re-announces an identical resend outcome by clearing first (#1076)`

- [x] **AC-8:** Given a real Chromium browser, when each of the three flows runs against the
  mocked API, then the region handle taken before the transition is still attached after it
  (verify-email) and focus lands on the notice (forgot, reset) — the half jsdom's hand-driven
  change detection cannot prove. *Seam:* the routes `/account/forgot`, `/account/reset`,
  `/account/verify` in the CI-safe mocked Playwright suite · *Pinned by:*
  `frontend/e2e/loading-announcements.e2e.ts` › `verify-email announces through a region that outlives the switch (#1076)`, ›
  `the account notice announces through a region that predates it (#1076)`, ›
  `the forgot and reset confirmations take focus when their form is replaced (#1076)`

## Non-goals

- **No focus move on `setpw-notice`.** Its triggers (the resend button, the submit button)
  both survive the transition, so nothing is stranded (WCAG 2.4.3) and the persistent region
  alone makes it announce. That argument covers only the stranding half: `operator-password.ts`'s
  `revealOutcome()` moves focus for a **second, older** reason — the notice sits above the form,
  so on a phone a success message can land off-screen — and that reason does apply here. It is a
  pre-existing sighted-visibility gap, not announcement timing, so it stays out of this slice and
  is filed as **#1079** (review finding F-1).
- **No change to `erase-done` or `oppw-notice`.** Both are already correct and pinned; the
  issue names the first, and the intake grill found the second.
- **No copy changes.** Every sentence on these five pages is already correct; this is
  announcement timing only.
- **No re-audit of the non-auth live regions** beyond the generalization sweep recorded below —
  the `<output>` population was swept in #1042/#1075 and this slice verifies rather than reopens it.
- **No backend, no schema, no API contract change.**

## Behavior-parity ledger (retirement / replacement slices only)

> This slice replaces the announcement mechanism on five existing surfaces, so the ledger applies
> to those surfaces' observable behaviour.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `forgot-sent` shows the uniform "if an account exists…" confirmation | preserved | same `<output>`, same copy, same branch — it only gains `tabindex="-1"` and receives focus |
| forgot-password focuses the first input on initial render | preserved | the constructor `afterNextRender` is untouched; the new move fires only on the success transition |
| focus after a successful forgot submit lands on `<body>` | changed | now lands on the confirmation — the destroyed submit button left it stranded (WCAG 2.4.3) |
| `reset-done` shows "Your password has been updated." | preserved | same `<output>`, same copy, same branch, plus `tabindex="-1"` and the focus move |
| reset-password's `reset-no-token` and `reset-error` dead-ends | preserved | untouched; both are `role="alert"`, announced on insertion |
| `verify-pending` / `verify-success` carry the visible sentences | preserved | same sentences, same `data-testid`s, now on `<p aria-hidden="true">` with `app-load-announcer` speaking them |
| `verify-pending` / `verify-success` are `<output>` elements | changed | they become plain `<p>`; the region role moves to the announcer, so the sentence has one source (RV-FE-10) |
| verify-email's `invalid` / `error` branches announce via `role="alert"` | preserved | untouched — insertion of an alert is the one reliably-announced case |
| `setpw-notice` is absent until a notice exists | changed | now always present and empty in the signed-in branch, matching `oppw-notice`; `toBeHidden()` e2e assertions become `toHaveText('')` |
| `setpw-notice` reports role `status` | preserved | still an `<output>` |
| a repeated resend with the same outcome leaves the text unchanged | changed | `resend()` clears the notice first, as `onSubmit()` already does, so the region mutates and speaks again |
| the account form sits directly below the verification hint | changed | the empty region reserves its `mb-5` (20px), removing the jump when a notice arrives — the accepted house behaviour (`empty:mb-0` was deleted as a no-op in #828) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `customer-password.e2e.ts` asserts `toBeHidden()` on `setpw-notice` in four places; the region is now always in the DOM | high | med | An empty block box has zero height so `toBeHidden()` would likely still pass — do not rely on that. Switch all four to `toHaveText('')`, the assertion `operator-password.e2e.ts` already uses for the same shape | agent | closed — all four switched in `75151fb`..this commit; the mocked suite is green |
| R-2 | The always-present empty notice reserves 20px above the set-password form — a visible layout change | high | low | Deliberate and precedented: #828 deleted `empty:mb-0` on the identical `oppw-notice` as a no-op, and reserving the space removes a content jump. Recorded in the parity ledger | agent | closed — accepted, ledger row written |
| R-3 | Moving focus on the forgot/reset success could fight the constructor's initial-render input focus | low | med | The two fire on different renders (mount vs. the success transition) and the input no longer exists by then. AC-1/AC-2 assert the final resting place; a separate existing spec asserts the mount focus | agent | closed — both specs pass together |
| R-4 | Changing `verify-pending`/`verify-success` from `<output>` to `<p>` could break a spec or e2e asserting a role | low | low | Grepped: no role assertion exists on either testid (only `setpw-notice` has one, and it keeps `<output>`). `prefer-output-over-status-role` is not tripped — no `role="status"` is added | agent | closed — `npm run lint` green, `verify-success` e2e unchanged |
| R-5 | The announcer duplicates the two verify sentences in the DOM | high | low | Required by the one-source rule only if both are exposed; the visible copies carry `aria-hidden="true"`, which AC-4 pins. Same shape `set-password.ts`'s `setpw-loading` already uses | agent | closed — AC-4 pins both copies |
| R-6 | jsdom computes no live-region behaviour, so a green unit suite does not prove announcement | high | med | Accepted and bounded: the falsifiable half is the mechanism (element identity, focus, `aria-hidden`), asserted in jsdom and again in real Chromium (AC-8). That no screen reader was observed is stated, not papered over | agent | closed — stated in the PR's Scope notes |

## Open questions / Assumptions

None outstanding.

### Resolved

- **Assumption:** Moving focus to an element announces its content, which is what makes the
  `erase-done` shape a valid fix for AC-1/AC-2. — *Outcome:* stands, and it is the repo's
  settled position rather than this slice's: `frontend/.claude/CLAUDE.md` names
  `shared/focus-after-render.ts`'s `focusMover()` as the required mechanism whenever a
  transition destroys the focused element (RV-FE-9), and `set-password.ts`, `operator-password.ts`
  and `booking-view.ts` each rely on it under a spec. Not re-litigated. Closed at `4f04964`.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice touches no booking, set, date or map surface;
it changes where four Angular elements sit in their templates and where focus lands.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java file is in the diff.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `auth/forgot-password.ts` | existing | standalone component | signals; adds `focusMover()` from `shared/focus-after-render.ts` | Signal Forms (untouched) |
| FE-2 | `auth/reset-password.ts` | existing | standalone component | signals; adds `focusMover()` | Signal Forms (untouched) |
| FE-3 | `auth/verify-email.ts` | existing | standalone component | signals; imports `LoadAnnouncer`, binds `[loading]`/`[ready]` off the existing `state()` signal | none |
| FE-4 | `auth/set-password.ts` | existing | standalone component | signals; the `notice()` region is hoisted out of its `@if` and cleared at the top of `resend()` | Signal Forms (untouched) |

**Standards:** standalone components, `inject()`, `@if`/`@switch`, signal inputs,
`afterNextRender` via the existing `focusMover()` helper. No deviation.

## FE↔BE contract

N/A — no contract change. No request, response, or DTO shape is touched.

## Execution status

**Stage pointer:** `DONE — merged via PR #1077`

**Next action:** None. CI green, Review gate run in full, Sonar gate green with an empty list,
findings resolved or deferred with issue numbers.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — forgot-password: focus the sent confirmation | ✅ | `4f04964` |
| 1 — reset-password: focus the done confirmation | ✅ | `effd8c2` |
| 2 — verify-email: one announcer across the switch | ✅ | `d107278` |
| 3 — set-password: hoist the notice out of its branch | ✅ | `75151fb` |
| 4 — real-browser coverage + the e2e assertions R-1 names | ✅ | `fc42c41` |
| 5 — review-gate fixes (F-1, F-5, F-6) + close-out | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (git-history reviewer) | This slice names `oppw-notice` as its model but copies only the persistent-region half. The model also moves focus, for a visibility reason (the notice sits above the form, so a phone can leave a success message off-screen) that applies to `set-password.ts` too, and the Non-goals rested only on the stranding argument | deferred → issue **#1079**. Pre-existing and unchanged by this diff — the notice sat in the same place before, merely absent until it had text — and it is sighted visibility, not the announcement timing this slice is scoped to. Non-goals corrected to name both halves rather than rest on the incomplete one |
| F-2 | review gate (git-history reviewer) | Does making `setpw-notice` unconditional undo a deliberate earlier accessibility decision? | not a finding — verified: `git log -S` shows the `@if` came from the file's first commit (`bcd33a7`, the S8 slice), weeks before any of the a11y hardening, so there is no decision to undo |
| F-3 | review gate (git-history reviewer) | Does replacing verify-email's two `<output>`s with `aria-hidden` `<p>`s regress #1042's `<output>` idiom sweep? | not a finding — verified: `0c079160`'s own commit message defers exactly these five sites to #1076, so this is that sweep's intended completion, and the region role moves to the announcer rather than disappearing |
| F-5 | review gate (riviera overlay, RV-PROC-1) | Three `<pending>` placeholders on the *Skills consulted* line named phases that had already shipped, which reads as "written first, loaded after" | fixed in this commit — and the finding was right on the substance, not just the wording: `angular-developer` and `riviera-tailwind` genuinely had not been loaded. Both loaded and re-vetted at the gate. Angular found nothing to change; `riviera-tailwind` changed the diff, adding the reserved-space pin. `playwright-cli` had been loaded before phase 4 as claimed |
| F-6 | review gate (riviera overlay) | Two *Pinned by* pointers named tests that do not exist (AC-5's `it.each` expands to three names; AC-8 named one test where three shipped), and the AC-verification section still held `<sha>` placeholders | fixed in this commit |
| F-4 | Sonar gate | Quality gate green — and not a false zero: `new_lines` = 29, so the analysis read the diff | closed — 0 new issues, 0 bugs/vulnerabilities/smells, 0 duplicated blocks, 100.0% new-code coverage. Judged on the analysed paths only: the four component files. The specs are excluded by `sonar.exclusions=**/*.spec.ts`, and the two e2e files and this plan doc lie outside `sonar.sources` |

---

## File structure

- `docs/plans/auth-live-region-placement.md` — this plan
- `frontend/src/app/auth/forgot-password.ts` — `forgot-sent` gains `tabindex="-1"`; `focusMover()` on the sent transition
- `frontend/src/app/auth/forgot-password.spec.ts` — AC-1
- `frontend/src/app/auth/reset-password.ts` — `reset-done` gains `tabindex="-1"`; `focusMover()` on the done transition
- `frontend/src/app/auth/reset-password.spec.ts` — AC-2
- `frontend/src/app/auth/verify-email.ts` — `app-load-announcer` above the `@switch`; the two visible copies become `aria-hidden` `<p>`s
- `frontend/src/app/auth/verify-email.spec.ts` — AC-3, AC-4, AC-5
- `frontend/src/app/auth/set-password.ts` — `setpw-notice` hoisted out of its `@if`; `resend()` clears the notice first
- `frontend/src/app/auth/set-password.spec.ts` — AC-6, AC-7
- `frontend/e2e/loading-announcements.e2e.ts` — AC-8
- `frontend/e2e/customer-password.e2e.ts` — R-1: `toBeHidden()` → `toHaveText('')`; plus the
  reserved-space pin `riviera-tailwind`'s no-drift rule put on the hoisted region
- `docs/plans/output-live-region-idiom.md` — **deleted**: its PR merged as `0c079160`, so the next
  close-out retires it (`riviera-docs-freshness` § *Plan-doc retirement*). Nothing outside
  `docs/plans/` cites the slug, and its only deferred residual is issue #1076, which this PR closes

---

## Phase 0 — forgot-password: focus the sent confirmation

**Files:** Modify `frontend/src/app/auth/forgot-password.ts` · Test `frontend/src/app/auth/forgot-password.spec.ts`

- [x] **Step 1: Write the failing test** — asserts the resting place of focus after the branch
  swap, not the presence of the text (presence passes for the broken shape too).
- [x] **Step 2: Run it, verify it fails** — `npm test -- forgot-password` → FAIL (focus is on `<body>`)
- [x] **Step 3: Minimal implementation** — `tabindex="-1"` on the `<output>`; `focusMover()` field; `this.focusAfterRender('forgot-sent')` after `this.sent.set(true)`
- [x] **Step 4: Run it, verify it passes** — `npm test -- forgot-password` → PASS
- [x] **Step 5: Generalization-audit pass** — recorded in the log below
- [x] **Step 6: Commit** — `git commit -m "Announce the forgot-password confirmation by focusing it (#1076)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — reset-password: focus the done confirmation

**Files:** Modify `frontend/src/app/auth/reset-password.ts` · Test `frontend/src/app/auth/reset-password.spec.ts`

Same five steps as phase 0, against `reset-done` and `this.done.set(true)`.

## Phase 2 — verify-email: one announcer across the switch

**Files:** Modify `frontend/src/app/auth/verify-email.ts` · Test `frontend/src/app/auth/verify-email.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-3 (element identity across `verifying → verified`),
  AC-4 (`aria-hidden` on both visible copies), AC-5 (silent on every non-verified exit)
- [x] **Step 2: Run, verify they fail** — `npm test -- verify-email` → FAIL (no announcer exists)
- [x] **Step 3: Minimal implementation** — `app-load-announcer` above the `@switch`, bound
  `[loading]="state() === 'verifying'"` and `[ready]="state() === 'verified'"`; the two
  `<output>`s become `<p aria-hidden="true">`
- [x] **Step 4: Run, verify they pass**
- [x] **Step 5–7:** as phase 0.

## Phase 3 — set-password: hoist the notice out of its branch

**Files:** Modify `frontend/src/app/auth/set-password.ts` · Test `frontend/src/app/auth/set-password.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-6 (the region predates its text), AC-7 (a repeated
  identical outcome still mutates)
- [x] **Step 2: Run, verify they fail** — `npm test -- set-password`
- [x] **Step 3: Minimal implementation** — the `<output>` becomes unconditional, interpolating
  `notice()`; `resend()` clears `notice` before awaiting, as `onSubmit()` already does
- [x] **Step 4–7:** as phase 0.

## Phase 4 — real-browser coverage

**Files:** Modify `frontend/e2e/loading-announcements.e2e.ts` · Modify `frontend/e2e/customer-password.e2e.ts`

- [x] **Step 1:** Add the AC-8 test; fix the four R-1 assertions
- [x] **Step 2:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`
- [x] **Step 3:** Full frontend gate — `npm run lint`, `npm run format:check`, `npm test`
- [x] **Step 4–5:** commit + execution status.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-12 | phase 4 | A live region whose element mounts inside the `@if`/`@case` branch producing its text, with no persistent sibling region and no focus move onto it. Enumerated by listing every live region in the tree, resolving each to its nearest enclosing control-flow branch, then checking each branch-nested hit against its component's `focusMover()` targets — that last step is what separated the real findings from the lookalikes | `grep -rn 'aria-live\|role="status"\|<output' frontend/src` (the RV-FE-10 follow-up command), then a script mapping each hit to its enclosing branch, then `grep -o "focusAfterRender('[a-z0-9-]*'" <component>.ts` | 69 live regions; 21 branch-nested; of those, **the 5 auth sites this slice fixes**, 2 already correct by focus move (`payouts-notice`, `daily-notice`), 5 standing-state or per-row-by-design (`pending-approval-banner`, `venue-tab` season, `requests-tab` expiry, `home` photo position, `booking-pay` processing — the last has the persistent `pay-status` sibling), and **9 genuine defects outside `auth/`** | Fixed the 5 in scope. The 9 others are a slice of their own, not a "while I'm here": filed as **#1078** with the enumerated table, the two that need a judgement call rather than the same fix (`pricing-tab`'s per-row region, `home`'s `empty` panel), and the method above so the next session does not re-derive it |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 … AC-7:** `npx ng test --watch=false` → 257 files / 3172 tests green, and green again
  in CI's Frontend job on `fc42c41`. Each was red first, and each was mutation-checked: moving a
  region back inside its branch, widening `[ready]` past the loaded branch, or dropping the clear
  in `resend()` each fails its spec.
- [x] **AC-8:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → green
  (the four announcement tests plus the four `customer-password` tests re-run after the R-1 and
  reserved-space edits).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section justified N/A (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — N/A.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A.
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR, in its last code-touching commit**, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc` `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
