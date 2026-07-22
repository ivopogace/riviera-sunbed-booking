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
header (so the right-most untrusted hop is Render's own observation, unforgeable), and it
keeps the ~15 MockMvc IT files' unique-XFF bucket-isolation convention (#127 lockout
lesson) working unchanged, because the MockMvc peer is loopback (trusted).

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

- [ ] **AC-1:** Given a request whose socket peer is NOT a trusted proxy (e.g. a public
  address), when it carries any `X-Forwarded-For`, then the resolver ignores the header and
  keys on the socket address. *Pinned by:* `ClientIpResolverTest.ignoresForwardedForFromUntrustedPeer`
- [ ] **AC-2:** Given a trusted socket peer and `X-Forwarded-For: 6.6.6.6, 203.0.113.7`
  (attacker-forged prefix + proxy-appended true client), when resolved, then the key is the
  right-most untrusted hop `203.0.113.7`, never the forged left-most. *Pinned by:*
  `ClientIpResolverTest.resolvesRightmostUntrustedHopBehindTrustedProxy`
- [ ] **AC-3:** Given the login limiter (capacity 2) and requests from one trusted peer that
  rotate a forged `X-Forwarded-For` prefix per request while the proxy-appended tail stays
  the same, when the budget is exceeded, then the 3rd request is `429` — the rotation no
  longer opens fresh buckets (the #129 bypass, closed). *Pinned by:*
  `RateLimitFilterTest.spoofedForwardedPrefixCannotEscapeLoginBucket`
- [ ] **AC-4:** Given the existing IT convention (MockMvc loopback peer + a unique
  single-value `X-Forwarded-For` per test), when the suite runs, then each unique value
  still gets its own bucket — the ~15 auth/booking IT files pass **unchanged**. *Pinned
  by:* existing `RateLimitFilterTest` XFF cases + the untouched IT corpus
  (`AuthSessionIT`, `CustomerLoginIT`, `OperatorRegistrationIT`, …) staying green.
- [ ] **AC-5:** Given an absent/blank header, or a header whose hops are ALL trusted
  addresses, when resolved behind a trusted peer, then the resolver falls back to the
  socket address; control-character sanitisation is preserved on every returned value.
  *Pinned by:* existing `ClientIpResolverTest` fallback + sanitisation tests (updated to
  the instance API) and `ClientIpResolverTest.fallsBackToPeerWhenAllHopsTrusted`
- [ ] **AC-6:** Given a hop that is not an IP literal (`unknown`, a hostname, garbage),
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
| R-2 | Breaking the ~15 IT files that rely on unique XFF per request for bucket isolation (#127 operator-lockout lesson) | med | high | MockMvc peer is `127.0.0.1` (trusted) so single-value XFF still resolves to that value; AC-4 pins the corpus unchanged; scoped IT run in phase 3 | Ivo | open |
| R-3 | Trusting all RFC1918 peers means a hypothetical direct-exposed deployment on a private network would honor spoofed XFF | low | low | accepted for the locked Render topology (ADR-0004); documented in the resolver javadoc + production-hardening; the override property narrows it if topology ever changes | Ivo | open |
| R-4 | A non-IP XFF token (`unknown`, hostname) makes `IpAddressMatcher`/`InetAddress.getByName` do DNS or throw | med | med | pre-validate every address with Java 25 `InetAddress.ofLiteral` (literal-only, no DNS); parse failure = untrusted; AC-6 pins it | Ivo | open |
| R-5 | Interaction with `WebCorsConfig`'s same-origin null-config trick or session-cookie handling | low | med | no global forward-headers change (Non-goal 1) — nothing outside the rate-limit keying reads the resolver | Ivo | open |
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

**Stage pointer:** plan — complete, awaiting implement (fresh session)

**Next action:** Phase 1, step 1 — load `riviera-java-conventions` + `riviera-modulith` +
`riviera-local-debug` (routing gate + first-build recipe), then write the failing
`ClientIpResolverTest` cases.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — branch + plan doc | ✅ | (this commit) |
| 1 — resolver trust walk (unit) | | |
| 2 — filter wiring + HTTP spoof-closure contract | | |
| 3 — docs + scoped regression + structural net | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | | none yet | |

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
- `docs/deploy/production-hardening.md` — update §forward headers: the anticipated
  "reconcile with `ClientIpResolver`" happened here; strategy still not enabled.
- `docs/adr/0006-booking-code-stays-in-url-path.md` — mark the R-2 residual-risk bullet
  resolved by #129 (append a dated note; don't rewrite history).

---

## Phase 1 — Resolver trust walk (unit)

**Files:** Modify `RateLimitProperties.java`, `ClientIpResolver.java`,
`ClientIpResolverTest.java`

- [ ] **Step 1: Write the failing tests** — port the existing 6 cases to the instance API
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

- [ ] **Step 2: Run, verify it fails** —
  `./gradlew test --tests "*ClientIpResolverTest*"` → FAIL (no such constructor; AC-1/2
  assertions fail against left-most logic).

- [ ] **Step 3: Minimal implementation** — `RateLimitProperties` gains:

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

- [ ] **Step 4: Run, verify it passes** —
  `./gradlew test --tests "*ClientIpResolverTest*"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — search
  `grep -rn "X-Forwarded\|getRemoteAddr" platform/src/main/java` → expect only
  `ClientIpResolver` (+ the filter call sites). Any other consumer of client IP found is a
  candidate for the same trust walk; record the decision below.
- [ ] **Step 6: Commit** — `git commit -m "Resolve client IP via trusted-proxy walk, not blind XFF (#129)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Filter wiring + HTTP spoof-closure contract

**Files:** Modify `RateLimitFilter.java`, `RateLimitFilterTest.java`,
`application.properties`

- [ ] **Step 1: Write the failing tests** (harness facts: `@WebMvcTest` slice, tiny
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

- [ ] **Step 2: Run, verify the new cases fail** —
  `./gradlew test --tests "*RateLimitFilterTest*"` → the spoof case FAILS (rotation opens
  fresh buckets today).
- [ ] **Step 3: Minimal implementation** — in `RateLimitFilter`:
  field `private final ClientIpResolver clientIps;`, constructor adds
  `this.clientIps = new ClientIpResolver(props.trustedProxies());`, both
  `ClientIpResolver.resolve(request)` call sites → `clientIps.resolve(request)`.
  In `application.properties`, document the new key next to the ratelimit block
  (default spelled out; note the `RIVIERA_RATELIMIT_TRUSTED_PROXIES` env override and
  that an empty list means "trust no proxy — socket address only").
- [ ] **Step 4: Run, verify it passes** —
  `./gradlew test --tests "*RateLimitFilterTest*" --tests "*ClientIpResolverTest*"` → PASS
  (all pre-existing cases green unchanged — AC-4's first half).
- [ ] **Step 5: Generalization-audit pass** — none expected (no new pattern beyond
  phase 1's); confirm and log.
- [ ] **Step 6: Commit** — `git commit -m "Close the XFF-rotation rate-limit bypass at the filter (#129)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Docs, scoped regression, structural net

**Files:** Modify `docs/deploy/production-hardening.md`,
`docs/adr/0006-booking-code-stays-in-url-path.md`

- [ ] **Step 1:** production-hardening §forward headers: record that #129 implemented the
  anticipated trusted-proxy reconciliation inside `ClientIpResolver`;
  `server.forward-headers-strategy` remains deliberately unset (same reasons).
- [ ] **Step 2:** ADR-0006: append a dated note to the R-2 bullet — resolved by #129
  (trusted-proxy walk); the bullet's history stays intact.
- [ ] **Step 3: Scoped regression** —
  `./gradlew test --tests "*ClientIpResolverTest*" --tests "*RateLimitFilterTest*" --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"`
  → PASS. (The XFF-using ITs are Docker-gated Testcontainers — they skip locally by
  design; CI owns them, which is exactly AC-4's second half. Do not run the bare `test`
  task locally — `riviera-local-debug`.)
- [ ] **Step 4: Commit** — `git commit -m "docs: record #129 trusted-proxy resolution in ADR-0006 + hardening notes (#129)"`
- [ ] **Step 5: Update plan-doc execution status**, push the branch, open the PR into
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

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/2/5/6:** `./gradlew test --tests "*ClientIpResolverTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** `./gradlew test --tests "*RateLimitFilterTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** CI full suite green on the PR with zero IT-file changes in the diff. Verified at run `<link>`.
- [ ] **AC-7:** manual sandbox check post-deploy (rotating-XFF curl → 429). Verified `<date>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no new dependencies at all (invariant #1; `IpAddressMatcher` is already on the classpath).
- [ ] **Availability** N/A justified (no availability write path touched).
- [ ] **Modulith**: root-package placement only; no module surface changed; structural net green (invariant #11).
- [ ] **Payment/payout** N/A (no money in scope).
- [ ] Booking codes never logged; the resolved IP stays sanitised before any debug log (invariant #7 discipline preserved).
- [ ] Error contract untouched (§6b — the hand-mirrored `RATE_LIMITED` body).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows (R-1 closes with AC-7; R-2 with AC-4); Open Questions empty or deferred with an issue #.
