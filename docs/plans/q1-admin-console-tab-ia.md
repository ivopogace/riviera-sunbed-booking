# Q1 — Admin console tab information architecture

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer epic #348's open question Q1 — how the admin console's tab strip absorbs
Commissions (A8), Privacy (A3) and Payouts (A6) — with a measured decision, and land the shell
change it implies, so A8/A3/A9 unblock.

**Architecture:** Keep **one flat, wrapping pill strip** and accept **eight** tabs; reject
grouping, overflow and a layout component on measured evidence (below). The change is therefore
not a layout change but an **ordering rule**: the strip gains a canonical eight-slot order
exported as `ADMIN_CONSOLE_TAB_ORDER`, and two tests turn that rule into an enforced invariant —
a unit spec pinning that rendered tabs are a *subsequence* of the canonical order (so a future
slice cannot append out of slot) and an e2e guard pinning the 360px row budget.

**Persistence:** N/A — frontend-only, no tables, no migrations (invariant #1 untouched).

**Source of intent:** GitHub issue **#348** (epic), open question **Q1**; the 2026-08-05 audit
comment (`#issuecomment-5191131810`). Visual substrate: `docs/design/riviera-admin-console.dc.html`
(header endpoint map binding; its **tab strip is not** — see Decision §D-4).

**Skills consulted:** `riviera-sdlc` (routing + issue-intake gate — caught that Q1's text blocks
A3/A6/A8's *visual design* only, which is what let A9 be unblocked separately) · `riviera-plan-doc`
(this template — forced the Behavior-parity ledger, which is what surfaced that the five shipped
tabs do **not** move) · `tdd` (the subsequence spec is written red-first against a deliberately
mis-ordered array) · `riviera-review-overlay` (review gate — RV-FE-*, run at ready-for-review) ·
`riviera-docs-freshness` (**ran** over `origin/main...HEAD` + the counting sweep — 2 findings, both patched; see §Docs sweep) ·
`riviera-frontend` (placement: **no** layout component, no new folder; the guard spec belongs in
the CI-safe `frontend/e2e/`) · `riviera-tailwind` (no new utilities — the decision is to *not*
restyle the pills; the touch-target argument below is why) · `playwright-cli` (the 360px guard
spec + the measurement harness) · `angular-developer` (v22 idiom check on the exported const +
`input()` strip) · `riviera-local-debug` (cloud-session npm recipe, scoped test runs).

**Branch:** `claude/admin-console-tabs-ia-owjq6t` — the cloud session's designated remote branch
stands in for `feature/q1-admin-console-tab-ia` (riviera-sdlc §Remote/cloud addendum).

---

## The decision (Q1)

**Answer: keep one flat wrapping strip, design for eight now, and fix the *order* rather than the
layout.** No grouping, no overflow menu, no layout component.

### The measurement that settles it

Measured against the real component in a real Chromium at each width, by cloning the shipped pill
so every candidate carries identical CSS (harness: `playwright-cli`; page `/admin/audit`, admin
session mocked). `rows` = distinct pill-top offsets; `navH` = strip height in px.

| Width | 5 tabs (today) | 7 tabs (A8+A3) | 8 tabs (+A6) | Horizontal overflow |
|---|---|---|---|---|
| 320px | 2 rows / 89px | 3 rows / 137px | **4 rows / 185px** | none, at any count |
| **360px** (the bar) | 2 rows / 89px | 3 rows / 137px | **3 rows / 137px** | none |
| 390px | 2 rows / 89px | 3 rows / 137px | 3 rows / 137px | none |
| 768px | 1 row / 40px | 2 rows / 89px | 2 rows / 89px | none |
| 1280px | 1 row / 40px | 1 row / 40px | 2 rows / 89px | none |

Three facts do the work:

1. **It never clips and never scrolls horizontally** — at any width, at any count. The existing
   `flex flex-wrap` already satisfies "must survive 360px"; the question was only ever how much
   *vertical* space the wrap costs.
2. **At 360px, eight tabs cost exactly what seven cost** — both 3 rows / 137px. A6's Payouts tab
   is vertically **free**. That is what makes "design for eight now" the cheap answer rather than
   the ambitious one: there is no saving to be had by designing for seven.
3. **137px is 18.5% of a 740px viewport, and the content card still clears the fold** — the
   before/after screenshots show the audit table fully visible with eight tabs. The failure mode
   the question anticipated ("a nav that eats three rows above every page's content") is real in
   *row count* but not in *consequence*.

### Rejected alternatives

**D-1 — Grouping (Accounts / Money / Operations / Privacy). Rejected on IA grounds, not pixels.**
The natural grouping of the eight degenerates: Accounts:{Operators}, Money:{Commissions, Refunds,
Payouts}, Operations:{Email, Photos, Audit}, Privacy:{Privacy} — **two of four groups are
singletons**, and one of them shares its name with its only member. A grouping where half the
groups have one child is not a grouping; it adds a navigation level that buys nothing. It would
also cost a two-level nav (group row + tab row ≥ 2 rows on mobile, i.e. no vertical saving at the
bar), an extra interaction, and the layout component the Javadoc deferred — while putting the
`routerLinkActive` / `aria-current` story on a second level the epic calls intentional.

**D-2 — Overflow ("More") menu. Rejected: worst benefit/cost ratio.** It saves ~48px at 360px and
nothing at desktop, in exchange for a disclosure widget with focus/escape management, and it
*hides* admin surfaces from the one person whose job is finding them. It also makes the
load-bearing `aria-current` semantics harder: the active tab can end up inside a collapsed menu,
where the "you are here" signal is exactly the signal assistive tech loses.

**D-3 — Shrink the pills to buy a row. Rejected on touch-target grounds.** Pills measure **40px**
tall at every width. WCAG 2.5.8 (AA) wants ≥24px — passing — but 2.5.5 (AAA) wants ≥44px, so the
pills are *already* below the comfortable target. Trading 4–6px of touch target for one row of
scroll on an admin-only surface is the wrong trade, and `frontend/.claude/CLAUDE.md` makes AA
a floor, not a ceiling to optimise down to.

**D-4 — Adopt the design canvas's five-tab strip. Not applicable, and the canvas says so.**
`riviera-admin-console.dc.html` predates Email/Refunds/Photos/Audit; four of its five tabs are not
today's tabs. Its header's endpoint map and commission/payout decision lists remain binding. A
correction note is added to the canvas header (see §Docs sweep) because Q1 now *does* fix the
console's tab shape, which the header claimed was unresolved.

### What actually changes

The canonical order, derived from what each tab *is* rather than when it shipped:

| Slot | Tab | Cluster | State |
|---|---|---|---|
| 1 | Operators | accounts + lifecycle; it is `/admin`, the console home | shipped |
| 2 | Commissions | money the platform **sets** | **A8** |
| 3 | Payouts | money the platform **pays** | **A6** |
| 4 | Email | outbox re-drive lever | shipped |
| 5 | Refunds | outbox re-drive lever (shares `OutboxLever` with Email) | shipped |
| 6 | Photos | content moderation (ADR-0013) | shipped |
| 7 | Privacy | data-subject erasure | **A3** |
| 8 | Audit | the record of all of the above; last because it is the meta-tab | shipped |

**The five shipped tabs are already in this order** — filtering the eight to what ships yields
exactly today's `Operators, Email, Refunds, Photos, Audit`. So the visible strip does not move
today; what lands is the *rule*, plus the tests that stop A8/A3/A6 from appending by ship date the
way the current five accidentally were.

### Does Q1 gate A9?

**No — and the epic is corrected to say so.** Q1's text blocks "A3, A6 and A8's *visual design*";
the epic's slice table listed A9 as Q1-blocked by association. A9 is a **stat strip**, not a tab,
and this answer constrains nothing about how tiles are drawn. **A9 unblocks now.**

One measured hand-off it *should* respect: on `/admin/audit` at 360px the content card already
starts at **y=374px** with five tabs (**y=422px** with eight), of which **170px is the shared
operator chrome** (#462) — the dominant consumer of above-fold space, not the tabs. A9 stacking
three full-width tiles would push content past a 740px fold. A 2-up or horizontally-scrolling tile
row is the shape that fits; that is advice for A9, not a gate on it.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the console strip rendered at **360×740**, when the admin opens a console
  tab, then every tab is visible and the document does not scroll horizontally.
  *Pinned by:* `admin-console-tabs.e2e.ts` › `every tab is reachable at 360px without a horizontal scroll`
- [ ] **AC-2:** Given the strip at **360px**, when it renders, then it occupies **at most 3 rows**
  — the measured eight-tab budget — so a future tab that blows the budget fails CI instead of
  silently degrading. *Pinned by:* `admin-console-tabs.e2e.ts` › `stays within the three-row budget at 360px`
- [ ] **AC-3:** Given the rendered tabs, when their labels are read in DOM order, then that
  sequence is a **subsequence of `ADMIN_CONSOLE_TAB_ORDER`** — so any subset ships fine but an
  out-of-slot insertion fails. *Pinned by:* `admin-console-tabs.spec.ts` › `renders tabs in the canonical console order`
- [ ] **AC-4:** Given a strip whose tabs are deliberately mis-ordered, when AC-3's assertion runs,
  then it fails — the guard is proven to have teeth, not merely to pass.
  *Pinned by:* `admin-console-tabs.spec.ts` › `rejects a tab inserted out of its canonical slot`
- [ ] **AC-5:** Given any console route, when its tab is open, then that tab alone carries
  `aria-current="page"` and deep-link/back-button/lazy-route behaviour is unchanged.
  *Pinned by:* the existing `admin-console-tabs.spec.ts` aria-current cases (unmodified) + the six
  admin `*.e2e.ts` specs' tab assertions.

## Non-goals

- **A8's Commissions tab UI** — this slice unblocks it; it does not draw it.
- **Adding Commissions / Privacy / Payouts tabs or routes.** The order reserves their slots; the
  tabs ship with their own slices.
- **A layout component for `/admin*`.** Deferred again, now with a measured reason rather than an
  implicit "not yet" — see §Open questions for the trigger that would revisit it.
- **Restyling the pills** (size, padding, density) — D-3.
- **Touching the shared operator chrome (#462)**, even though it is the larger consumer of
  above-fold space. Different owner, different slice.
- **Any backend change.** No endpoint, module, or migration is in scope.

## Behavior-parity ledger

> The slice modifies an existing surface (the strip) without retiring it, so the ledger is filled
> for the strip's own behaviors — the cheapest place to prove "no behavior change" is here.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Five pills in the order Operators, Email, Refunds, Photos, Audit | **preserved** | The canonical order filtered to shipped tabs is byte-identical; `tabs` array order is unchanged |
| One lazy route per tab, deep-linkable | **preserved** | `app.routes.ts` untouched |
| `routerLinkActiveOptions {exact: true}` (so `/admin` doesn't light on `/admin/email`) | **preserved** | Template binding untouched |
| `ariaCurrentWhenActive="page"` on the active pill | **preserved** | Template binding untouched; AC-5 re-pins it |
| `data-testid="admin-tab-*"` on every pill | **preserved** | Unchanged — this is what keeps the six admin e2e specs green |
| `label` input naming the nav landmark | **preserved** | Unchanged |
| `flex flex-wrap gap-2` wrapping layout | **preserved** | The decision is explicitly to keep it; AC-1/AC-2 now pin its behaviour |
| Rendered only inside each page's admin-authorized branch | **preserved** | No change to any page's gate |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The row-budget e2e assertion is brittle across font rendering / CI Chromium | med | med | Assert **row count** (distinct pill-top offsets), not a pixel height — tolerant of font metrics while still catching a real extra row | claude | **closed** `c4510ae` — row-count assertion shipped; no pixel literal in the spec |
| R-2 | The subsequence guard is tautological if the component derives `tabs` by filtering the canonical const | low | med | Component keeps a hand-written `tabs` array; the const is the *contract*, the spec is the independent check. AC-4 proves the guard fails on a bad order | claude | **closed** `ed3034d` — verified empirically: appending `Commissions` after `Audit` in the component made the spec FAIL |
| R-3 | Reordering churns the six admin e2e specs' selectors | low | high | Nothing reorders today (parity ledger row 1); every `data-testid` is preserved. Verified by running the mocked suite | claude | **closed** — full mocked suite **132 passed**; no admin spec touched |
| R-4 | `ADMIN_CONSOLE_TAB_ORDER` carries labels for tabs that do not exist, and reads as dead code | med | low | It is consumed by the spec, so it is live contract, not dead data; its TSDoc states each unshipped slot's owning slice (A8/A3/A6) | claude | **closed** `95f272b` — TSDoc names A8/A3/A6 against their slots |
| R-5 | A8 ships "Commission rates" (a longer label) and quietly pushes 360px to 4 rows | med | med | AC-2's budget guard fails CI on the 4th row, which is exactly the intended forcing function | claude | **closed** — verified: a ninth tab makes the budget spec FAIL, an eighth PASSES |
| R-6 | 320px with eight tabs is 4 rows / 185px | med | low | Below the project's stated 360px bar and still non-clipping, non-scrolling. Recorded here rather than hidden; revisit only if 320px becomes a support target | claude | **closed — accepted and recorded** in the decision comment on #348 and §Decision; no action |

## Open questions / Assumptions

**None open.** Both entries resolved below.

### Resolved

- **Assumption (confirmed):** eight is the ceiling — the epic's slice table closes at eight, and
  admin-side venue creation and owner re-assignment are explicit Non-goals of #348. Rather than rest
  on the assumption, the *consequence* of it being wrong is now guarded: a ninth tab fails the
  budget spec. Resolved `c4510ae`.
- **Open question (converted to a documented trigger):** at what count *would* a layout component /
  grouping be right? **A ninth tab** — where the 360px strip reaches 4 rows *and* the singleton-group
  objection (D-1) dissolves, since new tabs would then join existing clusters rather than form new
  ones. Written into the component TSDoc so the next author inherits the threshold instead of
  re-deriving it. Resolved `95f272b`.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches one Angular presentational component, its
spec, and one e2e spec. No booking, beach-map, or `availability` code path is read or written.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No backend Java, no module, no port, no event, no migration.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` The Commissions and Payouts slots are reserved by *name* only; no
money is read, computed, or displayed by this slice.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-console-tabs.ts` | existing | standalone component | `input()` for `label`; `tabs` a plain readonly array (no reactive state) | none |
| FE-2 | `admin/admin-console-tabs.spec.ts` | existing | Vitest/jsdom spec | — | — |
| FE-3 | `e2e/admin-console-tabs.e2e.ts` | **new** | Playwright spec (CI-safe mocked suite) | — | — |

**Standards:** standalone component, `input()` signal API, `@for` native control flow, no
`@HostBinding` — all already in place and unchanged. The added export is a plain `const`, not a
service, so no `@Service`/`inject()` question arises. Placement per `riviera-frontend`: the
component stays in the `admin/` feature folder (it imports only `@angular/router`, no cross-feature
edge added — RV-FE-8 clean); the e2e spec is API-mocked, so it belongs in `frontend/e2e/`, not
`frontend/e2e/real-backend/`.

## FE↔BE contract

`N/A — no contract change.` No endpoint is added, called, or altered.

## Docs sweep (`riviera-docs-freshness`)

**Ran over `origin/main...HEAD`** (this slice's own diff, pre-merge smoke), plus the counting sweep.

*Fact-changes in the diff:* the strip's Javadoc no longer defers the layout component on tab count;
a new export (`ADMIN_CONSOLE_TAB_ORDER`) exists; the CI-safe e2e suite grew by one spec. The tab
**count** did not change (still five rendered), so every "five tabs" statement stays true.

| Doc:line | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `docs/design/riviera-admin-console.dc.html` header | Draws a five-tab strip and presents it as the spec; the epic warned about it but the canvas itself carried no note | Q1's answer — the canonical eight-slot order is now the source of truth | **patched** — correction note added at the top of the header, pointing at `ADMIN_CONSOLE_TAB_ORDER`; the endpoint map and decision lists explicitly left binding |
| `docs/design/riviera-admin-console.dc.html` header | *"One inconsistency the implementing slice MUST resolve … `DailyTakingsService` reads `rates.commissionBps(venueId)` LIVE at query time"* | **A7 / PR #522** — `DailyTakingsService.java:54` now reads `rates.commissionBpsOn(venueId, date)` | **patched** — rewritten as resolved, carrying A7's narrower-than-exact guarantee forward for A8's explainer |

Out-of-range but found and fixed: the second row is #522's staleness, not this slice's. Recorded
here rather than deferred, since it sits in the same header this slice was already correcting.

Counting sweep (2b): grepped `the/both/only two|three|…|of the five|six` across `CLAUDE.md`,
`RESPONSIBILITIES.md`, `docs/design`, `.claude/skills` narrowed to `tab|e2e|spec|admin|console` —
**no findings.** Nothing counts the admin tabs or the e2e specs in a way this slice falsifies.
Rename/removal grep (2a) for `does not yet justify|tab count|five tabs|five-tab` — the only live hit
is the correction note this slice added.

`graphify-out/` is absent (cloud clone, gitignored), so step 6 does not apply.

## Execution status

**Stage pointer:** `merge close-out — CI green, Sonar green, awaiting merge`

**Next action:** Merge PR #524. Nothing is outstanding except the one gate deliberately left unticked
(the `/code-review` fan-out — see the Self-review checklist's last row for why).

**Gate results on PR #524:**

| Gate | Result |
|---|---|
| CI | ✅ all 7 checks green — Backend (build + test), Frontend (lint + test + build), CodeQL, Analyze (java-kotlin), Analyze (javascript-typescript), SonarCloud scan, SonarCloud Code Analysis |
| Sonar merge bar (0 new issues / 0 duplicated blocks / ≥80% new-code coverage) | ✅ **0 new issues, 0 accepted issues, 0 security hotspots, 0.0% duplication, 100.0% coverage on new code** — the reported issue list is empty, so nothing to triage |
| Review gate | ⚠️ **partial** — `riviera-review-overlay` walked in full (1 finding, F-1, fixed); the `/code-review` subagent fan-out did not run (session instructed not to spawn agents). Stated in the PR, box left unticked |

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Canonical order: red spec → exported const | ✅ | `ed3034d` |
| 1 — 360px e2e guard (AC-1/AC-2) | ✅ | `c4510ae` |
| 2 — TSDoc: replace the stale five-tab clause with the measured decision | ✅ | `95f272b` |
| 3 — Docs sweep + epic #348 decision comment | ✅ | `d10c8f1` + [decision comment](https://github.com/ivopogace/riviera-sunbed-booking/issues/348#issuecomment-5194927292) |

**Guard-teeth verification (both guards proven to fail on the mistake they exist to catch):**

| Guard | Simulated mistake | Result |
|---|---|---|
| AC-3 order (unit) | A8 appends `Commissions` after `Audit` | **FAIL** — `expected [ 'Operators', 'Email', …(4) ] to deeply equal [ 'Operators', 'Commissions', …(4) ]` |
| AC-2 budget (e2e) | a **ninth** tab at 360px | **FAIL** — 4 rows exceeds the 3-row budget |
| AC-1/AC-2 at the real endstate | all **eight** canonical tabs rendered at 360px | **PASS** — 3 rows, no horizontal scroll, no serious axe violations |

The third row is the one that matters: the decision's central claim ("eight fits") is verified
against the actual eight-tab strip, not extrapolated from today's five.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review — RV-FE-E2E | The new guard spec located the strip with a CSS selector (`nav[aria-label=…] a`) and reached into `page.evaluate` with `document.querySelectorAll`, where the bank calls for role/label locators | **fixed** — one `tabPills()` helper on `getByRole('navigation', {name}).getByRole('link')`, reused by both assertions via `evaluateAll`. Re-ran lint + the 3 specs: green |
| F-2 | review — `/code-review` fan-out (reviewers #1, #3 and #5, independently) | The new `ADMIN_CONSOLE_TAB_ORDER` TSDoc named the shared Email/Refunds class `AdminOutboxLever`. **No such symbol exists** — that is the *filename* stem; the exported class is `OutboxLever` (`admin-outbox-lever.ts:31`), which every sibling references correctly. A freshly-introduced factual error in the one place this repo treats as load-bearing documentation, and invisible to lint/tsc because it sat in backticks rather than a `{@link}` | **fixed** `484338e` — corrected to `OutboxLever` in the TSDoc **and** in this plan's canonical-order table (the same wrong name had propagated to both). Left as backticks rather than `{@link}`: this component does not import `OutboxLever`, so the link would not resolve |
| F-3 | review — `/code-review` fan-out (reviewer #4, prior-PR recurrence) | This plan's **File structure** section listed 5 files while the diff touches **7** — the two committed screenshots were referenced in prose but never enumerated. The same class of gap was raised on **#438** (confidence 100) and again as **#522 F-5**: the plan doc is the SDLC's living record, so a File-structure list that under-counts the diff is a factual gap, not a formatting one | **fixed** in this PR (the commit carrying this row) — both PNGs added to File structure, each with why it exists and a note that they are the first images committed under `docs/` (a deliberate precedent) |

---

## File structure

- `frontend/src/app/admin/admin-console-tabs.ts` — **modify**: export
  `ADMIN_CONSOLE_TAB_ORDER`; rewrite the TSDoc's deferred-layout clause with the Q1 decision, the
  measured budget, and the ninth-tab trigger. The `tabs` array itself is unchanged.
- `frontend/src/app/admin/admin-console-tabs.spec.ts` — **modify**: add AC-3 (subsequence) and
  AC-4 (the guard has teeth); leave every existing aria-current case untouched.
- `frontend/e2e/admin-console-tabs.e2e.ts` — **create**: the 360px guard (AC-1/AC-2).
- `docs/design/riviera-admin-console.dc.html` — **modify**: header correction note (Q1 resolved).
- `docs/plans/q1-admin-console-tab-ia.md` — this doc; execution status kept live.
- `docs/plans/q1-admin-console-tab-ia/before-5-tabs-360.png` — **create**: the 360px "before"
  screenshot (today's five tabs, 2 rows), committed rather than left in the session so the decision's
  evidence survives it (SDLC rule 10).
- `docs/plans/q1-admin-console-tab-ia/after-8-tabs-360.png` — **create**: the 360px "after"
  screenshot (all eight in canonical order, 3 rows). Both are linked SHA-pinned from the Q1 decision
  comment on #348. **First images committed under `docs/`** — a deliberate new precedent, taken
  because the measurement table alone cannot show that content still clears the fold.

---

## Phase 0 — Canonical order: red spec, then the exported const

**Files:** Modify `frontend/src/app/admin/admin-console-tabs.spec.ts` · Modify
`frontend/src/app/admin/admin-console-tabs.ts`

- [ ] **Step 1: Write the failing test** — imports a const that does not exist yet, so it fails to
  compile before it fails to pass.

```ts
import { ADMIN_CONSOLE_TAB_ORDER, AdminConsoleTabs } from './admin-console-tabs';

/** Rendered labels, in DOM order. */
function labels(fixture: ComponentFixture<TabsHost>): string[] {
  return [...fixture.nativeElement.querySelectorAll('nav a')].map((a) => a.textContent.trim());
}

/** The canonical order restricted to the tabs actually present — what a correct strip must equal. */
function canonicalSubsequence(present: readonly string[]): string[] {
  return ADMIN_CONSOLE_TAB_ORDER.filter((label) => present.includes(label));
}

it('renders tabs in the canonical console order (Q1, #348)', async () => {
  const rendered = labels(await renderAt('/admin'));

  expect(rendered).toEqual(canonicalSubsequence(rendered));
});

it('rejects a tab inserted out of its canonical slot', async () => {
  const appendedByShipDate = ['Operators', 'Email', 'Audit', 'Commissions'];

  expect(appendedByShipDate).not.toEqual(canonicalSubsequence(appendedByShipDate));
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- admin-console-tabs` → FAIL, unresolved
  import `ADMIN_CONSOLE_TAB_ORDER`.

- [ ] **Step 3: Minimal implementation** — export the const; `tabs` stays exactly as it is.

```ts
export const ADMIN_CONSOLE_TAB_ORDER = [
  'Operators',
  'Commissions',
  'Payouts',
  'Email',
  'Refunds',
  'Photos',
  'Privacy',
  'Audit',
] as const;
```

- [ ] **Step 4: Run it, verify it passes** — `npm test -- admin-console-tabs` → PASS (all cases,
  incl. the untouched aria-current ones).

- [ ] **Step 5: Generalization-audit pass** — search for other hardcoded tab strips that append by
  ship date (`grep -rn "routerLinkActive" src/app --include=*.ts`); the operator console's tabs are
  the other candidate. Record the decision in the log below.

- [ ] **Step 6: Commit** — `git commit -m "Pin the admin console's canonical tab order (#348)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The 360px guard

**Files:** Create `frontend/e2e/admin-console-tabs.e2e.ts`

- [ ] **Step 1: Write the failing test** — assert the row budget and no-horizontal-scroll at 360px,
  reusing `mockOperatorLifecycleApi` + `OperatorSignInPage` like the other admin specs.

- [ ] **Step 2: Run it, verify it fails first** — temporarily set the budget to 1 row →
  `npm run test:e2e:a11y -- admin-console-tabs` → FAIL, then restore to 3.

- [ ] **Step 3: Restore the real budget (3 rows)** — the measured eight-tab value.

- [ ] **Step 4: Run it, verify it passes** — `npm run test:e2e:a11y -- admin-console-tabs` → PASS.

- [ ] **Step 5: Generalization-audit pass** — n/a unless a second wrapping nav is found in phase 0.

- [ ] **Step 6: Commit** — `git commit -m "Guard the admin tab strip's 360px row budget (#348)"`

- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — TSDoc: the measured decision replaces the stale clause

**Files:** Modify `frontend/src/app/admin/admin-console-tabs.ts`

The clause to replace is the one Q1 exists to revisit: *"minus the layout component, which the tab
count (five, as of #507) does not yet justify"*. Its replacement states the decision, the measured
budget, the canonical order's reserved slots, and the ninth-tab trigger — in TSDoc, which
`frontend/.claude/CLAUDE.md` exempts from the one-line inline-comment rule (RV-STYLE-1, raised on
eight consecutive PRs touching these files — this slice must not make it nine).

- [ ] **Step 1–4:** No behavior change; `npm test -- admin-console-tabs` + `npm run lint` stay green.
- [ ] **Step 6: Commit** — `git commit -m "Record the Q1 tab-IA decision on the strip itself (#348)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Docs sweep + the epic decision

**Files:** Modify `docs/design/riviera-admin-console.dc.html` · comment on #348 · tick Q1

- [ ] **Step 1:** `riviera-docs-freshness` over `origin/main...HEAD` + the counting sweep. ✅ 2 findings, both patched — see §Docs sweep.
- [ ] **Step 2:** Canvas header correction note — Q1 resolved, the canvas's five-tab strip is
  superseded by the eight-slot order; its endpoint map and decision lists remain binding.
- [ ] **Step 3:** Post the Q1 decision comment on #348 (decision, rejected alternatives, the
  measurement table, before/after 360px screenshots) and tick the Q1 checklist box; state that A9
  is **not** Q1-blocked.
- [ ] **Step 6: Commit** — `git commit -m "Note the Q1 resolution on the admin-console canvas (#348)"`
- [ ] **Step 7: Finalize execution status** — before the merge, citing `merged via PR #NN`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-05 | Phase 0 — the canonical-order rule | Other tab strips that could append by ship date | `grep -rln "routerLinkActive" src/app --include=*.ts \| grep -v spec` | 1 other: the operator console's six tabs (`operator-console.ts:58`, rendered by `operator-console.html:62`) | **No change.** Its array is already documented as "in design order" — a closed set of six drawn from the O1–O8 design up front, not accreted per slice, so it never had the failure mode Q1 fixes. The `admin` strip was the only one ordered by ship date |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `npx playwright test --config playwright.a11y.config.ts admin-console-tabs` → **3 passed**, incl. axe at 360px. Verified after the F-1 locator fix.
- [x] **AC-2:** same run, row-budget case → PASS at 5 tabs and (simulated) 8; **FAIL at 9**, as intended.
- [x] **AC-3:** `npm test -- --watch=false --include="src/app/admin/admin-console-tabs.spec.ts"` → **9 passed**.
- [x] **AC-4:** same run, teeth case → PASS; and empirically, an out-of-slot append in the component made AC-3 FAIL.
- [x] **AC-5:** full suites → unit **1130 passed** (136 files), a11y **319 passed** (53 files), mocked e2e **132 passed** — the six admin specs untouched and green.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only; no backend file in the diff.
- [x] **Availability** section justified N/A (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section justified N/A (invariant #11). FE mirror: RV-FE-8 grep returns **5**, the frozen set — no new cross-feature edge.
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — N/A.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met; no `as any` on the contract. RV-FE-1 grep for obsolete idioms in the diff → none.
- [x] **RV-STYLE-1:** no inline comments added at all — every explanation is TSDoc or the spec's file-level block. (The epic notes this was raised on eight consecutive PRs touching these files; this one does not make it nine.)
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows (all six closed with outcomes); Open Questions empty.
- [x] **Close-out written in THIS PR**, citing `merged via PR #524`.
- [ ] **The review gate ran in full** — **left unticked deliberately.** The `riviera-review-overlay` bank was walked in full (RV-FE-1/2/3/4/5/6/7/8, RV-FE-E2E, RV-STYLE-1, RV-PROC-1) and produced F-1, which is fixed. The `/code-review` subagent fan-out was **not** run: this session was explicitly instructed not to spawn agents. Per `references/pr-gates.md` §1 the overlay alone is not the review, so this box stays unticked and the gap is stated in the PR rather than papered over.
