# Durable Client-IP Resolution for the Rate Limiter (#286) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rate limiter's client-IP key correct **without depending on a
hand-maintained copy of Cloudflare's published CIDR ranges** — the resolver prefers a
configurable, CDN-set client-IP header (shipped default `CF-Connecting-IP`) honoured only
behind a trusted socket peer, keeps #129's `X-Forwarded-For` walk as the fallback, and
emits a signal when the preferred path stops working.

**Architecture:** The single most significant decision is **whose value we key on, and how
many moving parts that answer depends on.** #129 answered "the right-most untrusted hop of
`X-Forwarded-For`", which forces the trust list to enumerate *every* infrastructure address
between client and app — and `*.onrender.com` is Cloudflare-fronted, so that means a
30-entry copy of a third-party list that rots silently. Instead, when the socket peer is
trusted we take the client address the edge already computed for us, from a **configurable
header name** (`riviera.ratelimit.client-ip-header`) rather than a hardcoded Cloudflare one:
one value, no chain walk, and the only CIDRs that stay load-bearing are the **private ranges
of the socket peer**, which are stable infrastructure rather than a rotating CDN allocation.
The #129 walk survives untouched as the fallback, so a non-CDN deployment (and the entire IT
corpus) behaves exactly as before.

**Persistence:** JDBC only (invariant #1). **No tables, no migration** — this slice touches
no schema. No Flyway version is claimed, so no `V<n>` collision is possible with any open PR.

**Source of intent:** GitHub issue **#286** (+ its 2026-07-22 stopgap comment); follow-up to
**#129** (PR #282, merged `bbcaa75`) whose plan is `docs/plans/issue-129-trusted-proxy-rate-limit.md`.

**Skills consulted:** `riviera-sdlc` (stage routing; issue-intake grill gate before planning) ·
`riviera-plan-doc` (this template + the Execution-status state store) · `grilling` (the
intake pass — surfaced the "the probe cannot discriminate while the CF ranges stay trusted"
finding that reshaped the rollout into two steps) · `riviera-java-conventions` (records for
config, constructor injection into `final` fields, no magic literals in Java — which is also
what keeps Sonar `java:S1313` off this diff; §6c one-line-comment rule; §10 log-injection
guard on the new WARN) · `riviera-modulith` (**placement check only**: `ClientIpResolver`,
`RateLimitFilter`, `RateLimitProperties` are root-package edge classes and the root package
**is not a module** — so no `@NamedInterface`, no `allowedDependencies`, no
`ModularityTests` surface change) · `riviera-local-debug` (scoped test runs; loaded before
the first `./gradlew`). Not triggered: `postgres` (no migration), `riviera-frontend` /
`angular-developer` / `playwright-cli` (no frontend surface), `riviera-stripe-payments` (no
money).

**Branch:** `bugfix/286-durable-client-ip` (exists; created at plan time).

---

## Acceptance criteria (testable)

> Written at the resolver/filter boundary (the inner hexagon of this edge concern);
> HTTP-level assertions live in the filter contract test. AC-8 is deliberately *outside*
> the test suite — see Non-goals and R-1 for why no in-JVM test can stand in for it.

- [ ] **AC-1:** Given a trusted socket peer and a configured client-IP header carrying
  exactly one valid IP literal, when resolved, then that value is the key and the
  `X-Forwarded-For` chain is not consulted at all. *Pinned by:*
  `ClientIpResolverTest.prefersTheEdgeSuppliedClientOverTheForwardedChain`
- [ ] **AC-2:** Given a socket peer that is **not** trusted, when the request carries the
  configured client-IP header, then the header is ignored and the socket address is the key
  — a direct caller cannot mint buckets with it, exactly as for `X-Forwarded-For` (#129
  AC-1). *Pinned by:* `ClientIpResolverTest.ignoresTheClientIpHeaderFromAnUntrustedPeer`
- [ ] **AC-3:** Given the configured header is absent, when resolved behind a trusted peer,
  then resolution falls through to #129's right-most-untrusted-hop `X-Forwarded-For` walk
  and every #129 acceptance criterion still holds. *Pinned by:*
  `ClientIpResolverTest.fallsBackToTheForwardedWalkWhenTheHeaderIsAbsent` **plus the whole
  pre-existing `ClientIpResolverTest` + `RateLimitFilterTest` corpus staying green unchanged.**
- [ ] **AC-4:** Given the configured header arrives **more than once**, or with a value that
  is not a single IP literal, when resolved behind a trusted peer, then the header is
  ignored (never the first-of-many value), resolution falls through to the walk, and the
  anomaly is logged. *Pinned by:* `ClientIpResolverTest.ignoresAMultiValuedClientIpHeader`,
  `ClientIpResolverTest.ignoresANonLiteralClientIpHeader`
- [ ] **AC-5 (the regression pin):** Given the **production chain shape** — trusted private
  socket peer, `X-Forwarded-For: <forged>, <client>, <public CF edge>`, client-IP header set
  to `<client>` — and a trust list containing **only the shipped private ranges** (no
  Cloudflare CIDRs), when resolved, then the key is `<client>` and not the edge hop. A
  sibling test asserts the same input **without** the header still keys on the edge hop,
  documenting precisely the defect #286 reports. *Pinned by:*
  `ClientIpResolverTest.resolvesTheClientOnACloudflareShapedChainWithoutCloudflareCidrs`,
  `ClientIpResolverTest.withoutTheHeaderTheWalkStillKeysOnTheEdgeHop`
- [ ] **AC-6:** Given the login limiter (capacity 2) and one client whose client-IP header is
  constant while the `X-Forwarded-For` edge hop **varies per request** (the measured
  production behaviour), when the budget is exceeded, then the 3rd request is `429` — one
  bucket, not one per edge node. *Pinned by:*
  `RateLimitFilterTest.oneClientBehindRotatingEdgeNodesSharesOneLoginBucket`
- [ ] **AC-7:** Given the shipped `application.properties`, when the context binds
  `RateLimitProperties`, then `trusted-proxies` is the 8 private/loopback CIDRs **including
  the colon-bearing IPv6 entries** (`::1/128`, `fc00::/7`, `fe80::/10`) and
  `client-ip-header` is `CF-Connecting-IP`; and when `RIVIERA_RATELIMIT_TRUSTED_PROXIES` /
  `RIVIERA_RATELIMIT_CLIENT_IP_HEADER` are supplied, each overrides its property. *Pinned
  by:* `RateLimitPropertiesBindingTest`
- [ ] **AC-8 (manual, post-merge, two-step — the only end-to-end proof):** After CD deploys
  this slice **and** `RIVIERA_RATELIMIT_TRUSTED_PROXIES` is unset on Render (so only the
  shipped private ranges are trusted), the 200-request probe in
  `docs/runbooks/rate-limit-client-ip.md` returns **~10 non-`429` and the rest `429`** from
  one client. ~140 non-`429` means the header path is inert → roll back by re-setting the
  env var. *Verified by:* the runbook probe, recorded in this doc's Execution status.
- [ ] **AC-9:** `docs/deploy/cd-pipeline.md` no longer says the variable "needs setting"; it
  records the current value, its provenance (`cloudflare.com/ips-v4`, `/ips-v6`), the drift
  risk, and the retirement step — and `application.properties` shows **both** rate-limit
  settings as explicit `${ENV_VAR:default}` placeholders like every other env-driven
  setting. *Pinned by:* review-gate read of the diff + AC-7 for the placeholder behaviour.

## Non-goals

- **No hardcoded Cloudflare header name in Java.** The resolver takes a header *name* from
  config; `CF-Connecting-IP` appears only in `application.properties` and docs, so swapping
  CDN (or moving to `True-Client-IP`) is a config edit, not a release.
- **No list of client-IP headers to try in order.** One configured name. A second name is a
  new failure mode (which won?) for no demonstrated need.
- **No removal of the `X-Forwarded-For` walk.** It stays as the fallback and as the correct
  behaviour for a non-CDN deployment; the ~19-file IT corpus keys through it.
- **No `server.forward-headers-strategy`** (framework or native) — #129 Non-goal 1 stands;
  nothing outside rate-limit keying reads the resolver.
- **No automatic refresh of Cloudflare's published ranges** (startup fetch, scheduled job).
  Fetching a third-party list at boot trades silent rot for a startup network dependency and
  a supply-chain input to a security control. The fix is to stop depending on the list.
- **No new ADR.** #129 set the precedent that rate-limit keying is documented in the
  resolver javadoc + `application.properties` + `docs/deploy/`, not an ADR; this slice
  changes the mechanism, not a locked cross-cutting decision. Reversal is a config edit.
- **No distributed/Redis limiter** — single Render instance (ADR-0004).
- **No general "real client IP" facility** for logging/auditing/geo — #129 Non-goal 4 stands.

## Behavior-parity ledger (retirement / replacement slices only)

> The slice changes the resolution *algorithm* of an existing surface; ledger required.

| Old-surface behavior (#129, at `bbcaa75`) | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Untrusted socket peer ⇒ ignore all forwarding headers, key on socket address | **preserved** | first branch of `resolve` is byte-for-byte unchanged; the new header is read *after* it, so it inherits the same gate (AC-2) |
| Trusted peer ⇒ walk `X-Forwarded-For` right-to-left, key on first untrusted hop | **preserved, demoted to fallback** | runs unchanged whenever the configured header is absent/unusable, and when no header is configured at all (AC-3) |
| Absent/blank header ⇒ fall back to socket address | **preserved** | unchanged final fallback |
| All-hops-trusted chain ⇒ fall back to socket address | **preserved** | unchanged |
| Non-IP-literal hop treated as an untrusted client value, no DNS | **preserved** | `InetAddress.ofLiteral` guard untouched; the new header path uses the same literal-only parse |
| Control chars / line separators stripped from every returned value | **preserved** | `sanitise(...)` still on every return path, same regex, now also on the header path |
| `"unknown"` when nothing available | **preserved** | unchanged |
| Address-family length guard on every CIDR compare (`TrustedProxy`) | **preserved — must not be dropped** | Spring Security 7.1's `IpInetAddressMatcher` compares raw bytes with no length check; removing the guard is a remote `AIOOBE` 500 on every limited endpoint |
| Trust list must enumerate every infrastructure hop up to the client | **changed** | with the header configured, the trust list only has to classify the **socket peer**; CDN ranges become unnecessary — the point of the slice |
| Constructed `new ClientIpResolver(props.trustedProxies())` | **changed** | second constructor arg `props.clientIpHeader()`; still built in `RateLimitFilter`, `SecurityConfig` untouched |
| `riviera.ratelimit.trusted-proxies` written literally in `application.properties` | **changed** | now an explicit `${RIVIERA_RATELIMIT_TRUSTED_PROXIES:…}` placeholder — same effective default, same single source, but the env override is visible in the file (issue #286 scope item 4) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Render does not forward `CF-Connecting-IP` to the app** (strips or rewrites it), so the header path is inert and resolution silently degrades to the walk. This is the load-bearing unverified assumption of the whole slice — and it is *exactly* the class of assumption that made #129 wrong twice. No in-JVM test can settle it: unit and slice tests construct the chain they assert on. | med | high | (a) the walk fallback means "inert" = today's behaviour, not a new break; (b) the WARN fires on the first request that misses the header, greppable in Render logs; (c) AC-8's **two-step** rollout keeps the CF CIDRs set until the code is deployed, so the fallback is still *correct* during the interval; (d) unsetting the env var is what makes the probe discriminating, and re-setting it is a one-click rollback | Ivo | open — resolves at AC-8 |
| R-2 | The `${RIVIERA_RATELIMIT_TRUSTED_PROXIES:…}` placeholder mis-parses because the default value contains colons (`::1/128`, `fc00::/7`) — Spring splits name from default on the **first** colon, but a silent mis-parse would ship a wrong or empty trust list, i.e. a security control quietly weakened by a cosmetic edit | med | high | `RateLimitPropertiesBindingTest` (AC-7) asserts the bound list is exactly the 8 expected CIDRs from the real `application.properties`, so a parse regression is a red build, not a production surprise | Ivo | open — closes in phase 1 |
| R-3 | The once-per-JVM WARN latch is consumed by a benign first anomaly, so a *later* genuine breakage is silent | med | low | accepted + documented in the runbook: the WARN is a hint, the probe is the check. Render's health probe never reaches the resolver (`/actuator/health` matches no rate-limited target), so the latch is not consumed by liveness traffic | Ivo | accepted |
| R-4 | An attacker deliberately sends a duplicate `CF-Connecting-IP` to force the fallback and regain the multi-bucket fan-out | low | low | bounded, and strictly better than the alternative: "exactly one value" can only ever *downgrade* to the #129-hardened walk, whereas taking first-of-many would let a client-supplied copy become the key — a full bypass. The ambiguity WARN fires. Cloudflare generates the header itself rather than appending to a client copy, so the multi-value case should not arise at all | Ivo | accepted |
| R-5 | A request reaching the app from a trusted (private) peer **without** traversing Cloudflare could carry a forged `CF-Connecting-IP` and choose its own bucket key | low | med | identical in kind to the trust already placed in `X-Forwarded-For` since #129 (R-3 there), and the locked topology (ADR-0004) has no such ingress: `*.onrender.com` resolves to the Cloudflare-fronted Render edge. Documented in the resolver javadoc; narrowing/emptying `trusted-proxies` disables the whole header path without a release | Ivo | accepted |
| R-6 | The IT corpus regresses the #127 operator-lockout way (bucket isolation collapses) | low | high | the ITs set only `X-Forwarded-For` and never the client-IP header, so they take the unchanged fallback; `SessionLoginSupport.uniqueClientIp()`'s 198.18.x.y (RFC 2544, deliberately untrusted) is untouched and still pinned by `integrationTestClientIpsStayDistinctBuckets` | Ivo | open — closes in phase 2 regression run |
| R-7 | Sonar `java:S1313` (hardcoded IP address) fails the 0-new-issues merge bar | low | med | zero IP literals in **main** Java — every CIDR and header name lives in `application.properties`, the record component defaults to empty/`""`. Test-side literals are unchanged in kind from #129, which cleared the gate | Ivo | open — closes at the Sonar gate |
| R-8 | The new WARN is noisy in local dev and every test JVM, where the header is legitimately absent on every request | high | low | once-per-JVM latch caps it at a single line per process; message names the fallback explicitly so it reads as informational, not alarming | Ivo | accepted |

## Open questions / Assumptions

- **Assumption:** Render forwards `CF-Connecting-IP` unmodified from the Cloudflare edge to
  the container. Cloudflare's docs confirm the edge *sets* it (it generates the header rather
  than appending to a client-supplied copy), and Render demonstrably passes `X-Forwarded-For`
  through while appending to it — but pass-through of this specific header is unverified.
  — *Owner:* Ivo · *Resolves by:* AC-8, post-merge (R-1 carries the rollback).

### Resolved

- **Is the limiter actually enforcing in production right now?** — **Yes.** Re-measured
  independently at plan time (2026-07-22), 200 concurrent `POST /api/auth/operator/login`
  from one client with a constant `X-Forwarded-For`: **11 × `403`, 189 × `429`** = one bucket
  at a cap of 10/min (the 11th is refill during the ~30 s burst). The stopgap env var is
  live and working; this slice must **preserve** that number, not restore it.
- **Is Render's own socket peer inside the trusted private ranges?** — **Yes**, settled
  empirically in #286's stopgap comment (the key demonstrably varied with header content,
  which is only possible from a trusted peer). #129's plan risk R-1 assumption is closed; do
  not re-litigate it.
- **Does Cloudflare append to `CF-Connecting-IP` or set it?** — **Sets it.** Cloudflare
  generates the header from the connecting IP rather than modifying a client-supplied value;
  `X-Forwarded-For`, by contrast, is *appended* to. This is why the header needs no chain
  walk while `X-Forwarded-For` does.
- **Keep or retire the 30-CIDR stopgap value?** — **Retire the Cloudflare portion, after
  the deployed probe confirms the header path** (user decision, plan gate). Decisive reason:
  while those ranges stay trusted, the header path and the walk resolve to the **identical
  key**, so the probe passes either way and cannot detect a broken header path — keeping
  them would disarm the only end-to-end check we have. The env var itself survives as a
  documented per-environment escape hatch and as the R-1 rollback.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches only how the rate limiter derives a
map key at the platform edge. No `availability(set_id, booking_date)` write path, no booking
lifecycle, no beach map, no schema. The one adjacent concern is *availability* in the
uptime sense — over-throttling real users — which is why the walk fallback is preserved
rather than replaced (see the "Header only" option rejected at the plan gate: its failure
mode collapses every client onto one bucket).

## Spring Modulith — modules, interfaces, events

**Modules touched:** **none.** `ClientIpResolver`, `RateLimitFilter` and
`RateLimitProperties` live in the root package `ai.riviera.platform`, alongside
`SecurityConfig`/`WebCorsConfig` — and per ADR-0007 **the root package is not a module**.
Login/limiting machinery stays at the platform edge (RV-BE-11), so there is no `api/`,
`spi/`, `vocabulary/` or `events/` change, no `allowedDependencies` edit, and no new
cross-module dependency.

**Cross-module named interfaces (`api/` ports):** `N/A — no cross-module surface changes.`

**Domain events:** `N/A — no events published or consumed.`

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Derive the rate-limit client-IP key from a CDN-set header before falling back to the forwarded chain | **root package (edge), no module** | Rate limiting is cross-cutting request-handling machinery at the platform edge, not a bounded context. It is on no module's **Job** list, and putting request-header parsing inside e.g. `operator` or `customer` would violate their Not-My-Job boundary (`customer` explicitly does **not** own login machinery — RV-BE-11, the S2/#111 precedent). Sits beside `SecurityConfig`, exactly where #129 put the resolver. |
| Configure the header name + trusted-proxy CIDRs | **root package** (`RateLimitProperties`) | already the home of `riviera.ratelimit.*`; the new component is one more tunable on the same record |

`ModularityTests` / `PackageShapeArchitectureTests` / `PublishedSurfacePlacementArchitectureTests`
are expected to be **unaffected**; phase 2 runs them anyway as the structural net.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money, no ledger, no Stripe/Paysera surface.

## Angular — frontend surfaces touched

`N/A — backend-only.` No component, route, service, style or e2e spec changes. The
`playwright-cli` row of the Skill-routing gate is therefore not triggered; the end-to-end
verification for this slice is the deployed-app probe (AC-8), not a browser flow.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, status code or error body changes. The `429` +
`Retry-After` + `RATE_LIMITED` `ProblemDetail` shape is untouched.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `implement — phase 1`

**Next action:** Write the failing `RateLimitPropertiesBindingTest` + the
`oneClientBehindRotatingEdgeNodesSharesOneLoginBucket` filter pin, then add the two
`application.properties` placeholders.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Resolver: header-preferred resolution + rot signal | ✅ | `<phase-0>` — 23/23 `ClientIpResolverTest` green (15 pre-existing #129 cases unchanged + 8 new) |
| 1 — Config surface: properties, wiring, binding + filter pins | ⏳ | resolver wiring (`RateLimitProperties.clientIpHeader`, `RateLimitFilter:120`) landed in phase 0 — it was needed to compile |
| 2 — Docs, runbook, scoped regression, structural net | | |
| 3 — PR + gates (CI / review / Sonar) | | |
| 4 — Post-merge: CD, env retirement, AC-8 probe | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for
what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/ClientIpResolver.java` — **modify**: second
  constructor arg (header name), the preferred header path, the once-per-JVM rot WARN,
  javadoc rewritten for the real Cloudflare→Render→app topology.
- `platform/src/main/java/ai/riviera/platform/RateLimitProperties.java` — **modify**: new
  `clientIpHeader` record component, defaulting to `""` ("no header — walk only").
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — **modify**: one line,
  pass `props.clientIpHeader()` into the resolver.
- `platform/src/main/resources/application.properties` — **modify**: `trusted-proxies`
  becomes an explicit `${RIVIERA_RATELIMIT_TRUSTED_PROXIES:…}` placeholder; new
  `client-ip-header=${RIVIERA_RATELIMIT_CLIENT_IP_HEADER:CF-Connecting-IP}` with the
  topology comment.
- `platform/src/test/java/ai/riviera/platform/ClientIpResolverTest.java` — **modify**: 7 new
  cases (AC-1..AC-5 + the WARN).
- `platform/src/test/java/ai/riviera/platform/RateLimitPropertiesBindingTest.java` —
  **create**: binds the real `application.properties` (AC-7, R-2).
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — **modify**: the
  rotating-edge-node bucket-sharing pin (AC-6).
- `docs/runbooks/rate-limit-client-ip.md` — **create**: the probe, its thresholds, the
  two-step env retirement + rollback, and what the WARN means.
- `docs/deploy/cd-pipeline.md` — **modify**: correct the `RIVIERA_RATELIMIT_TRUSTED_PROXIES`
  bullet (it **is** set), record value + provenance + drift risk + retirement; add
  `RIVIERA_RATELIMIT_CLIENT_IP_HEADER`.
- `docs/deploy/production-hardening.md` — **modify**: extend the 2026-07-22 #129 note with
  the #286 outcome.
- `docs/plans/issue-129-trusted-proxy-rate-limit.md` — **modify**: close AC-7 / R-1 by
  pointing at this slice.

---

## Phase 0 — Resolver: header-preferred resolution + rot signal

**Files:** Modify `platform/src/main/java/ai/riviera/platform/ClientIpResolver.java` ·
Test `platform/src/test/java/ai/riviera/platform/ClientIpResolverTest.java`

- [ ] **Step 1: Write the failing tests** (append to `ClientIpResolverTest`; the existing
  `resolver` field stays as the no-header resolver so every #129 case keeps asserting the
  walk unchanged — AC-3)

```java
	private static final String CF_HEADER = "CF-Connecting-IP";

	private final ClientIpResolver edgeAware = new ClientIpResolver(DEFAULT_TRUSTED, CF_HEADER);

	@Test
	void prefersTheEdgeSuppliedClientOverTheForwardedChain() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		request.addHeader("X-Forwarded-For", "6.6.6.6, 198.51.100.9");
		request.addHeader(CF_HEADER, "203.0.113.7");

		assertEquals("203.0.113.7", edgeAware.resolve(request));
	}

	@Test
	void ignoresTheClientIpHeaderFromAnUntrustedPeer() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("198.51.100.4"); // public peer — not a trusted proxy
		request.addHeader(CF_HEADER, "6.6.6.6");

		assertEquals("198.51.100.4", edgeAware.resolve(request));
	}

	@Test
	void fallsBackToTheForwardedWalkWhenTheHeaderIsAbsent() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		request.addHeader("X-Forwarded-For", "6.6.6.6, 203.0.113.7");

		assertEquals("203.0.113.7", edgeAware.resolve(request));
	}

	@Test
	void ignoresAMultiValuedClientIpHeader() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		// A client-supplied copy surviving alongside the edge's own value: taking first-of-many
		// would hand the key to the attacker, so the whole header is discarded.
		request.addHeader(CF_HEADER, "6.6.6.6");
		request.addHeader(CF_HEADER, "203.0.113.7");
		request.addHeader("X-Forwarded-For", "1.2.3.4, 198.51.100.9");

		assertEquals("198.51.100.9", edgeAware.resolve(request));
	}

	@Test
	void ignoresANonLiteralClientIpHeader() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		request.addHeader(CF_HEADER, "203.0.113.7, 6.6.6.6"); // a chain, not a single address
		request.addHeader("X-Forwarded-For", "1.2.3.4, 198.51.100.9");

		assertEquals("198.51.100.9", edgeAware.resolve(request));
	}

	/**
	 * The measured production shape (#286): client -> Cloudflare edge -> Render -> app, with only the
	 * SHIPPED private ranges trusted. The chain's right-most hop is the public, per-request-varying
	 * Cloudflare edge, so the walk keys on the edge node; the edge-supplied header keys on the client.
	 */
	@Test
	void resolvesTheClientOnACloudflareShapedChainWithoutCloudflareCidrs() {
		assertEquals("203.0.113.7", edgeAware.resolve(cloudflareShaped(true)));
	}

	@Test
	void withoutTheHeaderTheWalkStillKeysOnTheEdgeHop() {
		assertEquals("162.158.1.1", resolver.resolve(cloudflareShaped(false)));
	}

	private static MockHttpServletRequest cloudflareShaped(boolean withEdgeHeader) {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1"); // Render's internal hop — private, trusted by default
		request.addHeader("X-Forwarded-For", "6.6.6.6, 203.0.113.7, 162.158.1.1");
		if (withEdgeHeader) {
			request.addHeader(CF_HEADER, "203.0.113.7");
		}
		return request;
	}

	@Test
	void warnsOnceWhenTheConfiguredHeaderIsMissing() {
		Logger logger = (Logger) LoggerFactory.getLogger(ClientIpResolver.class);
		ListAppender<ILoggingEvent> appender = new ListAppender<>();
		appender.start();
		logger.addAppender(appender);
		try {
			ClientIpResolver fresh = new ClientIpResolver(DEFAULT_TRUSTED, CF_HEADER);
			MockHttpServletRequest request = new MockHttpServletRequest();
			request.setRemoteAddr("10.0.0.1");
			fresh.resolve(request);
			fresh.resolve(request);

			assertEquals(1, appender.list.stream().filter(e -> e.getLevel() == Level.WARN).count());
		}
		finally {
			logger.detachAppender(appender);
		}
	}
```

- [ ] **Step 2: Run it, verify it fails** —
  `./gradlew test --tests "*ClientIpResolverTest*"` → FAIL: constructor
  `ClientIpResolver(List, String)` does not exist (compile error).

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation** (`ClientIpResolver`)

```java
	private static final Logger log = LoggerFactory.getLogger(ClientIpResolver.class);

	private final List<TrustedProxy> trustedProxies;
	private final String clientIpHeader;
	private final AtomicBoolean absenceWarned = new AtomicBoolean();
	private final AtomicBoolean ambiguityWarned = new AtomicBoolean();

	ClientIpResolver(List<String> trustedProxyCidrs, String clientIpHeader) {
		this.trustedProxies = trustedProxyCidrs.stream().map(TrustedProxy::of).toList();
		this.clientIpHeader = clientIpHeader == null ? "" : clientIpHeader.trim();
	}

	String resolve(HttpServletRequest request) {
		String peer = request.getRemoteAddr();
		if (!isTrustedProxy(peer)) {
			return sanitise(peer);
		}
		String edgeClient = edgeSuppliedClient(request);
		if (edgeClient != null) {
			return edgeClient;
		}
		String forwarded = request.getHeader(FORWARDED_FOR);
		if (forwarded != null && !forwarded.isBlank()) {
			String[] hops = forwarded.split(",");
			for (int i = hops.length - 1; i >= 0; i--) {
				String hop = hops[i].trim();
				if (!hop.isEmpty() && !isTrustedProxy(hop)) {
					return sanitise(hop);
				}
			}
		}
		return sanitise(peer);
	}

	/**
	 * The client address the edge computed for us, or {@code null} when no header is configured or the
	 * one configured is unusable — absent, repeated, or not a single IP literal. Only ever consulted
	 * behind a trusted peer, and deliberately all-or-nothing: first-of-many would let a client-supplied
	 * copy become the key, so an ambiguous header is discarded rather than guessed at.
	 */
	private String edgeSuppliedClient(HttpServletRequest request) {
		if (clientIpHeader.isEmpty()) {
			return null;
		}
		List<String> values = Collections.list(request.getHeaders(clientIpHeader));
		if (values.isEmpty()) {
			warnOnce(absenceWarned, "is absent");
			return null;
		}
		if (values.size() > 1) {
			warnOnce(ambiguityWarned, "arrived more than once");
			return null;
		}
		String value = values.getFirst().trim();
		if (!isIpLiteral(value)) {
			warnOnce(ambiguityWarned, "is not a single IP literal");
			return null;
		}
		return sanitise(value);
	}

	private void warnOnce(AtomicBoolean latch, String problem) {
		if (latch.compareAndSet(false, true)) {
			log.warn("Client-IP header '{}' {} behind a trusted proxy peer; falling back to the {} walk. "
					+ "Rate-limit buckets may be keyed per edge node rather than per client — see "
					+ "docs/runbooks/rate-limit-client-ip.md", clientIpHeader, problem, FORWARDED_FOR);
		}
	}

	private static boolean isIpLiteral(String value) {
		try {
			InetAddress.ofLiteral(value);
			return true;
		}
		catch (IllegalArgumentException notAnIpLiteral) {
			return false;
		}
	}
```

> The WARN interpolates only config-supplied and hard-coded text — never the header
> **value**, which is attacker-influenced in the ambiguous case (`riviera-java-conventions`
> §10 log-injection guard).

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*ClientIpResolverTest*"` → PASS
  (new cases **and** all 14 pre-existing #129 cases, which prove AC-3's parity claim).

- [ ] **Step 5: Generalization-audit pass** — search for other consumers of forwarding
  headers: `grep -rn "X-Forwarded-For\|getRemoteAddr" platform/src/main/java`. Expect
  `ClientIpResolver` only (#129's audit found the same); record the result in the log below.

- [ ] **Step 6: Commit** — `git commit -m "Prefer the edge-supplied client IP over the forwarded-chain walk (#286)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Config surface: properties, wiring, binding + filter pins

**Files:** Modify `RateLimitProperties.java`, `RateLimitFilter.java:120`,
`application.properties` · Create `RateLimitPropertiesBindingTest.java` · Modify
`RateLimitFilterTest.java`

- [ ] **Step 1: Write the failing tests**

```java
/**
 * Pins the SHIPPED rate-limit configuration (#286 AC-7): the defaults live in
 * {@code application.properties} and nowhere else, every one of them is env-overridable through an
 * explicit placeholder, and the colon-bearing IPv6 CIDRs survive placeholder parsing — a silent
 * mis-parse there would ship a weakened security control.
 */
class RateLimitPropertiesBindingTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(RateLimitProperties.class)
	static class BindOnly {
	}

	@Test
	void bindsTheShippedTrustedProxyDefaultsIncludingTheIpv6Ranges() {
		runner.run(context -> assertThat(context.getBean(RateLimitProperties.class).trustedProxies())
				.containsExactly("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
						"169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10"));
	}

	@Test
	void bindsTheShippedClientIpHeaderDefault() {
		runner.run(context -> assertThat(context.getBean(RateLimitProperties.class).clientIpHeader())
				.isEqualTo("CF-Connecting-IP"));
	}

	@Test
	void theEnvironmentOverridesBothPlaceholders() {
		runner.withSystemProperties(
				"RIVIERA_RATELIMIT_TRUSTED_PROXIES=203.0.113.0/24",
				"RIVIERA_RATELIMIT_CLIENT_IP_HEADER=True-Client-IP")
				.run(context -> {
					RateLimitProperties props = context.getBean(RateLimitProperties.class);
					assertThat(props.trustedProxies()).containsExactly("203.0.113.0/24");
					assertThat(props.clientIpHeader()).isEqualTo("True-Client-IP");
				});
	}
}
```

```java
	// ---- One client, many edge nodes: still ONE bucket (#286) ----

	private ResultActions loginViaEdge(String client, String edge) throws Exception {
		return mvc.perform(post("/api/auth/operator/login").with(fromIp("10.14.0.1")).with(csrf())
				.header("X-Forwarded-For", client + ", " + edge)
				.header("CF-Connecting-IP", client)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "ghost", "password": "nope"}"""));
	}

	/**
	 * The production defect (#286): one client is load-balanced across Cloudflare edge nodes, so the
	 * right-most forwarded hop varies per request. Keyed on the edge that is ~14 buckets; keyed on the
	 * edge-supplied client header it is one.
	 */
	@Test
	void oneClientBehindRotatingEdgeNodesSharesOneLoginBucket() throws Exception {
		loginViaEdge("203.0.113.90", "162.158.1.1").andExpect(status().isUnauthorized());
		loginViaEdge("203.0.113.90", "104.16.2.2").andExpect(status().isUnauthorized());
		loginViaEdge("203.0.113.90", "172.64.3.3")
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}
```

- [ ] **Step 2: Run them, verify they fail** —
  `./gradlew test --tests "*RateLimitPropertiesBindingTest*" --tests "*RateLimitFilterTest*"`
  → FAIL: `clientIpHeader()` undefined; the filter test's 3rd request is `401`, not `429`.

- [ ] **Step 3: Minimal implementation**

`RateLimitProperties` — new component + javadoc `@param` (records-first, no Lombok):

```java
		@DefaultValue List<String> trustedProxies,
		@DefaultValue("") String clientIpHeader) {
```

```java
 * @param clientIpHeader name of the header a trusted upstream edge sets to the ORIGINATING client
 *                       address (issue #286). When set and the socket peer is trusted, its single
 *                       value is the rate-limit key directly — no {@code X-Forwarded-For} walk, so
 *                       the trust list never has to enumerate the CDN's own (rotating, published)
 *                       ranges. The shipped value lives in {@code application.properties}, the only
 *                       place it is written. Absent here it defaults to <strong>empty</strong>, i.e.
 *                       "no edge header — walk only", which is exactly the pre-#286 behaviour.
```

`RateLimitFilter:120`:

```java
		this.clientIps = new ClientIpResolver(props.trustedProxies(), props.clientIpHeader());
```

`application.properties` — both settings as explicit placeholders (scope item 4):

```properties
riviera.ratelimit.trusted-proxies=${RIVIERA_RATELIMIT_TRUSTED_PROXIES:127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,::1/128,fc00::/7,fe80::/10}
riviera.ratelimit.client-ip-header=${RIVIERA_RATELIMIT_CLIENT_IP_HEADER:CF-Connecting-IP}
```

with the comment block rewritten to describe the **real** topology (client → Cloudflare edge
→ Render → app), why the header is preferred, and that an empty value falls back to the walk.

- [ ] **Step 4: Run them, verify they pass** — same command → PASS.

- [ ] **Step 5: Generalization-audit pass** — search for other env-driven settings still
  lacking a visible placeholder: `grep -n "^[a-z].*=" platform/src/main/resources/application.properties | grep -v '\${'`.
  Decide per hit whether it is genuinely env-driven (fix) or a local-only constant (skip);
  record in the log.

- [ ] **Step 6: Commit** — `git commit -m "Configure the edge client-IP header and make both rate-limit env overrides visible (#286)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Docs, runbook, scoped regression, structural net

**Files:** Create `docs/runbooks/rate-limit-client-ip.md` · Modify `docs/deploy/cd-pipeline.md`,
`docs/deploy/production-hardening.md`, `docs/plans/issue-129-trusted-proxy-rate-limit.md`

- [ ] **Step 1: Write the runbook** — `docs/runbooks/rate-limit-client-ip.md`, carrying:
  the 200-request probe verbatim; the pass threshold (**~10 non-`429`**) and the fail
  signature (**~140 non-`429` ≈ 14 buckets**); the explicit warning that **small bursts are
  useless** (14/25/60 requests all fit inside the fan-out and produce zero `429`s — the
  measurement error that caused the original misdiagnosis); the two-step env retirement with
  its rollback; and how to read the resolver WARN in Render logs.

- [ ] **Step 2: Correct `docs/deploy/cd-pipeline.md`** — replace "needs setting; the shipped
  default is NOT sufficient" with: the variable **is** set (30 CIDRs = 8 shipped defaults +
  Cloudflare's published IPv4/IPv6 ranges), its provenance (`cloudflare.com/ips-v4`,
  `/ips-v6`, fetched 2026-07-22), the **drift risk** (a hand-maintained copy of a
  third-party list; when Cloudflare adds a range the old bug returns silently), and that
  #286 makes it **retirable** — pointing at the runbook for the two-step. Add
  `RIVIERA_RATELIMIT_CLIENT_IP_HEADER` (unset ⇒ the shipped `CF-Connecting-IP`).

- [ ] **Step 3: Update `production-hardening.md` + the #129 plan doc** — extend the
  2026-07-22 note with the #286 outcome; close #129's AC-7 and R-1 rows by pointing here.

- [ ] **Step 4: Scoped regression + the structural net**

```bash
./gradlew test --tests "*ClientIpResolverTest*" --tests "*RateLimitFilterTest*" \
  --tests "*RateLimitPropertiesBindingTest*"
./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" \
  --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"
```

  Plus one Docker-gated auth IT to prove the #127 bucket-isolation class did not regress
  (R-6): `./gradlew test --tests "*AuthSessionIT*"` (skips cleanly without a daemon; CI owns
  the full suite either way).

- [ ] **Step 5: Generalization-audit pass** — search the docs substrate for other places
  that still assert the pre-#286 keying story:
  `grep -rn "right-most\|trusted-proxies\|X-Forwarded-For" docs/ .claude/skills/ --include=*.md`.
  Patch or defer each; record in the log. (`riviera-docs-freshness` re-runs this at merge
  close-out step 5.)

- [ ] **Step 6: Commit** — `git commit -m "Document the durable client-IP path and correct the deploy guidance (#286)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — PR + gates

- [ ] **Step 1: Merge latest `origin/main` into the branch FIRST.** The ruleset uses
  `strict_required_status_checks_policy`, so a branch even one commit behind `main` blocks
  the merge with a misleading "7 of 7 required status checks are expected". Integrate with
  full phase discipline (routing gate for whatever the integration touches, scoped tests,
  honest commit).
- [ ] **Step 2: Push, open the PR into `main`**, referencing #286 and #129.
- [ ] **Step 3: CI gate** — confirm the run for the pushed head is green before claiming the
  phase done (`riviera-sdlc` rule 3).
- [ ] **Step 4: Review gate** — `riviera-review-overlay` + `/code-review` per
  `references/pr-gates.md` §1. Every finding re-enters at Implement.
- [ ] **Step 5: Sonar gate** — pull the **issue list via the API**, not the gate badge; the
  bar is 0 new issues, 0 duplicated blocks, ≥80% new-code coverage. Watch specifically for
  `java:S1313` (R-7).
- [ ] **Step 6: Update plan-doc execution status**; **stop before merging** and report.

---

## Phase 4 — Post-merge: CD, env retirement, AC-8

> Not part of the PR. Sequenced deliberately: code first (fallback still correct because the
> CF ranges remain trusted), then narrow the trust, then measure.

- [ ] **Step 1:** CD deploys `main` to Render (`deploy.yml`; the service has autoDeploy
  **off**, so the workflow is the trigger). Confirm the deploy is live.
- [ ] **Step 2:** Probe with the CF CIDRs still set → expect ~10 non-`429`. This proves *no
  regression*; it cannot yet prove the header path works, because both paths resolve to the
  same key while those ranges are trusted.
- [ ] **Step 3:** **Unset** `RIVIERA_RATELIMIT_TRUSTED_PROXIES` on
  `srv-d904jdbtqb8s73fera5g` so only the shipped private ranges are trusted; wait for the
  restart.
- [ ] **Step 4: AC-8.** Re-probe. **~10 non-`429` ⇒ the header path is confirmed and the
  hand-maintained CIDR list is retired for good.** ~140 non-`429` ⇒ the header path is inert
  (R-1 materialised): **roll back by re-setting the env var**, then reopen #286 with the
  measurement.
- [ ] **Step 5:** Record the outcome in this doc's Execution status + AC-8, close #286, and
  run the merge close-out (`references/pr-gates.md` §3), including
  `riviera-docs-freshness` and `graphify update .` for the doc-touching diff.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-22 | phase 0 | other consumers of forwarding headers / the socket peer in main | `grep -rn "X-Forwarded-For\|getRemoteAddr\|CF-Connecting" platform/src/main/java --include=*.java` | `ClientIpResolver` only (all other hits are javadoc in it + `RateLimitProperties`) | skip — the resolver is still the single client-IP consumer, same conclusion as #129's audit; nothing to generalize |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-5:** `./gradlew test --tests "*ClientIpResolverTest*"` → PASS (new + all 14 #129 cases).
- [ ] **AC-6:** `./gradlew test --tests "*RateLimitFilterTest*"` → PASS.
- [ ] **AC-7:** `./gradlew test --tests "*RateLimitPropertiesBindingTest*"` → PASS.
- [ ] **AC-8:** runbook probe against the deployed app, **after** step 3 of phase 4 → ~10 non-`429` / 200.
- [ ] **AC-9:** review-gate read of the `docs/deploy/` + `application.properties` diff.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test (AC-8 is explicitly manual, with
      its rollback written down).
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified `N/A`; no availability write path touched).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; root-package edge only, no module surface change (invariant #11).
- [ ] **Payment/payout** section `N/A` and true — no money in the diff.
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes still never logged — the new WARN carries a header **name**, never a value
      or a code (invariant #7).
- [ ] No Flyway migration needed; none added (invariant #12).
- [ ] **Frontend** `N/A` and true — zero files under `frontend/`.
- [ ] The #129 address-family length guard on `TrustedProxy` is still present (parity ledger).
- [ ] `SessionLoginSupport.uniqueClientIp()` still mints an **untrusted** 198.18.x.y (the #127
      lockout guard) and is still pinned.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
