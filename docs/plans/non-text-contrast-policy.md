# Non-text contrast policy (`docs/design/non-text-contrast.md`) Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the sub-3:1 non-text chrome question a **live, named home** — a written rule
at `docs/design/non-text-contrast.md` that every deferring token comment cites instead of the
closed #834 — and pin the one boundary the tree measures but never asserts (the CTA's
dark-theme edge). No token value moves; no surface is repainted.

**Architecture:** Two decisions, both settled at the intake grill rather than assumed.

**(1) The CTA is not a violation, and the issue's premise is a measurement artifact.**
#876 reports the dark-theme CTA fill at 2.23–3.16:1 against the card glass. That number
reproduces exactly — but it pairs the fill with a surface it is **never adjacent to**: the
white `--riv-cta-border` hairline sits between them. WCAG 1.4.11 asks for 3:1 against
*adjacent* colour(s), and measured that way the CTA's boundary against its host card clears
3:1 in **every** theme — carried by the fill in the light themes (porcelain 5.03–7.24:1,
riviera 3.80–6.90:1) and by the hairline in dark (**5.52–6.77:1**). The two carriers swap
because the fill is a fixed mid-teal: light glass makes the fill the high-contrast half, dark
glass makes the white hairline it. So no palette change is needed, and the issue's proposed
remedy is additionally impossible **in the direction it states**: the darkest dark backdrop is
luminance 0.0152, so reaching 3:1 by *darkening* would need a fill of luminance ≤ −0.028.
Only lightening can get there, and it trades directly against the label — `#0e8aa8` lifts the
boundary to 4.01:1 but drops the 15px bold white CTA text to **4.02:1**, under AA for text
that size.

**(2) The light-on-glass families genuinely need the exemption, and it gets written down
once.** `--riv-solid-btn-*`, `--riv-accent-*`, `--riv-medallion-negative-border` and
`--riv-amenity-*-border` are pale fills on pale glass: in the two light themes **neither** the
fill nor the border clears 3:1 (1.00–2.06:1 across the families; all are comfortable in dark
at 7.8–17:1, where a light chip on a dark card is inherently high-contrast). These are the
real claimants of the "identifiable by its content" argument, and after four deferrals it
becomes a named rule with a **forced-colors clause** as supporting ground: every one of these
families paints a real `border`, and the tree opts out nowhere (`forced-color-adjust` appears
zero times under `frontend/src`), so OS high-contrast mode already repaints each boundary with
a system colour.

**The rule doc cites spec names, never restates ratios.** Each family's measured band already
lives in an assertion; duplicating the numbers into prose would create a second drift surface
that nothing checks. The doc names the rule and the families; the specs own the arithmetic.

**Persistence:** N/A — frontend styling + design substrate only; no tables, no migrations
(invariants #1/#12 untouched).

**Source of intent:** GitHub issue
[#876](https://github.com/ivopogace/riviera-sunbed-booking/issues/876), surfaced by the
#853 / PR #875 merge close-out (step 3, propagate deferred findings).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — **caught the
central error**: the dark-CTA "failure" is a fill-vs-non-adjacent-surface pairing, and the
ticket's "darker hue" remedy is impossible against a dark backdrop; also caught that the
issue's "five families" is **six** — `--riv-amenity-{tag,water}-border` cite #834 too and are
unlisted — and that two **spec** files carry pointers, one of them a live deferral) ·
`riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is where the
"no visual change" claim gets verified position-by-position rather than asserted) · `tdd`
(phase 2's guard is genuinely red — 12 stale citations exist — before the repointing turns it
green; phases 1 and 3 are honest characterization, flagged as such) · `riviera-review-overlay`
(review gate — runs at ready-for-review) · `riviera-docs-freshness` (due at close-out over
`origin/main..HEAD`; the counting sweep already has one pre-identified target — see F-1) ·
`riviera-tailwind` (the theme-invariant-token rule and "a fixed surface pins what is painted
on it", which is *why* the two boundary carriers swap between themes rather than one carrying
it everywhere; also confirmed the `@theme inline` multi-theme pattern against Tailwind's own
Colors § "Referencing other variables", and the `/opacity` → `color-mix(in oklab, …,
transparent)` compilation against the v4 announcement — the two Tailwind facts the ledger's
class O and these token comments rest on) · `riviera-frontend` (placement: the rule is design
substrate under `docs/design/`, beside the ledger that cites it; the new assertions extend the
**existing** `shared/cta-border-token.contrast.spec.ts` rather than adding a file) ·
`angular-developer` + the **angular-cli MCP** (`search_documentation` v22 for
`"color contrast"` and `"WCAG contrast ratio styling colors accessibility"` — **0 results
both**; Angular's a11y guide is ARIA/native-elements/focus-management only and defers colour
entirely, and the repo's `angular.configs.templateAccessibility` preset has no contrast rule.
That absence is load-bearing: it is why this judgement has to be written down by hand) ·
`riviera-local-debug` (scoped `npm test` for the two touched spec files in a cloud session).

**Branch:** `claude/tailwind-angular-mcp-docs-j6y0aq` — the cloud session's designated branch
**stands in for** `feature/non-text-contrast-policy` (`riviera-sdlc` § Remote/cloud session
addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the CTA's two `--riv-cta-grad` stops composited over each theme's card
      glass on each of that theme's four background stops, when the boundary is measured
      against the **adjacent** colour — the fill where the fill abuts the glass, the
      `--riv-cta-border` hairline where the hairline does — then at every stop in all three
      themes at least one carrier reaches ≥ 3:1, and the dark theme's carrier is the hairline
      at ≥ 5.5:1. *Seam:* `testing/contrast` composited maths over the `testing/glass-tokens`
      mirror · *Pinned by:* `cta-border-token.contrast.spec.ts` › "the boundary against the
      host card clears 3:1 in every theme — the fill carries it in light, the hairline in
      dark".

- [ ] **AC-2:** Given the same maths, when the CTA fill alone is measured against the card
      glass in the **dark** theme, then it records a 2.23–3.16:1 band whose **floor is under
      3:1** — the failure #876 reported is real at the worst stop — and the test states that this
      pairing is nonetheless not the 1.4.11 comparison, because the hairline lies between the two. *Seam:* as AC-1 · *Pinned by:* `cta-border-token.contrast.spec.ts` › "the
      fill-vs-glass pairing #876 reported is not the adjacent pair".

- [ ] **AC-3:** Given `frontend/src` read as text, when every `#834` citation is enumerated,
      then no citation remains that defers a *live* question to it — each such site instead
      names `docs/design/non-text-contrast.md`, and the citations that record #834's own
      completed work (the erasure panel) are permitted to remain by an explicit allow-list
      naming each one. *Seam:* the source tree, via the `allSources()` reader
      `cta-border-token.contrast.spec.ts` already uses · *Pinned by:*
      `cta-border-token.contrast.spec.ts` › "no token comment defers a live 1.4.11 question to
      the closed #834".

- [ ] **AC-4:** Given `frontend/src` read as text, when `forced-color-adjust` is searched for,
      then **no** site opts out (`forced-color-adjust-none` / `forced-color-adjust: none`) —
      the precondition the rule's forced-colors clause rests on, so that the clause fails loudly
      if a future slice opts a surface out. *Seam:* as AC-3 · *Pinned by:*
      `cta-border-token.contrast.spec.ts` › "nothing opts out of forced-colors, which is what
      the exemption's fallback clause rests on".

- [ ] **AC-5:** Given `docs/design/non-text-contrast.md`, when it is read, then it states the
      rule in one named sentence, lists each exempt family with a link to the spec that
      measures it (no restated ratios), records the forced-colors clause, and states the
      adjacent-colour reading that AC-1 pins. *Seam:* the file itself · *Pinned by:* review —
      documentation, not machine-checkable; deliberately not faked into an assertion.

## Non-goals

- **Any palette or token-value change.** Decided at the grill: the CTA needs none (AC-1), and
  the light-on-glass families take the exemption rather than a repaint. A slice that repaints
  the outline-button skin remains available as a future ticket; this one does not open it.
- **A forced-colors e2e proof.** Offered and declined — the clause is recorded as supporting
  ground with its precondition guarded (AC-4), not proven under `forcedColors: 'active'`. That
  would be a new e2e pattern the repo has never used; it wants its own slice if wanted at all.
- **Repointing every 1.4.11 mention.** 24 files mention 1.4.11; the population this slice owns
  is the **#834-citing deferral** set, enumerated by mechanism (`grep -rn '#834' frontend/src`).
  Sites that assert compliance need nothing.
- **Rewriting merged plan docs.** `docs/plans/*.md` are historical records and cite #834 as it
  stood. The one exception is `admin-error-ink-tokens.md:297`, which states as present fact
  that #834 is still open — one line, corrected (see F-1).
- **#852 and #849.** This slice settles the *ratio-acceptability* question those two will hit;
  it does not migrate any of their 27 `border-` `/opacity` positions. Both counts in the issue
  were re-run and hold exactly (27 of 44).

## Behavior-parity ledger

> The slice's whole claim is "no visual change". Per the template that claim is aspirational
> until verified, so it is verified position-by-position.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Every `--riv-*` token in scope paints its current value in all three themes | **preserved** (byte-identical) | No declaration is edited — only the TSDoc/CSS comments above them, plus the ledger and one plan-doc line. Phase 2's guard reads comments, never values |
| `cta-border-token.contrast.spec.ts` asserts the hairline is decorative (< 3:1 over its own fill, > 2:1) | **preserved** | Untouched. AC-1/AC-2 are *added* tests measuring the **outward** pair; the existing inward assertions stay exactly as they are |
| The affordance test iterates porcelain + riviera only, leaving the dark theme unasserted | **changed** | Deliberate: the dark theme's numbers existed only in prose (issue, plan doc, token comment). AC-1 brings dark under assertion for the first time |
| `--riv-danger-*`'s comments credit #834 for the erasure-panel work it actually did | **preserved** | Those are history, not deferrals. AC-3's allow-list names them so the guard does not force a wrong edit |
| Every consumer's class string, radius, padding, shadow, focus ring and transition | **preserved** | No component file is touched at all — the diff reaches no `frontend/src/app/**` file except two `.contrast.spec.ts` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The adjacent-colour reading is *my* reading of 1.4.11, not a cited authority — w3.org is egress-blocked in this session, so the SC text was confirmed via WebSearch summaries rather than fetched primary text | med | med | State the reading explicitly in the rule doc as a project position with its reasoning, rather than presenting it as quoted normative text; record that the primary source could not be fetched here so a later session re-verifies cheaply | agent | open |
| R-2 | AC-3's allow-list becomes a rubber stamp — a future slice adds a fresh deferral to #834 and simply appends it to the list | med | med | The allow-list enumerates **exact** sites (file + the sentence's distinguishing phrase), not file names, so a new deferral cannot be absorbed silently; the rule doc says appending requires the same argument #834's own citations have | agent | open |
| R-3 | A 1px hairline carrying the dark-theme boundary is thin — 1.4.11 sets no minimum thickness (unlike 2.4.11/2.4.13 for focus), so the reading is defensible but not free | low | med | Record the thinness as a stated caveat in the rule doc rather than omitting it; the CTA additionally carries a `focus-visible` outline at 3px and a white bold label at 5.56–7.24:1, neither of which the boundary question depends on | agent | open |
| R-4 | The rule doc drifts from the specs' numbers | low | med | Architecture decision: the doc cites spec **names**, never ratios. There is one number-bearing surface, not two | agent | closed by design |
| R-5 | Merge conflict with a sibling #836 slice touching `tailwind.css` / `glass-tokens.ts` | med | low | Comment-only edits, append-nothing; merge `origin/main` before ready-for-review. No Flyway number in play (frontend + docs only) | agent | closed — `origin/main` (`c055bcd`) is already an ancestor of this branch at PR-open; re-check before marking ready |
| R-6 | The forced-colors clause overstates what forced-colors mode guarantees — it forces `border-color`, but a boundary carried by a gradient or `box-shadow` is not equivalently rescued | med | med | The clause is scoped in the doc to families that paint a real `border` (all six do), and AC-4 guards the opt-out precondition. The CTA's gradient fill is explicitly *not* leaned on for this clause — its boundary is settled by AC-1 instead | agent | open |

## Open questions / Assumptions

- **Assumption:** the four `DARK_STOPS` in `testing/glass-tokens.ts` are the full population of
  backgrounds a CTA can sit on in the dark theme. — *Owner:* agent · *Resolves by:* phase 1
  (the existing affordance test makes the same assumption for the two light themes; phase 1
  reuses its population rather than inventing one).

### Resolved

- **Open question (closed at the intake grill, by `AskUserQuestion`):** is the dark-theme CTA a
  1.4.11 violation? **No** — the reported failure pairs the fill with a non-adjacent surface;
  the boundary clears 3:1 in every theme once measured against the adjacent colour. The
  maintainer accepted the adjacent-colour reading; the issue's second checkbox closes as
  not-needed.
- **Open question (closed the same way):** is "identifiable by its content" the project's
  settled position for the light-on-glass families? **Yes**, adopted as a written rule with the
  forced-colors clause as supporting ground — not a repaint, and not a per-family exclusion.
- **Open question (closed the same way):** where does the rule live? A **new
  `docs/design/non-text-contrast.md`**, beside the ledger that cites it — not an ADR (ADRs here
  are architectural) and not a section of the ledger (which is a migration tracker with an end
  date, while this rule outlives it).
- **Open question (closed by documentation search, phase −1):** do Angular or Tailwind take a
  position that should bind this decision? **Neither does.** Angular v22 docs return 0 results
  for contrast queries and scope a11y to ARIA/focus; Tailwind's Colors and border-color pages
  give no contrast guidance and its entire Accessibility section is the single
  `forced-color-adjust` page. The one usable contribution is that page, which is where the
  forced-colors clause came from.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice touches design-substrate documentation and two
frontend contrast specs; it reaches no booking, map, or `availability` code, and writes no row.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is in scope.

### Module ownership (§4a)

N/A — the slice adds no behavior. It adds one documentation file and assertions over values
that already exist.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (`auth/`'s and `booking/`'s CTA buttons are *styled* by a token
under discussion; no payment path, amount, or ledger entry is read or written.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `app/shared/cta-border-token.contrast.spec.ts` | existing | Vitest unit spec (jsdom) | none — pure maths over the `testing/glass-tokens` mirror | none |
| FE-2 | `app/admin/accent-tokens.contrast.spec.ts` | existing | Vitest unit spec | none — comment repoint only | none |
| FE-3 | `app/admin/admin-console.contrast.spec.ts` | existing | Vitest unit spec | none — comment repoint only | none |

**Standards:** no component, service, route, or template is created or modified, so the
standalone/`inject()`/signal-API standards have no surface here. The two new assertions follow
the file's established shape (a `describe` block over `FIXED_FILLS` / theme tuples, `expect`
with a per-stop message) and the existing source-scanning tests' `allSources()` reader.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `CI gate — draft PR #877 open, awaiting the first run`

**Next action:** Wait for PR #877's first CI run. `origin/main` is already an ancestor of this branch, so no merge is due. When CI is green, mark the PR ready for review — that is what makes the Review and Sonar gates due.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the rule doc + ledger repoint | ✅ | `f232a1b` |
| 1 — the CTA adjacent-colour assertions (AC-1, AC-2) | ✅ | `bab733d` |
| 2 — the stale-deferral guard, then the repointing it forces green (AC-3) | ✅ | `443a1a0` |
| 3 — the forced-colors precondition guard + its doc clause (AC-4) | ✅ | `443a1a0` — **landed with phase 2**, both guards being one edit to one file; kept as separate ACs |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | intake grill (docs-freshness counting sweep, pre-identified) | `docs/plans/admin-error-ink-tokens.md:297` states "The three follow-up issues stay open: **#834** …" — #834 closed 2026-08-31, so the sentence is false at HEAD | fixed in phase 0 |
| F-4 | phase 0 (counting sweep, in situ) | `docs/design/README.md` calls the ledger "the one exception" to the design-record convention; this slice adds a second maintained `.md` | fixed in phase 0 |
| F-2 | intake grill | The issue's family list is incomplete: `--riv-amenity-tag-border` (1.15:1) and `--riv-amenity-water-border` (1.17:1) cite #834 at `tailwind.css:482` and `glass-tokens.ts:323` and are unlisted — six families, not five | open → covered by AC-3's enumeration |
| F-3 | intake grill | Two **spec** files carry #834 pointers the issue does not mention; `accent-tokens.contrast.spec.ts:52` ("Raising it to compliance is #834's") is a live forward deferral, `admin-console.contrast.spec.ts:42` is history | open → AC-3 splits them: repoint the first, allow-list the second |
| F-5 | phase 1 (self-inflicted) | AC-2 as first written asserted the whole 2.23–3.16 band under 3:1; only the **floor** is. The test caught it — the AC wording was loose, not the measurement | fixed in phase 1 |
| F-6 | phase 2 (self-caught, pre-commit) | The medallion border was first repointed at **rule 2**, but it is an `aria-hidden` decorative glyph, not a control identified by its content — a different 1.4.11 ground. Blurring them would let anything pale claim the exemption | fixed in phase 2: the doc gained **rule 2a** and both medallion citations name it |

---

## File structure

- `docs/design/non-text-contrast.md` — **new.** The named rule, its forced-colors clause, the
  adjacent-colour reading, and the per-family index pointing at each measuring spec.
- `docs/design/README.md` — **found mid-phase-0.** It declares `colour-literal-token-audit.md`
  "the one exception" to the design-record convention; a second maintained `.md` makes that
  sentence false, so the section becomes "the exceptions" and gains a paragraph for the new
  rule. Exactly the counting-sweep shape `riviera-docs-freshness` warns about.
- `docs/design/colour-literal-token-audit.md` — repoint the two #834 citations (the class-R row
  at :202 and the F-3/F-5 measured-borders note at :127) at the new rule.
- `docs/plans/admin-error-ink-tokens.md` — one line (:297): #834 is closed, not open (F-1).
- `docs/plans/non-text-contrast-policy.md` — this plan doc.
- `frontend/src/tailwind.css` — repoint the deferral citations above `--riv-cta-border`,
  `--riv-accent-*`, `--riv-solid-btn-*`, `--riv-medallion-negative-border` and
  `--riv-amenity-*-border`; leave the two history citations (`--riv-danger-*`,
  `--riv-wash-hover-border`) intact and allow-listed.
- `frontend/src/testing/glass-tokens.ts` — the same repointing over its four citation sites.
- `frontend/src/app/admin/accent-tokens.contrast.spec.ts` — repoint the live deferral at :52.
- `frontend/src/app/admin/admin-console.contrast.spec.ts` — clarify that its #834 reference is
  the completed erasure-panel decision, so the allow-list entry is self-evident.
- `frontend/src/app/shared/cta-border-token.contrast.spec.ts` — the AC-1/AC-2 adjacent-colour
  assertions and the AC-3/AC-4 source guards.

---

## Phase 0 — The rule doc + ledger repoint

**Files:** Create `docs/design/non-text-contrast.md` · Modify
`docs/design/colour-literal-token-audit.md:127,202` · Modify
`docs/plans/admin-error-ink-tokens.md:297`

- [ ] **Step 1:** Write `docs/design/non-text-contrast.md` — the rule in one named sentence;
      the adjacent-colour reading with the CTA as its worked example; the forced-colors clause
      scoped to families painting a real `border`; the thinness caveat (R-3); the primary-source
      caveat (R-1); and a family index citing each measuring spec **by name, with no restated
      ratios** (R-4).
- [ ] **Step 2:** Repoint the ledger's two citations and correct F-1's one-line falsehood.
- [ ] **Step 3: Commit** — `git commit -m "Give the sub-3:1 non-text chrome question a live home (#876)"`
- [ ] **Step 4:** Update this plan doc's Execution status in the same commit window.

> Docs-only phase: no test to run red. The rule doc is AC-5, which is review-verified by
> design — deliberately not faked into an assertion.

## Phase 1 — The CTA adjacent-colour assertions (AC-1, AC-2)

**Files:** Test `frontend/src/app/shared/cta-border-token.contrast.spec.ts`

- [ ] **Step 1:** Write both tests, reusing the existing affordance test's theme tuples and
      extending them with the dark theme (`DARK_CARD_GLASS` + `DARK_STOPS`).
- [ ] **Step 2: Run** — `npm test -- cta-border-token` (per `riviera-local-debug`'s scoped
      discipline).
- [ ] **Step 3:** Verify the numbers land where the grill measured them: light carriers
      5.03–7.24 / 3.80–6.90, dark hairline 5.52–6.77, dark fill 2.23–3.16.

> **Honest labelling:** this phase is **characterization, not red-green.** The values already
> comply; the tests bring an unasserted boundary under assertion for the first time. Do not
> dress it up as a red test — say so in the commit body.

- [ ] **Step 4: Commit** — `git commit -m "Assert the CTA boundary against the colour it is actually adjacent to (#876)"`
- [ ] **Step 5:** Update Execution status.

## Phase 2 — The stale-deferral guard, then the repointing (AC-3)

**Files:** Test `frontend/src/app/shared/cta-border-token.contrast.spec.ts` · Modify
`frontend/src/tailwind.css` · `frontend/src/testing/glass-tokens.ts` ·
`frontend/src/app/admin/accent-tokens.contrast.spec.ts` ·
`frontend/src/app/admin/admin-console.contrast.spec.ts`

- [ ] **Step 1: Write the failing test** — enumerate every `#834` citation under
      `frontend/src` via `allSources()`; fail on any not in the history allow-list.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- cta-border-token` → FAIL listing the
      live deferrals (expected: the six token families across `tailwind.css` +
      `glass-tokens.ts`, plus `accent-tokens.contrast.spec.ts:52`).
- [ ] **Step 3: Repoint** each of them at `docs/design/non-text-contrast.md`, preserving every
      measured number already in the comment. **Touch no declaration.**
- [ ] **Step 4: Run it, verify it passes** — `npm test -- cta-border-token accent-tokens admin-console` → PASS.
- [ ] **Step 5: Generalization-audit pass.** Population: *every in-tree citation of a GitHub
      issue as a present-tense tracking home for an unresolved question* — the mechanism
      #876 is an instance of, not just #834. Enumerate with
      `grep -rnoE '#[0-9]{3,4}' frontend/src docs/design | sort -u`, then check each cited
      issue's state via `mcp__github__issue_read`. Record the verdict per closed-but-cited
      issue in the log below.
- [ ] **Step 6: Commit** — `git commit -m "Repoint the six deferring token families at the written rule (#876)"`
- [ ] **Step 7:** Update Execution status.

## Phase 3 — The forced-colors precondition guard (AC-4)

**Files:** Test `frontend/src/app/shared/cta-border-token.contrast.spec.ts` · Modify
`docs/design/non-text-contrast.md`

- [ ] **Step 1:** Write the guard asserting no `forced-color-adjust-none` /
      `forced-color-adjust: none` under `frontend/src`.
- [ ] **Step 2: Run** — `npm test -- cta-border-token` → PASS (characterization again: the
      precondition holds today; the guard exists so it fails loudly when a future slice opts a
      surface out and quietly invalidates the clause).
- [ ] **Step 3:** Cross-reference the guard by name from the rule doc's forced-colors clause,
      so the clause and its proof point at each other.
- [ ] **Step 4: Commit** — `git commit -m "Guard the precondition the forced-colors clause rests on (#876)"`
- [ ] **Step 5:** Update Execution status; run
      `node scripts/check-plan-file-structure.mjs --diff origin/main`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| | phase 2 step 5 | Every in-tree citation of a GitHub issue as a present-tense tracking home for an unresolved question | `grep -rnoE '#[0-9]{3,4}' frontend/src docs/design \| sort -u`, then `issue_read` each | | |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `npm test -- cta-border-token` → the adjacent-carrier test passes in all three themes. Verified at commit `<sha>`.
- [ ] **AC-2:** Same run → the fill-vs-glass test records 2.23–3.16:1 in dark and states why it is not the comparison. Verified at commit `<sha>`.
- [ ] **AC-3:** Same run → the stale-deferral guard passes with the history allow-list. Verified at commit `<sha>`.
- [ ] **AC-4:** Same run → the forced-colors precondition guard passes. Verified at commit `<sha>`.
- [ ] **AC-5:** Review-verified — the rule doc states the rule, the clause, both caveats, and cites specs rather than ratios.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test (AC-5 excepted and stated).
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, no backend file in scope.
- [ ] **Availability** section filled — `N/A`, justified (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking path touched.
- [ ] **Modulith** section filled — `N/A — frontend-only` (invariant #11).
- [ ] **Payment/payout** section filled — `N/A`, justified (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met; no token value moved (verified via the Behavior-parity ledger).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
