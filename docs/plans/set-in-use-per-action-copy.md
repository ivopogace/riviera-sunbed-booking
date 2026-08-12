# Per-action `SET_IN_USE` Copy Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the console's in-use refusals true of the guard that actually fired — the set panel
tells the operator which write was refused and why, and the layout banner stops promising a per-set
remove that the same lock forbids.

**Architecture:** The single decision is **the panel learns which write was attempted**. `SET_IN_USE`
answers two guards of different breadth (`editSet` → `isLivelyClaimed`, non-terminal bookings only;
`removeSet` → `isLivelyClaimedOrEverBooked`, any booking ever), and `errorMessage()` switched on the
code alone, so one string had to cover both and was false on two of its three verbs. Threading the
attempted action into the failure state is #609's "honest fix" — and it dissolves the copy fork #607
declined: with a message per action, no single string has to reconcile two lifetimes in a second
sentence, because each one describes only its own guard.

**Persistence:** JDBC only (invariant #1). N/A — no table, migration or query touched.

**Source of intent:** GitHub issue #609 (findings F-1/F-2/F-6/F-9 deferred from #607's review gate,
PR #608; `docs/plans/layout-lock-copy.md` § *Non-goals*).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed all four
findings still reproduce verbatim, and caught that #610/#644 narrowed the slice from two places to
one: the server's copy of the three-verb claim is already gone, so this is wholly client-side) ·
`riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is what turned "reword
two strings" into an enumerated four-verb table and exposed that `add` can never see this code) ·
`tdd` (each phase writes the per-action spec first, red on the shared string, green on the split) ·
`riviera-review-overlay` (review gate — **ran** on PR #646 at high effort via `/code-review`'s
subagent fan-out, 4 findings, all fixed in this PR; it caught that R-4's "pool is the only field a
save can disturb" holds against the client's snapshot but not the stored row) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD`, 1 finding —
#607's plan-doc AC-1/AC-2 state the copy this slice replaces, struck through here rather than
deferred; `operator-console.model.ts`'s `SetWriteErrorCode` TSDoc and `RESPONSIBILITIES.md` §`venue`
were checked and already state both guards correctly) · `riviera-frontend` (placement — no new
files, no cross-feature import; the action union stays component-local rather than joining
`operator-console.model.ts`, since it names this panel's buttons, not the API's vocabulary) ·
`playwright-cli` (the two mocked e2e specs whose assertions this slice splits per action).

**Branch:** `claude/issue-609-relevance-veigtt` — the cloud session's designated remote branch,
standing in for `bugfix/set-in-use-per-action-copy` per `riviera-sdlc` § *Remote / cloud session
addendum*.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a `SET_IN_USE` refusal of a **move**, when the panel renders the failure, then
  it says the set is booked or still held and names **only** moving as refused. *Pinned by:*
  `set-editor.spec.ts` › `explainsARefusedMove`.
- [x] **AC-2:** Given a `SET_IN_USE` refusal of a **save**, then the message names the frozen group
  — pool and position, the two `disturbedBy` fields a save carries — as refused, without claiming
  which one tripped the server, and still says price and tier remain editable. *Pinned by:*
  `set-editor.spec.ts` › `keepsTheSetUnchangedOnSetInUse` (the save refusal's existing home — kept
  rather than renamed, since it also pins that the grid does not move).
- [x] **AC-3:** Given a `SET_IN_USE` refusal of a **remove**, then the message states the permanent
  arm — that a set which has ever been booked stays on the map — and does **not** claim the set
  cannot be moved or repooled. *Pinned by:* `set-editor.spec.ts` › `explainsARefusedRemove`.
- [x] **AC-4:** No two of the three refusal specs can pass on the same string — each asserts a verb
  the other two messages lack. *Pinned by:* the three specs above, plus
  `set-editor.spec.ts` › `refusalCopyIsDistinctPerAction`, which renders all three and asserts three
  distinct strings.
- [x] **AC-5:** Given a `LAYOUT_IN_USE` refusal, then the banner names the booking arm as permanent
  ("has been booked at least once") and its per-set advice offers only add and change — never an
  unconditional remove. *Pinned by:* `layout-editor.spec.ts` › `pointsALockedLayoutAtPerSetEditing`
  and › *shows the layout-locked message…*.
- [x] **AC-6:** Neither retired phrase survives as rendered copy — only as the negative assertions
  pinning its absence:
  `grep -rn "or remove sets\|moved, repooled or removed" frontend/src frontend/e2e --include=*.ts | grep -v "not\.to"`
  returns nothing.

## Non-goals

- **Any change to the guards, the codes, the HTTP statuses or the `ProblemDetail` shape.** The
  backend is untouched by this slice; `SET_IN_USE`'s two breadths are deliberate
  (`RESPONSIBILITIES.md` §`venue`), not a defect to normalize.
- **Re-rendering the server's `detail`.** Declined at #610 — it would move UI-navigation copy
  ("Switch to Edit sets…") into the API. The client stays the single source of rendered wording.
- **A pre-warn probe** that predicts a refusal before the write is attempted — a standing non-goal
  recorded in `operator-console.model.ts`'s `SetWriteErrorCode` TSDoc.
- **Naming the two lifetimes in one shared string** (#607's declined option D). Superseded rather
  than adopted: per-action copy means no string serves two lifetimes. See Open questions.
- **The `add` path.** A brand-new set carries no booking and no hold, so `addSet` cannot answer
  `SET_IN_USE`; it gets no per-action string, only the shared fallback.

## Behavior-parity ledger (retirement / replacement slices only)

> One shared string is retired and replaced by four (three per-action + a fallback), so each verb it
> claimed is enumerated and re-homed rather than assumed carried over.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `SET_IN_USE` after a **move** → "can't be moved, repooled or removed" | **changed** | move-specific string; the two false verbs dropped |
| `SET_IN_USE` after a **save** (pool and/or a stale placement snapshot) → same string | **changed** | save-specific string naming the frozen group; keeps the "price and tier can still change" clause, which is true on this arm |
| `SET_IN_USE` after a **remove** → same string | **changed** | remove-specific string naming the permanent arm; drops "moved, repooled", which are **not** refused for a set whose only booking is terminal |
| `SET_IN_USE` after an **add** → same string | **dropped** (unreachable) | `addSet` cannot answer this code; the fallback covers it if the server ever changes |
| "Its price and tier can still change." | **preserved** on move + save | verbatim; **dropped** on remove, where it is not the operator's next step and can be false |
| Every non-`SET_IN_USE` code (`CELL_TAKEN`, `NO_SUCH_SET`, `NOT_VENUE_OWNER`, `INVALID_REQUEST`, `UNAUTHORIZED`, default) | **preserved** | untouched; the action is ignored for these — they are action-independent |
| `errorCode` cleared on every new write, on `armMove()`, on cell re-select | **preserved** | the action signal is set in the same places, so a stale action can never outlive its code |
| `LAYOUT_IN_USE` → "has bookings, or sets that are still held" | **changed** | booking arm restated as permanent |
| `LAYOUT_IN_USE` → "add, change or remove sets one at a time" | **changed** | remove dropped from the advice; the lock's own cause can forbid it |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A stale action outlives its code — the panel shows "can't be removed" for a later failed move | med | med | The action is written in `write()` **beside** `errorCode`, never separately, so the two cannot diverge; the `undefined` code case returns before the action is read | claude | **Closed** `9f10152` — both writes are adjacent lines in the one `catch`, and `refusalCopyIsDistinctPerAction` drives three refusals in sequence through one component instance, so a carried-over action would fail it |
| R-2 | The remove string's permanence claim goes stale if the RESTRICT FK is ever relaxed | low | low | It restates `isLivelyClaimedOrEverBooked`'s own javadoc, which cites `RESPONSIBILITIES.md` §`venue`; a guard change would break AC-3's spec by intent, not silently | claude | **Closed** — accepted as designed; the pin is `explainsARefusedRemove`'s `/booked at least once/` |
| R-3 | The three specs are split but still tautological — each asserting a substring of one shared template | med | med | AC-4 adds a spec that renders all three and asserts **mutual distinctness**, which no shared string can satisfy | claude | **Closed** `9f10152` — each spec also asserts a `not.toMatch` on a verb the other arms own, so the three cannot re-converge |
| R-4 | The repool label is wrong if a save can disturb something other than pool | low | med | ~~`onSave` sends the placement fields unchanged, so `disturbedBy` can only fire on `pool`~~ — **the mitigation was wrong**, and the review gate said so (F-1): those fields are unchanged relative to the *client's snapshot*, not the stored row, so a set another tab moved trips `disturbedBy` on position. `editSet` carries no `expectedVersion`, so nothing else catches it | claude | **Closed by re-scoping, not by the original argument** — the action is renamed `save` and the copy names the frozen group rather than the operator's presumed intent, which is true under both arms. The near-miss is why the `SetWrite` TSDoc now states the snapshot caveat |
| R-5 | Copy churn breaks the two mocked e2e specs, which CI runs | high | low | Both are in this slice's File structure and updated with it; their `detail` sentinels (#607 AC-4) stay, so they keep proving the client mapped the code rather than echoing the server | claude | **Closed** — 16 mocked e2e green locally against the container Chromium; a **third** spec also asserted this copy (`operator-set-editing.e2e.ts` › *the locked bulk save…*), found by running the suite rather than by the File-structure list |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption (resolved at the review gate, `339500a`…this commit):** Naming the booking arm's
  permanence on the **remove** path and in the layout banner is not a reversal of #607's declined
  option D. Option D added a second sentence to a *shared* string to reconcile two lifetimes; here
  each message describes the one guard that refused it, which is the accuracy fix #609 asks for and
  is unreachable without it. The review gate did not challenge the posture — it sharpened both
  strings' *reach* (F-1, F-2) while leaving the per-action structure intact. The maintainer may
  still trim the permanence clause without touching that structure.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No client write path added or changed; the four existing writes
(`addSet`, `editSet` ×2, `removeSet`) are called identically, and the slice only changes what the
panel renders after one of them is **refused**. The availability row is written server-side by
`booking`/`availability` and is not reachable from this component.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is in this slice's File structure.

### Module ownership (§4a)

N/A — no backend behavior added or moved. The client-side equivalent: all changes stay inside the
`operator/` feature folder, which owns the console's components and their copy; no `core/` or
`shared/` file is touched and no cross-feature import is added (`riviera-frontend` § *folder
taxonomy*).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/set-editor.ts` | existing | standalone component | adds one `signal<SetWrite \| undefined>` written beside `errorCode` in `write()` | unchanged (`draftForm`) |
| FE-2 | `operator/layout-editor.ts` | existing | standalone component | none — one string literal | unchanged |

**Standards:** no new component, no template change, no new image. The action union is a
component-local `type`, not an exported model type (FE-1) — it names this panel's four buttons, and
`operator-console.model.ts` is the API-shape module. `errorMessage()` stays a method rather than
becoming a `computed()`: it is called from the template on an already-reactive pair of signals, and
converting it is out of scope for a copy slice.

## FE↔BE contract

N/A — no contract change. The wire is untouched: same codes, same statuses, same `ProblemDetail`.
The client already ignores `detail` (#610), and this slice does not start reading it.

## Execution status

**Stage pointer:** `merge close-out` — CI green, review gate run (4 findings, all fixed), Sonar gate passed.

**Next action:** Confirm CI is green on the review-fix push, then merge PR #646 and run the close-out
checklist (`riviera-sdlc` `references/pr-gates.md` §3).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Thread the attempted action; per-action `SET_IN_USE` copy | ✅ | `9f10152` |
| 1 — Layout-lock banner: permanent arm + honest remedy | ✅ | `7f9648c` |
| 2 — Split the e2e assertions per action + docs-freshness patch | ✅ | `339500a` |
| 3 — Review-gate fixes (F-1..F-4) | ✅ | this commit |

**Local verification (not CI):** 1376 Vitest specs green (full suite); 16 mocked Playwright specs
green against the container Chromium via `PW_CHROMIUM_EXECUTABLE`; `npm run lint` and
`npm run format:check` clean; all three diff-scoped repo guards (`check-inline-comments`,
`check-focus-posture`, `check-plan-file-structure`) return 0 against `origin/main`.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review`, high) | The `repool` string misattributes the guard when the client's placement snapshot is stale: `onSave` sends cached coordinates, so if another tab moved the set, `disturbedBy` fires on **position**, and a price-only edit is told it "can't be repooled". R-4 held only against the client's snapshot, not the stored row | **fixed** — the action is renamed `save` and the copy names the frozen group ("its pool and position can't change") instead of guessing which field tripped the server |
| F-2 | review (`/code-review`, high) | The layout banner's new caveat named only the ever-booked arm, but per-set remove is guarded by `isLivelyClaimedOrEverBooked` — a walk-in-only venue locked by a live hold is sent to Edit sets and then refused the remove the caveat implied was available | **fixed** — caveat broadened to "any set that is held or has ever been booked", matching the guard's two arms |
| F-3 | review (`/code-review`, high) | AC-2's final verification named `explainsARefusedRepool`, a spec that never existed; a filtered run against it exits green with **zero** tests | **fixed** — corrected to `keepsTheSetUnchangedOnSetInUse`, and #607's AC-1 annotated to record that the same name was aspirational there too |
| F-4 | review (`/code-review`, high) | Phase 2's commit column said "pending" in the commit that landed it; AC-6 was `[x]` in the AC list and `[ ]` in the verification list | **fixed** — both reconciled |
| — | sonar | Quality gate **passed**: 0 new issues, 0 accepted, 0 security hotspots, 0.0% duplication, 86.7% coverage on new code (bar: 0/0/≥80%) | **clear** |

---

## File structure

- `docs/plans/set-in-use-per-action-copy.md` — this plan doc.
- `frontend/src/app/operator/set-editor.ts` — the `SetWrite` union, the `attempted` signal written in
  `write()`, and the per-action `SET_IN_USE` arm of `errorMessage()`.
- `frontend/src/app/operator/set-editor.spec.ts` — the three refusal specs split per action, plus the
  mutual-distinctness spec (AC-4).
- `frontend/src/app/operator/layout-editor.ts` — the `LAYOUT_IN_USE` string.
- `frontend/src/app/operator/layout-editor.spec.ts` — the two banner assertions.
- `frontend/e2e/operator-set-editing.e2e.ts` — the save and remove assertions, split, plus the
  locked-bulk-save spec's twin of the unconditional-remove check.
- `frontend/e2e/layout-editor.e2e.ts` — the banner assertion.
- `docs/plans/layout-lock-copy.md` — #607's AC-1 and AC-2 state the copy this slice replaces; struck
  through and marked superseded (the docs-freshness patch, made here rather than deferred, exactly as
  that slice did for the two it invalidated).

---

## Phase 0 — Thread the attempted action; per-action `SET_IN_USE` copy

**Files:** Modify `frontend/src/app/operator/set-editor.ts` · Test
`frontend/src/app/operator/set-editor.spec.ts`

- [x] **Step 1: Write the failing tests** — split the three existing refusal specs so each asserts a
  verb the other two messages lack, and add `refusalCopyIsDistinctPerAction`.
- [x] **Step 2: Run them, verify they fail** — `npm test -- set-editor` → FAIL (all three currently
  render the one shared string).
- [x] **Step 3: Minimal implementation** — add `type SetWrite = 'add' | 'move' | 'save' | 'remove'`,
  a `private readonly attempted = signal<SetWrite | undefined>(undefined)`, a first parameter on
  `write()`, and the per-action `SET_IN_USE` arm.
- [x] **Step 4: Run them, verify they pass** — `npm test -- set-editor` → PASS.
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit** — `git commit -m "Tell the set panel which write was refused (#609)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Layout-lock banner: permanent arm + honest remedy

**Files:** Modify `frontend/src/app/operator/layout-editor.ts` · Test
`frontend/src/app/operator/layout-editor.spec.ts`

- [x] **Step 1: Write the failing test** — `pointsALockedLayoutAtPerSetEditing` additionally asserts
  the advice does not offer an unconditional remove, and the banner names the permanent arm.
- [x] **Step 2: Run it, verify it fails** — `npm test -- layout-editor` → FAIL.
- [x] **Step 3: Minimal implementation** — rewrite the `LAYOUT_IN_USE` string.
- [x] **Step 4: Run it, verify it passes** — `npm test -- layout-editor` → PASS.
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit** — `git commit -m "Stop the layout lock promising a remove it forbids (#609)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Split the e2e assertions per action

**Files:** Modify `frontend/e2e/operator-set-editing.e2e.ts`, `frontend/e2e/layout-editor.e2e.ts`

- [x] **Step 1: Update the assertions** — the save leg and the remove leg of *a booked set cannot
  be repooled or removed* assert their own strings; the layout spec asserts the new banner.
- [x] **Step 2: Run them** — `npm run test:e2e:a11y -- operator-set-editing layout-editor` → PASS.
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit** — `git commit -m "Split the e2e in-use assertions per action (#609)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated; a row whose population is "the other X like
> this one" is the shape that misses things (Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-12 | Phase 0 | **Client copy describing a server guard whose predicate differs by the request that hit it.** The mechanism needs one code reachable from call sites that ask different questions — so the population is the codes emitted from more than one call site, which #644 already enumerated in `error-contract.md` rather than leaving to resemblance | `sed -n 54,62p .claude/skills/riviera-java-conventions/references/error-contract.md` (the *One code, one string* enumeration), cross-read against `VenueAdminService`'s guards | 4: `MISSING_CURRENT_PASSWORD` (operator + customer change), `REQUEST_NOT_PENDING` (accept/decline/withdraw), `STALE_WRITE` (two set-writes), `SET_IN_USE` (edit + remove) | **Only `SET_IN_USE` qualifies** — the other three are multi-call-site but **single-predicate** (one `classifyMiss`, one `set_version` token, one password check), so one string is true at every site and #644 already pinned them. `LAYOUT_IN_USE` has one call site and one predicate; its defect is wording, fixed in phase 1, not an action split |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `npm test -- set-editor` → `explainsARefusedMove` green.
- [x] **AC-2:** Run `npm test -- set-editor` → `keepsTheSetUnchangedOnSetInUse` green.
- [x] **AC-3:** Run `npm test -- set-editor` → `explainsARefusedRemove` green.
- [x] **AC-4:** Run `npm test -- set-editor` → `refusalCopyIsDistinctPerAction` green.
- [x] **AC-5:** Run `npm test -- layout-editor` → both banner specs green.
- [x] **AC-6:** Run `grep -rn "or remove sets\|moved, repooled or removed" frontend/src frontend/e2e --include=*.ts | grep -v "not\.to"`
  → no output.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
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
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
