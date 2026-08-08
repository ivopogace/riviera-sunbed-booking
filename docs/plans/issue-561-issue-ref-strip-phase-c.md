# Strip issue-number provenance from backend `platform/src/main` (§6d compliance pass, Phase C)

**Issue:** #561 · **Branch:** `claude/issue-ref-strip-backend-phase-c` · **Type:** repo-wide
mechanical sweep (comment-only), triage-gated · **Parent:** #561
(`docs/plans/issue-561-issue-ref-strip-backend.md` — CLOSED for Phase B; **historical record,
never edited by this doc**). Sibling: #550 (`docs/plans/issue-550-issue-ref-strip.md`, frontend,
Phase A — CLOSED).

**Goal:** strip MECHANICAL `#nnn` tracker-provenance refs from `platform/src/main`, leaving
F-8-exposed (trailing-on-code-line) refs untouched and cataloguing RELOCATE-CANDIDATE refs
(load-bearing architecture rationale) for a later, separate editorial pass into
`RESPONSIBILITIES.md`/ADRs — never performing that relocation in this pass.

**Architecture:** N/A — comment-only sweep, zero behavior change. The only structural decision is
process: per-file three-way triage (MECHANICAL / F-8-EXPOSED / RELOCATE-CANDIDATE) before any
edit, smaller worktree-isolated batches than Phase B (~3 files/batch dense, ~15 files/batch
sparse) priced for the triage judgment call, and a pre-push local Sonar-relevant check (grep the
diff for any edited line trailing on code) since C carries live Sonar coverage-gate exposure that
B never had (F-8, `sonar.sources` includes `platform/src/main/java`).

**Persistence:** N/A — no schema, no SQL, no code behavior change.

**Source of intent:** issue #561; the Phase C kickoff brief (maintainer-authored, 2026-08-08,
confirming go on C after Phase B's no-go-by-default recommendation); the inherited rulebook is
`docs/plans/issue-561-issue-ref-strip-backend.md` (Findings F-1–F-20, Recommendation section,
Risk register rows R-4/R-8/R-9) and `docs/plans/issue-550-issue-ref-strip.md` (F-1–F-13, the
original batching pattern).

**Skills consulted:** `riviera-sdlc` (routing — comment-only sweep, no feature-area skill
triggered beyond plan-doc discipline) · `riviera-plan-doc` (this template — mandated a fresh doc
per instruction, never editing the closed Phase B doc) · `riviera-java-conventions` §6c/§6d (the
rules being enforced — inline-comment one-line rule, decision-archaeology-belongs-in-docs rule)
· `riviera-review-overlay` (due once a batch ships — RV-STYLE-1 inline-comment check) ·
`riviera-local-debug` (build/test recipe for the structural-net + compile gates each wave) ·
`riviera-modulith` (N/A — no class moves, no published-surface change) · `postgres` (N/A) ·
`riviera-docs-freshness` (N/A — this pass explicitly produces no `RESPONSIBILITIES.md`/ADR edits;
the RELOCATE-CANDIDATE inventory is the deliverable for a *future* pass, not this one).

## The decision this plan records

Phase B's plan doc recommended **no-go** on C by default, citing three compounding reasons: live
F-8 Sonar exposure, denser R-8 decision-archaeology than B, and the strongest A-5 (ambient decay)
argument of either tree. The maintainer's kickoff brief overrides that default with an explicit
go, on the condition that C is run as a **fundamentally different process** from B — not "Phase B
again on `platform/src/main`" — via:

1. A mandatory per-file three-way triage (MECHANICAL / F-8-EXPOSED / RELOCATE-CANDIDATE) instead
   of Phase B's blanket strip.
2. A hard rule never to edit a ref trailing on a code-bearing line, regardless of content.
3. Explicit non-goals: no `RESPONSIBILITIES.md`/ADR edits this pass — RELOCATE-CANDIDATE hits are
   inventoried, not resolved.
4. Smaller batches (~3 dense, ~15 sparse) than Phase B's (~5/~22), priced for the triage step.
5. A pre-push local Sonar-relevant check on every batch, not just the standard gates.

## Acceptance criteria (testable)

- [ ] **AC-1:** Every file in the recomputed scope (270 files, 55 dense ≥4 refs, 215 sparse 1–3
      refs, 677 true-violation tokens as of this branch — recomputed fresh, see *Current scope*)
      is triaged file-by-file into MECHANICAL / F-8-EXPOSED / RELOCATE-CANDIDATE for every `#nnn`
      hit. *Pinned by:* the per-batch agent reports recorded in the Execution-status ledger below,
      each stating its breakdown.
- [ ] **AC-2:** Every MECHANICAL hit is stripped; the resulting diff is comment-only against
      `origin/main` for every touched file. *Pinned by:* `node scripts/check-comment-only.mjs`
      run against each integrated batch's diff.
- [ ] **AC-3:** Zero edited line sits trailing on a code-bearing line (the F-8 hazard). *Pinned
      by:* the pre-push grep check (diff `+`/`-` lines that are not whole-line comment changes)
      run on every batch before push, recorded per-batch below.
- [ ] **AC-4:** Every permitted label (`invariant #1`–`#13`, `D-n`, `AC-n`, `ADR-nnnn`, `RV-*`,
      Flyway `Vnn`, `{@link}`/`{@code}`, RFC numbers, Sonar rule ids, hex colors) is preserved
      across every batch. *Pinned by:* per-batch before/after counts in the ledger, same method as
      Phase B's B-1..B-19 rows.
- [ ] **AC-5:** `check-inline-comments.mjs` passes clean on the full committed diff after every
      wave (the RV-STYLE-1 one-line-comment rule, F-20-part-2 aware — content shortened, not
      crammed onto one long line).
- [ ] **AC-6:** `compileJava`/`compileTestJava` clean and the structural net
      (`ModularityTests`/`JdbcOnlyArchitectureTests`/`PackageShapeArchitectureTests`/
      `PublishedSurfacePlacementArchitectureTests`) green after every wave.
- [ ] **AC-7:** A RELOCATE-CANDIDATE inventory (file, line, one-sentence rationale description) is
      produced and recorded in this doc, ready to hand to a later editorial pass — this pass makes
      zero edits to `RESPONSIBILITIES.md` or any ADR.
- [ ] **AC-8:** CI green (including SonarCloud — 0 new issues, 0 duplicated blocks, ≥80% new-code
      coverage) on the PR(s) this pass produces, verifying AC-3's local check actually held.

## Non-goals

- No edits to `RESPONSIBILITIES.md` or any ADR — the RELOCATE-CANDIDATE inventory is this pass's
  entire deliverable for that thread; the relocation itself is explicit future follow-up work.
- No edits to any F-8-exposed trailing-on-code-line ref, however trivial it looks.
- No merge without every CI check green, SonarCloud included.
- No reuse of Phase B's per-file cost model or batch size — C's batches are smaller by design
  (~3 dense / ~15 sparse vs. B's ~5 / ~22), priced for the triage step which B never had to do.

## Behavior-parity ledger

N/A — comment-only sweep; no surface is retired or replaced. Every batch's `check-comment-only.mjs`
pass is the direct verification that zero behavior changed.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 (F-8, carried from Phase B) | An edited ref sits trailing on a code-bearing line, flipping that line to "new code" for the Sonar coverage gate and failing CI on a behavior-inert diff (the PR #552 incident class) | med — `platform/src/main` is live-analyzed, unlike B's tree | high — CI-red on unrelated grounds, blocks merge | per-file triage classifies trailing-on-code hits as F-8-EXPOSED and skips them outright; a pre-push grep check re-verifies no edited line is trailing-on-code before every push | agent | mitigated by process; verified per-batch |
| R-2 (R-8, carried from Phase B) | A ref is deleted that was the sole attachment point for load-bearing architecture rationale (the `AdminOperatorController`/`JdbcBookings#boundedClient` class of finding) | high — 5/5 C-0 probe files hit this | high — silent loss of documented design rationale | RELOCATE-CANDIDATE triage category catches this by construction: any ref attached to genuine rationale is flagged and left untouched, never stripped | agent | mitigated by process; inventory is this pass's deliverable |
| R-3 | Parallel worktree-isolated agents drift on triage judgment calls (mirrors Phase B's F-20: 2/6 subagents over-generalized the orphan-label rule) | med — smaller batches reduce blast radius per mistake, but more batches increase the number of judgment calls made | med — inconsistent stripping across batches | serial integration review re-checks each batch's triage breakdown against precedent before cherry-pick; default-to-RELOCATE-CANDIDATE-when-unsure is stated explicitly in every agent prompt | agent | standing mitigation, checked every batch |
| R-4 | Wave sized past what can actually be reviewed (mirrors Phase B's F-20, caught at batches 6–7) | med | med | waves capped at ~6–7 batches; explicit check-in after each wave before starting the next | agent | standing rule |
| R-5 | `origin/main` stale in a fresh container | low | low | `git fetch origin main` before the first gate of every session/wave | agent | standing rule |
| R-6 | Gates pass vacuously when run before committing | med | high | commit first, then gate — carried forward from Phase A/B | agent | standing rule |

## Open questions / Assumptions

- **Open question:** exact placement/format of the RELOCATE-CANDIDATE inventory's eventual
  consumption (a follow-up issue vs. direct `RESPONSIBILITIES.md` PR) is not this pass's call —
  *Owner:* maintainer · *Resolves by:* the follow-up editorial pass, out of this doc's scope.

## Availability & concurrency (invariant #2)

N/A — comment-only sweep, zero SQL/transaction/claim-path touched.

## Spring Modulith — modules, interfaces, events

N/A for structure — no class moves, no published-surface change, no dependency change. Touched
files span every module (selection is by raw `#nnn` density via `grep`, not by module, same
method as Phase B/C-0).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — comment-only; no payment/payout logic changes even where payment/payout files are touched.

## Angular — frontend surfaces touched

N/A — backend only.

## FE↔BE contract

N/A — no contract change.

## Current scope (recomputed fresh on this branch, `origin/main` @ `9cfb13f`)

```bash
grep -rlE '#[0-9]{2,4}\b' platform/src/main --include='*.java' | while read f; do
  raw=$(grep -oE '#[0-9]{2,4}\b' "$f" | wc -l)
  inv=$(grep -oE 'invariant #[0-9]{1,2}\b' "$f" | wc -l)
  true=$((raw-inv))
  if [ "$true" -gt 0 ]; then echo "$true $f"; fi
done | sort -rn
```

**270 files, 55 dense (≥4 refs), 215 sparse (1–3 refs), 677 true-violation tokens total** —
matches the kickoff brief's figures exactly (recomputed independently on a fresh `main`
checkout, confirming no drift since the brief was written). Densest: `AuthController` (14),
`operator/application/Operators` (12), `AdminOperatorController` (12), `venue/application/Venues`
(11), `venue/adapter/in/VenueAdminController` (10), `venue/adapter/in/AdminVenueCommissionController`
(10), `booking/adapter/out/JdbcBookings` (10).

Dense-tier batching: 55 files ÷ 3/batch → batches D1–D18 (18×3) + D19 (1 file) = 19 batches.
Sparse-tier batching: 215 files ÷ 15/batch → batches S1–S14 (14×15) + S15 (5 files) = 15 batches.

## RELOCATE-CANDIDATE inventory

> Populated as batches report their triage breakdown. Deliverable of this pass — not resolved
> here. One row per hit; file/line as of the commit that flagged it.

| # | File | Line | Rationale (one sentence) | Flagged in |
|---|---|---|---|---|
| 1 | `AdminOperatorController.java` | 25–67 (class Javadoc) | Five-paragraph argument for the suspend/revoke-bracket design — why controller-orchestrated not event-driven, why revoke brackets the transition, the over/under-revocation tradeoff, the can't-suspend-self rule | D1 |
| 2 | `AdminOperatorController.java` | 133–137 (`suspend()` method doc) | Explains why the active-username pre-read must happen before the state transition commits — it's what makes the first revoke possible at all | D1 |
| 3 | `booking/adapter/out/JdbcBookings.java` | 71–91 (`boundedClient` method doc) | Why the sweep candidate-reads use a finite-timeout `JdbcClient`: failure mode of an unbounded read, why the timeout can't be global (would also bound the availability-claim write, breaking invariant #2) | D3 |
| 4 | `shared/ResubmissionThrottle.java` | 15–23 | Why this lever lives in the `shared` Kernel rather than either owning module, and that the plan first tried two per-module copies before landing here | D4 |
| 5 | `shared/ResubmissionThrottle.java` | 35–38 | Why the cooldown window starts at construction (deploy-time boot republish counts as "sweep zero"), not at the first press | D4 |
| 6 | `notification/application/Mailer.java` | 6–13 (class Javadoc opener) | States the locked seam decision: this port grows message kinds but keeps exactly two profile-swapped implementations, mirroring payment/SSO gateway pattern | D4 |
| 7 | `CustomerRecovery.java` | 68–72 | Why the mail-suppression check is a separate method, not folded into `sendVerificationEmail` — folding it in would reopen a timing-oracle gap closed elsewhere | D4 |
| 8 | `notification/api/MailDeliverability.java` | 1–31 (whole class Javadoc) | Multi-paragraph why-essay with 4 headers: why a second port vs. a `MailSender` return value, why only an address-owning caller may call it, why present-tense not a record, why it never throws | D5 |
| 9 | `notification/adapter/out/SentEmail.java` | 18–27 (class Javadoc, 2nd paragraph) | Why booking-kind payloads use separate fields instead of a shared `Object` slot, using the payment-due/confirmation same-code-opposite-meaning edge case as the motivating example | D5 |
| 10 | `RecoveryProperties.java` | 18 | Why both TTL bounds exist: the "born-expired token" failure mode from a zero/negative TTL, and why reset ceiling is 7× tighter than verification ceiling | D6 |
| 11 | `RecoveryProperties.java` | 30 | Why validation happens in the compact constructor rather than `@Validated`/`@Min` — the project declined `spring-boot-starter-validation` | D6 |
| 12 | `RecoveryProperties.java` | 48 | Why `MIN_TOKEN_TTL` must be above zero — recovery sends now leave the request thread via SMTP relay, so a too-short TTL can expire a token before delivery | D6 |
| 13 | `OperatorAccountController.java` | 70 | Historical bug: the missing-current-password and weak-password checks used to funnel into one error code, confusing callers with a valid new password | D6 |
| 14 | `OperatorAccountController.java` | 85 | Same historical-bug rationale restated in `changePassword`'s own doc | D6 |
| 15 | `OperatorAccountController.java` | 91 | Cites a prior review that pinned the check-ordering (missing-current-password outranks policy check) as settled | D6 |
| 16 | `OperatorAccountController.java` | 95 | Why the three success-path effects (hash write, session revokes, session rotate) are deliberately ordered rather than wrapped in `@Transactional` | D6 |
| 17 | `OperatorAccountController.java` | 102 | Previous (worse) ordering: a transient revoke failure used to leave the password changed but return `500` | D6 |
| 18 | `OperatorAccountController.java` | 154 | Notes the same bcrypt-comparison defect shipped twice before, hence the explicit method-doc callout | D6 |
| 19 | `venue/application/VenuePhotoModeration.java` | 18 | Why the port is named for its ownership-free posture rather than its one action | D6 |
| 20 | `venue/application/VenuePhotoModeration.java` | 31 | Non-obvious system property: content-addressed/deduplicated photo variants mean a takedown on one slot doesn't remove bytes still referenced by another slot | D6 |
| 21 | `venue/application/VenuePhotoModeration.java` | 40 | Design decision that "emptiness IS the null URL" — gives callers a stable three-slot grid instead of a list to reconcile | D6 |
| 22 | `notification/application/MailTransportBudget.java` | 5–48 (whole class Javadoc) | Multi-paragraph essay: why the shutdown-drain window is derived from the SMTP socket timeout rather than a second constant, a historical timeout mismatch that caused prod noise, why it doesn't escalate to `shutdownNow()` | D7 |
| 23 | `customer/application/CustomerAccountStore.java` | 68 | "Was by-id" historical fact — this lookup used to be keyed differently before a prior change | D7 |
| 24 | `booking/adapter/in/AdminRefundOutboxController.java` | 14–27 (class Javadoc) | Mirrors `AdminMailOutboxController`'s shared reasoning (role-gated not venue-scoped, uniform 200 + typed token) and why a per-publication listing is deliberately a non-goal (booking ids would leak) | D8 |
| 25 | `venue/application/VenuePhotoService.java` | 27 | Why photo-moderation is a separate port (`VenuePhotoModeration`) rather than more `VenuePhotos` methods | D8 |
| 26 | `venue/application/VenuePhotoService.java` | 46–49 | "Deliberately NOT `@Transactional`" — the CPU-heavy image pipeline must run outside any DB transaction to avoid pinning a pool connection | D8 |
| 27 | `venue/application/VenuePhotoService.java` | 69 | "No ownership check by design" on `slotsOf` — deliberate exception to the usual ownership-first pattern, authorized instead by the ADMIN role gate | D8 |
| 28 | `venue/application/VenuePhotoService.java` | 86 | Same "no ownership check by design" rationale for `takedown` | D8 |
| 29 | `venue/adapter/in/VenueProfileResponse.java` | 20–24 | `commissionBps`/`payoutCurrency` are display-only because a venue never sets its own commission; explains the platform-admin rate-over-time editing exception | D8 |
| 30 | `shared/ShutdownBudget.java` | 11–13 | Historical narrative: the SIGTERM budget was originally a mail-pool-count division inside `notification`, until a third draining pool in `booking` motivated this class | D9 |
| 31 | `shared/ShutdownBudget.java` | 54 | Explains how the mail pool's two claims restate the original combined-budget figure as a per-pool claim | D9 |
| 32 | `payout/adapter/in/BookingCancelledPayoutListener.java` | 25 | Historical bug fix: this branch used to log one WARN and return normally, silently overstating the payout ledger | D9 |
| 33 | `payout/adapter/in/BookingCancelledPayoutListener.java` | 37 | Comparative architecture rationale contrasting two prior decisions on how to handle a fact that can appear later | D9 |
| 34 | `payout/adapter/in/BookingCancelledPayoutListener.java` | 38–50 | Continuation: explains why this listener throws instead of counting-and-completing, tied to the outbox-pending alerting mechanism | D9 |
| 35 | `payout/adapter/in/BookingCancelledPayoutListener.java` | 80 | Method-level doc referencing the same historical correction as row 32 | D9 |
| 36 | `payout/adapter/in/BookingCancelledPayoutListener.java` | 83 | Analogy to a separate prior decision justifying the `ERROR`-level log despite a surviving publication | D9 |
| 37 | `operator/api/OperatorLifecycle.java` | 20 | Explains the port's rename from `OperatorApprovals` — with suspension added, "approvals" no longer names the conversation this port holds | D10 |
| 38 | `operator/api/OperatorLifecycle.java` | 43–47 | Why `activeUsername` exists as a separate query — the edge needs the username up front to revoke sessions before the transition commits, avoiding a retry race | D10 |
| 39 | `notification/application/MailDispatcher.java` | 25–30 | "Began as `dispatch(Runnable)`" — full historical justification for adding `MailKind` as a parameter, a drop-accounting attribution problem | D10 |
| 40 | `notification/application/MailDeliverabilityService.java` | 23–29 | Why the class deliberately deviates from the catch-narrowly convention, citing a prior review finding that unswallowed throwers reached a caller that couldn't act on them | D11 |
| 41 | `notification/adapter/out/RegistryMailOutbox.java` | 44 | Documentation-correction historical note: an earlier note reported the opposite behavior because it was read against the v1 repository rather than the v2 JDBC repository this deployment runs | D11 |
| 42 | `booking/api/package-info.java` | 12–14 | Explains why the confirmation-email read was widened: the admin resend flow has no event payload to read booking facts from, plus the guest-bookings-by-contact lookup for support calls | D13 |

## Execution status

**Stage pointer:** implement — dense-tier waves 1 and 2 complete (D1–D13, 37 of 39 files edited);
wave 3 (D14–D19, remaining 16 dense files) next.

**Next action:** dispatch D14–D19 as parallel worktree-isolated agents, integrate serially.

| Wave | Scope | Status | Commits |
|---|---|---|---|
| Dense wave 1 (D1–D6) | 18 densest files (17 edited, 1 fully RELOCATE-CANDIDATE, 0 edits) | ✅ | `0d110bc`, `04bae2d` (D2), `74e6b9c` (D1), `6020118` (D6), `954215f` (D5), `0bbedc2` (D4), `f79ec49` (D3) |
| Dense wave 2 (D7–D13) | next 21 files (19 edited, 2 fully RELOCATE-CANDIDATE, 0 edits) | ✅ | `da57ce0` (D8), `c607bc0` (D9), `eb5f33c` (D10), `40f4286` (D13), `75819b4` (D11), `0c3e635` (D12), `3b65889` (D7) |
| Dense wave 3 (D14–D19) | remaining 16 files | | |
| Sparse wave 1 (S1–S7) | 105 files | | |
| Sparse wave 2 (S8–S15) | 110 files | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Dense wave 1 (D1–D6) summary:** 17 of 18 assigned files edited (`notification/api/MailDeliverability.java`
had 0 edits — its entire class Javadoc is RELOCATE-CANDIDATE, see inventory row 8). Every batch's
per-file triage breakdown recorded above and in the RELOCATE-CANDIDATE inventory. Gates run on the
integrated, cumulative diff after every cherry-pick: `check-comment-only.mjs` (17 files verified
code-identical against `origin/main`), `check-inline-comments.mjs` (clean throughout), the F-8
pre-push grep (every `+`/`-` diff line is a whole-line `//`/`/*`/`*` comment change — zero
trailing-on-code edits), `compileJava`/`compileTestJava` (BUILD SUCCESSFUL), and the structural net
(`ModularityTests`/`JdbcOnlyArchitectureTests`/`PackageShapeArchitectureTests`, BUILD SUCCESSFUL).
Self-review spot-checked the two highest-risk RELOCATE-CANDIDATE calls (`AdminOperatorController`'s
class Javadoc, `JdbcBookings#boundedClient`) and the one F-8-EXPOSED hit (`VenueAdminService.java`
line 70) directly in the diff — all three confirmed left byte-for-byte untouched.

**Dense wave 2 (D7–D13) summary:** 19 of 21 assigned files edited (`MailTransportBudget.java` had 0
edits — entire class Javadoc is RELOCATE-CANDIDATE, inventory row 22; `PublishedSurfacePlacementArchitectureTests`-style
zero-edit outcome not repeated elsewhere this wave). 21 new RELOCATE-CANDIDATE hits recorded (rows
22–42), plus 2 F-8-EXPOSED trailing-on-code lines in `VenuePhotoService.java`. Gates on the
cumulative diff after all 7 cherry-picks: `check-comment-only.mjs` (37 files verified code-identical
against `origin/main`), `check-inline-comments.mjs` clean, the F-8 pre-push grep clean (zero
trailing-on-code edits across the whole branch), `compileJava`/`compileTestJava` BUILD SUCCESSFUL,
structural net BUILD SUCCESSFUL. Pushed incrementally after each batch's integration (7 pushes).

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|

## File structure

- `docs/plans/issue-561-issue-ref-strip-phase-c.md` — **new**: this doc
- **Dense wave 1 (D1–D6), comment-only `#nnn` strip, 17 files modified + 1 reviewed:**
  - `platform/src/main/java/ai/riviera/platform/AuthController.java` — **modified** (D1)
  - `platform/src/main/java/ai/riviera/platform/operator/application/Operators.java` — **modified** (D1)
  - `platform/src/main/java/ai/riviera/platform/AdminOperatorController.java` — **modified** (D1); 2 RELOCATE-CANDIDATE blocks left untouched (inventory #1–#2)
  - `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — **modified** (D2)
  - `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — **modified** (D2)
  - `platform/src/main/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionController.java` — **modified** (D2)
  - `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — **modified** (D3); 1 RELOCATE-CANDIDATE block left untouched (inventory #3)
  - `platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java` — **modified** (D3); 1 F-8-EXPOSED trailing-on-code line left untouched (`invariant #13` comment, line 70)
  - `platform/src/main/java/ai/riviera/platform/venue/adapter/in/AdminVenuePhotoController.java` — **modified** (D3)
  - `platform/src/main/java/ai/riviera/platform/shared/ResubmissionThrottle.java` — **modified** (D4); 2 RELOCATE-CANDIDATE blocks left untouched (inventory #4–#5)
  - `platform/src/main/java/ai/riviera/platform/notification/application/Mailer.java` — **modified** (D4); 1 RELOCATE-CANDIDATE block left untouched (inventory #6)
  - `platform/src/main/java/ai/riviera/platform/CustomerRecovery.java` — **modified** (D4); 1 RELOCATE-CANDIDATE block left untouched (inventory #7)
  - `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — **modified** (D5)
  - `platform/src/main/java/ai/riviera/platform/notification/api/MailDeliverability.java` — **reviewed, not modified** (D5): entire class Javadoc is RELOCATE-CANDIDATE (inventory #8)
  - `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SentEmail.java` — **modified** (D5); 1 RELOCATE-CANDIDATE block left untouched (inventory #9)
  - `platform/src/main/java/ai/riviera/platform/RecoveryProperties.java` — **modified** (D6); 3 RELOCATE-CANDIDATE blocks left untouched (inventory #10–#12)
  - `platform/src/main/java/ai/riviera/platform/OperatorAccountController.java` — **modified** (D6); 6 RELOCATE-CANDIDATE blocks left untouched (inventory #13–#18)
  - `platform/src/main/java/ai/riviera/platform/venue/application/VenuePhotoModeration.java` — **modified** (D6); 3 RELOCATE-CANDIDATE blocks left untouched (inventory #19–#21)
- **Dense wave 2 (D7–D13), comment-only `#nnn` strip, 19 files modified + 2 reviewed:**
  - `platform/src/main/java/ai/riviera/platform/notification/application/MailTransportBudget.java` — **reviewed, not modified** (D7): entire class Javadoc is RELOCATE-CANDIDATE (inventory #22)
  - `platform/src/main/java/ai/riviera/platform/customer/application/CustomerAccountStore.java` — **modified** (D7); 1 RELOCATE-CANDIDATE block left untouched (inventory #23)
  - `platform/src/main/java/ai/riviera/platform/booking/application/reserve/CreateBookingService.java` — **modified** (D7)
  - `platform/src/main/java/ai/riviera/platform/booking/adapter/in/AdminRefundOutboxController.java` — **modified** (D8); 1 RELOCATE-CANDIDATE block left untouched (inventory #24)
  - `platform/src/main/java/ai/riviera/platform/venue/application/VenuePhotoService.java` — **modified** (D8); 3 RELOCATE-CANDIDATE blocks left untouched (inventory #25–#28); 2 F-8-EXPOSED trailing-on-code lines left untouched
  - `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueProfileResponse.java` — **modified** (D8); 1 RELOCATE-CANDIDATE block left untouched (inventory #29)
  - `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenuePhotoController.java` — **modified** (D9)
  - `platform/src/main/java/ai/riviera/platform/shared/ShutdownBudget.java` — **modified** (D9); 3 RELOCATE-CANDIDATE blocks left untouched (inventory #30–#31, plus row 30 from wave notation)
  - `platform/src/main/java/ai/riviera/platform/payout/adapter/in/BookingCancelledPayoutListener.java` — **modified** (D9); 6 RELOCATE-CANDIDATE blocks left untouched (inventory #32–#36)
  - `platform/src/main/java/ai/riviera/platform/payout/adapter/in/AdminPayoutBatchController.java` — **modified** (D10)
  - `platform/src/main/java/ai/riviera/platform/operator/api/OperatorLifecycle.java` — **modified** (D10); 2 RELOCATE-CANDIDATE blocks left untouched (inventory #37–#38)
  - `platform/src/main/java/ai/riviera/platform/notification/application/MailDispatcher.java` — **modified** (D10); 1 RELOCATE-CANDIDATE block left untouched (inventory #39)
  - `platform/src/main/java/ai/riviera/platform/notification/application/MailDeliverabilityService.java` — **modified** (D11); 1 RELOCATE-CANDIDATE block left untouched (inventory #40)
  - `platform/src/main/java/ai/riviera/platform/notification/adapter/out/RegistryMailOutbox.java` — **modified** (D11); 1 RELOCATE-CANDIDATE block left untouched (inventory #41)
  - `platform/src/main/java/ai/riviera/platform/customer/vocabulary/package-info.java` — **modified** (D11)
  - `platform/src/main/java/ai/riviera/platform/customer/api/package-info.java` — **modified** (D12)
  - `platform/src/main/java/ai/riviera/platform/customer/api/CustomerLookup.java` — **modified** (D12)
  - `platform/src/main/java/ai/riviera/platform/booking/spi/ConfirmationMailDelivery.java` — **modified** (D12)
  - `platform/src/main/java/ai/riviera/platform/booking/package-info.java` — **modified** (D13)
  - `platform/src/main/java/ai/riviera/platform/booking/api/package-info.java` — **modified** (D13); 1 RELOCATE-CANDIDATE block left untouched (inventory #42)
  - `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueMapView.java` — **modified** (D13)

## Generalization-audit log

N/A this pass — mechanical strip, no new pattern introduced beyond what Phase B already
generalized.

## Acceptance-criteria verification (final)

_(filled at close-out)_

## Self-review checklist (before merge / PR)

- [ ] Every AC has a verifying artifact.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Invariants #1–#13: N/A — comment-only, no code/schema/money/timezone surface changed.
- [ ] The historical Phase B doc was read, never edited — this is a new doc.
- [ ] Execution status at HEAD matches reality.
