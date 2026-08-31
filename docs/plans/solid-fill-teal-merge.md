# Solid fill teal merge Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `--riv-solid-fill-action` (`#0a6e85`) and `--riv-solid-fill-brand`
(`#0a5f74`) — two brand teals doing one job, with no role between them — into a single
`--riv-solid-fill-brand: #0a6e85` (plus `--riv-solid-fill-brand-hover: #0a5e72`), repainting
the three sites that wore the deeper teal and retiring the `-action` name entirely.

**Architecture:** The decision this slice executes is **merge, onto `#0a6e85`**, and the
direction is the whole of it. `#0a6e85` is the design system's brand teal — 42 occurrences
across all four canvases in `docs/design/*.dc.html`; `#0a5f74` appears in **none** of them. It
was born as the AA-darkened *end stop* of `--riv-cta-grad` (`docs/plans/t2b-discover-v3-additions.md`)
and was then eyedropped into three flat fills. Merging the other way would also have collapsed
the family's hover step: `#0a5f74` against the existing hover `#0a5e72` is **1.016:1** — the
same colour to the eye — so the deeper teal cannot be a resting fill for a control that hovers.
The surviving name is **`-brand`**, not `-action`: three of the four sites keeping their paint
(a day-state chip, an `aria-hidden` legend swatch, a count badge) are not actions, and the audit's
naming rule is to name the role.

**Persistence:** N/A — frontend-only, no backend or schema change (invariant #1 untouched).

**Source of intent:** GitHub issue #861, the decision #854 (PR #860) deferred as grill finding
**G-4** and recorded at the token declaration. Parent epic: #836, class **R-2** of
`docs/design/colour-literal-token-audit.md`. The maintainer chose *merge onto `#0a6e85`* against
the three options put to them (merge up / merge down / keep both with roles) — see Resolved.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — **the grill turned
the ticket's own framing around**: the issue presents merge-vs-keep as a palette toss-up, and the
design-canvas census plus the 1.016:1 hover collapse make it a one-way decision, which is what
let the question be put to the maintainer as a recommendation rather than a coin flip; it also
surfaced the #848 file overlap, R-6) · `riviera-plan-doc` (this template; its Behavior-parity
ledger is what forced the four *unchanged-paint* sites to be enumerated beside the three repainted
ones — the rename is the half of this diff that can silently drop a paint) · `tdd` (phase 0 writes
the merged registry into the mirror + family spec and watches it go red against `tailwind.css`) ·
`riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(**ran** over `origin/main...HEAD` at phase 3 — 3 findings, all patched: the audit ledger's R-2 row,
G-4's answer in the #854 plan doc, and an as-built pointer on `semantic-chips.md`; the counting
sweep also caught two stale counts inside the token declaration itself, fixed at phase 1) · `riviera-tailwind` (the
theme-invariance exception and its "reason at the declaration" rule — the declaration comment
must now *answer* the question it currently poses; and "the unit is the whole skin, not one
position", which is why the hover moves with the fill it belongs to rather than being left on the
retired name) · `riviera-frontend` (placement: no new files; the e2e proofs stay in the CI-safe
`frontend/e2e/` suite, and `src/testing/glass-tokens.ts` remains the single mirror the unit specs
read) · `playwright-cli` (`toHaveCSS` on the computed box, `addInitScript` for the forced dark
theme — the existing three specs are edited, not re-authored) · `riviera-local-debug` (scoped
`npm test -- <path>` / `test:e2e:a11y` runs and the cloud Chromium recipe) · `angular-developer`
(**N/A — no component logic changed**: the diff is CSS custom properties, class strings and test
mirrors, so no signals/DI/control-flow API is in play. Named rather than omitted, per the
RV-PROC-1 gap #856's review flagged).

**Branch:** `claude/sdlc-861-n5p1gh` — **the cloud session's designated remote branch stands in
for `feature/solid-fill-teal-merge`** (`riviera-sdlc` §Remote/cloud session addendum). The literal
`feature/*` branch is deliberately not created.

---

## Acceptance criteria (testable)

> Frontend slice, so every AC names its seam explicitly.

- [ ] **AC-1:** Given the merged family, when `src/tailwind.css` is read as text, then
      `--riv-solid-fill-brand` declares `#0a6e85` and `--riv-solid-fill-brand-hover` declares
      `#0a5e72`, each exactly once and inside the base block. *Seam:* the `--riv-solid-fill-*`
      declarations in `src/tailwind.css`, read as text · *Pinned by:*
      `solid-fill-tokens.contrast.spec.ts` › "declares the values this test mirror carries" +
      "declares each token exactly once" + "declares the family in the base block"
- [ ] **AC-2:** Given the `-action` name is retired, when the frontend tree and the stylesheet are
      swept, then no `--riv-solid-fill-action`, `--color-riv-solid-fill-action`,
      `bg-riv-solid-fill-action` or `hover:bg-riv-solid-fill-action-hover` remains anywhere under
      `frontend/`, and the declaration comment no longer defers the question to #861. *Seam:* a
      source sweep over `src/tailwind.css` + `src/app/**` + `src/testing/**` + `e2e/**` ·
      *Pinned by:* `solid-fill-tokens.contrast.spec.ts` › "retires the -action name and the
      question it deferred"
- [ ] **AC-3:** Given white ink is fixed on every member, when the family's ratios are computed,
      then each clears AA (4.5:1) — the merged fill at **5.86:1**, its hover at 7.35:1, danger at
      7.84:1. *Seam:* the `SOLID_FILL_*` mirror in `src/testing/glass-tokens.ts` · *Pinned by:*
      `solid-fill-tokens.contrast.spec.ts` › "white ink clears AA on every fill in the family"
- [ ] **AC-4:** Given the three repainted sites, when each is rendered in a real browser, then its
      computed `background-color` is `rgb(10, 110, 133)` — the semantic chip on a discovery card,
      the layout editor's primary confirm button, and (by the same token) the console badge.
      *Seam:* the rendered box (`toHaveCSS`) · *Pinned by:* `solid-fill-token-skin.e2e.ts` › "the
      brand fill paints the semantic chip…" + "…and the shared confirm panel the brand fill";
      `discovery-flow.e2e.ts` (`SEMANTIC_FILL`); `layout-editor.e2e.ts` (confirm-yes)
- [ ] **AC-5:** Given the four sites whose paint does **not** move, when each is rendered after the
      rename, then its computed `background-color` is still `rgb(10, 110, 133)` — proving the
      utility rename did not silently drop a fill. *Seam:* the rendered box (`toHaveCSS`) ·
      *Pinned by:* `solid-fill-token-skin.e2e.ts` › "the console paints the brand fill, hover
      included" + "every registered token is declared and generates its utility"
- [ ] **AC-6:** Given a forced `dark` document theme, when the semantic chip is rendered on a
      surface that follows the document theme, then its fill is unchanged at `rgb(10, 110, 133)`.
      Mutation-checked: adding a dark override for the token must turn this red. *Seam:* the
      rendered box under `addInitScript` · *Pinned by:* `solid-fill-token-skin.e2e.ts` › "and does
      not move under a dark document theme"
- [ ] **AC-7:** Given the payouts export button, when it is hovered, then its fill moves to
      `rgb(10, 94, 114)` — a step that survives the merge (1.254:1 from the resting fill) and would
      not have survived the other direction (1.016:1). *Seam:* the hovered box (`toHaveCSS` after
      `.hover()`) · *Pinned by:* `solid-fill-token-skin.e2e.ts` › "the console paints the brand
      fill, hover included"
- [ ] **AC-8:** Given `#0a5f74` keeps six legitimate **non-fill** roles (CTA gradient stops, the
      editor selection ring, the amenity-chip/booking inks), when the family sweep runs, then every
      one of those files still paints it. *Seam:* the `SURVIVORS` sweep over `src/app/**` ·
      *Pinned by:* `solid-fill-tokens.contrast.spec.ts` › "leaves the non-fill roles of the same
      three values untouched"

## Non-goals

- **Retiring `#0a5f74` from the codebase.** It stays: both `--riv-cta-grad` stops, the set-editor
  and layout-editor selection rings, `amenity-chip`'s water ink, and three `booking/` inks are
  other roles and other audit classes. Only its **solid-fill** role is merged away (AC-8).
- **`semantic-chip`'s `border-[#2f7d92]`.** Out for the four reasons #854's Non-goals give; the
  merge does move its relationship to the fill, which is measured and accepted in R-4.
- **#848's `#0a6e85` `text-` ink sites.** Sixteen positions in `operator/`, a different form and a
  different ticket. This slice must not absorb them (R-6).
- **Any second value change.** `-danger` (`#a3160e`) and the hover (`#0a5e72`) keep their values.
- **A palette pass over the remaining near-duplicate, `#0c2a33` vs `#0a2a33`.** That is class O,
  ticket #852, and it is only the precedent this ticket cites — not its scope.

## Behavior-parity ledger

> The slice retires a token name and repaints three surfaces, so every member of the old family
> gets a row. The **unchanged-paint** rows are the point of this ledger: they are where a rename
> can drop a fill in silence, since the class stays in the markup and only the paint disappears.

| Old-surface behavior | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| `requests-tab.html:194` accept button fills `#0a6e85` via `bg-riv-solid-fill-action` | preserved (renamed) | same value through `bg-riv-solid-fill-brand`; pinned by AC-5's console assertion |
| `payouts-tab.html:114` export button fills `#0a6e85`, hovers `#0a5e72` | preserved (renamed) | `bg-riv-solid-fill-brand` + `hover:bg-riv-solid-fill-brand-hover`; both pinned by AC-5/AC-7 |
| `daily-view-tab.ts:609` selected day-state chip fills `#0a6e85` | preserved (renamed) | `bg-riv-solid-fill-brand`; its contrast spec reads the renamed mirror constant |
| `daily-view-tab.html:280` legend swatch fills `#0a6e85` | preserved (renamed) | `bg-riv-solid-fill-brand`; still no contrast assertion — `aria-hidden`, no ink (the #854 exemption stands) |
| `confirm-panel.ts:11` primary tone fills `#0a5f74` | **changed** | now `#0a6e85`. Class string is untouched (`bg-riv-solid-fill-brand` keeps its name), so **only** the computed-style proofs can see this: AC-4 via `layout-editor.e2e.ts` + `solid-fill-token-skin.e2e.ts` |
| `semantic-chip.ts:49` chip fills `#0a5f74` | **changed** | now `#0a6e85`; `chip-fills.ts` derives from the mirror so the three unit assertions follow, and `discovery-flow.e2e.ts`'s deliberate second copy is updated with it |
| `operator-console.html:70` request-count badge fills `#0a5f74` | **changed** | now `#0a6e85` — this is the site the issue calls its sharpest evidence, a deeper teal beside lighter-teal buttons in one porcelain-pinned shell; `operator-console.contrast.spec.ts`'s `BADGE_FILL` derives from the mirror |
| White ink (`text-white`) on every member | preserved | unchanged and unchangeable — it is the fixed position that pins the fills |
| `--riv-solid-fill-danger` on confirm-decline + destructive tone | preserved | untouched, value and name |
| The family's theme invariance (one declaration, base block, no dark override) | preserved | AC-1 + AC-6; the mutation check is re-run against the merged token |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The three repainted sites lose contrast: white ink goes 7.24:1 → **5.86:1** | certain (maths) | low | 5.86 clears AA (4.5) with margin at every one of them — all three are bold text, the smallest 11.5px. The family spec's floor is `AA_NORMAL` and stays the gate (AC-3). AAA was never claimed for this family | agent | accepted — measured, above floor |
| R-2 | A half-done rename leaves `bg-riv-solid-fill-action` in markup: the class survives, the utility does not, and the fill silently vanishes with **no unit spec able to see it** | med | high | AC-2's sweep bans the string tree-wide, and the e2e's utility-generation test asserts exactly the surviving utilities exist as real CSS selectors (AC-5) | agent | **closed** — sweep green, and the console/chip boxes measure the merged fill against a real render |
| R-3 | An over-eager sweep for `#0a5f74` breaks its six legitimate non-fill roles (CTA stops, rings, inks) | med | high | The family spec's `SURVIVORS` list asserts **positively** that each file still paints it (AC-8); the sweep regex keeps its `bg-` discriminator | agent | **closed** — green at phase 1, all six files still paint it |
| R-4 | `semantic-chip`'s `border-[#2f7d92]` was picked against the deeper fill; against the lighter one it separates less (1.54:1 → **1.248:1**) | certain (maths) | low | Decorative, and not the boundary WCAG 1.4.11 cares about: the chip is identified against the **card**, and the new fill sits at 5.39:1 there — far past the 3:1 non-text floor. Recorded, not acted on (Non-goals) | agent | accepted — measured, no floor crossed |
| R-5 | The rendered value is duplicated in **three** e2e files by design (`discovery-flow` keeps a deliberate second copy so it stays a black-box check); missing one leaves CI red, or worse, a stale-but-green literal | med | med | Enumerated by mechanism, not by memory: `grep -rn '10, 95, 116' frontend/` is the command that found the population (three hits), recorded in the Generalization-audit log | agent | **closed** — three found, three repinned, suite green |
| R-6 | #848 (T-2, the 16 `#0a6e85` **`text-` ink** sites) touches `requests-tab.html` and `payouts-tab.html`, the same two files this slice edits | low | med | No open PR exists on the repo today (checked at plan time), so there is nothing to collide with now. The edits are in different utility forms (`bg-` here, `text-` there) and different lines; **whoever merges second merges `main` in and re-runs the family spec.** Do not run the two concurrently | agent | **closed** — re-checked at phase 3: still no open PR on the repo, so nothing to collide with. #848 stays an issue; whoever starts it merges `main` in first |
| R-7 | No Flyway migration, no backend, no `V<n>` to claim | n/a | n/a | Frontend-only slice | — | N/A |

## Open questions / Assumptions

> Grill findings from the issue-intake gate (`riviera-sdlc` §issue-intake-gate), run against the
> code as it stands at `54995ec`.

_None open._

### Resolved

- **Assumption (closed at phase 1, `c564c46`):** the four `-action` sites are content to be
  called `-brand`. They are — the surviving token names a *form* (a solid brand fill under fixed
  white ink), which is what the family was grouped by in the first place, and "action" was never
  true of three of them (a day-state chip, an `aria-hidden` legend swatch, a count badge). All four
  renamed sites read correctly and their specs are green.

- **The decision itself — merge, onto `#0a6e85`.** Put to the maintainer with three options and
  the evidence below; **merge onto `#0a6e85`** chosen (2026-08-31, this session).
  1. **No role separates them.** The split is not surface-, element- or tone-based: *buttons*
     appear in both groups (`requests`/`payouts` under `-action`, `confirm-panel` primary under
     `-brand`) and so do *chips* (the day-state chip under `-action`, `semantic-chip` under
     `-brand`). The issue's own table said as much; the code confirms it.
  2. **The design canvases settle the direction.** `#0a6e85` appears **42 times** across all four
     `docs/design/*.dc.html` canvases (`grep -o` census); `#0a5f74` appears **zero** times. The
     deeper teal has no design provenance as a flat fill at all — it is the AA-darkened terminal
     of `--riv-cta-grad`, and `docs/plans/semantic-chips.md:16` records it being adopted for a
     chip fill precisely *as* "the `--riv-cta-grad` dark stop".
  3. **The hover breaks the tie.** `#0a5f74` against the family's existing hover `#0a5e72` is
     **1.016:1** — indistinguishable. Merging downward would have forced a fresh, un-designed
     hover value onto the payouts button; merging upward keeps the shipped 1.254:1 step.
  4. **Contrast does not object.** Both clear AA under white ink either way (5.86:1 and 7.24:1),
     which is exactly why the issue calls this a palette question and not a contrast one.
- **Is this fog (→ `wayfinder`) or a slice-answerable question?** Slice-answerable: it is one
  question, its evidence is entirely in-tree, and its execution is this plan. No decision ticket.
- **Is #854's close-out complete?** Yes — checked at intake: issue #854 closed, PR #860 merged,
  and the ledger's R-2 row already reads `done — #854, PR #860`. Nothing to back-fill.
- **What else is in flight?** Nothing: `list_pull_requests(state=open)` returns empty. #848 is an
  open *issue* over two files this slice touches — carried as R-6, not a blocker.

## Availability & concurrency (invariant #2)

N/A — no booking, beach-map or `availability` code is touched. This slice changes CSS custom
properties, Tailwind class strings and their test mirrors.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend Java, no module boundary, no event.

### Module ownership (§4a)

N/A — frontend-only; the slice adds no backend behavior to own.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money is displayed, computed or moved by any touched surface.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/tailwind.css` | existing | token registry (`@theme inline` + base block) | none | — |
| FE-2 | `app/operator/requests-tab.html`, `payouts-tab.html`, `daily-view-tab.ts\|.html` | existing | class strings only | unchanged | — |
| FE-3 | `app/shared/confirm-panel.ts`, `semantic-chip.ts`, `app/operator/operator-console.html` | existing | **no edit** — they keep the `-brand` class and inherit the new value | unchanged | — |
| FE-4 | `src/testing/glass-tokens.ts`, `chip-fills.ts` | existing | spec mirrors | none | — |

**Standards:** no component logic changes — no signals, DI, control flow or template structure is
touched, so the Angular API surface is unchanged. Tailwind utilities stay the named-token form
(`bg-riv-solid-fill-brand`), never an arbitrary value, per `riviera-tailwind` tier 1.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or wire shape is touched.

## Execution status

**Stage pointer:** `PR — ready for review; review gate due`

**Next action:** Run the review gate per `riviera-sdlc` `references/pr-gates.md` §1 (the
`/code-review` ladder plus `riviera-review-overlay`), then the Sonar gate's issue list.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The merged registry, red | ✅ | `440f788` |
| 1 — Merge the declaration + rename the four sites, green | ✅ | `c564c46` |
| 2 — The computed-style proofs + the mutation check | ✅ | `a233a08` |
| 3 — Docs, ledger row and close-out | ✅ | `31da33b` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/solid-fill-teal-merge.md` — this plan doc.
- `frontend/src/tailwind.css` — the merged declaration + its `@theme inline` rows; the comment
  now answers #861 instead of deferring it.
- `frontend/src/testing/glass-tokens.ts` — `SOLID_FILL_BRAND` takes `#0a6e85`,
  `SOLID_FILL_BRAND_HOVER` replaces `SOLID_FILL_ACTION_HOVER`, `SOLID_FILL_ACTION` retires.
- `frontend/src/testing/chip-fills.ts` — the `SEMANTIC_CHIP` mirror's comment follows the merge
  (its value already derives from `SOLID_FILL_BRAND`).
- `frontend/src/app/shared/solid-fill-tokens.contrast.spec.ts` — merged `FAMILY`, the new
  retirement assertion, the `SURVIVORS` sweep kept green.
- `frontend/src/app/operator/requests-tab.html|payouts-tab.html|daily-view-tab.ts|daily-view-tab.html`
  — the four `bg-riv-solid-fill-action` class strings (and the one hover) renamed to `-brand`.
- `frontend/src/app/operator/requests-tab.contrast.spec.ts|payouts-tab.contrast.spec.ts|daily-view-tab.contrast.spec.ts|operator-console.contrast.spec.ts`
  — the renamed mirror constant (in phase 0, per that phase's recorded deviation).
- `frontend/e2e/solid-fill-token-skin.e2e.ts` — the merged `REGISTRY`, `UTILITIES` and expected
  rgb triples; the forced-dark test re-mutation-checked.
- `frontend/e2e/discovery-flow.e2e.ts` — `SEMANTIC_FILL`'s deliberate second copy.
- `frontend/e2e/layout-editor.e2e.ts` — the confirm-yes computed fill.
- `docs/design/colour-literal-token-audit.md` — the R-2 row notes the follow-up merge.
- `docs/plans/solid-fill-token-family.md` — G-4 moves from "deferred to #861" to its answer.
- `docs/plans/semantic-chips.md` — the as-built pointer for a fill that is no longer the CTA stop.

---

## Phase 0 — The merged registry, red

**Files:** Modify `frontend/src/testing/glass-tokens.ts` · Modify
`frontend/src/app/shared/solid-fill-tokens.contrast.spec.ts`

- [x] **Step 1: Write the failing test.** Point the mirror at the merged value and add the
      retirement assertion to the family spec:

```ts
// src/testing/glass-tokens.ts
/** The solid brand fill under fixed white ink — one value since #861 merged `-action` into it. */
export const SOLID_FILL_BRAND: Rgb = hexToRgb('0a6e85');
export const SOLID_FILL_BRAND_HOVER: Rgb = hexToRgb('0a5e72');
export const SOLID_FILL_DANGER: Rgb = hexToRgb('a3160e');

// src/app/shared/solid-fill-tokens.contrast.spec.ts
const FAMILY = {
  '--riv-solid-fill-brand': rgbToHex(SOLID_FILL_BRAND),
  '--riv-solid-fill-brand-hover': rgbToHex(SOLID_FILL_BRAND_HOVER),
  '--riv-solid-fill-danger': rgbToHex(SOLID_FILL_DANGER),
} as const;

it('retires the -action name and the question it deferred', () => {
  expect(STYLESHEET).not.toMatch(/--(color-)?riv-solid-fill-action/);
  expect(STYLESHEET).not.toContain('#861 settles whether');
  expect(componentSources().filter((p) => /riv-solid-fill-action/.test(read(p)))).toEqual([]);
});
```

- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include="src/app/shared/solid-fill-tokens.contrast.spec.ts"`
      → **FAIL, 4 assertions**: the merged value (`expected '#0a5f74' to be '#0a6e85'`),
      `-brand-hover` missing from the base block, `--riv-solid-fill-brand` declared more than the
      merged family allows, and the retirement sweep still finding `--riv-solid-fill-action`.

> **Deviation from the plan as written, recorded rather than smoothed over:** the three consumer
> contrast specs (`daily-view-tab`, `payouts-tab`, `requests-tab`) and `operator-console`'s
> `BADGE_FILL` import the mirror constant by name, and `ng test` type-checks the whole project
> even under `--include`. Renaming the mirror alone therefore yields a *compile* error, not a
> failing assertion — a red that proves nothing. Their one-word rename moved into this phase so
> the red is a real assertion; phase 1 keeps only the paint change.

- [x] **Step 3: Minimal implementation** — none in this phase; the red is the deliverable.

- [x] **Step 4:** n/a — phase 1 turns it green.

- [x] **Step 5: Generalization-audit pass** — deferred to phase 2, where the mechanism sweep runs.

- [x] **Step 6: Commit** — `git commit -m "Pin the merged solid-fill teal in the spec mirror, red (#861)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Merge the declaration and rename the four sites, green

**Files:** Modify `frontend/src/tailwind.css` · Modify the four `operator/` sites · Modify their
three contrast specs · Modify `frontend/src/testing/chip-fills.ts`

- [x] **Step 1: The declaration.** Collapse the two tokens and their `@theme inline` rows, and
      rewrite the tail of the family comment so it states the answer:

```css
@theme inline {
  --color-riv-solid-fill-brand: var(--riv-solid-fill-brand);
  --color-riv-solid-fill-brand-hover: var(--riv-solid-fill-brand-hover);
  --color-riv-solid-fill-danger: var(--riv-solid-fill-danger);
}

  /* ONE brand teal, not two (#861): `-action` (#0a6e85) and `-brand` (#0a5f74) were the same
     job — a solid fill under fixed white ink — with no role between them, so they merged onto
     #0a6e85. That is the design's brand teal (42 uses across the four canvases; #0a5f74 appears
     in none — it is the AA-darkened END STOP of --riv-cta-grad, eyedropped into three flat
     fills). It is also the only direction the hover survives: #0a5f74 against -brand-hover
     #0a5e72 is 1.016:1, the same colour to the eye. */
  --riv-solid-fill-brand: #0a6e85;
  --riv-solid-fill-brand-hover: #0a5e72;
  --riv-solid-fill-danger: #a3160e;
```

- [x] **Step 2: The four renames** — `bg-riv-solid-fill-action` → `bg-riv-solid-fill-brand` in
      `requests-tab.html:194`, `payouts-tab.html:114`, `daily-view-tab.ts:609`,
      `daily-view-tab.html:280`; and `hover:bg-riv-solid-fill-action-hover` →
      `hover:bg-riv-solid-fill-brand-hover` in `payouts-tab.html:114`. Then the three consumer
      contrast specs' `SOLID_FILL_ACTION` import → `SOLID_FILL_BRAND`.

- [x] **Step 3: Run the scoped unit suite** —
      `npx ng test --watch=false --include="src/app/shared/**/*.spec.ts" --include="src/app/operator/**/*.spec.ts"`
      → **98 files, 903 tests, all green** — including the `SURVIVORS` sweep (R-3),
      `confirm-panel.spec.ts`'s untouched `bg-riv-solid-fill-brand` assertion, and the three
      `semantic-chip` assertions that follow the mirror.

- [x] **Step 4: Lint + format** — `npm run lint` (exit 0; the one warning is a pre-existing unused
      `eslint-disable` in `camera-qr-scanner.spec.ts`, untouched by this diff, landed with the
      typescript-eslint bump `1af69b3`) and `npm run format:check` → clean.

- [x] **Step 5: Generalization-audit pass** — deferred to phase 2 with the e2e sweep.

- [x] **Step 6: Commit** — `git commit -m "Merge the two solid-fill teals onto #0a6e85 (#861)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The computed-style proofs and the mutation check

**Files:** Modify `frontend/e2e/solid-fill-token-skin.e2e.ts` ·
`frontend/e2e/discovery-flow.e2e.ts` · `frontend/e2e/layout-editor.e2e.ts`

- [x] **Step 1: Enumerate by mechanism, not memory.** The population is *every place that pins the
      old fill as a rendered value*: `grep -rn '10, 95, 116' frontend/` → three files. Record it in
      the Generalization-audit log with that command (R-5).

- [x] **Step 2: Update the three** — `BRAND`/`ACTION` collapse to one `rgb(10, 110, 133)` in
      `solid-fill-token-skin.e2e.ts` (with its `REGISTRY` and `UTILITIES`), `SEMANTIC_FILL` in
      `discovery-flow.e2e.ts`, and the confirm-yes assertion in `layout-editor.e2e.ts`.

- [x] **Step 3: Run the mocked suite** — the three repinned specs first
      (`solid-fill-token-skin` 5/5, `discovery-flow` + `layout-editor` 22/22), then the whole
      mocked suite: **335 passed, 1 failed**. The failure is `customer-password.e2e.ts:47`, which
      **passes in isolation** (4/4) and shares nothing with this diff — zero hits for any touched
      token, class or triple — in a file whose subject is the per-IP change-password budget, the
      shared-state shape `riviera-local-debug` documents as the full-suite-only class (#127). Not
      this slice's; CI arbitrates, and if it is red there it is red on `main` too.

- [x] **Step 4: Mutation-check AC-6** — `--riv-solid-fill-brand: #7cd7e8` added to the dark block.
      **The forced-dark test died and only it** (`unexpected value "rgb(124, 215, 232)"`, 1 failed /
      4 passed) — the console tests survive because the porcelain pin is real, which is the
      asymmetry #854 designed for. The unit guard caught the same mutation independently
      (`--riv-solid-fill-brand declarations: expected [ '#0a6e85', '#7cd7e8' ] to have a length of 1`).
      Reverted; `tailwind.css` diffs byte-identical to its pre-mutation copy.

- [x] **Step 5: Generalization-audit pass** — as Step 1; append the row.

- [x] **Step 6: Commit** — `git commit -m "Repin the rendered teal in the three computed-style proofs (#861)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Docs, ledger row and close-out

**Files:** Modify `docs/design/colour-literal-token-audit.md` ·
`docs/plans/solid-fill-token-family.md` · `docs/plans/semantic-chips.md` · this plan doc

- [x] **Step 1: The ledger.** The R-2 row's `done` stands; note the follow-up merge and this PR
      beside it, so a reader of the class-R table sees the family ended at one teal.

- [x] **Step 2: G-4's answer.** In `docs/plans/solid-fill-token-family.md`, the G-4 entry currently
      ends "issue #861 records the question" — extend it with the answer and this PR. History is
      not rewritten; the outcome is appended.

- [x] **Step 3: The stale fact.** `docs/plans/semantic-chips.md:16` states the chip fill **is** the
      `--riv-cta-grad` dark stop. That was true and is no longer; add the as-built pointer per
      `docs/design/README.md`'s convention rather than editing the historical claim.

- [x] **Step 4: `riviera-docs-freshness`** over `origin/main...HEAD`, both sweeps. **3 findings,
      all patched** (steps 1–3 above are them). The counting sweep's own catch was inside the diff:
      the surviving declaration comment still said "three literals" and "White clears AA on all four
      (5.86 / 7.35 / 7.24 / 7.84)" — both false the moment the fourth value left; fixed at phase 1.
      Re-run after the fix round: clean. Deliberately **not** patched, per the skill's scope
      discipline: the parity-ledger rows in `shared-confirm-panel.md` and
      `scss-tailwind-operator-console.md` that record `#0a5f74` — those are records of what those
      slices preserved at the time, not present-tense claims. `semantic-chips.md` differs because
      its sentence sits in **Architecture** and reads as a current fact, so it got the pointer.

- [x] **Step 5: File-structure guard** — `node scripts/check-plan-file-structure.mjs --diff origin/main`
      with this doc staged.

- [x] **Step 6: Commit** — `git commit -m "Record the teal merge in the ledger and the sibling plan docs (#861)"`

- [ ] **Step 7: Finalize the execution status** in the PR's own last commit, citing
      `merged via PR #NN`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-31 | phase 2 | Every place that pins the **old fill as a rendered value** — the mechanism is "asserts a computed `background-color` triple", not "is an e2e file about teal". Enumerated by the rgb triple the browser reports, which is the only form these assertions take | `grep -rn "10, 95, 116" frontend/ --include=*.ts` | 3: `solid-fill-token-skin.e2e.ts:32`, `layout-editor.e2e.ts:505`, `discovery-flow.e2e.ts:19` | all three repinned to `rgb(10, 110, 133)`. The sweep is what found `layout-editor.e2e.ts` — an inline literal in a spec about grid regeneration, which no search for "teal" or "chip" would have returned |

---

## Acceptance-criteria verification (final)

All eight verified at `a233a08`; the unit runs at `c564c46`, the e2e runs at `a233a08`.

- [x] **AC-1:** `npx ng test --watch=false --include="src/app/shared/solid-fill-tokens.contrast.spec.ts"`
      → 8/8 PASS, including the value, single-declaration and base-block assertions.
- [x] **AC-2:** same run → "retires the -action name and the question it deferred (#861)" PASS.
- [x] **AC-3:** same run → "white ink clears AA on every fill in the family" PASS (5.86 / 7.35 / 7.84).
- [x] **AC-4:** `playwright --config=playwright.a11y.config.ts` → `solid-fill-token-skin` 5/5,
      `discovery-flow` + `layout-editor` 22/22; all three now assert `rgb(10, 110, 133)`.
- [x] **AC-5:** same run → "the console paints the brand fill, hover included" and "every registered
      token is declared and generates its utility" PASS — the rename dropped no paint.
- [x] **AC-6:** same run PASS, **and the mutation turned it RED alone** (`unexpected value
      "rgb(124, 215, 232)"`), with the unit guard catching it independently.
- [x] **AC-7:** same run → resting `rgb(10, 110, 133)` → hovered `rgb(10, 94, 114)` PASS.
- [x] **AC-8:** the family spec's `SURVIVORS` sweep PASS — all six non-fill files still paint `#0a5f74`.
- Whole-suite context: `src/app/shared` + `src/app/operator` = **903 unit tests green**; the mocked
  e2e suite = **335 green, 1 unrelated** (`customer-password.e2e.ts`, green in isolation — phase 2
  step 3).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section justified N/A (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [x] Refund policy (invariant #10) — N/A.
- [x] Timezone (invariant #6) — N/A.
- [x] Booking codes (invariant #7) — N/A.
- [x] Flyway (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met: named token utilities, no arbitrary fill values reintroduced,
      no component logic touched.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `references/pr-gates.md` §1 ladder *plus*
      `riviera-review-overlay`.
