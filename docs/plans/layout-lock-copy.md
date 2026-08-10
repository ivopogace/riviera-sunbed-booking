# Layout-lock Copy Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the `LAYOUT_IN_USE` / `SET_IN_USE` copy over-stating when a surface is locked, now
that #599/#602 narrowed the availability arm of all three layout writes to holds dated today or
later.

**Architecture:** Copy only — the guards, ports and write paths are untouched. The single
significant decision is the **wording posture**, which #607 raised as a product-copy call rather
than a freshness defect: the maintainer chose **lifetime-neutral** ("still held") over three
alternatives, one of which — naming the booking arm's permanence in a second UI sentence — was
explicitly declined. Both codes move together, because #607's premise is that their parity is
deliberate.

**Persistence:** JDBC only (invariant #1). N/A — no table, migration or query touched.

**Source of intent:** GitHub issue #607, itself deferred from #602's plan doc
(`docs/plans/bulk-replace-past-hold-freeze.md`, *Deliberate non-change (flagged, not patched)*).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the issue's
predicted e2e churn was half wrong: `layout-editor.e2e.ts` asserts only `/locked/i` and needed no
change to stay green, while `set-editor.ts`'s copy had already diverged from the backend's via #567's
finding F-5) · `riviera-plan-doc` (this template — its *When NOT to use* rule initially exempted the
slice as a copy tweak; the doc exists because annotating a historical plan doc pulls the diff into
#533's File-structure gate, and because the slice grew a decision + two follow-ups worth recording)
· `tdd` (N/A as red-green — no behaviour to drive; the specs asserting the old copy were updated with
it, and the review gate then found the LAYOUT half unpinned, which was fixed by adding assertions) ·
`riviera-review-overlay` (review gate — ran twice on PR #608, 9 findings each round) ·
`riviera-docs-freshness` (**ran** over `origin/main...HEAD`, 2 findings — both stale plan-doc
statements, patched in this PR rather than a follow-up) · `riviera-local-debug` (scoped build/test
recipe; the `PW_CHROMIUM_EXECUTABLE` escape hatch for the container's Chromium revision) ·
`riviera-java-conventions` (§6b — the `detail` strings stay free of internals and keep coming from
the one `ApiProblem` factory) · `riviera-frontend` (placement — no new files; operator copy stays in
each feature component, no cross-feature import added).

> `playwright-cli` was **not** loaded, against the routing table's `frontend/e2e/` row. No spec was
> authored, placed or restructured — the e2e changes are assertion text, one added assertion, and two
> mock `detail` sentinels. Flagged rather than silently skipped; see the Risk register R-3.

**Branch:** `claude/sdlc-607-ls5e49` — the cloud session's designated remote branch, standing in for
`bugfix/layout-lock-copy` per `riviera-sdlc` § *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

- **AC-1:** Given a `SET_IN_USE` refusal, when the operator repools, moves or removes a set, then the
  panel says the set is booked *or still held* — pinned by `set-editor.spec.ts`
  (`explainsARefusedRepool`, `explainsARefusedRemove`, `explainsARefusedMove`) and
  `operator-set-editing.e2e.ts` › *a booked set cannot be repooled or removed…*.
- **AC-2:** Given a `LAYOUT_IN_USE` refusal, when the operator saves a bulk layout, then the banner
  says the venue has bookings *or sets that are still held*, still reads as locked, and still points
  at per-set editing — pinned by `layout-editor.spec.ts` › *shows the layout-locked message…* and
  › *pointsALockedLayoutAtPerSetEditing (AC-7)*, plus `layout-editor.e2e.ts` › *shows the
  layout-locked message when the venue has bookings*.
- **AC-3:** No wording claiming a past hold locks a surface survives — `grep -rn 'walk-in holds\|booked
  or held' platform/src frontend/src frontend/e2e` returns nothing.
- **AC-4:** Both mocked e2e specs prove the **client** mapped the code, not that it echoed the
  server's prose — each 409 mock returns a `detail` sentinel absent from the client copy
  (`operator-set-editing.e2e.ts`, `layout-editor.e2e.ts`).

## Non-goals

- Making one `SET_IN_USE` message accurate for both guards it serves (edit refuses on a non-terminal
  booking; remove on any booking ever) — **deferred to #609**.
- Conveying that the booking arm is permanent while the hold arm is transient — the declined copy
  option; **deferred to #609**.
- Removing the hand-duplication of operator prose between `VenueAdminController` and the two console
  mappers — a wire-contract change, **deferred to #610**.
- Any change to the guards themselves, or to `LAYOUT_IN_USE`'s deliberately venue-wide booking arm
  (#602's declined option 2).

## Behavior-parity ledger (retirement / replacement slices only)

N/A — nothing retired or replaced; four string literals rewritten in place.

## Risk register

| # | Risk | Likelihood | Mitigation | Status |
|---|---|---|---|---|
| R-1 | Sharpening one code and not the other breaks the deliberate `LAYOUT_IN_USE`/`SET_IN_USE` parity #607 is built on | Medium | Both codes rewritten in the same commit; backend and frontend twins reconciled (the backend gained the "repooled" clause the frontend already had) | Closed — parity holds in all four strings |
| R-2 | Copy drifts again at the next guard narrowing, silently | High | Cannot be fully closed here: no test pins the server prose, and #610 records the structural fix. Partly mitigated — both e2e mocks now use sentinels, so a client mapper falling through fails instead of passing on an echoed string | Open → #610 |
| R-3 | `playwright-cli` not loaded for a diff touching `frontend/e2e/` (routing-gate deviation) | Low | Deviation stated in the plan, the PR body and the review record; the e2e edits are assertions and fixtures, not spec authoring | Closed — accepted, disclosed |
| R-4 | Annotating a historical plan doc pulls the whole diff into #533's File-structure gate | — | Materialized: CI went red on commit `636a722`. Fixed by giving this slice its own plan doc rather than listing #607's files under #602's section, which would mislead the reader that section exists for | Closed — fixed in round 3 |

## Open questions / Assumptions

*None open.*

### Resolved

- **Which wording posture?** — Escalated to the maintainer via `AskUserQuestion` with four options
  (dated-and-precise / lifetime-neutral / consequence-only / name-the-asymmetry). **Chose
  lifetime-neutral.** Resolved before phase 0.
- **Keep "walk-in holds" in the `LAYOUT_IN_USE` copy?** — No. `SetAvailabilityLookup#anyClaimsFrom`
  matches any availability row, `BOOKED_ONLINE` as well as `STAFF_MARKED`, so "walk-in" is the same
  imprecision #567's finding F-5 already fixed for `SET_IN_USE`. Dropped while the sentence was
  being rewritten; deviation from the presented option text disclosed in the PR body.

## Availability & concurrency (invariant #2)

N/A — no `(set, date)` read or write, no claim path, no locking, no guard predicate touched. The
slice rewrites the sentences that *describe* the guards; `hasLiveHold`, `isLivelyClaimed`,
`isLivelyClaimedOrEverBooked` and `anyClaimsFrom` are byte-identical before and after.

## Spring Modulith — modules, interfaces, events

Only `venue`, and only its inbound adapter. No module added, moved, or newly depended on; no `api`,
`spi`, `vocabulary` or `events` surface changed; no listener or publication touched. The edit is two
string literals inside `VenueAdminController`'s existing exhaustive `switch` over `SetRejection` /
`ReplaceRejection`, both still routed through the one `ApiProblem` factory (invariant #11 untouched;
`riviera-java-conventions` §6b honoured).

### Module ownership (§4a)

N/A — no behavior added or moved, so nothing to place. `venue` already owns both rejection codes and
their wire mapping (`RESPONSIBILITIES.md` §`venue`).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money, no Stripe, no ledger, no refund path in scope.

## Angular — frontend surfaces touched

`operator/layout-editor.ts` and `operator/set-editor.ts` — one `errorMessage()` case each, both
already-existing `switch` arms returning a string. No component, route, signal, form or template
structure changed; no new file, so no folder-placement decision (`riviera-frontend`). The
`operator-console.service.ts` edit is TSDoc only, correcting a statement the review gate showed to be
false. Themes, tokens and a11y are untouched — the copy renders in the existing error panels.

## FE↔BE contract

The RFC-7807 **`code`** is unchanged for both rejections; only the human-readable `detail` moved. No
frontend code reads `detail` (both surfaces map from `code`), so the server strings are the contract
for non-console API clients only — which is why they were brought back into line with the console
copy rather than left to drift. #610 tracks whether the server should carry operator prose at all.

## Execution status

**Stage pointer:** `merge close-out`

**Next action:** merge PR #608, then close-out steps 1–3 and 6–7 (`riviera-sdlc`
`references/pr-gates.md` §3).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — rewrite both codes' copy + move the specs asserting it | ✅ | `8a67dcc` |
| 1 — review-gate round 1 fixes (F-3/F-5/F-7/F-8) | ✅ | `636a722` |
| 2 — review-gate round 2 fixes (R-1/R-3/R-5/R-6/R-8) + this plan doc | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review r1 | One `SET_IN_USE` string serves two guards of different breadth | deferred → issue #609 |
| F-2 | review r1 | "still" marks only the transient arm; the permanent booking arm reads as live | deferred → issue #609 |
| F-3 | review r1 | Backend `SET_IN_USE` omitted "repooled" though a pool-only edit trips the guard | fixed-in-`636a722` |
| F-4 | review r1 | Operator prose hand-duplicated server↔client, nothing pinning them | deferred → issue #610 |
| F-5 | review r1 | `operator-set-editing.e2e.ts` mock echoed the asserted phrase as `detail` | fixed-in-`636a722` |
| F-6 | review r1 | Three specs assert one regex for three actions | deferred → issue #609 |
| F-7 | review r1 | `setWriteErrorOf` TSDoc claimed the panel's copy differs by action; it does not | fixed-in-`636a722` |
| F-8 | review r1 | #602's plan doc still recorded the copy as an open deliberate non-change | fixed-in-`636a722` |
| F-9 | review r1 | Locked-layout remedy dead-ends when a terminal booking is the lock's cause | deferred → issue #609 |
| R-1 | CI (Repo hygiene) | Editing a plan doc pulled the diff into #533's File-structure gate; 4 paths unlisted | fixed — this slice got its own plan doc |
| R-2 | review r2 | Adding "repooled" widens the shared string's inaccuracy on the remove path | won't-fix — backend/frontend parity is the lesser evil; root cause is #609 |
| R-3 | review r2 | The `LAYOUT_IN_USE` rewrite was pinned by no test (assertions matched the old copy too) | fixed — assertions added to `layout-editor.spec.ts` + `layout-editor.e2e.ts` |
| R-5 | review r2 | `o3-layout-editor.md:108` still quoted the retired message as shipped | fixed — supersession note |
| R-6 | review r2 | `layout-editor.e2e.ts` mock's `detail: 'locked'` collided with its own assertion | fixed — sentinel |
| R-7 | review r2 | PR body's before/after table did not match what shipped | fixed — PR body updated |
| R-8 | review r2 | Supersession note asserted a merge that had not happened, in path-like backticks | fixed — reworded |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — both
  rejection `detail` strings.
- `frontend/src/app/operator/layout-editor.ts` — the `LAYOUT_IN_USE` case of `errorMessage()`.
- `frontend/src/app/operator/set-editor.ts` — the `SET_IN_USE` case of `errorMessage()`.
- `frontend/src/app/operator/operator-console.service.ts` — `setWriteErrorOf` TSDoc correction (F-7).
- `frontend/src/app/operator/set-editor.spec.ts` — three assertions moved to the new copy.
- `frontend/src/app/operator/layout-editor.spec.ts` — assertion added pinning the new copy (R-3).
- `frontend/e2e/operator-set-editing.e2e.ts` — assertions moved; mock `detail` sentinel (F-5).
- `frontend/e2e/layout-editor.e2e.ts` — assertion added; mock `detail` sentinel (R-3, R-6).
- `docs/plans/bulk-replace-past-hold-freeze.md` — supersession note on #602's deferral (F-8, R-8).
- `docs/plans/o3-layout-editor.md` — supersession note on the retired message quote (R-5).

---

## Phase 0 — Rewrite both codes' copy

- [x] Rewrite the four strings (backend `SET_IN_USE` + `LAYOUT_IN_USE`, frontend twins).
- [x] Move every spec assertion that named the old wording.
- [x] Verify no old wording survives (AC-3).

## Phase 1 — Review-gate round 1

- [x] Fix F-3, F-5, F-7, F-8; open #609 and #610 for the deferrals.

## Phase 2 — Review-gate round 2

- [x] Fix R-1 (this plan doc), R-3, R-5, R-6, R-8; record R-2 as won't-fix.

## Generalization-audit log

- **F-5's sentinel fix → where else?** The same echoed-`detail` collision existed in the sibling
  `layout-editor.e2e.ts`, which round 1 had actually cited as the model to copy. Round 2's review
  caught it; both mocks now use sentinels (AC-4). Searched: every `route.fulfill` carrying a
  `problem+json` body under `frontend/e2e/` — those two are the only ones whose `detail` overlapped
  an assertion.
- **F-8's supersession note → where else?** `grep -rn 'walk-in holds\|booked or held' docs/` found a
  second stale quote in `o3-layout-editor.md` (R-5) and a third in
  `per-set-layout-write-claim-guard.md:334`. The third is a findings-register row recording what
  commit `810e1cc` did at the time — still a true historical statement, deliberately left alone.

## Acceptance-criteria verification (final)

| AC | Verified by | Result |
|---|---|---|
| AC-1 | `set-editor.spec.ts` ×3, `operator-set-editing.e2e.ts` ×2 | ✅ green locally + CI |
| AC-2 | `layout-editor.spec.ts` ×2, `layout-editor.e2e.ts` | ✅ green locally + CI |
| AC-3 | `grep -rn 'walk-in holds\|booked or held' platform/src frontend/src frontend/e2e` | ✅ zero hits |
| AC-4 | both e2e mocks return `detail: 'in use'`, asserted text is client-only | ✅ |

## Self-review checklist (before merge / PR)

- [x] Every AC has a passing test named above.
- [x] Invariants re-checked: #2 untouched (guards byte-identical), #11 untouched (no boundary moved),
      #5/#6/#8/#9/#10/#12 N/A.
- [x] `node scripts/check-inline-comments.mjs --diff origin/main` clean.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` clean.
- [x] Open Questions empty; both deferrals carry follow-up issues (#609, #610).
- [x] Review gate run twice via `/code-review` + `riviera-review-overlay`; findings register above.
- [x] Sonar gate green with its reported issue list pulled from the API, not just the gate badge.
