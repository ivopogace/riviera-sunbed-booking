# Strip issue-number provenance from backend Javadoc/comments (§6d compliance pass, Phase B/C revival)

**Issue:** #561 · **Branch:** `claude/issue-ref-strip-backend-cute0k` · **Type:** repo-wide mechanical
sweep (comment-only) probe · **Parent:** #550 (`docs/plans/issue-550-issue-ref-strip.md` — CLOSED,
Phase A shipped the whole `frontend/` tree in PR #551–#560; **historical record, never edited by
this doc**)

**Goal (this issue, Stage 0 only):** run the B-0/C-0 mini-probes #550's plan doc specified but never
executed, measure what Phase A could not (backend ref density, embedded-vs-parenthetical split, the
R-4 sole-rationale-pointer rate), and **recommend go/no-go per phase to the maintainer** before any
batch commits to a strip. This doc's first deliverable is the recommendation below, not edits — per
the task brief and the A-5 decay policy that stopped B/C the first time.

**Architecture:** N/A for the probe itself — no file in this repo was edited; the probe files were
read and hand-classified only, per the mandate ("hand-edit 5 files" was interpreted as "hand-locate
and hand-classify every ref in 5 files," since Stage 0's deliverable is measurement + a go/no-go
call, not a shipped batch — no batch ships without the maintainer's decision below).

**Persistence:** N/A — no schema, no SQL, no code.

**Source of intent:** issue #561; the inherited rulebook is `docs/plans/issue-550-issue-ref-strip.md`
Findings F-1–F-13, its risk register (rows R-4, B-0/C-0), and its batching pattern.

**Skills consulted:** `riviera-sdlc` (routing; rule-11 — this doc is the state store) ·
`riviera-plan-doc` (this template) · `riviera-java-conventions` §6c/§6d (the rules being measured
against) · `riviera-review-overlay` (due once any batch actually ships — N/A this issue) ·
`riviera-modulith` (N/A — no class moves) · `postgres` (N/A) · `riviera-local-debug` (not needed —
no `./gradlew`/`npm` run this issue; the probe was read-only).

## The decision this plan records (Stage 0 only — no batch decision yet)

Per the task brief: **the mini-probes decide, nothing else does.** This doc reports what they found
and recommends a call; it does not itself authorize a batch. See *Recommendation* below.

## Acceptance criteria (testable) — Stage 0 scope

- [x] **AC-0.1** B-0: 5 files in `platform/src/test` hand-located and hand-classified for every
      `#nnn` token (2–4 digit), split into permitted (`invariant #1`–`#13`) vs. true issue-ref
      violations, further split embedded-in-prose vs. parenthetical/label-style, and checked for R-4
      (a ref that is the *sole* pointer to load-bearing rationale). *Evidence:* table below.
- [x] **AC-0.2** C-0: same, 5 files in `platform/src/main`.
- [x] **AC-0.3** `sonar-project.properties` read directly (not assumed) to confirm which tree F-8's
      sharpened Sonar-coverage risk actually applies to. *Finding:* `sonar.sources=platform/src/main/java,
      frontend/src` — `platform/src/test` is not analyzed by Sonar **at all** (no exclusion needed,
      unlike the frontend `.spec.ts` carve-out); F-8's coverage-gate risk is backend-**main**-only.
- [x] **AC-0.4** A go/no-go recommendation per phase (B, C), with rationale, delivered to the
      maintainer; **no batch commits until that decision is made.**

## Non-goals (this issue)

- **Shipping any strip batch.** That is explicitly gated on the maintainer's go/no-go below.
- **Reusing Phase A's ~10-files/PR batch size for backend, even if green-lit.** The probe below
  shows why that number does not transfer.
- **Any code change.** Read-only investigation; zero bytes of the repo were edited to produce this
  doc's findings.

## Behavior-parity ledger

N/A — no batch shipped this issue.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-4 (inherited) | A ref is the sole pointer to load-bearing rationale and deletion loses it | measured: **0/172** across both probes (see below) | high if it occurred | every hit in both probes keeps its full explanatory sentence in prose beside the number; stripping the number loses traceability, never content | agent | **closed for the probed files** — the population-wide rate for the rest of the tree is still unmeasured and each future batch must keep watching for it, per F-3–F-5's review-catches-it pattern |
| R-8 (new) | Javadoc blocks in the backend are **decision archaeology at 3–7× the §6d budget** (6 lines/type, 3/member) — several probe files carry class/method docs this dense, not a citation the mechanical strip can just delete the number from | high (5/10 probe files hit it) | high — turns a "delete `#nnn`, reflow a sentence" edit into "read a paragraph, judge contract-vs-archaeology, relocate to RESPONSIBILITIES.md/ADR, leave a pointer, re-budget the doc" | flagged in the go/no-go below; if a phase proceeds, batch sizing must price this in per file, not assume Phase A's per-file cost | agent | open — informs the recommendation, not yet mitigated by any batch |
| R-9 (new) | `platform/src/test` carries a trailing-on-code-line ref (`VenueAdminServiceTest.java:280,380,428`, all `#226`) that would trip F-8 **if `platform/src/test` were in `sonar.sources`** | n/a | none — confirmed harmless | `sonar.sources` excludes the whole test tree (AC-0.3), so this class of edit is safe in B and only a live hazard in C | agent | closed by AC-0.3's finding |
| R-5 (inherited) | The pass spans many sessions/PRs and loses its place | high if a phase proceeds | med | this doc is the rule-11 state store for the backend half; ledger updated per batch in the same commit window, exactly as #550 | agent | standing rule, dormant until a batch ships |
| R-6 (inherited) | Gates pass vacuously when run before committing | med (if a phase proceeds) | high | commit first, then gate — carried forward unchanged | agent | standing rule, dormant |
| R-7 (inherited) | `origin/main` stale in a fresh container | med | low | `git fetch origin main` before the first gate of every session — done this session | agent | standing rule |

## Open questions / Assumptions

- **A-5 (decay) re-examined for the backend, not just cited.** #550's stop reasoned that §6d
  decays naturally as files are edited for other reasons. The five `main`-tree probe files
  (`JdbcBookings`, `VenueAdminController`, `VenueAdminService`, `AuthController`,
  `AdminOperatorController`) are exactly the files under **active** feature churn (venue, booking,
  auth are all mid-epic per `CLAUDE.md`) — the strongest case for A-5 holding without a dedicated
  sweep. The `test`-tree probe files churn on the same cadence as their production counterparts (a
  test file is edited whenever its service is). This cuts against a backend sweep being worth its
  own churn budget, independent of the R-8 finding below. — *Owner:* maintainer, decided below.
- **Open question (resolved by this doc): does the backend hold R-4 at 0 like Phase A?** Yes,
  0/172 across both probes — see the table. This alone would support a "go," but R-8 is the
  countervailing finding the frontend probe never had to weigh.

## Availability & concurrency (invariant #2)

N/A — no SQL, no transaction, no claim-path change; this issue is read-only.

## Spring Modulith — modules, interfaces, events

N/A for structure — no class moves, no published surface, no dependency change. The probe files
span `venue`, `booking`, `notification`, `operator` (via `AdminOperatorController`/`AuthController`
at the root) and the platform-edge login/registration surface — chosen by raw `#nnn`-token density
(`grep -c`), the same selection method Phase A's own A-1 probe used, not by module.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment/payout file fell in the top-5-density set for either tree this probe.

## Angular — frontend surfaces touched

N/A — backend only.

## FE↔BE contract

N/A — no contract change; comment-only investigation.

## Stage 0 — the mini-probes

Selection method: `grep -oE '#[0-9]{2,4}\b' <file> | wc -l` over every `.java` file in each tree,
the 5 highest-count files per tree (same "densest first, within its own split" logic as #550's own
A-1 probe). Counts below are **exact** (`grep`, not eyeballed) for raw tokens and the `invariant
#n` subtraction; the embedded/parenthetical split and the R-4 judgment are hand-read, once per
file, over the full file content (not just grep-matched lines, so a multi-line Javadoc block reads
as a whole before judging whether its ref is load-bearing).

### B-0 — `platform/src/test` (5 files)

| File | Raw `#nnn` | `invariant #n` (permitted) | True violations | Style | R-4 hits |
|---|---:|---:|---:|---|---:|
| `CrossVenueDenialIT.java` | 34 | 9 | 25 | mixed — `//` label-prefix (`#172:`, `#98:`) and parenthetical (`issue #97`, `O8 (#177)`) | 0 |
| `VenueAdminControllerIT.java` | 30 | 5 | 25 | mixed — repeated `#224`/`#226` version-token citations, both embedded and parenthetical | 0 |
| `TransactionalMailServiceTest.java` | 24 | 0 | 24 | almost entirely **embedded in multi-paragraph rationale** (`"The asymmetry #423 had to settle..."`) — the densest Javadoc in either probe | 0 |
| `VenueAdminServiceTest.java` | 23 | 2 | 21 | mixed — section-header parenthetical (`(O3, issue #172)`) and inline `//` labels; 3 trailing-on-code-line hits (`#226`, lines 280/380/428) | 0 |
| `WebSliceStubs.java` | 23 | 0 | 23 | mostly **parenthetical/header-style** (`/** S2 #111 ... */`, `S4 (#112)`) — each bean's doc opens with its provenance | 0 |
| **Total** | **134** | **16** | **118** | — | **0** |

### C-0 — `platform/src/main` (5 files)

| File | Raw `#nnn` | `invariant #n` (permitted) | True violations | Style | R-4 hits |
|---|---:|---:|---:|---|---:|
| `JdbcBookings.java` | 19 | 9 | 10 | embedded in dense SQL-adjacent operational rationale (`#395`, `#386` idiom-references) | 0 |
| `VenueAdminController.java` | 16 | 6 | 10 | mixed — class-doc citation (`issue #7`) + per-method embedded (`#224`, `#226`) | 0 |
| `VenueAdminService.java` | 15 | 7 | 8 | embedded, tied to the ownership/version-token rationale threaded through every method | 0 |
| `AuthController.java` | 14 | 0 | 14 | embedded in long class + member Javadoc (`D-1`/`D-2`/`D-8` decision labels — permitted — woven with `#nnn` issue citations) | 0 |
| `AdminOperatorController.java` | 14 | 2 | 12 | **the densest decision-archaeology block in either probe**: a 43-line class Javadoc arguing the suspend/revoke-bracket design (`#128`, `#357`, `#344`) | 0 |
| **Total** | **78** | **24** | **54** | — | **0** |

**R-4 (sole-rationale-pointer) rate: 0/172 across both probes** — matches Phase A's frontend-wide
0/≈1,700. Confirmed by hand-reading every hit's surrounding sentence: in all 172 cases the
explanatory prose survives the number's removal intact; only traceability to the tracker is lost,
never the rationale itself. **R-4 does not block either phase.**

**F-8 exposure (`sonar.sources` = `platform/src/main/java` + `frontend/src` only, confirmed by
reading `sonar-project.properties` directly, not assumed):**
- **B is F-8-immune by construction** — `platform/src/test` isn't analyzed by Sonar at all, so even
  the three trailing-on-code-line `#226` hits in `VenueAdminServiceTest.java` are safe to edit.
- **C carries live F-8 exposure** — none of the 54 true-violation tokens in the 5 probed main files
  happen to sit trailing-on-a-code-line (all are in standalone Javadoc/comment blocks), but that is
  this 5-file sample, not a tree-wide guarantee; every future C batch must keep re-checking per file.

**R-8 (new finding — the reason Phase A's cost model doesn't transfer):** measuring against §6d's
stated budget (~6 lines/type Javadoc, ~3/member) by counting the actual class/method doc blocks
these refs live in:

| File | Block | Lines | Budget | Over by |
|---|---|---:|---:|---|
| `AdminOperatorController.java` | class Javadoc | 43 | 6 | ~7× |
| `JdbcBookings.java` | `boundedClient` method Javadoc | 21 | 3 | ~7× |
| `AuthController.java` | class Javadoc | 23 | 6 | ~4× |
| `VenueAdminService.java` | class Javadoc | 19 | 6 | ~3× |
| `TransactionalMailServiceTest.java` | class Javadoc + several method docs | 17 (class) + several 7–10-line method blocks | 6 / 3 | ~3× and up |

These aren't citation-style refs like Phase A's typical TSDoc hit (`"the recurring #148/#351/#462
stranded-focus class"`, fixed once by a rewrite formula) — they're the exact "decision history"
§6d names as the thing to *relocate*: `"began…"`, `"used to…"`, `"deliberately not…"`,
`"Before this counter…"`, `"reversed accepted drift…"`. A compliant edit here is not "delete `#nnn`,
reflow one sentence" — it's "read the paragraph, decide contract vs. archaeology, move the
archaeology to `RESPONSIBILITIES.md`/an ADR, leave a one-line pointer, re-check the remaining doc
against budget." That is a fundamentally larger per-file unit of work than any Phase A batch priced
in, in **both** trees, though it's denser in `main` (5/5 probe files hit it) than `test` (2/5:
`TransactionalMailServiceTest`, `CrossVenueDenialIT`'s admin-surface doc).

## Recommendation (go/no-go per phase) — STOP here for the maintainer's decision

**B (`platform/src/test`): conditional go, re-scoped.**
Zero Sonar risk (outside `sonar.sources` entirely — even trailing-on-code-line refs are safe, no
F-8 carve-out logic needed), R-4 closed at 0/118. But density is high (~24 true violations/file
vs. Phase A's frontend average of ~2.7/file) and 2/5 probe files carry genuine R-8
decision-archaeology needing relocation, not deletion. **If green-lit:** batch at ~5 files/PR (half
Phase A's size), priced for hand-judgment time rather than edit count; expect some batches to
produce a `RESPONSIBILITIES.md` edit alongside the comment strip, not just a strip.

**C (`platform/src/main`): no-go — recommend deferring, not batching under this plan's shape.**
Three compounding reasons, not one: (1) live F-8 Sonar-coverage exposure on every batch (a coverage
gate red on a provably-inert diff, the exact PR #552 incident class, now on the tree that's
actually analyzed); (2) R-8 is denser here (5/5 probe files) and higher-stakes (the
`AdminOperatorController` revoke-bracket rationale, the `JdbcBookings` bounded-executor rationale —
both genuinely load-bearing architecture explanations, not filler); (3) the A-5 decay argument is
**strongest** exactly here — these are the files under active epic churn (`venue`, `booking`,
platform-edge auth), so §6d's ambient enforcement has the best chance of working without a
dedicated sweep. Recommend either: (a) leave C to A-5 decay, matching the original #550 stop
rationale, or (b) if the relocation work is wanted, scope it as its **own** project
("relocate load-bearing Javadoc to RESPONSIBILITIES.md/ADRs, `main` tree") — a documentation
project with a different acceptance shape than a mechanical `#nnn`-deletion sweep, not a
`platform/src/main` sibling of Phase A's batches.

**No batch ships from this issue until the maintainer picks one of the above.** Stage pointer below
reflects that stop.

## Execution status

**Stage pointer:** ⏳ **B green-lit by the maintainer 2026-08-08; B-1 shipped this session. C stays
not-recommended per the *Recommendation* above — no C batch runs without a separate go.**

**Next action:** the dense tier (≥4 refs/file) has 33 files left (review-recount, `grep`-exact —
corrects the "~28" eyeballed after B-4); continue at ~5 files/PR until it's exhausted, then switch to
larger sparse-tail sweeps (~20–30 files/PR, matching Phase A's own dense→sparse transition) for the
156 files carrying 1–3 refs (422 true-violation tokens remain tree-wide across both tiers). C stays
parked.

| Phase / batch | Scope | Ships in | Status |
|---|---|---|---|
| B-0 (probe) | 5 densest `platform/src/test` files by raw `#nnn` count — 118 true violations, 0 R-4 hits, F-8-immune, 2/5 files carry R-8 decision-archaeology | this doc | ✅ measured, reported above |
| C-0 (probe) | 5 densest `platform/src/main` files by raw `#nnn` count — 54 true violations, 0 R-4 hits, F-8-exposed, 5/5 files carry R-8 decision-archaeology | this doc | ✅ measured, reported above |
| B-1 | the B-0 probe's same 5 files (`CrossVenueDenialIT`, `VenueAdminControllerIT`, `TransactionalMailServiceTest`, `VenueAdminServiceTest`, `WebSliceStubs`) — 117 true-violation `#nnn` tokens removed (per-file table below), 0 orphan labels left dangling (O4/O8/T7/S3/S4/S8/S9 rewritten to real nouns or dropped per A-1/F-4), 0 R-4 hits, every `invariant #n` preserved (AC-3: 6 removed/6 added, balanced), R-8 (decision-archaeology over budget in `TransactionalMailServiceTest` + `CrossVenueDenialIT`) left unaddressed by design (out of scope for this mechanical batch) | pushed | ✅ all gates green (AC-2 comment-only, AC-5 non-vacuous 0-violation scan, AC-3 balanced, `compileJava`/`compileTestJava` clean, the 2 pure-unit classes' own tests pass) — CI/Sonar pending a PR |
| B-2 | the next 5 densest `platform/src/test` files by raw `#nnn` count — `AsyncMailDispatcherTest`, `RateLimitFilterTest`, `OperatorAccountControllerTest`, `PayoutModuleTest`, `MailTransportPropertiesTest` — 64 true-violation tokens removed (F-17 correction: 5 tokens inside AssertJ `.as(...)` description strings were caught and reverted — those are code, F-1's `describe()`-title class, not comments), invariant `#11` preserved in the two files carrying it, 0 R-4 hits. All 5 touched test classes pass locally, `PayoutModuleTest` via Testcontainers (Docker available this session) | pushed | ✅ all gates green after the F-17 fix (AC-2 comment-only, AC-5 non-vacuous scan, `compileJava`/`compileTestJava` clean, all 5 test classes pass) |
| B-3 | the next 5 densest `platform/src/test` files by raw `#nnn` count — `BookingMailFixtures`, `SetPasswordIT`, `ClientIpResolverTest`, `AdminOperatorControllerTest`, `OperatorPasswordChangeIT` — 51 true-violation tokens removed, 0 permitted refs lost (none of the 5 carried `invariant #n`/`D-n`), 0 R-4 hits. One edit briefly produced a 2-line inline comment (`SetPasswordIT`); the `PostToolUse` RV-STYLE-1 hook (§6c) caught it before the next tool call and it was compressed to one line. `compileJava`/`compileTestJava` clean; 4 of 5 files are directly testable (`BookingMailFixtures` is a shared IT fixture, no `@Test` of its own) and all 4 pass locally, 2 via Testcontainers | pushed | ✅ all gates green (AC-2, AC-5 non-vacuous, `compileJava`/`compileTestJava`, all 4 testable classes pass) |
| B-4 | the next 5 densest `platform/src/test` files by raw `#nnn` count — `ControllableMailer`, `WorkerContextArchitectureTest`, `AdminPayoutSecurityIT`, `OperatorLifecycleIT`, `EmailSuppressionIT` — 33 true-violation tokens removed, 2 `invariant #13` refs preserved (`AdminPayoutSecurityIT`), 0 R-4 hits. `OperatorLifecycleIT`'s class doc needed a fuller rewrite (two clauses briefly stacked after a ref's removal); caught and fixed by hand-reading the whole paragraph before moving on | pushed | ✅ all gates green (AC-2, AC-5 non-vacuous, `compileJava`/`compileTestJava`, all 4 directly-testable classes pass — `ControllableMailer` is an IT fixture, no `@Test` of its own) |
| B-5 | the next 5 densest `platform/src/test` files by raw `#nnn` count — `RegistryMailShedDurabilityIT`, `RegistryMailPropertiesTest`, `BookingConfirmationMailListenerTest`, `CreateBookingServiceTest`, `SessionIdentityTest` — 31 true-violation tokens removed, 0 R-4 hits. Applied the F-17 lesson proactively this time: 3 refs inside AssertJ `.as(...)` strings (2 files) were identified as code before editing and left untouched, alongside real Javadoc refs on nearby/same lines that were stripped | pushed | ✅ all gates green (AC-2, AC-5 non-vacuous, `compileJava`/`compileTestJava`, all 5 test classes pass — one via Testcontainers) |
| B-6… | next ~5-file batch (dense tier, 33 files left after B-5) | — | not started |
| C-1… | backend main batches | — | not recommended; blocked on a separate maintainer go |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**B-5 per-file true-violation count (exact, `grep`-verified before and after):**

| File | True violations removed | Refs intentionally left in `.as(...)` code strings (F-1/F-17) |
|---|---:|---:|
| `RegistryMailShedDurabilityIT.java` | 5 | 1 (`#407`) |
| `RegistryMailPropertiesTest.java` | 4 | 2 (`#383`, `#370`) |
| `BookingConfirmationMailListenerTest.java` | 6 | 0 |
| `CreateBookingServiceTest.java` | 10 | 0 |
| `SessionIdentityTest.java` | 6 | 0 |
| **Total** | **31** | **3** |

**B-4 per-file true-violation count (exact, `grep`-verified before and after):**

| File | True violations removed | `invariant #n` preserved |
|---|---:|---:|
| `notification/ControllableMailer.java` | 8 | 0 |
| `WorkerContextArchitectureTest.java` | 8 | 0 |
| `payout/AdminPayoutSecurityIT.java` | 5 | 2 |
| `operator/OperatorLifecycleIT.java` | 6 | 0 |
| `notification/adapter/out/EmailSuppressionIT.java` | 6 | 0 |
| **Total** | **33** | **2** |

**B-3 per-file true-violation count (exact, `grep`-verified before and after):**

| File | True violations removed | Permitted refs preserved |
|---|---:|---:|
| `notification/BookingMailFixtures.java` | 12 | 0 |
| `SetPasswordIT.java` | 10 | 0 |
| `ClientIpResolverTest.java` | 10 | 0 |
| `AdminOperatorControllerTest.java` | 10 | 0 |
| `OperatorPasswordChangeIT.java` | 9 | 0 |
| **Total** | **51** | **0** |

**B-2 per-file true-violation count (exact, `grep`-verified before and after, post-F-17-fix):**

| File | True violations removed | `invariant #n` preserved | `#nnn` intentionally left in code strings (F-1/F-17) |
|---|---:|---:|---:|
| `AsyncMailDispatcherTest.java` | 17 | 0 | 1 (`#442` inside an `.as(...)` string) |
| `RateLimitFilterTest.java` | 15 | 0 | 0 |
| `OperatorAccountControllerTest.java` | 14 | 0 | 0 |
| `PayoutModuleTest.java` | 11 | 1 | 0 |
| `MailTransportPropertiesTest.java` | 7 | 1 | 4 (`#368` ×3, `#370` — all inside `.as(...)` strings) |
| **Total** | **64** | **2** | **5** |

**B-1 per-file true-violation count (exact, `grep`-verified before and after):**

| File | True violations removed | `invariant #n` preserved |
|---|---:|---:|
| `CrossVenueDenialIT.java` | 24 (the B-0 table's "25" was off by one — the case-sensitive `invariant #n` grep used for the probe missed one capitalized "Invariant #13's" occurrence; corrected here) | 10 |
| `VenueAdminControllerIT.java` | 25 | 5 |
| `TransactionalMailServiceTest.java` | 24 | 0 |
| `VenueAdminServiceTest.java` | 21 | 4 |
| `WebSliceStubs.java` | 23 | 0 |
| **Total** | **117** | **19** |

**Findings register (this issue's own, continuing #550's numbering space but never editing that
doc — new findings start at F-14 to stay globally unambiguous across both plan docs)**

| # | Source | Finding | Status |
|---|---|---|---|
| F-14 | C-0/B-0 probe | `sonar.sources` (read directly, not assumed) excludes `platform/src/test` entirely — F-8's coverage-gate risk is backend-**main**-only; the test tree needs no spec-file-style carve-out logic because it was never in scope for Sonar at all | recorded; drives the B vs. C risk asymmetry above |
| F-15 | C-0/B-0 probe | Backend Javadoc density and R-8 (decision-archaeology 3–7× over the §6d budget) make per-file cost fundamentally uneven with Phase A's TSDoc-citation profile — a future batch's size must be priced from *this* probe, never carried over from Phase A's ~10-files/PR figure | recorded; the stated basis for both phases' batch-size recommendation above |
| F-16 | C-0 probe | `AdminOperatorController`'s class Javadoc and `JdbcBookings#boundedClient`'s method Javadoc are the two most load-bearing single blocks found in either probe — genuine architecture rationale (the suspend/revoke-bracket ordering; why the sweep reads are bounded and by what) that would need `RESPONSIBILITIES.md`/ADR relocation, not deletion, under §6d's own rule ("relocate, don't delete, when the rationale is load-bearing") | recorded; cited as C's strongest no-go reason |
| F-17 | B-2, `check-comment-only.mjs` (caught before push) | Test-tree comments are not the only place a ref hides: `AssertJ`'s `.as("…")` description strings are Java **code** (`String` literal arguments), the same class F-1 already named for `describe()` titles — but the strip pass's own instinct reads them as prose because they read like sentences. 5 refs across 2 files (`AsyncMailDispatcherTest` 1, `MailTransportPropertiesTest` 4) were edited inside `.as(...)` calls, which `check-comment-only.mjs` correctly flagged as code changed before the batch was pushed | fixed — all 5 reverted to their original text (still carrying their `#nnn`); **rule: before editing any line, confirm it is a `//`/`/* */`/`/** */` comment or Javadoc, never a method-argument string literal, no matter how sentence-like the string reads — `.as(...)`, `.withMessage(...)`, JUnit `assertThat(...).describedAs(...)`, and log-message string literals are the recurring instances of this class** |
| F-18 | B-3, `PostToolUse` RV-STYLE-1 hook | Compressing a ref out of a comment can flip a one-line comment into two (a mid-sentence citation removed left the surrounding clause wrapping onto a second line) — `SetPasswordIT`'s `check-inline-comments.mjs` hook fired live on the edit that did this, exactly as designed (riviera-java-conventions §6c: authoring-time, not just review-time) | fixed immediately — reflowed to one line before the next edit; **rule: after any strip edit that reflows a `//` comment, re-check its line count — removing text can lengthen as easily as shorten a wrapped clause** |

## File structure

- `docs/plans/issue-561-issue-ref-strip-backend.md` — **new**: this doc
- `platform/src/test/java/ai/riviera/platform/CrossVenueDenialIT.java` — **modified** (B-1):
  comment-only, `#nnn` refs stripped
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — **modified** (B-1): same
- `platform/src/test/java/ai/riviera/platform/notification/application/TransactionalMailServiceTest.java`
  — **modified** (B-1): same
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — **modified**
  (B-1): same
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` —
  **modified** (B-1): same
- `platform/src/test/java/ai/riviera/platform/notification/application/AsyncMailDispatcherTest.java`
  — **modified** (B-2): comment-only, `#nnn` refs stripped (1 left inside an `.as(...)` string, F-17)
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — **modified** (B-2):
  comment-only, `#nnn` refs stripped
- `platform/src/test/java/ai/riviera/platform/OperatorAccountControllerTest.java` — **modified**
  (B-2): same
- `platform/src/test/java/ai/riviera/platform/payout/PayoutModuleTest.java` — **modified** (B-2):
  same
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/MailTransportPropertiesTest.java`
  — **modified** (B-2): comment-only, `#nnn` refs stripped (4 left inside `.as(...)` strings, F-17)
- `platform/src/test/java/ai/riviera/platform/notification/BookingMailFixtures.java` — **modified**
  (B-3): comment-only, `#nnn` refs stripped
- `platform/src/test/java/ai/riviera/platform/SetPasswordIT.java` — **modified** (B-3): same
- `platform/src/test/java/ai/riviera/platform/ClientIpResolverTest.java` — **modified** (B-3): same
- `platform/src/test/java/ai/riviera/platform/AdminOperatorControllerTest.java` — **modified**
  (B-3): same
- `platform/src/test/java/ai/riviera/platform/OperatorPasswordChangeIT.java` — **modified** (B-3):
  same
- `platform/src/test/java/ai/riviera/platform/notification/ControllableMailer.java` — **modified**
  (B-4): comment-only, `#nnn` refs stripped
- `platform/src/test/java/ai/riviera/platform/WorkerContextArchitectureTest.java` — **modified**
  (B-4): same
- `platform/src/test/java/ai/riviera/platform/payout/AdminPayoutSecurityIT.java` — **modified**
  (B-4): same
- `platform/src/test/java/ai/riviera/platform/operator/OperatorLifecycleIT.java` — **modified**
  (B-4): same
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/EmailSuppressionIT.java` —
  **modified** (B-4): same
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/RegistryMailShedDurabilityIT.java`
  — **modified** (B-5): comment-only, `#nnn` refs stripped (1 left inside an `.as(...)` string, F-17)
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/RegistryMailPropertiesTest.java`
  — **modified** (B-5): comment-only, `#nnn` refs stripped (2 left inside `.as(...)` strings, F-17)
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListenerTest.java`
  — **modified** (B-5): comment-only, `#nnn` refs stripped
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java`
  — **modified** (B-5): same
- `platform/src/test/java/ai/riviera/platform/SessionIdentityTest.java` — **modified** (B-5): same
- Stage 0 itself (the probe tables above) touched no file — only B-1 through B-5's batches did.

## Generalization-audit log

N/A this issue — no rewrite formula was applied (no edit shipped).

## Acceptance-criteria verification (final)

AC-0.1/AC-0.2: both probes' tables above are the evidence — 10 files, 172 true-violation tokens
hand-classified, 0 R-4 hits. AC-0.3: `sonar-project.properties` read directly; finding recorded as
F-14. AC-0.4: the *Recommendation* section above is the deliverable, stated to the maintainer in
the same turn this doc was written; no batch has shipped, so there is nothing further to verify.

## Self-review checklist (before merge / PR)

- [x] Every AC has a verifying artifact (the probe tables, the direct `sonar-project.properties`
      read, the recommendation section) — this doc IS the AC evidence, since Stage 0 ships no code.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Invariants #1–#13: N/A — no code, schema, money, or timezone surface exists in this diff.
- [x] The historical #550 doc was read, never edited — this is a new doc.
- [x] Execution status at HEAD matches reality: Stage 0 complete, stopped for the maintainer,
      nothing else ships without that decision.
