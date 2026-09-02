# Console sign-out hover fill: a role, a token, and a recorded non-text-contrast ground

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Retire `operator-actions.ts:54`'s `hover:bg-[#eef1f2]` — the tree's only
`hover:bg-[#hex]` literal — onto `--riv-console-btn-hover`, the third member of the console
button's own skin, and write down the 1.4.11 ground that position has never carried.

**Architecture:** The single most significant decision is a **refusal to merge**: this fill
does *not* join `--riv-solid-btn-{fill,hover}`, the same shape one layer over. Three grounds,
each mechanical rather than aesthetic — (a) the two skins' resting **and** hover fills differ
(`#ffffff`/`#eef1f2` vs `#f4f6f7`/`#e7ebec`), so adopting the pair moves **two** painted
positions to migrate one: a **repaint**, which #849 established wants its own design slice and
not a migration whose claim is that no pixel moves; (b) the two are **inverse constructions** — a
grey chip with a *white* `0.7` bevel on themeable card glass, against a white pill with a
*dark* `rgba(12,42,51,0.14)` hairline on porcelain header glass — so borrowing the fills while
keeping opposite borders and inks would leave a family whose only shared member is a fill,
which is grouping by value, the thing class R exists to reject; and (c) their
theme-invariance **grounds** differ (solid-btn is pinned because a themed ink over its fixed
fill drifts light-on-light at 1.69:1; console-btn is pinned because its whole population sits
under a porcelain-pinned host, so a dark branch is unreachable), and #864 settled that two
families share naming only where their distinctness arguments share something. So the slice
registers one token beside `--riv-console-btn-border`, and asserts the merge it refused.

**Persistence:** N/A — frontend-only, no backend code and no schema change (invariants #1,
#12 untouched).

**Source of intent:** [#887](https://github.com/ivopogace/riviera-sunbed-booking/issues/887)
(class **R** residue in `docs/design/colour-literal-token-audit.md`), parent
[#836](https://github.com/ivopogace/riviera-sunbed-booking/issues/836), surfaced by #849's
generalization sweep (PR #886).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the
population is exactly 1 by mechanism, that no open PR or session branch overlaps, that #849's
close-out is complete (issue closed via PR #886, parent #836 closed), and that both
`app-operator-actions` mount sites *are* porcelain-pinned, so #849's "dark branch unreachable"
ground still holds for the family this token joins) · `riviera-plan-doc` (this template —
forced the seam-per-AC split across stylesheet source / contrast mirror / real render, and the
Non-goals fence around the resting `bg-white` and the `--riv-solid-btn-*` pair) · `tdd` (each
guard is written red against the un-migrated markup before the token exists) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) · `riviera-docs-freshness`
(**ran** over `origin/main...HEAD` at close-out, **0 findings** — the counting sweep's two hits are
both still true: `riviera-frontend`'s "token registry lives in two places" is per-THEME
(`core/theme.ts` carries the three switcher options, not per-token rows, so a new token owes it
nothing), and `riviera-tailwind`'s "three themes" is untouched. The two maintained design docs are
corrected in place by this slice rather than left to the audit) ·
`riviera-tailwind` ("group such a family by form, not value; reject a coincidental token on its
role before its value"; a theme-pinned-subtree token is declared once in the base block with
the reason at the declaration; `hover:` already compiles under `@media (hover:hover)` in v4) ·
`riviera-frontend` (the family's guard stays in `shared/`, its mirror in
`testing/glass-tokens.ts`, its render proof in the CI-safe mocked suite; a new token gets a
`@theme inline` mapping) · `angular-developer` + the angular-cli MCP `get_best_practices` and `search_documentation`
(**added at the review gate, finding F-1** — the routing table's Angular-frontend row fires on any
component styling change and this line had skipped it. Re-vetted `operator-actions.ts` against the
v22 guide: signal `input.required()`/`output()`, `computed()`, `inject()`, inline template, `host`
object, no `ngClass`/`ngStyle`, no `standalone: true`, no explicit `OnPush`. The diff edits a static
`class` attribute only, so nothing in the guide is implicated and no code changed — recorded because
"the row did not apply" and "the row was never run" are indistinguishable in a diff, which is the
whole point of RV-PROC-1. A later verification pass added `search_documentation` + angular.dev: the
utility reaches this component's inline template only because emulated encapsulation scopes a
component's OWN `styles`/`styleUrl` and not a global stylesheet — "global styles defined outside of
a component may still affect elements inside a component with emulated encapsulation" — and the
button's `class` is fully static, so Angular's no-guaranteed-order caveat for merged class bindings
does not reach it) · `playwright-cli` (the hovered-box assertion in the mocked suite) ·
`riviera-local-debug` (scoped Vitest/Playwright invocations, `PW_CHROMIUM_EXECUTABLE` for the
mocked config in this cloud session)

**Branch:** `claude/sdlc-887-t4imk9` — the cloud session's designated remote branch stands in
for `feature/<slug>` per `riviera-sdlc`'s remote addendum.

---

## Acceptance criteria (testable)

Every AC observes through one of three seams, because the three failures this slice can have
are each invisible to the other two: the **stylesheet source** (a dark override or a silent
collapse onto the solid-btn pair — no ratio computed from a mirror can see either), the
**contrast mirror** (the maths), and the **computed style in a real render** (a token declared
without its `@theme inline` row generates no utility at all; the class stays in the markup and
the paint silently does not change — and a hover fill compiles to `.hover\:bg-…:hover`, so no
bare-class-selector sweep can see it either).

- [x] **AC-1:** Given the console button's skin and the same-shaped `--riv-solid-btn-{fill,hover}`
      pair, when the slice lands, then `--riv-solid-btn-fill` and `--riv-solid-btn-hover` are
      byte-identical to their pre-slice values **and** neither equals the console button's
      resting or hover fill — so "we chose our own token" and "we quietly collapsed onto the
      tourist pair" cannot look the same in a diff. *Seam:* `src/tailwind.css` read as text via
      `testing/stylesheet-tokens.ts` · *Pinned by:*
      `fixed-ink-tokens.contrast.spec.ts` › `the console button hover fill (#887)` › `refuses
      the solid-btn pair on its values, not on assertion`
- [x] **AC-2:** Given `--riv-console-btn-hover`, when the stylesheet is read, then it is declared
      **exactly once**, in the base block, with the value `#eef1f2`, and mapped in `@theme
      inline` as `--color-riv-console-btn-hover: var(--riv-console-btn-hover)` — the same four
      guards `--riv-console-btn-border` already carries. *Seam:* `src/tailwind.css` read as text
      · *Pinned by:* `fixed-ink-tokens.contrast.spec.ts` › `the stylesheet contract` (the four
      existing cases, with the token added to `CONSOLE_FAMILY`)
- [x] **AC-3:** Given `frontend/src`, when swept for the migrated literal, then no bare `#eef1f2`
      remains outside `*.spec.ts`, and `operator/operator-actions.ts` paints **this token's** named
      utility. *Seam:* the source sweep over the site list · *Pinned by:*
      `fixed-ink-tokens.contrast.spec.ts` › `the sites` › `%s paints no migrated literal` (with
      `#eef1f2` added to `MIGRATED_LITERALS`) for the negative half, and
      › `the console button hover fill (#887)` › `paints the hover fill through its named utility,
      not a literal` for the positive half. **Corrected at the review gate (F-2):** this AC first
      cited `the sites` › `%s paints its family` as the positive pin, which was wrong — that
      regex was already satisfied by the `border-riv-console-btn-border` the site carried before
      this slice, so it gave the migration zero signal. It is a per-site "some family is painted"
      check and structurally cannot say which; widening its alternation would not fix that, since
      one matching branch satisfies the whole regex.
- [x] **AC-4:** Given the operator console rendered in a real browser, when the sign-out button
      is **hovered**, then its computed `background-color` is `rgb(238, 241, 242)` — the one
      position no declaration sweep can reach. *Seam:* the rendered `oc-signout` box ·
      *Pinned by:* `e2e/fixed-ink-token-recut.e2e.ts` › `the console paints both hairlines, and
      the button's hover fill, from their own tokens (#849, #887)`
- [x] **AC-5:** Given the hover fill, when measured, then the button's label clears **AA** on it
      (13.29:1), and the two boundaries it forms — against the button's resting `#ffffff` fill
      (1.14:1) and against the porcelain header glass over each background stop (1.04–1.14:1) —
      are recorded **below 3:1**, so the exemption is a conclusion drawn from a measurement.
      *Seam:* the `testing/glass-tokens.ts` mirror + `testing/contrast.ts` maths · *Pinned by:*
      `fixed-ink-tokens.contrast.spec.ts` › `the console button hover fill (#887)` › `the label
      carries the identity at AA on the hovered fill` + `records that the hover state does not
      reach the 1.4.11 bar, so the exemption is load-bearing`
- [x] **AC-6:** Given the button's **resting** fill, when the slice lands, then it is still
      `bg-white` and has gained no token — #849's own answer on this same surface (it tokenised
      the hairlines bounding the console's white fills and left the fills alone), and the idiom
      of the other 11 `hover:bg-white`/`bg-white` sites in the tree. Asserted so the omission
      reads as a decision rather than a half-migrated skin. *Seam:* the source sweep ·
      *Pinned by:* `fixed-ink-tokens.contrast.spec.ts` › `the console button hover fill (#887)`
      › `leaves the resting fill as bg-white, the precedent of the surface it sits on`
- [x] **AC-7 (documentation, no test):** The ledger's class-R residue note for this position
      reads `done` with this PR, and `docs/design/non-text-contrast.md` carries the family row
      plus the state-vs-boundary reading the hover fill needs. Stated as untested rather than
      given a fake pin: it is verified by diff inspection at the Self-review checklist and by
      `riviera-docs-freshness` at close-out.

## Non-goals

- **Tokenising the resting `bg-white`.** AC-6 fences it: it is a Tailwind named colour, outside
  the ledger's population entirely, and #849 left the console's white fills alone on purpose.
- **Adopting, retuning or merging `--riv-solid-btn-{fill,hover}`.** AC-1 fences it. If those two
  skins should one day be one paint, that is a repaint with its own design decision and slice.
- **Adding a `focus-visible` ring to the sign-out button.** It carries none today and relies on
  the UA default; that is a real gap and a different question from this fill's role. Not
  claimed as ground for the 1.4.11 reading below, and not fixed here.
- **The two other open class-R rows** (the white inset-highlight ramp, the white `0.6` borders)
  and the calendar-popover repaint question #849 parked. Untouched.
- **A new rule in `non-text-contrast.md`.** The hover fill lands under the existing rule 2; the
  doc gains a row and the prose that makes the state-vs-boundary reading citable, not a fourth
  rule. (As built: the row, two paragraphs, and a three-line "general shape" note for the next
  state-coloured token — still rule 2, no new rule.)

## Behavior-parity ledger (retirement / replacement slices only)

N/A — no surface is retired or replaced. The one position changes how it is *authored*
(literal → named utility) and not what it paints: `#eef1f2` in, `rgb(238, 241, 242)` out,
asserted by AC-4 against the same value the literal produced.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The token is declared but its `@theme inline` row is forgotten — the utility never generates, the class stays in the markup, and the hover silently stops painting | med | high | AC-2's `@theme inline` guard **and** AC-4's hovered-box assertion; a hover fill has no bare class selector, so the render proof is the only one that can see it | agent | closed — phase 1, and **demonstrated rather than argued**: with the `@theme inline` row commented out the hovered box reads `rgb(255, 255, 255)` while the class string is untouched, exactly this row's failure mode |
| R-2 | A later slice adds a `[data-riv-theme='dark']` override for the token — every ratio computed from the mirror still passes, because the mirror is not the cascade | low | med | AC-2's single-declaration guard, which reads `tailwind.css` as text (`testing/stylesheet-tokens.ts`) | agent | closed — phase 0 |
| R-3 | A later sweep silently collapses this fill onto `--riv-solid-btn-hover`, repainting the console button and inheriting the tourist skin's grounds | med | med | AC-1 asserts the pair unchanged **and** unequal to this skin's fills; the refusal is written at the declaration | agent | closed — phase 0 |
| R-4 | A later 1.4.11 sweep reads the 1.04–1.14:1 hover boundary as a violation this slice introduced, and "fixes" it by darkening the fill | med | med | AC-5 records both ratios as measurements, and `non-text-contrast.md` gains the family row — #879's close-sales-trigger lesson: check what the outgoing value measured first | agent | closed — phase 2. The doc's "do not restate ratios here" rule turned the one prose comparison the paragraph wanted (this delta vs the settled solid-btn family's) into an assertion reading both sides out of `tailwind.css`, so retuning either family moves the claim rather than stranding a stale number |
| R-5 | Extending #849's spec and e2e files reads as scope creep into a closed slice | low | low | The family's home is where the family's guard is (`--riv-console-btn-border` lives in both files); both docstrings are updated to name #887 alongside #849, and the plan records the choice | agent | closed — phases 0–1 |
| R-6 | The e2e's `.hover()` races the `transition-colors` animation and reads the resting fill | low | med | Playwright's `toHaveCSS` retries until timeout, so it settles on the transitioned value; the solid-btn suite's hover assertions use exactly this shape | agent | closed — phase 1, green on the full-file run |

## Open questions / Assumptions

- **Assumption:** The `#eef1f2` value itself is correct as designed and this slice does not
  retune it — the whole claim is that no pixel moves. *Owner:* agent · *Resolves by:* AC-4,
  which asserts the post-migration render equals the value the literal produced.

### Resolved

- **Open question (grill):** does every `app-operator-actions` mount site sit under a
  porcelain-pinned host, or does `operator-chrome.ts` — which paints `bg-riv-header-glass` and
  `text-riv-ink`, both themeable — expose the white-on-white dark case that would make a
  theme-invariant token an unverifiable claim? **Resolved: yes, both are pinned.**
  `app.ts:49-50` binds `[attr.data-riv-theme]="shellChrome() === 'operator' ? 'porcelain' : null"`
  on the app host, which pins every `operatorChrome` route porcelain whatever the tourist theme
  is; the console pins its own host at `operator-console.ts:71-72`. So #849's ground carries to
  this token unchanged, and the single declaration is correct rather than lucky.
- **Open question (grill):** is the population really one? **Resolved: yes**, enumerated by
  mechanism — `grep -rho "hover:bg-[^ \"'\`]*" frontend/src --include=*.ts --include=*.html |
  sort | uniq -c` returns 16 distinct forms, of which 15 are tokens (`hover:bg-riv-*`) or
  Tailwind named colours with an optional `/opacity` (`hover:bg-white`, `hover:bg-white/90`,
  `hover:bg-black/70`, `hover:bg-transparent`) and one is `hover:bg-[#eef1f2]`.
- **Open question (grill):** does any registered token coincide with `#eef1f2`, making this a
  class-T assignment rather than class R? **Resolved: no.** The nearest is
  `--riv-amenity-tag-fill: #eef2f4`, a different value on a different surface. Class R's "no
  token at all" is right.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes one CSS custom property and one Angular
class string; it reads and writes no booking, set, or date, and touches no backend code.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/operator-actions.ts` | existing | standalone component (inline template) | unchanged — the diff is one class string | none |

**Standards:** unchanged. The component keeps its `input.required()`/`output()` signal APIs,
its `computed()` id map and its `class: 'contents'` host; nothing about its TypeScript moves.

## FE↔BE contract

N/A — no contract change.

## Sonar gate

Pulled from the API rather than read off the badge, and the zero confirmed real before being
believed (`pr-gates.md` §2: `api/issues/search` returns `total: 0` for an *unanalyzed* PR too).
On head `ef5ad8b`: `new_lines: 20` — so measures are populated and an analysis exists — with
`new_bugs`, `new_vulnerabilities`, `new_code_smells`, `new_security_hotspots`,
`new_duplicated_blocks` all **0**, `new_duplicated_lines_density` **0.0%**, `new_coverage`
**100.0%**, and the `SonarCloud Code Analysis` check-run concluded `success`. Issue list empty
(`total: 0`). Nothing to clear.

## Execution status

**Stage pointer:** `merge close-out — gates all green; awaiting the maintainer's merge decision`

**Next action:** None outstanding in the repo. Merging PR #889 deploys `main` to Render
(`deploy.yml`), so the merge itself is the maintainer's call; close-out steps 1–3 and 6 (issue
closed, epic tick, deferred findings, subscription) follow the merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the token, its guards and the migrated site | ✅ | `336d0fd` |
| 1 — the real-render hover proof | ✅ | `5fc12a2` |
| 2 — the ledger row and the 1.4.11 ground | ✅ | `c8549e3` |
| review-gate fix rounds (F-1..F-9) | ✅ | `0d8b922`, `2c7f875` |
| doc-verification round (F-10) | ✅ | `ef5ad8b` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (agent 1, CLAUDE.md/overlay pass) | **RV-PROC-1, Major.** The routing table's Angular-frontend row fires on any component styling change, and this diff edits `operator-actions.ts`'s class string — but *Skills consulted* listed neither `angular-developer` nor the angular-cli MCP. The gate's own remedy applies: load, re-vet, update the line | fixed — skill loaded, `get_best_practices` consulted for this workspace, `operator-actions.ts` re-vetted against the v22 guide (compliant; a static `class` attribute is outside everything the guide covers), *Skills consulted* updated with what it actually did |
| F-2 | review gate (agent 2, bug scan) | **Vacuous positive guard, Major.** AC-3 cited `the sites` › `%s paints its family` as proving the site paints the new utility. It does not: its regex `/-riv-(calendar\|banner\|console-card-border\|console-btn-border)-?/` was already satisfied by the pre-existing `border-riv-console-btn-border`, so it would pass unchanged if the migration were reverted. Exactly the ledger's "no positive still-painted-here list allowed to be empty" failure, one layer in: the list is non-empty but says nothing about this token | fixed — a token-specific positive (`paints the hover fill through its named utility, not a literal`) added to the `#887` describe, with its docstring recording why widening the shared regex is not the fix; AC-3 re-pointed at both halves |
| F-3 | review gate (agent 4, prior-PR feedback) | **Doc comment narrates decision history, Major.** The new `--riv-console-btn-hover` declaration ran 19 lines against its sibling's 8, restating the whole refusal argument that already lives in this plan's Architecture section and the ledger's class-R note. `frontend/.claude/CLAUDE.md`: a doc comment "states the contract, not the changelog". Reviewers trimmed exactly this class on #862, #871, #875, #878, #883, #885 and #886 — the immediately preceding PR | fixed — trimmed to 10 lines: contract, the one live warning (not `--riv-solid-btn-hover`, and why in one clause), the measured 1.4.11 numbers with their rule citation, and `Rationale:`/`Proof:` pointers. The inverse-construction and theme-invariance-ground arguments are now pointed at, not restated |
| F-4 | review gate (agent 4, prior-PR feedback) | **Paraphrased `Pinned by` citations, Minor.** Four ACs named test titles that differ from the shipped `it(...)`/`test(...)` strings — "on values" for "on its values", an inserted "own boundaries", a reworded e2e title. The recurring class flagged on #871, #875 and #877 | fixed — all four re-quoted verbatim against the shipped titles |
| F-5 | review gate (agent 4, prior-PR feedback) | **Plan-doc self-review checklist unticked against an all-✅ phase table, Minor.** Every merged plan doc in this repo has these boxes ticked at ready-for-review, leaving only the review-gate line open until the gate finishes. Same class as #859, #863, #871, #875 | fixed — ticked what is actually true; the review-gate box stays open until the gate closes, and the close-out box until the final commit |
| F-6 | review gate (agent 3, git-history pass) | **Miscount in the plan's own justification, Minor.** Architecture said adopting the solid-btn pair "moves three painted positions" while `tailwind.css` and the ledger both correctly said two (resting fill + hover fill). Not grounded in any cited history — a typo in the number the whole refusal rests on | fixed — "two painted positions to migrate one", matching the other two artifacts |
| F-7 | self-caught while fixing F-3 | **A trimmed comment impersonated a declaration.** Re-wrapping the token comment put `--riv-solid-btn-hover:` at the start of a line, and `declarationsOf()` reads `tailwind.css` as TEXT — so `refuses the solid-btn pair on its values` saw two declarations of a token declared once and failed. The guard catching its own family's comment is the guard working, but the footgun is worth writing down: **never follow a `--riv-*` name with a colon in prose inside `tailwind.css`** | fixed — reworded to "the --riv-solid-btn-hover pair, which rests on…", no colon after the name |
| F-8 | review gate (agent 5, comment-compliance pass) | **Ledger header not extended, Minor.** `colour-literal-token-audit.md`'s "Prior slices that cut families out of this population" line names every closed slice, unbroken through #849/PR #886, but this slice's own closure was only written into the class-R note further down | fixed — `#887 … PR #889` appended, keeping the header a complete index of the population's reductions |
| F-9 | review gate (agent 5, comment-compliance pass) | **The citation template does not cover the shape this slice introduced, Major-in-effect.** `non-text-contrast.md`'s "How to cite this file" block is single-adjacency (`over its own fill`), but the same PR's new prose establishes that a *state* fill has two adjacencies and both belong in the assertion. A future author copying the canonical template literally for the next state-coloured token would emit a citation missing one required measurement — the doc teaching two different things in two places | fixed — a second, state-fill template added beside the boundary one, with a line saying why copying the boundary shape drops a measurement. The token comment this slice ships already follows the two-adjacency form, so template and practice now agree |
| F-10 | doc verification pass (Tailwind + angular.dev primary docs, at the maintainer's ask) | **An a11y ground shipped as an assertion when it was a checkable fact.** `non-text-contrast.md` rested part of the exemption on "a pointer hover is unavailable to keyboard and touch users" — true, but written as a claim about pointer semantics. The Tailwind v4 docs give the mechanism: `hover:` compiles to `@media (hover: hover) { .hover\:bg-…:hover }`, so the painting rule is absent from the cascade entirely on a device without hover capability | fixed — the doc now states the mechanism and cites a new e2e assertion that reads the condition off the compiled stylesheet. **Writing that assertion falsified my first version of it:** a bare, ungated `.bg-riv-console-btn-hover` rule also exists (Tailwind's extractor reads the undecorated candidate out of the same class string), so "every rule mentioning the token is hover-gated" is false. Scoped to the rule that paints the state, and the e2e's `UTILITIES` docstring — which claimed a variant token compiles "rather than a bare `.class`" — corrected to match |

---

## File structure

- `docs/plans/console-btn-hover-token.md` — this plan
- `frontend/src/tailwind.css` — the `--riv-console-btn-hover` declaration beside its border, and
  the `@theme inline` row that makes the utility generate
- `frontend/src/app/operator/operator-actions.ts` — the one migrated position
- `frontend/src/testing/glass-tokens.ts` — `CONSOLE_BTN_HOVER`, the single mirror both specs read
- `frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts` — the family's guard: the four
  stylesheet-contract cases, the refused merge, the measured ratios, the recorded `bg-white`
- `frontend/src/app/operator/operator-console.contrast.spec.ts` — drops its private `#eef1f2`
  copy for the shared mirror
- `frontend/e2e/fixed-ink-token-recut.e2e.ts` — the hovered-box assertion
- `docs/design/non-text-contrast.md` — the family row + the state-vs-boundary reading
- `docs/design/colour-literal-token-audit.md` — the class-R residue note → `done`

---

## Phase 0 — The token, its guards and the migrated site

**Files:** Modify `frontend/src/tailwind.css` · `frontend/src/app/operator/operator-actions.ts:54`
· `frontend/src/testing/glass-tokens.ts` · Test
`frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts` ·
`frontend/src/app/operator/operator-console.contrast.spec.ts`

- [x] **Step 1: Write the failing guards** — extend `CONSOLE_FAMILY` with
      `'--riv-console-btn-hover'`, add `#eef1f2` to `MIGRATED_LITERALS`, and add the
      `the console button hover fill (#887)` describe (the refused merge, the AA label, the two
      sub-3:1 boundaries, the recorded `bg-white`).
- [x] **Step 2: Run them, verify they fail** — `cd frontend && npx vitest run
      src/app/shared/fixed-ink-tokens.contrast.spec.ts` → FAIL: `--riv-console-btn-hover
      declarations` length 0, and `operator-actions.ts still paints #eef1f2`.
- [x] **Step 3: Minimal implementation** — declare the token in the base block beside
      `--riv-console-btn-border` with the reason at the declaration, add its `@theme inline`
      row, export `CONSOLE_BTN_HOVER` from `glass-tokens.ts`, and swap the class string to
      `hover:bg-riv-console-btn-hover`.
- [x] **Step 4: Run them, verify they pass** — the same command → PASS; then broaden to
      `npx vitest run src/app/shared src/app/operator` for the touched folders.
- [x] **Step 5: Generalization-audit pass** — appended the `hover:bg-` population row below.
- [x] **Step 6: Commit** — `git commit -m "Give the console sign-out hover fill its own token (#887)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The real-render hover proof

**Files:** Test `frontend/e2e/fixed-ink-token-recut.e2e.ts`

- [x] **Step 1: Write the failing assertion** — add `--riv-console-btn-hover` to `REGISTRY`
      (absent from `UTILITIES` for the reason the file already states: a variant-consumed token
      compiles to a compound selector), and extend the console test with `await signOut.hover()`
      + `toHaveCSS('background-color', 'rgb(238, 241, 242)')`.
- [x] **Step 2: Run it, verify it fails on the pre-token build** — proven in phase 0's order:
      the assertion is written against the token, which phase 0 introduced, so the honest red
      here is the `REGISTRY` row against a stale build. Verify by running the spec with the
      `@theme inline` row commented out → FAIL with the utility ungenerated and the hovered box
      still `rgb(255, 255, 255)`; restore, then green.
- [x] **Step 3: Run it, verify it passes** — `cd frontend &&
      PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
      --config=playwright.a11y.config.ts e2e/fixed-ink-token-recut.e2e.ts` → PASS.
- [x] **Step 4: Commit** — `git commit -m "Prove the console hover fill on the hovered box (#887)"`
- [x] **Step 5: Update plan-doc execution status.**

---

## Phase 2 — The ledger row and the 1.4.11 ground

**Files:** Modify `docs/design/non-text-contrast.md` · `docs/design/colour-literal-token-audit.md`

- [x] **Step 1:** Add `--riv-console-btn-hover` to `non-text-contrast.md`'s rule-2 family table,
      pointing at `app/shared/fixed-ink-tokens.contrast.spec.ts`, with the paragraph that makes
      the **state**-vs-boundary reading explicit (1.4.11 reaches states; the hover fill is a
      pointer-only supplementary affordance and never the sole indicator of anything).
- [x] **Step 2:** Rewrite the ledger's class-R residue note for this position to `done — #887,
      PR #NN`, recording the refused merge as the verdict rather than the absence of one.
- [x] **Step 3: Commit** — `git commit -m "Record the console hover fill's role and 1.4.11 ground (#887)"`
- [x] **Step 4: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-02 | phase 0 | **Every hover fill in `frontend/src`, by the mechanism that paints one** — the `hover:bg-` variant — rather than by resembling the one the ticket names. Run before the migration, so it is the command that FOUND the population and not one confirming a guess | `grep -rho "hover:bg-[^ \"'\`]*" frontend/src --include=*.ts --include=*.html \| sort \| uniq -c \| sort -rn` | 16 distinct forms, 30 occurrences | **1 site, and the ticket's "population of one" is confirmed rather than assumed.** 15 of the 16 forms are already token-consuming (`hover:bg-riv-*`, 9 forms) or Tailwind named colours with an optional `/opacity` (`hover:bg-white` ×11, `/90`, `/85`, `/80`, `/65`, `/50`, `black/70`, `transparent`), which are outside the ledger's population by its own definition. The sixteenth is `hover:bg-[#eef1f2]` — migrated here. Nothing generalizes: there is no second site to fix and no pattern to sweep, which is itself the finding |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-3, AC-5, AC-6:** Run `cd frontend && npx ng test --watch=false --include="src/app/shared/fixed-ink-tokens.contrast.spec.ts"` → 65 passed.
- [x] **AC-4:** Run `cd frontend && PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts e2e/fixed-ink-token-recut.e2e.ts` → 8 passed, and verified failing (`rgb(255, 255, 255)`) with the `@theme inline` row removed.
- [x] **AC-7:** Verified by diff inspection (no test — stated as such in the AC).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test (AC-7 excepted, declared untested).
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
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — this is that commit; the slice merges via **PR #889**.
- [x] **The review gate ran in full** — rung 1 of the ladder (`Skill("code-review:code-review")`) with `riviera-review-overlay` layered on: a five-agent fan-out at HIGH effort, all five reported, findings F-1..F-9 fixed in-branch. F-10 came from a later primary-doc verification pass.
