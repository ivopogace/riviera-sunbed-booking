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
- [~] AC-5 **DESCOPED, not met** — and the distinction is the honest one. The criterion was restated
      twice against measurement (the original "every file" reading was wrong because half the tree is
      already at budget; A-3's "top ~200 files" reading was wrong because it was still a file count).
      What shipped is every duplicate-bearing file the sweep *found*, which is not the same as every one
      that *exists*: the search was a 15-file read sample against 556 untrimmed over-budget files, and
      HEAD still carries 583 files / ~11,950 lines in blocks of 10+. The sample says the remainder is
      contract **on the duplication axis only** — see *The axis this sweep never measured*, which found
      §6d's issue-number clause violated in 1,136 doc blocks. A defensible basis for stopping the
      **volume** sweep; not a claim that the tree complies with §6d.
- [x] AC-6 No rationale lost: every relocation target was **read** to confirm it carries the text before
      the copy was removed (R-7), per batch.

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
| R-7 | **A relocation pointer that points at nothing.** `RefundExecutorProperties` said "the full sizing argument: RESPONSIBILITIES §`booking`" while the arithmetic it named (pool 4 from a 12.5-vs-6-minute drain, queue 500 from ≈52 minutes of backlog) had never been written there — AC-6 self-certified, not checked. Caught by the review gate | Relocation means **moving the text**, then reading the target to confirm it arrived. Fixed for this file; every future batch verifies each new pointer before the batch commits, since a dangling pointer is strictly worse than the essay it replaced |
| R-8 | **The inertness checker itself has blind spots**, so a batch could pass AC-2 while changing code. Review found two: a `/` inside a regex character class (`/[/*]/`) read as an opening block comment, and the `//` in an unquoted CSS `url(http://…)` read as a line comment | Both fixed with regex-literal and unquoted-`url()` handling, pinned by three tests confirmed to go **red** against the pre-fix script. The residual known gap — Java text-block re-indentation — is documented in the script's own Javadoc and is out of scope for a sweep that never re-indents |
| R-9 | **"It has a second home" is judged too fast.** The closing batch made the R-7 mistake twice more, in subtler forms: (a) a **scan-limit** sentence deleted from a fitness test — `RESPONSIBILITIES.md` §`Machine-checked vs review-checked` says known scan limits are *"documented on the tests"*, so a test Javadoc **is** the substrate home and deleting from it loses the fact outright; (b) a pointer to ADR-0007 for the thin/full **census**, which ADR-0007 states **backwards** (`:62` still calls `customer` thin; it has had an application service since S2). Both caught at review, not by any gate | Two rules the next sweep inherits. **A fitness test's stated blind spot is contract, never archaeology** — it is the one place the repo directs readers to. And **verifying a pointer means reading the target for the specific claim**, not for the topic: ADR-0007 does carry the templates, which is what made the census pointer look verified. Where a fact is a *census* (what is true today), do not point at all — state the rule and let the census live in `riviera-modulith`, which maintains it |

## Open questions / Assumptions

- **A-1** Trim level and scope were decided by the maintainer up front: *contract-only Javadoc with
  rationale relocated* (not deleted), across all four trees. Recorded so no session re-derives it.
- **A-2** Test-tree doc blocks that justify *why a test exists* are more defensible than production
  archaeology; they still lose issue numbers and history, but the "why this test" sentence stays.
- **A-3** ~~*(decided 2026-08-07)* The sweep stops at the **top ~200 over-budget files**.~~
  **Superseded by A-5.** The stopping rule was still a file count, and a file count was the wrong unit.
- **A-5** *(decided 2026-08-07, after the rescan)* The sweep stops when the **duplicate-bearing files
  run out**, not at a rank. Sampling the top 15 untrimmed files found 2 with a second home; the rest
  were contract, test-rationale (A-2) or measurement records. The remaining 547 over-budget files are
  **not a backlog** — §6d governs them the next time they are edited for another reason. Reopening this
  sweep needs new evidence of duplication, not a fresh block-size census.
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

**Stage:** ✅ complete **on the volume axis** · **Follow-up outcome (2026-08-08):** the scoped
issue-ref strip pass was decided GO as issue #550 and executed for **Phase A — the entire
`frontend/` tree** (nine PRs, #551–#559; state store `docs/plans/issue-550-issue-ref-strip.md`).
The maintainer then stopped the pass: **Phases B/C (backend) deliberately do not proceed** — the
backend's refs decay under §6d as files are edited for other reasons, and any revival starts from
fresh mini-probes. The paragraph below records the decision inputs as they stood; its frontend
figures (179 of 254 files, "every neighbour cites issue numbers") describe the pre-#550 tree.
Absent further work,
§6d and `check-comment-only.mjs` govern the rest of the tree the next time a file is edited for another
reason.

Gates cleared on #545: full CI green; `/code-review` returned one finding at or above threshold (the
broken ledger table) plus three below it that were fixed anyway — the two verifier blind spots now
recorded as R-8 and the dangling relocation pointer as R-7; Sonar 0 new issues, 0 duplicated blocks,
no coverable new lines. **Read R-7 and R-8 before starting a batch** — they are the two ways this
sweep can silently do damage, and both were found by review rather than by the gates.

| Phase | Scope | Ships in | Status |
|---|---|---|---|
| 0 | §6d + the frontend TSDoc twin | #545 | ✅ committed `1109c2f` |
| 1 | `check-comment-only.mjs` + its 8 tests | #545 | ✅ committed |
| 2 | First batch — 12 heaviest files | #545 | ✅ committed, CI green |
| 3 | Backend main, over-budget files with a *duplicated* home | #547, #548 | ✅ 17 files; stopped deliberately when yield fell to ~6 lines/file |
| 4 | Rescan + closing batch — every remaining file with a **named second home**, across both trees | #549 | ✅ 9 files, 96 lines |
| — | ~~Backend test top ~50 / `frontend/src` top ~30 as separate phases~~ | — | ❌ dropped by the rescan: sampled and found to be contract, not archaeology |

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
| `booking/adapter/in/RefundExecutorProperties.java` | 145 | 105 | Sizing argument relocated to RESPONSIBILITIES §`booking` (the arithmetic was moved there, not assumed present — see R-7); the operational *why* is in the exception messages, where an operator meets it at boot |
| `RateLimitFilter.java` | 273 | 184 | Security-critical, so every trap stayed (the `%64` decode bypass, the firewall tripwire, `AuthBudget`'s "same 401, opposite meaning"). What went: the separation rule restated once per constant |
| `notification/application/AsyncMailDispatcher.java` | 189 | 90 | Third copy of RESPONSIBILITIES §`notification`, which CLAUDE.md already names as the single home for these policies |
| `notification/application/TransactionalMailService.java` | 153 | 92 | Five registry-vehicle methods each restated the shared posture; stated once on the class |
| `booking/adapter/in/RefundExecutorConfig.java` | 131 | 92 | Twin of the next row — trimmed in parallel so the two stay symmetric, which their own Javadoc requires |
| `notification/adapter/in/RegistryMailExecutorConfig.java` | 128 | 99 | `defaultCandidate = false`, compose-don't-replace, and episode-ends-on-drain all kept verbatim |
| `frontend/src/app/operator/operator-console.model.ts` | 133 | 116 | A DTO file already near budget — 23 types × ~5 lines. Treat as the floor |
| `RateLimitFilterTest.java` | 178 | 175 | Provenance out, rationale kept per A-2. Three lines: the evidence for the finding below |

**Phase 3, batch 1** (backend main, biggest-block first):

| File | Before | After | Note |
|---|---|---|---|
| `notification/adapter/in/BookingConfirmationMailListener.java` | 93 | 61 | Kept every trap: the annotations are the composite's expansion and must stay written out, no `REQUIRES_NEW`, and the class/method/param names are the registry `listener_id` |
| `ClientIpResolver.java` | 92 | 80 | Trust model kept whole — it is the contract. The measured CDN topology points at its runbook, which carries it in more depth |
| `RateLimitProperties.java` | 71 | 55 | `@param` block was the bulk; the trust-list default ("an unset property throttles more, never less") stays |
| `CustomerRetentionProperties.java` | 57 | 39 | Kept the `isNegative()` argument — `P1M-40D` reads positive by total months yet moves the cutoff forward |
| `notification/adapter/in/MailTransportProperties.java` | 54 | 37 | Kept millis-not-`Duration` and the one-knob-three-consumers rule |
| `notification/adapter/in/RegistryMailProperties.java` | 53 | 33 | Kept the env-var placeholder trap: deleting the property lines breaks the override while the defaults keep working |
| `notification/package-info.java` | 53 | 36 | Layout and the `allowedDependencies` rationale stay — they sit next to the annotation they explain |
| `shared/package-info.java` | 53 | 27 | Admission bar stays; the three per-type grounds point at RESPONSIBILITIES §`shared`, which CLAUDE.md already names as their home |

The `*Properties` files share one shape worth reusing: their operational *why* is already in the
`IllegalArgumentException` messages, **left byte-identical**, where an operator meets it at boot. The
class Javadoc only has to carry the traps that are not reachable from a failed boot.

**Phase 3, batch 2** — 9 files, **56 lines**, against batch 1's 158 from 8. The shortfall is the
useful part:

| File | Before | After |
|---|---|---|
| `notification/adapter/out/JdbcEmailSuppressions.java` | 97 | 82 |
| `notification/adapter/in/BookingCancellationMailListener.java` | 53 | 41 |
| `notification/application/EmailSuppressions.java` | 64 | 56 |
| `PrincipalSessionRevoker.java` | 45 | 40 |
| `venue/api/VenueRates.java` | 60 | 56 |
| `SessionIdentity.java` | 52 | 48 |
| `venue/spi/SetAvailabilityLookup.java` | 57 | 53 |
| `OperatorAccountController.java` | 79 | 76 |
| `venue/application/CommissionRateStore.java` | 64 | 63 |

**Phase 4, closing batch** — 9 files, **96 lines**. Selected by *named second home*, never by block
size. Every target was read to confirm it carries the text before the copy was removed (R-7) — and the
review gate still caught two misses, recorded as R-9 below.

| File | Before | After | Second home |
|---|---|---|---|
| `MailListenerExecutorArchitectureTest.java` | 111 | 87 | RESPONSIBILITIES §`notification` |
| `PackageShapeArchitectureTests.java` | 76 | 61 | invariant #11 + `riviera-modulith` (census) |
| `ShutdownDrainArchitectureTest.java` | 107 | 92 | RESPONSIBILITIES §`shared` |
| `RegistryMailExecutorConfigTest.java` | 104 | 91 | RESPONSIBILITIES §`notification` |
| `RefundListenerExecutorArchitectureTest.java` | 75 | 64 | RESPONSIBILITIES §`booking` + its notification twin |
| `RefundBulkheadIT.java` | 114 | 108 | RESPONSIBILITIES §`booking` |
| `MyAccountController.java` | 57 | 51 | `OperatorAccountController#changePassword` |
| `RegistryMailBulkheadIT.java` | 71 | 68 | RESPONSIBILITIES §`notification` |
| `PublishedSurfacePlacementArchitectureTests.java` | 57 | 54 | ADR-0007 Amendment 1 |

`ShutdownDrainArchitectureTest` also carried an **orphaned duplicate Javadoc block** — two doc comments
stacked on `KNOWN_DRAINING_POOLS`, the first unreachable. Removed here; worth knowing the shape exists,
since nothing flags it.

### The rescan that closed the sweep (2026-08-07)

Phase 3 stopped at ~6 lines/file and the question was whether to continue. The rescan says no, on
measurement rather than fatigue.

**State at rescan:** 23,902 lines across 1,050 files. Over-budget: 583 files / 12,086 lines, of which
**556 files / 10,835 lines were untrimmed**.

**The sample.** The top 15 untrimmed files (846 over-budget lines) were read — not inferred from paths —
and asked the selection question. **7 of 15 had a second home** (2 a substrate-doc duplicate, 5 a
sibling or in-code restatement); the other 8 were contract, test-rationale or measurement records. The
2 substrate-doc duplicates yielded ~20 lines each rather than the 100+ that `ObservabilityMetrics` and
`AsyncMailDispatcher` did, because the duplication was one paragraph of several rather than wholesale.

Those 7 files are the bulk of the closing batch below — **84 of its 96 lines** — so the sample is not
independent evidence of a stopping point; it *is* the last of the work. Sample yield came in at **~10%
of the 846 lines**, against a pre-batch estimate of ~19%. The estimate was 2× optimistic, which
strengthens the stop rather than weakening it: **8 of the 15 heaviest untrimmed files in the tree
yielded nothing**, and the ranking only gets thinner below them.

**Three findings that make continuing the wrong call:**

1. **The duplicate-bearing class is exhausted.** It was never a large population; the first twelve files
   consumed most of it.
2. **A third of the remaining volume (3,525 lines) is the backend test tree**, which A-2 explicitly
   protects. Ten of the fifteen sampled files were tests, and their prose is "why this guard is not
   vacuous" — deleting it is how a security tripwire quietly becomes a change-detector.
3. **The frontend essays are measurement records, not archaeology.** `admin-console-stats.ts` documents
   that restoring two long labels moves the fold from y=691 to y=707 against a 740px budget;
   `admin-console-tabs.ts` records the wrap budget and names the ninth tab as the revisit trigger.
   Nobody re-takes those measurements. The line count is the cheapest thing about them.

**What continuing would have cost:** the top 200 untrimmed files hold 6,105 lines; at a falling yield
rate that is roughly **875 lines across ~25 batches** — 3.7% of the tree for 25 PRs, 25 reviews and 25
CI runs, each carrying R-1 and R-7 exposure.

**Why the closing batch happened anyway.** Its nine files were not worth touching for volume. They were
worth touching because each held a paragraph restating a doc that owns it, and **two copies of a rule
drift apart** — a correctness cost, not a cosmetic one. `MailListenerExecutorArchitectureTest` and
`RefundListenerExecutorArchitectureTest` carried near-identical copies of the same argument, with
RESPONSIBILITIES §`notification` holding a third.

**Strike the ~6,800-line estimate below.** The measured reachable figure was always closer to ~1,000,
and 912 of it shipped (#545 + #547 + #548 + this batch).

### The axis this sweep never measured

Added after the close-out, when the maintainer asked whether bloated Javadoc/TSDoc really was gone from
**both** trees. Re-measuring against §6d's own text rather than against block size says **no**, and the
gap is not where this sweep was looking.

The sweep ranked by *lines in blocks of ≥10* and asked one question: **does this prose have a second
home?** That is the right test for **volume**, and on volume the stop holds. But §6d has a second,
blunter clause — ***"No issue numbers"*** — that needs no second-home analysis at all, and it was never
measured. Against it, at the close of this sweep:

| Tree | Doc blocks | Over §6d budget | Excess lines | **Blocks citing an issue #** | Files with ≥1 |
|---|---|---|---|---|---|
| backend main | 1,288 | 836 | 6,406 | 393 | 289 / 481 |
| backend test | 977 | 597 | 3,793 | 347 | 204 / 309 |
| frontend src | 1,008 | 354 | 1,932 | 369 | **179 / 254** |
| frontend e2e | 47 | 15 | 77 | 27 | 10 / 11 |
| **Total** | **3,320** | **1,802** | **12,208** | **1,136** | **682 / 1,055** |

Counting 3–4-digit refs only, so `invariant #11`, `D-8`, `RV-BE-11` and `ADR-0007` — all explicitly
permitted by §6d — are excluded. **1,756 individual refs** across those 1,136 blocks.

**Two findings the volume framing hid.**

1. **The 12,208 "excess" lines are mostly not bloat.** The top of that ranking is `SecurityConfig` (112
   over), `RateLimitFilter` (94), `Bookings` (63) — files this sweep already trimmed, whose Javadoc is
   ordering constraints and traps. §6d says so itself: over budget is *"the signal to ask whether the
   excess is contract (keep, and the budget is advisory) or archaeology."* Do not read this column as a
   backlog.
2. **The issue-ref count is not a judgement call, and it is the real gap.** 65% of files carry at least
   one. The prose is usually fine — `customer-auth.ts` documents outcomes and non-enumeration correctly
   — with a provenance tag bolted on: `(S8 #113)`, `(#345)`, `(#101 [D5])`, `(#252, review F3)`. That is
   §6d's own named example of what to delete.

**Why the sweep missed it.** The measurement that *"deleting provenance does not reduce volume"* is
true — a 6-line block re-wraps to 6 lines — and it correctly deprioritised provenance for a **volume**
goal. It was then allowed to retire the question for the **compliance** goal too. Different axes; one
finding cannot close both.

**Where the claim was weakest: the frontend.** It received **one file** in the entire sweep
(`operator-console.model.ts`, #545) and was assessed from five admin-console files, which were
genuinely measurement records. That did not generalise — 179 of 254 frontend files cite an issue
number, and the heaviest are core services (`customer-auth.ts` 14 blocks,
`operator-console.service.ts` 12, `session-auth.ts` 9), not design essays.

### Scoped follow-up — the issue-ref strip pass

**Not** a reopening of the volume sweep; a different pass with a different shape.

**The argument is not line count.** Stripping these yields ≈0 lines. It is that **a rule with 1,136
visible violations does not govern new code** — the next file gets written by copying its neighbours,
and today every neighbour cites issue numbers. That is precisely the drift §6d was written to stop, so
the rule is currently aspirational in the tree that shipped it.

**Shape — the opposite of the volume sweep, which is what makes it tractable.** That sweep was
concentrated and judgement-heavy (top 12 files held most of the win). This one is **diffuse and largely
mechanical**: 494 of the 682 affected files carry exactly **one** block, and only 9 carry 10+. A
"heaviest first" batching therefore buys nothing; batch by **tree and directory** instead.

Splitting the 1,756 refs by how they sit in the sentence:

| Class | Refs | Share | Treatment |
|---|---|---|---|
| bare parenthetical — `(#123)`, `(issue #123)`, `(#123, #456)` | 688 | 39% | delete the parenthetical; prose untouched |
| labelled parenthetical — `(S8 #113)`, `(epic #108)`, `(#348, A7)` | 310 | 18% | delete; the label is provenance too |
| trailing `— #123` / `· #123` | 11 | 1% | delete |
| **embedded in prose** — *"ROTATED by the #326 …"*, *"the recurring #148/#351/#462 class"* | **747** | **43%** | **rewrite the sentence** — not deletable |

So **57% is script-assisted** and **43% needs a human-quality rewrite**. The second half is comparable
in effort to the whole volume sweep and should be costed as such, not assumed cheap.

**Suggested execution**
- **Phase A — frontend** (`frontend/src` + `frontend/e2e`, 396 refs / 189 files). Highest value: the
  §6d TSDoc twin has never actually been applied there, and it is the tree new UI work copies from.
- **Phase B — backend test** (526 refs / 204 files). A-2 still applies: the "why this test exists"
  sentence stays; only the ref goes.
- **Phase C — backend main** (650 refs / 289 files).
- Batch by directory, ~10 files per PR. Gates are this sweep's: `check-comment-only.mjs` (AC-2),
  `check-inline-comments.mjs`, the plan-doc File-structure guard, `/code-review`, Sonar new-issue list.

**Risks specific to this pass**
- **A regex that strips refs can mangle prose** — `"#252, review F3"` leaves a dangling `, review F3`;
  an embedded ref leaves a broken sentence. Never run the script as an auto-fix: use it to *locate*,
  and edit deliberately. AC-2 proves inertness, **not** readability.
- **Over-stripping the allowed refs.** `invariant #2`–`#13`, `D-8`, `RV-BE-11`, `ADR-0007`, `V29` and
  `{@link Type#member}` are all legitimate; only 3–4-digit `#nnn` is banned. A single-digit-safe pattern
  is what keeps invariant references intact.
- **Churn without a volume win** across ~680 files. The counter-argument is A-5's standing policy —
  §6d governs a file the next time it is edited for another reason — which would let these decay
  naturally. Recorded so the trade is made deliberately rather than inherited.

### Block size over-predicts yield — rank by duplication instead

A ≥10-line block is a *candidate*, not a target. Batch 2 was picked purely by block size and half of
it was already at the floor: `CommissionRateStore` gave up **one line**, `VenueRates` four.

The files that pay are the ones whose prose has **a second home**:

- a substrate-doc duplicate — `ObservabilityMetrics` 245→92, `AsyncMailDispatcher` 189→90, both
  `package-info` files;
- an *in-code* duplicate — the four `*Properties` files, whose exception messages already say it;
- restatement across siblings — `SecurityConfig`'s ordering rule stated eight times,
  `TransactionalMailService`'s five near-identical method docs.

The files that do **not** pay are ports, interfaces and edge-security classes, whose Javadoc is
ordering constraints, guarantees and traps — contract with no second home. `VenueRates`,
`SetAvailabilityLookup`, `CommissionRateStore`, `EmailSuppressions`, `SessionIdentity`,
`PrincipalSessionRevoker` are all in this class and are at their floor now.

**Selection rule, and the one that ended the sweep:** before opening a file, ask where else its prose
lives. If the answer is "nowhere", it is contract — skip it. Applied as a *stopping* rule at the
2026-08-07 rescan: when a read sample of the fifteen heaviest untrimmed files turns up only two with a
second home, the population is exhausted and the sweep is done.

**Do not re-rank by block size.** The top of that ranking is now dominated by already-trimmed files
that stay there because their Javadoc is genuine contract — `SecurityConfig`, `RateLimitFilter`,
`Bookings`, `operator-console.model.ts` are at their floor, not in a backlog. A future session
regenerating the queue will see them first and should not read that as work.

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

~~**Expected reachable outcome:** ~55% off the over-budget blocks ≈ 6,800 lines, ~28% of the tree.~~
**Superseded** — the 2026-08-07 rescan measured the real figure at ~1,000 lines. The 6,800 estimate
assumed every over-budget block was compressible; sampling found most of them to be contract. Kept
here struck through rather than deleted, because the *shape* of the error is the reusable lesson: a
block-size census tells you where prose is, never whether it has somewhere else to live.

**Tree total:** 24,718 → 24,116 (12 files) → 23,902 (29 files) → **23,806** (38 files, sweep closed).

## File structure

Comment-only edits across the source trees; globs stand in for the mechanical sweep, as the #533
guard sanctions.

- `.claude/skills/riviera-java-conventions/SKILL.md` — **modified**: adds §6d, bounds §6c's exemption
- `frontend/.claude/CLAUDE.md` — **modified**: the TSDoc twin of §6d
- `scripts/check-comment-only.mjs` — **new**: proves a trim diff changed only comments
- `scripts/check-comment-only.test.mjs` — **new**: 15 cases incl. string/text-block/regex/`url()` holes
- `RESPONSIBILITIES.md` — **modified**: receives the refund-bulkhead sizing arithmetic relocated out of
  `RefundExecutorProperties`' Javadoc (R-7)
- `docs/plans/comment-volume-trim.md` — **new**: this doc
- `platform/src/main/java/` — **modified**: Javadoc trimmed to §6d, comment-only
- `platform/src/test/java/` — **modified**: Javadoc trimmed to §6d, comment-only
- `frontend/src/` — **modified**: TSDoc trimmed in `operator-console.model.ts` only (#545); the planned
  wider frontend pass was dropped by the rescan, which found the admin-tab essays to be measurement
  records rather than archaeology
- ~~`frontend/e2e/`~~ — **never touched**; listed here while the sweep was still planned across all four
  trees. The guard only checks touched ⊆ listed, so a stale entry passes — worth knowing it reads as
  outstanding work when it is cancelled work
- `docs/adr/ADR-0007-package-structure.md` — **modified**: freshness note + decision-time markers on the
  thin/full census (see the audit below)
- `docs/architecture/improvement-plan.md` — **modified**: allowed top-level set widened to match
  Amendment 1
- `.claude/skills/riviera-review-overlay/references/backend-conventions.md` — **modified**: same set,
  in the review bank

### `riviera-docs-freshness` audit (2026-08-07)

Run because the closing batch's review (R-9) found a trimmed Javadoc pointing readers at ADR-0007 for a
census ADR-0007 states backwards. The audit was scoped to that claim and its neighbours, not to a git
range. **Four findings, all patched; the decision itself was not touched** — the mechanical
thin-iff-no-application-service rule is unchanged and still binding.

| Doc:line | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `ADR-0007:62,74,88,121,255` | `customer` is the sole **thin** module; full is the other six | `customer` gained `CustomerAccountService` at S2 #111 — all eight contexts are full, none thin | patched: decision-time markers + one freshness note, using the ADR's own dated-snapshot idiom from #319 |
| `ADR-0007:196` | allowed top-level set is `{api, spi, application, domain, adapter}` | **Amendment 1 in the same file** widened it to include `vocabulary` + `events`; `PackageShapeArchitectureTests.ALLOWED_TOP_LEVEL` has all seven | patched: supersession pointer, old set retained for the record |
| `riviera-review-overlay/references/backend-conventions.md:348` | same five-element set, as a **review-bank violation trigger** | as above | patched — the worst of the four: a reviewer following it would flag `vocabulary/` or `events/` as a violation, i.e. manufacture a false finding |
| `docs/architecture/improvement-plan.md:156` | same five-element set | as above | patched |

Two hits deliberately **left alone**: `docs/plans/issue-81-*` and `issue-82-*` carry the old set, and
historical plan docs are records, not living docs (the skill's scope rule). The census in
`.claude/skills/riviera-modulith/SKILL.md` was **verified correct** and is now the named home for it —
ADR-0007 points there rather than restating it, which is R-9's rule applied to the ADR.

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
