# Trim comment and Javadoc volume across backend and frontend

**Issue:** #544 · **Branch:** `chore/trim-comment-volume` · **Type:** repo-wide mechanical sweep (comment-only)

## Problem

Comments reached **24,718 lines across 1,069 files**, and **42% of `platform/src/main`** (11,895
comment lines against 13,074 code lines). Measured at branch point:

| Area | Files | Comment lines | Share of tree |
|---|---|---|---|
| `platform/src/main` | 481 | 11,895 | 42% |
| `platform/src/test` | 309 | 7,517 | 17% |
| `frontend/src` (ts + html) | 268 | 5,204 | 13% |
| `frontend/e2e` | 11 | 255 | 21% |

Almost none is contract documentation: **53 of 1,280** backend doc blocks carry a
`@param`/`@return`/`@throws`. **683 cite a GitHub issue number**; ~14,900 lines sit in ≥7-line blocks
that are decision archaeology.

**Cause — a rule working as specified, not drift.** `riviera-java-conventions` §6c makes an inline
comment one line "or it is not written", with the carve-out *"move the prose to the Javadoc, which is
exempt"*. The RV-STYLE-1 guard measures inline comments; nothing measured Javadoc. It became the
pressure valve.

**Much of it is a third copy.** `ObservabilityMetrics`' 214 comment lines restated what
`RESPONSIBILITIES.md` §`shared` *and* `docs/runbooks/observability.md` (505 lines) already document
in more depth.

## Solution

`riviera-java-conventions` **§6d — Javadoc: the contract, not the changelog** (+ the twin in
`frontend/.claude/CLAUDE.md`), then applied file by file:

- Javadoc says what a caller must know, not how the code came to be.
- No issue numbers — `git blame` and the tracker hold provenance.
- No decision history; relocate load-bearing rationale to `RESPONSIBILITIES.md` / an ADR / a runbook
  and leave a one-line pointer.
- Keep short operational warnings needed at the point of use ("do not sum them").
- Budget as a smell test: ~6 lines on a type, 3 on a member.

## Acceptance criteria (testable)

- [x] AC-1 §6d exists; `frontend/.claude/CLAUDE.md` carries the twin rule.
- [x] AC-2 `node scripts/check-comment-only.mjs main` exits 0 — every touched source file is
      code-identical after comment stripping.
- [x] AC-3 `node --test scripts/*.test.mjs` green (8 new cases for the verifier).
- [x] AC-4 Full CI green (backend build + test, frontend lint/test/build + e2e, both hygiene checks) —
      confirmed on PR #545 after the R-6 fix; re-checked per batch thereafter.
- [ ] AC-5 Every **over-budget block** in the sweep scope trimmed to §6d — see *What the trim actually
      pays for* below. Restated after measurement: the original "every file" reading was wrong, because
      roughly half the tree's comment lines are already at budget and yield nothing.
- [ ] AC-6 No rationale lost: anything load-bearing that was removed exists in a substrate doc.

## Non-goals

- **Machine-enforcing a Javadoc line budget.** A budget invites six useless lines as readily as it
  stops sixty. §6d is a review item; `check-comment-only.mjs` verifies *inertness*, not brevity.
- **`#` and SQL `--` comment syntaxes** — outside RV-STYLE-1 scope by the #522/F-6 precedent.
- **Any behaviour change.** Not a refactor; if code must change, that is a separate slice.

## Risk register

| # | Risk | Mitigation |
|---|---|---|
| R-1 | A "comment-only" edit silently changes code — worst case in `SecurityConfig`, where a dropped matcher is a vulnerability | `check-comment-only.mjs` strips comments from both sides and diffs the remainder; run per batch, and it is the AC-2 gate |
| R-2 | Load-bearing rationale deleted rather than relocated, losing knowledge review paid for | Check the substrate docs **first** — most of it is already duplicated there. Relocate before deleting; keep point-of-use warnings |
| R-3 | A 1,000-file diff is unreviewable, so review rubber-stamps it | Batched commits by area with an inertness proof per batch; the diff is large but provably inert |
| R-4 | Ordering-sensitive security comments lost from `SecurityConfig` | First-match-wins rule stated **once** at the `authorizeHttpRequests` block; each order-sensitive matcher keeps a one-line marker |
| R-5 | The sweep spans sessions and loses its place | This doc is the state store (SDLC rule 11); the ledger below is updated per batch |
| R-6 | **The trim itself writes multi-line inline comments**, tripping RV-STYLE-1 — hit on the first CI run, 8 violations in `SecurityConfig` | Prose that will not fit one line goes in the Javadoc (§6c's own remedy), never a `//` block. Run `check-inline-comments.mjs` per batch — and note its CLI no-ops on Windows (the `import.meta.url` guard), so call `check(...)` directly or rely on CI |

## Open questions / Assumptions

- **A-1** Trim level and scope were decided by the maintainer up front: *contract-only Javadoc with
  rationale relocated* (not deleted), across all four trees. Recorded so no session re-derives it.
- **A-2** Test-tree doc blocks that justify *why a test exists* are more defensible than production
  archaeology; they still lose issue numbers and history, but the "why this test" sentence stays.
- **A-3** *(decided 2026-08-07, after the measurement below)* The sweep stops at the **top ~200
  over-budget files**, ≈57% of the reachable volume. Past that the marginal file is a 10-line block
  becoming an 8-line block, which does not earn a session. The remaining 383 files are not a backlog —
  §6d governs them the next time they are edited for another reason.
- **A-4** *(same)* **PR #545 lands with the rule, the tooling and the first batch**; the mechanical
  sweep ships as follow-up PRs, one per batch, each carrying its own inertness proof. Chosen against
  R-3: a branch that grows for weeks presents the review gate with hundreds of files at once, and the
  §6d guard is worth more running than staged.

## Availability & concurrency (invariant #2)

Not touched. No SQL, no transaction, no claim path changes — comment-only by construction, proved by
AC-2.

## Spring Modulith — modules, interfaces, events

No module boundary, published surface, event or dependency changes. No class moves, so
`riviera-modulith` placement rules are not engaged and `ModularityTests` /
`PackageShapeArchitectureTests` should be unaffected.

## Payment & payout (invariants #5, #8, #9, #10)

Not touched. `ObservabilityMetrics` money-path metric **names** keep their exact string values
(verified by AC-2), so `MoneyPathAlertCheck` and every dashboard reading them are unaffected.

## Angular — frontend surfaces touched

No component, template binding, route or service behaviour changes. TSDoc and HTML comments only.

## Execution status

**Stage:** Review gate on PR #545 · **Next action:** `/code-review`, then the Sonar issue list, then
merge. The sweep continues in follow-up PRs (A-4).

| Phase | Scope | Ships in | Status |
|---|---|---|---|
| 0 | §6d + the frontend TSDoc twin | #545 | ✅ committed `1109c2f` |
| 1 | `check-comment-only.mjs` + its 8 tests | #545 | ✅ committed |
| 2 | First batch — 12 heaviest files | #545 | ✅ committed, CI green |
| 3 | Backend main, top ~120 over-budget files | follow-up | ⬜ not started |
| 4 | Backend test, top ~50 | follow-up | ⬜ not started |
| 5 | `frontend/src` + `frontend/e2e`, top ~30 | follow-up | ⬜ not started |

Phases 3–5 are sized from the over-budget ranking, not from file counts per tree. **Regenerate the
queue rather than checking a list in** — it goes stale as batches land:

```bash
node -e "const{execFileSync}=require('node:child_process'),{readFileSync}=require('node:fs');
const fs=execFileSync('git',['ls-files','platform/src/**/*.java','frontend/src/**/*.ts','frontend/src/**/*.html','frontend/e2e/**/*.ts'],{encoding:'utf8',maxBuffer:1<<28}).split('\n').filter(Boolean);
const rows=[];for(const f of fs){const ls=readFileSync(f,'utf8').split('\n');let c=[],o=false,n=0;
const fl=()=>{if(c.length>=10)n+=c.length;c=[]};
for(const l of ls){const t=l.trim();
if(t.startsWith('/*')){fl();o=true;c.push(l);if(t.endsWith('*/')){o=false;fl()}continue}
if(o){c.push(l);if(t.endsWith('*/')){o=false;fl()}continue}
if(t.startsWith('//')||t.startsWith('<!--')){c.push(l);continue}fl()}fl();
if(n)rows.push([n,f])}
rows.sort((a,b)=>b[0]-a[0]);rows.slice(0,200).forEach(([n,f])=>console.log(String(n).padStart(4),f))"
```

### Trim ledger

| File | Before | After | Note |
|---|---|---|---|
| `shared/ObservabilityMetrics.java` | 245 | 92 | Third copy of RESPONSIBILITIES §`shared` + the observability runbook |
| `SecurityConfig.java` | 635 | 487 | Ordering rule stated once, not eight times |
| `shared/MdcTaskDecorator.java` | 127 | 100 | Kept all three traps; dropped the #455/#410 argument |
| `booking/application/Bookings.java` | 207 | 175 | Port interface — its Javadoc is genuine contract, so only issue numbers and story labels went |
| `booking/adapter/in/RefundExecutorProperties.java` | 145 | 105 | Sizing argument already in RESPONSIBILITIES §`booking`; the operational *why* is in the exception messages, where an operator meets it at boot |
| `RateLimitFilter.java` | 273 | 184 | Security-critical, so every trap stayed (the `%64` decode bypass, the firewall tripwire, `AuthBudget`'s "same 401, opposite meaning"). What went: the separation rule restated once per constant |
| `notification/application/AsyncMailDispatcher.java` | 189 | 90 | Third copy of RESPONSIBILITIES §`notification`, which CLAUDE.md already names as the single home for these policies |
| `notification/application/TransactionalMailService.java` | 153 | 92 | Five registry-vehicle methods each restated the shared posture; stated once on the class |
| `booking/adapter/in/RefundExecutorConfig.java` | 131 | 92 | Twin of the next row — trimmed in parallel so the two stay symmetric, which their own Javadoc requires |
| `notification/adapter/in/RegistryMailExecutorConfig.java` | 128 | 99 | `defaultCandidate = false`, compose-don't-replace, and episode-ends-on-drain all kept verbatim |

**Remaining heaviest** (recomputed after the batch above): `SecurityConfig.java` 248 ·
`RateLimitFilter.java` 184 · `RateLimitFilterTest.java` 178 · `TransactionalMailServiceTest.java` 143 ·
`operator-console.model.ts` 133 · `Bookings.java` 125 · `RefundBulkheadIT.java` 114 ·
`AuthController.java` 111 · `MailListenerExecutorArchitectureTest.java` 111 · `my-bookings.ts` 110.

The first two are already-trimmed files that remain top-ranked because their Javadoc is genuine
contract — treat their current size as the floor, not a backlog item.

Concentration is long-tailed — top 100 files hold 34%, top 400 hold 72% — so there is no shortcut
set. Expect the full sweep to span sessions; work heaviest-first so each session lands real volume.

| `frontend/src/app/operator/operator-console.model.ts` | 133 | 116 | A DTO file already near budget — 23 types × ~5 lines. Treat as the floor |
| `RateLimitFilterTest.java` | 178 | 175 | Provenance out, rationale kept per A-2. Three lines: the evidence for the finding below |

### What the trim actually pays for

Measured after twelve files, because two of them returned almost nothing and that is the more useful
result:

| Block size | Comment lines | Behaviour under §6d |
|---|---|---|
| 1–2 | 3,197 | At budget. Untouchable. |
| 3–5 | 3,083 | At budget. |
| 6–9 | 5,534 | At or near budget; copy-editing yields ~0. |
| 10–14 | 4,203 | Over budget — real, moderate wins. |
| 15+ | 8,099 | The essay class. Where every large win came from. |

**Deleting provenance does not reduce volume; deleting duplicated paragraphs does.** 72% of comment
lines sit in a block carrying an issue number or a decision-history phrase, which made "683 blocks cite
an issue" look like the lever. It is not: stripping `#544`-style refs from a 6-line block re-wraps it to
6 lines. `RateLimitFilterTest` lost 3 lines that way; `ObservabilityMetrics` lost 153 because its
paragraphs were a third copy of a substrate doc.

**The real work list is 583 files holding 12,302 lines in blocks of 10+ lines** — not 1,069 files
holding 24,116. By tree: backend main 7,136 · backend test 3,525 · frontend src 1,570 · frontend e2e 71.
Concentration within that list is far better than the raw ranking suggested: top 100 files hold 37%,
top 150 hold 48%, top 200 hold 57%.

**Expected reachable outcome:** ~55% off the over-budget blocks ≈ 6,800 lines, ~28% of the tree. A
sweep of the top ~200 of those 583 files captures well over half of it; past that the marginal file is
a 10-line block that becomes an 8-line block.

**Tree total so far:** 24,718 → 24,116 after 12 files.

## File structure

Comment-only edits across the source trees; globs stand in for the mechanical sweep, as the #533
guard sanctions.

- `.claude/skills/riviera-java-conventions/SKILL.md` — **modified**: adds §6d, bounds §6c's exemption
- `frontend/.claude/CLAUDE.md` — **modified**: the TSDoc twin of §6d
- `scripts/check-comment-only.mjs` — **new**: proves a trim diff changed only comments
- `scripts/check-comment-only.test.mjs` — **new**: 8 cases incl. string/text-block false positives
- `docs/plans/comment-volume-trim.md` — **new**: this doc
- `platform/src/main/java/` — **modified**: Javadoc trimmed to §6d, comment-only
- `platform/src/test/java/` — **modified**: Javadoc trimmed to §6d, comment-only
- `frontend/src/` — **modified**: TSDoc + HTML comments trimmed, comment-only
- `frontend/e2e/` — **modified**: TSDoc trimmed, comment-only

## Skills consulted

- **`riviera-sdlc`** — routed the work; this doc is the rule-11 state store.
- **`riviera-java-conventions`** — the authority being amended (§6c→§6d); read before any Java edit.
- **`riviera-plan-doc`** — this doc's shape.
- **`riviera-review-overlay`** — RV-STYLE-1 is the review item §6d extends; due at the review gate.
- `riviera-modulith` **not** loaded: no class moves, no published-surface or boundary changes, so the
  placement authority is not engaged. Recorded explicitly because the routing gate would otherwise
  read the backend-Java row as triggered.

## Self-review checklist (before merge / PR)

- [ ] `node scripts/check-comment-only.mjs origin/main` exits 0
- [ ] `node --test "scripts/*.test.mjs"` green
- [ ] `node scripts/check-inline-comments.mjs --diff origin/main` exits 0 (the trim must not itself
      write a multi-line inline comment)
- [ ] Backend build + full test suite green in CI
- [ ] Frontend lint + test + build + e2e green in CI
- [ ] Spot-check that no removed rationale is unrecorded (R-2)
