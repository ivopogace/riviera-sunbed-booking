# Solid fill token family Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the nine solid button/badge **fills** — three literals, one form — onto
`--riv-solid-fill-*` tokens declared **once** in `tailwind.css`'s base block with no dark
override, so the fill/ink pair each of them forms with fixed white ink stays theme-invariant
wherever the component is mounted.

**Architecture:** The decision is the same one #850 (`--riv-form-error-*`) and #851
(`--riv-solid-btn-*`) made, applied to a family that is grouped by **form** rather than by
value: every member puts **fixed white ink on a solid brand fill**, so the fill may not theme
— and because the ink over it is fixed, nothing else may either. Three of the nine sites sit
in `shared/` components (`confirm-panel`, `semantic-chip`) whose host theme is decided by the
caller, which is what turns "a themed fill would look different" into "the same component
renders differently depending on where it is mounted".

The naming rule the issue sets — **name the role, never the ink whose value it coincides
with** — is what keeps `--riv-error-ink` (`#a3160e`) and `--riv-pop-accent` (`#0a6e85`) out
of this. Both coincide by value and disagree on meaning, and both **theme**: `--riv-error-ink`
resolves `#ffa9a1` in the dark theme, which would put white text on a pale pink button.

**Persistence:** N/A — frontend-only, no backend or schema change (invariant #1 untouched).

**Source of intent:** GitHub issue #854 (class **R-2** of
`docs/design/colour-literal-token-audit.md`; parent #836). Sibling precedent: #850 / PR #857
and #851 / PR #859, whose artifacts this slice copies rather than re-derives.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — **the grill
found the ticket's e2e target cannot fail**, plus two missed spec sites; see Open questions
G-1…G-3) · `riviera-plan-doc` (this template; its Behavior-parity ledger is what forced the
`semantic-chip` mirror question into the open) · `tdd` (each phase writes the failing spec
first at the seams named below) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (merge close-out) · `riviera-tailwind` (the
whole pattern: tier-1 token switching, the theme-invariance exception and its "reason at the
declaration" rule, and **"the unit is the whole skin, not one position"** — which is what put
the adjacent `hover:bg-[#0a5e72]` inside the family, G-3) · `riviera-frontend` (placement:
the family spec is a `shared/` colocated `*.contrast.spec.ts` because the family's two
`shared/` consumers are its reason to exist; the e2e goes in the CI-safe `frontend/e2e/`
suite; `src/testing/glass-tokens.ts` is the shared mirror) · `playwright-cli` (e2e authoring
— `toHaveCSS` on the computed box, `addInitScript` for the forced dark theme) ·
`riviera-local-debug` (scoped `npm test` / `test:e2e:a11y` runs and the
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` cloud recipe) · `angular-developer`
(**N/A — no component logic changed**: the diff is class strings, CSS custom properties and
test mirrors, so no signals/DI/control-flow API is in play. Named rather than omitted, per
the RV-PROC-1 gap #856's review flagged).

**Branch:** `claude/sdlc-854-i87zxg` — **the cloud session's designated remote branch stands
in for `feature/solid-fill-token-family`** (`riviera-sdlc` §Remote/cloud session addendum).
The literal `feature/*` branch is deliberately not created.

---

## Acceptance criteria (testable)

> Frontend slice, so every AC names its seam explicitly.

- [x] **AC-1:** Given the four new tokens, when `tailwind.css` is read as text, then each is
      declared **exactly once** and that declaration sits in the base block
      (`:root, [data-riv-theme='porcelain']`), so no theme block can override it and all
      three themes resolve the same value. *Seam:* `src/tailwind.css` as text (the
      `theme-boot.spec.ts` drift-guard pattern — jsdom maths cannot see an added dark
      override) · *Pinned by:* `solid-fill-tokens.contrast.spec.ts` › "declares each token
      exactly once" + "declares the family in the base block" + "declares the values this
      test mirror carries".
- [x] **AC-2:** Given fixed white ink, when composited on each of the four fills, then every
      pair clears WCAG AA (4.5:1). *Seam:* `src/testing/contrast.ts` `contrastRatio` over
      `src/testing/glass-tokens.ts` · *Pinned by:* `solid-fill-tokens.contrast.spec.ts` ›
      "white ink clears AA on every fill in the family".
- [x] **AC-3:** Given the themed tokens whose values these fills coincide with, when white
      ink is composited on their **dark** resolutions, then it falls **below** AA — keeping
      the reason the family exists in the tree rather than only in a comment. *Seam:* same as
      AC-2 · *Pinned by:* `solid-fill-tokens.contrast.spec.ts` › "the coincidental tokens
      would not survive theming — which is why the family exists".
- [x] **AC-4:** Given the whole `src/app` tree, when swept for this family's literals **in
      their fill form** (`bg-[#0a6e85]`, `bg-[#a3160e]` without an `/opacity` modifier,
      `bg-[#0a5f74]`, `hover:bg-[#0a5e72]`), then no non-spec component file still paints
      one. *Seam:* `readdirSync(src/app, {recursive:true})` over `.ts`/`.html` · *Pinned by:*
      `solid-fill-tokens.contrast.spec.ts` › "leaves no component painting the family as a
      literal".
- [x] **AC-5:** Given the same three values in **non-fill** roles — `text-`, `ring-`,
      `border-` and gradient stops, which are other classes of the audit and other slices'
      work — when the same sweep runs, then each is **still present**: the half that proves
      the sweep did not overreach. *Seam:* the same tree read, asserted positively by path ·
      *Pinned by:* `solid-fill-tokens.contrast.spec.ts` › "leaves the non-fill roles of the
      same three values untouched".
- [x] **AC-6:** Given a real browser render, when the operator console's confirm button and
      the home page's semantic chip are shown, then their computed `background-color` equals
      the registered value, the accept button's hover fill applies on hover, and **all of it
      is unchanged under a forced `dark` document theme**. *Seam:* the `/operator/:venueId`
      set-editor and `/` discovery routes in the mocked Playwright suite, read through
      `toHaveCSS` · *Pinned by:* `e2e/solid-fill-token-skin.e2e.ts`.
- [x] **AC-7:** Given each registered token, when the page loads, then the token resolves on
      `document.documentElement` **and** its `@theme inline` row generated the utility class
      — a token declared without its row generates no utility, so the class stays in the
      markup and the paint silently does not change. *Seam:* `document.styleSheets` walked
      for the utility selectors · *Pinned by:* `e2e/solid-fill-token-skin.e2e.ts` › "every
      registered token is declared and generates its utility".
- [x] **AC-8:** Given the forced-dark assertion of AC-6, when a dark override for the family
      is temporarily added to `tailwind.css`, then the e2e **fails** — the mutation check the
      issue asks for, recorded in this plan's Execution status with its output rather than
      claimed. *Seam:* a throwaway edit to `src/tailwind.css`, reverted · *Pinned by:* the
      recorded mutation-check result (a procedure, not a committed test — stated so rather
      than faked with one).
- [x] **AC-9:** Given the three specs that pin these classes by literal —
      `shared/confirm-panel.spec.ts`, `shared/semantic-chip.spec.ts` (three assertions) and
      `operator/requests-tab.contrast.spec.ts:79` — when the family moves, then each asserts
      the token utility instead, and `src/testing/chip-fills.ts`'s `SEMANTIC_CHIP.fill`
      mirror moves with it. *Seam:* those four files · *Pinned by:* their own suites, green.
- [x] **AC-10:** Given the audit ledger, when the R-2 row is read at merge, then it reads
      `done — #854, PR #NN`. *Seam:* `docs/design/colour-literal-token-audit.md` · *Pinned
      by:* review (a doc row, not a test — stated so rather than faked with one).

## Non-goals

- **The `text-`, `ring-` and gradient roles carrying the same three values.**
  `text-[#0a6e85]` (9 positions across `operator/`), `text-[#0a5f74]`
  (`booking-dialog`, `booking-pay`, `booking-confirmation`, `amenity-chip`),
  `ring-[#0a5f74]` (`set-editor`, `layout-editor`), the `--riv-cta-grad` /
  `booking-dialog` gradient stops, and every `bg-[#a3160e]/·` tint (class **O**, #852).
  Splitting by **form** is the whole correction this re-cut ticket exists for; AC-5 enforces
  that they survive.
- **`border-[#2f7d92]` on `semantic-chip.ts:49`.** The chip's own edge: one consumer, an
  unmeasured non-text chrome value, already a fixed literal (so it carries no theme-invariance
  risk), and not a row in the ledger's class R. It belongs to whichever slice names chip
  chrome — not to a family defined as *fills*. `semantic-chip.spec.ts`'s set equality keeps
  asserting it, so it cannot drift unnoticed.
- **Collapsing `#0a6e85` and `#0a5f74` into one token.** They are two near-duplicate brand
  teals doing the same job in different places, and merging them would be a **visual change**
  at three or four sites — exactly what the no-drift rule and the audit's own method forbid a
  migration slice from doing unilaterally. Preserved as two tokens; the near-duplicate is
  recorded as a follow-up (Open questions G-4), the same treatment the ledger's class O row
  gives `#0c2a33` vs `#0a2a33`.
- **An ink token.** All eight ink-bearing members already use Tailwind's named `text-white`,
  which cannot theme. A `--riv-solid-fill-ink: #ffffff` would be ceremony that adds a
  declaration without removing a literal. AC-2 asserts the ink as a constant instead.
- Any dark/riviera override for this family — the whole point is that there is none.

## Behavior-parity ledger

> Restyle-only slice, so "no visual change" is verified position-by-position rather than
> asserted. Every row must be **preserved**; a single "changed" row is a bug in this plan.

| # | Behavior | Site | Verdict |
|---|---|---|---|
| B-1 | Accept button paints `#0a6e85`, white ink | `operator/requests-tab.html:194` | preserved — token carries the same value |
| B-2 | Export button paints `#0a6e85` resting, `#0a5e72` on hover, with its `[transition:background_0.15s_ease]` and `motion-reduce:` guard | `operator/payouts-tab.html:114` | preserved — **both** fills move, so the transition still runs between two token values (G-3) |
| B-3 | Selected day-state chip paints `#0a6e85` on `border-transparent`, white ink | `operator/daily-view-tab.ts:609` | preserved |
| B-4 | Legend swatch paints `#0a6e85`, `aria-hidden`, no text | `operator/daily-view-tab.html:279` | preserved — and **exempt from AC-2**: there is no ink to pair it with, so no contrast assertion is invented for it (the issue says so explicitly) |
| B-5 | Confirm-panel destructive tone paints `#a3160e`, white ink | `shared/confirm-panel.ts:9` | preserved |
| B-6 | Confirm-decline button paints `#a3160e`, white ink | `operator/requests-tab.html:172` | preserved |
| B-7 | Confirm-panel primary tone paints `#0a5f74`, white ink | `shared/confirm-panel.ts:10` | preserved |
| B-8 | Semantic chip paints `#0a5f74` **opaquely**, white ink, keeping `border-[#2f7d92]` | `shared/semantic-chip.ts:48` | preserved — opacity is load-bearing (#705: the chip sits over an arbitrary uploaded photo), so the spec's "no cover photo can reach the ink" proof is **re-expressed**, not dropped (G-2) |
| B-9 | Console badge paints `#0a5f74`, white ink | `operator/operator-console.html:70` | preserved |
| B-10 | `.semantic-chip`, `.mode-chip`, `.new-chip` marker classes stay queryable | `semantic-chip.ts` + call sites | preserved — `riviera-tailwind` rule 2; `discovery-flow.e2e.ts` queries them |

## Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | A token is declared without its `@theme inline` row → no utility is generated, the class stays in the markup and the paint **silently** does not change | medium | high (a silent restyle) | AC-7's e2e walks `document.styleSheets` for each utility selector; the unit spec cannot see this |
| R-2 | The forced-dark e2e passes **vacuously** because the surface it asserts is theme-pinned | **materialised** — see G-1 | high (the slice's headline proof would be worthless) | assert a theme-**following** consumer (`semantic-chip` on `/`) alongside the pinned one, and mutation-check the whole spec (AC-8) |
| R-3 | The literal sweep over-claims and demands unrelated roles change too | medium | medium | sweep by **fill form** (`bg-[…]`), not by bare value; AC-5 asserts the non-fill survivors positively |
| R-4 | `bg-[#a3160e]/10` (a class-O tint, #852's) is swallowed by a naive `bg-[#a3160e]` regex | medium | medium | the sweep's pattern excludes a following `/`; the tint's file is in the AC-5 survivor list |
| R-5 | Concurrent edit collision with #848, which also touches `requests-tab.html` | low | medium | the issue says not to run them concurrently; `git log origin/main` shows no #848 branch in flight — re-check before the PR and merge `origin/main` first if it lands |
| R-6 | `semantic-chip.spec.ts`'s hex-shape assertion (`/^#[0-9a-f]{6}$/`) breaks once the fill is a utility | **certain** | low | planned for in phase 2; the *reason* for that assertion (opacity) is re-expressed against the token's declared value, not deleted (B-8) |

## Open questions / Assumptions

> Grill findings from the issue-intake gate (`riviera-sdlc` §issue-intake-gate), run against
> the code as it stands at `10bfa4d`. All four are **drift**, not fog — each is resolvable
> inside this slice, so none escalates to `wayfinder`.

### Resolved

- **G-1 — the issue's named e2e target cannot fail.** The AC asks for "a mocked e2e [that]
  asserts the computed fill on a rendered confirm button under a forced `dark` document
  theme", justified by "`confirm-panel.ts` and `semantic-chip.ts` live in `shared/`, so their
  host theme varies with whoever renders them". **`ConfirmPanel`'s host theme does not vary
  today:** its only two mounts are `operator/set-editor.html:466` and
  `operator/layout-editor.html:125`, both inside `operator-console`, which pins
  `host: { 'data-riv-theme': 'porcelain' }` (`operator-console.ts:72`). That attribute
  re-scopes the `--riv-*` tokens for the whole subtree, so a confirm button asserted there
  holds its fill under a forced dark document theme **even if the token had a dark
  override** — the test would pass vacuously, which the same AC forbids.
  **Resolution:** the concern is real but it bites at the *other* `shared/` consumer.
  `SemanticChip` is mounted on tourist surfaces that do follow the document theme
  (`pages/home/home.html:179,185,219`, `venue/venue-map.html:69,90`), and
  `discovery-flow.e2e.ts:288` already reads its computed fill on `/`. So the e2e asserts
  **both**: the confirm button (proving it paints from the token at all) and the semantic
  chip under forced dark (the assertion that can actually die). Mutation-checked per AC-8.
- **G-2 — the issue's spec-update list is incomplete.** It names `confirm-panel.spec.ts:84`
  and `requests-tab.contrast.spec.ts:79`. It misses **`shared/semantic-chip.spec.ts`**, which
  keys three assertions off `src/testing/chip-fills.ts`'s `SEMANTIC_CHIP.fill = '#0a5f74'`:
  the whole-class-list set equality (`:38`), the "the fill is opaque, so no cover photo can
  reach the ink" check (`:48`), and the hex-shape assertion that enforces opacity
  (`:50`) — plus `semantic-chip.contrast.spec.ts`, which reads the same mirror.
  **Resolution:** all four move in phase 2. The mirror keeps the hex (it is the *declared*
  value, and the contrast spec needs a colour to do maths on) and gains the utility name
  beside it, so the class assertion interpolates the utility while the opacity proof still
  runs against the hex. Nothing is deleted; the tie is re-expressed.
- **G-3 — one adjacent literal is inside the skin, one is not.** Two of the nine sites carry
  a second colour literal the ticket's table does not list: `payouts-tab.html:114`'s
  `hover:bg-[#0a5e72]` and `semantic-chip.ts:48`'s `border-[#2f7d92]`.
  **Resolution:** the hover is **in** — `riviera-tailwind` §Styling-across-the-themes is
  explicit that "the unit is the whole skin, not one position", and tokenising a resting fill
  while its own hover stays a literal is precisely the desync that rule exists to prevent
  (change the token and the button's hover silently diverges); #859's `--riv-solid-btn-hover`
  is the same member in the sibling family. The border is **out** — see Non-goals for the
  four reasons. Both are recorded rather than left to a reviewer to notice.
- **G-4 — `#0a6e85` vs `#0a5f74` are a near-duplicate pair.** Two brand teals, four and
  three positions, doing the same job (solid fill under white ink) with no role that
  separates them: `operator-console.html:70`'s badge takes the deeper one while its
  neighbouring console buttons take the lighter. That is very likely drift, not intent.
  **Resolution:** **not this slice's call.** Merging them is a visual change; a migration
  slice preserves values. Both are tokenised separately here, the near-duplicate is written
  at the declaration so the next reader sees it, and **issue #861** records the question — the
  same treatment the ledger already gives `#0c2a33` vs `#0a2a33`.

## Availability & concurrency (invariant #2)

N/A — no booking, beach-map or `availability` code is touched. This slice changes CSS custom
properties, Tailwind class strings and their test mirrors.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only slice; no backend file is in the diff.

### Module ownership (§4a)

N/A — no backend behavior is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. `operator/payouts-tab.html:114`'s export **button** is repainted; the
payout figures it renders and the ledger behind them are untouched.

## Angular — frontend surfaces touched

| Surface | Change |
|---|---|
| `src/tailwind.css` | four `--riv-solid-fill-*` declarations in the base block + their four `@theme inline` rows |
| `shared/confirm-panel.ts` | both tone fills → token utilities |
| `shared/semantic-chip.ts` | host fill → token utility (border untouched) |
| `operator/requests-tab.html` | accept + confirm-decline fills |
| `operator/payouts-tab.html` | export button resting + hover fills |
| `operator/daily-view-tab.ts` + `.html` | selected day-state chip fill + the `aria-hidden` legend swatch |
| `operator/operator-console.html` | request-count badge fill |
| `src/testing/glass-tokens.ts` | the family's mirror, for the contrast spec |
| `src/testing/chip-fills.ts` | `SEMANTIC_CHIP` gains the utility name beside its hex (G-2) |

No component logic, template control flow, routing, DI or signal changes.

## FE↔BE contract

N/A — no API surface changes.

## Execution status

**Stage pointer:** `review gate — findings fixed, re-verifying`

**Next action:** push the finding fixes, confirm CI green, then the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The family spec, red | ✅ | (this commit) |
| 1 — Declare the tokens, green | ✅ | (this commit) |
| 2 — Repaint the nine sites + the pinned specs | ✅ | (this commit) |
| 3 — The mocked e2e + the mutation check | ✅ | (this commit) |
| 4 — Ledger row + close-out | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Mutation check (AC-8), run at phase 3.** `--riv-solid-fill-brand: #7cd7e8` added to the dark
theme block, the e2e re-run, the override reverted. Result — **1 failed, 4 passed**:

```
✘ … › and does not move under a dark document theme
    Error: expect(locator).toHaveCSS(expected) failed
    Expected: "rgb(10, 95, 116)"
    Received: "rgb(124, 215, 232)"
```

The unit guard caught it too (`--riv-solid-fill-brand declarations: expected [ '#0a5f74',
'#7cd7e8' ] to have a length of 1 but got 2`). **The four passing tests are the finding**, not a
footnote: both console assertions — including the confirm button the issue named — went green
*with* the dark override live. That is G-1 measured rather than argued, and it is why the
falsifiable assertion sits on `semantic-chip` instead.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (agents 1 + 4) | Narrated decision history in five doc comments — `riviera-java-conventions` §6d, whose frontend twin is `frontend/.claude/CLAUDE.md`. The line the siblings adjudicated: a **bare** `(#nnn)` citation is house style and stays; narrated before/after prose is the finding | **fixed** — the five reworded to state the contract (what the token is, that no rule picks between `-action` and `-brand`, that #861 settles it). Bare citations kept, per PR #856/#857's adjudication |
| F-2 | review gate (agent 4) | `requests-tab.contrast.spec.ts:21` — a line **this diff rewrote** miscites `#848` as class **F**; the ledger puts it under class **T** (line 70, beneath the Class T heading at line 60) | **fixed** — and the same miscitation in the new spec's `SURVIVORS` comment, which the agent did not see, fixed with it |
| F-3 | review gate (agent 4) | The legend swatch's contrast exemption was asserted, not reasoned — the sibling PR #859 was burned by exactly that shape | **fixed** — the spec header now states why WCAG 1.4.11 does not bite: the `<li>` reads "Walk-in marked" beside the swatch, so colour is not the sole carrier |
| F-4 | review gate (agent 5) | The plan's G-2 claimed "all four move"; `semantic-chip.contrast.spec.ts` has zero changes in the diff, and AC-9 correctly named only three — the doc contradicted itself | **fixed** — G-2 and the audit log now say three, and say why the fourth passing unchanged is the point |
| F-5 | review gate (agent 3) | Three pre-existing specs (`daily-view-tab`, `payouts-tab`, `operator-console` contrast specs) assert AA against a **hardcoded hex** for sites this PR tokenised, so they would stay green while the token drifted from the paint | **fixed** — migrated to the `glass-tokens` mirror, fill roles only. The generalization-audit log gains the row: phase 2 enumerated by *class*, and these specs name no class |
| F-6 | review gate (agent 5) | The plan's Non-goals cited `semantic-chip.ts:48`; this diff's own reformat wrapped the host string and moved the cited literal to `:49` | **fixed** |

---

## File structure

- `docs/plans/solid-fill-token-family.md` — this plan
- `docs/design/colour-literal-token-audit.md` — the R-2 ledger row → `done`
- `frontend/src/tailwind.css` — the four declarations + four `@theme inline` rows
- `frontend/src/testing/glass-tokens.ts` — the family mirror
- `frontend/src/testing/chip-fills.ts` — `SEMANTIC_CHIP` gains its utility name
- `frontend/src/app/shared/solid-fill-tokens.contrast.spec.ts` — the family spec (new)
- `frontend/src/app/shared/confirm-panel.ts|.spec.ts` — both tone fills + the class assertion
- `frontend/src/app/shared/semantic-chip.ts|.spec.ts` — host fill + its three assertions
- `frontend/src/app/operator/requests-tab.html` — accept + confirm-decline fills
- `frontend/src/app/operator/requests-tab.contrast.spec.ts` — the straddling AA assertion
- `frontend/src/app/operator/payouts-tab.html` — export button resting + hover fills
- `frontend/src/app/operator/daily-view-tab.ts|.html` — selected chip + legend swatch
- `frontend/src/app/operator/operator-console.html` — the badge fill
- `frontend/e2e/solid-fill-token-skin.e2e.ts` — the computed-skin e2e (new)
- `frontend/src/app/operator/{daily-view-tab,payouts-tab,operator-console}.contrast.spec.ts` —
  review finding F-5: three pre-existing AA assertions on hardcoded hexes of repainted sites,
  migrated to the token mirror (fill roles only)
- `.claude/skills/riviera-tailwind/SKILL.md` — the theme-invariance rule gains the converse
  direction this slice is the case for (docs-freshness)

---

## Phase 0 — The family spec, red

**Files:** Create `frontend/src/app/shared/solid-fill-tokens.contrast.spec.ts` · Modify
`frontend/src/testing/glass-tokens.ts`

- [ ] **Step 1:** add the family's mirror entries to `glass-tokens.ts` with the
      theme-invariance reason, alongside the existing `SOLID_BTN_*` / `FORM_ERROR_*` blocks.
- [ ] **Step 2:** write the spec covering AC-1…AC-5 — the AA pairs, the coincidental-token
      bounds, the three declaration guards over `tailwind.css` as text, the fill-form sweep,
      and the positive non-fill survivor assertion.
- [ ] **Step 3:** run it, verify it fails — `npm test -- solid-fill-tokens` → FAIL on the
      declaration guards (no such token yet).

## Phase 1 — Declare the tokens, green

**Files:** Modify `frontend/src/tailwind.css`

- [ ] **Step 1:** declare the four tokens in the base block with the reason at the
      declaration — why the family is theme-invariant, why `--riv-error-ink` and
      `--riv-pop-accent` are the wrong tokens, the near-duplicate note (G-4), and the legend
      swatch's stated contrast exemption.
- [ ] **Step 2:** add the four `@theme inline` rows so the utilities generate.
- [ ] **Step 3:** `npm test -- solid-fill-tokens` → the declaration + AA tests pass; the
      sweep still fails (nothing repainted yet).

## Phase 2 — Repaint the nine sites + the pinned specs

**Files:** Modify the six component files + `confirm-panel.spec.ts`, `semantic-chip.spec.ts`,
`chip-fills.ts`, `requests-tab.contrast.spec.ts`

- [ ] **Step 1:** repaint all nine fills and the export button's hover.
- [ ] **Step 2:** update the four pinned specs per G-2, re-expressing the opacity proof
      rather than deleting it.
- [ ] **Step 3:** `npm test -- solid-fill-tokens confirm-panel semantic-chip requests-tab`
      → green, sweep included.

## Phase 3 — The mocked e2e + the mutation check

**Files:** Create `frontend/e2e/solid-fill-token-skin.e2e.ts`

- [ ] **Step 1:** write the spec — the registry/utility walk (AC-7), the confirm button and
      accept-button hover, and the semantic chip under a forced `dark` document theme (AC-6).
- [ ] **Step 2:** run it green —
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- solid-fill-token-skin`.
- [ ] **Step 3:** **mutation-check (AC-8)** — add a dark override for the family, re-run,
      record the failure output in Execution status, revert.

## Phase 4 — Ledger row + close-out

**Files:** Modify `docs/design/colour-literal-token-audit.md`

- [ ] **Step 1:** update the two class-R rows this slice closes to `done — #854, PR #NN`.
- [ ] **Step 2:** open the follow-up issue for G-4's near-duplicate.
- [ ] **Step 3:** `npm run lint`, `npm run format:check`,
      `node scripts/check-plan-file-structure.mjs --diff origin/main`.

---

## Generalization-audit log

> Enumerated by **mechanism**, not by resemblance — the population is "a colour literal in a
> `bg-` role carrying one of this family's values", found by the command, not by recall.

| Phase | Mechanism enumerated | Command | Decision |
|---|---|---|---|
| 0 | Every `.ts`/`.html` under `src/app` painting one of the three values in ANY role | `grep -rn "0a6e85\|a3160e\|0a5f74" src/app --include=*.ts --include=*.html` | 40 positions found; the `bg-` subset is 9 (+1 hover). The rest are `text-`, `ring-`, `border-` and gradient stops — other classes, other slices. Split by form; both halves asserted (AC-4 and AC-5). |
| 2 | Every spec pinning one of the repainted classes by literal | `grep -rn "bg-\[#0a6e85\]\|bg-\[#a3160e\]\|bg-\[#0a5f74\]\|SEMANTIC_CHIP" src --include=*.spec.ts` + the `chip-fills.ts` mirror's own consumers | Four files, not the two the issue named — grill finding G-2. All moved. |
| 3 | Every `shared/` component in the family, and whether its host theme actually varies | `grep -rn "app-confirm-panel\|appSemanticChip" src/app` then `grep -n data-riv-theme` on each mount's shell | `ConfirmPanel`: 2 mounts, both porcelain-pinned. `SemanticChip`: 5 mounts, none pinned. Drove where the forced-dark assertion sits — G-1, then confirmed by the mutation check. |
| 4 (review, F-5) | Every spec asserting AA against a **hardcoded hex** of a repainted site — the mechanism phase 2's class-scoped sweep missed, since these specs never mention a class | `grep -rn "#0a6e85\\|#0a5f74" src/app --include=*.contrast.spec.ts` | Three more: `daily-view-tab`, `payouts-tab`, `operator-console`. Each would have stayed green while the token drifted from the paint. Migrated to the mirror — but only the **fill** roles: `payouts-tab.contrast.spec.ts:58`'s `TEAL` is the `text-` ink (class T, #848's) and stays a literal. |
| 4 | Every substrate doc stating a fact about the theme-invariant families | `grep -rn "riv-solid-btn\|riv-form-error\|theme-invariant" .claude/skills docs CLAUDE.md` | Two stale: the ledger's prior-slices line, and `riviera-tailwind`'s rule, which stated the pinning in one direction only. Both patched here. |

## Acceptance-criteria verification (final)

| AC | Verified by | Result |
|---|---|---|
| AC-1 | `solid-fill-tokens.contrast.spec.ts` × 3 declaration tests | ✅ |
| AC-2 | `solid-fill-tokens.contrast.spec.ts` › "white ink clears AA on every fill" — 5.86 / 7.35 / 7.24 / 7.84 | ✅ |
| AC-3 | same spec › "the coincidental tokens would not survive theming" — 1.84 / 1.65 | ✅ |
| AC-4 | same spec › "leaves no component painting the family as a literal" | ✅ |
| AC-5 | same spec › "leaves the non-fill roles … untouched" — 18 (path, value) survivors | ✅ |
| AC-6 | `solid-fill-token-skin.e2e.ts` × 4 render tests | ✅ |
| AC-7 | `solid-fill-token-skin.e2e.ts` › "every registered token is declared and generates its utility" | ✅ |
| AC-8 | the mutation check recorded in Execution status — 1 failed / 4 passed | ✅ |
| AC-9 | `confirm-panel.spec.ts`, `semantic-chip.spec.ts`, `semantic-chip.contrast.spec.ts`, `requests-tab.contrast.spec.ts`, `chip-fills.ts` — full unit suite green (199 files, 2133 tests) | ✅ |
| AC-10 | the ledger's class-R row reads `done — #854, PR #860` | ✅ |

## Self-review checklist (before merge / PR)

- [x] Every AC has a named, passing pin (or a stated reason it is a review check).
- [x] Behavior-parity ledger: every row **preserved**, verified against the diff.
- [x] Open questions section empty — all four grill findings resolved, G-4 citing #861.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` green.
- [x] `npm run lint` + `npm run format:check` green (the one lint warning is pre-existing,
      `camera-qr-scanner.spec.ts`, outside this diff).
- [x] The mutation check ran and its output is recorded, not claimed.
- [ ] Execution status finalized in the PR's own last commit, recording `merged via PR #860`.
