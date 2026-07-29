# Duration-knob boot guards (#426) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The seven remaining unguarded `Duration` knobs — `booking.awaiting-payment.ttl`,
`booking.request.expiry-window` / `pay-window`, `stripe.connect-timeout` / `read-timeout`, and
`riviera.recovery.verification-token-ttl` / `reset-token-ttl` — reject a degenerate value at context
startup instead of booting clean into a control that silently does the opposite of what the operator
who set it intended.

**Architecture:** Identical to #414 (PR #425), and deliberately so: a compact canonical constructor
throwing `IllegalArgumentException`, **not** `@Validated` + `@Min`. There is no JSR-303 implementation
on the runtime classpath — #97 declined `spring-boot-starter-validation` in favour of explicit checks
in records (`riviera-java-conventions` §2/§6b) — so Boot would bind an annotated record and validate
*nothing*, which is the same silent degradation reached from the other side. What is **not** copied
from #414 is the *bounds*: the issue is explicit that each bound needs its own use-site argument, and
one of the seven (`expiry-window`) gets **no ceiling at all** because its use site already caps it.
Prior art followed line-for-line: `RegistryMailProperties` (#408), `RateLimitProperties` +
`CustomerRetentionProperties` (#414).

**Persistence:** JDBC only (invariant #1). No tables, no queries, no Flyway migration — this slice
touches four `@ConfigurationProperties` records, their tests, and the shipped `application.properties`
comments.

**Source of intent:** GitHub issue **#426**, itself the phase-0/phase-1 generalization-audit output of
#414 (the audit row is in `docs/plans/config-knob-boot-guards.md`, dated 2026-07-29).

**Skills consulted:**
- `riviera-sdlc` — routed the stages; its issue-intake grill gate produced findings G-1…G-6 below.
- `riviera-plan-doc` — this doc's structure and the Execution-status state store.
- `riviera-java-conventions` — §2 (validation belongs in the compact canonical constructor), §6a (name
  the literals: every bound is a `static final` constant), §6c (one-line-or-none inline comments; the
  long *why* goes in Javadoc, which is exempt), §7 (the `Europe/Tirane` cutoff arithmetic the
  `expiry-window` ceiling argument rests on is untouched).
- `riviera-modulith` — confirmed **no** class moves and no published-surface change: all four records
  stay where they are (`booking/adapter/in` ×2, `payment/adapter/out`, root composition root), and each
  new test class mirrors its subject's package because the bound constants are package-private.
- `riviera-stripe-payments` — routed by the `payment`-module row. Confirmed the timeout knobs are
  *client tuning* behind the outbound `PaymentGateway` port, not collection semantics: nothing in the
  collect-only / no-Connect model (ADR-0002) or invariant #8's webhook-as-truth rule changes, and the
  guard runs at boot, before any PaymentIntent exists. It supplied the #52 R-3 framing the ceilings use.
- `riviera-local-debug` — the cloud-session Gradle recipe and scoped-test discipline for the runs below.
- `tdd` — red-green per phase. `riviera-review-overlay` — layered onto the review gate.
- `riviera-docs-freshness` — **run** pre-merge over `origin/main...HEAD` (phase 4), not merely listed.
  **Zero findings:** the diff renames and removes nothing and swaps no mechanism — it adds boot-time
  rejection, Javadoc and config comments. The two substrate hits are both still true: `CONTEXT.md:60-61`
  and `riviera-stripe-payments` SKILL.md:66-67 state the request windows' *semantics*
  (`min(request + expiry-window, cutoff)`), which this slice does not change, and `CLAUDE.md`'s
  `notification` row + `RESPONSIBILITIES.md:284` state #408's registry-mail validation, which is
  untouched. No doc claims an inventory of validated knobs that this slice would leave incomplete.
  (`graphify-out/` is absent in this cloud clone, so there is no graph to refresh.)

**Branch:** `claude/sdlc-426-kpon0v` — the **cloud-session designated branch stands in for
`bugfix/duration-knob-boot-guards`** per `riviera-sdlc` §Remote/cloud session addendum. It exists in git
(local + `origin`) before phase 0, cut from `main` at `395fe79`.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given `booking.awaiting-payment.ttl=PT0S` (or a negative duration), when the context
  binds `AbandonedPaymentProperties`, then startup **fails** with an `IllegalArgumentException` naming
  `booking.awaiting-payment.ttl`, rather than a sweep that finds every `AWAITING_PAYMENT` booking
  expirable the instant it is inserted and releases the set under a tourist mid-checkout. *Pinned by:*
  `AbandonedPaymentPropertiesTest.aNonPositiveTtlFailsTheContext`
- [x] **AC-2:** Given `booking.awaiting-payment.ttl=PT48H` — past the point at which the sweep can
  still return a set in time to be sold for the date it was claimed for (invariant #4 closes bookings
  the evening before) — when the context binds, then startup **fails**. *Pinned by:*
  `AbandonedPaymentPropertiesTest.anOversizedTtlFailsTheContext`
- [x] **AC-3:** Given `booking.request.expiry-window=PT0S`, when the context binds `RequestProperties`,
  then startup **fails** naming `booking.request.expiry-window`, rather than a Request-mode venue whose
  every pending request is born expired and whose accept can never win the `request_expires_at > now`
  guard. *Pinned by:* `RequestPropertiesTest.aNonPositiveExpiryWindowFailsTheContext`
- [x] **AC-4:** Given `booking.request.pay-window=PT0S`, when the context binds, then startup **fails**
  naming `booking.request.pay-window`, rather than an accepted request swept as abandoned in the same
  instant the venue accepted it. *Pinned by:* `RequestPropertiesTest.aNonPositivePayWindowFailsTheContext`
- [x] **AC-5:** Given `booking.request.pay-window=PT120H`, when the context binds, then startup
  **fails**, because past the ceiling an unpaid accepted request holds its online-pool set across the
  whole span in which that date could still be sold. *Pinned by:*
  `RequestPropertiesTest.anOversizedPayWindowFailsTheContext`
- [x] **AC-6:** Given `booking.request.expiry-window=P30D` — far above every other bound in this slice —
  when the context binds, then it **starts**, because the use site caps the deadline at the
  evening-before cutoff (`min(now + expiryWindow, cutoff)`), so a long window degrades to "expires at
  the cutoff", the safe direction. The absent ceiling is pinned as **deliberate**, not forgotten.
  *Pinned by:* `RequestPropertiesTest.aLongExpiryWindowIsAcceptedBecauseTheCutoffCapsIt`
- [x] **AC-7:** Given `stripe.connect-timeout=PT0S` (or `stripe.read-timeout=PT0S`), when the context
  binds `StripeProperties`, then startup **fails** naming the property, rather than handing the SDK the
  JDK HTTP stack's documented *infinite* timeout — the exact pinned-thread risk #52 (R-3) closed, reached
  by a value that reads as "no limit" to whoever set it. *Pinned by:*
  `StripePropertiesTest.aNonPositiveConnectTimeoutFailsTheContext` and
  `StripePropertiesTest.aNonPositiveReadTimeoutFailsTheContext`
- [x] **AC-8:** Given `stripe.connect-timeout=PT60S` or `stripe.read-timeout=PT120S`, when the context
  binds, then startup **fails**, because an explicit timeout *beyond* the SDK default it exists to
  shorten (30s/80s) is worse than not configuring one — the default itself is the last accepted value,
  since setting exactly it is a no-op rather than a defect. *Pinned by:*
  `StripePropertiesTest.anOversizedConnectTimeoutFailsTheContext` and
  `StripePropertiesTest.anOversizedReadTimeoutFailsTheContext`
- [x] **AC-9:** Given `riviera.recovery.verification-token-ttl=PT0S` or
  `riviera.recovery.reset-token-ttl=PT0S`, when the context binds `RecoveryProperties`, then startup
  **fails** naming the property, rather than issuing tokens whose `expiresAt` equals their issue instant
  — every emailed link dead on arrival, with nothing failing anywhere. *Pinned by:*
  `RecoveryPropertiesBindingTest.aNonPositiveVerificationTokenTtlFailsTheContext` and
  `…aNonPositiveResetTokenTtlFailsTheContext`
- [x] **AC-10:** Given `riviera.recovery.reset-token-ttl=P30D` (or `verification-token-ttl=P30D`), when
  the context binds, then startup **fails**, because a reset token is a bearer credential whose leak *is*
  account takeover (invariant #7's posture) and a month-long one sits in a mailbox that long. *Pinned by:*
  `RecoveryPropertiesBindingTest.anOversizedResetTokenTtlFailsTheContext` and
  `…anOversizedVerificationTokenTtlFailsTheContext`
- [x] **AC-11:** Given the **shipped** `application.properties` and no overrides, when each of the four
  records binds, then `ttl=PT15M`, `expiryWindow=PT24H`, `payWindow=PT12H`, `connectTimeout=PT5S`,
  `readTimeout=PT20S`, `verificationTokenTtl=PT24H` and `resetTokenTtl=PT1H` — today's behaviour,
  byte-for-byte. *Pinned by:* the `bindsTheShipped…` test in each of the four classes.
- [x] **AC-12:** Given a value anywhere inside each documented range, when the record is constructed
  directly, then it is accepted, and one step beyond either bound it is rejected — the bounds bound the
  typo, not the operator. *Pinned by:* the `acceptsTheWhole…RangeButNotBeyondIt` test in each class.
- [x] **AC-13:** Given unset config, when each record is constructed with `null` components (the shape
  Boot's binder hands the three null-defaulting records), then the defaults still apply and no guard
  fires. *Pinned by:* `AbandonedPaymentPropertiesTest.unsetTtlStillDefaults`,
  `RequestPropertiesTest.unsetWindowsStillDefault`, `StripePropertiesTest.unsetTimeoutsStillDefault`.

> **On the ACs asserting the *context*, not the record.** The issue's sixth AC is explicit: a test that
> only asserts `new X(...)` throws would still pass if the guard were later replaced by a no-op `@Min`
> annotation. Only a context-level test shows Boot's binder **propagates** the record's exception into a
> startup failure instead of swallowing it and falling back to a default — the half the guard's
> usefulness actually rests on. Each asserts the **root cause and message**, not merely `hasFailed()`:
> any bind or bean-creation error satisfies the weaker assertion. Direct-construction tests are kept
> alongside (AC-12) because they are what reddens *first* when a bound is dropped.

## Non-goals

- **A ceiling on `booking.request.expiry-window`** — the use site is
  `min(now + expiryWindow, cutoff.closesAt(...))`, so the evening-before cutoff (invariant #4) already
  caps it and a longer window degrades to "expires at the cutoff", the documented safe direction. Same
  shape as #414's deliberately-uncapped `customer.retention.window`; AC-6 pins the absence as a decision.
- **`riviera.recovery.link-base-url`** — a `String`, not a `Duration`, and its failure mode (#368: links
  point at a dead origin) is a different defect class needing URL validation, not a range check. Not in
  #426's four families.
- **`MoneyPathAlertProperties` thresholds** and **`RateLimitProperties.Limit.capacity` / `refillPeriod`**
  — re-verified as non-candidates in #414 and again in this slice's intake (G-4): `0` is the documented
  "alert on any" value for the former, and `TokenBucket`'s constructor already rejects the latter
  *loudly* (per-request failure, not silent degradation).
- **The `@Scheduled` cadence keys** (`booking.awaiting-payment.sweep-interval` / `initial-delay`,
  `booking.request.sweep-interval` / `initial-delay`, `customer.retention.*`) — they have no
  programmatic reader by deliberate design, and Spring's `@Scheduled` already rejects a non-positive
  `fixedDelayString` at context refresh, which is the same boot-time failure this slice adds (G-5).
- **Any change to defaults, to sweep/recovery/Stripe runtime behaviour, or to when a token or booking
  expires.** This slice adds boot-time rejection of values nobody should set, and nothing else.
- **Converting other properties to `@Validated`** — see the Architecture note; the classpath makes it a
  no-op.
- **A cross-field rule tying the two recovery TTLs together** (reset ≤ verification) — raised at the
  review gate as F-4. Each bound answers its own use site, per the issue's "do not batch-apply one rule";
  the reset-shorter-than-verification ordering is a property of the shipped *defaults*, not an invariant
  either token's mechanism depends on, and a pair-wise rule would reject combinations that are unusual
  but not degenerate. The Javadoc now says the ordering is unenforced rather than calling it a contract.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — the slice adds boot-time rejection to seven existing knobs; it retires and replaces no surface.
The one behaviour worth stating explicitly is covered by **AC-11** and **AC-13**: every value inside the
accepted range, including all seven shipped defaults and the unset-config path, binds exactly as today.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A guard rejects a value some **deployed** environment already sets, turning a boot into a crash-loop — and unlike #414's knobs, two of these (`stripe.*`) sit on the money path under the `stripe` profile | low | high | Grep-verified across `platform/src`, `docs/deploy/`, `docs/runbooks/`, `render.yaml`: the shipped `application.properties` values are the only values written anywhere in the repo, all mid-range, and **none of the seven carries a `${VAR:…}` placeholder**, so none has a readable-name env override path. The only deployed Stripe env vars are `STRIPE_API_KEY` / `STRIPE_WEBHOOK_SECRET` (production-hardening.md §Secrets), neither in scope. | claude | **closed** — evidence in the phase-0 commit; residual risk is the relaxed-binding form (e.g. `STRIPE_CONNECTTIMEOUT`) in a Render dashboard nobody has set it in, and the failure mode is a loud boot failure naming the property and its range — the same trade #408/#414 accepted |
| R-2 | A guard fires on **unset** config, because three of the four records null-default *inside* the compact constructor | med | high | Order the statements: null-default first, validate second — the same R-2 #414 carried. AC-11 + AC-13 are what catch an inversion. `RecoveryProperties` is the exception: it defaults via `@DefaultValue` at the binder, so its components are non-null by the time the constructor body runs. | claude | **closed** — guards sit below every defaulting assignment in all three self-defaulting records; pinned by AC-11 (`bindsTheShipped…` ×4) and AC-13 (`unset…StillDefault` ×3). Independently re-verified at the review gate by reviewers #1 and #2 |
| R-3 | A chosen bound is arbitrary, so a future operator hits it with a legitimate value — the risk the issue calls out by name ("do not batch-apply one rule") | med | med | Every bound cites a mechanism at its own use site in the record's Javadoc, and no two families share an argument: the sweep ceilings rest on invariant #4's cutoff, the Stripe ceilings on the SDK defaults #52 replaced, the recovery ceilings on bearer-credential lifetime. Ranges are 6×–96× wide, and `expiry-window` gets no ceiling at all. | claude | **closed** — reviewer #3 read every historical resolution behind these knobs (`abandoned-booking-ttl-sweep.md`, `request-to-book.md`, `s8-email-verification-password-reset.md`, #52's commit) and found **no** value any of them chose or recommended that the new ranges reject. Reviewer #5 verified all six multiplier claims arithmetically. The one bound the review did question was a *stated* rule, not a chosen number (F-1) |
| R-4 | The `stripe.*` guard changes behaviour on the money path | low | high | It cannot run after boot: the record is bound at context refresh and the guard is in its constructor. `StripeConfig.clientBuilder` is untouched, so the `toIntExact` overflow guard and the two `set*Timeout` calls are byte-identical; `StripeConfigTest` (which binds `PT2S`/`PT10S`, both in range) stays green unmodified. No PaymentIntent, webhook, refund or ledger path is in the diff (invariants #8/#9/#10 untouched). | claude | **closed** — `gradle test --tests "*Stripe*"` green before and after the F-1 fix; reviewer #5 confirmed from the `stripe-java-33.1.1` jar itself (`javap`) that `DEFAULT_CONNECT_TIMEOUT=30000` / `DEFAULT_READ_TIMEOUT=80000`, so both ceilings sit exactly on the SDK defaults they cite |
| R-5 | Module-boundary leak | low | high | None possible: no class is created, moved or renamed across packages; the four edited records stay in the packages that own them, and the three new files are tests in their subjects' packages. `ModularityTests` + the rest of the structural net run anyway. | claude | **closed** — structural net green (`ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`), re-run after the base merge; reviewer #1 confirmed no new file under `src/main`, no rename, no new package |
| R-6 | Flyway version collision | n/a | n/a | No migration in this slice. At intake the open PRs were **#427** (`claude/sdlc-423-kxuuka`, #423 recovery-mail transport counter — `notification` + `shared`, no migration, no overlap with these four records) and ten Dependabot frontend bumps (#332–#341). | claude | closed — no migration on either side |

## Open questions / Assumptions

*(empty — every entry resolved below.)*

### Resolved

- **G-1 (scope is the issue's, not a widening):** unlike #414 — whose ACs covered only the floor, so its
  ceilings needed escalation — #426's fifth AC already asks for a ceiling "where warranted" and for the
  Javadoc to say why where one is deliberately absent. Ceilings are therefore **in scope as written**;
  no `AskUserQuestion` widening approval is due. 2026-07-29, pre-phase-0.
- **G-2 (floors above zero are a judgment call, and are taken):** the ACs say "non-positive fails", but
  every one of these knobs has a use-site mechanism that makes a small-but-positive value degrade the
  same way, just less completely — the identical reasoning that put #414's key-cap floor at 1 000 rather
  than 1, which review accepted. Each floor is set from that mechanism and stated in the message:
  `PT1M` for the three booking/recovery families (a Stripe checkout, a venue's reply, and an SMTP relay
  delivery all take longer than a minute), `PT1S` for the Stripe timeouts (the record's own Javadoc
  documents "a normal sub-second PaymentIntent create", so below a second the timeout fires on the
  normal case). Recorded as **R-3** and revisitable there.
- **G-3 (`expiry-window` has no ceiling, and that is a finding, not an omission):** the grill read the
  use site (`ReserveSetService`: `min(clock.instant().plus(expiryWindow), cutoff.closesAt(...))`) and
  found the deadline already capped by invariant #4. A ceiling would bound a value that cannot reach the
  domain. → No ceiling; the Javadoc says why, and **AC-6** pins acceptance of `P30D` so a future
  "consistency" edit that adds one reddens. 2026-07-29.
- **G-4 (the audit is now exhaustive):** enumerated all ten `@ConfigurationProperties` records under
  `platform/src/main`. Guarded already: `RegistryMailProperties` (#408), `RateLimitProperties`,
  `CustomerRetentionProperties` (#414). In this slice: the four. Remaining: `MoneyPathAlertProperties`
  (no `Duration`/`Period` component; its `0` is documented "alert on any"), `RivieraOperatorProperties`
  (strings only; blank is a documented state — no login). **After this slice no unguarded `Duration` or
  `Period` knob remains**, which is the audit thread #408 → #414 → #426 closing.
- **G-5 (cadence keys stay out, with a reason):** `sweep-interval` / `initial-delay` on both sweeps have
  no record, being read straight by `@Scheduled` placeholders. A non-positive `fixedDelayString` is
  rejected by Spring's scheduled-annotation post-processor at context refresh — already a boot failure,
  so there is nothing silent to guard. Recorded under Non-goals.
- **G-6 (in-flight check):** PR **#427** (#423, recovery-mail transport counter) touches
  `notification` + `shared/ObservabilityMetrics` and the `MailDispatcher` drop path. This slice touches
  `RecoveryProperties` in the **root** package — the recovery *token TTLs*, not the mail vehicle — so the
  two diffs do not share a file. No migration on either side. Whichever merges second merges from main.
  Sibling close-out: **#414 is closed as completed** via PR #425, with its plan doc's Execution status
  finalized in that PR and this issue (#426) filed as its deferred-audit follow-up, so the previous
  close-out has no gap.

## Availability & concurrency (invariant #2)

**Not N/A — two of the seven knobs decide when a `(set, date)` claim is released**, which is why they are
the highest-consequence pair in this slice.

`AbandonedBookingSweepService.sweep(ttl, payWindow)` reads
`bookings.findExpirableAwaitingPayment(now.minus(ttl), now.minus(payWindow))` and, for each hit, cancels
the PaymentIntent and **releases the `(set, date)` row** back to the pool. Both bounds therefore move a
release in time, in opposite failure directions:

- **Too short (the floor's job):** `now.minus(PT0S) == now`, so *every* `AWAITING_PAYMENT` booking is
  expirable the instant it is inserted. The row is released while its tourist is still in Stripe
  checkout — and a second party can then legitimately claim the same `(set, date)`. Invariant #2 is not
  *violated* (the DB still admits exactly one holder), but the platform sells the set out from under a
  live payer, whose webhook then confirms a booking whose claim is gone. The guard makes that
  unreachable from configuration.
- **Too long (the ceiling's job):** the release never happens in time. Because bookings close the
  evening before the date (invariant #4), a booking created near the cutoff with a TTL above 24h is
  never swept before its own booking date — the set is unsellable for the only day it could have been
  sold, and the sweep exists without being able to do its job.

Nothing else in the diff touches an availability write path: the guards run at context startup, before
any request is served, and no SQL, no claim/release call and no lock ordering changes. The invariant's
enforcement (unique constraint + guarded `UPDATE … RETURNING`) is untouched — this slice only removes a
configuration route to a *timing* that makes the enforcement moot.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | `AbandonedPaymentProperties` and `RequestProperties` are the configuration edge (`booking/adapter/in`) of the two lifecycles `booking` owns per the `CLAUDE.md` module table: the abandoned-payment sweep and Request-mode accept/decline + expiry (#98). |
| M-2 | `payment` | existing | `Payment` | `StripeProperties` is the Stripe SDK's own configuration, and the SDK lives in `payment`'s adapter layer only (`riviera-stripe-payments` §Boundary). The record already sits in `payment/adapter/out` beside `StripeConfig`. |
| M-3 | *(root — not a module)* | existing | n/a | `RecoveryProperties` is edge machinery in the composition root, package-private with `CustomerRecovery`, which builds the links and stamps `expiresAt`. Login/session/recovery machinery lives at the platform edge, never in a module (RV-BE-11) — the same reason `RecoveryPropertiesBindingTest` stayed at the root when the mailer moved to `notification` (#382). |

**Cross-module named interfaces (`api/` ports)**

N/A — no port is added, changed or consumed. No `api/`, `spi/`, `vocabulary/` or `events/` surface is
touched, so no `allowedDependencies` grant changes.

**Domain events (id-based payloads, invariant #11)**

N/A — no event is published, consumed, moved or renamed, so no Flyway `event_type` rewrite is needed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Reject a degenerate abandoned-payment TTL / Request-mode window at boot | `booking` | `booking` Job (`CLAUDE.md`, `RESPONSIBILITIES.md`): owns booking lifecycle, "request accept/decline + expiry sweep (#98)" and the cancellation/expiry rules. The validated records are that lifecycle's own configuration edge, already in `booking/adapter/in`. Explicitly **not** `availability`'s: it owns the `(set, date)` row and is "the only writer of that table", but holds no policy about *when* a booking is abandoned — `booking` calls the release. |
| Reject a degenerate Stripe client timeout at boot | `payment` | `payment` Job: "Stripe collection, PaymentIntents, refunds, webhook handling". The SDK client and its tuning live in `payment/adapter/out` and nowhere else; `booking` and `payout` never import Stripe types. |
| Reject a degenerate recovery token TTL at boot | *root (edge)* | Not a module's job by RV-BE-11 and D-2: `customer` owns the recovery *tokens* themselves (`customer` module table: "password recovery/reset tokens"), but the TTL is applied by the root-package `CustomerRecovery` edge orchestrator, which is where `RecoveryProperties` is bound and package-private. Moving the record into `customer` would be the login-machinery-in-a-module leak RV-BE-11 exists to stop. |

No class is created, moved or renamed across packages; all four edited records stay where they are. The
three new files are tests, each placed in its subject's package because the bound constants are
package-private (`riviera-modulith` checklist: no structural change, but the net runs anyway).

## Payment & payout (invariants #5, #8, #9, #10)

**In scope, but only at the client-tuning edge.** The model is unchanged and unchallenged: collect-only,
**no Stripe Connect** (ADR-0002), manual BKT payouts. Specifically:

- No money value, currency, amount or commission arithmetic appears in the diff (invariant #5 untouched).
- Confirmation still happens **only** on a signature-verified webhook (invariant #8): the diff does not
  touch `StripeWebhookController`, `StripePaymentGateway`, or any confirm path. `StripeProperties` is
  read by `StripeConfig.clientBuilder` (unchanged) and by the webhook controller for the signing secret
  (unchanged component).
- The payout ledger (invariant #9) and the server-side refund policy (invariant #10) are not in the diff.
- The **connect/read timeouts are the risk #52 (R-3) closed** — a degraded Stripe pinning a request
  thread and its pooled connection. `PT0S` re-opens it in the most deceptive way available: the JDK HTTP
  stack the SDK builds on documents a zero timeout as *infinite*
  (`java.net.URLConnection#setConnectTimeout`: "A timeout of zero is interpreted as an infinite
  timeout"), so the operator who typed "0 = no limit" gets the unbounded wait the knob exists to
  prevent. A negative duration survives `Math.toIntExact` and is rejected only per-request, deep on the
  money path. Both become boot failures.

## Angular — frontend surfaces touched

N/A — backend-only. No file under `frontend/` is touched, so no e2e spec is due (RV-FE-E2E).

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or error response is added or altered; all guards run at
context startup, before any request is served.

## Execution status

**Stage pointer:** `Merge — both gates run and cleared; awaiting the fix round's CI`

**Next action:** confirm CI + Sonar green on the fix-round SHA, then merge PR #429. Post-merge items are
GitHub-only and need no commit: #426 closes via the PR's `Closes`, and no parent epic tracks this issue
(it is a standalone follow-up of #414, itself closed under epic #367).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Abandoned-payment TTL bounds | ✅ | `eb3f766` |
| 1 — Request expiry/pay window bounds | ✅ | `22f03d7` |
| 2 — Stripe connect/read timeout bounds | ✅ | `54d6cef` |
| 3 — Recovery token TTL bounds | ✅ | `e7a3c7b` |
| 4 — Shipped-config comments, structural net, docs freshness, merge from main | ✅ | `4403c26`, base integrated at `0bd2ad7` |
| 5 — Review-gate fixes (F-1, F-2, F-4) + close-out | ✅ | `56c85bd` + this doc's final state, both in PR #429 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (bug scan, reviewer #2) | `StripeProperties`' ceiling check rejects only values *strictly above* the SDK default, but the Javadoc, the exception message, the test Javadoc, the test's `.as()` description, the plan's AC-8 + bounds table and the `application.properties` comment all said "at or above" — and `acceptsTheWholeTimeoutRangeButNotBeyondIt` asserts `PT30S`/`PT80S` **bind**. Stated rule and implemented rule disagreed at the boundary | **fixed — prose corrected, logic kept.** The inclusive bound is the right behaviour: setting exactly the SDK default is a *no-op*, not a defect (it is what an unset knob already does), whereas *exceeding* it is the regression, and making `MAX_*` the first **rejected** value would also invert the meaning the constants carry in the three sibling records. Corrected in all **six** places so they cannot drift apart again (the same all-sites discipline #414's F-5 applied), and `MAX_CONNECT_TIMEOUT`'s Javadoc now says outright that it is the last accepted value |
| F-2 | review (prior-PR comments, reviewer #4 **and** comment compliance, reviewer #5 — independently) | `RecoveryProperties`' class Javadoc claimed the reset TTL is "bounded **four** times more tightly than the verification one". The ceilings are `PT24H` and `P7D` (168h) — a **7×** ratio — and the same file's field Javadoc had it right twice ("7× the shipped 24h", "24× the shipped 1h") | **fixed** — now names both ceilings explicitly (`PT24H` vs `P7D`, "seven times tighter"), so the claim carries its own arithmetic instead of a number a reader has to trust. Same defect class as #414's F-4/F-5: a comment stating something the code does not do |
| F-4 | review (git-history context, reviewer #3) | `MAX_RESET_TOKEN_TTL`'s Javadoc called the reset-shorter-than-verification ordering "this record's own **contract**", but the two TTLs are bounded independently, so a pair like reset `PT20H` / verification `PT2H` binds cleanly and inverts it. Calling an unenforced property a contract is the same overstatement class as F-2 | **fixed — claim corrected, guard deliberately not widened.** The reviewer itself scoped this as belt-and-suspenders and not a regression (cross-field ordering was never enforced pre-PR). Enforcing it would batch one rule across two knobs, which is what the issue tells this slice not to do, and would reject combinations that are unusual but not degenerate. The Javadoc now states outright what is *not* checked and why, so the next reader does not infer an invariant from prose. Recorded under Non-goals |
| F-3 | review (prior-PR comments, reviewer #4) | The #413-F-2 concern re-raised: ~15 near-identical `runner.withPropertyValues(...).run(context -> …hasFailed().getFailure().rootCause()…)` blocks across four test classes — more surface than either #413 or #425 had — might trip the repo's 0-duplicated-blocks Sonar bar, and precedent alone shouldn't be trusted at this size | **not reproduced — closed on real evidence, not precedent.** Sonar analysed this exact SHA: `new_duplicated_blocks: 0`, `new_duplicated_lines_density: 0.0`, `new_lines: 208` (so the analysis genuinely ran — not the unanalyzed false-clean read). Extracting a helper would hide what each case asserts, since the property value and the expected message *are* each test's content |

---

## The bounds, and why each number

| Property | Shipped | Accepted range | Floor rationale | Ceiling rationale |
|---|---|---|---|---|
| `booking.awaiting-payment.ttl` | `PT15M` | `[PT1M, PT24H]` | `now.minus(PT0S) == now`, so every `AWAITING_PAYMENT` booking is expirable the instant it is inserted: the sweep cancels a live payer's PaymentIntent and releases their `(set, date)` claim while they are still in Stripe checkout. Negative is worse — the window reaches into the future. Below a minute is the same defect, less completely: card entry + 3DS does not finish inside a minute, and this record's own Javadoc promises a TTL "comfortably longer than a real Stripe checkout". | The TTL is the only thing that returns an abandoned set to the pool. Bookings close the evening before the date (invariant #4), so a booking created near the cutoff with a TTL past 24h is **never swept before its own booking date** — the set is dead for the one day it could be sold, and the sweep, whose stated job is to "free an abandoned set the same day", cannot do it. 96× the shipped value. |
| `booking.request.expiry-window` | `PT24H` | `[PT1M, ∞)` | `min(now + PT0S, cutoff) == now`, so every pending request is born expired and no accept can win the `request_expires_at > now` guard: a Request-mode venue silently takes no bookings at all and nothing fails. Under a minute is the same outcome — no venue answers that fast. | **None, deliberately.** The use site is `min(now + expiryWindow, cutoff.closesAt(...))`: the evening-before cutoff (invariant #4) already caps the deadline, so a longer window degrades to "expires at the cutoff" — the documented safe direction, and the same reasoning that left #414's `customer.retention.window` uncapped. AC-6 pins the absence as a decision. |
| `booking.request.pay-window` | `PT12H` | `[PT1M, PT72H]` | This is the *accepted-request* arm of the same sweep (`now.minus(payWindow)`), so `PT0S` reaps the booking in the same instant the venue accepts it: the guest is emailed a payment request for a booking that is already cancelled and released. Under a minute is that outcome with extra steps — the default is 12h precisely because "the guest may be asleep when the accept lands". | Same release mechanism as the TTL, one flow later: past 72h an accepted-but-unpaid request holds its online-pool set across the whole span in which that date could still be sold, so the pay window stops being a window and becomes a hold. 6× the shipped value, and already far past the asleep-guest argument the default rests on. |
| `stripe.connect-timeout` | `PT5S` | `[PT1S, PT30S]` | `0` is the JDK HTTP stack's documented **infinite** timeout (`java.net.URLConnection#setConnectTimeout`: "A timeout of zero is interpreted as an infinite timeout") — so the operator who reads `0` as "no limit" gets exactly the degraded-Stripe thread-and-connection pin that #52 (R-3) set these timeouts to prevent, on the money path, under the `stripe` profile (i.e. production). A negative duration passes `Math.toIntExact` and is rejected only per-request, deep in the checkout call. Below `PT1S` the timeout fires on the normal case: this record's Javadoc documents "a normal sub-second PaymentIntent create". | `PT30S` is the SDK's own default connect timeout — the value this knob exists to *shorten* (record Javadoc: "the SDK defaults (30s connect / 80s read) are long enough that a degraded Stripe could pin a request thread"). `PT30S` itself is the last **accepted** value — setting exactly the SDK default is a no-op, not a defect — while *beyond* it an explicitly-configured timeout is worse than not configuring one, the same read-as-safe / means-degenerate inversion as the floor. 6× the shipped value. |
| `stripe.read-timeout` | `PT20S` | `[PT1S, PT80S]` | Identical mechanism to the connect timeout, one phase later in the call: `0` waits forever on a Stripe that accepted the connection and then stalled — the longer-lived and therefore worse of the two pins. | `PT80S` is the SDK's own default read timeout, by the same argument. 4× the shipped value. |
| `riviera.recovery.verification-token-ttl` | `PT24H` | `[PT1M, PT168H]` | `clock.instant().plus(PT0S)` is the issue instant, so `expiresAt == issuedAt`: every token is born expired. Since #368 the mail is real SMTP and since #369 it is dispatched off the request thread, so the visible symptom is "the verification emails arrive and every link says expired" with no error anywhere. Below a minute the token can die before the relay has delivered it. | A verification token is an unguessable bearer credential sitting in a mailbox (invariant #7's posture applied to a non-booking credential). Past a week it long outlives the sign-up it belongs to, and email verification is soft/non-blocking (D-8) — nothing forces it to be consumed, so a long TTL is a credential nobody is prompted to spend. 7× the shipped value. |
| `riviera.recovery.reset-token-ttl` | `PT1H` | `[PT1M, PT24H]` | Same born-expired mechanism, on the one flow that has no other route back into an account: a reset link that is always expired locks every user out of self-service recovery permanently, and the platform cannot tell the difference from the outside. | A leaked reset link **is** account takeover. This record's own Javadoc states the reset TTL is "deliberately shorter … the more sensitive credential" and ships it 24× shorter than the verification TTL; the ceiling holds that ordering's intent at the outer end. 24× the shipped value. |

> **Why every floor is `PT1S`/`PT1M` rather than "any positive duration".** The ACs say "non-positive
> fails", and a bare `isZero() || isNegative()` check would satisfy them literally. But each use site
> makes a small positive value fail the *same* way — a 30-second checkout TTL still reaps live payers, a
> 200ms Stripe timeout still fires on the normal call — and #414 settled this trade in the same
> direction (floor `1_000`, not `1`, on the key cap). The floors are set from the mechanism named in
> each row, never from a round number, and are 15×–1200× below the shipped value so they bound the typo,
> not the operator (G-2, R-3).

---

## File structure

- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/AbandonedPaymentProperties.java` — add
  `MIN_TTL` / `MAX_TTL` and the compact-constructor guard *below* the null-defaulting; extend the Javadoc.
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/AbandonedPaymentPropertiesTest.java` —
  **new**, mirroring `RegistryMailPropertiesTest`.
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RequestProperties.java` — add
  `MIN_WINDOW` / `MAX_PAY_WINDOW` and the guards; extend the Javadoc with the no-ceiling reasoning.
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RequestPropertiesTest.java` — **new**.
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/StripeProperties.java` — add
  `MIN_TIMEOUT` / `MAX_CONNECT_TIMEOUT` / `MAX_READ_TIMEOUT` and the guards; extend the Javadoc.
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripePropertiesTest.java` — **new**.
  `StripeConfigTest` is left alone: it is a `Binder`-based *wiring* spec for `clientBuilder`, not a
  context-level binding spec, and AC-7/AC-8 need `ApplicationContextRunner`.
- `platform/src/main/java/ai/riviera/platform/RecoveryProperties.java` — add `MIN_TOKEN_TTL` /
  `MAX_VERIFICATION_TOKEN_TTL` / `MAX_RESET_TOKEN_TTL` and a compact constructor; extend the Javadoc.
- `platform/src/test/java/ai/riviera/platform/RecoveryPropertiesBindingTest.java` — **extended**, not
  duplicated: it is already this record's binding spec on exactly the `ApplicationContextRunner` +
  `ConfigDataApplicationContextInitializer` harness these ACs need, so a second `RecoveryPropertiesTest`
  beside it would be #414's rejected two-classes-one-record shape.
- `platform/src/main/resources/application.properties` — extend the three shipped comment blocks with
  each accepted range and its one-line reason, so the operator editing the file sees the bound first.
- `docs/plans/duration-knob-boot-guards.md` — this plan.

> **No operator-doc change is due.** `docs/runbooks/` and `docs/deploy/` were grepped for all seven
> property names: none appears (unlike #414, where `data-erasure.md` handed the operator a `window`
> value to set). `CONTEXT.md` and `riviera-stripe-payments` name `booking.request.*` but state only its
> *semantics*, which this slice does not change. Re-verified by `riviera-docs-freshness` in phase 4.

---

## Phase 0 — Abandoned-payment TTL bounds

**Files:** Modify `platform/src/main/java/ai/riviera/platform/booking/adapter/in/AbandonedPaymentProperties.java` ·
Create `platform/src/test/java/ai/riviera/platform/booking/adapter/in/AbandonedPaymentPropertiesTest.java`

- [x] **Step 1: Write the failing test** — new class on the prior-art harness, covering
  `bindsTheShippedTtl` (AC-11), `aNonPositiveTtlFailsTheContext` (AC-1), `aTtlBelowTheFloorFailsTheContext`
  (AC-1, floor arm), `anOversizedTtlFailsTheContext` (AC-2), `acceptsTheWholeTtlRangeButNotBeyondIt`
  (AC-12) and `unsetTtlStillDefaults` (AC-13). Each context test asserts
  `.rootCause().isInstanceOf(IllegalArgumentException.class)` **and**
  `.hasMessageContaining("booking.awaiting-payment.ttl")`.
- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*AbandonedPaymentPropertiesTest*"`
  → FAIL: `cannot find symbol: variable MIN_TTL` (6 compile errors) — the range test cannot compile until
  the constants exist.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [x] **Step 3: Minimal implementation** — `MIN_TTL = Duration.ofMinutes(1)`,
  `MAX_TTL = Duration.ofHours(24)`, each with the Javadoc argument from the bounds table, and a guard
  *below* the null-defaulting (R-2) whose message names the property, the range, the offending value and
  both failure modes.
- [x] **Step 4: Run it, verify it passes** — same command → PASS (6 tests).

> Scope (end-of-phase regression): broaden to the touched area —
> `gradle test --tests "*AbandonedBooking*" --tests "*AbandonedPayment*"` → PASS.

- [x] **Step 5: Generalization-audit pass** — record the enumeration of all ten
  `@ConfigurationProperties` records (G-4) in the log below.
- [x] **Step 6: Commit** — `fix(#426): reject a degenerate abandoned-payment TTL at boot (#426)`.
- [x] **Step 7: Push and open the DRAFT PR immediately** — CI fires on `pull_request` only (#417), so a
  branch with no PR gets no CI at all. Then update this Execution status in the same commit window.

---

## Phase 1 — Request expiry/pay window bounds

**Files:** Modify `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RequestProperties.java` ·
Create `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RequestPropertiesTest.java`

- [x] **Step 1: Write the failing test** — `bindsTheShippedWindows` (AC-11),
  `aNonPositiveExpiryWindowFailsTheContext` (AC-3), `aNonPositivePayWindowFailsTheContext` (AC-4),
  `anOversizedPayWindowFailsTheContext` (AC-5), `aLongExpiryWindowIsAcceptedBecauseTheCutoffCapsIt`
  (AC-6 — asserts the context **starts** and binds `P30D`), `acceptsTheWholeWindowRangeButNotBeyondIt`
  (AC-12), `unsetWindowsStillDefault` (AC-13).
- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*RequestPropertiesTest*"` → FAIL:
  `cannot find symbol: variable MIN_WINDOW` / `MAX_PAY_WINDOW`.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [x] **Step 3: Minimal implementation** — `MIN_WINDOW = Duration.ofMinutes(1)`,
  `MAX_PAY_WINDOW = Duration.ofHours(72)`; two guards below the null-defaulting. The `expiryWindow`
  guard checks the floor **only**, and the record Javadoc states the missing ceiling is deliberate,
  naming `min(now + expiryWindow, cutoff)` and invariant #4 (G-3).
- [x] **Step 4: Run it, verify it passes** — same command → PASS (7 tests).

> Scope (end-of-phase regression): broaden to the touched area —
> `gradle test --tests "*Request*" --tests "*ReserveSetServiceTest*"` → PASS.

- [x] **Step 5: Generalization-audit pass** — ask the no-ceiling question of every other bound in the
  slice: is any other use site self-capping? Append the answer to the log.
- [x] **Step 6: Commit** — `fix(#426): bound the Request-mode windows at boot (#426)`.
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Stripe connect/read timeout bounds

**Files:** Modify `platform/src/main/java/ai/riviera/platform/payment/adapter/out/StripeProperties.java` ·
Create `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripePropertiesTest.java`

- [x] **Step 1: Write the failing test** — `bindsTheShippedTimeouts` (AC-11), the two
  `aNonPositive…FailsTheContext` (AC-7), the two `anOversized…FailsTheContext` (AC-8),
  `acceptsTheWholeTimeoutRangeButNotBeyondIt` (AC-12), `unsetTimeoutsStillDefault` (AC-13). The
  oversized cases assert the message names the SDK default being exceeded, so the *why* is in the boot
  log an operator reads at 3am.
- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*StripePropertiesTest*"` → FAIL:
  `cannot find symbol: variable MIN_TIMEOUT` / `MAX_CONNECT_TIMEOUT` / `MAX_READ_TIMEOUT`.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [x] **Step 3: Minimal implementation** — `MIN_TIMEOUT = Duration.ofSeconds(1)`,
  `MAX_CONNECT_TIMEOUT = Duration.ofSeconds(30)`, `MAX_READ_TIMEOUT = Duration.ofSeconds(80)`; two
  guards below the four defaulting assignments. `apiKey` / `webhookSecret` defaulting is untouched
  (invariant #8: credentials stay env-supplied and uncommitted).
- [x] **Step 4: Run it, verify it passes** — same command → PASS (8 tests).

> Scope (end-of-phase regression): the money path's own specs —
> `gradle test --tests "*Stripe*"` (covers `StripeConfigTest`, `StripePaymentGatewayTest`,
> `StripeWebhook*`) → PASS.

- [x] **Step 5: Generalization-audit pass** — the read-as-unbounded / means-degenerate inversion is now
  its own recognisable class (queue capacity #408, timeouts here); search for any other knob whose zero
  reads as "no limit". Append to the log.
- [x] **Step 6: Commit** — `fix(#426): bound the Stripe client timeouts at boot (#426)`.
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Recovery token TTL bounds

**Files:** Modify `platform/src/main/java/ai/riviera/platform/RecoveryProperties.java` ·
Modify `platform/src/test/java/ai/riviera/platform/RecoveryPropertiesBindingTest.java`

- [x] **Step 1: Write the failing test** — append `bindsTheShippedTokenTtls` (AC-11), the two
  `aNonPositive…FailsTheContext` (AC-9), the two `anOversized…FailsTheContext` (AC-10) and
  `acceptsTheWholeTokenTtlRangeButNotBeyondIt` (AC-12); widen the class Javadoc, which today scopes
  itself to the #368 link-base-url binding.
- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*RecoveryPropertiesBindingTest*"`
  → FAIL: `cannot find symbol: variable MIN_TOKEN_TTL` / `MAX_VERIFICATION_TOKEN_TTL` / `MAX_RESET_TOKEN_TTL`.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [x] **Step 3: Minimal implementation** — `MIN_TOKEN_TTL = Duration.ofMinutes(1)`,
  `MAX_VERIFICATION_TOKEN_TTL = Duration.ofDays(7)`, `MAX_RESET_TOKEN_TTL = Duration.ofHours(24)`, and a
  compact constructor holding both guards. **No null-defaulting is added**: `@DefaultValue` supplies
  both components at the binder, and a `null` passed by direct construction fails here exactly as it
  already fails at `clock.instant().plus(null)` in `CustomerRecovery` — the Javadoc says so.
- [x] **Step 4: Run it, verify it passes** — same command → PASS (9 tests).

> Scope (end-of-phase regression): the recovery flow's own specs —
> `gradle test --tests "*Recovery*" --tests "*CustomerRecoveryTest*"` → PASS.

- [x] **Step 5: Generalization-audit pass** — close the audit thread: assert in the log that no
  unguarded `Duration`/`Period` knob remains anywhere under `platform/src/main` (G-4).
- [x] **Step 6: Commit** — `fix(#426): bound the recovery token TTLs at boot (#426)`.
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — Shipped-config comments, structural net, docs freshness, merge from main

**Files:** Modify `platform/src/main/resources/application.properties` · this plan doc

- [x] **Step 1:** Extend the three shipped comment blocks (`stripe.*`, `booking.awaiting-payment.*` +
  `booking.request.*`, `riviera.recovery.*`) with each accepted range and its one-line reason, so an
  operator editing the file sees the bound before the boot does.
- [x] **Step 2:** Run the structural net —
  `gradle test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"`
  → PASS, together with `PublishedSurfacePlacementArchitectureTests` and all four property specs re-run
  against the edited shipped config (no structure changed; this is the standing check after any backend
  change).
- [x] **Step 3:** Run `riviera-docs-freshness` over `origin/main...HEAD` and record the result in
  *Skills consulted* — ticking the line without running it is the miss #413/#318/#414 were each dinged for.
  Zero findings; the evidence is in the *Skills consulted* entry.
- [x] **Step 4:** Merge the latest `origin/main` into the branch with full phase discipline (routing gate
  for whatever the integration touches, scoped tests, honest commit), then mark the PR **ready for
  review** — that is what makes the Review and Sonar gates due. *Integrated **#423 / PR #427** (the
  recovery-mail transport counter), which landed while phases 1–3 were building.* No conflict and no
  rework: it touches `notification` + `shared/ObservabilityMetrics` and the `MailDispatcher` send path,
  none of which this slice states or edits — the overlap predicted at intake (G-6) stayed hypothetical
  because this slice's recovery work is the **token TTLs** in the root package, not the mail vehicle.
  Re-verified post-merge with the structural net, all four property specs **and** the merged change's own
  `TransactionalMailServiceTest`. No routing-gate re-entry was due: the integration changed no file in
  this diff.
- [x] **Step 5:** Commit the finalized Execution status **in this PR**, citing the PR number — never a
  merge SHA, which cannot exist before the merge. *(Final close-out lands with the review/Sonar gate
  results, before merge.)*

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-29 | phase 0 | every `@ConfigurationProperties` record under `platform/src/main`, asked "what does a degenerate value do here?" — the sweep #414 started, run to exhaustion so the thread can be closed | `grep -rln "@ConfigurationProperties" --include=*.java platform/src/main` (10 records), then read each record's components and null-defaulting | Guarded already: `RegistryMailProperties` (#408), `RateLimitProperties` + `CustomerRetentionProperties` (#414). Unguarded and in this slice: the four `Duration` records. Genuinely not candidates: `MoneyPathAlertProperties` (no `Duration`/`Period` component; `0` is its documented "alert on any"), `RivieraOperatorProperties` (strings; blank is the documented no-login state) | fix the four; after phase 3 **no unguarded `Duration`/`Period` knob remains** — recorded as G-4 |
| 2026-07-29 | phase 1 | the no-ceiling question, asked of the other five knobs: does any *other* use site already cap its value, the way `ReserveSetService`'s `min(now + expiryWindow, cutoff)` caps the expiry window? | read each remaining use site: `AbandonedBookingSweepService.sweep`, `StripeConfig.clientBuilder`, `CustomerRecovery` | **No — `expiry-window` is the only self-capping knob.** `now.minus(ttl)` / `now.minus(payWindow)` and `clock.instant().plus(tokenTtl)` are unbounded in both directions. `StripeConfig` has `Math.toIntExact(...toMillis())`, which *does* cap at ~24.8 days — but it throws rather than degrading, and it sits ~26 000× above the SDK default, so it bounds nothing an operator would plausibly type | keep the ceilings on the other five; keep `expiry-window` uncapped and pinned by AC-6 |
| 2026-07-29 | phase 2 | the **read-as-unbounded / means-degenerate** inversion as its own class — a knob whose `0` reads to a human as "no limit" but means "degenerate" to the machine (#408's `queue-capacity` → `SynchronousQueue`; these timeouts → infinite wait) | re-read all ten records' components for a zero that a human would type meaning "off"/"unlimited" | Only these two families. The rest degrade *toward* zero in the direction the name implies (a `0` TTL is a zero-length TTL, not an infinite one) — so their guard messages explain the *consequence*, while these two must also correct the *reading*, which is why both messages say the word "infinite" and both tests assert it | no further sites; keep the wording distinction |
| 2026-07-29 | phase 3 | the closing sweep: does any unguarded `Duration`/`Period` component remain anywhere under `platform/src/main`? | `grep -rn "Duration \|Period " --include=*.java platform/src/main/java/**/[A-Z]*Properties.java` over all ten records, then re-read each constructor | **None.** All seven `Duration` components in the four records of this slice now carry bounds; `CustomerRetentionProperties.window` (the only `Period`) was bounded in #414; the remaining three records hold no temporal component. The #408 → #414 → #426 audit thread is closed | nothing further to fix; recorded so a future audit starts from "all guarded" rather than re-deriving it |
| 2026-07-29 | plan (intake grill) | the inherited #414 audit's four families, re-verified at their use sites rather than taken from the issue | read `AbandonedBookingScheduler`/`AbandonedBookingSweepService`, `ReserveSetService`, `BookingRequestConfig`, `StripeConfig.clientBuilder`, `CustomerRecovery` | all four confirmed as written, plus one the issue did not state: `booking.request.expiry-window`'s use site **self-caps** at the invariant-#4 cutoff, so it warrants a floor but no ceiling | fix all seven knobs; give `expiry-window` no ceiling and pin the absence with AC-6 (G-3) |

---

## Acceptance-criteria verification (final)

- [x] **AC-1** … **AC-13:** each verified by the named test in its phase's scoped run, with the commit
  recorded here as the phase lands.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled — *not* N/A here: two knobs decide when a `(set, date)` claim is
  released, and the section states both failure directions. Reviewer #1 traced both knobs to
  `AbandonedBookingSweepService.sweep` and confirmed the guarded release path itself is untouched.
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched, and invariant #4 is the stated basis
  for two of the bounds.
- [x] **Modulith** section filled; no cross-module imports added; no class moved (invariant #11).
- [x] **Payment/payout** section filled — the Stripe timeouts are in scope; collect-only/no-Connect and
  webhook-as-truth are unchanged.
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — no timezone arithmetic in the diff.
- [x] Booking codes unguessable (invariant #7) — untouched; no code, token, email or PII enters a log or
  an exception message (every message carries only the offending duration and the range).
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards — N/A, backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows (all six closed with their outcome); Open Questions empty.
- [x] **Close-out written in THIS PR** — this doc's final state committed here, citing `merged via PR #429`
  rather than a squash SHA that cannot exist pre-merge.
- [x] **The review gate ran in full** — the invocation ladder's **rung 2**: the `Skill("code-review")`
      probe was refused by upstream `disable-model-invocation` (as the ladder predicts), so the installed
      plugin's `commands/code-review.md` payload was executed directly — eligibility check, CLAUDE.md-path
      resolution, change summary, the **five parallel reviewers**, then confidence scoring — with
      `riviera-review-overlay` layered on, at **high** effort (the diff touches money and the booking
      lifecycle). The session's standing "no Agent tool" rule was escalated to the user and the fan-out
      **authorized** before it ran, per §1. Four findings; three fixed (F-1, F-2, F-4), one closed as not
      reproduced against real Sonar output (F-3). Three reviewers died mid-run to transient 529s and were
      relaunched rather than dropped — a half-run fan-out would have left the bank unrun.
- [x] **The Sonar gate ran and its list is cleared, not just its gate green** — `SonarCloud Code Analysis`
      concluded `success`, and the API list for this PR reports `new_bugs 0`, `new_vulnerabilities 0`,
      `new_code_smells 0`, `new_duplicated_blocks 0`, `new_duplicated_lines_density 0.0`,
      `new_coverage 100.0` on `new_lines 208` — non-empty measures, so not the unanalyzed false-clean read.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
