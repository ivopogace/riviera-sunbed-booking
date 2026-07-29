# Config-knob boot guards (#414) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three bound configuration knobs — `riviera.ratelimit.max-tracked-keys`,
`customer.retention.batch-size` and `customer.retention.window` — reject a degenerate value at
context startup instead of booting clean into a silently-degraded control, exactly as #408 guarded
the registry-mail pool.

**Architecture:** The single significant decision is **where the guard lives**: a compact canonical
constructor throwing `IllegalArgumentException`, **not** `@Validated` + `@Min`. There is no JSR-303
implementation on the runtime classpath — #97 declined `spring-boot-starter-validation` in favour of
explicit checks in records (`riviera-java-conventions` §2/§6b) — so Boot would bind an annotated
record and validate *nothing*, which is the same silent degradation reached from the other side. The
guards bound **both ends**: a floor catches the typo that disables the control, a ceiling catches the
typo that restores the unbounded resource the control exists to bound. Prior art, followed
line-for-line: `RegistryMailProperties` (#408).

**Persistence:** JDBC only (invariant #1). No tables, no queries, no Flyway migration — this slice
touches two `@ConfigurationProperties` records, their tests, and the shipped `application.properties`
comments.

**Source of intent:** GitHub issue **#414** (sub-issue of epic **#367**), itself the phase-0
generalization audit of #408 / PR #413.

**Skills consulted:**
- `riviera-sdlc` — routed the stages; its issue-intake grill gate produced findings G-1…G-4 below.
- `riviera-plan-doc` — this doc's structure and the Execution-status state store.
- `riviera-java-conventions` — §2 (validation belongs in the compact canonical constructor), §6a
  (name the literals: the four bounds are `static final` constants, not inline numbers), §6c
  (one-line-or-none inline comments; the long *why* goes in Javadoc, which is exempt).
- `riviera-modulith` — confirmed **no** class moves: `RateLimitProperties` stays in the root
  composition-root package (edge machinery, RV-BE-11) and `CustomerRetentionProperties` stays in
  `customer/adapter/in`; the new test class mirrors its subject's package.
- `riviera-local-debug` — the cloud-session Gradle recipe and scoped-test discipline for the runs below.
- `tdd` — red-green per phase. `riviera-review-overlay` — at the review gate.
- **Not loaded, deliberately:** `postgres` — the diff contains no DDL, no migration and no SQL. The
  `batch-size` ceiling *reasons about* an existing query (PostgreSQL's 65 535 bind-parameter ceiling
  on the expanded `IN (:guests)` list in `JdbcGuestBookingHistory`), but changes no SQL, so the
  routing-table row ("a Postgres table / Flyway migration / index / SQL query") does not fire.
  Likewise no frontend, no money: `riviera-frontend` / `angular-developer` / `playwright-cli` /
  `riviera-stripe-payments` are all out of scope.

**Branch:** `claude/sdlc-414-xqyzxm` — the **cloud-session designated branch stands in for
`bugfix/config-knob-boot-guards`** per `riviera-sdlc` §Remote/cloud session addendum. It exists in
git (local + `origin`) before phase 0.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given `riviera.ratelimit.max-tracked-keys=0`, when the context binds
  `RateLimitProperties`, then startup **fails** with an `IllegalArgumentException` naming
  `max-tracked-keys`, rather than yielding a limiter whose every new key clears every other key's
  spent tokens. *Pinned by:* `RateLimitPropertiesBindingTest.aNonPositiveKeyCapFailsTheContext`
- [ ] **AC-2:** Given `riviera.ratelimit.max-tracked-keys=2` — positive, but far below the point at
  which prune-then-reset is a backstop rather than the steady state — when the context binds, then
  startup **fails**. *Pinned by:* `RateLimitPropertiesBindingTest.aKeyCapBelowTheFloorFailsTheContext`
- [ ] **AC-3:** Given `riviera.ratelimit.max-tracked-keys=1000000` (the shipped value with one extra
  digit), when the context binds, then startup **fails**, because ten dimension maps at that cap are
  the memory outage the cap exists to prevent. *Pinned by:*
  `RateLimitPropertiesBindingTest.anOversizedKeyCapFailsTheContext`
- [ ] **AC-4:** Given `customer.retention.batch-size=0`, when the context binds
  `CustomerRetentionProperties`, then startup **fails** with an `IllegalArgumentException` naming
  `batch-size`, rather than a scheduled sweep that runs forever on `LIMIT 0` and scrubs nothing.
  *Pinned by:* `CustomerRetentionPropertiesTest.aNonPositiveBatchSizeFailsTheContext`
- [ ] **AC-5:** Given `customer.retention.batch-size=100000`, when the context binds, then startup
  **fails**, because one `@Transactional` sweep of that size is the unbounded transaction the batch
  bound exists to prevent and exceeds PostgreSQL's 65 535 bind-parameter ceiling on the candidate
  `IN (:guests)` list. *Pinned by:* `CustomerRetentionPropertiesTest.anOversizedBatchSizeFailsTheContext`
- [ ] **AC-6:** Given `customer.retention.window=P0D` (or any negative period), when the context
  binds, then startup **fails**, rather than setting the cutoff to today and scrubbing every guest
  contact with no booking on or after today — irreversibly (ADR-0010). *Pinned by:*
  `CustomerRetentionPropertiesTest.aNonPositiveWindowFailsTheContext`
- [ ] **AC-7:** Given the **shipped** `application.properties` and no overrides, when each record
  binds, then `maxTrackedKeys` is `100000`, `window` is `P10Y` and `batchSize` is `500` — today's
  behaviour, byte-for-byte. *Pinned by:* `RateLimitPropertiesBindingTest.bindsTheShippedKeyCapDefault`
  and `CustomerRetentionPropertiesTest.bindsTheShippedDefaults`
- [ ] **AC-8:** Given a value anywhere inside each documented range, when the record is constructed
  directly, then it is accepted — the bounds bound the typo, not the operator. *Pinned by:*
  `RateLimitPropertiesBindingTest.acceptsTheWholeKeyCapTuningRangeButNotBeyondIt` and
  `CustomerRetentionPropertiesTest.acceptsTheWholeBatchTuningRangeButNotBeyondIt`

> **On AC-1…AC-6 asserting the *context*, not the record.** The issue's third AC is explicit: a test
> that only asserts `new X(...)` throws would still pass if the guard were later replaced by a no-op
> `@Min` annotation. Only a context-level test shows Boot's binder **propagates** the record's
> exception into a startup failure instead of swallowing it and falling back to a default — the half
> the guard's usefulness actually rests on. Each asserts the **root cause and message**, not merely
> `hasFailed()`: any bind or bean-creation error satisfies the weaker assertion. Direct-construction
> tests are kept alongside (AC-8) because they are what reddens *first* when a bound is dropped.

## Non-goals

- **`MoneyPathAlertProperties` thresholds** — `0` is their documented "alert on any" value, not a
  degenerate one (the issue says so; re-verified).
- **`RateLimitProperties.Limit.capacity` / `refillPeriod`** — already guarded: `TokenBucket`'s
  constructor rejects a non-positive capacity and a zero/negative refill period. That fails at first
  request rather than at boot, which is *loud*, not silent, so it is a different defect class from
  this slice's. Moving it to boot time is not in scope (see G-3).
- **An upper bound on `customer.retention.window`** — a long window means the sweep scrubs *less*,
  which is the documented safe direction (the shipped `P10Y` is "deliberately inert" by design). Only
  the short/negative end is a defect.
- **Any change to defaults, to the rate limiter's or the sweep's runtime behaviour, or to the
  ships-disabled retention posture.** This slice adds boot-time rejection of values nobody should set
  and nothing else.
- **Converting other properties to `@Validated`** — see the Architecture note; the classpath makes
  that a no-op.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — the slice adds boot-time rejection to three existing knobs; it retires and replaces no surface.
The one behaviour worth stating explicitly is covered by **AC-7**: every value inside the accepted
range, including all three shipped defaults, binds exactly as it does today.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A guard rejects a value some **deployed** environment already sets, turning a boot into a crash-loop | low | high | The shipped `application.properties` values (`100000` / `500` / `P10Y`) are the only values written anywhere in the repo and all sit mid-range; `max-tracked-keys` carries no `${VAR:…}` placeholder, so it has no env override path at all, and `customer.retention.*` ships disabled. Grep-verified across `platform/src`, `docs/deploy/`, `render.yaml`. | claude | open |
| R-2 | The `batchSize` guard fires on **unset** config, because `CustomerRetentionProperties` takes an `Integer` and null-defaults *inside* the compact constructor | med | high | Order the statements: null-default first, validate second. AC-7 (shipped defaults bind) is what catches an inversion. This is grill finding **G-2**. | claude | open |
| R-3 | A chosen bound is arbitrary, so a future operator hits it with a legitimate value | low | med | Every bound is justified in the record's Javadoc against a mechanism, not a feeling — the ten dimension maps for the key cap, the `@Transactional` sweep + the bind-parameter ceiling for the batch. Ranges are 100×–500× wide (see the bounds table). | claude | open |
| R-4 | Scope creep: the slice's ACs cover the floor, and adding ceilings + a third knob widens it | med | low | Both widenings were escalated to the user via `AskUserQuestion` **before** the plan was committed, and both were approved. Recorded as G-1 / G-5 under Resolved, and to be noted on issue #414 so the ACs and the diff agree. | claude | open |
| R-5 | Module-boundary leak | low | high | None possible: no class is created, moved or renamed across packages; the two edited records stay in the packages that own them. `ModularityTests` is run anyway as part of the structural net. | claude | open |
| R-6 | Flyway version collision | n/a | n/a | No migration in this slice. The only open PRs are ten Dependabot frontend bumps (#332–#341), none of which touch `platform/`. | claude | closed — no migration |

## Open questions / Assumptions

- **Assumption:** `max-tracked-keys` has no deployed override anywhere outside the repo (Render
  dashboard env vars are not in version control). Mitigated by it having no `${VAR:default}`
  placeholder — unlike `riviera.ratelimit.username.*` and `trusted-proxies`, it cannot be overridden
  by an env var under the readable name, only under the relaxed-binding form
  `RIVIERA_RATELIMIT_MAXTRACKEDKEYS`. — *Owner:* claude · *Resolves by:* phase 0 (grep evidence in
  the commit message)

### Resolved

- **G-1 (widening — ceilings):** the issue's ACs guard only the floor, but #408 — which the issue
  names as the model ("Guard both the way #408 did") — guards both ends, and `RegistryMailProperties`'
  Javadoc records that omitting the ceiling was that slice's first-draft mistake ("an absurd value
  fails loudly. It does not."). Both knobs here have a real ceiling twin. → **Escalated via
  `AskUserQuestion`; approved: guard both ends.** 2026-07-29, pre-phase-0.
- **G-2 (implementation trap):** `CustomerRetentionProperties(Period, Integer)` null-defaults inside
  its compact constructor, so a guard written above the defaulting would throw on **unset** config
  and break AC-7. → Guard goes **after** the two defaulting assignments. Carried as R-2.
- **G-3 (not a candidate):** `Limit.capacity` / `refillPeriod` are already rejected by `TokenBucket`'s
  constructor — a loud per-request failure, not a silent degradation. → Out of scope, recorded under
  Non-goals. 2026-07-29.
- **G-4 (intake checks clean):** no Flyway migration; the only in-flight PRs are Dependabot frontend
  bumps; sibling slice **#408 is closed as completed** under epic #367 (5/14 sub-issues done), so the
  previous close-out has no gap; module ownership is unchanged (checked against `RESPONSIBILITIES.md`).
- **G-5 (widening — the third knob):** the grill found `customer.retention.window` in the *same*
  record, missed by the issue's "what does `0` do here?" sweep because it is a `Period`, not a number.
  `P0D` puts the cutoff at today, so the first sweep scrubs every guest contact with no booking on or
  after today — irreversibly (ADR-0010 pseudonymize-in-place), and a negative period is strictly
  worse. → **Escalated via `AskUserQuestion`; approved: guard it here.** 2026-07-29, pre-phase-0.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice writes no `availability(set_id, booking_date)` row and
adds no code path that runs after startup. `RateLimitProperties` governs an in-memory HTTP filter
ahead of MVC dispatch; `CustomerRetentionProperties` governs a sweep over `customer` guest contacts
that never touches `availability`, `booking` state, the beach map, or the #4 cutoff.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | *(root — not a module)* | existing | n/a | `RateLimitProperties` is edge machinery in the composition root `ai.riviera.platform`, alongside `SecurityConfig` / `RateLimitFilter`. Login, session and rate-limit machinery lives at the platform edge, never in a module (RV-BE-11). |
| M-2 | `customer` | existing | `Customer` | `CustomerRetentionProperties` is the retention policy's configuration edge (`customer/adapter/in`), and `customer` owns the retention policy — the configured window, expired-basis selection and the sweep (#101 Slice 2). |

**Cross-module named interfaces (`api/` ports)**

N/A — no port is added, changed or consumed. No `api/`, `spi/`, `vocabulary/` or `events/` surface is
touched, so no `allowedDependencies` grant changes.

**Domain events (id-based payloads, invariant #11)**

N/A — no event is published, consumed, moved or renamed, so no Flyway `event_type` rewrite is needed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Reject a degenerate rate-limit key cap at boot | *root (edge)* | The knob is read only by `RateLimitFilter`, which is root-package edge machinery by RV-BE-11 ("login/session machinery lives at the platform edge, never in modules"). Validating a property belongs with the record that binds it; no module claims rate limiting on its Job line. |
| Reject a degenerate retention window / batch size at boot | `customer` | `customer` Job (`CLAUDE.md` module table): owns "the **retention policy** — configured window, expired-basis selection and the scheduled sweep". The validated record is that policy's own configuration edge, already in `customer/adapter/in`. Not on any other module's list: `booking` supplies only the retention-*basis* fact via `customer.spi.GuestBookingHistory` and, per `RESPONSIBILITIES.md`, "holds no retention policy". |

No class is created, moved or renamed across packages; both edited records stay where they are. The
one new file is a test, placed in its subject's package (`customer.adapter.in`) because the bound
constants it asserts against are package-private.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money is collected, refunded, or accrued; no amount, currency or
commission arithmetic appears in the diff.

## Angular — frontend surfaces touched

N/A — backend-only. No file under `frontend/` is touched, so no e2e spec is due (RV-FE-E2E).

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or error response is added or altered; both guards run at
context startup, before any request is served.

## Execution status

**Stage pointer:** `implement — phase 0 done, entering phase 1`

**Next action:** Phase 1 step 1 — write the failing `CustomerRetentionPropertiesTest`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Rate-limit key-cap bounds | ✅ | `6f1917b` |
| 1 — Retention window + batch-size bounds | | |
| 2 — Shipped-config comments + merge from main | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *(none yet)* | — |

---

## The bounds, and why each number

| Property | Shipped | Accepted range | Floor rationale | Ceiling rationale |
|---|---|---|---|---|
| `riviera.ratelimit.max-tracked-keys` | `100000` | `[1_000, 500_000]` | Below ~1 000 the cap is reached by ordinary traffic (CGNAT / venue-WiFi fan-out on the per-IP dimension, a modest scan on the per-code one), so `buckets.clear()` stops being the flood backstop its Javadoc claims and becomes the steady state — and each new key then *refunds* every other key's spent tokens. That converts a memory bound into a rate-limit bypass. 1 000 buckets is tens of kilobytes; no operator has a reason to go below it. | `RateLimitFilter` holds **ten** dimension maps, each capped independently, so the cap is the only thing bounding ~10 × its value live buckets. At 500 000 that is five million buckets — hundreds of megabytes on the single Render instance (ADR-0004), i.e. the point at which the cap that exists to bound memory is itself the outage. The ceiling also catches the likeliest typo: the shipped value with one extra digit. |
| `customer.retention.batch-size` | `500` | `[1, 10_000]` | `1` is slow but not degenerate — the remainder is picked up by the next run. `0` reaches `LIMIT 0`: the sweep runs forever, logs its normal outcome, and scrubs nothing. | `ExpireGuestContactsService#sweep` is `@Transactional` and does one row-locking `eraseGuestById` per candidate, so the batch **is** the transaction bound its Javadoc promises ("a backlog can never produce an unbounded transaction"). The candidate ids also expand into `JdbcGuestBookingHistory`'s `IN (:guests)` list, which PostgreSQL caps at 65 535 bind parameters — above that the sweep dies inside a scheduled job, not at boot. 10 000 is 20× the shipped value and ≈40 000 contacts/day at the shipped `PT6H` cadence. |
| `customer.retention.window` | `P10Y` | any **positive** `Period` | `P0D` sets the cutoff to today, so the first sweep scrubs every guest contact with no booking on or after today; a negative period puts the cutoff in the *future* and scrubs more still. Both are irreversible (ADR-0010, pseudonymize-in-place) and neither is recoverable by fixing the config afterwards. | None, deliberately — a longer window scrubs *less*, which is the documented safe direction (`P10Y` ships "deliberately inert" by design). Only the short end is a defect. |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/RateLimitProperties.java` — add `MIN_TRACKED_KEY_CAP` /
  `MAX_TRACKED_KEY_CAP` and the compact-constructor guard; extend the `@param maxTrackedKeys` Javadoc.
- `platform/src/test/java/ai/riviera/platform/RateLimitPropertiesBindingTest.java` — add the
  context-level and direct-construction guard tests; widen the class Javadoc, which today scopes
  itself to the #286 client-IP config.
- `platform/src/main/java/ai/riviera/platform/customer/adapter/in/CustomerRetentionProperties.java` —
  add `MAX_BATCH_SIZE` and the compact-constructor guards for both `window` and `batchSize`, *below*
  the null-defaulting (R-2); extend the record Javadoc.
- `platform/src/test/java/ai/riviera/platform/customer/adapter/in/CustomerRetentionPropertiesTest.java`
  — **new**, mirroring `RegistryMailPropertiesTest`.
- `platform/src/main/resources/application.properties` — extend the three shipped comments with the
  accepted range and the one-line reason, so the operator reading the file sees the bound.
- `docs/runbooks/data-erasure.md` — the **Knobs** table (§Automated retention sweep) is the
  operator-facing home of `window` / `batch-size`, and its enabling procedure says "set
  `customer.retention.window` to that value and deploy". An operator following it could pick a value
  the boot now rejects, so the table gains the accepted range. Found by the R-1 grep, not by the issue.
- `docs/plans/config-knob-boot-guards.md` — this plan.

> **Test-class placement, and why it is asymmetric.** #408's prior art is a dedicated
> `<X>PropertiesTest`. `customer` follows it exactly (a new `CustomerRetentionPropertiesTest`), because
> the only existing home — `GuestContactRetentionSchedulerConfigTest` — is a *scheduler* spec that
> merely happens to assert two defaults. The root package does **not** get a second class:
> `RateLimitPropertiesBindingTest` is already the binding spec for this exact record, built on the same
> `ApplicationContextRunner` + `ConfigDataApplicationContextInitializer` harness, and a
> `RateLimitPropertiesTest` beside a `RateLimitPropertiesBindingTest` would be two confusingly-named
> classes for one record.

---

## Phase 0 — Rate-limit key-cap bounds

**Files:** Modify `platform/src/main/java/ai/riviera/platform/RateLimitProperties.java` ·
Test `platform/src/test/java/ai/riviera/platform/RateLimitPropertiesBindingTest.java`

- [ ] **Step 1: Write the failing test** — appended to `RateLimitPropertiesBindingTest`, with
  `assertThatIllegalArgumentException` added to the static imports.

```java
	@Test
	void bindsTheShippedKeyCapDefault() {
		runner.run(context -> assertThat(context.getBean(RateLimitProperties.class).maxTrackedKeys())
				.as("unset config must reproduce today's behaviour exactly")
				.isEqualTo(100_000));
	}

	@Test
	void aNonPositiveKeyCapFailsTheContext() {
		runner.withPropertyValues("riviera.ratelimit.max-tracked-keys=0")
				.run(context -> assertThat(context)
						.as("size() >= 0 is true for every new key, so each one would clear every "
								+ "other key's spent tokens — a limiter that boots clean and throttles nobody")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("max-tracked-keys"));
	}

	@Test
	void aKeyCapBelowTheFloorFailsTheContext() {
		runner.withPropertyValues("riviera.ratelimit.max-tracked-keys=2")
				.run(context -> assertThat(context)
						.as("a small-but-positive cap degrades the same way, just less completely")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("max-tracked-keys"));
	}

	@Test
	void anOversizedKeyCapFailsTheContext() {
		runner.withPropertyValues("riviera.ratelimit.max-tracked-keys=1000000")
				.run(context -> assertThat(context)
						.as("the shipped value with one extra digit restores the unbounded growth the "
								+ "cap exists to prevent, across ten dimension maps")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("max-tracked-keys"));
	}

	@Test
	void acceptsTheWholeKeyCapTuningRangeButNotBeyondIt() {
		assertThat(keyCap(RateLimitProperties.MIN_TRACKED_KEY_CAP))
				.as("the bounds bound the typo, not the operator — both ends are reachable")
				.isEqualTo(RateLimitProperties.MIN_TRACKED_KEY_CAP);
		assertThat(keyCap(RateLimitProperties.MAX_TRACKED_KEY_CAP))
				.isEqualTo(RateLimitProperties.MAX_TRACKED_KEY_CAP);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> keyCap(RateLimitProperties.MIN_TRACKED_KEY_CAP - 1));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> keyCap(RateLimitProperties.MAX_TRACKED_KEY_CAP + 1));
		assertThatIllegalArgumentException().isThrownBy(() -> keyCap(-1));
	}

	/** Constructs the record directly around the one knob under test, so the bound is asserted, not the binder. */
	private static int keyCap(int maxTrackedKeys) {
		RateLimitProperties.Limit limit = new RateLimitProperties.Limit(60, Duration.ofMinutes(1));
		return new RateLimitProperties(true, limit, limit, limit, limit, maxTrackedKeys, List.of(), "")
				.maxTrackedKeys();
	}
```

- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*RateLimitPropertiesBindingTest*"`
  → FAIL: the three context tests report `Expecting context to have failed but it started`, and
  `acceptsTheWholeKeyCapTuningRangeButNotBeyondIt` fails to compile until the constants exist.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation** — in `RateLimitProperties`, below the record header:

```java
	/**
	 * Below this the cap stops being a flood backstop and becomes the steady state: ordinary traffic —
	 * CGNAT / venue-WiFi fan-out on the per-IP dimension, a modest scan on the per-code one — reaches it,
	 * and every new key then {@code clear()}s the map, handing back every OTHER key's spent tokens. That
	 * turns a memory bound into a rate-limit bypass, which is why the floor is not {@code 1}.
	 */
	static final int MIN_TRACKED_KEY_CAP = 1_000;

	/**
	 * 5× the shipped 100 000. This filter holds TEN dimension maps, each capped independently, so the
	 * ceiling admits ~5 000 000 live buckets — hundreds of megabytes on the single Render instance
	 * (ADR-0004), i.e. the point where the cap that exists to bound memory is itself the outage. It also
	 * catches the likeliest typo: the shipped value with one extra digit.
	 */
	static final int MAX_TRACKED_KEY_CAP = 500_000;

	RateLimitProperties {
		if (maxTrackedKeys < MIN_TRACKED_KEY_CAP || maxTrackedKeys > MAX_TRACKED_KEY_CAP) {
			throw new IllegalArgumentException(
					"riviera.ratelimit.max-tracked-keys must be between " + MIN_TRACKED_KEY_CAP + " and "
							+ MAX_TRACKED_KEY_CAP + ", but was " + maxTrackedKeys
							+ "; the map-bounding check is size() >= cap, so a non-positive cap fires on "
							+ "every new key and clears every other key's spent tokens — the limiter boots "
							+ "clean and throttles nobody — while an oversized one restores the unbounded "
							+ "growth the cap exists to prevent, across ten dimension maps");
		}
	}
```

The `@param maxTrackedKeys` Javadoc line gains the accepted range and a pointer to the two constants.

- [ ] **Step 4: Run it, verify it passes** — `gradle test --tests "*RateLimitPropertiesBindingTest*"` → PASS

> Scope (end-of-phase regression): broaden to the touched area —
> `gradle test --tests "*RateLimit*" --tests "*TokenBucket*"`.

- [ ] **Step 5: Generalization-audit pass** — search every other bound numeric/`Period` property for
  the same "what does a degenerate value do here?" question. Append to the log below.

- [ ] **Step 6: Commit** — `git commit -m "fix(#414): reject a degenerate rate-limit key cap at boot (#414)"`

- [ ] **Step 7: Push and open the DRAFT PR immediately** — CI fires on `pull_request` only (#417), so
  a branch with no PR gets no CI at all. Then update this Execution status in the same commit window.

---

## Phase 1 — Retention window + batch-size bounds

**Files:** Modify
`platform/src/main/java/ai/riviera/platform/customer/adapter/in/CustomerRetentionProperties.java` ·
Create `platform/src/test/java/ai/riviera/platform/customer/adapter/in/CustomerRetentionPropertiesTest.java`

- [ ] **Step 1: Write the failing test** — the new class, mirroring `RegistryMailPropertiesTest`.

```java
package ai.riviera.platform.customer.adapter.in;

import java.time.Period;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The retention sweep's two bounds as <em>bound, validated</em> configuration (#414).
 *
 * <p>Both degenerate values boot cleanly and are invisible. {@code batch-size=0} reaches
 * {@code LIMIT 0}: the scheduled sweep runs forever, logs its normal "swept 0" outcome, and scrubs
 * nothing — most likely discovered only after enabling retention in production, i.e. exactly when the
 * GDPR obligation it implements has started counting. {@code window=P0D} is worse in the other
 * direction: it puts the cutoff at today, so the FIRST sweep scrubs every guest contact with no
 * booking on or after today, irreversibly (ADR-0010, pseudonymize-in-place).
 *
 * <p><strong>Why a compact constructor and not {@code @Validated} + {@code @Min}.</strong> There is no
 * JSR-303 implementation on the runtime classpath — #97 declined {@code spring-boot-starter-validation}
 * deliberately, in favour of explicit checks in records — and Boot only validates
 * {@code @ConfigurationProperties} when an implementation is present. An annotation here would bind and
 * validate <em>nothing</em>: the same silent degradation, arrived at from the other side.
 *
 * <p>The context-level tests earn their place alongside the direct-construction ones because only they
 * show that Boot's binder <em>propagates</em> the record's exception into a startup failure rather than
 * swallowing it and falling back to a default. Each asserts the root cause and message, not merely
 * {@code hasFailed()}: any bind or bean-creation error satisfies the weaker assertion.
 */
class CustomerRetentionPropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(CustomerRetentionProperties.class)
	static class BindOnly {
	}

	@Test
	void bindsTheShippedDefaults() {
		runner.run(context -> {
			CustomerRetentionProperties props = context.getBean(CustomerRetentionProperties.class);

			assertThat(props.window())
					.as("unset config must reproduce today's deliberately inert window exactly")
					.isEqualTo(Period.ofYears(10));
			assertThat(props.batchSize()).isEqualTo(500);
		});
	}

	@Test
	void aNonPositiveBatchSizeFailsTheContext() {
		runner.withPropertyValues("customer.retention.batch-size=0")
				.run(context -> assertThat(context)
						.as("LIMIT 0 sweeps forever and scrubs nothing, logging its normal outcome")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("batch-size"));
	}

	@Test
	void anOversizedBatchSizeFailsTheContext() {
		runner.withPropertyValues("customer.retention.batch-size=100000")
				.run(context -> assertThat(context)
						.as("the batch IS the transaction bound; it also expands into an IN (:guests) list "
								+ "PostgreSQL caps at 65535 bind parameters")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("batch-size"));
	}

	@Test
	void aNonPositiveWindowFailsTheContext() {
		runner.withPropertyValues("customer.retention.window=P0D")
				.run(context -> assertThat(context)
						.as("a zero window puts the cutoff at today, so the first sweep scrubs every guest "
								+ "contact with no booking on or after today — irreversibly")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("window"));
	}

	@Test
	void aNegativeWindowFailsTheContext() {
		runner.withPropertyValues("customer.retention.window=P-1Y")
				.run(context -> assertThat(context)
						.as("a negative window puts the cutoff in the FUTURE and scrubs more still")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("window"));
	}

	@Test
	void acceptsTheWholeBatchTuningRangeButNotBeyondIt() {
		assertThat(new CustomerRetentionProperties(Period.ofYears(2), 1).batchSize())
				.as("the bounds bound the typo, not the operator — both ends are reachable")
				.isEqualTo(1);
		assertThat(new CustomerRetentionProperties(Period.ofDays(1),
				CustomerRetentionProperties.MAX_BATCH_SIZE).batchSize())
				.isEqualTo(CustomerRetentionProperties.MAX_BATCH_SIZE);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> new CustomerRetentionProperties(Period.ofYears(2), 0))
				.withMessageContaining("batch-size");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new CustomerRetentionProperties(Period.ofYears(2), -1));
		assertThatIllegalArgumentException().isThrownBy(() -> new CustomerRetentionProperties(
				Period.ofYears(2), CustomerRetentionProperties.MAX_BATCH_SIZE + 1));
	}

	@Test
	void rejectsANonPositiveWindow() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new CustomerRetentionProperties(Period.ZERO, 500))
				.withMessageContaining("window");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new CustomerRetentionProperties(Period.ofYears(-1), 500));
	}

	/** Unset config is null on BOTH components — the guards must run AFTER the defaulting, never before. */
	@Test
	void unsetComponentsStillDefaultRatherThanFailingTheGuard() {
		assertThat(new CustomerRetentionProperties(null, null))
				.isEqualTo(new CustomerRetentionProperties(Period.ofYears(10), 500));
	}
}
```

- [ ] **Step 2: Run it, verify it fails** —
  `gradle test --tests "*CustomerRetentionPropertiesTest*"` → FAIL: the five context tests report
  `Expecting context to have failed but it started`, and the range tests fail to compile until
  `MAX_BATCH_SIZE` exists.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation** — in `CustomerRetentionProperties`:

```java
	/**
	 * 20× the shipped 500 — ≈40 000 contacts/day at the shipped {@code PT6H} cadence, and comfortably
	 * under PostgreSQL's 65 535 bind-parameter ceiling on the candidate {@code IN (:guests)} list.
	 * {@code ExpireGuestContactsService#sweep} is {@code @Transactional} and locks one row per candidate,
	 * so the batch IS the transaction bound this record promises; past this it stops being one.
	 */
	static final int MAX_BATCH_SIZE = 10_000;

	public CustomerRetentionProperties {
		window = window == null ? DEFAULT_WINDOW : window;
		batchSize = batchSize == null ? DEFAULT_BATCH_SIZE : batchSize;
		if (window.isZero() || window.isNegative()) {
			throw new IllegalArgumentException(
					"customer.retention.window must be a positive Period, but was " + window
							+ "; a zero window puts the cutoff at today and a negative one puts it in the "
							+ "future, so the first sweep scrubs every guest contact with no booking on or "
							+ "after that date — irreversibly (ADR-0010), and no later config fix undoes it");
		}
		if (batchSize <= 0 || batchSize > MAX_BATCH_SIZE) {
			throw new IllegalArgumentException(
					"customer.retention.batch-size must be between 1 and " + MAX_BATCH_SIZE + ", but was "
							+ batchSize + "; a non-positive size reaches LIMIT 0, so the sweep runs forever, "
							+ "logs its normal outcome and scrubs nothing, while an oversized one is the "
							+ "unbounded transaction this bound exists to prevent");
		}
	}
```

The guards sit **below** the two defaulting assignments (R-2 / G-2) so unset config still defaults.
The record Javadoc gains a paragraph on both bounds and the no-JSR-303 reason.

- [ ] **Step 4: Run it, verify it passes** — `gradle test --tests "*CustomerRetentionPropertiesTest*"` → PASS

> Scope (end-of-phase regression): broaden to the touched module —
> `gradle test --tests "*customer*" --tests "*Retention*"`.

- [ ] **Step 5: Generalization-audit pass** — re-run the audit over `Period`/`Duration` properties
  specifically, the class the issue's numeric sweep structurally missed. Append to the log below.

- [ ] **Step 6: Commit** — `git commit -m "fix(#414): reject a degenerate retention window and batch size at boot (#414)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Shipped-config comments, operator runbook, structural net, merge from main

**Files:** Modify `platform/src/main/resources/application.properties` ·
`docs/runbooks/data-erasure.md` · this plan doc

- [ ] **Step 1:** Extend the three shipped comments with the accepted range and its one-line reason, so
  an operator editing the file sees the bound before the boot does. Add an **Accepted range** column to
  the `data-erasure.md` Knobs table, since its enabling procedure hands the operator a window value to
  set and deploy.
- [ ] **Step 2:** Run the structural net —
  `gradle test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"`
  → PASS. (No structure changed; this is the standing check after any backend change.)
- [ ] **Step 3:** Merge the latest `origin/main` into the branch with full phase discipline, then mark
  the PR **ready for review** — that is what makes the Review and Sonar gates due.
- [ ] **Step 4:** Note the two approved widenings (G-1, G-5) on issue #414 so its ACs and the diff agree.
- [ ] **Step 5:** Commit the finalized Execution status **in this PR**, citing `merged via PR #NN` —
  never a merge SHA, which cannot exist before the merge.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-29 | plan (intake grill, inherited from #408's phase-0 audit) | bound numeric `@ConfigurationProperties` whose degenerate value degrades silently | read the use site of every `@DefaultValue`-bearing numeric knob | `max-tracked-keys`, `retention.batch-size` (defects); `MoneyPathAlert` thresholds (`0` is documented "alert on any"); `Limit.capacity`/`refillPeriod` (already guarded by `TokenBucket`, and loudly) | fix the two; record the other two under Non-goals with the reason |
| 2026-07-29 | phase 0 | the same question asked of **`Duration`/`Period`** knobs — the shape the issue's numeric sweep structurally missed, which is how G-5 (`retention.window`) was found in the first place | `grep -rln "@ConfigurationProperties" --include=*.java platform/src/main`, then read every record's components and null-defaulting | **Four more families, same defect class, none guarded:** `AbandonedPaymentProperties.ttl` (`PT0S` → every `AWAITING_PAYMENT` booking is swept as abandoned the moment it is created, on the money path); `RequestProperties.expiryWindow`/`payWindow` (`PT0S` → every Request-mode booking expires immediately, #98); `StripeProperties.connectTimeout`/`readTimeout` (the classic footgun — `0` reads as "no timeout" to a human and means *wait forever* to most HTTP clients, re-opening the pinned-thread risk #52 R-3 closed); `RecoveryProperties` token TTLs (`PT0S` → every verification/reset token is born expired, S8 recovery silently dead) | **Not fixed here — follow-up issue.** Three unrequested widenings on one slice is the "while I'm here" the Non-goals section exists to stop, and each of these needs its own use-site reading to pick a defensible bound (a *ceiling* on a Stripe timeout is a different argument from a ceiling on a key cap). Filed as a sibling of #414 under epic #367 at close-out; this row is the evidence trail |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `gradle test --tests "*RateLimitPropertiesBindingTest*"` → `aNonPositiveKeyCapFailsTheContext` PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** Same run → `aKeyCapBelowTheFloorFailsTheContext` PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** Same run → `anOversizedKeyCapFailsTheContext` PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `gradle test --tests "*CustomerRetentionPropertiesTest*"` → `aNonPositiveBatchSizeFailsTheContext` PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** Same run → `anOversizedBatchSizeFailsTheContext` PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** Same run → `aNonPositiveWindowFailsTheContext` + `aNegativeWindowFailsTheContext` PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** Both runs → `bindsTheShippedKeyCapDefault` + `bindsTheShippedDefaults` PASS, and the pre-existing `GuestContactRetentionSchedulerConfigTest` stays green. Verified at commit `<sha>`.
- [ ] **AC-8:** Both runs → `acceptsTheWholeKeyCapTuningRangeButNotBeyondIt` + `acceptsTheWholeBatchTuningRangeButNotBeyondIt` PASS. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified N/A — no availability write path in the diff).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module imports added; no class moved (invariant #11).
- [ ] **Payment/payout** section N/A — no money in the diff.
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — the sweep's `Europe/Tirane` cutoff arithmetic is unchanged; only the *window* it subtracts is now range-checked.
- [ ] Booking codes unguessable (invariant #7) — untouched; no code, email or PII enters a log or an exception message (the messages carry only the offending number/period).
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards — N/A, backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — this doc's final state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
