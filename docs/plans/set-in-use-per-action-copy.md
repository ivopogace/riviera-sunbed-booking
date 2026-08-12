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
`riviera-review-overlay` (review gate — pending) · `riviera-docs-freshness` (pending — due at
close-out; `operator-console.model.ts`'s `SetWriteErrorCode` TSDoc already states both guards
correctly and is the doc most likely to need a pointer) · `riviera-frontend` (placement — no new
files, no cross-feature import; the action union stays component-local rather than joining
`operator-console.model.ts`, since it names this panel's buttons, not the API's vocabulary) ·
`playwright-cli` (the two mocked e2e specs whose assertions this slice splits per action).

**Branch:** `claude/issue-609-relevance-veigtt` — the cloud session's designated remote branch,
standing in for `bugfix/set-in-use-per-action-copy` per `riviera-sdlc` § *Remote / cloud session
addendum*.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `SET_IN_USE` refusal of a **move**, when the panel renders the failure, then
  it says the set is booked or still held and names **only** moving as refused. *Pinned by:*
  `set-editor.spec.ts` › `explainsARefusedMove`.
- [ ] **AC-2:** Given a `SET_IN_USE` refusal of a **repool** (the save path — the only field of
  `disturbedBy` a save can change), then the message names **only** repooling as refused, and still
  says price and tier remain editable. *Pinned by:* `set-editor.spec.ts` ›
  `keepsTheSetUnchangedOnSetInUse` (the repool refusal's existing home — kept rather than renamed,
  since it also pins that the grid does not move).
- [ ] **AC-3:** Given a `SET_IN_USE` refusal of a **remove**, then the message states the permanent
  arm — that a set which has ever been booked stays on the map — and does **not** claim the set
  cannot be moved or repooled. *Pinned by:* `set-editor.spec.ts` › `explainsARefusedRemove`.
- [ ] **AC-4:** No two of the three refusal specs can pass on the same string — each asserts a verb
  the other two messages lack. *Pinned by:* the three specs above, plus
  `set-editor.spec.ts` › `refusalCopyIsDistinctPerAction`, which renders all three and asserts three
  distinct strings.
- [ ] **AC-5:** Given a `LAYOUT_IN_USE` refusal, then the banner names the booking arm as permanent
  ("has been booked at least once") and its per-set advice offers only add and change — never an
  unconditional remove. *Pinned by:* `layout-editor.spec.ts` › `pointsALockedLayoutAtPerSetEditing`
  and › *shows the layout-locked message…*.
- [ ] **AC-6:** The word "removed" no longer appears in any locked-surface remedy —
  `grep -rn "or remove sets\|moved, repooled or removed" frontend/src frontend/e2e` returns nothing.

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
| `SET_IN_USE` after a **repool** (save) → same string | **changed** | repool-specific string; keeps the "price and tier can still change" clause, which is true on this arm |
| `SET_IN_USE` after a **remove** → same string | **changed** | remove-specific string naming the permanent arm; drops "moved, repooled", which are **not** refused for a set whose only booking is terminal |
| `SET_IN_USE` after an **add** → same string | **dropped** (unreachable) | `addSet` cannot answer this code; the fallback covers it if the server ever changes |
| "Its price and tier can still change." | **preserved** on move + repool | verbatim; **dropped** on remove, where it is not the operator's next step and can be false |
| Every non-`SET_IN_USE` code (`CELL_TAKEN`, `NO_SUCH_SET`, `NOT_VENUE_OWNER`, `INVALID_REQUEST`, `UNAUTHORIZED`, default) | **preserved** | untouched; the action is ignored for these — they are action-independent |
| `errorCode` cleared on every new write, on `armMove()`, on cell re-select | **preserved** | the action signal is set in the same places, so a stale action can never outlive its code |
| `LAYOUT_IN_USE` → "has bookings, or sets that are still held" | **changed** | booking arm restated as permanent |
| `LAYOUT_IN_USE` → "add, change or remove sets one at a time" | **changed** | remove dropped from the advice; the lock's own cause can forbid it |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A stale action outlives its code — the panel shows "can't be removed" for a later failed move | med | med | The action is written in `write()` **beside** `errorCode`, never separately, so the two cannot diverge; the `undefined` code case returns before the action is read | claude | open |
| R-2 | The remove string's permanence claim goes stale if the RESTRICT FK is ever relaxed | low | low | It restates `isLivelyClaimedOrEverBooked`'s own javadoc, which cites `RESPONSIBILITIES.md` §`venue`; a guard change would break AC-3's spec by intent, not silently | claude | open |
| R-3 | The three specs are split but still tautological — each asserting a substring of one shared template | med | med | AC-4 adds a spec that renders all three and asserts **mutual distinctness**, which no shared string can satisfy | claude | open |
| R-4 | The repool label is wrong if a save can disturb something other than pool | low | med | `onSave` sends `rowLabel`/`positionNo`/`gridX`/`gridY` from `selected`, unchanged, so `SetPlacement.disturbedBy` can only fire on `pool` — verified against `SetPlacement.java:17-23` | claude | open |
| R-5 | Copy churn breaks the two mocked e2e specs, which CI runs | high | low | Both are in this slice's File structure and updated with it; their `detail` sentinels (#607 AC-4) stay, so they keep proving the client mapped the code rather than echoing the server | claude | open |

## Open questions / Assumptions

- **Assumption:** Naming the booking arm's permanence on the **remove** path (and in the layout
  banner) is not a reversal of #607's declined option D. Option D added a second sentence to a
  *shared* string to reconcile two lifetimes; here each message describes the one guard that
  refused it, which is the accuracy fix #609 asks for and is unreachable without it. Recorded rather
  than escalated because copy wording is the author's call per `riviera-plan-doc` § *Workflow
  additions at execution time* #2. — *Owner:* claude · *Resolves by:* review gate (maintainer may
  trim the permanence clause to taste without touching the structure).

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

**Stage pointer:** `implement (phase 2)`

**Next action:** Split the repool/remove assertions in `operator-set-editing.e2e.ts` and update the
banner assertion in `layout-editor.e2e.ts` (phase 2 step 1).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Thread the attempted action; per-action `SET_IN_USE` copy | ✅ | `9f10152` |
| 1 — Layout-lock banner: permanent arm + honest remedy | ✅ | pending |
| 2 — Split the e2e assertions per action | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/set-in-use-per-action-copy.md` — this plan doc.
- `frontend/src/app/operator/set-editor.ts` — the `SetWrite` union, the `attempted` signal written in
  `write()`, and the per-action `SET_IN_USE` arm of `errorMessage()`.
- `frontend/src/app/operator/set-editor.spec.ts` — the three refusal specs split per action, plus the
  mutual-distinctness spec (AC-4).
- `frontend/src/app/operator/layout-editor.ts` — the `LAYOUT_IN_USE` string.
- `frontend/src/app/operator/layout-editor.spec.ts` — the two banner assertions.
- `frontend/e2e/operator-set-editing.e2e.ts` — the repool and remove assertions, split.
- `frontend/e2e/layout-editor.e2e.ts` — the banner assertion.

---

## Phase 0 — Thread the attempted action; per-action `SET_IN_USE` copy

**Files:** Modify `frontend/src/app/operator/set-editor.ts` · Test
`frontend/src/app/operator/set-editor.spec.ts`

- [ ] **Step 1: Write the failing tests** — split the three existing refusal specs so each asserts a
  verb the other two messages lack, and add `refusalCopyIsDistinctPerAction`.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- set-editor` → FAIL (all three currently
  render the one shared string).
- [ ] **Step 3: Minimal implementation** — add `type SetWrite = 'add' | 'move' | 'repool' | 'remove'`,
  a `private readonly attempted = signal<SetWrite | undefined>(undefined)`, a first parameter on
  `write()`, and the per-action `SET_IN_USE` arm.
- [ ] **Step 4: Run them, verify they pass** — `npm test -- set-editor` → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Tell the set panel which write was refused (#609)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Layout-lock banner: permanent arm + honest remedy

**Files:** Modify `frontend/src/app/operator/layout-editor.ts` · Test
`frontend/src/app/operator/layout-editor.spec.ts`

- [ ] **Step 1: Write the failing test** — `pointsALockedLayoutAtPerSetEditing` additionally asserts
  the advice does not offer an unconditional remove, and the banner names the permanent arm.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- layout-editor` → FAIL.
- [ ] **Step 3: Minimal implementation** — rewrite the `LAYOUT_IN_USE` string.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- layout-editor` → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Stop the layout lock promising a remove it forbids (#609)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Split the e2e assertions per action

**Files:** Modify `frontend/e2e/operator-set-editing.e2e.ts`, `frontend/e2e/layout-editor.e2e.ts`

- [ ] **Step 1: Update the assertions** — the repool leg and the remove leg of *a booked set cannot
  be repooled or removed* assert their own strings; the layout spec asserts the new banner.
- [ ] **Step 2: Run them** — `npm run test:e2e:a11y -- operator-set-editing layout-editor` → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Split the e2e in-use assertions per action (#609)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

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

- [ ] **AC-1:** Run `npm test -- set-editor` → `explainsARefusedMove` green.
- [ ] **AC-2:** Run `npm test -- set-editor` → `explainsARefusedRepool` green.
- [ ] **AC-3:** Run `npm test -- set-editor` → `explainsARefusedRemove` green.
- [ ] **AC-4:** Run `npm test -- set-editor` → `refusalCopyIsDistinctPerAction` green.
- [ ] **AC-5:** Run `npm test -- layout-editor` → both banner specs green.
- [ ] **AC-6:** Run `grep -rn "or remove sets\|moved, repooled or removed" frontend/src frontend/e2e`
  → no output.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
