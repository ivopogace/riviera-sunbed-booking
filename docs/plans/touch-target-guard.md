# A static guard for the 44 px touch-target floor — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/check-touch-target.mjs` fails a build when a `<button>`, `<input>`, `<select>`
or `<textarea>` in an Angular template declares neither `appTouchTarget` nor a reasoned
`data-touch-exempt` — proving the floor's *mechanism* is applied on every surface, including the
ones no e2e sweep visits.

**Architecture:** The guard resolves **no stylesheets and keeps no class allowlist**. The issue
sketched one, and that allowlist is the whole of its false-positive risk: a class-based carve-out
cannot see `booking-view.ts`'s `[class]="cls.btnCta"` bindings at all, and it must be maintained
against SCSS forever. Instead this slice **brings the 30 undeclared in-scope controls to a declared
state** (6 files), after which the rule rests on exactly two regex-visible mechanisms and can gate
like `BUSY-1`/`BUSY-2` rather than merely advise. `<a>` is **out of scope entirely** — not
advisory — because `min-height` is a no-op on an inline box, so a directive on a link is a
declaration that can be false; links stay the measured sweep's and RV-FE's job. This mirrors
`check-focus-posture.mjs`'s `READONLY_KINDS`: cover exactly what the predicate can judge, and say
plainly what is out of reach.

**Persistence:** N/A — no backend, no table, no migration (invariant #1 not engaged).

**Source of intent:** GitHub issue **#648**, deferred from #605 and recorded as a Non-goal in
`docs/plans/touch-target-floor.md`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill overturned
the issue's central premise: it assumed the floor now has "a single mechanism", and the tree has
four, with 89 of 222 controls undeclared) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger, which is what surfaced that `venue-map.html`'s set tile is a grid cell and
not an ordinary button) · `tdd` (each guard rule lands red-first against
`scripts/check-touch-target.test.mjs`; the marking sweep is red-first against the guard's own
`--all`) · `riviera-review-overlay` (review gate — <when it ran>) · `riviera-docs-freshness`
(<**ran** over `<range>`, N findings — **or** `N/A — <reason>`>) · `riviera-tailwind` (the floor is
its rule: set it with `[appTouchTarget]`, never hand-tuned padding; its two sanctioned exemption
classes are why this plan adds a **third** deliberately and documents it rather than letting the
marking pass invent reasons) · `riviera-frontend` (checked: the slice creates no file under
`frontend/src`, so there is no placement decision — only attributes added to six shipped templates)
· `playwright-cli` (phase 2 — the sign-out-notice sweep case) · `angular-developer` + angular-cli
MCP (phase 2 — confirming `inline-flex` pairing is a template concern, not a directive one)

**Branch:** `feature/touch-target-guard` — created off `main` at `b8e54bd5`, before phase 0.

---

## Acceptance criteria (testable)

> Written at this slice's application boundary: the detector function (`findViolations`) and the
> CLI's exit code. The Angular templates are the *input* to that boundary, not the boundary itself.

- [ ] **AC-1:** Given a template with `<button type="button">` carrying no `appTouchTarget` and no
      exemption, when the detector judges it, then one `TT-1` violation is reported at that tag's
      line. *Pinned by:* `check-touch-target.test.mjs` › `reports an undeclared button`
- [ ] **AC-2:** Given the same button with `appTouchTarget` on its own start tag, when the detector
      judges it, then nothing is reported. *Pinned by:* `check-touch-target.test.mjs` ›
      `accepts the directive on the tag`
- [ ] **AC-3:** Given the same button with `data-touch-exempt="control inside a sentence"` on its
      own start tag, when the detector judges it, then nothing is reported. *Pinned by:*
      `check-touch-target.test.mjs` › `accepts an exemption on the tag`
- [ ] **AC-4:** Given a `<button>` nested inside a `<p data-touch-exempt="…">` — `auth-page.ts`'s
      shipped mode toggle — when the detector judges it, then nothing is reported; and given the
      same button after that `</p>` closes, then `TT-1` **is** reported. *Pinned by:*
      `check-touch-target.test.mjs` › `an ancestor exemption covers its subtree and no further`
- [ ] **AC-5:** Given an undeclared `<a>`, when the detector judges it, then nothing is reported —
      whatever its classes or bindings. *Pinned by:* `check-touch-target.test.mjs` ›
      `never judges an anchor`
- [ ] **AC-6:** Given `data-touch-exempt=""` (or whitespace-only) on any in-scope control, when the
      detector judges it, then one `TT-2` violation is reported — an unexplained exemption is the
      drift the marker exists to stop. *Pinned by:* `check-touch-target.test.mjs` ›
      `reports an exemption with no reason`
- [ ] **AC-7:** Given a file whose diff adds one line, and an undeclared control on a line the diff
      did **not** add, when the guard runs `--diff`, then nothing is reported. *Pinned by:*
      `check-touch-target.test.mjs` › `judges only lines the diff added`
- [ ] **AC-8:** Given a file git has never seen, when the guard runs `--files` on it, then it is
      judged **whole** (no diff against `HEAD` exists and every line in it is the author's — the
      #619 rule). *Pinned by:* `guard-cli.test.mjs` › `check-touch-target judges an untracked file whole`
- [ ] **AC-9:** Given a diff introducing one `TT-1` and given another introducing one `TT-2`, when
      the CLI runs, then it exits **non-zero** in both cases; given a clean diff it exits 0.
      *Pinned by:* `guard-cli.test.mjs` › `check-touch-target gates on both rules`
- [ ] **AC-10:** Given the shipped tree at this branch's HEAD, when `node
      scripts/check-touch-target.mjs --all` runs, then it reports **zero** violations and exits 0.
      This is the precondition for gating, and the same bar `BUSY-1`/`BUSY-2` had to clear.
      *Pinned by:* the phase 2 command, recorded in Execution status.
- [ ] **AC-11:** Given the sign-out-failure notice rendered at a 390 px viewport, when the sweep
      measures its controls, then `Try again` and `Dismiss` each measure ≥ 44 × 44. *Pinned by:*
      `touch-targets-tourist.e2e.ts` › `sign-out failure notice`

## Non-goals

- **`<a>` elements, in any form** — not gated, not advised, not counted. 59 of the 89 undeclared
  controls are links, and the directive is a silent no-op on an inline one, so marking them would
  manufacture false declarations. The guard's header says so out loud.
- **Replacing the e2e sweep.** It is the only thing that measures a rendered box; the guard only
  ever proves a declaration exists. #605's findings that mattered came from the sweep.
- **A class allowlist / any stylesheet resolution.** See Architecture. The SCSS floors that remain
  (`.oc-tab`, `.link`, `.back-link`, `.btn-cta`, `.cancel-link`, `.riv-brand`, `.auth-alt a`,
  `.oc-create-venue`) are all on `<a>` elements and therefore out of scope by construction.
- **No new exemption vocabulary beyond the one this plan adds and documents.** `riviera-tailwind`
  rule 4 sanctions two classes; this slice adds a third (see Open questions) and updates the skill
  in the same PR. The marking pass may not invent a fourth.
- **No restyling beyond what the floor forces.** Colours, radii, fonts and spacing rhythm stay; only
  `min-height`/`min-width` and, where an element is inline, the `inline-flex` pairing that makes
  them apply.
- **No backend change**, no endpoint, no module, no migration.

## Behavior-parity ledger

> The slice is mostly tooling, but the marking pass **changes the rendered geometry of shipped
> surfaces**, and "just add an attribute" is exactly the claim that hides a broken layout. One row
> per control whose box can move.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `app.html` sign-out notice: `Try again` / `Dismiss` are 14 px underlined text buttons, flex siblings of the message `<span>`, no padding | **changed** | both grow to the 44 px floor. They are flex children of a `flex-wrap` row, not words inside a sentence, so 2.5.5's inline exception does not apply — this is a real failure the sweep never saw, because the notice renders only after a sign-out request fails |
| `app.html` header/menu buttons (`riv-nav-btn`, `riv-chip-btn`, `riv-menu-btn`, `riv-account-btn`, `riv-mobile-btn`, `riv-mobile-swatch`) already floored by `app.scss` (`.riv-mobile-swatch` via `width`/`height: 44px`, others via padding measured in #605 phase 5) | preserved | they gain `appTouchTarget` as a **declaration** of a floor they already meet; `min-height: 44px` over a `height: 44px` box is a no-op. The visual 30 px swatch dot is on `::before` and untouched |
| `auth-page.ts` three `appFieldGlass` inputs + submit button, floored by their own `px-4 py-3.5` padding | preserved | declaration only; the padding already exceeds the floor (measured by the auth surface sweep) |
| `auth-page.ts` mode-toggle `<button>` inside `<p data-touch-exempt="…">` | preserved | already exempt via its ancestor — this slice only makes the guard able to *see* that |
| `booking-view.ts` 7 buttons bound via `[class]="cls.btnCta"` etc. | preserved | declaration only; the shared class constants already carry ≥ 44 px padding (measured by the booking-view sweep) |
| `home.html` two filter `<select>`s + date `<input>`, floored by `home.scss`'s `.field select, .field input { min-height: 44px }` | preserved | declaration only, redundant with the SCSS rule and deliberately so — the directive is the go-forward mechanism (`riviera-tailwind` rule 4) and the SCSS stays until that file migrates |
| `venue-tab.html` photo `<input type="file" class="hidden">` — `display: none`, zero box, its visible proxy is the labelled button beside it | preserved | marked `data-touch-exempt` under the **new third class** (not rendered). Adding the directive instead would declare a floor a `display: none` box cannot have — the R-1 lie #605 warned about |
| `venue-map.html` set tile `<button class="set-button w-full h-full">` — fills its grid cell, sized by the tourist beach map's column track | **changed, and the one to watch** | see R-1. `min-w-11` on a cell whose track is narrower than 44 px will widen the grid or overflow it, which is exactly what #605 solved for the *console* grids with `minmax(44px, 1fr)` + in-frame scroll. The tourist map is a different grid and was not part of that change |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `min-w-11` on `venue-map.html`'s `.set-button` widens or overflows the tourist beach-map grid — the same failure #605 fixed on the two console grids, on a grid it never touched | **high** | high | measure before marking: read the tile's rendered box in the existing venue-map sweep first. If it is already ≥ 44 px the directive is a no-op and the row is preserved; if not, apply #605's shipped answer (`minmax(44px, 1fr)` + in-frame scroll with `tabindex="0"` + a name) rather than inventing a second pattern. `venue-map-pan.e2e.ts` guards the pan behaviour | implementer | open |
| R-2 | Wiring the guard as a hard gate before the tree is clean turns this PR's own CI red | med | med | phase order is the mitigation: the guard lands unwired (phase 0–1), the tree is marked (phase 2), the hook + CI step land last (phase 3). `--all` clean is AC-10 and gates phase 3 | plan | open |
| R-3 | Ancestor resolution needs a real nesting walk — void elements (`<input>`, `<img>`), self-closing `<app-x />`, and Angular control-flow blocks (`@if`/`@for`) that open braces but no element. A bug here is a **false positive on a gating rule**, the one error direction this layer cannot afford (#529's lesson) | med | **high** | an explicit void-element set and a stack that only pushes non-void, non-self-closed tags; a unit case per shape; and AC-10's whole-tree sweep as the empirical backstop — 222 tags across 40 files is a real corpus | implementer | open |
| R-4 | `--all` is clean at this branch's HEAD but a parallel PR merges a new undeclared control, so `main` is dirty the moment this lands | low | med | the guard is **diff-scoped**, so a pre-existing violation never fails a build — only a line a diff adds does. The `--all` sweep is a phase-2 gate, not a standing CI check. Whoever merges second marks their own control | plan | open |
| R-5 | Marking a control already floored by SCSS leaves two mechanisms on one element; a later reader deletes one believing the other covers it | low | low | the ledger rows above name every such control and say the redundancy is deliberate; `riviera-tailwind` rule 4 already names the directive as the go-forward | plan | open |
| R-6 | The `PostToolUse` hook fires on every `Write`/`Edit`; a fourth guard adds latency to the authoring loop | low | low | same shape and budget as the three existing guards (`timeout: 15`, `|| true`); the hygiene job's observed green is well under a minute with no install step | plan | open |
| R-7 | A new `scripts/*.test.mjs` is auto-globbed by the hygiene job's `node --test "scripts/*.test.mjs"` step — so a suite importing anything outside `node:` breaks a job with no install step | low | med | dependency-free by construction, like every sibling guard; `guard-cli-harness.mjs` is reused rather than re-invented | implementer | open |

## Open questions / Assumptions

- **Decision (mine, for confirmation at review):** the floor's exemption vocabulary gains a **third
  documented class** — *not rendered: a zero-box control whose visible proxy carries the target*, for
  `venue-tab.html`'s `<input type="file" class="hidden">`. `riviera-tailwind` rule 4 sanctions two
  classes today (inline prose link; third-party iframe) and says anything else that "can't" meet the
  floor is a layout to fix. A `display: none` input is not a layout to fix, and the alternative —
  putting `appTouchTarget` on it — declares a floor a box-less element cannot have. The skill is
  updated in this PR. — *Owner:* Ivo · *Resolves by:* review gate.
- **Assumption:** the sign-out notice's two buttons should **grow** rather than be exempted. They are
  flex children of a wrapping row, not words inside a sentence, so 2.5.5's inline exception does not
  reach them. — *Owner:* Ivo · *Resolves by:* phase 2.
- **Assumption:** `<a>` staying wholly out of scope is acceptable coverage. It leaves 59 undeclared
  links checked only by the sweep and by RV-FE at review — the status quo, not a regression, but the
  guard will not close that gap and should not be read as if it had. — *Owner:* Ivo ·
  *Resolves by:* review gate.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No booking, no beach-map *data*, no `availability` row is read
or written. `venue-map.html` is touched, but only the rendered size of its set tiles; the tile's
click handler, `data-state` hooks and optimistic state are untouched.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No Java changes, no module, no port, no event.

### Module ownership (§4a)

`N/A — no backend behavior is added or moved.`

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.`

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `app.html` | existing | shell template | unchanged | — |
| FE-2 | `auth/auth-page.ts` | existing | standalone component (inline template) | unchanged | Signal Forms, unchanged |
| FE-3 | `booking/booking-view.ts` | existing | standalone component (inline template) | unchanged | — |
| FE-4 | `operator/venue-tab.html` | existing | template | unchanged | — |
| FE-5 | `pages/home/home.html` | existing | template | unchanged | — |
| FE-6 | `venue/venue-map.html` | existing | template | unchanged | — |

**Standards:** no component is created, no folder decision is made, no signal/form API changes. The
edit in each file is an added attribute (`appTouchTarget` or `data-touch-exempt`), plus the
`TouchTarget` import in the two inline-template components that do not already have it, plus — only
where R-1 or the sign-out notice forces it — an `inline-flex items-center` pairing so `min-height`
actually applies (`riviera-tailwind` rule 4, first bullet).

## FE↔BE contract

`N/A — no contract change.`

## Execution status

**Stage pointer:** `plan — complete, awaiting phase 0`

**Next action:** Phase 0 — write `scripts/check-touch-target.test.mjs`'s first failing case (AC-1)
and watch it fail before writing the detector.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Detector: TT-1, TT-2, ancestor walk, `<a>` out of scope | | |
| 1 — CLI front-end: `--diff` / `--files` / `--hook` / `--all` | | |
| 2 — Mark the tree: 30 controls, 6 files, `--all` → 0 | | |
| 3 — Wire it: `PostToolUse` hook, CI step, docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/touch-target-guard.md` — this plan
- `scripts/check-touch-target.mjs` — the guard: detector + CLI
- `scripts/check-touch-target.test.mjs` — its detector suite (dependency-free, `node --test`)
- `scripts/guard-cli.test.mjs` — add this guard's CLI cases to the shared harness suite
- `.claude/settings.json` — the fourth `PostToolUse` guard entry
- `.github/workflows/ci.yml` — the fourth step in `Repo hygiene (diff-scoped)`
- `frontend/src/app/app.html` — 11 controls marked; sign-out notice buttons brought to the floor
- `frontend/src/app/app.scss` — only if the sign-out buttons need an `inline-flex` pairing
- `frontend/src/app/auth/auth-page.ts` — 5 controls marked (the 6th is ancestor-exempt already)
- `frontend/src/app/booking/booking-view.ts` — 7 controls marked
- `frontend/src/app/operator/venue-tab.html` — the hidden file input exempted
- `frontend/src/app/pages/home/home.html` — 3 controls marked
- `frontend/src/app/venue/venue-map.html` — the set tile, per R-1
- `frontend/e2e/touch-targets-tourist.e2e.ts` — the sign-out-notice sweep case (AC-11)
- `frontend/.claude/CLAUDE.md` — the guard paragraph, beside the focus-posture one
- `CLAUDE.md` — "three diff-scoped hygiene checks" becomes four
- `.claude/skills/riviera-tailwind/SKILL.md` — rule 4 gains the third exemption class and a pointer
  to the guard

---

## Phase 0 — Detector: TT-1, TT-2, the ancestor walk, `<a>` out of scope

**Files:** Create `scripts/check-touch-target.mjs` · Create `scripts/check-touch-target.test.mjs`

- [ ] **Step 1: Write the failing test** — AC-1 first, then one case per AC-2…AC-6. Reuse the
      sibling guards' shape: a `findViolations({ path, lines, added })` detector taking the file's
      lines and the diff-added line numbers, returning `{ path, line, rule, text }[]`.

```js
import { deepStrictEqual } from 'node:assert';
import { test } from 'node:test';

import { findViolations } from './check-touch-target.mjs';

const judge = (source) => {
  const lines = source.split('\n');
  return findViolations({
    path: 'frontend/src/app/x.html',
    lines,
    added: new Set(lines.map((_, i) => i + 1)),
  });
};

test('reports an undeclared button', () => {
  deepStrictEqual(
    judge('<button type="button" (click)="go()">Go</button>').map((v) => v.rule),
    ['TT-1'],
  );
});

test('an ancestor exemption covers its subtree and no further', () => {
  const source = [
    '<p data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)">',
    '  Prompt <button type="button">Toggle</button>',
    '</p>',
    '<button type="button">Outside</button>',
  ].join('\n');
  deepStrictEqual(
    judge(source).map((v) => v.line),
    [4],
  );
});

test('never judges an anchor', () => {
  deepStrictEqual(judge('<a routerLink="/" class="link">Home</a>'), []);
});
```

- [ ] **Step 2: Run it, verify it fails** — `node --test scripts/check-touch-target.test.mjs` →
      FAIL, `Cannot find module './check-touch-target.mjs'`, then per-assertion failures.

> Scope: this one suite. The other guards' suites are untouched until phase 1.

- [ ] **Step 3: Minimal implementation.** Import `maskHtmlComments`/`typescriptRegions`-equivalent
      region masking and the `startTags`/`readAttributes` walk from `check-focus-posture.mjs`'s
      shape — **copied deliberately, not imported**: that module is not a library, it caches
      nothing shareable, and the sibling guards each own their parser. Extend the walk to carry an
      **exemption depth counter**: push on a non-void, non-self-closed start tag carrying
      `data-touch-exempt`, pop on its matching end tag. Void elements
      (`area base br col embed hr img input link meta source track wbr`) and `/>`-closed tags never
      push.

```js
const IN_SCOPE = /^frontend\/src\/app\/.*(?<!\.spec)\.(ts|html)$/;
/** `<a>` is deliberately absent: `min-height` is a no-op on an inline box, so a directive on a
 *  link is a declaration that can be false. Links stay the measured sweep's and RV-FE's job. */
const JUDGED = new Set(['button', 'input', 'select', 'textarea']);
const GATING = new Set(['TT-1', 'TT-2']);
```

- [ ] **Step 4: Run it, verify it passes** — `node --test scripts/check-touch-target.test.mjs` →
      PASS.

> Scope (end-of-phase regression): `node --test "scripts/*.test.mjs"` — the whole guard suite, which
> is what the hygiene job runs.

- [ ] **Step 5: Generalization-audit pass.** Population: *every guard that walks Angular template
      start tags* — enumerate with
      `git ls-files 'scripts/check-*.mjs' | xargs grep -l "startTags"`. Judge whether the
      void-element and self-closing handling this phase adds is a latent gap in the enumerated
      siblings too (`check-focus-posture.mjs` walks tags flat and never nests, so it may be
      unaffected — confirm rather than assume). Append the result to the log below.

- [ ] **Step 6: Commit** — `git commit -m "Detect undeclared touch targets in Angular templates (#648)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — CLI front-end: `--diff`, `--files`, `--hook`, `--all`

**Files:** Modify `scripts/check-touch-target.mjs` · Modify `scripts/guard-cli.test.mjs`

- [ ] **Step 1: Write the failing test** — add this guard's cases to `guard-cli.test.mjs`, spawning
      the CLI against a throwaway `git init` repo via `withRepo`/`hookPayload`. Cases: AC-7
      (diff-scoped), AC-8 (untracked judged whole), AC-9 (both rules exit non-zero, clean exits 0),
      plus the front-end regressions #618 paid for once — a pathspec resolved from a subdirectory,
      a repo with `diff.relative` set, and a non-ASCII C-quoted path.
- [ ] **Step 2: Run it, verify it fails** — `node --test scripts/guard-cli.test.mjs` → FAIL.
- [ ] **Step 3: Minimal implementation** — `check(range)`, `checkPaths(paths, seams)`, `sweep()`,
      `settle(violations, headline)` and `main(argv)`, delegating every git call to
      `./git-diff.mjs` exactly as the siblings do. Nothing outside `node:` may be imported (R-7).
- [ ] **Step 4: Run it, verify it passes** — `node --test "scripts/*.test.mjs"` → PASS.
- [ ] **Step 5: Generalization-audit pass.** Population: *every guard CLI spawned by the harness* —
      enumerate with `git ls-files 'scripts/check-*.mjs'`. Confirm the new CLI's flag surface and
      exit-code discipline match all four, and that no sibling lacks a case this phase added.
- [ ] **Step 6: Commit** — `git commit -m "Give the touch-target guard its diff, files and hook front-ends (#648)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Mark the tree: 30 controls, 6 files, `--all` → 0

**Files:** Modify `frontend/src/app/app.html` · `app.scss` (only if forced) ·
`auth/auth-page.ts` · `booking/booking-view.ts` · `operator/venue-tab.html` ·
`pages/home/home.html` · `venue/venue-map.html` · `frontend/e2e/touch-targets-tourist.e2e.ts`

> Load `playwright-cli` before touching the e2e file and `angular-developer` + the angular-cli MCP
> before the `inline-flex` pairing — both are Skill-routing-gate rows this phase enters (re-entry
> rule).

- [ ] **Step 1: Establish the red** — `node scripts/check-touch-target.mjs --all` → 30 `TT-1`
      violations across 6 files. Record the exact list in Execution status; it is the phase's
      work-list and the evidence AC-10 is a real transition, not a vacuous one.
- [ ] **Step 2: Measure before marking (R-1).** Read the tourist map tile's rendered box at 390 px
      via the existing venue-map sweep before adding `min-w-11`. If it is already ≥ 44 px, the
      directive is a declaration and nothing moves; if not, apply #605's shipped grid answer.
- [ ] **Step 3: Mark, file by file**, in the order app.html → auth-page.ts → booking-view.ts →
      home.html → venue-tab.html → venue-map.html, running `--all` after each so the count only ever
      falls. `appTouchTarget` everywhere except `venue-tab.html`'s hidden file input, which takes
      the third exemption class.
- [ ] **Step 4: Verify** — `node scripts/check-touch-target.mjs --all` → 0 (AC-10);
      `npm run lint`, `npm test`, `npm run format:check`, `npm run test:e2e:a11y` → green, with the
      new sign-out-notice sweep case covering AC-11.
- [ ] **Step 5: Generalization-audit pass.** Population: *every control the guard cannot judge but
      the same argument reaches* — enumerate the `<a>` population with `--all` under a temporarily
      widened `JUDGED` set, and record the count as the documented residual rather than fixing it
      (Non-goals). This is the audit's honest negative result, and recording it is what stops a
      later session reading "guard is green" as "every control is declared".
- [ ] **Step 6: Commit** — `git commit -m "Declare the touch-target mechanism on every judged control (#648)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Wire it: hook, CI step, docs

**Files:** Modify `.claude/settings.json` · `.github/workflows/ci.yml` ·
`frontend/.claude/CLAUDE.md` · `CLAUDE.md` · `.claude/skills/riviera-tailwind/SKILL.md`

- [ ] **Step 1: Wire the hook** — a fourth `PostToolUse` entry, same shape as the three siblings
      (`|| true`, `timeout: 15`, a `statusMessage` naming the rules).
- [ ] **Step 2: Wire CI** — a fourth step in `Repo hygiene (diff-scoped)`, `if: ${{ !cancelled() }}`
      so one push surfaces every hygiene rule. **Do not rename the job** — the name is a required
      status-check context in the ruleset (#413/#420/#539).
- [ ] **Step 3: Verify the gate is real** — push a throwaway commit adding an undeclared button,
      confirm the hygiene job goes red naming `TT-1`, then revert it. A gate never observed failing
      is a gate assumed to work.
- [ ] **Step 4: Docs** — the guard paragraph in `frontend/.claude/CLAUDE.md`; `CLAUDE.md`'s
      "three diff-scoped hygiene checks" → four, with the `<a>`-out-of-scope residual stated;
      `riviera-tailwind` rule 4 gains the third exemption class and a pointer to the guard.
- [ ] **Step 5: Generalization-audit pass.** Population: *every doc that states the count or the
      roster of hygiene guards* — enumerate with
      `git grep -ln "check-focus-posture\|diff-scoped" -- '*.md' '*.yml' '*.json'`. This is the
      counting sweep `riviera-docs-freshness` exists for: this slice makes the Nth guard where every
      doc says "the three".
- [ ] **Step 6: Commit** — `git commit -m "Gate the touch-target declaration in CI and while typing (#648)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated; a row whose population is "the other X like
> this one" is the shape that misses things (Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1…AC-7:** Run `node --test scripts/check-touch-target.test.mjs` → all pass. Verified at `<sha>`.
- [ ] **AC-8, AC-9:** Run `node --test scripts/guard-cli.test.mjs` → all pass. Verified at `<sha>`.
- [ ] **AC-10:** Run `node scripts/check-touch-target.mjs --all` → `0 violations`, exit 0. Verified at `<sha>`.
- [ ] **AC-11:** Run `npm run test:e2e:a11y` → the `sign-out failure notice` case passes. Verified at `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, no backend change.
- [ ] **Availability** section filled (N/A justified); invariant #2 not engaged.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section filled (N/A, frontend-only); invariant #11 not engaged.
- [ ] **Payment/payout** section filled (N/A); invariants #5, #8, #9 not engaged.
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented; the marking pass added no `as any`, no new
      component, and no cross-feature import.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean (the File-structure
      section matches the diff).
- [ ] `node scripts/check-touch-target.mjs --all` → 0, and the guard's own hygiene siblings
      (`check-inline-comments`, `check-focus-posture`) are clean over this diff.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final plan state committed here citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
