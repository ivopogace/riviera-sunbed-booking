# Operator Console Error-Ink Token Sweep — Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route), or the superpowers `subagent-driven-development`/`executing-plans`
> skills if present task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Two deliverables, one PR. **(1)** `docs/design/colour-literal-token-audit.md` — the
durable per-family verdict ledger #836 asked for, replacing a 336-site backlog with a
five-class decision record and eight grabbable slices. **(2)** The first slice cut from it:
the operator console's 32 plain `text-[#a3160e]` positions move onto the already-registered
`--riv-error-ink`, proven byte-identical by a real render.

**Architecture:** #836's own framing is that the residue is *a decision, not a chore*, and the
audit confirms it with evidence: **287 positions, 111 distinct values, 71 of them used once.**
The population does not sort by value — it sorts by *value + role + painted-on surface*, which
is the same lesson #835 learned when `#0a4f5e` turned out to be three roles. Hence five classes
(T tokenisable / F fixed-fill pair / O `/opacity` / R role-mismatch / S state palette), and hence
the family cut first is the one where all three coordinates line up: a **plain** position, whose
value **already equals a registered token**, whose **role matches** that token, on a surface
where the token's per-theme resolution is **already correct**. All 32 sit inside porcelain-pinned
subtrees, so `--riv-error-ink` resolves `#a3160e` there and nothing moves. The proof burden is
therefore not contrast maths (no value changes) but **plumbing**: a token consumed through a
utility that was never generated leaves the class in the markup and the paint silently unchanged,
and only a real render can see that.

**Persistence:** N/A — frontend-only styling slice, no schema, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue **#855** (T-1), cut from **#836** by this slice's own audit.
Enumerated against merged `main` `e801063`. #836's headline numbers are stale (it says 336 across
62 files; #835 / PR #838 has landed since) — the correction is recorded in the ledger and in
*Open questions → Resolved* (OQ-A).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill is what
caught #836's stale count, and what turned "migrate 336 sites" into five classes with different
proof burdens; it also split the `#a3160e` family itself into four sub-populations, three of which
this slice must *not* touch) · `riviera-plan-doc` (this template — the Behavior-parity ledger is
what converts "styling only" from a claim into a per-position verdict, and the Non-goals fence off
the three excluded `#a3160e` sub-populations) · `tdd` (at the plan's named seams — and it is what
surfaced OQ-E: asking "what test goes red here?" showed the planned ninth contrast spec had no
red to offer, because eight specs already assert the same thing. This slice is byte-identical by
construction, so its tests are honest **guards**, not red-first drivers, and the plan says so
rather than staging a fake red) · `riviera-review-overlay` (review gate — due at ready-for-review;
RV-FE-E2E owns the phase-3 spec's suite placement) · `riviera-docs-freshness` (close-out — **due**,
range `origin/main..HEAD`; the slice adds a maintained doc to a folder whose README says its files
are never maintained, which is exactly the kind of stated fact a sweep must catch) · `riviera-tailwind`
(token-first styling: the **named** utility once a token is registered, the rejection of the
`/opacity` modifier because it compiles to `color-mix()` and changes the computed value — which is
what carves 7 sites out of this family — and the "prove no drift by computed styles, never the class
list" rule that shapes AC-3) · `riviera-frontend` (placement: the registry is the two-place
`tailwind.css` + `core/theme.ts` pair and needs **no** `core/theme.ts` row here since no token is
added; the new e2e goes in the CI-safe mocked suite) · `riviera-local-debug` (cloud-session recipe:
scoped Vitest runs, and `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked
Playwright suite — never `playwright install`) · `to-issues` (the eight child issues cut from the
ledger, published in dependency order with #836 as native parent)

**Branch:** `claude/sdlc-836-01ky0v` — **cloud-session substitution** for
`feature/operator-error-ink-tokens`, per `riviera-sdlc` § *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

> Each AC is written at the boundary that can actually observe it. No colour value moves in
> this slice, so the unit spec's job is *identity* (the token is what the specs think it is)
> and the e2e's job is *plumbing* (the utility exists and resolves).

- [x] **AC-1:** Given the porcelain console surfaces the operator error ink lands on (the bare
      porcelain stops, the card glass, the `white/70` alert panel), when `--riv-error-ink`'s
      registered value is painted on each, then every pair meets WCAG AA 4.5:1.
      *Seam:* the `ERROR_INK` constant exported by `src/testing/glass-tokens.ts` — the token
      registry's test-side mirror, not any component.
      *Pinned by:* the **eight existing** operator `*.contrast.spec.ts` files, which already assert
      this per tab and now read the value from the mirror (see OQ-E). A ninth consolidated spec was
      planned and dropped: it would have restated eight passing assertions, which the Sonar
      duplication bar rejects and which reuse-over-addition rejects anyway.
- [x] **AC-2:** Given the **eight** operator contrast specs that restate `#a3160e` as a local
      constant, when each is read, then it imports the value from `glass-tokens.ts` rather than
      restating the literal — so a future token change cannot leave the specs asserting the old
      value while the components paint the new one (#835's R-5, made structural).
      *Seam:* `src/testing/glass-tokens.ts`'s export surface.
      *Pinned by:* the phase-1 verification grep, recorded in *Acceptance-criteria verification*.
- [x] **AC-3:** Given a running app, when each migrated operator surface is rendered, then its
      computed `color` equals `rgb(163, 22, 14)` — the error mode this catches is a class whose
      utility was never generated, which leaves the markup intact and the paint unchanged, and
      which no unit spec can see.
      *Seam:* the rendered operator console at `/operator/:venueId/**` (mocked e2e).
      *Pinned by:* `operator-error-ink.e2e.ts` › `the operator console error ink resolves to the registered token value`
- [x] **AC-4:** Given the document theme forced to `dark`, when an operator error surface is
      rendered, then its ink **still** resolves `rgb(163, 22, 14)` — the whole safety argument for
      putting a *themed* token on these 32 sites is that their console pins porcelain, and AC-1
      proves porcelain only. Both console hosts are driven (`operator-home` and `operator-console`
      pin porcelain through **separate** host bindings; one passing is not evidence about the
      other — #835 closed this too early and had to reopen it as F-4).
      *Seam:* the same rendered console, with `localStorage` seeded to the `dark` theme.
      *Pinned by:* `operator-error-ink.e2e.ts` › `the console keeps its porcelain error ink under a dark document theme`,
      › `the operator home keeps its porcelain error ink under a dark document theme`.
      **Mutation-checked:** flipping the expected value to the dark token's `rgb(255, 169, 161)`
      fails both — so the assertion discriminates rather than passing vacuously.
- [ ] **AC-5:** Given `main` at merge time, when
      `grep -rn 'text-\[#a3160e\]' frontend/src/app/operator` is run, then it returns nothing.
      The `bg-[#a3160e]`, `/opacity` and `booking/` forms are deliberately still present — they
      are #854, #852 and #850 — so the grep is scoped to the migrated form, not the value.
      *Seam:* the working tree.
      *Pinned by:* the phase-4 verification command, recorded in *Acceptance-criteria verification*.
- [x] **AC-6:** Given `docs/design/colour-literal-token-audit.md`, when a reader asks "is family
      X tokenisable, and what does its slice owe?", then the answer is in the ledger with its
      reasoning, and every open family carries a live issue number.
      *Seam:* the committed doc.
      *Pinned by:* the phase-0 verification, recorded in *Acceptance-criteria verification*.

## Non-goals

- **The three other `#a3160e` sub-populations.** They are in the same value family and none of
  them is this slice's:
  - the 3 `booking/` sites (`booking-dialog:311`, `booking-pay:255`, `my-bookings:290`) sit on a
    **fixed** `#f6e8e7` fill, where the themed `--riv-error-ink` would resolve `#ffa9a1` in dark
    — light on light. Class F, **#850**.
  - the 7 positions carrying an `/opacity` modifier compile to `color-mix()`, so tokenising them
    is a computed-value change owing a before/after diff. Class O, **#852**.
  - the 2 `bg-[#a3160e]` solid fills are a **fill** role wearing an ink token's value. Class R,
    **#854**.
- **Every other family in the ledger.** Seven issues, one each; this PR files them and cuts one.
- **A lint rule for the exemption classes.** #836's step 4, deliberately deferred — the ledger's
  closing section states the condition under which it becomes worth writing.
- **Any new token.** `--riv-error-ink` already exists and is already mapped in `@theme inline`;
  this slice registers nothing, so `core/theme.ts` is untouched.
- Any behaviour, wire format, endpoint, or invariant. Styling only.

## Behavior-parity ledger

> The slice replaces the *paint mechanism* of existing surfaces, not the paint. "Preserved"
> means byte-identical computed value.

| Old-surface behavior | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| 32 operator error/alert inks painted `#a3160e` via an arbitrary value | **preserved** | → `text-riv-error-ink`, which resolves `#a3160e` under the porcelain pin. Byte-identical (AC-3) |
| The same inks under a `dark` **document** theme (console still porcelain-pinned) | **preserved** | The pin is a subtree host attribute; `@theme inline` is what makes the token re-resolve in the subtree. AC-4 drives both host bindings |
| `requests-tab.html:125`'s urgency chip — `text-` migrates, its `/opacity` border + fill do not | **preserved** | The line is touched by two slices by design; this one changes only the `text-` position, so the chip's tint is byte-unchanged until #852 |
| The seven operator contrast specs' assertions | **preserved** | Same assertions, same value; only the *source* of the constant changes, from a local literal to `glass-tokens.ts` |
| `shared/confirm-panel.spec.ts:84`'s `toContain('bg-[#a3160e]')` | **preserved** | That site is a `bg-` fill (#854), not in this slice — the assertion stays valid |
| Every `hover:` / `focus-visible:` / `aria-*` variant on the touched classes | **preserved** | The migration substitutes the colour token inside the existing variant; no variant added or removed |
| The `data-testid` hooks the operator e2e specs query | **preserved** | Untouched; the migration edits `class` strings only |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A migrated operator component is rendered **outside** a porcelain-pinned host, so the themed token resolves `#ffa9a1` and the error ink flips light-on-white | low | high | All nine files verified inside the pin (`operator-console.ts:72`, `operator-home.ts:41`, plus `app.ts:50`'s operator-chrome pin); AC-4 drives **both** host bindings against a forced `dark` document theme, because they pin porcelain separately — and the assertion is mutation-checked against the dark token's value, so it cannot pass vacuously | claude | closed |
| R-2 | A site is migrated that is actually one of the three excluded sub-populations, silently changing dark-theme paint or a computed value | med | high | The migration is scoped by **form**, not by value: only plain `text-[#a3160e]` under `operator/`, matched with a negative lookahead on `/` so an `/opacity` form cannot be swept in by substring. AC-5's grep is the same form; the excluded forms' baseline counts are re-asserted after the sweep | claude | closed |
| R-3 | The eight operator contrast specs keep restating `#a3160e` and drift from the token later | med | med | Phase 1 repoints them at `glass-tokens.ts` **before** any component moves (#835's R-5, which this slice inherits as a known pattern rather than rediscovering) | claude | closed |
| R-4 | `text-riv-error-ink` generates no utility, so the class changes and the paint does not | low | high | The utility is already live (`--color-riv-error-ink` is mapped at `tailwind.css:53` and consumed today by `admin/`, `auth/`, `shared/`), but AC-3's first test asserts the emitted rule set contains `.text-riv-error-ink` **and** `toHaveCSS` resolves it in a real render; unit specs cannot see either | claude | closed |
| R-5 | The audit doc lands in `docs/design/`, whose README states its files are records that are **never** maintained — a reader following the README would apply the `as-built diverges` pointer convention to a ledger that must instead be brought up to date | med | med | The README gains an explicit exception section naming this file and its opposite contract; the ledger's own header states it too, from the other side | claude | open |
| R-6 | The ledger's issue numbers go stale as families are cut, leaving a decision record that points at the wrong tickets | med | low | Every child issue's ACs include "update the ledger's row to `done` with this PR, **in this PR**" — the same close-out rule the plan-doc template applies to itself | claude | open |

## Open questions / Assumptions

_None open._

- **Assumption (accepted, not open):** the 32 migrated sites keep a **themed** token rather than
  gaining a theme-invariant one. This is safe *only* because their console pins porcelain, which
  is why AC-4 exists and why R-1 stays open until it passes. If the operator console ever stops
  pinning porcelain, these 32 sites become class F, not class T.

### Resolved

- **OQ-A — #836's population numbers.** The issue states "380 occurrences, 336 outside
  `*.spec.ts`, across 62 files". Re-enumerated against `main` `e801063` with the issue's own
  command: **331 / 287 / 51 files**, and 111 distinct values. #835 (PR #838, `27a3b40`) landed
  between the issue and this slice. The shape of the finding is unchanged; the count is not, and
  the ledger supersedes it.
- **OQ-B — is the `#a3160e` family one slice?** No: **four**. Sorted by *form*, the coordinate
  that decides the proof burden — 32 plain `text-` on porcelain (this slice), 3 plain `text-` on
  a fixed fill (#850), 7 `/opacity` (#852), 2 `bg-` fills (#854). The issue's flat "44 occurrences
  of `#a3160e`" would have been wrong to sweep as one.
- **OQ-C — where does the audit doc live?** `docs/design/`, per #836's own step 2, despite that
  folder's README declaring its contents unmaintained records. Resolved by making the exception
  explicit in the README rather than by relocating the file — the doc reasons about the design
  substrate and belongs beside it. Recorded as R-5.
- **OQ-E — does the slice need a new consolidated contrast spec?** No. All eight operator tabs
  already assert the error ink's AA over their own surfaces; a ninth file would restate eight
  passing assertions, which the Sonar duplication bar rejects. AC-1 is pinned by the existing
  eight, now reading the token mirror — which is the assertion that was actually missing.
- **OQ-D — how many child issues?** Seven, one per family, plus this slice's own. Confirmed with
  the maintainer; the alternatives (four class-level tickets, or none) were rejected because a
  class mixes families needing separate design calls, which a grabber would have to re-derive.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice edits `class` strings in operator-console templates;
no reservation path, no `availability` row, no booking state is read or written.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is in the diff.

### Module ownership (§4a)

N/A — frontend-only; the slice adds and moves no backend behavior.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. The `payouts-tab` sites in the diff are a **load-error ink**; no money
value, ledger row, or Stripe call is touched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/venue-tab.html` (8 positions) | existing | template | unchanged | unchanged |
| FE-2 | `operator/layout-editor.html` (6) | existing | template | unchanged | unchanged |
| FE-3 | `operator/venue-create-card.html` (5) | existing | template | unchanged | unchanged |
| FE-4 | `operator/requests-tab.html` (4) | existing | template | unchanged | unchanged |
| FE-5 | `operator/set-editor.html` (3) | existing | template | unchanged | unchanged |
| FE-6 | `operator/daily-view-tab.html` (2) | existing | template | unchanged | unchanged |
| FE-7 | `operator/pricing-tab.html` (2) | existing | template | unchanged | unchanged |
| FE-8 | `operator/payouts-tab.html` (1) | existing | template | unchanged | unchanged |
| FE-9 | `operator/booking-cutoff-field.ts` (1) | existing | inline-template component | unchanged | unchanged |

**Standards:** no Angular API is touched — every edit is a `class` string in a `.html` or an
inline template. The global `tailwind.css` reaches them because emulated encapsulation scopes only
a component's own `styles`.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `implement (phase 4)` — all five ACs that have tests are green; the slice is
built.

**Next action:** run the full frontend gate (lint, format, unit, mocked e2e), mark PR #856 ready
for review, then run the Review and Sonar gates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Audit ledger + child issues + plan doc | ✅ | `4029d04` |
| 1 — Repoint the operator contrast specs at `glass-tokens.ts` | ✅ | (this commit) |
| 2 — Migrate the 32 sites to `text-riv-error-ink` | ✅ | (this commit) |
| 3 — Mocked e2e: computed value, light and forced-dark | ✅ | (this commit) |
| 4 — Verification + close-out | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| _(none yet)_ | | | |

---

## File structure

- `docs/design/colour-literal-token-audit.md` — the per-family verdict ledger (#836's deliverable)
- `docs/design/README.md` — the exception section naming the ledger as maintained, not a record
- `docs/plans/operator-error-ink-tokens.md` — this plan
- `frontend/src/app/operator/{venue-tab,layout-editor,venue-create-card,requests-tab,set-editor,daily-view-tab,pricing-tab,payouts-tab}.html` — the migrated positions
- `frontend/src/app/operator/booking-cutoff-field.ts` — the one inline-template position
- `frontend/src/app/operator/{daily-view-tab,layout-editor,payouts-tab,pricing-tab,requests-tab,set-editor,venue-create-card,venue-tab}.contrast.spec.ts` — repointed at `glass-tokens.ts`
- `frontend/e2e/operator-error-ink.e2e.ts` — AC-3, AC-4

---

## Phase 0 — The audit ledger and its child issues

**Files:** Create `docs/design/colour-literal-token-audit.md` · Modify `docs/design/README.md` ·
Create `docs/plans/operator-error-ink-tokens.md`

- [ ] **Step 1:** Enumerate by mechanism (#836's own grep), group by *value*, cross-reference every
      value against the registered token set, and record utility form / folder / `/opacity` /
      variant per site.
- [ ] **Step 2:** Sort the families into the five classes and write the verdict per family.
- [ ] **Step 3:** File the eight child issues with #836 as native parent; backfill their real
      numbers into the ledger.
- [ ] **Step 4:** Commit — `git commit -m "Record the colour-literal audit and cut its slices (#836)"`

## Phase 1 — Repoint the operator contrast specs at the token mirror

**Files:** Modify `frontend/src/testing/glass-tokens.ts` · Modify the seven operator
`*.contrast.spec.ts` · Create `frontend/src/app/operator/operator-error-ink.contrast.spec.ts`

> **Correction made during execution (OQ-E).** The planned new consolidated contrast spec was
> dropped: all eight operator tabs *already* assert the error ink's AA, so a ninth file would have
> been eight duplicated assertions. The real R-3 work — and the whole of AC-2 — is repointing those
> eight at the mirror, which is what this phase does.

- [x] **Step 1:** Repoint all eight specs' local constants (`ALERT`, `DESTRUCTIVE_INK`,
      `ERROR_INK`, and three inline literals) at `glass-tokens.ts`'s `ERROR_INK`, via the
      established `rgbToHex(TOKEN)` idiom `venue-tab.contrast.spec.ts` already uses for
      `ACCENT_INK`. No new export: the mirror's convention is `Rgb` + `rgbToHex()` at the call site.
- [x] **Step 2:** Drop `hexToRgb` from `requests-tab.contrast.spec.ts` — repointing `ALERT_RGB`
      straight at the `Rgb` mirror left the import unused.
- [x] **Step 3: Run them, verify they pass** —
      `npx ng test --watch=false --include="src/app/operator/*.contrast.spec.ts"` → 10 files,
      70 tests, all green. The value is identical; only its source changed, so green is the
      correct outcome and the assertion is now drift-proof.
- [x] **Step 4: Generalization-audit pass** — see the log below.
- [x] **Step 5: Commit** — `Read the operator error ink from the token mirror (#855)`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

## Phase 2 — Migrate the 32 positions

**Files:** Modify the eight operator `.html` files + `booking-cutoff-field.ts`

- [x] **Step 1:** Replaced **only** plain `text-[#a3160e]` with `text-riv-error-ink` under
      `operator/` — 32 positions, matched with a negative lookahead on `/` so an `/opacity` form
      could not be swept in by substring (R-2).
- [x] **Step 2:** `npx ng test --watch=false --include="src/app/operator/**/*.spec.ts"` →
      50 files, 539 tests, PASS.
- [x] **Step 3:** AC-5's grep returns nothing; the three excluded forms still return their
      baseline counts (2 `bg-` plain, 7 `/opacity`, 3 `booking/` `text-`).
- [x] **Step 4: Commit** — `Paint the operator console's error ink from the token registry (#855)`
- [x] **Step 5: Update plan-doc execution status** in the same commit window.

## Phase 3 — Prove the plumbing in a real render

**Files:** Create `frontend/e2e/operator-error-ink.e2e.ts`

- [x] **Step 1:** Assert the token is declared **and its utility was generated** (the R-4 detector,
      read off the emitted rules because `@theme inline` writes no `:root` alias), then that the
      computed `color` is `rgb(163, 22, 14)` on the rendered venue load error (AC-3).
- [x] **Step 2:** Seed `localStorage` to the `dark` theme and assert the ink holds — for **both**
      host bindings: the console (`venue-load-error`) and operator home (`venue-create-error`) (AC-4).
- [x] **Step 3: Run it** —
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts operator-error-ink`
      → 4 passed. Two driving bugs found and fixed on the way: the venue tab loads
      `/api/venues/{id}/profile`, not `/api/venues/{id}`, and the create form's submit stays
      disabled until region and description are filled too.
- [x] **Step 4: Mutation-check** — expected value flipped to the dark token's `rgb(255, 169, 161)`;
      both dark-theme tests fail, confirming they discriminate. Reverted.
- [x] **Step 5: Commit** — `Pin the operator error ink against a real render (#855)`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

## Phase 4 — Verification and close-out

- [ ] Run the AC verification commands below.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main`
- [ ] `npm run lint && npm run format:check`
- [ ] Mark the PR ready for review; run the Review gate, then the Sonar gate.
- [ ] Finalize this Execution status in the PR's own last commit, citing `merged via PR #NN`.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-31 | Phase 0 (the audit itself) | Every colour position written as an arbitrary value rather than a token utility — i.e. the mechanism `riviera-tailwind`'s token rule forbids, not the values anyone remembered | `grep -rnoE '(text\|bg\|border\|fill\|stroke\|shadow)-\[(#[0-9a-fA-F]{3,8}\|rgba?\()' frontend/src --include=*.ts --include=*.html` | 287 outside `*.spec.ts`, 111 distinct values, 51 files | Classified into five classes; one cut as this slice, seven filed as #848–#854, class S deferred with its condition stated |
| 2026-08-31 | Phase 0 (sub-population split) | Within the largest family, the **utility form** each `#a3160e` site uses — the coordinate that decides whether substitution is byte-identical, which value-grouping alone cannot see | `grep -rnoE '…(text\|bg\|border…)-\[#a3160e\](/[0-9]+)?' src --include=*.ts --include=*.html` | 35 plain `text-`, 2 `bg-`, 7 `/opacity` | Split 44 into four slices; only the 32 porcelain-hosted plain `text-` are in scope here |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 / AC-2:** `npx ng test --watch=false --include="src/app/operator/*.contrast.spec.ts"`
      → 10 files, 70 tests, PASS. `grep -rn "'#a3160e'" frontend/src/app/operator/*.contrast.spec.ts`
      → no results. Verified at phase 1.
- [x] **AC-3 / AC-4:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts operator-error-ink`
      → 4 passed, and mutation-checked. Verified at phase 3.
- [x] **AC-5:** `grep -rn 'text-\[#a3160e\]' frontend/src/app/operator` → no results. The excluded
      forms still return their baseline counts (2 `bg-` plain, 7 `/opacity`, 3 `booking/` `text-`),
      which is the half of AC-5 that proves the sweep did not overreach. Verified at phase 2.
- [x] **AC-6:** `docs/design/colour-literal-token-audit.md` committed; every open family row cites
      a live issue.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (N/A justified); invariant #2 untouched.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section filled (N/A, frontend-only).
- [ ] **Payment/payout** section filled (N/A justified).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
