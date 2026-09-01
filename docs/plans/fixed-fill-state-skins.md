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
| R-1 | ~~A token is declared but its `@theme inline` row is forgotten → the utility never generates, the class sits inert in the markup and the paint silently reverts to inherited/transparent. No unit spec can see this. | med | high | AC-6's CSSOM check walks `document.styleSheets` for each expected `.bg-riv-*`/`.text-riv-*`/`.border-riv-*` selector — the #850 precedent, kept verbatim | agent | **closed** — phase 4, and mutation-checked |
| R-2 | ~~The literal sweep (AC-3) matches **by value** and so fails on the eight deliberately-untouched homes of `#0a5f74`, `#a3372a`, `#8a5410` and `#fcf0d9` — or, worse, tempts the implementer to migrate them | high | med | Sweep **by role**, the #850 `LITERAL_ROLES` pattern: `text-[#0a5f74]` not `#0a5f74`; and pair it with a positive `OUT_OF_FAMILY`-style assertion (AC-3's second test) that the out-of-scope homes still paint theirs | agent | **closed** — phase 1, where a first draft of the sweep *did* over-reach onto the notice banners and forced the exclusive-vs-site-scoped split now in the spec |
| R-3 | A positive over-reach guard goes red the moment a listed file stops painting the value it pins | **certain** | high | AC-7: narrow the array *and* the docblock prose in the same commit as the migration. #864's hand-off comment named **one** such guard (`solid-btn-tokens`' `OUT_OF_FAMILY`); phase 1's regression run found a **second** the plan had not anticipated — `solid-fill-tokens`' `SURVIVORS`, #854's `#0a5f74` list. Both are now in AC-7. The lesson generalises: after migrating a value, re-run the *whole* `src/app` unit suite, not only the specs the diff names — a positive guard lives in the file of the ticket that *kept* the value, not the one that moves it | agent | **closed** — phase 1 |
| R-4 | Sonar's **0 new duplicated blocks** bar: this slice writes the **sixth** copy of the `STYLESHEET`/`baseBlock()`/`declarationsOf()` guard helpers, ~15 identical lines | high | med | Phase 0 extracts them to `src/testing/stylesheet-tokens.ts` and moves the five existing guards onto it — the slice then *removes* duplication instead of adding the copy that would trip the gate | agent | **closed** — phase 0; the same 38 assertions pass before and after |
| R-5 | Naming collision: `--riv-chip-bg`/`--riv-chip-border` already exist for a *different* chip | med | low | The amenity family is named `--riv-amenity-*`, not `--riv-chip-*`; the medallion follows the `--riv-tile-<state>-<role>` triple precedent | agent | **closed** |
| R-6 | The `#fcf0d9`/`#8a5410` pair is tokenised as `--riv-medallion-waiting-*` while three other files keep it as a literal for a different form → a future reader reuses the medallion token on the notice banner | med | med | The reason is written **at the declaration** (the `--riv-console-negative-ink` docblock form), the out-of-family homes are pinned by AC-3's positive test, and the notice-banner family gets its own ledger row + follow-up issue | agent | **closed** |
| R-7 | Scope creep: the medallion form recurs in `outcome-card`, `requests-tab` and the notice banners | high | med | Non-goals fixes the boundary explicitly, each exclusion with its reason; the two genuine families found become ledger rows + issues rather than silent omissions | agent | **closed** |

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

**Stage pointer:** `sonar gate — review gate complete (6 findings, all fixed)`

**Next action:** pull the SonarCloud issue + duplication list for PR #867 (a green gate is not the
check) and clear every entry; then the merge close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — extract the token-guard helpers | ✅ | `fda89a8` |
| 1 — the outcome-medallion family | ✅ | `c72ff26` |
| 2 — the amenity-chip family | ✅ | `6a70f4c` |
| 3 — the dialog step-badge family | ✅ | `6923f7b` |
| 4 — the forced-dark computed-style e2e | ✅ | `89fcc50` |
| 5 — ledger + follow-up issues + close-out | ✅ | `f930000` · close-out completed in `e098350a` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI — `Repo hygiene (diff-scoped)`, red on every push; independently found by the review gate's CLAUDE.md agent | **RV-STYLE-1**: the slice wrote **12 multi-line inline comments** (4 in the e2e, 7 in the guard spec, 1 on `appFailureIcon`). Doc comments are exempt; `//` blocks inside a body are not | fixed — `failure-panel`'s became a TSDoc block on the directive (which is what it always was); the guard spec's and the e2e's substance moved into the file docblocks and the rest shortened to one line |
| F-2 | Review gate — prior-PR-comments agent | `testing/chip-fills.ts`'s `ChipFill.fillClass` TSDoc still called the amenity chips "still a literal … class S of the colour-literal audit", which this PR's own diff falsifies twice. **A phase-2 edit to that exact sentence silently no-op'd** — its `str.replace` carried no assertion, unlike every other edit in the slice. Recurrence of PR #862's finding #1: a declaration comment the change made false | fixed — sentence rewritten; a repo-wide sweep confirms it was the only surviving stale claim |
| F-3 | Review gate — code-comments agent | **A glyph claimed in four places is the wrong one.** `request-confirmation`'s medallion renders **✉**, not ⏳ — the ⏳ is its *neighbouring info-box icon*. Claimed as ⏳ in `tailwind.css`, `glass-tokens.ts`, the plan doc, and an e2e comment that **contradicted its own sibling comment fifteen lines below**, which correctly said "the badge's glyph is the envelope". Nothing pinned it: the test matches ✉ and passes | fixed — all four corrected, and the docblocks now say the glyph is per site and carries no meaning (every one is `aria-hidden`), so the claim stops being load-bearing |
| F-4 | Review gate — code-comments agent | **A measured number is wrong by 0.02.** `DARK_CARD_INK` (`#f2f7fa`) over the amenity tag fill is **1.04:1**, not the 1.02:1 claimed in `tailwind.css`, `amenity-chip.ts`, `glass-tokens.ts` and both docs. Cause: the plan-stage measurement used `#eaf6f8` — a guess at the dark card ink — instead of reading the real `--riv-card-ink` from the stylesheet, and the wrong figure propagated. No test pins it (the bound only has to be *under* AA, which both figures are) | fixed — recomputed against the declared value and corrected in all five places; the agent independently re-derived the slice's other **15** ratios and found them exact |
| F-6 | Review gate — git-history agent | **The plan doc's own close-out gate was never run.** Phase 5's row said ✅ while its steps 6–8, all 8 AC-verification lines and the entire self-review checklist sat `- [ ]` with the template's literal `<sha>` placeholders. The sibling slices (#848/#864) both carry those sections fully ticked with real SHAs and the note "every line below was run at the close-out commit". Sharpest part of the finding: this is **the same class as F-1 and F-2** — a status claim nothing asserts — occurring inside the register that records them | fixed — every AC re-run at `2baaa96` and recorded with its actual command and result; the checklist ticked honestly, with the two genuinely-open items (Sonar gate, `merged via PR #NN`) left to the close-out commit rather than pre-ticked |
| F-5 | Review gate — code-comments agent | The `--riv-solid-fill-*` docblock (#854/#861, untouched by this diff) says `#0a5f74` "still paints … three booking/ inks" — true of the value, but after this slice those three are named tokens, so a reader following the sentence hunts for literals that are gone. A docs-freshness miss: my sweep grepped for renamed identifiers and counts, not for sentences a *tokenisation* makes misleading | fixed — the sentence now names where the three went (`--riv-medallion-positive-ink` ×2, `--riv-step-active-ink`) and that the value survives through a declaration rather than a literal |

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
- `frontend/src/app/booking/request-confirmation.ts` — the ✉ medallion (`CLS.badge`) — its waiting state, not the ⏳ its neighbouring info box carries
- `frontend/src/app/booking/booking-dialog.ts` — the step-badge ternary
- `frontend/src/app/shared/fixed-fill-token-skins.contrast.spec.ts` — **new**: the single guard for all three families
- `frontend/src/app/booking/solid-btn-tokens.contrast.spec.ts` — narrow `OUT_OF_FAMILY` to one entry + the docblock prose (AC-7); move onto the extracted helpers
- `frontend/src/app/booking/form-error-tokens.contrast.spec.ts` — move onto the extracted helpers
- `frontend/src/app/shared/solid-fill-tokens.contrast.spec.ts` — move onto the extracted helpers; narrow the `SURVIVORS` `#0a5f74` list (AC-7's second half)
- `frontend/src/app/shared/amenity-chip.spec.ts` — read the recipe's `fillClass`/`inkClass` instead of interpolating the hex
- `.claude/skills/riviera-tailwind/SKILL.md` — §Styling-across-the-themes gains the ternary-atomicity rule, one sentence (docs-freshness)
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

- [x] **Step 1: Write the failing guard** — extend `fixed-fill-token-skins.contrast.spec.ts` with the
      step block and the asymmetry's reason as a test-name-level assertion of the exemption.
- [x] **Step 2: Run it, verify it fails** — `npm test -- --run fixed-fill-token-skins` → FAIL on the two undeclared tokens.
- [x] **Step 3: Minimal implementation** — two declarations + two `@theme inline` rows + two mirrors;
      migrate the `[class]` ternary, retaining `.step-num` and the existing explanatory comment
      (updated so it names the tokens rather than the raw hexes).
- [x] **Step 4: Run it, verify it passes** — `npm test -- --run fixed-fill-token-skins booking-dialog` → PASS
- [x] **Step 5: Commit** — `git commit -m "Give the booking dialog's step badge a theme-invariant token pair (#858)"`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

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

- [x] **Step 1: Write the spec** — landed as **six tests × two themes = 12**, not "three tests",
      because the natural shape here is a `for (const theme of ['porcelain', 'dark'])` loop over the
      whole describe: every assertion then runs against the same expected value in both legs, so a
      skin that *moved* between them fails rather than needing a separate dark-only test. The six:
      AC-6's CSSOM utility sweep over all fifteen tokens; the amenity chip's two variants; the step
      badge's two states; the positive medallion (via the confirmation); the **waiting** medallion
      (via `request-confirmation`, the REQUEST-mode `202` leg — without it the waiting pair would be
      declared and mapped but never proven to reach a rendered element); and the negative medallion
      via `.failure-icon`, `shared/`'s own directive.
- [x] **Step 2: Run it** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- fixed-fill-state-skins` → **12 passed** (the env var is `riviera-local-debug`'s cloud-session recipe for the mocked config)
- [x] **Step 3: Mutation-check it.** Added `--riv-medallion-positive-ink: #7cd7e8` and
      `--riv-amenity-water-ink: #7cd7e8` to the `[data-riv-theme='dark']` block. Result: **3 dark
      tests failed** (the token-declaration sweep, the amenity chip, the confirmation medallion) and
      **all 6 porcelain tests still passed** — which is the half that matters, since it shows the
      dark leg observes the cascade rather than passing vacuously. The **unit** guard caught it too:
      `declares each token exactly once` → `expected [ '#0a5f74', '#7cd7e8' ] to have a length of 1`.
      Reverted with `git checkout src/tailwind.css` (a hand-revert left a stray blank line), re-run →
      12 passed, 15 unit assertions passed, `git diff` clean.
- [x] **Step 4: Commit** — `git commit -m "Prove the three fixed-fill skins hold under a forced dark theme (#858)"`
- [x] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Phase 5 — Ledger, follow-up issues, close-out

**Files:** Modify `docs/design/colour-literal-token-audit.md`

- [x] **Step 1: F-3's row → `done`, with the how-many-pairs answer** (AC-8): three families cut by
      form; the ternary-atomicity rule; the five-not-three `aria-hidden` correction; the amenity chip
      as the only AA-owing member; `request-confirmation` found by the mechanism sweep. n corrected
      6 → 15 positions across 8 sites.
- [x] **Step 2: Correct class R's `#0a5f74` row** to the 3-fills / 4-inks split (the three fills are
      #854/#861's; of the four inks, three are now `--riv-medallion-positive-ink`,
      `--riv-amenity-water-ink` and `--riv-step-active-ink`, and the fourth is `booking-dialog:79`'s
      gradient stop, which stays with `--riv-cta-grad`). Correct the class-R `#a3372a` row to note
      that `failure-panel` and `booking-pay` left for `--riv-medallion-negative-ink`, leaving
      `payouts-tab` (#852) as the only remaining `OUT_OF_FAMILY` entry.
- [x] **Step 3: Retire class S's `shared/amenity-chip.ts` row** — a two-variant tag is class F's
      shape, not a nine-state palette design pass. Its five distinct values are now tokenised.
- [x] **Step 4: Filed as two rows + two issues** — **#868** (F-4, the amber notice banner: the
      medallion's exact waiting pair on a different form, with accessible text, so unlike the
      medallion it *does* owe AA; its PR must also drop those three rows from this slice's
      `OUT_OF_FAMILY` array or that guard goes red) and **#869** (F-5, `shared/outcome-card.ts`'s
      tone glyphs: the medallion form painted a third way, whose convergence is a **visual**
      decision, so `question`/`area:design` rather than `ready-for-agent`). The third candidate —
      `operator/requests-tab.html:94`'s green medallion — got a Non-goal line instead of a row: it is
      `/opacity` tints already covered by #852, inside the porcelain-pinned console, so it has no
      drift to fix.
- [x] **Step 5: `riviera-docs-freshness`** — **ran** over `origin/main..claude/sdlc-858-d5rsea`,
      **2 findings, 1 patched, 1 rejected as noise**:
      1. `.claude/skills/riviera-tailwind/SKILL.md:190` — §Styling-across-the-themes enumerated three
         grounds for theme-invariance but carried no rule for the **unit** when the skin is stateful.
         Patched with one sentence: take a per-state class ternary whole.
      2. `.claude/skills/riviera-sdlc/references/pr-gates.md:199` — considered and **rejected**. The
         `failure-icon` css:S7924 citation is still accurate; noting that the solid value moved to a
         token declaration adds a fact the reader never acts on. A skill earns its length by
         changing what the next agent *does*, so a patch that only makes a citation more precise is
         a cost with no payoff — this one was written, then reverted.
      The **counting sweep** (`the two|three …` narrowed to token/theme/family/chip vocabulary) found
      **no** falsified statement: the four hits are ADR-0005's refund pair, `riviera-frontend`'s
      two-suite e2e split and two-place token registry, and two `riviera-stripe-payments` sentences —
      all unrelated subjects, all still true. `core/theme.ts` carries no per-token rows, so the
      "registry lives in two places" sentence is unaffected by a token addition.
- [x] **Step 6: Finalize the Execution status** — stage pointer DONE, phase rows ✅ with commits,
      Open Questions empty, risk rows closed, AC pin-names matching the shipped tests, and
      `merged via PR #NN` (never a merge SHA).
- [x] **Step 7: Run the file-structure guard** — `node scripts/check-plan-file-structure.mjs --diff origin/main`
      with this plan doc **staged**, → clean.
- [x] **Step 8: Commit** — `git commit -m "Record the fixed-fill state skins in the colour-literal ledger (#858)"`

---

## Generalization-audit log

> Append-only. **Population** names the mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-01 | plan — issue-intake grill | **The medallion FORM**, not the ticket's value list: an element that is `rounded-full`, centred by flex, sized ~52–66px, holding a decorative glyph. The ticket enumerated by *value* (`#0a5f74`, `#a3372a`), which is what hid the amber twin. | `grep -rn "rounded-full" src/app --include=*.ts --include=*.html \| grep -v 'spec\.ts' \| grep -E "items-center justify-center\|h-1[0-9]\|size-1[0-9]\|h-\[[5-9][0-9]px\]\|w-14\|h-14"` | 6 medallion-form sites: `booking-confirmation:41`, `booking-pay:112`, `booking-pay:210`, `failure-panel:27`, **`request-confirmation:15`** (new), `outcome-card:60` (new); plus `requests-tab.html:94` at 52px | **Fix 5**: the four the ticket named + `request-confirmation:15`, the amber twin of `booking-pay:114`'s waiting branch — omitting it would tokenise one state in one file and leave it literal in its twin. **Skip 2 with reason**: `outcome-card` (already themed-token-painted + an `/opacity` tint → convergence is a *visual* change, Non-goal + follow-up issue) and `requests-tab` (class O tints inside the porcelain-pinned console → no drift to fix). |
| 2026-09-01 | plan — issue-intake grill | **Every remaining home of the five migrated values**, to bound the literal sweep (R-2): the roles `#fcf0d9`, `#8a5410`, `#0a5f74`, `#a3372a` and `#2c7789` still legitimately paint after this slice. | `for v in d9f2f7 f7e8e4 eecdc4 fcf0d9 8a5410 d7eef4 b9e0ea eef2f4 dbe4e7 2f4a54 2c7789 0a5f74 a3372a; do grep -rn "$v" src/app --include=*.ts --include=*.html \| grep -v '\.spec\.ts'; done` | `withheld-email-notice.ts:29`, `privacy-policy.html`, `terms-of-service.html` (amber notice banner); `status-chip.ts:10`, `booking-view.ts:84` (class S / a card-glass eyebrow); `set-editor.html:53`, `layout-editor.html:44`, `booking-dialog.ts:79` (fills + gradient, #854's); `payouts-tab.html:236` (#852's tints) | **Skip all, and pin them positively.** AC-3's second test asserts these still paint their literals, so the sweep cannot quietly over-reach — the `OUT_OF_FAMILY` mechanism #851 invented, reused. The notice-banner trio becomes a new ledger row + issue (phase 5). |

---

## Acceptance-criteria verification (final)

> Every line below was **run at the close-out commit**, not carried forward from the phase that
> wrote it — the sibling-slice discipline (`console-negative-ink-token.md`,
> `console-accent-ink-token.md`). Where a command's scope differs from what the phase ran, the
> wider one is recorded.

- [x] **AC-1:** `npx ng test --watch=false --include="src/app/shared/fixed-fill-token-skins.contrast.spec.ts"` →
      the three themed-alternative bound tests pass (medallion 1.41/1.63/1.54, amenity 1.37/1.04,
      step 1.65 — all under AA). Verified at `2baaa96`, after F-4 corrected the amenity tag bound
      from a mis-measured 1.02 to the declared value's 1.04.
- [x] **AC-2:** same command → `declares each token exactly once` + `…in the base block` +
      `…the values this test mirror carries` pass for all 15. Verified at `2baaa96`; independently
      re-verified tree-wide by the review gate's history agent (no stray dark-theme override).
- [x] **AC-3:** same command → `leaves no component anywhere painting the three now-exclusive
      literals` and `leaves no migrated site painting its own literals, while keeping what it must`
      and `leaves the out-of-family homes of these values untouched` all pass. Verified at `2baaa96`.
- [x] **AC-4:** `npx ng test --watch=false --include="src/app/shared/amenities.contrast.spec.ts" --include="src/app/shared/fixed-fill-token-skins.contrast.spec.ts"` →
      both chip variants clear AA (8.37 / 6.00); the six `aria-hidden` exemptions are asserted
      against the sources by `states the aria-hidden exemption…`. Verified at `2baaa96`.
- [x] **AC-5:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- fixed-fill-state-skins`
      → **12 passed** (6 surfaces × 2 themes). Mutation-checked at phase 4: a dark override on two
      inks failed 3 dark tests while all 6 porcelain tests kept passing. Verified at `2baaa96`.
- [x] **AC-6:** same command → `every registered token is declared and generates its utility` passes
      for all 15 in both themes. Verified at `2baaa96`.
- [x] **AC-7:** `npx ng test --watch=false --include="src/app/booking/solid-btn-tokens.contrast.spec.ts" --include="src/app/shared/solid-fill-tokens.contrast.spec.ts"`
      → green with `OUT_OF_FAMILY` at one entry and `SURVIVORS` minus its three `#0a5f74` rows.
      Both narrowings independently re-verified tree-wide by the review gate's history agent.
      Verified at `2baaa96`.
- [x] **AC-8:** ledger inspected at `2baaa96`: F-3 `done — #858, PR #867` with the how-many-pairs
      note; class R's `#0a5f74` row carries the 3-fills/4-inks split and its `#a3372a` row the
      fourth-role correction; class S's amenity row retired; F-4/F-5 rows filed as **#868**/**#869**.
      Prose has no executable pin — stated, not implied.

**Whole-suite runs at the close-out commit:** `npx ng test --watch=false` → **2160 passed** ·
`npm run test:e2e:a11y` → **358 passed** · `npm run lint` → 0 errors · `npm run format:check` → clean ·
`npm run build` → succeeded · all five `scripts/check-*.mjs` guards → clean.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test (AC-8's pin is prose inspection, stated as such).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section justified N/A (invariant #2) — no booking/set/date path touched.
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section justified N/A (invariant #11) — no `platform/` file touched.
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — N/A.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met: marker classes retained (`amenity-chip`, `amenity-chip--water`,
      `failure-icon`, `step-num`), no `@apply`, tokens consumed through named utilities, no theme
      named in any component, no new SCSS. **RV-STYLE-1 was violated and is fixed** (finding F-1).
- [x] `npm run lint` + `npm run format:check` clean (the one ESLint warning is pre-existing — confirmed by stashing the diff).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows (R-1..R-7 all closed); Open Questions empty — its four entries are all under `### Resolved`.
- [x] **Close-out written in THIS PR** — plan doc's final state is committed here; the
      `merged via PR #867` line lands with the last pre-merge commit.
- [x] **The review gate ran in full** — `Skill("code-review:code-review")` (rung 1 of the
      `references/pr-gates.md` §1 ladder) with `riviera-review-overlay` layered on: the 5-agent
      fan-out ran and returned **6 findings, all fixed** (see the register). Not the overlay alone.
