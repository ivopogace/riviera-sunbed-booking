# Fixed-fill state skins — three theme-invariant token families Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route), or the superpowers `subagent-driven-development`/`executing-plans`
> skills if present task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the fixed hex literals worn by three per-state skins that sit on **themeable**
hosts — the outcome medallion, the amenity chip and the booking dialog's step badge — onto
theme-invariant `--riv-*` token families declared once, so no later dark override can drift an ink
light-on-light over a fill that stays pale, with zero computed-style change today.

**Architecture:** The single decision is **how the family is cut**, and it is cut by **form, not by
value, and never across half a per-state class ternary**. `#0a5f74` paints an amenity-chip ink, a
step-badge ink and a medallion ink; those are three roles on three surfaces, so they get three
tokens, exactly as #848/#864 settled for `#0a6e85`/`#a3372a`. Conversely a form is taken **whole**:
`booking-pay.ts:114`'s single `[class]` ternary carries the medallion's amber *waiting* state beside
its teal *confirmed* state, so tokenising one branch and leaving the sibling a literal would ship a
worse artifact than either whole option — the same mis-cut #858 itself exists to undo.

**Persistence:** N/A — frontend-only; no table, no migration, no backend code (invariant #1 untouched).

**Source of intent:** [#858](https://github.com/ivopogace/riviera-sunbed-booking/issues/858)
(class **F-3** of `docs/design/colour-literal-token-audit.md`), under the closed epic
[#836](https://github.com/ivopogace/riviera-sunbed-booking/issues/836). Its hand-off comment from
#864 (PR #866) is folded into phase 1.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that **five**
of the ticket's six inks are `aria-hidden`, not three; that `failure-panel.ts:27` **is** exempt; and
that three of the six sit inside per-state ternaries whose sibling branch is also a literal) ·
`riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is what turned "restyle
only" into the measured no-drift claim below) · `tdd` (each family lands red-guard-first: the token
guard spec fails on the undeclared token before `tailwind.css` gains it) · `riviera-review-overlay`
(review gate — runs at ready-for-review; RV-FE-* on the placement + the two-suite e2e split) ·
`riviera-docs-freshness` (**ran** over the slice's own range at close-out — see phase 5) ·
`riviera-tailwind` (§Styling-across-the-themes — supplied the theme-invariant-token rule, the
declare-once-with-the-reason-at-the-declaration form, the "group by form, not value" precedent from
`--riv-solid-fill-*`, and the "prove no drift by computed style, never the class list" gate) ·
`riviera-frontend` (placement: the token registry's two homes — `tailwind.css` + a `@theme inline`
row; the new guard spec sits beside the family it guards; the e2e goes in the **mocked** CI suite) ·
`playwright-cli` (the mocked `toHaveCSS` spec under a forced `dark` document theme, and its
mutation check) · `angular-developer` (nothing changed — the migration is class-string-only; no
component API, signal or template-control-flow edit) · `riviera-local-debug` (scoped `npm test`
recipe; loaded before the session's first `npm` invocation)

**Branch:** `claude/sdlc-858-d5rsea` — the cloud session's **designated remote branch stands in for
`feature/fixed-fill-state-skins`** (`riviera-sdlc` § *Remote / cloud session addendum*). The literal
`feature/…` branch is deliberately not created.

---

## Acceptance criteria (testable)

> Frontend slice: every AC names the **seam** it observes through, since "the inner hexagon" names
> none here. Two seam kinds are in play — the **stylesheet as text** (`src/tailwind.css`, read by
> the unit guard: the only thing that can see a *later* dark override, which jsdom maths cannot) and
> the **rendered computed style** (Playwright `toHaveCSS`: the only thing that can see a token
> declared without its `@theme inline` row, which no unit spec can).

- [ ] **AC-1:** Given the shipped skins, when each ink/fill pair is measured, then the measurement
      **and** what a themed alternative would resolve to in dark mode are recorded in the plan and at
      the declaration, so theme-invariance rests on a number. *Seam:* `src/tailwind.css` as text +
      `src/testing/glass-tokens.ts` mirrors · *Pinned by:*
      `fixed-fill-token-skins.contrast.spec.ts` › `'the themed alternative would not clear AA — which is why each family is invariant'`
- [ ] **AC-2:** Given the fifteen tokens, when the stylesheet is read, then each is declared
      **exactly once**, inside the base `:root, [data-riv-theme='porcelain']` block, at the value its
      test mirror carries — so a later theme block cannot override it. *Seam:* `src/tailwind.css` as
      text · *Pinned by:* `fixed-fill-token-skins.contrast.spec.ts` ›
      `'declares each token exactly once, so no theme block can override it'` + `'…in the base block…'` + `'…the values this test mirror carries'`
- [ ] **AC-3:** Given the three families, when every non-`.spec.ts` source under `src/app` is swept
      **by role**, then no component still paints one of the migrated positions as a literal — and
      the deliberately-untouched homes of the same values (the amber notice banner, `status-chip`,
      `booking-view`'s pending eyebrow, the `/opacity` tints, the `bg-[#0a5f74]` rings) are still
      painting them. *Seam:* the `src/app` source tree · *Pinned by:*
      `fixed-fill-token-skins.contrast.spec.ts` › `'leaves no component painting a migrated role as a literal'` + `'leaves the out-of-family homes of these values untouched'`
- [ ] **AC-4:** Given the one family member carrying **accessible text** (the amenity chip's two
      variants), when its ink is measured on its own fill, then both clear WCAG AA (4.5:1); given the
      five `aria-hidden` medallion sites and the `aria-hidden` step badge, then the exemption is
      **stated**, not silently assumed. *Seam:* `src/testing/chip-fills.ts` (the AA recipes) ·
      *Pinned by:* `shared/amenities.contrast.spec.ts` (unchanged assertions, reading the token
      mirrors) + `fixed-fill-token-skins.contrast.spec.ts` › `'states the aria-hidden exemptions'`
- [ ] **AC-5:** Given a real render under a **forced `dark` document theme**, when the medallion, the
      amenity chip and the step badge are inspected, then each paints the registered fill and ink —
      identical to the values it paints under porcelain. *Seam:* the rendered page (Playwright
      `toHaveCSS`) · *Pinned by:* `e2e/fixed-fill-state-skins.e2e.ts` ›
      `'the skins do not move under a dark document theme'`
- [ ] **AC-6:** Given each of the fifteen tokens, when the page is loaded, then the token is declared
      on `documentElement` **and** its `@theme inline` row generated the utility class the components
      consume — the failure a class-list assertion cannot see. *Seam:* the rendered page (the
      CSSOM) · *Pinned by:* `e2e/fixed-fill-state-skins.e2e.ts` › `'every registered token is declared and generates its utility'`
- [ ] **AC-7:** Given the **two** positive over-reach guards that assert a listed file *still*
      paints a value this slice migrates, when the migration lands, then both are narrowed in the
      same commit, array **and** docblock prose: `solid-btn-tokens.contrast.spec.ts`'s
      `OUT_OF_FAMILY` (`#a3372a`) drops `shared/failure-panel.ts` + `booking/booking-pay.ts`, leaving
      only `operator/payouts-tab.html` (#852's tints); `solid-fill-tokens.contrast.spec.ts`'s
      `SURVIVORS` (`#0a5f74`) drops `booking/booking-pay.ts`, `booking/booking-confirmation.ts` and
      `shared/amenity-chip.ts`, keeping `booking/booking-dialog.ts` for its gradient stop. *Seam:*
      those two spec files · *Pinned by:* their own `'the literal survives only outside the family'`
      and `'leaves the non-fill roles of the same three values untouched'` tests, green after the edits
- [ ] **AC-8:** Given the ledger, when the slice merges, then class F's "inks on fixed fills" row is
      `done` with this PR **and** carries the how-many-pairs answer with its reasoning; class R's
      `#0a5f74` row reflects the 3-fills/4-inks split; class S's `shared/amenity-chip.ts` row is
      retired; and the three families the audit surfaced but this slice does **not** take are filed
      as new rows with follow-up issues. *Seam:* `docs/design/colour-literal-token-audit.md` ·
      *Pinned by:* review-gate inspection (a prose ledger has no executable pin — stated, not implied)

## Non-goals

- **The three `bg-[#0a5f74]` fills** (`operator/set-editor.html:53`, `operator/layout-editor.html:44`
  ring colours, and `booking-dialog.ts:79`'s `--riv-cta-grad`-duplicating gradient stop) — #854's,
  and the gradient is its own question.
- **The `#a3372a` `/opacity` tints** (`operator/payouts-tab.html:236`) — #852's.
- **`--riv-solid-btn-danger-ink` reuse for the `#a3372a` pair.** Same value, theme-invariant, and
  still wrong: it is the outline *button*'s ink pinned to that button's `#f4f6f7` fill (#851). The
  class-R trap #848 and #864 were each re-cut around; not sprung a third time.
- **`shared/outcome-card.ts`'s two tone glyphs** — the same medallion *form*, but already painted
  from `--riv-accent-chip-fill`/`--riv-accent-ink` (themed) and an `/opacity` amber tint. Converging
  it onto this family would be a **visual change**, which this slice forbids. New ledger row +
  follow-up issue (phase 5).
- **`operator/requests-tab.html:94`'s green medallion** — `/opacity` tints (class O, #852's), and
  inside the porcelain-pinned console, so it has no drift to fix.
- **The amber *notice banner* pair** (`withheld-email-notice.ts:29`, the two legal pages) — carries
  the medallion's exact waiting values on a different **form** (a rectangular block with accessible
  text). A genuine class-F family; not this one. New ledger row + follow-up issue (phase 5).
- **`status-chip`'s nine per-state triples** and `booking-view`'s per-status palettes — class S.
- **Any visual change at all.** Every migrated position keeps its exact value; the proof is the
  computed-style e2e, not the diff reading plausibly.

## Behavior-parity ledger

> The slice replaces the *paint mechanism* of eight class-string positions, so the "restyle only, no
> behavior change" claim is exactly the kind this section exists to verify rather than accept.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Medallion renders `#d9f2f7`/`#0a5f74` in the confirmed state | preserved | `bg-riv-medallion-positive-fill text-riv-medallion-positive-ink`, same value; pinned by AC-5/AC-6 `toHaveCSS` |
| Medallion renders `#fcf0d9`/`#8a5410` in the awaiting state | preserved | `bg-riv-medallion-waiting-*`; the sibling ternary branch, migrated in the same expression |
| Medallion renders `#f7e8e4`/`#eecdc4`/`#a3372a` in the terminal-error state | preserved | `bg-riv-medallion-negative-fill border-riv-medallion-negative-border text-riv-medallion-negative-ink` |
| `appFailureIcon` renders that same negative skin | preserved | same three utilities on the directive's host `class` |
| Amenity chip renders two variants (neutral tag / water accent), ink+fill+border each | preserved | six `*-riv-amenity-*` utilities inside the same `computed()` ternary; the `amenity-chip` / `amenity-chip--water` marker classes are **retained** (`riviera-tailwind` rule 2 — `venue-map.spec.ts` and two e2e query them) |
| Step badge renders `bg-white`/`#0a5f74` active, `#2c7789`/`text-white` inactive | preserved | `text-riv-step-active-ink` and `bg-riv-step-idle-fill`; `bg-white` and `text-white` stay as they are — both are already theme-invariant, so a token would add a name without adding a guarantee (the `--riv-solid-fill-*` precedent: "No ink token: `text-white` already cannot theme") |
| `.step-num`, `.failure-icon` marker classes queried by specs | preserved | untouched; only the colour utilities beside them change |
| Every migrated glyph is `aria-hidden` and carries no accessible name | preserved | no ARIA attribute is touched by this slice; re-asserted by AC-4's exemption test |
| Ink/fill values **drift** if someone later adds a dark override | **changed → prevented** | that is the slice's point: single-declaration guard (AC-2) + the forced-dark e2e (AC-5) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A token is declared but its `@theme inline` row is forgotten → the utility never generates, the class sits inert in the markup and the paint silently reverts to inherited/transparent. No unit spec can see this. | med | high | AC-6's CSSOM check walks `document.styleSheets` for each expected `.bg-riv-*`/`.text-riv-*`/`.border-riv-*` selector — the #850 precedent, kept verbatim | agent | open |
| R-2 | The literal sweep (AC-3) matches **by value** and so fails on the eight deliberately-untouched homes of `#0a5f74`, `#a3372a`, `#8a5410` and `#fcf0d9` — or, worse, tempts the implementer to migrate them | high | med | Sweep **by role**, the #850 `LITERAL_ROLES` pattern: `text-[#0a5f74]` not `#0a5f74`; and pair it with a positive `OUT_OF_FAMILY`-style assertion (AC-3's second test) that the out-of-scope homes still paint theirs | agent | open |
| R-3 | A positive over-reach guard goes red the moment a listed file stops painting the value it pins | **certain** | high | AC-7: narrow the array *and* the docblock prose in the same commit as the migration. #864's hand-off comment named **one** such guard (`solid-btn-tokens`' `OUT_OF_FAMILY`); phase 1's regression run found a **second** the plan had not anticipated — `solid-fill-tokens`' `SURVIVORS`, #854's `#0a5f74` list. Both are now in AC-7. The lesson generalises: after migrating a value, re-run the *whole* `src/app` unit suite, not only the specs the diff names — a positive guard lives in the file of the ticket that *kept* the value, not the one that moves it | agent | **closed** — phase 1 |
| R-4 | Sonar's **0 new duplicated blocks** bar: this slice writes the **sixth** copy of the `STYLESHEET`/`baseBlock()`/`declarationsOf()` guard helpers, ~15 identical lines | high | med | Phase 0 extracts them to `src/testing/stylesheet-tokens.ts` and moves the five existing guards onto it — the slice then *removes* duplication instead of adding the copy that would trip the gate | agent | **closed** — phase 0; the same 38 assertions pass before and after |
| R-5 | Naming collision: `--riv-chip-bg`/`--riv-chip-border` already exist for a *different* chip | med | low | The amenity family is named `--riv-amenity-*`, not `--riv-chip-*`; the medallion follows the `--riv-tile-<state>-<role>` triple precedent | agent | open |
| R-6 | The `#fcf0d9`/`#8a5410` pair is tokenised as `--riv-medallion-waiting-*` while three other files keep it as a literal for a different form → a future reader reuses the medallion token on the notice banner | med | med | The reason is written **at the declaration** (the `--riv-console-negative-ink` docblock form), the out-of-family homes are pinned by AC-3's positive test, and the notice-banner family gets its own ledger row + follow-up issue | agent | open |
| R-7 | Scope creep: the medallion form recurs in `outcome-card`, `requests-tab` and the notice banners | high | med | Non-goals fixes the boundary explicitly, each exclusion with its reason; the two genuine families found become ledger rows + issues rather than silent omissions | agent | open |

## Open questions / Assumptions

- **Assumption:** none of the six hosts pins `data-riv-theme` — verified: every `data-riv-theme` host
  binding in the tree is `admin-console.ts`, `operator-console.ts` or `operator-home.ts`, and all
  eight migrated positions are tourist surfaces (`shared/`, `booking/`, reached from `venue/venue-map`
  and `pages/home`). So the dark branch **is** reachable, which is what makes invariance load-bearing
  here and distinguishes this family from `--riv-console-*-ink`. — *Owner:* agent · *Resolves by:* phase 1

### Resolved

- **~~Open question: how many pairs?~~** → **Three families, cut by form, ternaries taken whole.**
  The ticket asked it as "one skin with per-state values, or genuinely separate pairs?" and warned
  against assuming a shared ink value means a shared role. Answer: the six inks span **three forms** —
  a round decorative outcome medallion, a labelled amenity chip, and a numeral step badge on the
  dialog's teal header — so three families, each with per-state values, following the
  `--riv-solid-fill-*` "grouped by FORM, not by value" precedent. Within a form the unit is the whole
  **class ternary**, because a half-migrated `state() === 'awaiting' ? 'bg-[#fcf0d9] text-[#8a5410]'
  : 'bg-riv-medallion-positive-fill …'` is a worse artifact than either whole option. Confirmed with
  the maintainer at plan time (scope question, "take each ternary whole").
- **~~Open question: is `failure-panel.ts:27` AA-owing?~~** → **No, it is exempt.** The ticket said
  "not exempt by inspection — check whether its host renders accessible text in that ink." Checked:
  all three call sites (`venue/venue-map.html:350`, `:360`, `pages/home/home.html:124`) pass
  `aria-hidden="true"`, and the directive's own docblock already states "Decorative danger badge
  (aria-hidden; the heading carries the meaning)". The ink paints only the glyph.
- **~~Open question: how many of the six are `aria-hidden`?~~** → **Five, not three.** The ticket
  counted `booking-confirmation:41`, `booking-pay:114` and `booking-pay:210`. It missed
  `booking-dialog.ts:120`, which it described as "the active segmented-control segment" but is in
  fact the decorative step **number** badge inside the step list, carrying `aria-hidden="true"` with
  the meaning on the sibling `.step-label`; and `failure-panel.ts:27` per the row above. **The amenity
  chip is the slice's only AA-owing site** — which is precisely why it stays in scope (dropping it
  would leave a slice of pure exemptions with no AA proof at all).
- **~~Open question: does the medallion population extend past the ticket's four sites?~~** → **Yes,
  by one.** Enumerated by **mechanism** (`rounded-full` + centred flex + a ~52–66px box), not by the
  ticket's value list: `booking/request-confirmation.ts:15` is the identical medallion in the amber
  waiting state — its own comment calls it "the amber 'waiting' variant". Included, or the family
  ships with the waiting state tokenised in one file and literal in its twin. Full enumeration and
  the four exclusions: the Generalization-audit log.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes only CSS custom properties and the Tailwind
class strings that consume them; no booking, set, date, or `availability` row is read or written, and
no component's behavior, state or API changes.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is touched.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. `booking-pay.ts` is edited, but only its medallion class strings; no
PaymentIntent, webhook, refund, commission or ledger path is read or changed.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/amenity-chip.ts` | existing | attribute directive | `computed()` class string — **unchanged shape**, six literals → six utilities | — |
| FE-2 | `shared/failure-panel.ts` (`appFailureIcon`) | existing | attribute directive | static host `class` — three literals → three utilities | — |
| FE-3 | `booking/booking-pay.ts` | existing | standalone component | two `[class]` expressions — the state ternary (4 literals) and the terminal-error div (3) | — |
| FE-4 | `booking/booking-confirmation.ts` | existing | standalone component | static template class — 2 literals | — |
| FE-5 | `booking/request-confirmation.ts` | existing | standalone component | the hoisted `CLS.badge` recipe — 2 literals | — |
| FE-6 | `booking/booking-dialog.ts` | existing | standalone component | the step-badge `[class]` ternary — 2 literals | — |
| FE-7 | `src/tailwind.css` | existing | token registry | 15 declarations in the base block + 15 `@theme inline` rows | — |

**Standards:** no component API, signal, control-flow or a11y attribute changes — this is a
class-string and stylesheet slice. `riviera-tailwind` rule 2 is honoured throughout: every marker
class (`amenity-chip`, `amenity-chip--water`, `failure-icon`, `step-num`, `pay-done`) is retained.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `implement (phase 3)`

**Next action:** extend `shared/fixed-fill-token-skins.contrast.spec.ts` with the step block (red),
then declare `--riv-step-active-ink` + `--riv-step-idle-fill` and migrate `booking-dialog.ts:120`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — extract the token-guard helpers | ✅ | `fda89a8` |
| 1 — the outcome-medallion family | ✅ | `c72ff26` |
| 2 — the amenity-chip family | ✅ | `<phase-2>` |
| 3 — the dialog step-badge family | ⏳ | |
| 4 — the forced-dark computed-style e2e | | |
| 5 — ledger + follow-up issues + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/fixed-fill-state-skins.md` — this plan
- `docs/design/colour-literal-token-audit.md` — the ledger: F-3 `done`, class R `#0a5f74` corrected, class S amenity-chip row retired, three new rows
- `frontend/src/tailwind.css` — 15 token declarations (base block, with the reason at each) + 15 `@theme inline` rows
- `frontend/src/testing/stylesheet-tokens.ts` — **new**: the `STYLESHEET`/`baseBlock()`/`declarationsOf()` guard helpers, extracted at their sixth use
- `frontend/src/testing/glass-tokens.ts` — the 15 test mirrors
- `frontend/src/testing/chip-fills.ts` — the amenity recipes gain `fillClass`, mirroring the #854 `SEMANTIC_CHIP` precedent
- `frontend/src/app/shared/amenity-chip.ts` — the two-variant ternary onto `--riv-amenity-*`
- `frontend/src/app/shared/failure-panel.ts` — `appFailureIcon` onto `--riv-medallion-negative-*`
- `frontend/src/app/booking/booking-pay.ts` — the state ternary and the terminal-error medallion
- `frontend/src/app/booking/booking-confirmation.ts` — the ✓ medallion
- `frontend/src/app/booking/request-confirmation.ts` — the ⏳ medallion (`CLS.badge`)
- `frontend/src/app/booking/booking-dialog.ts` — the step-badge ternary
- `frontend/src/app/shared/fixed-fill-token-skins.contrast.spec.ts` — **new**: the single guard for all three families
- `frontend/src/app/booking/solid-btn-tokens.contrast.spec.ts` — narrow `OUT_OF_FAMILY` to one entry + the docblock prose (AC-7); move onto the extracted helpers
- `frontend/src/app/booking/form-error-tokens.contrast.spec.ts` — move onto the extracted helpers
- `frontend/src/app/shared/solid-fill-tokens.contrast.spec.ts` — move onto the extracted helpers
- `frontend/src/app/operator/console-accent-token.contrast.spec.ts` — move onto the extracted helpers
- `frontend/src/app/operator/console-negative-token.contrast.spec.ts` — move onto the extracted helpers
- `frontend/e2e/fixed-fill-state-skins.e2e.ts` — **new**: the mocked forced-dark computed-style proof

---

## Phase 0 — Extract the token-guard helpers

**Files:** Create `frontend/src/testing/stylesheet-tokens.ts` · Modify the five existing
`*token*.contrast.spec.ts` guards

**Why first:** this slice is the **sixth** guard to need `STYLESHEET` + `baseBlock()` +
`declarationsOf()`, byte-identical each time (~15 lines). Writing a sixth copy is what would trip
Sonar's 0-new-duplicated-blocks bar (R-4); extracting at the sixth use removes five copies instead.

- [x] **Step 1:** Create `src/testing/stylesheet-tokens.ts` exporting `STYLESHEET`, `baseBlock()`
      and `declarationsOf(name)` verbatim from the existing guards, with a docblock naming the
      pattern (`core/theme-boot.spec.ts`'s drift-guard shape) and why it is read as text.
- [x] **Step 2: Run the five existing guards, verify they still pass** —
      `npm test -- --run form-error-tokens solid-btn-tokens solid-fill-tokens console-accent-token console-negative-token`
      → PASS (this phase is a pure refactor; the tests are the safety net, not a new red)
- [x] **Step 3:** Delete the five local copies, importing from `../../testing/stylesheet-tokens`.
- [x] **Step 4: Re-run the same five** → PASS, byte-identical assertions.
- [x] **Step 5: Commit** — `git commit -m "Extract the token-guard stylesheet helpers at their sixth use (#858)"`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The outcome-medallion family

**Files:** Modify `src/tailwind.css`, `src/testing/glass-tokens.ts`, `src/app/booking/booking-pay.ts`,
`booking-confirmation.ts`, `request-confirmation.ts`, `src/app/shared/failure-panel.ts`,
`src/app/booking/solid-btn-tokens.contrast.spec.ts` · Create
`src/app/shared/fixed-fill-token-skins.contrast.spec.ts`

**The family** — seven tokens, three states, five sites, one form (a round, centred, `aria-hidden`
decorative outcome glyph on a card):

| Token | Value | Sites | Measured |
|---|---|---|---|
| `--riv-medallion-positive-fill` / `-ink` | `#d9f2f7` / `#0a5f74` | `booking-confirmation:41`, `booking-pay:114` (confirmed) | **6.20:1** |
| `--riv-medallion-waiting-fill` / `-ink` | `#fcf0d9` / `#8a5410` | `booking-pay:114` (awaiting), `request-confirmation:15` | **5.54:1** |
| `--riv-medallion-negative-fill` / `-ink` / `-border` | `#f7e8e4` / `#a3372a` / `#eecdc4` | `booking-pay:210`, `failure-panel:27` | **5.62:1** (border 1.24:1 — non-text chrome, §R-8 below) |

**Why invariant** — the fills do not theme and the hosts do, so a themed ink drifts. Measured in dark:
`--riv-accent-ink` (`#7cd7e8`) on the positive fill is **1.41:1**; `--riv-error-ink` (`#ffa9a1`) on
the negative fill is **1.54:1** — the exact number #850 measured on its own family — and on the
waiting fill **1.63:1**. All three are light-on-light.

- [x] **Step 1: Write the failing guard** — create
      `shared/fixed-fill-token-skins.contrast.spec.ts` with the medallion block: the AA/exemption
      tests, the themed-alternative bounds above, the single-declaration + base-block + mirrored-value
      tests, and the role-scoped literal sweep with its positive out-of-family counterpart.
- [x] **Step 2: Run it, verify it fails** — `npm test -- --run fixed-fill-token-skins` → FAIL:
      `--riv-medallion-positive-fill declarations: expected length 0 to be 1`
- [x] **Step 3: Minimal implementation** — declare the seven tokens in `tailwind.css`'s base block
      with a docblock in the `--riv-console-negative-ink` form (what the family is, why invariant,
      the measured numbers, the rejected coincidental tokens, the proof files); add seven
      `@theme inline` rows; add the seven mirrors to `glass-tokens.ts`; migrate the five sites.
- [x] **Step 4: Run it, verify it passes** — `npm test -- --run fixed-fill-token-skins booking-pay booking-confirmation request-confirmation failure-panel` → PASS
- [x] **Step 5: Discharge AC-7** — remove `shared/failure-panel.ts` and `booking/booking-pay.ts` from
      `solid-btn-tokens.contrast.spec.ts`'s `OUT_OF_FAMILY` array (leaving `operator/payouts-tab.html`
      alone) **and** correct the docblock prose above it to match the tree. Run
      `npm test -- --run solid-btn-tokens` → PASS.
      **Found during the phase's regression run:** a **second** positive guard the plan had not
      anticipated — `solid-fill-tokens.contrast.spec.ts`'s `SURVIVORS` (#854's `#0a5f74` list), which
      asserts `booking-pay.ts` and `booking-confirmation.ts` still paint it. Both rows removed with
      the same "read the shrunk list as that slice landing" narration the `#0a6e85` shrink already
      carries; `booking-dialog.ts` kept for its gradient stop. AC-7 and R-3 broadened to cover both.
- [x] **Step 6: Generalization-audit pass** — recorded in the log below; the population is the
      medallion **form**, not the ticket's value list.
- [x] **Step 7: Commit** — `git commit -m "Give the outcome medallion a theme-invariant per-state token family (#858)"`
- [x] **Step 8: Update plan-doc execution status** in the same commit window.

> **R-8 — the borders.** `#eecdc4` on `#f7e8e4` measures **1.24:1**, under 3:1. It is non-text chrome
> (WCAG 1.4.11) on an `aria-hidden` glyph, and the same finding `--riv-solid-btn-*` recorded at
> 1.06:1/1.90:1 against the same open tracking issue (#834). Carried across unchanged and **measured,
> not assumed exempt** — the `--riv-solid-btn-*` posture verbatim.

---

## Phase 2 — The amenity-chip family

**Files:** Modify `src/tailwind.css`, `src/testing/glass-tokens.ts`, `src/testing/chip-fills.ts`,
`src/app/shared/amenity-chip.ts`, `src/app/shared/fixed-fill-token-skins.contrast.spec.ts`

**The family** — six tokens, two variants, one site. Named `--riv-amenity-*`, **not** `--riv-chip-*`:
that prefix is already the popover/ink chip's (`--riv-chip-bg`, `--riv-chip-border`), and one hyphen
apart is not a distinction (#864's own naming argument).

| Token | Value | Measured |
|---|---|---|
| `--riv-amenity-tag-ink` / `-fill` / `-border` | `#2f4a54` / `#eef2f4` / `#dbe4e7` | **8.37:1** (border 1.15:1) |
| `--riv-amenity-water-ink` / `-fill` / `-border` | `#0a5f74` / `#d7eef4` / `#b9e0ea` | **6.00:1** (border 1.17:1) |

**This is the slice's only AA-owing pair** — the chip carries accessible text ("Xm to water", the
amenity names), unlike all five medallion sites and the step badge. In dark, `--riv-accent-ink` on
the water fill is **1.37:1** and `--riv-card-ink` (`#f2f7fa`) on the tag fill is **~1.0:1**.

**Ledger correction this forces:** `chip-fills.ts` currently calls the amenity chips "class S of the
colour-literal audit". They are not — class S is the *nine-state* `status-chip` palette, a design
pass; a two-variant tag whose ink+fill+border sit on themeable hosts is class F's shape exactly.
Corrected in phase 5.

- [x] **Step 1: Write the failing guard** — extend `fixed-fill-token-skins.contrast.spec.ts` with the
      amenity block, including the AA assertions for both variants (AC-4's non-decorative half).
- [x] **Step 2: Run it, verify it fails** — `npm test -- --run fixed-fill-token-skins` → FAIL on the
      six undeclared tokens.
- [x] **Step 3: Minimal implementation** — six declarations + six `@theme inline` rows + six mirrors;
      migrate `amenity-chip.ts`'s `computed()` ternary, retaining the `amenity-chip` and
      `amenity-chip--water` marker classes; give `chip-fills.ts`'s two `DESCRIPTIVE_CHIPS` recipes
      their `fillClass`, reading the values from the mirrors (the #854 `SEMANTIC_CHIP` precedent), and
      correct its "class S" docblock sentence.
      **Two follow-ons the phase surfaced:** `ChipFill` needed an **`inkClass`** to match `fillClass`
      — `SEMANTIC_CHIP`'s ink is the static `text-white`, so #854 never needed the field, and
      `amenity-chip.spec.ts` was interpolating `text-[${ink}]`. With both fields present the recipe
      stays the single source and no assertion in that spec had to be rewritten (the
      `semantic-chip.spec.ts` `?? bg-[…]` idiom, extended). And `solid-fill-tokens`' `SURVIVORS`
      dropped its `shared/amenity-chip.ts` row — phase 2's share of AC-7.
- [x] **Step 4: Run it, verify it passes** — `npm test -- --run fixed-fill-token-skins amenities amenity-chip venue-map` → PASS
- [x] **Step 5: Commit** — `git commit -m "Give the amenity chip's two variants a theme-invariant token family (#858)"`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — The dialog step-badge family

**Files:** Modify `src/tailwind.css`, `src/testing/glass-tokens.ts`,
`src/app/booking/booking-dialog.ts`, `src/app/shared/fixed-fill-token-skins.contrast.spec.ts`

**The family** — two tokens, two states, one site, and **deliberately asymmetric**, because the two
states are pinned from opposite directions (both directions the `--riv-solid-btn-*` /
`--riv-solid-fill-*` pair of precedents already names):

| Token | Value | Why only one half | Measured |
|---|---|---|---|
| `--riv-step-active-ink` | `#0a5f74` | the fill is `bg-white`, which already cannot theme, so it pins the ink and needs no token of its own | **7.24:1** on white |
| `--riv-step-idle-fill` | `#2c7789` | the ink is `text-white`, which already cannot theme, so it pins the fill | **5.11:1** white on it |

In dark, `--riv-accent-ink` on the active white fill is **1.65:1**. The badge is `aria-hidden` (the
sibling `.step-label` carries the meaning), so it owes no AA assertion — stated, not invented.

- [ ] **Step 1: Write the failing guard** — extend `fixed-fill-token-skins.contrast.spec.ts` with the
      step block and the asymmetry's reason as a test-name-level assertion of the exemption.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- --run fixed-fill-token-skins` → FAIL on the two undeclared tokens.
- [ ] **Step 3: Minimal implementation** — two declarations + two `@theme inline` rows + two mirrors;
      migrate the `[class]` ternary, retaining `.step-num` and the existing explanatory comment
      (updated so it names the tokens rather than the raw hexes).
- [ ] **Step 4: Run it, verify it passes** — `npm test -- --run fixed-fill-token-skins booking-dialog` → PASS
- [ ] **Step 5: Commit** — `git commit -m "Give the booking dialog's step badge a theme-invariant token pair (#858)"`
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — The forced-dark computed-style e2e

**Files:** Create `frontend/e2e/fixed-fill-state-skins.e2e.ts`

**Suite placement:** the **mocked, CI-safe** suite (`frontend/e2e/`), not `e2e/real-backend/` — it
needs no live backend, and it is the check CI runs. The `form-error-token-skin.e2e.ts` /
`console-negative-ink.e2e.ts` precedents sit there for the same reason.

**Why this phase cannot be folded into the unit guard:** the unit spec reads `tailwind.css` as text —
a regex over a stylesheet. Only a real render can see (a) a token declared without its `@theme inline`
row, where the class stays in the markup and the paint silently does not change, and (b) the cascade
actually resolving under `data-riv-theme="dark"`. `shared/amenity-chip.ts` and
`shared/failure-panel.ts` are mounted by hosts of differing themes, so this is the check that matters.

- [ ] **Step 1: Write the spec** — three tests: AC-6's CSSOM utility-generation sweep over all
      fifteen tokens; the three skins' `toHaveCSS` under the default theme; the same three under
      `localStorage.setItem('riviera-theme', 'dark')` with `html[data-riv-theme=dark]` asserted first.
- [ ] **Step 2: Run it** — `npm run test:e2e:a11y -- fixed-fill-state-skins` → PASS
- [ ] **Step 3: Mutation-check it** (AC-5 says "mutation-checked" — a green e2e that would stay green
      under a broken token proves nothing). Temporarily add
      `[data-riv-theme='dark'] { --riv-medallion-positive-ink: #7cd7e8; }` to `tailwind.css`, re-run →
      the dark test must **FAIL**; then revert and re-run → PASS. Record both outcomes in the log.
- [ ] **Step 4: Commit** — `git commit -m "Prove the three fixed-fill skins hold under a forced dark theme (#858)"`
- [ ] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Phase 5 — Ledger, follow-up issues, close-out

**Files:** Modify `docs/design/colour-literal-token-audit.md`

- [ ] **Step 1: F-3's row → `done`, with the how-many-pairs answer** (AC-8): three families cut by
      form; the ternary-atomicity rule; the five-not-three `aria-hidden` correction; the amenity chip
      as the only AA-owing member; `request-confirmation` found by the mechanism sweep. n corrected
      6 → 15 positions across 8 sites.
- [ ] **Step 2: Correct class R's `#0a5f74` row** to the 3-fills / 4-inks split (the three fills are
      #854/#861's; of the four inks, three are now `--riv-medallion-positive-ink`,
      `--riv-amenity-water-ink` and `--riv-step-active-ink`, and the fourth is `booking-dialog:79`'s
      gradient stop, which stays with `--riv-cta-grad`). Correct the class-R `#a3372a` row to note
      that `failure-panel` and `booking-pay` left for `--riv-medallion-negative-ink`, leaving
      `payouts-tab` (#852) as the only remaining `OUT_OF_FAMILY` entry.
- [ ] **Step 3: Retire class S's `shared/amenity-chip.ts` row** — a two-variant tag is class F's
      shape, not a nine-state palette design pass. Its five distinct values are now tokenised.
- [ ] **Step 4: File three new rows + follow-up issues** for what the sweep surfaced and this slice
      deliberately did not take: (a) the **amber notice-banner** class-F pair (`withheld-email-notice`
      + the two legal pages, `#fcf0d9`/`#8a5410` — the medallion's values on a different form, with
      accessible text so it *does* owe AA); (b) **`shared/outcome-card.ts`'s two tone glyphs** — the
      medallion form painted from themed tokens and an `/opacity` tint, whose convergence onto
      `--riv-medallion-*` is a **visual** decision; (c) `operator/requests-tab.html:94`'s green
      medallion, noted as class O under #852 rather than a new row if #852 already covers it.
- [ ] **Step 5: `riviera-docs-freshness`** over the slice's range — the counting sweep matters here:
      the ledger's "five classes" prose, `riviera-tailwind`'s §Styling-across-the-themes worked-example
      list (which names #850 as *the* example and now has four more), and any doc saying "the two
      theme-invariant families".
- [ ] **Step 6: Finalize the Execution status** — stage pointer DONE, phase rows ✅ with commits,
      Open Questions empty, risk rows closed, AC pin-names matching the shipped tests, and
      `merged via PR #NN` (never a merge SHA).
- [ ] **Step 7: Run the file-structure guard** — `node scripts/check-plan-file-structure.mjs --diff origin/main`
      with this plan doc **staged**, → clean.
- [ ] **Step 8: Commit** — `git commit -m "Record the fixed-fill state skins in the colour-literal ledger (#858)"`

---

## Generalization-audit log

> Append-only. **Population** names the mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-01 | plan — issue-intake grill | **The medallion FORM**, not the ticket's value list: an element that is `rounded-full`, centred by flex, sized ~52–66px, holding a decorative glyph. The ticket enumerated by *value* (`#0a5f74`, `#a3372a`), which is what hid the amber twin. | `grep -rn "rounded-full" src/app --include=*.ts --include=*.html \| grep -v 'spec\.ts' \| grep -E "items-center justify-center\|h-1[0-9]\|size-1[0-9]\|h-\[[5-9][0-9]px\]\|w-14\|h-14"` | 6 medallion-form sites: `booking-confirmation:41`, `booking-pay:112`, `booking-pay:210`, `failure-panel:27`, **`request-confirmation:15`** (new), `outcome-card:60` (new); plus `requests-tab.html:94` at 52px | **Fix 5**: the four the ticket named + `request-confirmation:15`, the amber twin of `booking-pay:114`'s waiting branch — omitting it would tokenise one state in one file and leave it literal in its twin. **Skip 2 with reason**: `outcome-card` (already themed-token-painted + an `/opacity` tint → convergence is a *visual* change, Non-goal + follow-up issue) and `requests-tab` (class O tints inside the porcelain-pinned console → no drift to fix). |
| 2026-09-01 | plan — issue-intake grill | **Every remaining home of the five migrated values**, to bound the literal sweep (R-2): the roles `#fcf0d9`, `#8a5410`, `#0a5f74`, `#a3372a` and `#2c7789` still legitimately paint after this slice. | `for v in d9f2f7 f7e8e4 eecdc4 fcf0d9 8a5410 d7eef4 b9e0ea eef2f4 dbe4e7 2f4a54 2c7789 0a5f74 a3372a; do grep -rn "$v" src/app --include=*.ts --include=*.html \| grep -v '\.spec\.ts'; done` | `withheld-email-notice.ts:29`, `privacy-policy.html`, `terms-of-service.html` (amber notice banner); `status-chip.ts:10`, `booking-view.ts:84` (class S / a card-glass eyebrow); `set-editor.html:53`, `layout-editor.html:44`, `booking-dialog.ts:79` (fills + gradient, #854's); `payouts-tab.html:236` (#852's tints) | **Skip all, and pin them positively.** AC-3's second test asserts these still paint their literals, so the sweep cannot quietly over-reach — the `OUT_OF_FAMILY` mechanism #851 invented, reused. The notice-banner trio becomes a new ledger row + issue (phase 5). |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `npm test -- --run fixed-fill-token-skins` → the themed-alternative bound tests pass. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `npm test -- --run fixed-fill-token-skins` → single-declaration + base-block + mirrored-value tests pass for all 15. Verified at commit `<sha>`.
- [ ] **AC-3:** Run `npm test -- --run fixed-fill-token-skins` → both sweep tests pass. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `npm test -- --run amenities fixed-fill-token-skins` → both chip variants clear AA; the six exemptions are stated. Verified at commit `<sha>`.
- [ ] **AC-5:** Run `npm run test:e2e:a11y -- fixed-fill-state-skins` → the forced-dark test passes, and failed under the phase-4 mutation. Verified at commit `<sha>`.
- [ ] **AC-6:** Same command → the CSSOM utility-generation test passes for all 15. Verified at commit `<sha>`.
- [ ] **AC-7:** Run `npm test -- --run solid-btn-tokens` → green with the one-entry array. Verified at commit `<sha>`.
- [ ] **AC-8:** Review-gate inspection of `docs/design/colour-literal-token-audit.md`. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2) — no booking/set/date path touched.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section justified N/A (invariant #11) — no `platform/` file touched.
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met: marker classes retained, no `@apply`, tokens consumed through named
      utilities, no theme named in any component, no new SCSS.
- [ ] `npm run lint` + `npm run format:check` clean.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — plan doc's final state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `references/pr-gates.md` §1 ladder *plus* `riviera-review-overlay`.
