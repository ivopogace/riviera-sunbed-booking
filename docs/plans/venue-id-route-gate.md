# The route owns `:venueId` validity — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. Invariant numbers refer
> to `CLAUDE.md`.

**Goal:** A malformed `/operator/:venueId` never activates the console: one route guard
redirects it to a real, deep-linkable **Venue not found** page, and the seven unreachable
invalid-venue arms inside the console shell and its six tabs are deleted.

**Architecture:** The single most significant decision — **route-level validity, one
owner**. Today the shell's `@if (venueId() === undefined)` is the owner and the six tab
arms are dead weight behind it (#1127). A `canActivate` guard on `operator/:venueId`
applying the same positive-integer rule as `idParam` makes the invalid state a *routing*
outcome, so every component downstream may assume a valid id, and the surface becomes
reachable by a real navigation — e2e-testable for the first time (#1126's plan recorded
that no Playwright spec could drive it).

**Persistence:** N/A — frontend-only slice; no table, no migration (invariants #1, #12 not
engaged).

**Source of intent:** GitHub issue #1127 (the pattern decision) and #1128 (requests-tab's
wrong bad-link copy), folded in per the maintainer's answer at the plan gate.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
#1128 is the same mechanism and must be folded in, that #1127's own two options were both
weaker than a route gate, and that #1126's plan doc was never retired at close-out) ·
`riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is what
surfaced that the tabs' reset-on-invalid-param specs die while the valid→valid switch specs
carry the behaviour) · `tdd` (each phase red-green at the seams named below) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) · `riviera-docs-freshness`
(**ran** at phase 3 over `24a48bd3..HEAD`, 5 findings, all patched — the counting sweep caught
three in files this slice never touched) ·
`riviera-frontend` (placement: the guard is cross-cutting → `core/`, the page is an operator
surface → `operator/`, routes stay in the one `app.routes.ts`, literal above `:param`) ·
`riviera-tailwind` (the new page re-uses the retiring card's exact utility classes, so the
no-drift rule is satisfied by construction; testids kept as inert markers, rule 2) ·
`angular-developer` + angular-cli MCP (`get_best_practices` for the v22 posture;
`search_documentation` settled `CanMatch` semantics and first-match-wins route ordering —
both consulted before the mechanism was chosen) · `playwright-cli` (phase 2, the mocked
CI-safe suite).

**Branch:** `claude/angular-tailwind-docs-wxcbvk` — the cloud session's designated remote
branch stands in for `bugfix/venue-id-route-gate` (`riviera-sdlc` § Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a signed-in operator, when the router navigates to `/operator/not-a-venue`,
      then the URL settles on `/operator/venue-not-found` and `OperatorConsole` is never
      activated. *Seam:* the real route table (`app.routes.ts`) driven through
      `RouterTestingHarness` · *Pinned by:* `venue-id.guard.spec.ts` ›
      `redirects a malformed :venueId to the venue-not-found page`
- [x] **AC-2:** Given a signed-in operator, when the router navigates to `/operator/0/pricing`,
      `/operator/-3/daily` or `/operator/1.5`, then each settles on `/operator/venue-not-found`
      and no tab component is activated. *Seam:* the real route table ·
      *Pinned by:* `venue-id.guard.spec.ts` › `rejects every non-positive-integer :venueId`
- [x] **AC-3:** Given a signed-in operator, when the router navigates to `/operator/7/pricing`,
      then the guard passes and `PricingTab` activates under `OperatorConsole` — the gate
      does not over-reject. *Seam:* the real route table ·
      *Pinned by:* `venue-id.guard.spec.ts` › `lets a positive-integer :venueId through`
- [x] **AC-4:** Given the route table, when the router navigates to `/operator/venue-not-found`,
      then the page activates once and does not redirect to itself (the literal segment is
      matched by the literal route, not by `:venueId`). *Seam:* the real route table ·
      *Pinned by:* `venue-id.guard.spec.ts` › `does not redirect its own destination`
- [x] **AC-5:** Given a signed-out visitor, when they open `/operator/not-a-venue`, then they
      reach the auth page with `audience=operator` and `returnUrl=/operator/venue-not-found` —
      never a `returnUrl` back to the dead link. *Seam:* the real route table ·
      *Pinned by:* `venue-id.guard.spec.ts` › `sends a signed-out visitor to sign-in for the page, not the dead link`
- [x] **AC-6:** Given the venue-not-found page, when it renders, then it shows the
      `Venue not found` heading and offers BOTH destinations the two old copies disagreed
      about — the venue list (`/operator`) and create-a-venue (`/operator?create=1`).
      *Seam:* the rendered `/operator/venue-not-found` route ·
      *Pinned by:* `venue-not-found.spec.ts` › `offers the venue list and create-a-venue`
- [x] **AC-7:** Given a console tab on `/operator/7/pricing`, when the parent param changes in
      place to a *valid* `8`, then the tab still resets and reloads for venue 8 — the
      behaviour #1122/#1125 built survives the deletion of the invalid arms.
      *Seam:* the tab's parent `ActivatedRoute.paramMap` ·
      *Pinned by:* the existing `pricing-tab.spec.ts` › `re-loads for the new venue when the parent param changes in place` (and its `venueId: '2'` siblings in `layout-editor.spec.ts`, `daily-view-tab.spec.ts`)
- [x] **AC-9:** Given a `:venueId` segment that `Number()` would coerce but that does not spell a
      venue — `7e2`, `0x10`, `+7`, `7.0`, `007`, `' 7 '`, a value past 2^53 — when the rule reads
      it, then it yields `undefined` and the guard redirects, so no URL aliases a venue it does not
      spell. *Seam:* `shared/parent-venue-id.ts`'s `idParam` (and the route table above it) ·
      *Pinned by:* `parent-venue-id.spec.ts` › `returns undefined for the non-canonical segment %o`
      and `venue-id.guard.spec.ts` › `rejects the non-positive-integer :venueId %o`
- [x] **AC-8:** Given a real browser in the mocked suite, when it navigates to `/operator/abc`,
      then the venue-not-found card is visible and axe reports no serious violations.
      *Seam:* the running app at the route · *Pinned by:*
      `frontend/e2e/venue-id-route-gate.e2e.ts` › `a malformed venue id lands on the venue-not-found page`

## Non-goals

- **No app-wide `**` catch-all route.** `app.routes.ts` has none today; adding one is a
  separate product decision (what a tourist 404 looks like) and is not needed here — the
  guard redirects rather than falling through.
- **No change to the *valid-but-missing* venue path.** `/operator/999` where 999 is a
  well-formed id the backend doesn't know stays exactly as it is: the guard passes, the
  console mounts, the tabs show their existing load-error states.
- **No narrowing of `idParam` / `routeIdParam`.** `app.ts`'s route-chrome walk and
  `console-shell.ts` legitimately read `undefined` on plain and admin routes; only the two
  console-specific helpers narrow.
- **No redesign of the card.** The retiring card's markup and utilities move verbatim.
- **No new e2e in the real-backend suite** — the gate is client-side routing.

## Behavior-parity ledger

> The slice retires the shell's `oc-invalid-venue-card` arm and six tab arms.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Shell renders `oc-invalid-venue-card` in place of the outlet when `:venueId` is malformed | changed | Same card, same utilities, same `oc-invalid-venue-card` / `oc-invalid-venue` testids — now the `/operator/venue-not-found` page the guard redirects to |
| Card heading `Venue not found` | preserved | Verbatim on the new page (AC-6) |
| Card link `create a venue` → `/operator?create=1` | preserved | Verbatim on the new page (AC-6) |
| Tabs' copy `Open the console from your venue list.` (venue/pricing/layout) | changed | Merged into the one page, which now links to the venue list **and** create-a-venue — this is #1127's copy disagreement resolved by giving both destinations one owner |
| `requests`/`payouts`/`daily-view` `markInvalid()` → the load-error card (`Refresh the page…`) | dropped | #1128's defect. The state cannot occur: the guard redirects before any tab activates |
| Tabs reset their venue-scoped state when the param goes invalid in place (#1122, #1125) | changed | The *trigger* is gone — a valid→invalid change now redirects, so no tab observes it — but the *behaviour* (drop the venue-scoped state, empty the live region, never unmount it) is unchanged and re-pinned on a valid→valid switch. Four specs whose invariant had no valid-switch twin were **converted** (`venue-tab` Saved announcer, `pricing-tab` row-saved announcer, `requests-tab` decision notice, `layout-editor` layout-saved announcer + draft clearing + row-name write error); five that duplicated an existing valid-switch spec or drove the deleted card were retired |
| Shell renders no `router-outlet` on a bad id (`operator-console.spec.ts` › `#170 review finding 1`) | changed | Stronger: the console is never activated at all. Re-pinned by `venue-id.guard.spec.ts` (AC-1) |
| No venue reads fire on a bad id | preserved | The console never activates, so no read can be issued; asserted in the guard spec |
| Bad id showed the **venue** console chrome (a rail whose tab links interpolated `undefined`) | changed → **fixed** | The new route carries `data: { console: 'plain' }`, so the page wears the section row with no venue rail |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Redirect loop: `venue-not-found` is itself a legal `:venueId` *segment*, so if the literal route were ordered below `operator/:venueId` the guard would redirect its own destination forever | med | high | Literal route placed above `operator/:venueId` (Angular's documented first-match-wins ordering, already the file's convention for `operator/register` and `operator`); AC-4 pins it by driving the real table | agent | closed — pinned by AC-4 |
| R-2 | The narrowed `parentVenueId` throws when a spec's stub parent route omits `venueId`, surfacing as an effect error rather than a readable assertion | med | med | The thrown message names the guard and the route contract; the only specs that pushed a malformed param are the ones this slice retires; all remaining tab specs supply `venueId` | agent | closed — every remaining tab spec supplies `venueId`; the throw names the guard |
| R-3 | Narrowing too far — `app.ts` / `console-shell.ts` read `venueId` as legitimately `undefined` on plain and admin routes | low | high | Only `venueIdParam` + `parentVenueId` narrow; `idParam` and `routeIdParam` keep their nullable contract. `console-shell.spec.ts` and `app.spec.ts` stay untouched and green | agent | closed — `idParam`/`routeIdParam` kept their nullable contract; `console-shell.spec.ts` and `app.spec.ts` green |
| R-4 | Guard order changes what a signed-out visitor sees at a dead link | low | low | Deliberate: `venueIdGuard` runs before `operatorSessionGuard`, so the visitor is sent to sign-in *for the page*, not back to a URL that can never work. Pinned by AC-5 | agent | closed — intended behaviour, pinned by AC-5 |
| R-5 | In-flight collision with another branch | low | low | Only open PR is #1093 (dependabot, `frontend/package.json` + lockfile) — no overlap. No Flyway migration in this slice, so no `V<n>` to claim | agent | closed — no overlap with #1093 |
| R-6 | `canActivate` + `UrlTree` might not be the best mechanism (`canMatch` runs earlier, before the lazy chunk resolves) | low | low | Angular docs consulted: `CanMatch` false *skips* the route and needs a fallback config, which would require a `**` or a segment-consuming matcher (Non-goals). `canActivate` + `UrlTree` is the in-tree precedent (`core/operator-session.guard.ts`, "per the Angular router guide"). Recorded as the chosen trade-off, not an oversight | agent | closed — the trade-off is written up in ADR-0023 § *Considered options* |

## Open questions / Assumptions

*(empty)*

### Resolved

- **Assumption:** deleting the six tab arms does not lose the venue-switch reset. →
  **Resolved in phase 1, partly wrong and corrected.** `resetForVenue` itself was covered by
  existing `venueId: '2'` specs, but four announcer/notice invariants and two layout-draft
  assertions had *no* valid-switch twin. Those six specs were converted rather than deleted;
  only genuine duplicates were retired. The Behavior-parity ledger's row records the outcome.

- **Open question:** #1127 offered only "keep + align copy" or "retire repo-wide". →
  **Resolved at the plan gate by the maintainer: neither — fix it at the route**, and fold
  #1128 into the same slice. Both of the ticket's options left the invalid state a component
  concern; the route gate removes the state instead.
- **Open question:** redirect to `/operator` (the venue list) or to a dedicated page? →
  **Resolved: a dedicated page.** The shell's card is the one *reachable* invalid-venue
  surface today; silently bouncing to the venue list would drop a tested behaviour with no
  replacement. A page keeps it, and gives it a URL an e2e can drive.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes client-side route matching only; it
adds, removes and reaches no write path to `set_availability`, and no booking, pool or
sales-close arithmetic is in scope.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is touched.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `core/venue-id.guard.ts` | new | `CanActivateFn` | none — pure function of the route snapshot | none |
| FE-2 | `operator/venue-not-found.ts` | new | standalone component, inline template | none — static copy + two `routerLink`s | none |
| FE-3 | `operator/operator-console.ts` + `.html` | existing | standalone component | `venueId` narrows `Signal<number｜undefined>` → `Signal<number>`; the `@if` arm and both `!` assertions go | none |
| FE-4 | `operator/{venue-tab,pricing-tab,layout-editor}.ts` + `.html` | existing | standalone components | same narrowing; the `@if (venueId() === undefined)` arm and the `=== undefined` early-returns go | untouched |
| FE-5 | `operator/{requests-tab,payouts-tab,daily-view-tab}.ts` | existing | standalone components | same narrowing; `markInvalid()` deleted, the switch effect collapses to `resetForVenue()` | untouched |
| FE-6 | `shared/parent-venue-id.ts` | existing | helper module | `venueIdParam`/`parentVenueId` return `Signal<number>`; `idParam`/`routeIdParam` unchanged | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. No deviation. The new page needs no image, so `NgOptimizedImage` is not engaged.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or wire shape is touched.

## Execution status

**Stage pointer:** `PR — ready for review; the Review and Sonar gates are next`

**Next action:** Mark PR #1129 ready for review, then run the Review gate per
`riviera-sdlc` `references/pr-gates.md` §1.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The route gate (guard + page + wiring) | ✅ | see phase-0 commit |
| 1 — Narrow the contract, delete the seven dead arms | ✅ | see phase-1 commit |
| 2 — e2e + a11y/contrast for the new page | ✅ | see phase-2/3 commit |
| 3 — Close-out (ADR-0023, docs freshness, stale plan-doc retirement) | ✅ | see phase-2/3 commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (Repo hygiene, `check-inline-comments`) | A two-line inline comment in `frontend/e2e/venue-id-route-gate.e2e.ts` — RV-STYLE-1 allows one line. Missed locally because the check's exit code was read off a shell pipeline (`\| head`) instead of the guard itself; read the guard's own status from here on | fixed |
| 2026-09-16 | phase 1 | Every spec whose only trigger for a behaviour was an invalid venue param (mechanism: a spec pushing a non-venue segment into the stub parent route) | `grep -n "it(" frontend/src/app/operator/*.spec.ts \| grep -iE "invalid\|no venue id"` | 12 specs across `venue-tab`, `pricing-tab`, `layout-editor`, `requests-tab`, `operator-console` and the two `*.a11y.spec.ts` | Judged one at a time against whether a valid→valid twin already pinned the same invariant: **converted 6** (the four announcer/notice specs, the layout draft-clearing, the row-name write-error A→B→A), **retired 6** (the three invalid-card renders, the two invalid-card axe runs, and three exact duplicates of an existing `venueId: '2'` spec). No invariant lost its only cover |
| 2026-09-16 | phase 1 | Every drift sweep naming a file by path because of what it paints (mechanism: a spec asserting a token family at a literal source path) | `npm test` — the sweep failed on its own positive half, which is what named it | `shared/fixed-ink-tokens.contrast.spec.ts`'s `SITES` | Re-pointed at `operator/venue-not-found.ts`: the `--riv-console-card-border` family moved with the card. The spec's own comment says the positive half exists so a mistyped path cannot pass vacuously — it worked |

---

## File structure

- `docs/adr/ADR-0023-route-owns-route-param-validity.md` — the decision: the route table, not a
  component template, owns a route param's validity
- `docs/plans/layout-editor-invalid-venue-reset.md` — **deleted**: #1126 merged, its plan doc
  was never retired at close-out (`riviera-docs-freshness` § Plan-doc retirement)
- `.claude/skills/riviera-frontend/SKILL.md` — routing section gains the route-owns-param-validity rule
- `frontend/src/app/app.routes.ts` — the guard on `operator/:venueId`, the literal
  `operator/venue-not-found` route above it
- `frontend/src/app/app.routes.spec.ts` — the lazy-target count (33 → 34)
- `frontend/src/app/app.spec.ts` — the console-section table gains the new plain route (4 → 5 surfaces)
- `frontend/src/app/core/venue-id.guard.ts` — the guard
- `frontend/src/app/core/venue-id.guard.spec.ts` — AC-1…AC-5
- `frontend/src/app/operator/venue-not-found.ts` — the page
- `frontend/src/app/operator/venue-not-found.spec.ts` — AC-6
- `frontend/src/app/operator/venue-not-found.a11y.spec.ts` — axe
- `frontend/src/app/operator/venue-not-found.contrast.spec.ts` — composited contrast
- `frontend/src/app/operator/operator-console.ts|.html|.spec.ts` — the shell's invalid arm retires
- `frontend/src/app/operator/operator-console.a11y.spec.ts|.contrast.spec.ts` — only if they reach the retired arm
- `frontend/src/app/operator/venue-tab.ts|.html|.spec.ts|.a11y.spec.ts` — `venue-invalid` retires
- `frontend/src/app/operator/pricing-tab.ts|.html|.spec.ts|.a11y.spec.ts` — `pricing-invalid` retires
- `frontend/src/app/operator/layout-editor.ts|.html|.spec.ts|.a11y.spec.ts` — `layout-invalid` retires
- `frontend/src/app/operator/requests-tab.ts|.spec.ts` — `markInvalid()` retires (closes #1128)
- `frontend/src/app/operator/payouts-tab.ts|.spec.ts` — `markInvalid()` retires
- `frontend/src/app/operator/daily-view-tab.ts|.spec.ts` — `markInvalid()` retires
- `frontend/src/app/shared/parent-venue-id.ts|.spec.ts` — the console helpers narrow to `Signal<number>`
- `frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts` — its positive-half sweep names the file that paints `--riv-console-card-border`, which the card took with it
- `frontend/e2e/venue-id-route-gate.e2e.ts` — AC-8, the CI-safe mocked suite
- `frontend/src/app/app.ts` — docs-freshness: "the two plain operator pages" is three
- `frontend/src/app/console-shell.ts` — docs-freshness: the `plain` enumeration gains the new page
- `frontend/src/app/operator/operator-venue-switch.ts` — docs-freshness: the same enumeration
- `frontend/src/app/core/operator-session.guard.ts` — docs-freshness: the surfaces it gates
- `frontend/src/app/operator/venue-not-found.contrast.spec.ts` — the card's contrast proofs, moved
  wholesale from `operator-console.contrast.spec.ts` (every assertion in it was the card's)

---

## Phase 0 — The route gate

**Files:** Create `frontend/src/app/core/venue-id.guard.ts`, `…/venue-id.guard.spec.ts`,
`frontend/src/app/operator/venue-not-found.ts`, `…/venue-not-found.spec.ts` ·
Modify `frontend/src/app/app.routes.ts`

Phase 0 leaves every existing invalid arm in place — they simply become provably dead. The
deletion is phase 1, so a red phase 0 never leaves the tree without a fallback.

- [x] **Step 1: Write the failing test** — `venue-id.guard.spec.ts`, driving the REAL
      `routes` table through `RouterTestingHarness` (AC-1…AC-5), and `venue-not-found.spec.ts`
      (AC-6).
- [x] **Step 2: Run it, verify it fails** — `npx vitest run src/app/core/venue-id.guard.spec.ts`
      → FAIL (module not found).
- [x] **Step 3: Minimal implementation** — the guard, the page, the two route entries.
- [x] **Step 4: Run it, verify it passes** — the same command → PASS; then broaden to
      `npx vitest run src/app/core src/app/operator/venue-not-found.spec.ts`.
- [x] **Step 5: Generalization-audit pass** — population: *every route in `app.routes.ts`
      carrying an id param a component then re-validates*. Enumerate, judge each, append below.
- [ ] **Step 6: Commit** — `git commit -m "Gate /operator/:venueId on a valid id at the route (#1127)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Narrow the contract, delete the seven dead arms

**Files:** Modify `frontend/src/app/shared/parent-venue-id.ts|.spec.ts`,
`frontend/src/app/operator/operator-console.ts|.html|.spec.ts`,
`…/{venue-tab,pricing-tab,layout-editor}.ts|.html|.spec.ts|.a11y.spec.ts`,
`…/{requests-tab,payouts-tab,daily-view-tab}.ts|.spec.ts`

- [x] **Step 1: Write the failing test** — `parent-venue-id.spec.ts` pins the narrowed
      contract (a malformed param throws, naming the guard).
- [x] **Step 2: Run it, verify it fails** — `npx vitest run src/app/shared/parent-venue-id.spec.ts`.
- [x] **Step 3: Minimal implementation** — narrow the two console helpers; delete the shell
      arm, the three tab cards, the three `markInvalid()`s and the `=== undefined` guards;
      retire the specs the ledger marks dropped.
- [x] **Step 4: Run it, verify it passes** — `npx vitest run src/app/shared src/app/operator`.
- [x] **Step 5: Generalization-audit pass** — population: *every signal helper whose
      `undefined` branch exists only for a state a route guard now prevents*.
- [ ] **Step 6: Commit** — `git commit -m "Let the console assume a valid venue id (#1127, #1128)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — e2e and a11y for the new page

**Files:** Create `frontend/e2e/venue-id-route-gate.e2e.ts`,
`frontend/src/app/operator/venue-not-found.a11y.spec.ts|.contrast.spec.ts`

- [x] **Step 1: Write the failing test** — the mocked e2e (AC-8) plus the axe and contrast specs.
- [x] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- venue-id-route-gate`.
- [x] **Step 3: Minimal implementation** — whatever the specs surface (likely nothing but copy/aria).
- [x] **Step 4: Run it, verify it passes** — the same command, plus `npm run test:a11y`.
- [x] **Step 5: Generalization-audit pass** — population: *console surfaces reachable only by
      a malformed URL* (this slice's whole subject).
- [ ] **Step 6: Commit** — `git commit -m "Cover the venue-not-found page end to end (#1127)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Close-out

**Files:** Create `docs/adr/ADR-0023-route-owns-venue-id-validity.md` · Modify
`.claude/skills/riviera-frontend/SKILL.md` · Delete `docs/plans/layout-editor-invalid-venue-reset.md`

- [x] **Step 1:** Write ADR-0023 — hard to reverse (three merged slices built the retired
      pattern), surprising (it deletes defence-in-depth), a real trade-off (per-component
      guarantee traded for one owner).
- [x] **Step 2:** Add the routing rule to `riviera-frontend`.
- [x] **Step 3:** Run `riviera-docs-freshness` over `origin/main..HEAD`.
- [x] **Step 4:** Delete #1126's stale plan doc (its close-out tick was missed).
- [x] **Step 5:** `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 6: Commit** — the close-out lands in the PR's last code-touching commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-16 | phase 0 | Every consumer of the route-param→id rule (mechanism: an id read out of a `ParamMap` through `shared/parent-venue-id.ts`) | `grep -rn "parentVenueId\|venueIdParam\|routeIdParam\|idParam" --include=*.ts frontend/src/app \| grep -v '\.spec\.ts'` | `operator/:venueId` (shell + 6 tabs), `venues/:id` (`venue/venue-map.ts`), `app.ts`'s root→leaf chrome walk, `console-shell.ts` | **Fixed the rule itself**, which reaches every member: `idParam` demanded only `Number.isInteger(…) && > 0`, so `7e2` read 700, `0x10` read 16 and `+7`/`7.0`/`007`/`' 7 '` all read 7 — each aliasing a venue under a URL that disagreed with it. It now demands a canonical decimal integer inside the safe-integer range. Route-gated `operator/:venueId` only: `venues/:id` has one owner and no duplicated arm to retire, and `app.ts`/`console-shell` read `undefined` legitimately on every route that names no venue |
| 2026-09-16 | phase 3 | Every stated fact that enumerates or counts the routes carrying `data.console` (mechanism: prose listing the `plain` operator pages, which this slice made three) | `grep -rniE "four (operator\|console)\|three plain\|two plain" …` then `grep -rn "password page" …` over the substrate set + `frontend/src/app` | `app.ts:234`, `console-shell.ts:61`, `operator-venue-switch.ts:34`, `core/operator-session.guard.ts:8`, `.claude/skills/riviera-frontend/SKILL.md:93-101` | All five patched. Three sit in files the diff never touched, which is the sweep's whole point — reviewing changed files could not have found them |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1…AC-5:** `npx vitest run src/app/core/venue-id.guard.spec.ts` → all pass.
- [x] **AC-6:** `npx vitest run src/app/operator/venue-not-found.spec.ts` → pass.
- [x] **AC-7:** `npx vitest run src/app/operator` → the `venueId: '2'` switch specs still pass.
- [x] **AC-8:** `npm run test:e2e:a11y -- venue-id-route-gate` → pass.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change, so no Flyway migration (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR, in its last code-touching commit.**
- [ ] **The review gate ran in full** per `riviera-sdlc` `references/pr-gates.md` §1.
