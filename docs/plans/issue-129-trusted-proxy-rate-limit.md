# Trusted-Proxy Client-IP Resolution for the Rate Limiter (#129) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A client can no longer escape any per-IP rate-limit bucket by forging
`X-Forwarded-For` — the resolver honors the header only behind a trusted proxy and keys on
the right-most **untrusted** hop, closing the #109-review spoof bypass (ADR-0006 risk R-2).

**Architecture:** The fix stays **inside `ClientIpResolver`** (root package, app-level web
concern like `SecurityConfig`) — we deliberately do NOT enable a global
`server.forward-headers-strategy`: `docs/deploy/production-hardening.md` records that the
framework filter would strip `X-Forwarded-For` before `RateLimitFilter` runs and rewrite
`getRemoteAddr()`, and `WebCorsConfig`'s same-origin null-config trick assumes no
forwarded-scheme processing. The resolver becomes an instantiable class configured with a
trusted-proxy CIDR list (default: loopback + RFC1918 + link-local + IPv6 equivalents,
overridable via `riviera.ratelimit.trusted-proxies`) and applies the MDN-recommended
algorithm: if the socket peer is untrusted, use it and ignore the header; otherwise walk
`X-Forwarded-For` right-to-left, skip trusted hops, and key on the first untrusted hop.
This is correct on Render, which **appends** the true client IP to any client-supplied
header (so the right-most untrusted hop is Render's own observation, unforgeable).

> **Corrected during implementation (finding I-1).** This paragraph originally claimed the ~19
> MockMvc IT files' unique-XFF bucket-isolation convention (#127 lockout lesson) kept working
> "because the MockMvc peer is loopback (trusted)". That reasoning is incomplete and the
> conclusion was wrong: the peer being trusted is what makes the header *readable*, but the
> convention's generated address was itself RFC1918 (`10.99.x.y`), so the walk would have skipped
> it as a proxy hop and fallen through to the loopback peer — collapsing every IT in the suite
> onto one bucket. The convention holds only once the generated address is **untrusted**; the
> helper now mints `198.18.x.y`. See risk R-2.

**Persistence:** JDBC only (invariant #1). No tables/migrations touched — config + one
root-package class.

**Source of intent:** GitHub issue #129 (surfaced by the #109 S1 review gate; ADR-0006 R-2).

**Skills consulted:** `riviera-sdlc` issue-intake gate (re-validated the issue: since
creation the resolver now keys SEVEN bucket dimensions — booking per-IP, operator login,
operator register S6, customer login/register S2, SSO S4, recovery S8 — one resolver fix
covers all); `riviera-plan-doc` (this template); `riviera-java-conventions` (constructor
injection into final fields, package-private class, no new deps — reuse Spring Security's
`IpAddressMatcher`; Java 25 `InetAddress.ofLiteral` for DNS-free literal parsing; one-line
comments); `riviera-modulith` (placement: root-package edge concern, NOT a module — login
machinery stays at the platform edge, RV-BE-11; no module surface changes). `postgres`
N/A — no schema change. Frontend/`playwright-cli` N/A — backend-only, no user-visible flow
change.

**Branch:** `feature/129-trusted-proxy-rate-limit` (exists; created at plan time).

---

## Acceptance criteria (testable)

> Written at the resolver/filter boundary (the inner hexagon of this edge concern);
> HTTP-level assertions live in the filter contract test, which is the adapter-level pin.

- [x] **AC-1:** Given a request whose socket peer is NOT a trusted proxy (e.g. a public
  address), when it carries any `X-Forwarded-For`, then the resolver ignores the header and
  keys on the socket address. *Pinned by:* `ClientIpResolverTest.ignoresForwardedForFromUntrustedPeer`
- [x] **AC-2:** Given a trusted socket peer and `X-Forwarded-For: 6.6.6.6, 203.0.113.7`
  (attacker-forged prefix + proxy-appended true client), when resolved, then the key is the
  right-most untrusted hop `203.0.113.7`, never the forged left-most. *Pinned by:*
  `ClientIpResolverTest.resolvesRightmostUntrustedHopBehindTrustedProxy`
- [x] **AC-3:** Given the login limiter (capacity 2) and requests from one trusted peer that
  rotate a forged `X-Forwarded-For` prefix per request while the proxy-appended tail stays
  the same, when the budget is exceeded, then the 3rd request is `429` — the rotation no
  longer opens fresh buckets (the #129 bypass, closed). *Pinned by:*
  `RateLimitFilterTest.spoofedForwardedPrefixCannotEscapeLoginBucket`
- [x] **AC-4:** Given the existing IT convention (MockMvc loopback peer + a unique
  single-value `X-Forwarded-For` per test), when the suite runs, then each unique value
  still gets its own bucket — the ~15 auth/booking IT files pass **unchanged**. *Pinned
  by:* existing `RateLimitFilterTest` XFF cases + the untouched IT corpus
  (`AuthSessionIT`, `CustomerLoginIT`, `OperatorRegistrationIT`, …) staying green.
- [x] **AC-5:** Given an absent/blank header, or a header whose hops are ALL trusted
  addresses, when resolved behind a trusted peer, then the resolver falls back to the
  socket address; control-character sanitisation is preserved on every returned value.
  *Pinned by:* existing `ClientIpResolverTest` fallback + sanitisation tests (updated to
  the instance API) and `ClientIpResolverTest.fallsBackToPeerWhenAllHopsTrusted`
- [x] **AC-6:** Given a hop that is not an IP literal (`unknown`, a hostname, garbage),
  when resolved, then it is treated as an untrusted client value (sanitised, used as key),
  never throws, and never triggers DNS resolution. *Pinned by:*
  `ClientIpResolverTest.treatsNonIpLiteralHopAsClientWithoutDns`
- [ ] **AC-7 (manual, merge close-out):** On the deployed sandbox, 3+ rapid failed logins
  via `curl` each sending a fresh random `X-Forwarded-For` still exhaust ONE login budget
  (429 observed). Verified by hand; recorded in the Execution status.

## Non-goals

- **No global `server.forward-headers-strategy`** (framework or native) — see
  Architecture; the production-hardening §"forward headers" decision stands, updated to
  record this slice as the reconciliation it anticipated.
- **No change to the booking URL contract** (`/api/bookings/{code}`) — ADR-0006 explicitly
  warns the future implementer of R-2 off that; the FE keeps working byte-for-byte.
- **No distributed/Redis limiter** — single Render instance (ADR-0004) keeps in-memory
  buckets correct.
- **No general "real client IP" facility** for logging/auditing/geo — the resolver exists
  solely for rate-limit keying; widening it is a separate decision.
- **No S5 (real SSO) work** — unrelated epic slice.

## Behavior-parity ledger (retirement / replacement slices only)

> The slice replaces the resolution *algorithm* of an existing surface; ledger required.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Honors `X-Forwarded-For` from ANY peer | **changed** | honored only when the socket peer matches the trusted-proxy list — the fix itself |
| Keys on the **left-most** XFF hop | **changed** | right-most **untrusted** hop (MDN algorithm); left-most is the attacker-controlled end on an appending proxy (Render) |
| Falls back to `getRemoteAddr()` when header absent/blank | preserved | same fallback, plus the new all-hops-trusted case |
| Sanitises control chars / line separators before the value can reach a log | preserved | `sanitise(...)` applied to every return path, unchanged regex |
| Returns `"unknown"` when nothing available | preserved | null/blank peer → not trusted → `sanitise(null)` = `"unknown"` |
| Static utility (`ClientIpResolver.resolve(request)`) | **changed** | instantiable class constructed with the CIDR list (constructor injection; built by `RateLimitFilter` from `RateLimitProperties`, so `SecurityConfig:169` is untouched) |
| Splits only the first hop (`split(",", 2)`) | **changed** | full split; the walk needs every hop |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Render's chain inserts a public-IP internal hop after the client, so the walk stops at that hop and ALL clients share one bucket → legitimate-user lockout on login | low | high | default trusts all private/loopback ranges (internal hops are private on Render); `riviera.ratelimit.trusted-proxies` is env-overridable (`RIVIERA_RATELIMIT_TRUSTED_PROXIES`) to add a CIDR without a release; AC-7 verifies on the deployed sandbox before close-out | Ivo | open |
| R-2 | Breaking the ~19 IT files that rely on unique XFF per request for bucket isolation (#127 operator-lockout lesson) | med | high | **The planned mitigation was wrong** — `SessionLoginSupport.uniqueClientIp()` minted `10.99.x.y`, an RFC1918 address the new trust list classifies as a *proxy hop*, so every IT login in the suite would have skipped it and collapsed onto the one loopback bucket (the #127 lockout, full-suite-only). Real fix: the helper now mints `198.18.x.y` (RFC 2544 benchmarking range — public, deliberately outside the trusted defaults), pinned by `ClientIpResolverTest.integrationTestClientIpsStayDistinctBuckets` so it cannot silently regress. Every IT *file* is still unchanged; only the shared helper moved. | Ivo | **closed** — helper fixed + pinned; `AuthSessionIT` (5 tests) and `RecoveryRateLimitIT` (1 test) verified green against real Postgres, 0 skipped |
| R-3 | Trusting all RFC1918 peers means a hypothetical direct-exposed deployment on a private network would honor spoofed XFF | low | low | accepted for the locked Render topology (ADR-0004); documented in the resolver javadoc + production-hardening; the override property narrows it if topology ever changes | Ivo | **closed — accepted** as planned; documented in the `ClientIpResolver` javadoc, the `application.properties` block, and production-hardening. An empty `trusted-proxies` list ("trust no proxy") is supported and pinned by `emptyTrustListTrustsNoProxyAndKeysOnTheSocketAddress`, so a topology change needs config, not a release |
| R-4 | A non-IP XFF token (`unknown`, hostname) makes `IpAddressMatcher`/`InetAddress.getByName` do DNS or throw | med | med | pre-validate every address with Java 25 `InetAddress.ofLiteral` (literal-only, no DNS); parse failure = untrusted; AC-6 pins it | Ivo | **closed** — implemented as planned; `treatsNonIpLiteralHopAsClientWithoutDns` green |
| R-5 | Interaction with `WebCorsConfig`'s same-origin null-config trick or session-cookie handling | low | med | no global forward-headers change (Non-goal 1) — nothing outside the rate-limit keying reads the resolver | Ivo | **closed** — the generalization audit confirmed the resolver is the only client-IP consumer in `main`; `RateLimitFilterTest`'s CORS-preflight case and the session ITs (`AuthSessionIT`, `CsrfProtectionIT` corpus) are unaffected |
| R-6 | Per-controller error-shape drift on the new 429 path | — | — | none: the hand-mirrored `RATE_LIMITED` ProblemDetail body is untouched (§6b) | Ivo | closed — no contract change |

## Open questions / Assumptions

- **Assumption:** Render's proxy hops that appear in `X-Forwarded-For` (if any beyond the
  appended client) use private-range addresses, and the direct socket peer is
  private-range — *Owner:* Ivo · *Resolves by:* AC-7 at merge close-out (R-1 fallback: the
  env override).

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice touches only rate-limit keying at the HTTP
edge; no write path to `availability(set_id, booking_date)` is in scope.

## Spring Modulith — modules, interfaces, events

**Modules touched:** none. All changed classes (`ClientIpResolver`, `RateLimitFilter`,
`RateLimitProperties`) live in the **root package** `ai.riviera.platform` — an app-level
web concern like `SecurityConfig`, per the riviera-modulith rule that the root is not a
module. Login machinery stays at the platform edge (RV-BE-11); `ModularityTests` /
`PackageShapeArchitectureTests` are unaffected (run them anyway in phase 3 as the
structural net).

**Cross-module named interfaces:** none added or changed.

**Domain events:** none.

### Module ownership (§4a)

All in the platform root (edge); no module boundary change. Rate-limit keying is
deployment-topology machinery, owned by the edge exactly like session login (RV-BE-11) —
no module's Job line claims it, no Not-My-Job line rejects the placement.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — backend-only. No user-visible flow changes (the 429 contract body is unchanged), so
no e2e delta either.

## FE↔BE contract

N/A — no contract change. The `RATE_LIMITED` ProblemDetail shape and every endpoint path
stay byte-for-byte identical.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) before acting in a fresh session or after compaction.
> Update it in the SAME commit window as the change it records.

**Stage pointer:** gates — PR #282 open against `main` (`origin/main` was already current, nothing
to integrate). Review gate **run** (note below; one Blocker found and fixed). CI + Sonar pending.

**Next action:** confirm the CI run for `46ec591` is green, then pull the SonarCloud issue +
duplication list from the API (not the gate conclusion) and clear every entry. Do **not** merge until
all three gates pass. AC-7 (manual sandbox curl) stays open until merge close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — branch + plan doc | ✅ | 4e5c0c5 |
| 1 — resolver trust walk (unit) | ✅ | ac3205c (merged with phase 2 — see deviation) |
| 2 — filter wiring + HTTP spoof-closure contract | ✅ | ac3205c (merged with phase 1 — see deviation) |
| 3 — docs + scoped regression + structural net | ✅ | 31836d9 |
| review-gate fixes (re-entry) | ✅ | 35e4adc (R-1 family guard), 46ec591 (RV-STYLE-1) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Deviation — phases 1 and 2 merged into one red→green cycle and one commit.** The plan split
`ClientIpResolver` (phase 1) from its two `RateLimitFilter` call sites (phase 2), but turning the
static utility into an instantiable class *breaks compilation of the filter in the same change* —
phase 1 could not have compiled, let alone been committed green, on its own. The TDD cycle was kept
honest by writing **both** phases' tests first (unit + HTTP contract), confirming red (compile error
on the absent constructor, then on the static call sites), then implementing. Phase 3 is untouched.

**Skills loaded this session (routing gate):** `riviera-sdlc` (orchestrator), `riviera-java-conventions`
(instantiable package-private class, constructor injection into a final field, one-line comments,
specific `catch (IllegalArgumentException)`), `riviera-modulith` (confirmed root-package edge
placement — no module surface touched), `riviera-local-debug` (scoped test runs; local `./gradlew`
works, Docker present so targeted ITs ran for real).

**Review-gate note (PR #282, `riviera-review-overlay` + backend bank, high effort).** High effort
chosen because the slice changes how *every* per-IP security budget is keyed. Bank walk:

- **RV-BE-1 availability / #2** ➖ no availability write path in the diff.
- **RV-BE-2 JDBC-only / #1** ✅ no persistence touched; `JdbcOnlyArchitectureTests` green.
- **RV-BE-3 / 3b / 3c / RV-BE-12 boundaries + package shape / #11** ✅ all three changed classes stay
  in the platform root (edge concern, like `SecurityConfig`); no named interface added or moved;
  `ModularityTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests` green.
- **RV-BE-4 events** ➖ none. **RV-BE-5 money / RV-BE-6 time** ➖ none in scope. **RV-BE-7/8/16 payment,
  payout, refund** ➖ none. **RV-BE-15 pool/cutoff** ➖ untouched. **RV-BE-17 Flyway** ➖ no schema change.
- **RV-BE-9 BOLA / #13** ➖ no venue-scoped surface touched; the resolver is venue-agnostic.
- **RV-BE-10 error contract** ✅ the hand-mirrored `RATE_LIMITED` ProblemDetail body is byte-identical;
  `ErrorContractArchitectureTests` green.
- **RV-BE-11 responsibility placement** ✅ rate-limit keying is deployment-topology machinery owned by
  the edge (RV-BE-11 / `RESPONSIBILITIES.md` names no module owner); the plan's §4a table matches
  where the code landed.
- **RV-BE-13 injection** ✅ `sanitise(...)` still applies on **every** return path (untrusted peer, the
  chosen hop, and the fallback); no SQL involved. **This item is what surfaced finding R-1** — walking
  the attacker-controlled hop into the library matcher is where the crash lives.
- **RV-BE-14 booking codes / #7** ✅ unchanged; `bookingCodeIsNeverLogged` still green.
- **RV-STYLE-1** ⛔→✅ four inline comments the diff wrote ran past one line; each moved to method
  Javadoc (commit `46ec591`). Pre-existing multi-line comments left untouched, per the rule.
- **RV-PROC-1 skill routing** ✅ the diff is backend Java + placement only; both routed skills
  (`riviera-java-conventions`, `riviera-modulith`) are on the *Skills consulted* line and were loaded
  before writing. The R-1 fix stayed inside the same area, so no new skill was pulled in.

**Considered, not filed as findings:** (a) the right-to-left walk is O(hops), and a hostile header can
carry ~800 all-trusted hops within Tomcat's 8 KB header cap — ~1 ms of parsing, judged not worth a hop
cap; (b) a malformed `trusted-proxies` CIDR fails at filter construction, i.e. app startup — fail-fast
is the right direction for a security control, and it can never silently degrade to "trust everything".

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| I-1 | implement (phase 1/2) | R-2's planned mitigation was factually wrong: `SessionLoginSupport.uniqueClientIp()` minted RFC1918 `10.99.x.y`, which the new trust list treats as a proxy hop — the whole IT corpus would have collapsed onto one bucket (a full-suite-only #127 repeat that no scoped run would show) | fixed — helper now mints `198.18.x.y`; pinned by a resolver test |
| R-1 | review gate (RV-BE-13 / library-behaviour check) | **Blocker.** Spring Security 7.1's `IpInetAddressMatcher` compares raw address bytes with **no length check** (the guard the pre-7.1 `IpAddressMatcher` had). An attacker-supplied `X-Forwarded-For: 0.0.0.0` hop matches `::1/128`'s four leading zero bytes and then indexes past the end of the 4-byte IPv4 array — `ArrayIndexOutOfBoundsException` inside the filter, i.e. a **remote 500 on every rate-limited endpoint**. The same missing check also mis-trusts across families (`252.x` vs `fc00::/7`, `a9fe::` vs `169.254.0.0/16`) | fixed — the new `TrustedProxy` record guards on address-family length before delegating; pinned by three resolver tests (all three were red first) |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/RateLimitProperties.java` — add
  `List<String> trustedProxies` with the private-range defaults + javadoc.
- `platform/src/main/java/ai/riviera/platform/ClientIpResolver.java` — static utility →
  package-private instantiable class; trusted-peer + right-most-untrusted-hop walk;
  `sanitise` unchanged.
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — build one resolver
  instance from props in the constructor; two `ClientIpResolver.resolve(request)` call
  sites become `clientIps.resolve(request)`. Constructor signature `(props, clock)`
  unchanged → `SecurityConfig:169` untouched.
- `platform/src/main/resources/application.properties` — document
  `riviera.ratelimit.trusted-proxies` default + `RIVIERA_RATELIMIT_TRUSTED_PROXIES`
  override next to the existing ratelimit block.
- `platform/src/test/java/ai/riviera/platform/ClientIpResolverTest.java` — port to the
  instance API; add AC-1/2/5/6 cases.
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — add the AC-3
  spoof-closure case (+ an untrusted-peer variant on the booking per-IP dimension).
- `platform/src/test/java/ai/riviera/platform/SessionLoginSupport.java` — **added during
  implementation (finding I-1)**: the per-test unique client IP moves from RFC1918 `10.99.x.y` to
  RFC 2544 `198.18.x.y`, so the whole IT corpus's bucket isolation survives the trust walk.
- `docs/deploy/production-hardening.md` — update §forward headers: the anticipated
  "reconcile with `ClientIpResolver`" happened here; strategy still not enabled.
- `docs/adr/0006-booking-code-stays-in-url-path.md` — mark the R-2 residual-risk bullet
  resolved by #129 (append a dated note; don't rewrite history).

---

## Phase 1 — Resolver trust walk (unit)

**Files:** Modify `RateLimitProperties.java`, `ClientIpResolver.java`,
`ClientIpResolverTest.java`

- [x] **Step 1: Write the failing tests** — port the existing 6 cases to the instance API
  (construct with the default CIDR list) and add:

```java
private static final List<String> DEFAULT_TRUSTED = List.of(
		"127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
		"169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10");

private final ClientIpResolver resolver = new ClientIpResolver(DEFAULT_TRUSTED);

@Test
void ignoresForwardedForFromUntrustedPeer() {
	MockHttpServletRequest request = new MockHttpServletRequest();
	request.setRemoteAddr("198.51.100.4"); // public peer — not a trusted proxy
	request.addHeader("X-Forwarded-For", "6.6.6.6");

	assertEquals("198.51.100.4", resolver.resolve(request));
}

@Test
void resolvesRightmostUntrustedHopBehindTrustedProxy() {
	MockHttpServletRequest request = new MockHttpServletRequest();
	request.setRemoteAddr("10.0.0.1"); // the Render hop — trusted
	request.addHeader("X-Forwarded-For", "6.6.6.6, 203.0.113.7"); // forged prefix + appended client

	assertEquals("203.0.113.7", resolver.resolve(request));
}

@Test
void fallsBackToPeerWhenAllHopsTrusted() {
	MockHttpServletRequest request = new MockHttpServletRequest();
	request.setRemoteAddr("127.0.0.1");
	request.addHeader("X-Forwarded-For", "10.1.1.1, 192.168.0.9");

	assertEquals("127.0.0.1", resolver.resolve(request));
}

@Test
void treatsNonIpLiteralHopAsClientWithoutDns() {
	MockHttpServletRequest request = new MockHttpServletRequest();
	request.setRemoteAddr("127.0.0.1");
	request.addHeader("X-Forwarded-For", "unknown, 10.0.0.1");

	assertEquals("unknown", resolver.resolve(request)); // non-literal → untrusted → the key
}
```

  The existing `usesFirstForwardedForHop` is renamed
  `resolvesClientBehindTrustedProxy` (same fixture `"203.0.113.7, 10.0.0.1"` from peer
  `10.0.0.1`, same expectation — it now documents the walk, not left-most trust). The
  sanitisation cases gain `request.setRemoteAddr("127.0.0.1")` so the header is honored.

- [x] **Step 2: Run, verify it fails** —
  `./gradlew test --tests "*ClientIpResolverTest*"` → FAIL (no such constructor; AC-1/2
  assertions fail against left-most logic).

- [x] **Step 3: Minimal implementation** — `RateLimitProperties` gains:

```java
@DefaultValue({"127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
		"169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10"}) List<String> trustedProxies,
```

  and `ClientIpResolver` becomes (javadoc updated to describe the trust model — the
  R-2 concession paragraph is replaced by the algorithm + Render-appends rationale):

```java
final class ClientIpResolver {

	private static final String FORWARDED_FOR = "X-Forwarded-For";
	private static final String UNKNOWN = "unknown";

	private final List<IpAddressMatcher> trustedProxies;

	ClientIpResolver(List<String> trustedProxyCidrs) {
		this.trustedProxies = trustedProxyCidrs.stream().map(IpAddressMatcher::new).toList();
	}

	String resolve(HttpServletRequest request) {
		String peer = request.getRemoteAddr();
		if (!isTrustedProxy(peer)) {
			return sanitise(peer);
		}
		String forwarded = request.getHeader(FORWARDED_FOR);
		if (forwarded != null && !forwarded.isBlank()) {
			String[] hops = forwarded.split(",");
			// Right-to-left: the right-most hop is the one the trusted proxy appended (Render
			// appends, never overwrites), so the first untrusted hop from the right is unforgeable.
			for (int i = hops.length - 1; i >= 0; i--) {
				String hop = hops[i].trim();
				if (!hop.isEmpty() && !isTrustedProxy(hop)) {
					return sanitise(hop);
				}
			}
		}
		return sanitise(peer);
	}

	private boolean isTrustedProxy(String address) {
		if (address == null || address.isBlank()) {
			return false;
		}
		try {
			InetAddress.ofLiteral(address); // literal-only parse — never DNS (R-4)
		} catch (IllegalArgumentException notAnIpLiteral) {
			return false;
		}
		return trustedProxies.stream().anyMatch(proxy -> proxy.matches(address));
	}

	private static String sanitise(String value) {
		// unchanged
	}
}
```

  (`IpAddressMatcher` is `org.springframework.security.web.util.matcher.IpAddressMatcher`
  — already on the classpath via session auth; no new dependency.)

- [x] **Step 4: Run, verify it passes** —
  `./gradlew test --tests "*ClientIpResolverTest*"` → PASS.
- [x] **Step 5: Generalization-audit pass** — search
  `grep -rn "X-Forwarded\|getRemoteAddr" platform/src/main/java` → expect only
  `ClientIpResolver` (+ the filter call sites). Any other consumer of client IP found is a
  candidate for the same trust walk; record the decision below.
- [x] **Step 6: Commit** — `git commit -m "Resolve client IP via trusted-proxy walk, not blind XFF (#129)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Filter wiring + HTTP spoof-closure contract

**Files:** Modify `RateLimitFilter.java`, `RateLimitFilterTest.java`,
`application.properties`

- [x] **Step 1: Write the failing tests** (harness facts: `@WebMvcTest` slice, tiny
  capacity-2 budgets, `WebSliceStubs.fromIp` sets the socket peer, an allowed login POST
  is a 401/400 — only 429 is the limiter):

```java
@Test
void spoofedForwardedPrefixCannotEscapeLoginBucket() throws Exception {
	// One real client behind the trusted proxy rotates a forged prefix per attempt; the
	// proxy-appended tail (the true client) is constant — all three must share ONE bucket.
	for (int attempt = 0; attempt < 2; attempt++) {
		mvc.perform(post("/api/auth/operator/login").with(fromIp("10.9.0.1")).with(csrf())
						.header("X-Forwarded-For", "6.6.6." + attempt + ", 203.0.113.66")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"username\":\"op\",\"password\":\"wrong\"}"))
				.andExpect(status().isUnauthorized());
	}
	mvc.perform(post("/api/auth/operator/login").with(fromIp("10.9.0.1")).with(csrf())
					.header("X-Forwarded-For", "6.6.6.9, 203.0.113.66")
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"username\":\"op\",\"password\":\"wrong\"}"))
			.andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
}

@Test
void forwardedForFromUntrustedPeerIsIgnored() throws Exception {
	// A directly-connecting public client rotating XFF stays keyed on its socket address.
	viewFromIp("203.0.113.80", "untrusted-A").andExpect(status().isNotFound());
	mvc.perform(get("/api/bookings/{code}", "untrusted-B").with(fromIp("203.0.113.80"))
			.header("X-Forwarded-For", "1.1.1.1")).andExpect(status().isNotFound());
	mvc.perform(get("/api/bookings/{code}", "untrusted-C").with(fromIp("203.0.113.80"))
			.header("X-Forwarded-For", "2.2.2.2")).andExpect(status().isTooManyRequests());
}
```

  (Adjust the login body/expected non-429 status to whatever the existing login-dimension
  tests in this class use — mirror them exactly; the 429 boundary is the assertion that
  matters. If the existing suite covers the login dimension through a different endpoint
  shape, keep its conventions.)

- [x] **Step 2: Run, verify the new cases fail** —
  `./gradlew test --tests "*RateLimitFilterTest*"` → the spoof case FAILS (rotation opens
  fresh buckets today).
- [x] **Step 3: Minimal implementation** — in `RateLimitFilter`:
  field `private final ClientIpResolver clientIps;`, constructor adds
  `this.clientIps = new ClientIpResolver(props.trustedProxies());`, both
  `ClientIpResolver.resolve(request)` call sites → `clientIps.resolve(request)`.
  In `application.properties`, document the new key next to the ratelimit block
  (default spelled out; note the `RIVIERA_RATELIMIT_TRUSTED_PROXIES` env override and
  that an empty list means "trust no proxy — socket address only").
- [x] **Step 4: Run, verify it passes** —
  `./gradlew test --tests "*RateLimitFilterTest*" --tests "*ClientIpResolverTest*"` → PASS
  (all pre-existing cases green unchanged — AC-4's first half).
- [x] **Step 5: Generalization-audit pass** — none expected (no new pattern beyond
  phase 1's); confirm and log.
- [x] **Step 6: Commit** — `git commit -m "Close the XFF-rotation rate-limit bypass at the filter (#129)"`
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Docs, scoped regression, structural net

**Files:** Modify `docs/deploy/production-hardening.md`,
`docs/adr/0006-booking-code-stays-in-url-path.md`

- [x] **Step 1:** production-hardening §forward headers: record that #129 implemented the
  anticipated trusted-proxy reconciliation inside `ClientIpResolver`;
  `server.forward-headers-strategy` remains deliberately unset (same reasons).
- [x] **Step 2:** ADR-0006: append a dated note to the R-2 bullet — resolved by #129
  (trusted-proxy walk); the bullet's history stays intact.
- [x] **Step 3: Scoped regression** —
  `./gradlew test --tests "*ClientIpResolverTest*" --tests "*RateLimitFilterTest*" --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"`
  → PASS. (The XFF-using ITs are Docker-gated Testcontainers — they skip locally by
  design; CI owns them, which is exactly AC-4's second half. Do not run the bare `test`
  task locally — `riviera-local-debug`.)
- [x] **Step 4: Commit** — `git commit -m "docs: record #129 trusted-proxy resolution in ADR-0006 + hardening notes (#129)"`
- [x] **Step 5: Update plan-doc execution status**, push the branch, open the PR into
  `main` (merge latest `origin/main` first per the SDLC PR stage), then proceed CI gate →
  review gate (`riviera-review-overlay` — expect RV-BE-11 edge-placement and RV-PROC-1
  skills-consulted checks) → Sonar gate (pull the issue list, not just the gate) → merge
  close-out (incl. AC-7 on the deployed sandbox + `riviera-docs-freshness` over the doc
  edits + graphify update for the doc changes).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-22 | phase 1/2 — client-IP trust walk | other consumers of client IP in production code | `grep -rn "Forwarded\|getRemoteAddr" platform/src/main` | 1 (`ClientIpResolver` itself; `WebCorsConfig` only mentions forward-headers in a comment) | none — the resolver is the single client-IP consumer, so the trust walk covers every keying dimension at once |
| 2026-07-22 | phase 1/2 — trusted-range fallout | test fixtures that feed a *private* address through `X-Forwarded-For` (would now be skipped as a proxy hop) | `grep -rn 'X-Forwarded-For", "\(10\.\|192\.168\.\|172\.1[6-9]\|127\.\)' platform/src/test` | 2 (`SessionLoginSupport.uniqueClientIp()` → the whole IT corpus; `ClientIpResolverTest` all-trusted case) | helper switched to `198.18.x.y` + pinned by a test; the resolver case is deliberate (AC-5) |
| 2026-07-22 | review gate — finding R-1 | other callers passing attacker-controlled values into a Spring Security CIDR matcher (same unguarded byte compare) | `grep -rn "IpAddressMatcher\|InetAddressMatcher" platform/src` | 1 (`ClientIpResolver` only — the matcher is not used anywhere else in the codebase) | none beyond the fix; the family guard lives with the single caller rather than as a shared helper |

---

## Acceptance-criteria verification (final)

- [x] **AC-1/2/5/6:** `./gradlew test --tests "*ClientIpResolverTest*"` → PASS (15 tests, 0 skipped)
  at commit `46ec591` (12 at `ac3205c`; the review gate's R-1 fix added the three address-family cases).
- [x] **AC-3:** `./gradlew test --tests "*RateLimitFilterTest*"` → PASS (14 tests, 0 skipped);
  `spoofedForwardedPrefixCannotEscapeLoginBucket` was red before the fix. Verified at commit `ac3205c`.
- [x] **AC-4 (local half):** every IT *file* is unchanged in the diff; only the shared
  `SessionLoginSupport` helper moved (finding I-1). Docker was available locally, so the assumption
  was verified for real rather than deferred: `AuthSessionIT` (5 tests) + `RecoveryRateLimitIT`
  (1 test) PASS against real Postgres, 0 skipped, at commit `ac3205c`.
- [ ] **AC-4 (CI half):** full suite green on the PR — the only run that exercises suite-cumulative
  login traffic through one cached context. Verified at run `<link>`.
- [ ] **AC-7:** manual sandbox check post-deploy (rotating-XFF curl → 429). Verified `<date>`.

**Structural net** (invariant #11, run at phase 3): `ModularityTests` (1), `PackageShapeArchitectureTests`
(4), `PublishedSurfacePlacementArchitectureTests` (10), `JdbcOnlyArchitectureTests` (2),
`ErrorContractArchitectureTests` (2) — all PASS, 0 skipped. No module surface changed, as planned.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no new dependencies at all (invariant #1; `IpAddressMatcher` is already on the classpath).
- [x] **Availability** N/A justified (no availability write path touched).
- [x] **Modulith**: root-package placement only; no module surface changed; structural net green (invariant #11).
- [x] **Payment/payout** N/A (no money in scope).
- [x] Booking codes never logged; the resolved IP stays sanitised before any debug log (invariant #7 discipline preserved).
- [x] Error contract untouched (§6b — the hand-mirrored `RATE_LIMITED` body).
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows (R-1 closes with AC-7; R-2 with AC-4); Open Questions empty or deferred with an issue #.
