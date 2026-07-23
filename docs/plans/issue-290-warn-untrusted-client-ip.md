# Warn on a Client-IP Header from an Untrusted Peer (#290) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the socket peer is **not** trusted and the configured client-IP header is
nonetheless present on the request, log **once per process** at `WARN` naming the likely
cause (the trusted-proxy list missing the upstream edge's ranges) — turning the silent
trust-list-rot failure mode into a signal on the first affected request, **without changing
any resolution behaviour**.

**Architecture:** The one decision is *where the new signal sits and that it stays
observability-only*. `ClientIpResolver.resolve` returns at its very first branch when the
peer is untrusted (`#129`'s bypass closure — the header must still be ignored); the warning
is added on that branch, gated on the header actually being present, behind a **third**
`AtomicBoolean` latch matching the existing `absenceWarned` / `ambiguityWarned` pattern. No
return value, no key, no branch order changes.

**Persistence:** JDBC only (invariant #1). **No tables, no migration** — this slice touches
no schema, claims no `V<n>`.

**Source of intent:** GitHub issue **#290** (split out of **#286**); the corrected topology
model lives in `docs/plans/issue-286-durable-client-ip.md` (Execution status) and
`docs/runbooks/rate-limit-client-ip.md`.

**Skills consulted:** `riviera-sdlc` (stage routing; issue-intake grill of #290 against
today's code — confirmed `resolve` still returns silently at the untrusted-peer branch, no
Flyway number in flight) · `riviera-plan-doc` (this template + the Execution-status state
store) · `riviera-java-conventions` (third `AtomicBoolean` latch + `compareAndSet` once-latch
idiom; §6c one-line-comment rule; **§10 log-injection guard** — the WARN interpolates only
the configured header **name**, never its attacker-influenced value) · `riviera-modulith`
(**placement check only**: the change adds a method + latch to an existing root-package edge
class; the root package is **not** a module — no `@NamedInterface`, no `allowedDependencies`,
no `ModularityTests` surface change) · `riviera-local-debug` (scoped test runs;
`--tests "*ClientIpResolverTest*" --tests "*RateLimitFilterTest*"`, never the bare `test`
task). Not triggered: `postgres` (no migration), `riviera-frontend` / `angular-developer` /
`playwright-cli` (no frontend surface — the resolver is not user-observable; end-to-end
verification is the deployed-app probe/log, not a browser flow), `riviera-stripe-payments`
(no money).

**Branch:** cloud session — the designated remote branch **`claude/sdlc-290-io1r0m`** stands
in for `bugfix/290-warn-untrusted-client-ip` (per the riviera-sdlc remote-session addendum).

---

## Acceptance criteria (testable)

> Written at the resolver boundary (the inner hexagon of this edge concern), using the
> existing `warningsWhileResolving(...)` helper that counts WARNs from one fresh resolver.

- [ ] **AC-1:** Given an untrusted socket peer and a request carrying the configured
  client-IP header, when resolved, then the key is still the socket address **and** exactly
  one `WARN` is logged. *Pinned by:*
  `ClientIpResolverTest.warnsWhenAClientIpHeaderArrivesFromAnUntrustedPeer`
- [ ] **AC-2:** Given an untrusted peer and **no** client-IP header, when resolved, then
  **no** warning is logged — an ordinary direct caller must not produce noise. *Pinned by:*
  `ClientIpResolverTest.doesNotWarnForADirectCallerWithoutTheClientIpHeader`
- [ ] **AC-3:** The warning fires **at most once per process** across many such requests.
  *Pinned by:* `ClientIpResolverTest.warnsAtMostOnceForRepeatedUntrustedPeerHeaders`
- [ ] **AC-4:** The warning never interpolates the header **value** (attacker-influenced) —
  only the configured header **name** and hard-coded text. *Verified by:* review-gate read
  of the WARN statement (RV-BE-13 / `riviera-java-conventions` §10); no value ever reaches
  the logger.
- [ ] **AC-5:** Every existing `ClientIpResolverTest` (25) and `RateLimitFilterTest` (15)
  case stays green **unchanged** — this is observability-only. *Pinned by:* the whole
  pre-existing corpus, run scoped.
- [ ] **AC-6:** `docs/runbooks/rate-limit-client-ip.md` gains a **"refreshing the Cloudflare
  ranges"** procedure (re-fetch `ips-v4` + `ips-v6`, diff against
  `RIVIERA_RATELIMIT_TRUSTED_PROXIES`, update) **and** documents what this new WARN means
  when it appears. *Verified by:* review-gate read of the doc diff.

## Non-goals

- **No change to which value becomes the rate-limit key.** The header stays ignored from an
  untrusted peer (invariant-critical #129 bypass closure); this adds observability only.
- **No static latch.** The latch is per-resolver-instance (one line per Spring context in
  the full suite), matching the existing two latches — deliberately not "fixed" into a
  process-static field (issue "Watch out for").
- **No removal of the CIDR list** (impossible without infra — sibling #291).
- **No auto-fetch of Cloudflare's ranges at runtime** (rejected in #286: a startup network
  dependency + a supply-chain input to a security control).

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — additive observability, replaces nothing.` No existing behaviour is removed or
altered; every prior return path is byte-for-byte unchanged (AC-5 pins this).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The new WARN interpolates the attacker-influenced header **value**, enabling log forging | low | high | the WARN carries only the configured header **name** + hard-coded text; no request value is ever passed to it (AC-4); consistent with the existing `warnOnce` guard | Ivo | open |
| R-2 | The new branch changes resolution behaviour (return value / branch order), breaking the #129 bypass closure | low | high | the warning is a side-effect *before* the unchanged `return sanitise(peer)`; the whole 25+15 corpus runs green unchanged (AC-5), incl. `ignoresTheClientIpHeaderFromAnUntrustedPeer` | Ivo | open |
| R-3 | Full-suite noise / cross-test latch bleed (the #127-class shared-state trap) | low | low | local-dev + IT peers are loopback (**trusted**), so this branch is not hit there — no new noise (verify, don't assume); the counting tests each build a **fresh** resolver via `warningsWhileResolving`, so no latch bleeds across tests | Ivo | open |
| R-4 | The once-per-process latch is consumed by a benign first anomaly, silencing a later genuine one | med | low | accepted + already documented in the runbook (the WARN is a hint, the probe is the check); identical trade-off to the two existing latches | Ivo | accepted |

## Open questions / Assumptions

- **Assumption:** on the deployed topology the socket peer is a Cloudflare edge address (so
  this branch fires only when the trust list has *drifted* to no longer cover it) — verified
  by the 2026-07-22 measurement recorded in the #286 plan + runbook. — *Owner:* Ivo ·
  *Resolves by:* already measured (#286).

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice adds a log line at the platform edge (rate-
limit key derivation). No `availability(set_id, booking_date)` write path, no booking
lifecycle, no beach map, no schema.

## Spring Modulith — modules, interfaces, events

**Modules touched:** **none.** `ClientIpResolver` lives in the root package
`ai.riviera.platform` alongside `SecurityConfig` — per ADR-0007 **the root package is not a
module**. Login/limiting machinery stays at the platform edge (RV-BE-11), so there is no
`api/`, `spi/`, `vocabulary/` or `events/` change, no `allowedDependencies` edit, no new
cross-module dependency.

**Cross-module named interfaces (`api/` ports):** `N/A — no cross-module surface changes.`

**Domain events:** `N/A — no events published or consumed.`

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Emit a rot signal when a client-IP header arrives from an untrusted peer | **root package (edge), no module** | Rate limiting is cross-cutting request-handling machinery at the platform edge, not a bounded context — on no module's **Job** list; `customer`/`operator` explicitly do **not** own login/limiting machinery (RV-BE-11). Sits beside `SecurityConfig`, exactly where #129/#286 put the resolver. |

`ModularityTests` / `PackageShapeArchitectureTests` / `PublishedSurfacePlacementArchitectureTests`
are expected **unaffected**; the structural net runs anyway as the check.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money, ledger, or Stripe surface.

## Angular — frontend surfaces touched

`N/A — backend-only.` No component, route, service, style or e2e spec. The resolver is not
user-observable; end-to-end verification for this failure class is the deployed-app probe +
Render-log WARN (per the runbook), not a browser flow — so the `playwright-cli` gate row is
not triggered.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, status code or error body changes.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `plan committed → implement (phase 0)`

**Next action:** Write the three failing `ClientIpResolverTest` cases (AC-1..AC-3), watch
them fail, then add the untrusted-peer WARN branch + latch.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Resolver: untrusted-peer-with-header WARN + latch | | |
| 1 — Runbook: Cloudflare-range refresh procedure + WARN meaning | | |
| 2 — PR + gates (CI / review / Sonar) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/ClientIpResolver.java` — **modify**: a third
  `untrustedPeerWarned` latch, a `warnClientIpHeaderFromUntrustedPeer(request)` call on the
  untrusted-peer branch of `resolve`, and its once-per-process method; javadoc updated to
  drop the "deliberately not covered yet" caveat.
- `platform/src/test/java/ai/riviera/platform/ClientIpResolverTest.java` — **modify**: 3 new
  cases (AC-1..AC-3) via the existing `warningsWhileResolving(...)` helper.
- `docs/runbooks/rate-limit-client-ip.md` — **modify**: a "refreshing the Cloudflare ranges"
  procedure + what the new untrusted-peer WARN means.

---

## Phase 0 — Resolver: untrusted-peer-with-header WARN + latch

**Files:** Modify `ClientIpResolver.java` · Test `ClientIpResolverTest.java`

- [ ] **Step 1: Write the failing tests** (append to `ClientIpResolverTest`)

```java
	// ---- A client-IP header from an UNTRUSTED peer names the trust-list gap (#290) ----

	/**
	 * The fingerprint of a trust list no longer covering the upstream edge's ranges: the configured
	 * header arrives, but from an untrusted peer, so it is (correctly) ignored — the key stays the
	 * socket address, #129's bypass closure untouched — and exactly one WARN names the likely cause.
	 */
	@Test
	void warnsWhenAClientIpHeaderArrivesFromAnUntrustedPeer() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("198.51.100.4"); // public peer — not a trusted proxy
		request.addHeader(CF_HEADER, "6.6.6.6");

		assertEquals("198.51.100.4", edgeAware.resolve(request)); // key is still the socket address
		assertEquals(1, warningsWhileResolving(request));
	}

	/** An ordinary direct caller — untrusted peer, no client-IP header — must produce no noise (AC-2). */
	@Test
	void doesNotWarnForADirectCallerWithoutTheClientIpHeader() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("198.51.100.4");

		assertEquals(0, warningsWhileResolving(request));
	}

	/** The untrusted-peer warning fires at most once per process across many such requests (AC-3). */
	@Test
	void warnsAtMostOnceForRepeatedUntrustedPeerHeaders() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("198.51.100.4");
		request.addHeader(CF_HEADER, "6.6.6.6");

		assertEquals(1, warningsWhileResolving(request, request, request));
	}
```

- [ ] **Step 2: Run it, verify it fails** —
  `gradle --no-daemon --console=plain test --tests "*ClientIpResolverTest*"` → FAIL:
  `warnsWhenAClientIpHeaderArrivesFromAnUntrustedPeer` expects 1 WARN, gets 0.

- [ ] **Step 3: Minimal implementation** (`ClientIpResolver`)

```java
	private final AtomicBoolean untrustedPeerWarned = new AtomicBoolean();

	String resolve(HttpServletRequest request) {
		String peer = request.getRemoteAddr();
		if (!isTrustedProxy(peer)) {
			warnClientIpHeaderFromUntrustedPeer(request);
			return sanitise(peer);
		}
		// … unchanged …
	}

	/**
	 * A configured client-IP header arriving from an UNTRUSTED peer is the fingerprint of the
	 * trusted-proxy list no longer covering the upstream edge's ranges (issue #290). The header is
	 * still ignored — #129's bypass closure — but the silence that made the failed #286 retirement
	 * need a log-ABSENCE deduction is not acceptable, so name the likely cause once per process.
	 * Never interpolates the header VALUE, which is attacker-influenced whenever this fires.
	 */
	private void warnClientIpHeaderFromUntrustedPeer(HttpServletRequest request) {
		if (clientIpHeader.isEmpty() || request.getHeader(clientIpHeader) == null) {
			return;
		}
		if (untrustedPeerWarned.compareAndSet(false, true)) {
			log.warn("Client-IP header '{}' arrived from an UNTRUSTED socket peer and was ignored "
					+ "(bypass closure #129). This is the fingerprint of the trusted-proxy list missing the "
					+ "upstream edge's ranges — see docs/runbooks/rate-limit-client-ip.md", clientIpHeader);
		}
	}
```

- [ ] **Step 4: Run it, verify it passes** — same command → PASS (3 new + all 25 pre-existing).

- [ ] **Step 5: Generalization-audit pass** — the two sibling silent-loss branches
  (absence, ambiguity) already warn; this closes the last one. No other consumer of the
  peer/header exists (`ClientIpResolver` is the sole client-IP consumer, per #129/#286
  audits). Record in the log.

- [ ] **Step 6: Commit** — `git commit -m "Warn when a client-IP header arrives from an untrusted peer (#290)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Runbook: Cloudflare-range refresh procedure + WARN meaning

**Files:** Modify `docs/runbooks/rate-limit-client-ip.md`

- [ ] **Step 1:** Add a **"Refreshing the Cloudflare ranges"** section: re-fetch
  `https://www.cloudflare.com/ips-v4` + `/ips-v6`, diff against the CIDRs in
  `RIVIERA_RATELIMIT_TRUSTED_PROXIES` (the 8 shipped private defaults are *not* part of the
  Cloudflare set), update the env var on the Render service, redeploy, re-run the probe.
- [ ] **Step 2:** Extend "Reading the app's own signal" with the **new untrusted-peer WARN**:
  what it says, that its appearance means the trust list has drifted (the upstream edge is no
  longer classified as trusted), and that the fix is the refresh procedure above.
- [ ] **Step 3: Commit** — `git commit -m "Runbook: Cloudflare-range refresh procedure + untrusted-peer WARN (#290)"`

- [ ] **Step 4: Update plan-doc execution status.**

---

## Phase 2 — PR + gates

- [ ] **Step 1:** Merge latest `origin/main` into the branch first (integrate with phase
  discipline).
- [ ] **Step 2:** Push, open the PR into `main`, referencing #290 and #286.
- [ ] **Step 3: CI gate** — confirm the pushed head's run is green (incl. the full suite,
  which is the only place the #127-class full-suite-noise question is answered).
- [ ] **Step 4: Review gate** — `riviera-review-overlay` + `/code-review`. Findings re-enter
  at Implement.
- [ ] **Step 5: Sonar gate** — pull the issue list via the API (0 new issues, 0 duplicated
  blocks, ≥80% new-code coverage). Watch for `java:S1313` (the test IP literals are unchanged
  in kind from #129/#286, which cleared the gate).
- [ ] **Step 6:** Update execution status; stop before merge and report.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-3, AC-5:** `gradle … test --tests "*ClientIpResolverTest*" --tests "*RateLimitFilterTest*"` → PASS (28 + 15).
- [ ] **AC-4:** review-gate read of the WARN statement — only the header name + hard-coded text.
- [ ] **AC-6:** review-gate read of the runbook diff — refresh procedure + WARN meaning present.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test (AC-4/AC-6 are review-verified, as scoped).
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] **No JPA** introduced (invariant #1) — no persistence touched at all.
- [ ] **Availability** section justified `N/A` — no availability write path.
- [ ] **Modulith** section filled; root-package edge only, no module surface change (invariant #11).
- [ ] **Payment/payout** `N/A` and true — no money in the diff.
- [ ] Booking codes still never logged — the WARN carries a header **name**, never a value or a code (invariant #7).
- [ ] No Flyway migration needed; none added (invariant #12).
- [ ] **Frontend** `N/A` and true — zero files under `frontend/`.
- [ ] The #129 bypass closure is intact — the header is still ignored from an untrusted peer (AC-5).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows at done-time; Open Questions empty (or deferred with an issue #).
