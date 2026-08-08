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
| 43 | `operator/api/OperatorProvisioning.java` | 6–17 (whole Javadoc block) | Port history: how an original "no self-service HTTP endpoint" decision was superseded twice (self-service registration, then self-service password change), and what invariant the original decision still protects | D14 |
| 44 | `notification/application/MailKind.java` | 10–16 | Why `MailKind` is a real type rather than string constants — the two-classes/two-threads/two-moments argument and the concrete divergence failure mode it forecloses | D14 |
| 45 | `notification/application/MailKind.java` | 19–21 | Why shipped metric names still say "recovery" even after a non-recovery flow was added — a shipped-metric-name stability argument | D14 |
| 46 | `notification/application/MailKind.java` | 35–38 | Why one mail kind is the one whose loss doesn't self-heal, and why that's what required the `kind` dimension on the drop path | D14 |
| 47 | `notification/adapter/in/AddressShape.java` | 9 | Why this validation was extracted into its own class rather than duplicated — names a real past incident (a prior half-check bug) as the concrete reason | D16 |
| 48 | `notification/adapter/in/AddressShape.java` | 11 | Ties the "check both the local-part and domain-part, not just presence of `@`" rule to the review that established it, with a multi-sentence justification | D16 |
| 49 | `booking/adapter/out/RegistryRefundOutbox.java` | ~52 | Why the listener id's class/method/parameter type are deliberately unchanged — byte-identity with every historical publication row, avoiding a Flyway rewrite | D17 |
| 50 | `OperatorApprovalMail.java` | 58 | Names an established failure pattern as the reason there's no try/catch around the mail send — an escaping exception would return a false 500 on work that succeeded | D18 |
| 51 | `MyErasureController.java` | 24 | Historical "used to..." rationale — the method-agnostic matcher previously needed a dedicated erasure-only rule before a later change broadened it | D18 |
| 52 | `AccountRecoveryController.java` | 92–106 | Multi-paragraph justification for why session revocation brackets the password write (before AND after, not just once), including why a spanning `@Transactional` would only look atomic | D19 |
| 53 | `venue/adapter/out/JdbcVenueCatalog.java` | ~275 | COALESCE fallback-to-live-rate semantics for `commissionBpsOn`, plus a non-obvious indexing rationale (subquery rides the composite PK's leftmost prefix) | S1 |
| 54 | `venue/adapter/out/JdbcVenueCatalog.java` | ~233 | Why a cover photo needs both card+banner variants to count as present — the concrete defect avoided (a null URL reaching `NgOptimizedImage`) | S1 |
| 55 | `notification/application/MailResubmission.java` | ~31 | Versioning nuance about the registry repository (v2 vs. v1 shape) affecting `resubmit()` | S1 |
| 56 | `notification/application/MailAttemptOutcome.java` | ~6 | Why this enum exists instead of relying on the Event Publication Registry's `completion_date`, which would misreport two of the four outcomes | S1 |
| 57 | `customer/vocabulary/Emails.java` | ~16 | Why this class can't move to the `shared` Kernel — would recreate a dependency cycle a prior change eliminated | S2 |
| 58 | `AdminAuditFilter.java` | ~35 | Historical tightening: a prior carve-out was OPERATOR-gated, then closed so every path in the namespace is platform-ADMIN-gated | S2 |
| 59 | `venue/application/VenueCommissionService.java` | 14–36 (whole class Javadoc) | Why a commission-rate change is three writes in one transaction in that order, and why a new schedule always starts tomorrow (invariant #4's cutoff) | S3 |
| 60 | `venue/application/PhotoStorage.java` | ~49 | Historical bug/fix: answering the conditional-GET question from the URL alone (not a blob-free existence probe) let a taken-down photo keep revalidating as 304 indefinitely | S3 |
| 61 | `shared/InvalidApiRequestException.java` | ~7–11 | Before a prior change, the advice mapped every `IllegalArgumentException` and mis-blamed deep-bug IAEs on the caller as unlogged 400s | S4 |
| 62 | `payment/api/CollectionGuarantee.java` | ~20 | Deliberately its own role-split port rather than a `CheckoutPort` method | S4 |
| 63 | `operator/vocabulary/ApprovalOutcome.java` | ~8 | Sealed interface rather than the enum it shipped as, for a stated reason tied to two other codebase precedents | S4 |
| 64 | `operator/adapter/out/JdbcOperators.java` | ~261 | Historical fact: an "owns-all" ownership model existed and was intentionally retired (durable CLAUDE.md/V29 decision) | S4 |
| 65 | `notification/application/MissingBookingFact.java` | ~13 | One type rather than three string constants per listener — contrasts with a prior string-constant approach | S4 |
| 66 | `notification/application/MailResubmissionService.java` | ~18 | Historical note: a prior change moved the resubmission-throttle guard into `shared` when the refund lever became its second consumer | S5 |
| 67 | `notification/application/ConfirmationSendOutcome.java` | ~7 | Before a prior change, `sendBookingConfirmation` returned `void`, making deliberate withholding indistinguishable from delivery — why this typed return value exists | S5 |
| 68 | `notification/adapter/out/JdbcConfirmationMailAttempts.java` | ~20 | Deliberate absence of `@Transactional`/`REQUIRES_NEW` so a `TRANSPORT_FAILED` row auto-commits and survives the rethrown exception | S5 |
| 69 | `customer/api/SsoAccountProvisioning.java` | ~24 | Security trust-boundary paragraph: auto-linking trusts the caller's verified-email claim; real SSO adapters must assert `email_verified` or auto-link becomes an account-takeover vector | S5 |
| 70 | `customer/api/CustomerAccountRecovery.java` | ~43 | Race-condition rationale: `resetPassword` can only name the account after the password is changed, so reading the email first lets the edge revoke sessions before the write | S5 |
| 71 | `booking/application/request/RequestWindows.java` | ~23–29 | Why the payment-due deadline is derived from `RequestWindows` rather than a bare field — before a prior change the enforcing half was a separate expression, so a mailed deadline couldn't be checked against it by eye | S6 |
| 72 | `booking/application/refund/RefundOutbox.java` | ~8–13 | Why the refund-outbox scope is an exact-listener-id allowlist rather than a module-prefix scope — a revised design decision | S6 |
| 73 | `booking/application/refund/ExpireAbandonedBookings.java` | ~27–30 | Why the second TTL clock is threaded through as the whole `RequestWindows` value rather than a bare `Duration` — keeps promise and enforcement from drifting apart | S6 |
| 74 | `booking/adapter/out/JdbcGuestBookingHistory.java` | ~57–58 | Provenance: this fix's scope came from a broader generalization audit, not the original issue's stated scope (which named four jobs and four queries) | S6 |
| 75 | `PrincipalSessionRevoker.java` | ~53–58 | Dual-ordering-constraint rationale for `revokeAllExcept`: revoke must run before the credential write, and the pre-rotation session id is the only one visible | S6 |
| 76 | `ObservabilityConfig.java` | 46, 69–70 | Corrects the class's own prior claim of issuing no query (Micrometer evaluates the gauge supplier at read time); explains why the bounded client's timeout is scoped to one gauge, not global (would also bound the availability claim) | S7 |
| 77 | `MoneyPathAlertCheck.java` | 23–31 | Same historical correction from the reader's side — documents the prior no-query claim and how the bounded-read/NaN-on-timeout behavior works now | S7 |
| 78 | `payout/application/DailyTakingsService.java` | ~27 | Forward-only-repricing design decision: the commission rate is read by service date, not live (ties to invariant #9) | S9 |
| 79 | `payment/adapter/out/StripeProperties.java` | ~35 | Active decision statement: this project declined `spring-boot-starter-validation` in favour of explicit checks in records | S9 |
| 80 | `payment/adapter/out/ProfiledCollectionGuarantee.java` | ~16 | Active decision statement: why `CollectionGuarantee` is a separate port rather than a `PaymentGateway` method (a wide-port smell it was split out of) | S9 |
| 81 | `SessionIdentity.java` | ~63 | Concurrency-safety claim inside `rotate()`'s Javadoc: the revoker's deletes have done the same to other sessions since a prior change — cites precedent, not a bare pointer | S14 |

> **Process note (S9):** rows 79–80 were flagged by their batch agent as RELOCATE-CANDIDATE for
> being the grammatical subject of a sentence — the correct rule (per the kickoff brief's inherited
> "Sentence-subject refs" clause) is to REWRITE the ref out and keep a real noun/phrase, i.e. treat
> as MECHANICAL, not to leave the ref in place. Left as reported (over-flagging is the safe
> direction the brief explicitly prefers) rather than corrected mid-integration; whoever does the
> follow-up relocation pass can dispatch these two quickly as mechanical rewrites, not real
> architecture rationale to relocate.

## Execution status

**Stage pointer:** ✅ **DONE — merged via PR #564.** All 8 CI checks passed (SonarCloud Code
Analysis + scan, CodeQL ×2, Backend, Frontend, Repo hygiene) before merge, confirming the F-8
Sonar-coverage-exposure risk this whole pass was designed around never materialized. Squash-merged
into `main` at `c2f9598`.

**Next action:** none for this phase. Follow-up work, out of this doc's scope: (1) the RELOCATE-CANDIDATE
relocation pass into `RESPONSIBILITIES.md`/ADRs, using the 81-row inventory above as its starting
point; (2) dispatching rows 79–80 as mechanical rewrites (flagged as a minor over-classification in
the Scope notes of PR #564, not corrected mid-pass per the brief's over-flag-when-unsure rule).

| Wave | Scope | Status | Commits |
|---|---|---|---|
| Dense wave 1 (D1–D6) | 18 densest files (17 edited, 1 fully RELOCATE-CANDIDATE, 0 edits) | ✅ | `0d110bc`, `04bae2d` (D2), `74e6b9c` (D1), `6020118` (D6), `954215f` (D5), `0bbedc2` (D4), `f79ec49` (D3) |
| Dense wave 2 (D7–D13) | next 21 files (19 edited, 2 fully RELOCATE-CANDIDATE, 0 edits) | ✅ | `da57ce0` (D8), `c607bc0` (D9), `eb5f33c` (D10), `40f4286` (D13), `75819b4` (D11), `0c3e635` (D12), `3b65889` (D7) |
| Dense wave 3 (D14–D19) | remaining 16 files (12 edited, 2 fully RELOCATE-CANDIDATE, 0 edits) | ✅ | `f41b078`→`7b896f1` (D19), `c269191`→`0f66720` (D14), `ab6a5d5`→`ed7c074` (D15), `d3d9f44`→`b84786a` (D18), `f3936af`→`6272727` (D16), `fc42d01`→`a035a35` (D17) |
| **Dense tier total (D1–D19)** | **all 55 files** (51 edited, 4 fully RELOCATE-CANDIDATE with 0 edits) | ✅ | 51 files code-identical to `origin/main` except comments; 52-row RELOCATE-CANDIDATE inventory |
| Sparse wave 1 (S1–S7) | 105 files (102 edited, 3 fully RELOCATE-CANDIDATE with 0 edits — `VenueCommissionService.java`, `InvalidApiRequestException.java`, `PrincipalSessionRevoker.java`) | ✅ | `ebc61f1` (S7), `efb7484` (S3), `b9a0f8a` (S2), `947a7a6` (S6), `c7e3960` (S4), `c842ee7` (S5), `619f269`+`e25ee4d` (S1) |
| Sparse wave 2 (S8–S15) | 110 files (106 edited, 4 files reviewed with no MECHANICAL edits — `BookingRef.java` no refs beyond permitted, `MailTransportProperties.java`/`ClientIpResolver.java` F-17-only, `BookingId.java`/`CancelOutcome.java` permitted-only, `SessionIdentity.java` fully RELOCATE-CANDIDATE) | ✅ | `7b9d76c` (S9), `3edfbbb` (S8), `b1c31f0` (S13), `9285849` (S12), `442434a` (S11), `ec5e573` (S14), `7883ee2` (S15) |
| **Sparse tier total (S1–S15)** | **all 215 files** | ✅ | 4 new RELOCATE-CANDIDATE rows this wave (78–81) |
| **Grand total (D1–D19 + S1–S15)** | **270 files, 677 candidate true-violation tokens** | ✅ | 81-row RELOCATE-CANDIDATE inventory; final tree-wide rescan: 125 tokens remain (all RELOCATE-CANDIDATE/F-8-EXPOSED/F-17 or regex-undercounted permitted `invariant`s, per F-19) |

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

**Dense wave 3 (D14–D19) summary — closes out the dense tier:** 12 of 16 assigned files edited
(`OperatorProvisioning.java` and `MailKind.java` had 0 edits — entire content RELOCATE-CANDIDATE,
inventory rows 43–46). 10 new RELOCATE-CANDIDATE hits recorded (rows 43–52), 1 new F-17
string-literal ref (`ScheduledQueryTimeout.java`), 0 new F-8-EXPOSED hits. Gates on the cumulative
diff after all 6 cherry-picks: `check-comment-only.mjs` (51 files verified code-identical against
`origin/main` — the dense tier's final total), `check-inline-comments.mjs` clean, the F-8 pre-push
grep clean, `compileJava`/`compileTestJava` BUILD SUCCESSFUL, structural net BUILD SUCCESSFUL.
Pushed incrementally after each batch (6 pushes). **Dense-tier grand total: 55 files targeted, 51
edited (677 candidate true-violation tokens reduced to the MECHANICAL subset actually stripped —
exact before/after token counts are in each batch's ledger entry above), 4 files left fully
untouched as pure RELOCATE-CANDIDATE, 52 RELOCATE-CANDIDATE items catalogued, 0 F-8-EXPOSED hits
edited, 0 permitted labels lost.**

**Sparse wave 1 (S1–S7) summary — first sparse-tier wave:** 102 of 105 assigned files edited; 3
files (`VenueCommissionService.java`, `InvalidApiRequestException.java`,
`PrincipalSessionRevoker.java`) left fully untouched as pure RELOCATE-CANDIDATE. 25 new
RELOCATE-CANDIDATE hits recorded (rows 53–77), 0 new F-8-EXPOSED hits, 0 new F-17 refs beyond what
each batch reported inline. Two F-6 stale-fact corrections in S1 (`CurrentOperator.java`,
`operator/api/VenueOwnership.java` — both described the retired owns-all-venues bootstrap flag as
still in effect; the sentences were removed as now-false, matching CLAUDE.md's "No account owns
all venues (V29)" fact). One RV-STYLE-1 fixup in S1 (`payout/package-info.java`'s stripped `//`
block converted to a `/** */` doc comment rather than crammed onto one line). Gates on the
cumulative diff after all 7 (8 including the S1 fixup commit) cherry-picks: `check-comment-only.mjs`
(153 files verified code-identical against `origin/main`), `check-inline-comments.mjs` clean, the
F-8 pre-push grep clean, `compileJava`/`compileTestJava` BUILD SUCCESSFUL, structural net BUILD
SUCCESSFUL. Pushed incrementally after each batch (7 pushes).

**Sparse wave 2 (S8–S15) summary — final wave, closes out the entire pass:** 106 of 110 assigned
files edited; 4 files left untouched — `BookingRef.java` (no non-permitted refs), `BookingId.java`
and `CancelOutcome.java` (permitted-only, once the plural "invariants #n/#n" and line-wrapped
"invariant\n#n" forms are read by eye rather than the counting regex — see the F-19 note below),
`MailTransportProperties.java` and `ClientIpResolver.java` (F-17 string-literal only, no
mechanical hits), and `SessionIdentity.java` (fully RELOCATE-CANDIDATE). 4 new RELOCATE-CANDIDATE
hits recorded (rows 78–81), including a process note on S9's over-flagging of two sentence-subject
refs (rows 79–80) that should have been mechanical rewrites per the kickoff brief's own rule —
left as-is per the brief's explicit preference for over-flagging over under-flagging. Gates on the
cumulative diff after all 8 cherry-picks: `check-comment-only.mjs` (257 files verified
code-identical against `origin/main` — the full pass's final count), `check-inline-comments.mjs`
clean, the F-8 pre-push grep clean, `compileJava`/`compileTestJava` BUILD SUCCESSFUL, the full
structural net (including `PublishedSurfacePlacementArchitectureTests`) BUILD SUCCESSFUL. Pushed
incrementally after each batch.

**Final tree-wide verification (whole branch, after all 34 batches):** re-ran the exact scope
script from the kickoff brief against the fully-integrated branch. Raw count dropped from 677 to
125 true-violation tokens across 62 files. Every one of the 125 remaining tokens was individually
attributable to one of: (a) a cataloged RELOCATE-CANDIDATE hit (rows 1–81 above), (b) an
F-8-EXPOSED trailing-on-code-line ref, (c) an F-17 string-literal ref, or (d) a permitted
`invariant #n` the simple validation regex undercounts because it only matches singular
`invariant #n`, not the plural `invariants #n/#n` form or a line-wrapped `invariant\n#n` split
across two source lines (the same F-19 counting-method limitation Phase B documented — spot-checked
three such files, `CancelOutcome.java`/`BookingId.java`/`BookingRef.java`, by reading them directly;
all three are genuinely clean). No unaccounted-for token was found.

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
- **Dense wave 3 (D14–D19, last dense-tier wave), comment-only `#nnn` strip, 12 files modified + 4 reviewed:**
  - `platform/src/main/java/ai/riviera/platform/venue/application/EditBeachMap.java` — **modified** (D14)
  - `platform/src/main/java/ai/riviera/platform/operator/api/OperatorProvisioning.java` — **reviewed, not modified** (D14): entire Javadoc is RELOCATE-CANDIDATE (inventory #43)
  - `platform/src/main/java/ai/riviera/platform/notification/application/MailKind.java` — **reviewed, not modified** (D14): entire content is RELOCATE-CANDIDATE (inventory #44–#46)
  - `platform/src/main/java/ai/riviera/platform/notification/api/MailSender.java` — **modified** (D15)
  - `platform/src/main/java/ai/riviera/platform/notification/adapter/in/MailResubmissionProperties.java` — **modified** (D15)
  - `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingLinkConfig.java` — **modified** (D15)
  - `platform/src/main/java/ai/riviera/platform/notification/adapter/in/AdminMailDeliveryController.java` — **modified** (D16)
  - `platform/src/main/java/ai/riviera/platform/notification/adapter/in/AddressShape.java` — **modified** (D16); 2 RELOCATE-CANDIDATE blocks left untouched (inventory #47–#48)
  - `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — **modified** (D16)
  - `platform/src/main/java/ai/riviera/platform/booking/application/request/RequestReleaseService.java` — **modified** (D17)
  - `platform/src/main/java/ai/riviera/platform/booking/adapter/out/RegistryRefundOutbox.java` — **modified** (D17); 1 RELOCATE-CANDIDATE block left untouched (inventory #49)
  - `platform/src/main/java/ai/riviera/platform/ScheduledQueryTimeout.java` — **modified** (D17); 1 F-17 string-literal ref left untouched
  - `platform/src/main/java/ai/riviera/platform/OperatorUserDetailsService.java` — **modified** (D18)
  - `platform/src/main/java/ai/riviera/platform/OperatorApprovalMail.java` — **modified** (D18); 1 RELOCATE-CANDIDATE block left untouched (inventory #50)
  - `platform/src/main/java/ai/riviera/platform/MyErasureController.java` — **modified** (D18); 1 RELOCATE-CANDIDATE block left untouched (inventory #51)
  - `platform/src/main/java/ai/riviera/platform/AccountRecoveryController.java` — **modified** (D19); 1 RELOCATE-CANDIDATE block left untouched (inventory #52)
- **Sparse wave 1 (S1–S7, 105 files), comment-only `#nnn` strip — see RELOCATE-CANDIDATE inventory
  rows 53–77 for the per-file rationale flags; every file below was reviewed for the full triage,
  most with `#nnn` hits fully stripped, some with a subset left as RELOCATE-CANDIDATE or fully
  untouched where noted:**
  - S1 (15 files): `venue/spi/package-info.java`, `venue/application/{ReplaceRejection,EditVenueProfile}.java`, `venue/adapter/out/JdbcVenueCatalog.java` (2 RELOCATE-CANDIDATE, #53–#54), `venue/adapter/in/{UpdateVenueProfileRequest,ExpectedVersion}.java`, `shared/{ResubmissionOutcome,CurrentOperator}.java` (F-6 stale-sentence correction in `CurrentOperator`), `payout/package-info.java` (converted a stripped `//` block to `/** */` doc comment, RV-STYLE-1), `operator/api/VenueOwnership.java` (F-6 stale-sentence correction), `notification/application/{ResendOutcome,MailResubmission (1 RELOCATE-CANDIDATE, #55),MailAttemptSource,MailAttemptOutcome (1 RELOCATE-CANDIDATE, #56),BookingMailFactsService}.java`
  - S2 (15 files): `notification/api/package-info.java`, `notification/adapter/in/{AdminMailOutboxController,AdminEmailSuppressionController}.java`, `customer/vocabulary/Emails.java` (1 RELOCATE-CANDIDATE, #57), `customer/adapter/out/JdbcAccountErasure.java`, `customer/adapter/in/GuestContactRetentionScheduler.java`, `booking/vocabulary/package-info.java`, `booking/application/refund/RefundResubmission.java`, `booking/adapter/in/{RefundResubmissionProperties,AbandonedPaymentProperties}.java`, `availability/adapter/in/StaffAvailabilityController.java`, `WebCorsConfig.java`, `SessionAuthentication.java`, `ApiErrorHandler.java`, `AdminAuditFilter.java` (1 RELOCATE-CANDIDATE, #58)
  - S3 (15 files): `venue/vocabulary/{VenueSummaryView,PhotoSlot}.java`, `venue/application/{VenueProfileView,VenueCommissionService (reviewed, not modified — RELOCATE-CANDIDATE #59),SetRejection,ProfileUpdateOutcome,PhotoStorage (1 RELOCATE-CANDIDATE, #60),PhotoSlotView,PhotoServingUrls,PhotoProcessor,OnboardVenue,ListOwnedVenues,DailyAvailabilityService}.java`, `venue/adapter/in/{SetCommissionRequest,PhotoUploadResponse}.java`
  - S4 (15 files): `venue/adapter/in/{BeachMapLayoutRequest,AdminVenuePhotosResponse}.java`, `shared/InvalidApiRequestException.java` (reviewed, not modified — RELOCATE-CANDIDATE #61), `shared/CurrentCustomer.java`, `payment/api/{PaymentCredentialsLookup,CollectionGuarantee (1 RELOCATE-CANDIDATE, #62)}.java`, `operator/vocabulary/{package-info,OperatorCredential,OperatorAccount,ApprovalOutcome (1 RELOCATE-CANDIDATE, #63)}.java`, `operator/package-info.java`, `operator/application/OperatorRegistrationService.java`, `operator/api/package-info.java`, `operator/adapter/out/JdbcOperators.java` (1 RELOCATE-CANDIDATE, #64), `notification/application/MissingBookingFact.java` (1 RELOCATE-CANDIDATE, #65)
  - S5 (15 files): `notification/application/{MailResubmissionService (1 RELOCATE-CANDIDATE, #66),MailOutboxStatus,ConfirmationSendOutcome (1 RELOCATE-CANDIDATE, #67),ConfirmationMailAttempts}.java`, `notification/adapter/out/{SuppressedConfirmationMailDelivery,JdbcConfirmationMailAttempts (1 RELOCATE-CANDIDATE, #68)}.java`, `customer/vocabulary/SsoProvider.java`, `customer/package-info.java`, `customer/api/{SsoAccountProvisioning (1 RELOCATE-CANDIDATE, #69),CustomerAccountRecovery (1 RELOCATE-CANDIDATE, #70)}.java`, `booking/events/{package-info,BookingRequestExpired,BookingRequestDeclined,BookingCancelled}.java`, `booking/domain/BookingStatus.java`
  - S6 (15 files): `booking/application/view/{MyBookingsService,BookingDetail}.java`, `booking/application/request/{RequestWindows (1 RELOCATE-CANDIDATE, #71),PendingRequestsService}.java`, `booking/application/refund/{RefundOutbox (1 RELOCATE-CANDIDATE, #72),ExpireAbandonedBookings (1 RELOCATE-CANDIDATE, #73)}.java`, `booking/api/BookingNotificationFacts.java`, `booking/adapter/out/JdbcGuestBookingHistory.java` (1 RELOCATE-CANDIDATE, #74), `booking/adapter/in/CreateBookingRequest.java`, `SsoProviders.java`, `SsoProviderClient.java`, `SsoGateway.java`, `SsoController.java`, `SpaWebConfig.java`, `PrincipalSessionRevoker.java` (reviewed, not modified — 2 RELOCATE-CANDIDATE, #75)
  - S7 (15 files): `ObservabilityConfig.java` (1 RELOCATE-CANDIDATE, #76), `MoneyPathAlertCheck.java` (1 RELOCATE-CANDIDATE, #77), `MockSsoProdGuard.java`, `GoogleSsoGateway.java`, `ExternalIdentity.java`, `CustomerPasswords.java`, `AppleSsoGateway.java`, `AdminErasureController.java`, `AdminAuditLog.java`, `AdminAuditController.java`, `venue/vocabulary/{package-info,VenueFilter,PhotoSurface,CoverPhotoView,ContentHash}.java`
  - Sparse wave 1 paths the brace-set parser above didn't expand (listed individually for the
    `check-plan-file-structure.mjs` guard): `platform/src/main/java/ai/riviera/platform/SsoProviders.java`,
    `platform/src/main/java/ai/riviera/platform/WebCorsConfig.java`,
    `platform/src/main/java/ai/riviera/platform/booking/application/refund/ExpireAbandonedBookings.java`,
    `platform/src/main/java/ai/riviera/platform/booking/application/refund/RefundOutbox.java`,
    `platform/src/main/java/ai/riviera/platform/booking/application/request/RequestWindows.java`,
    `platform/src/main/java/ai/riviera/platform/customer/api/CustomerAccountRecovery.java`,
    `platform/src/main/java/ai/riviera/platform/customer/api/SsoAccountProvisioning.java`,
    `platform/src/main/java/ai/riviera/platform/notification/adapter/out/JdbcConfirmationMailAttempts.java`,
    `platform/src/main/java/ai/riviera/platform/notification/application/ConfirmationSendOutcome.java`,
    `platform/src/main/java/ai/riviera/platform/notification/application/MailAttemptOutcome.java`,
    `platform/src/main/java/ai/riviera/platform/notification/application/MailResubmission.java`,
    `platform/src/main/java/ai/riviera/platform/notification/application/MailResubmissionService.java`,
    `platform/src/main/java/ai/riviera/platform/operator/vocabulary/ApprovalOutcome.java`,
    `platform/src/main/java/ai/riviera/platform/payment/api/CollectionGuarantee.java`,
    `platform/src/main/java/ai/riviera/platform/venue/application/PhotoStorage.java`
- **Sparse wave 2 (S8–S15, 110 files, final wave), comment-only `#nnn` strip:**
  - S8 (15 files): `venue/vocabulary/{BookingMode,Amenity}.java`, `venue/spi/BookingPresence.java`, `venue/application/{ViewVenueProfile,VenuePhotos,VenueFieldValidation,VenueCommissionAdministration,VariantMeta,StoredBytes,SetDayState,ReplaceLayoutOutcome,PhotoMetadata,OwnedVenueView,LayoutCommand}.java`, `venue/api/package-info.java`
  - S9 (15 files): `venue/adapter/out/JdbcPhotoStorage.java`, `venue/adapter/in/{VenueReadController,RowPriceRequest,PhotoSlots,MyVenuesController}.java`, `payout/domain/BatchStatus.java`, `payout/application/{ViewDailyTakings,DailyTakingsService (1 RELOCATE-CANDIDATE, #78),BatchStatusOutcome}.java`, `payment/vocabulary/BookingRef.java` (reviewed, no MECHANICAL refs), `payment/application/RefundService.java`, `payment/adapter/out/{StripeProperties (1 RELOCATE-CANDIDATE, #79),ProfiledCollectionGuarantee (1 RELOCATE-CANDIDATE, #80)}.java`, `operator/vocabulary/{PendingOperator,OperatorRegistrationOutcome}.java`
  - S10 (15 files): `operator/vocabulary/OperatorLifecycleOutcome.java`, `operator/application/{OperatorService,OperatorAccountService}.java`, `operator/api/{OperatorRegistration,OperatorDirectory,OperatorAccounts}.java`, `notification/application/{SuppressionReinstatementService,SuppressionReason,RequestDeclinedMail,ReinstateOutcome,MailResubmissionWindow,MailOutbox,MailDeliveryLookupService,MailDeliveryLookup,BookingMailFacts}.java`
  - S11 (15 files): `notification/application/{BookingLinks,BookingConfirmationResend,BookingCancellationMail}.java`, `notification/adapter/out/{SuppressionPepperProdGuard,SmtpMailer,MockMailerProdGuard,JdbcEmailSuppressions}.java`, `notification/adapter/in/{RequestPaymentDueMailListener,MailTransportProperties (reviewed, no MECHANICAL refs — F-17 only),MailResubmissionConfig}.java`, `customer/vocabulary/{EraseOutcome,CustomerAccountId}.java`, `customer/spi/package-info.java`, `customer/application/{CustomerAccountService,AccountErasureService}.java`
  - S12 (15 files): `customer/api/{CustomerAccounts,CustomerAccountProvisioning,CustomerAccountDirectory}.java`, `booking/vocabulary/{RefundReason,BookingId (reviewed, no MECHANICAL refs)}.java`, `booking/spi/package-info.java`, `booking/application/view/{ViewBooking,MyBookings}.java`, `booking/application/reserve/{ReserveOutcome,PaymentDeclinedException}.java`, `booking/application/request/{WithdrawRequestService,WithdrawOutcome,RespondToRequest,PendingRequests,PaymentDueAnnouncer}.java`
  - S13 (15 files): `booking/application/request/{ExpireRequestsService,ExpireRequests}.java`, `booking/application/refund/{RefundResubmissionWindow,RefundOutboxStatus,AbandonedBookingSweepService}.java`, `booking/application/cancel/CancelOutcome.java` (reviewed, no MECHANICAL refs), `booking/api/CustomerBookings.java`, `booking/adapter/out/{JdbcCustomerBookings,JdbcBookingPresence}.java`, `booking/adapter/in/{WithdrawalView,RequestSweepScheduler,RefundResubmissionConfig,MyBookingsController,BookingSchedulingConfig,BookingRequestController}.java`
  - S14 (15 files): `booking/adapter/in/{BookingRequestConfig,BookingDetailView,BookingController,BookingConfirmationView,AdminWeatherRefundController}.java`, `availability/vocabulary/package-info.java`, `availability/api/package-info.java`, `availability/adapter/out/JdbcSetAvailabilityLookup.java`, `SsoAuthorizationChallenge.java`, `SessionIdentity.java` (reviewed, no MECHANICAL refs — 1 RELOCATE-CANDIDATE, #81), `RivieraOperatorProperties.java`, `RealSsoGateway.java`, `OperatorCredentialInitializer.java`, `MoneyPathAlertProperties.java`, `MockSsoIdpController.java`
  - S15 (5 files): `MockSsoGateway.java`, `CustomerUserDetailsService.java`, `CorrelationIdFilter.java`, `ClientIpResolver.java` (reviewed, no MECHANICAL refs — its only hit is an F-17 string literal), `AdminAuditReasons.java`
  - Sparse wave 2 paths the brace-set parser above didn't expand (listed individually for the
    `check-plan-file-structure.mjs` guard): `platform/src/main/java/ai/riviera/platform/SsoAuthorizationChallenge.java`,
    `platform/src/main/java/ai/riviera/platform/payment/adapter/out/ProfiledCollectionGuarantee.java`,
    `platform/src/main/java/ai/riviera/platform/payment/adapter/out/StripeProperties.java`,
    `platform/src/main/java/ai/riviera/platform/payout/application/DailyTakingsService.java`

## Generalization-audit log

N/A this pass — mechanical strip, no new pattern introduced beyond what Phase B already
generalized.

## Acceptance-criteria verification (final)

- [x] **AC-1:** all 270 files triaged file-by-file — every batch report above states its
      MECHANICAL/F-8-EXPOSED/RELOCATE-CANDIDATE breakdown; recorded in the wave summaries and the
      81-row RELOCATE-CANDIDATE inventory. Verified at the final integration commit.
- [x] **AC-2:** every MECHANICAL hit stripped; `node scripts/check-comment-only.mjs origin/main`
      run after every single cherry-pick (34 times), final count 257 files verified code-identical
      to `origin/main` except comments.
- [x] **AC-3:** zero edited line trailing on a code-bearing line — the pre-push grep
      (`git diff origin/main..HEAD -- platform/src/main | grep -E '^[+-][^+-]' | grep -vE
      '^[+-]\s*(//|/\*|\*)'`) ran after every batch integration and returned empty every time.
- [x] **AC-4:** every permitted label preserved — confirmed per-batch via before/after grep counts
      (recorded in each batch's report) and by the final tree-wide rescan finding no unaccounted
      token.
- [x] **AC-5:** `check-inline-comments.mjs` clean on the full committed diff after every wave.
- [x] **AC-6:** `compileJava`/`compileTestJava` clean and the structural net
      (`ModularityTests`/`JdbcOnlyArchitectureTests`/`PackageShapeArchitectureTests`/
      `PublishedSurfacePlacementArchitectureTests`) green after every wave, verified again at the
      very end on the fully-integrated branch.
- [x] **AC-7:** 81-row RELOCATE-CANDIDATE inventory produced (file, line, one-sentence rationale);
      zero edits made to `RESPONSIBILITIES.md` or any ADR this pass.
- [x] **AC-8:** CI/SonarCloud green on PR #564 — all 8 checks passed: SonarCloud Code Analysis
      (Quality Gate passed, 0 new issues, 0 duplications, 0 security hotspots), SonarCloud scan,
      CodeQL, Backend (build+test), Frontend (lint+test+build), Repo hygiene (diff-scoped),
      CodeQL java-kotlin, CodeQL javascript-typescript. Confirms the F-8 mitigation held —
      zero coverage-gate exposure from a comment-only diff across 257 files.

## Self-review checklist (before merge / PR)

- [x] Every AC has a verifying artifact — all 8 ACs verified, including AC-8 (all CI checks green
      on PR #564 before merge).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Invariants #1–#13: N/A — comment-only, no code/schema/money/timezone surface changed.
- [x] The historical Phase B doc was read, never edited — this is a new doc.
- [x] Execution status at HEAD matches reality.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` run clean before every
      plan-doc commit in this pass.
- [ ] **The review gate ran in full** — the formal SDLC review gate did not run as a dedicated
      pass this session; PR #564 was merged on explicit maintainer instruction with all CI/Sonar
      checks green and this gap disclosed in the PR body's Scope notes rather than silently
      skipped. Recorded here, unticked, as the honest final state — not resolved retroactively.
