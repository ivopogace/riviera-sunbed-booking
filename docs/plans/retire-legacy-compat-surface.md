# Retire the shell's legacy compat surface — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Remove the pre-redesign compat mechanism from the app shell end to end, so no
cold load paints the opaque `riv-legacy-surface` panel over the themed background.

**Architecture:** The mechanism is one flag threaded through four places — a `RouteChrome`
field, the shell's pre-navigation default, the root→leaf walk's leaf read, and a `<main>`
class binding. The single significant decision is to retire the *flag*, not just its
default: with no route carrying `data.legacySurface` and every production route restyled,
a dormant switch whose only live effect is a cold-load flash is dead weight, and keeping it
"in case a route regresses" would keep the flash. `RouteChrome` narrows to
`{ chromeless, operatorChrome }`; `<main>` becomes statically `class="flex-1"`.

**Persistence:** N/A — frontend-only, no tables, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue
[#992](https://github.com/ivopogace/riviera-sunbed-booking/issues/992) — the behavior
change #981 (PR #990) deliberately deferred.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
PR #990's plan doc is still in `docs/plans/` and is due for retirement in THIS PR, and that
the only in-flight PRs are Dependabot bumps with no overlap) · `riviera-plan-doc` (this
template — forced the behavior-parity ledger, which is what turned "delete a flag" into an
enumerated four-behavior check) · `tdd` (the pre-navigation pin is written red first: it
fails today because `<main>` really does carry the compat classes before the first
`NavigationEnd`) · `riviera-review-overlay` (review gate — run at ready-for-review) ·
`riviera-docs-freshness` (**ran** over `origin/main..HEAD` at close-out — findings recorded
in the close-out) · `riviera-frontend` (shell/theming ownership: `<main>`'s chrome is the
shell's call, and the two-suite e2e split put the new browser-level pin in the CI-run
mocked suite) · `riviera-tailwind` (the removed binding carried the last `#f8fafc` /
`#0f172a` palette literals in `app.html` — deleting them is a token-purity win, and rule 2
made me check whether `riv-legacy-surface` is a test-queried marker worth keeping: it is
not, the mechanism it marks is gone) · `angular-developer` + angular-cli MCP
`get_best_practices` (v22 posture: signals/`computed`, `class` bindings over `ngClass` —
confirmed the static `class="flex-1"` is the right end state, not a `[class]` with an empty
branch) · `playwright-cli` (authored the real-browser pin; Open question OQ-1 records the
experiment that chose its handle) · `riviera-local-debug` (scoped Vitest + the
`PW_CHROMIUM_EXECUTABLE` recipe for the mocked e2e in a cloud session).

**Branch:** `claude/sdlc-992-mzs5h2` — the cloud session's designated remote branch stands
in for `feature/retire-legacy-compat-surface` (`riviera-sdlc` § Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the shell rendered before any navigation has completed (the first
  route's chunk still in flight), when `<main>` renders, then its class list is exactly
  `flex-1` — no `riv-legacy-surface`, no opaque background or slate ink — and the tourist
  header is shown. *Seam:* the rendered `app-root` DOM (`main` class list + `.riv-header`),
  the same seam the existing chrome cases observe through · *Pinned by:*
  `app.spec.ts` › `renders <main> bare under the tourist chrome before the first navigation completes (#992)`
- [ ] **AC-2:** Given a real browser cold-loading `/` with the route chunk withheld, when
  the shell paints, then `<main>` has a transparent background — the themed gradient shows
  through, no opaque panel. *Seam:* the served page in Chromium (`main`'s computed
  `background-color`) · *Pinned by:* `theme-shell.e2e.ts` ›
  `no compat panel paints over the themed background before the route chunk lands (#992)`
- [ ] **AC-3:** Given a navigation to a glass, operator-console or operator-chrome route,
  when the shell computes its chrome, then header/footer switching and the porcelain
  subtree pin are unchanged and `<main>` stays bare in all three. *Seam:* the rendered
  `app-root` DOM · *Pinned by:* the existing `app.spec.ts` cases
  `suppresses the tourist header/footer chrome on operator-console routes (#170, AC-7)` and
  `renders the shared operator chrome instead of the tourist header on operator-chrome routes`,
  minus their retired `riv-legacy-surface` assertions.
- [ ] **AC-4:** Given the route table, when the chrome-flag specs run, then every
  operator/admin route's `operatorConsole` / `operatorChrome` placement is still pinned and
  no assertion mentions `legacySurface`. *Seam:* the exported `routes` array (`app.routes.ts`)
  · *Pinned by:* `app.spec.ts` › `app.routes chrome flags (issue #134)` — the renamed
  describe, keeping `flags every non-console operator/admin surface with the shared operator chrome`,
  `admin's tab children inherit the shell's operator chrome rather than carrying their own`,
  the retired-daily redirect case and the console-route case.
- [ ] **AC-5:** Given the whole tree, when
  `grep -rn "legacySurface\|riv-legacy-surface\|RESTYLED_PATHS" frontend/src frontend/e2e docs .claude`
  runs, then it returns nothing outside the frozen historical fixture in
  `scripts/check-plan-file-structure.test.mjs` (see Non-goals), and `RouteChrome` is
  `{ chromeless, operatorChrome }`. *Seam:* the repository tree · *Pinned by:* the grep in
  the AC-verification section (a mechanism's absence has no runtime seam).
- [ ] **AC-6:** Given the frontend gates, when `npm run lint`, `npm run format:check`,
  `npm test` and the mocked e2e `theme-shell`, `current-page-marker`, `find-a-booking`
  suites run, then all pass, and the hygiene guards
  (`node scripts/check-plan-file-structure.mjs --diff origin/main` included) pass.
  *Seam:* the CI command set · *Pinned by:* the PR's CI run.

## Non-goals

- Re-styling any page. Every production route is already Liquid Glass; this slice only
  removes the switch that could wrap one in the old panel.
- Adding a guard test that forbids a future route from re-adding a `legacySurface` key.
  Angular's `Route.data` is `{[key: string]: any}` and always admits any key; the real
  guarantee is that the shell no longer reads it. A spec asserting a dead key stays absent
  is the enumeration test this slice retires, reintroduced under a new name.
- Touching `scripts/check-plan-file-structure.test.mjs`. Its line 340 quotes a *historical
  plan doc's* file list as a frozen fixture for the guard's own test ("without which the
  legacy-surface assertion fails (F-3)"); it is test data describing PR #526, not a live
  reference to the mechanism. Rewriting it would edit a fixture to match unrelated code.
- The `docs/design/` history. Nothing there names the compat panel today (checked), so
  there is no "as-built diverges" pointer to add.

## Behavior-parity ledger

> The slice retires an existing surface, so every behavior of the old mechanism is
> enumerated and judged. "It's a dead flag" is exactly the claim this table has to verify.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| A route with `data.legacySurface: true` gets `<main>` wrapped in `riv-legacy-surface bg-[#f8fafc] text-[#0f172a]` | **dropped** | No production route has carried the flag since #177; every route is Liquid Glass. The wrap has no live caller — only the pre-navigation default reached it. |
| Before the first `NavigationEnd`, the shell defaults to `legacySurface: true` → `<main>` paints the opaque panel during the initial chunk load | **changed** (the point of the slice) | `<main>` is bare from first paint; the themed background shows through the whole cold load. Pinned by AC-1 (jsdom, the state) and AC-2 (Chromium, the paint). |
| The flag is read from the **leaf** route only, never OR-ed up the chain (unlike `operatorConsole` / `operatorChrome`) | **dropped** | Nothing reads it. The walk keeps OR-ing the two chrome flags exactly as before — the leaf-only read was the one asymmetry in it, and it goes with the flag. |
| `chromeless` (operator console) and `operatorChrome` flags OR-ed root→leaf, chrome switched accordingly, porcelain subtree pin on operator chrome | **preserved** | Untouched code path; AC-3 pins it through the existing specs. |
| `PRE_NAVIGATION_CHROME` shows the **tourist** chrome (not chromeless, not operator) until the first navigation lands | **preserved** | The constant keeps both remaining fields `false`; AC-1 asserts the tourist header is up in that same window. |
| `<main>` is the focus-landing target (`#mainEl`, `tabindex="-1"`) for the overlay close rule and sign-out | **preserved** | Only the `[class]` binding is removed; `#mainEl` and `tabindex="-1"` stay. The existing focus specs (#351, #892, operator sign-out) are the regression net. |
| `app.contrast.spec.ts` proves `#0f172a` on `#f8fafc` clears AA for "the pre-redesign pages" | **dropped** | The literals existed only in the removed binding — grep confirms no other spec or component uses that pair, so the case now proves a contrast nobody renders. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Removing the `[class]` binding also removes `<main>`'s focus contract by accident, silently breaking the overlay-close and sign-out focus rules | low | high | `#mainEl` + `tabindex="-1"` are asserted by the existing #351/#892/operator-sign-out specs; run `app.spec.ts` whole, not just the new case | agent | closed — phase 0: all 41 `app.spec.ts` cases green, focus specs included |
| R-2 | Retiring the enumeration specs removes the only check that some operator/admin route placement is right | med | med | The two kept placement cases (`operatorChrome`, admin tab children) are the ones that carry that value; only the `legacySurface` assertions inside them are dropped. AC-4 names them explicitly | agent | open |
| R-3 | The AC-2 e2e cannot deterministically hold the browser in the pre-navigation window, and lands flaky (RV-FE-E2E fails a timing-fragile spec) | med | med | OQ-1: choose the handle by experiment against the real dev server before writing the spec; if no deterministic handle exists, pin the durable half (settled cold load, `<main>` transparent) and say so here | agent | open |
| R-4 | The plan-file-structure guard fails on the deleted `docs/plans/shell-route-chrome-signals.md` | low | low | The deletion is listed in File structure below; run the guard before pushing | agent | open |

## Open questions / Assumptions

- **OQ-1:** What is the deterministic Playwright handle for the pre-navigation window under
  `ng serve` — is the home route's lazy chunk identifiable by request URL without also
  blocking shell/vendor chunks? — *Owner:* agent · *Resolves by:* phase 1, by observing a
  real cold load's requests (`page.on('request')`) before authoring AC-2's spec.
- **Assumption:** No open PR touches `frontend/src/app/app.*` — checked at intake, the five
  open PRs are Dependabot version bumps. A merge-from-main before ready-for-review
  re-verifies. — *Owner:* agent · *Resolves by:* the pre-review merge.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice touches only the Angular shell's chrome
computation and template; no booking, set, date or map code is read or written.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` changes.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/app.ts` | existing | standalone shell component | `computed()` off router signals — `RouteChrome` loses a field, `legacySurface` computed deleted | none |
| FE-2 | `frontend/src/app/app.html` | existing | template | `<main>` drops its `[class]` binding for a static `class="flex-1"` | none |
| FE-3 | `frontend/src/app/app.routes.ts` | existing | route table | comment/doc only — no route data changes | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. The change is subtractive and introduces no new API; the end state (`class="flex-1"`,
no `ngClass`) matches the v22 posture from the angular-cli MCP best-practices guide.

## FE↔BE contract

N/A — no contract change; no HTTP call is added, removed or reshaped.

## Execution status

**Stage pointer:** `implement (phase 1)`

**Next action:** resolve OQ-1 by observing a real cold load's requests under `npm start`, then
write AC-2's e2e in `theme-shell.e2e.ts`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Retire the mechanism (`app.ts`, `app.html`) behind a red pre-navigation pin | ✅ | phase-0 commit |
| 1 — Retire the flag's specs + docs; add the real-browser pin | ⏳ | |
| 2 — Close-out sweep (retire PR #990's plan doc, docs-freshness) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/retire-legacy-compat-surface.md` — this plan
- `docs/plans/shell-route-chrome-signals.md` — **deleted**: PR #990 merged, so its plan doc
  retires in this PR (`riviera-docs-freshness` § Plan-doc retirement). Its one deferred
  residual is issue #992 itself, so nothing needs migrating first.
- `frontend/src/app/app.ts` — `RouteChrome` narrows to `{ chromeless, operatorChrome }`;
  `PRE_NAVIGATION_CHROME`, the walk's leaf read, the `legacySurface` computed and the two
  TSDoc paragraphs describing the compat panel go
- `frontend/src/app/app.html` — `<main>` loses the `[class]` branch, keeps `#mainEl`,
  `tabindex="-1"`, `class="flex-1"`
- `frontend/src/app/app.routes.ts` — comment-only: the `legacySurface` doc paragraph and the
  six per-route "no compat surface" comments
- `frontend/src/app/app.spec.ts` — the new pre-navigation pin; the `legacy` test route, the
  AC-6 wrap case, the two flag-enumeration cases, `RESTYLED_PATHS` and the surviving cases'
  `legacySurface` assertions go; the second describe is renamed to `app.routes chrome flags`
- `frontend/src/app/app.contrast.spec.ts` — the compat-panel ink case goes
- `frontend/e2e/theme-shell.e2e.ts` — AC-2's real-browser pin, beside the existing
  pre-paint-seeding block

---

## Phase 0 — Retire the mechanism behind a red pre-navigation pin

**Files:** Modify `frontend/src/app/app.ts` · `frontend/src/app/app.html` · Test
`frontend/src/app/app.spec.ts` · `frontend/src/app/app.contrast.spec.ts`

- [ ] **Step 1: Write the failing test** — in `app.spec.ts`, beside the existing chrome cases:

```ts
it('renders <main> bare under the tourist chrome before the first navigation completes (#992)', () => {
  // No navigation has landed: the first route's chunk is still in flight (`lazyChunk` is
  // unresolved), which is the window the retired compat default used to paint through.
  const { el } = shell();

  expect(el.querySelector('main')?.className).toBe('flex-1');
  expect(el.querySelector('.riv-header')).not.toBeNull();
});
```

- [ ] **Step 2: Run it, verify it fails** —
  `npm test -- app.spec.ts` → FAIL: `expected 'flex-1 riv-legacy-surface bg-[#f8fafc] text-[#0f172a]' to be 'flex-1'`

- [ ] **Step 3: Minimal implementation** — in `app.ts`: drop the `legacySurface` field from
  `RouteChrome` and `PRE_NAVIGATION_CHROME`, drop the leaf `route.data['legacySurface']`
  read from the walk's return, delete the `legacySurface` computed, and rewrite the `App`
  and `routeChrome` TSDoc so neither describes a compat panel. In `app.html`, `<main>`
  becomes:

```html
  <main #mainEl tabindex="-1" class="flex-1">
    <router-outlet />
  </main>
```

  Then delete what now asserts the retired behavior: the `legacy` test route from
  `surfaceRoutes()`, the case
  `wraps legacy-flagged routes in the opaque compat surface, glass routes not (AC-6)`, the
  `riv-legacy-surface` assertion inside the #170 chromeless case, and
  `app.contrast.spec.ts` › `legacy compat surface keeps the slate ink the pre-redesign pages assume`.

- [ ] **Step 4: Run it, verify it passes** — `npm test -- app.spec.ts app.contrast.spec.ts` → PASS

- [ ] **Step 5: Generalization-audit pass** — population: every shell-level route-data flag
  read by `app.ts`'s chrome walk. Enumerate, judge, append to the log below.

- [ ] **Step 6: Commit** — `git commit -m "Retire the shell's legacy compat surface (#992)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Retire the flag's remaining specs and docs; pin the paint in a real browser

**Files:** Modify `frontend/src/app/app.spec.ts` · `frontend/src/app/app.routes.ts` ·
`frontend/e2e/theme-shell.e2e.ts`

- [ ] **Step 1: Resolve OQ-1** — cold-load `/` against `npm start` and log every request
  URL, to see whether the home route's lazy chunk is distinguishable from the shell/vendor
  chunks. Record the verdict under `### Resolved`.

- [ ] **Step 2: Write the failing e2e** (handle chosen in step 1) — in `theme-shell.e2e.ts`,
  asserting `<main>`'s computed `background-color` is transparent while the route chunk is
  withheld, so the themed gradient is what the guest sees.

- [ ] **Step 3: Run it, verify it fails on the pre-change shell** — check out the phase-0
  parent for `app.html` only, run
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- theme-shell`
  → FAIL (opaque `rgb(248, 250, 252)`), then restore. A retirement's e2e must be shown to
  fail against the retired behavior or it proves nothing.

- [ ] **Step 4: Verify it passes on HEAD** — same command → PASS.

- [ ] **Step 5: Retire the rest** — in `app.spec.ts`: delete `RESTYLED_PATHS`, the cases
  `marks every not-yet-restyled tourist route with the compat surface (flipped per slice)`
  and `has no legacy compat-surface routes left (O8 #177 retired the last one)`, the
  `legacySurface` assertions inside the kept placement/redirect/console cases, and rename the
  describe to `app.routes chrome flags (issue #134)`. In `app.routes.ts`: remove the
  `legacySurface` doc paragraph and the six per-route "no compat surface" comments
  (comment-only file).

- [ ] **Step 6: Run the frontend gates** — `npm test`, `npm run lint`, `npm run format:check`,
  and the three named mocked e2e suites.

- [ ] **Step 7: Commit + update execution status** —
  `git commit -m "Retire the compat-surface specs and route comments (#992)"`

---

## Phase 2 — Close-out sweep

**Files:** Delete `docs/plans/shell-route-chrome-signals.md` · Modify
`docs/plans/retire-legacy-compat-surface.md`

- [ ] **Step 1:** `git rm docs/plans/shell-route-chrome-signals.md` — PR #990 is merged, so
  the next close-out of any kind retires it; grep confirmed no citation of the slug outside
  `docs/plans/`, and its deferred residual is this very issue.
- [ ] **Step 2:** Run `riviera-docs-freshness` over `origin/main..HEAD` — the rename/removal
  grep for `legacySurface` / `riv-legacy-surface` / `compat surface` across the substrate set.
- [ ] **Step 3:** Run `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 4:** Finalize this plan's Execution status in the PR's last code-touching commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | phase 0 | Route-data keys the app sets in `app.routes.ts` and reads via `route.data['…']` to drive chrome or layout — the mechanism `legacySurface` belonged to | `grep -rn "\.data\[" frontend/src --include="*.ts"` + `grep -oEn "data: \{[^}]*" frontend/src/app/app.routes.ts` | 4 keys. `operatorConsole` + `operatorChrome` (read by `app.ts`'s walk) and `adminTab` (read by `admin-console.ts`) are live. `tab`, set on all six operator-console tab routes, has **no reader** — `operator-console.ts` derives the active tab from `routeConfig?.path`, and only an `app.routes.ts` doc line still claims `data.tab` identifies the section | `legacySurface` retired here. `tab` is the same defect class (a dormant route-data key) but a different mechanism instance, unrelated to the compat surface: folding it in would widen the slice, so it is left for a follow-up and named in the PR |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- app.spec.ts` → the pre-navigation case passes. Verified at `<sha>`.
- [ ] **AC-2:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- theme-shell` → PASS. Verified at `<sha>`.
- [ ] **AC-3:** `npm test -- app.spec.ts` → the three chrome cases pass. Verified at `<sha>`.
- [ ] **AC-4:** `npm test -- app.spec.ts` → the renamed describe's four cases pass. Verified at `<sha>`.
- [ ] **AC-5:** `grep -rn "legacySurface\|riv-legacy-surface\|RESTYLED_PATHS" frontend/src frontend/e2e docs .claude` → no matches. Verified at `<sha>`.
- [ ] **AC-6:** CI green on the PR's final push. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
