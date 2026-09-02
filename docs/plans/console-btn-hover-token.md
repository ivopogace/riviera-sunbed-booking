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
(`#ffffff`/`#eef1f2` vs `#f4f6f7`/`#e7ebec`), so adopting the pair moves three painted
positions: a **repaint**, which #849 established wants its own design slice and not a
migration whose claim is that no pixel moves; (b) the two are **inverse constructions** — a
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
(close-out — due, since the slice changes what `non-text-contrast.md` and the ledger state) ·
`riviera-tailwind` ("group such a family by form, not value; reject a coincidental token on its
role before its value"; a theme-pinned-subtree token is declared once in the base block with
the reason at the declaration; `hover:` already compiles under `@media (hover:hover)` in v4) ·
`riviera-frontend` (the family's guard stays in `shared/`, its mirror in
`testing/glass-tokens.ts`, its render proof in the CI-safe mocked suite; a new token gets a
`@theme inline` mapping) · `playwright-cli` (the hovered-box assertion in the mocked suite) ·
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
      the solid-btn pair on values, not on assertion`
- [x] **AC-2:** Given `--riv-console-btn-hover`, when the stylesheet is read, then it is declared
      **exactly once**, in the base block, with the value `#eef1f2`, and mapped in `@theme
      inline` as `--color-riv-console-btn-hover: var(--riv-console-btn-hover)` — the same four
      guards `--riv-console-btn-border` already carries. *Seam:* `src/tailwind.css` read as text
      · *Pinned by:* `fixed-ink-tokens.contrast.spec.ts` › `the stylesheet contract` (the four
      existing cases, with the token added to `CONSOLE_FAMILY`)
- [x] **AC-3:** Given `frontend/src`, when swept for the migrated literal, then no bare `#eef1f2`
      remains outside `*.spec.ts`, and `operator/operator-actions.ts` paints a
      `-riv-console-btn-` family utility. *Seam:* the source sweep over the site list ·
      *Pinned by:* `fixed-ink-tokens.contrast.spec.ts` › `the sites` (`%s paints no migrated
      literal` with `#eef1f2` added to `MIGRATED_LITERALS`, and its positive `%s paints its
      family` half)
- [x] **AC-4:** Given the operator console rendered in a real browser, when the sign-out button
      is **hovered**, then its computed `background-color` is `rgb(238, 241, 242)` — the one
      position no declaration sweep can reach. *Seam:* the rendered `oc-signout` box ·
      *Pinned by:* `e2e/fixed-ink-token-recut.e2e.ts` › `the console paints both hairlines from
      their own tokens (#849), and the button's hover fill from its own (#887)`
- [x] **AC-5:** Given the hover fill, when measured, then the button's label clears **AA** on it
      (13.29:1), and the two boundaries it forms — against the button's resting `#ffffff` fill
      (1.14:1) and against the porcelain header glass over each background stop (1.04–1.14:1) —
      are recorded **below 3:1**, so the exemption is a conclusion drawn from a measurement.
      *Seam:* the `testing/glass-tokens.ts` mirror + `testing/contrast.ts` maths · *Pinned by:*
      `fixed-ink-tokens.contrast.spec.ts` › `the console button hover fill (#887)` › `the label
      carries the identity at AA on the hovered fill` + `records that the hover state's own
      boundaries do not reach the 1.4.11 bar, so the exemption is load-bearing`
- [x] **AC-6:** Given the button's **resting** fill, when the slice lands, then it is still
      `bg-white` and has gained no token — #849's own answer on this same surface (it tokenised
      the hairlines bounding the console's white fills and left the fills alone), and the idiom
      of the other 11 `hover:bg-white`/`bg-white` sites in the tree. Asserted so the omission
      reads as a decision rather than a half-migrated skin. *Seam:* the source sweep ·
      *Pinned by:* `fixed-ink-tokens.contrast.spec.ts` › `the console button hover fill (#887)`
      › `leaves the resting fill as bg-white, which is the surface's own precedent`
- [ ] **AC-7 (documentation, no test):** The ledger's class-R residue note for this position
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
  doc gains a row and one clarifying paragraph, not a fourth rule.

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
| R-4 | A later 1.4.11 sweep reads the 1.04–1.14:1 hover boundary as a violation this slice introduced, and "fixes" it by darkening the fill | med | med | AC-5 records both ratios as measurements, and `non-text-contrast.md` gains the family row — #879's close-sales-trigger lesson: check what the outgoing value measured first | agent | open |
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

## Execution status

**Stage pointer:** `implement (phase 2)`

**Next action:** Phase 2 — add the family row + the state-vs-boundary reading to
`docs/design/non-text-contrast.md`, and flip the ledger's class-R residue note to `done`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the token, its guards and the migrated site | ✅ | `336d0fd` |
| 1 — the real-render hover proof | ✅ | this commit |
| 2 — the ledger row and the 1.4.11 ground | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

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

- [ ] **Step 1:** Add `--riv-console-btn-hover` to `non-text-contrast.md`'s rule-2 family table,
      pointing at `app/shared/fixed-ink-tokens.contrast.spec.ts`, with the paragraph that makes
      the **state**-vs-boundary reading explicit (1.4.11 reaches states; the hover fill is a
      pointer-only supplementary affordance and never the sole indicator of anything).
- [ ] **Step 2:** Rewrite the ledger's class-R residue note for this position to `done — #887,
      PR #NN`, recording the refused merge as the verdict rather than the absence of one.
- [ ] **Step 3: Commit** — `git commit -m "Record the console hover fill's role and 1.4.11 ground (#887)"`
- [ ] **Step 4: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-02 | phase 0 | **Every hover fill in `frontend/src`, by the mechanism that paints one** — the `hover:bg-` variant — rather than by resembling the one the ticket names. Run before the migration, so it is the command that FOUND the population and not one confirming a guess | `grep -rho "hover:bg-[^ \"'\`]*" frontend/src --include=*.ts --include=*.html \| sort \| uniq -c \| sort -rn` | 16 distinct forms, 30 occurrences | **1 site, and the ticket's "population of one" is confirmed rather than assumed.** 15 of the 16 forms are already token-consuming (`hover:bg-riv-*`, 9 forms) or Tailwind named colours with an optional `/opacity` (`hover:bg-white` ×11, `/90`, `/85`, `/80`, `/65`, `/50`, `black/70`, `transparent`), which are outside the ledger's population by its own definition. The sixteenth is `hover:bg-[#eef1f2]` — migrated here. Nothing generalizes: there is no second site to fix and no pattern to sweep, which is itself the finding |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-3, AC-5, AC-6:** Run `cd frontend && npx vitest run src/app/shared/fixed-ink-tokens.contrast.spec.ts` → all green. Verified at commit `<sha>`.
- [x] **AC-4:** Run `cd frontend && PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts e2e/fixed-ink-token-recut.e2e.ts` → 8 passed, and verified failing (`rgb(255, 255, 255)`) with the `@theme inline` row removed.
- [ ] **AC-7:** Verified by diff inspection (no test — stated as such in the AC).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test (AC-7 excepted, declared untested).
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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
