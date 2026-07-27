# Hashed email-suppression key (peppered HMAC + cleartext domain) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** `email_suppression` stores no cleartext address — the key is a peppered
HMAC-SHA-256 of the normalized address, version-tagged `v1:`, plus a cleartext `domain`
column — with the port contract (raw addresses in, never-deleted, upsert semantics)
byte-for-byte unchanged, and boot failing in `prod` when the pepper secret is missing.

**Architecture:** ADR-0012 implementation. Normalization + hashing stay in the ONE
`adapter/out` (`JdbcEmailSuppressions`) so the future #370 bounce feed inherits them for
free; the pepper is an env-managed secret with a committed non-prod default plus a
`@Profile("prod")` guard bean (the `MockMailerProdGuard` pattern) that rejects a missing
or defaulted pepper — chosen over a strict blank-throws because every `@SpringBootTest`
in the suite boots this adapter off the main `application.properties` (there is no
test-scoped properties file). The stored key carries an explicit `v1:` scheme tag
(issue #388 addendum) — the `DelegatingPasswordEncoder`-style migration hook, as a value
prefix rather than a second column (one column, UNIQUE semantics unchanged).

**Persistence:** JDBC only (invariant #1). Migration **V33** drops and recreates
`email_suppression` (the table is empty in every environment — only tests write it,
per #382/#385): `email` → `email_key` (`v1:` + 64 lower-hex, `UNIQUE`), new cleartext
`domain`, `reason`/timestamps unchanged.

**Source of intent:** GitHub issue #388 (+ its version-tag addendum comment),
ADR-0012 (`docs/adr/ADR-0012-email-suppression-hashed-key.md`), decision issue #387.

**Skills consulted:** `postgres` (drop/recreate over ALTER for an empty table; format-pinning
CHECK `^v1:[0-9a-f]{64}$` on the key + the V32-mirroring normalization CHECK on `domain`;
UNIQUE doubles as the lookup index), `riviera-modulith` (everything stays module-internal —
no new published surface, no `allowedDependencies` change; guard bean lives in `adapter/out`
beside its adapter, the `MockMailerProdGuard` precedent), `riviera-java-conventions`
(package-private adapter + constructor injection; named constants for the scheme prefix and
HMAC algorithm; specific exception catches around `Mac`; no secrets in logs),
`riviera-local-debug` (to be loaded before the first gradle invocation — scoped tests only).

**Branch:** `claude/sdlc-388-plcfi0` — the session's designated remote branch stands in
for `feature/email-suppression-hashed-key` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a suppression written via `suppress("Foo@Bar.com ", HARD_BOUNCE, t)`,
  when the stored row is read raw, then `email_key` equals `v1:` + lower-hex
  HMAC-SHA-256(pepper, `"foo@bar.com"`), `domain` equals `bar.com`, and no column contains
  the cleartext local part. *Pinned by:* `EmailSuppressionIT.storedRowIsHashedKeyPlusCleartextDomain`
- [ ] **AC-2:** Given `suppress("  Case-Mixed@Example.COM ", …)`, when `isSuppressed` is
  asked with any casing/whitespace variant of the same address, then it returns `true`
  (normalization-before-hash on both read and write). *Pinned by:*
  `EmailSuppressionIT.aSuppressedAddressIsFoundInAnyCasing` (existing, must stay green unchanged)
- [ ] **AC-3:** Given the `prod` profile with the pepper property unset (or left at the
  committed dev default), when the context starts, then boot fails with
  `IllegalStateException`; given `prod` + a real pepper, or the default profile, boot
  succeeds. *Pinned by:* `SuppressionPepperProdGuardTest`
- [ ] **AC-4:** Given an address suppressed twice, when the row is read, then `reason` and
  `last_event_at` reflect the second call and `first_suppressed_at` the first (upsert
  semantics unchanged, now keyed on `email_key`). *Pinned by:*
  `EmailSuppressionIT.reSuppressingUpsertsReasonAndLastEventKeepingFirstSuppressedAt`
- [ ] **AC-5:** Given two adapters configured with different peppers, when each computes the
  key for the same address, then the stored keys differ (the pepper participates in the
  digest). *Pinned by:* `EmailSuppressionIT.aDifferentPepperYieldsADifferentKey`
- [ ] **AC-6:** Given the full structural net (`ModularityTests`,
  `PackageShapeArchitectureTests`, `JdbcOnlyArchitectureTests`,
  `PublishedSurfacePlacementArchitectureTests`), when it runs, then it is green with no new
  published surface — `EmailSuppressions` stays application-internal. *Pinned by:* the
  existing structural test classes, re-run scoped.

## Non-goals

- The #370 bounce/complaint `adapter/in` feed itself (epic #367 story 10).
- Pepper rotation machinery — rotating orphans every row, accepted in ADR-0012; the `v1:`
  tag is the *hook* for a future dual-scheme migration, not an implementation of one.
- Any retention cap on hashed entries (considered and declined in ADR-0012).
- Privacy-policy / processor-register wording (tracked under #101).
- Touching V32 (immutable, invariant #12) — the correction lives in V33's header + ADR-0012.

## Behavior-parity ledger (retirement / replacement slices only)

> This slice replaces the V32 storage shape and rewrites the adapter's read/write paths —
> the port's observable behavior must survive verbatim.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Callers pass raw addresses; adapter normalizes (trim + lower-case) on read AND write | preserved | same `normalize()` in the same adapter, applied before hashing on both paths |
| Repeat suppression refreshes `reason` + `last_event_at`, keeps `first_suppressed_at` | preserved | identical `ON CONFLICT … DO UPDATE`, conflict target now `email_key` |
| Rows never deleted (durable deliverability record) | preserved | contract untouched; ADR-0012 makes survive-erasure explicit |
| A set of `@SpringBootTest` contexts boot the adapter with zero config | preserved | committed non-prod pepper default in `application.properties` |
| Cleartext address stored; DB CHECK pins normalization on `email` | **changed** | ADR-0012: peppered-HMAC `email_key` (CHECK pins the `v1:` + hex format); normalization CHECK moves to the new cleartext `domain` column |
| Ops can grep the list by raw address | **dropped** (ADR-0012 consequence) | replaced by the normalize-and-hash recipe in the new `docs/runbooks/suppression-list-ops.md`; domain-level triage survives via `domain` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | V33 number collision with a parallel slice | low | high | verified free at plan time (latest on `main` is V32; only Dependabot FE PRs open). If a parallel claim appears, whoever merges second renumbers | session | open |
| R-2 | A strict "throw when pepper blank" breaks every `@SpringBootTest` (they boot on main `application.properties`; no test-scoped file exists) | high (if strict) | high | committed non-prod default `dev-only-suppression-pepper` + `@Profile("prod")` guard rejecting blank/default — prod stays fail-at-boot, tests/dev boot untouched | session | open |
| R-3 | The deployed env runs the `prod` profile → next deploy after merge **fails at boot** until `RIVIERA_SUPPRESSION_PEPPER` is set on Render | high | med (deliberate, by design) | ops step documented in `docs/deploy/cd-pipeline.md` env list + runbook + called out in the PR body; env var must be set before merging | maintainer | open |
| R-4 | Guard's dev-default constant drifts from the `application.properties` literal | low | med | both sites carry a lockstep comment (§6a pattern); `SuppressionPepperProdGuardTest` pins the guard side | session | open |
| R-5 | Writer/reader hash mismatch (casing, charset, hex case) silently breaks lookups | low | high | ONE `keyOf(normalize(…))` helper used by both paths; `HexFormat` lower-hex; DB CHECK `^v1:[0-9a-f]{64}$` rejects any malformed key; AC-2 pins round-trip | session | open |
| R-6 | Raw address leaks into logs on the suppression path (ADR-0012 forbids) | low | med | no logging added in the adapter; existing chokepoint logs already omit the address (kept) | session | open |

## Open questions / Assumptions

- **Assumption:** the deployed Render service runs `prod` (per `docs/deploy/cd-pipeline.md`:
  "production runs `prod,mailer`"), so R-3's ops step is real and deploy-blocking — flagged
  to the maintainer in the PR body. — *Owner:* maintainer · *Resolves by:* merge
- **Assumption:** a `suppress()` input with no `@` (defensive case; today only tests and the
  future provider feed call it) stores `domain = ''` rather than throwing — keeps the send
  path's never-throw posture; the value is a non-address either way. — *Owner:* session ·
  *Resolves by:* phase 1 (documented in the adapter javadoc)

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice touches only the `notification` module's
`email_suppression` table; no booking, beach-map, or `availability(set_id, booking_date)`
path is in scope. (Concurrency on this table itself is the existing atomic
`INSERT … ON CONFLICT DO UPDATE` upsert, unchanged.)

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | (none — owns `email_suppression` state, no aggregate) | RESPONSIBILITIES.md: the module owns the email-suppression list and the send chokepoint |

**Cross-module named interfaces (`api/` ports):** none added or changed. `EmailSuppressions`
stays an unpublished application-internal port implemented by the module's own
`adapter/out` (riviera-modulith api-vs-spi rule: own adapter implements → internal).
`allowedDependencies` untouched.

**Domain events:** none — the suppression write is a synchronous internal call; no event
is published or consumed by this slice.

### Module ownership (§4a)

All in `notification`, no boundary change: hashing/normalization are properties of the
suppression *storage*, which `RESPONSIBILITIES.md` assigns to `notification` ("the module's
first owned state: the email-suppression list"); no other module's Job/Not-My-Job mentions
suppression. The pepper is module-local config (a storage detail), not edge machinery —
RV-BE-11 unaffected.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change (no HTTP surface touches suppression).

## Execution status

> **Session-recovery anchor.** Re-read this section (plus the current riviera-sdlc stage
> reference) after any compaction or in a fresh session, before acting.

**Stage pointer:** review gate run (degraded mode: `/review` + overlay; `/code-review` is
model-invocation-disabled in this session) → awaiting CI + Sonar gate on PR #392

**Next action:** when CI completes on PR #392, run the Sonar gate per
`references/pr-gates.md` §2 (pull the actual issue + measures lists, cache-busted), then
finalize the plan doc in the PR's last commit and merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | 5743576 |
| 1 — V33 migration + HMAC adapter + IT (TDD) | ✅ | 106fd48 |
| 2 — pepper prod guard + guard test | ✅ | 1cd4b0f |
| 3 — docs (RESPONSIBILITIES, CLAUDE.md row, runbook, cd-pipeline) + close-out | ✅ | (this commit; close-out finalization lands with the PR's last commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (RV-BE-17, invariant #12) | the `email_key` format CHECK was only exercised by valid writes — no test proved the schema *rejects* a cleartext key | fixed — `EmailSuppressionIT.theSchemaRejectsACleartextKey` |
| F-2 | review (observation) | an address with internal whitespace would fail the `domain` CHECK loudly at write time | no action — visible failure on malformed feed input is acceptable; #370's territory |

---

## File structure

- `platform/src/main/resources/db/migration/V33__email_suppression_hashed_key.sql` — new: drop/recreate with `email_key` + `domain`; header corrects V32's cleartext posture (cites ADR-0012)
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/JdbcEmailSuppressions.java` — modify: normalize → HMAC(pepper) → `v1:` hex key on both paths; extract `domain` on write; pepper via constructor
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SuppressionPepperProdGuard.java` — new: `@Profile("prod")` fail-at-boot when pepper blank/dev-default
- `platform/src/main/java/ai/riviera/platform/notification/application/EmailSuppressions.java` — javadoc: stored state now non-PII (contract unchanged)
- `platform/src/main/java/ai/riviera/platform/notification/package-info.java` — javadoc touch: suppression list is hashed/non-PII (ADR-0012)
- `platform/src/main/resources/application.properties` — `riviera.notification.suppression-pepper=${RIVIERA_SUPPRESSION_PEPPER:dev-only-suppression-pepper}`
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/EmailSuppressionIT.java` — modify: raw-row asserts move to `email_key`; new AC-1/AC-5 tests
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/SuppressionPepperProdGuardTest.java` — new: `ApplicationContextRunner`, sibling of `MockMailerProdGuardTest`
- `RESPONSIBILITIES.md` — notification Job: list is hashed/non-PII (V33, ADR-0012)
- `CLAUDE.md` — module-table notification row: same touch-up
- `docs/runbooks/suppression-list-ops.md` — new: check-an-address recipe (normalize + `openssl dgst -hmac`), domain triage, pepper posture
- `docs/deploy/cd-pipeline.md` — env list: `RIVIERA_SUPPRESSION_PEPPER` (deploy-blocking under `prod`)
- `docs/plans/email-suppression-hashed-key.md` — this plan

---

## Phase 1 — V33 migration + HMAC adapter + IT (TDD)

**Files:** Create `V33__email_suppression_hashed_key.sql` · Modify `JdbcEmailSuppressions.java`,
`EmailSuppressionIT.java`, `application.properties`, `EmailSuppressions.java` (javadoc),
`package-info.java` (javadoc)

- [ ] **Step 1: Write the failing tests** — extend `EmailSuppressionIT` with AC-1 and AC-5
  and repoint the AC-4 raw-row query at `email_key`:

```java
@Autowired
Environment env;

private String pepper() {
	return env.getRequiredProperty("riviera.notification.suppression-pepper");
}

private static String expectedKey(String pepper, String normalized) {
	try {
		Mac mac = Mac.getInstance("HmacSHA256");
		mac.init(new SecretKeySpec(pepper.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
		return "v1:" + HexFormat.of().formatHex(mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8)));
	} catch (NoSuchAlgorithmException | InvalidKeyException e) {
		throw new IllegalStateException(e);
	}
}

@Test
void storedRowIsHashedKeyPlusCleartextDomain() {
	suppressions.suppress("  Hashed-Row@Example.COM ", SuppressionReason.MANUAL,
			Instant.parse("2026-07-27T10:00:00Z"));

	var row = jdbc.sql("SELECT email_key, domain FROM email_suppression WHERE email_key = :key")
			.param("key", expectedKey(pepper(), "hashed-row@example.com"))
			.query((rs, n) -> new String[] { rs.getString("email_key"), rs.getString("domain") })
			.single();
	assertThat(row[0]).isEqualTo(expectedKey(pepper(), "hashed-row@example.com"));
	assertThat(row[1]).isEqualTo("example.com");
	Long cleartextHits = jdbc.sql(
			"SELECT count(*) FROM email_suppression WHERE email_key LIKE '%hashed-row%' OR domain LIKE '%hashed-row%'")
			.query(Long.class).single();
	assertThat(cleartextHits).isZero();
}

@Test
void aDifferentPepperYieldsADifferentKey() {
	var otherPepper = new JdbcEmailSuppressions(jdbc, "a-completely-different-pepper");
	otherPepper.suppress("pepper-proof@example.com", SuppressionReason.HARD_BOUNCE,
			Instant.parse("2026-07-27T10:00:00Z"));

	assertThat(suppressions.isSuppressed("pepper-proof@example.com")).isFalse();
	assertThat(otherPepper.isSuppressed("pepper-proof@example.com")).isTrue();
}
```

  (AC-4's raw-row `WHERE email = :email` becomes `WHERE email_key = :key` with
  `expectedKey(pepper(), email)`.)

- [ ] **Step 2: Run, verify red** —
  `./gradlew test --tests "*EmailSuppressionIT*"` → FAIL (no `email_key` column / no
  two-arg adapter constructor).

- [ ] **Step 3: Minimal implementation** — V33:

```sql
-- Issue #388, ADR-0012: the suppression key is a peppered HMAC, never the address.
-- Supersedes V32's cleartext `email` column (that file is immutable; its line-12 claim of a
-- cleartext durable record is corrected HERE): the list survives right-to-erasure under
-- Art. 6(1)(f), so it must hold no cleartext PII. The table is empty in every environment
-- (only tests write it until the #370 bounce feed lands), so drop/recreate needs no data step.
--
-- email_key = 'v1:' || lower-hex HMAC-SHA-256(pepper, normalized address) — the 'v1:' scheme
-- tag is the future-migration hook (#388 addendum); the CHECK pins the exact format so a
-- hand-inserted cleartext address (or an unhashed feed write) can never satisfy the schema.
-- UNIQUE doubles as the lookup index (V32 pattern). domain is the cleartext part after '@'
-- (a bare domain is not PII — ADR-0012), CHECK-normalized exactly as V32 normalized email.

DROP TABLE email_suppression;

CREATE TABLE email_suppression
(
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_key           TEXT NOT NULL CHECK (email_key ~ '^v1:[0-9a-f]{64}$'),
  domain              TEXT NOT NULL CHECK (domain = lower(btrim(domain))),
  reason              TEXT NOT NULL CHECK (reason IN ('HARD_BOUNCE', 'COMPLAINT', 'MANUAL')),
  first_suppressed_at TIMESTAMPTZ NOT NULL,
  last_event_at       TIMESTAMPTZ NOT NULL,
  CONSTRAINT email_suppression_email_key_uq UNIQUE (email_key)
);
```

  Adapter (constructor + both paths; javadoc updated to the hashed contract):

```java
@Component
class JdbcEmailSuppressions implements EmailSuppressions {

	private static final String KEY_SCHEME_PREFIX = "v1:";
	private static final String HMAC_ALGORITHM = "HmacSHA256";

	private final JdbcClient jdbc;
	private final SecretKeySpec pepperKey;

	JdbcEmailSuppressions(JdbcClient jdbc,
			@Value("${riviera.notification.suppression-pepper}") String pepper) {
		if (pepper.isBlank()) {
			throw new IllegalStateException(
					"riviera.notification.suppression-pepper must not be blank (RIVIERA_SUPPRESSION_PEPPER)");
		}
		this.jdbc = jdbc;
		this.pepperKey = new SecretKeySpec(pepper.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
	}

	@Override
	public boolean isSuppressed(String email) {
		return jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM email_suppression WHERE email_key = :key)
				""")
				.param("key", keyOf(normalize(email)))
				.query(Boolean.class)
				.single();
	}

	@Override
	public void suppress(String email, SuppressionReason reason, Instant at) {
		String normalized = normalize(email);
		jdbc.sql("""
				INSERT INTO email_suppression (email_key, domain, reason, first_suppressed_at, last_event_at)
				VALUES (:key, :domain, :reason, :at, :at)
				ON CONFLICT (email_key) DO UPDATE
				SET reason = EXCLUDED.reason, last_event_at = EXCLUDED.last_event_at
				""")
				.param("key", keyOf(normalized))
				.param("domain", domainOf(normalized))
				.param("reason", reason.name())
				.param("at", java.sql.Timestamp.from(at))
				.update();
	}

	private String keyOf(String normalized) {
		try {
			Mac mac = Mac.getInstance(HMAC_ALGORITHM);
			mac.init(pepperKey);
			return KEY_SCHEME_PREFIX
					+ HexFormat.of().formatHex(mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException | InvalidKeyException e) {
			throw new IllegalStateException("HMAC-SHA-256 unavailable for the suppression key", e);
		}
	}

	private static String domainOf(String normalized) {
		int at = normalized.lastIndexOf('@');
		return at >= 0 ? normalized.substring(at + 1) : "";
	}

	private static String normalize(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}
}
```

  Property (with the lockstep comment):

```properties
# Pepper for the email-suppression key HMAC (#388, ADR-0012). The committed default is for
# dev/tests ONLY — SuppressionPepperProdGuard rejects it (and blank) under the 'prod' profile,
# where RIVIERA_SUPPRESSION_PEPPER must supply a real long-lived secret. Rotating the pepper
# orphans every stored row (accepted ADR-0012 consequence) — treat it like a KMS root key.
riviera.notification.suppression-pepper=${RIVIERA_SUPPRESSION_PEPPER:dev-only-suppression-pepper}
```

- [ ] **Step 4: Run, verify green** — `./gradlew test --tests "*EmailSuppressionIT*"` → PASS;
  broaden: `--tests "*notification*"` for the module, then the structural net
  `--tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` (AC-6).

- [ ] **Step 5: Generalization-audit** — search other raw-address persistence/logging on the
  suppression path (`grep -rn "email" platform/src/main/java/ai/riviera/platform/notification`);
  expected: chokepoint logs already address-free; record decision below.

- [ ] **Step 6: Commit** — `feat(#388): suppression key is a peppered v1 HMAC + cleartext domain (V33)`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — pepper prod guard + guard test

**Files:** Create `SuppressionPepperProdGuard.java`, `SuppressionPepperProdGuardTest.java`

- [ ] **Step 1: Failing test** (`ApplicationContextRunner`, sibling of `MockMailerProdGuardTest`):

```java
class SuppressionPepperProdGuardTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(SuppressionPepperProdGuard.class);

	@Test
	void prodWithoutARealPepperAbortsStartup() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> {
					assertThat(context).hasFailed();
					assertThat(context).getFailure().rootCause().isInstanceOf(IllegalStateException.class);
				});
	}

	@Test
	void prodWithTheDevDefaultPepperAbortsStartup() {
		runner.withPropertyValues(
						"riviera.notification.suppression-pepper=" + SuppressionPepperProdGuard.DEV_DEFAULT_PEPPER)
				.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> assertThat(context).hasFailed());
	}

	@Test
	void prodWithARealPepperBoots() {
		runner.withPropertyValues("riviera.notification.suppression-pepper=a-real-prod-secret")
				.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> assertThat(context).hasNotFailed());
	}

	@Test
	void defaultProfileBootsWithoutTheGuard() {
		runner.run(context -> assertThat(context).hasNotFailed());
	}
}
```

- [ ] **Step 2: Run, verify red** — `./gradlew test --tests "*SuppressionPepperProdGuardTest*"` → FAIL (class missing)

- [ ] **Step 3: Minimal implementation:**

```java
@Component
@Profile("prod")
class SuppressionPepperProdGuard {

	/** Must stay in lockstep with the committed default in application.properties (§6a). */
	static final String DEV_DEFAULT_PEPPER = "dev-only-suppression-pepper";

	SuppressionPepperProdGuard(
			@Value("${riviera.notification.suppression-pepper:}") String pepper) {
		if (pepper.isBlank() || DEV_DEFAULT_PEPPER.equals(pepper)) {
			throw new IllegalStateException(
					"riviera.notification.suppression-pepper must be a real secret under the 'prod' profile "
							+ "— set RIVIERA_SUPPRESSION_PEPPER (ADR-0012; rotating it orphans all stored keys)");
		}
	}
}
```

- [ ] **Step 4: Run, verify green** — guard test + `--tests "*notification*"` regression.
- [ ] **Step 5: Generalization-audit** — none expected (pattern copied from existing guards); record.
- [ ] **Step 6: Commit** — `feat(#388): fail at boot in prod without a real suppression pepper`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — docs + close-out

**Files:** Modify `RESPONSIBILITIES.md`, `CLAUDE.md`, `docs/deploy/cd-pipeline.md` ·
Create `docs/runbooks/suppression-list-ops.md`

- [ ] `RESPONSIBILITIES.md` notification **Job**: suppression list stores a peppered-HMAC key +
  cleartext domain, non-PII at rest, survives erasure (V33, ADR-0012).
- [ ] `CLAUDE.md` module-table `notification` row: same one-phrase touch-up.
- [ ] `docs/runbooks/suppression-list-ops.md` (the note ADR-0012 owes to #388): check a
  specific address (`printf '%s' 'foo@bar.com' | openssl dgst -sha256 -hmac "$PEPPER"` →
  prefix `v1:` → `SELECT … WHERE email_key = …`), domain-level triage query, pepper
  env/rotation posture.
- [ ] `docs/deploy/cd-pipeline.md` env list: `RIVIERA_SUPPRESSION_PEPPER` — required under
  `prod` (boot aborts without it), secret, env-only, rotation orphans rows.
- [ ] Finalize Execution status (stage pointer DONE, `merged via PR #NN` form), empty Open
  Questions, close risk rows.
- [ ] Commit — `docs(#388): suppression-list ops runbook + hashed-list doc touch-ups`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-27 | phase 1 (hashed key) | raw-address persistence/logging on the suppression path | `grep -rn "email" platform/src/main/java/ai/riviera/platform/notification` | chokepoint logs already address-free; `MockMailer`/`SentEmail` record addresses but are the test-only transport, not suppression state | no further sites — skip |
| 2026-07-27 | phase 2 (conditional prod guard) | other env secrets needing a reject-the-committed-default guard | reviewed `RIVIERA_MAIL_FROM` (SmtpMailer fails at boot itself), `RIVIERA_OPERATOR_PASSWORD` (deliberate graceful lock, #115) | none | skip — existing postures are deliberate |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-5:** `./gradlew test --tests "*EmailSuppressionIT*" --tests "*SuppressionPepperProdGuardTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** structural net scoped run → PASS. Verified at commit `<sha>`.
- [ ] (CI) full suite green on the PR — AC-6's authoritative run.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** N/A justified (no availability path in scope).
- [ ] Pool + cutoff rules — not in scope.
- [ ] **Modulith** section filled; no cross-module imports added; no published-surface change (invariant #11).
- [ ] **Payment/payout** N/A.
- [ ] Refund policy — not in scope.
- [ ] Timezone: timestamps stay caller-supplied UTC instants (invariant #6, unchanged).
- [ ] Booking codes — not in scope; the *pepper* is the secret here and is never logged.
- [ ] Flyway V33 present; format-pinning CHECKs tested via the IT writing through the adapter (invariant #12).
- [ ] **Frontend** — not in scope.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final plan-doc state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` + `riviera-review-overlay`.
