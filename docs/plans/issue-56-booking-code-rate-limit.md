# U6-followup — Rate-limit the public booking-code endpoints + record code-in-URL decision — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd` (installed). Steps use checkbox syntax.
> **Status: PLANNED** — authored 2026-06-30 against current `main` (HEAD `8f5fcf1`) after the
> Issue-intake grill gate. Issue **#56** (follow-up to the U6 review gate, #11).
> Branch `claude/riviera-sdlc-issue-56-2l4ziw`.

**Goal:** Throttle the three public, unauthenticated booking endpoints (`GET /api/bookings/{code}`,
`POST /api/bookings/{code}/cancel`, `POST /api/bookings`) with a configurable in-memory rate limiter
— per client IP on all three, plus per booking-code on the two code-keyed endpoints — returning
`429` with `Retry-After` when exceeded, so the `200/404` confirmation oracle can no longer be
brute-forced cheaply; and **record** the decision to keep the booking code in the URL path (ADR-0006).

**Architecture:** A single app-level `OncePerRequestFilter` (`RateLimitFilter`) in the **root
package** `ai.riviera.platform` — a cross-cutting web concern alongside `SecurityConfig` /
`WebCorsConfig` / `TimeConfig`, **not** a Modulith module — registered in the existing security
filter chain. It matches only the three booking paths and decrements two independent in-memory
token buckets (per-IP, per-code); a request is rejected if **either** bucket is empty. Buckets use
the injected `Clock` (testable) and live in bounded `ConcurrentHashMap`s pruned opportunistically so
an attacker rotating codes can't grow memory without bound. Single Render instance (ADR-0004) ⇒
in-memory state is sufficient; **no Redis**, no new runtime dependency.

**Persistence:** JDBC only (invariant #1). **No migration, no schema change** — the limiter is
in-memory state; nothing is persisted.

**Source of intent:** GitHub issue **#56** (deferred finding from the U6 review gate, recorded in
`docs/plans/u6-view-cancel-booking.md`). Builds on U6 (#11) which created the endpoints.

**Skills consulted:** `riviera-modulith` — established the filter is an **app-level web concern in the
root package** (like `SecurityConfig`/`WebCorsConfig`), not a `booking`-module class, so no
`@NamedInterface`/boundary change and `ModularityTests` is unaffected; it imports no module internals
(matches paths as strings). `riviera-java-conventions` — `record` for the `@ConfigurationProperties`,
package-private filter + bucket classes, constructor injection into `final` fields, named constants
for the path templates/headers, injected `Clock` (not `Instant.now()`), no Lombok/JPA, log-injection
guard on the user-controlled IP, never log the code (invariant #7). `domain-modeling` — ADR-0006
(keep code in path) meets all three ADR criteria (hard-to-reverse URL contract, surprising
credential-in-path, real trade-off vs logging exposure); no new glossary term (rate limiting is
implementation, not domain vocabulary). `postgres` — **N/A**, no SQL/migration.
`riviera-stripe-payments` — **N/A**, no money/Stripe/charge/refund/payout path touched. `riviera-plan-doc`
(this doc), `tdd` (red→green per behaviour). `angular-developer` / `playwright-cli` — **N/A**, no
frontend change (the code stays in the path, so the merged FE is untouched).

**Branch:** `claude/riviera-sdlc-issue-56-2l4ziw` (exists, off `main` @ `8f5fcf1`).

---

## Issue-intake grill outcome (drift vs #56, recorded before planning)

The issue was grilled against current code/ADRs before planning (gate is mandatory entering at an
existing issue). Findings:

1. **The endpoints exist exactly as the issue describes** and all three are `permitAll()` in
   `SecurityConfig` (lines 89–95); the code is the bearer credential (invariant #7); no rate-limiting
   library or filter exists today. Issue accurate on the current state. *(confirmed against
   `BookingController` + `SecurityConfig`.)*
2. **DRIFT the issue missed — the merged U4-FE payment flow polls `GET /{code}` ~20×/30s.**
   `frontend/.../booking/booking-pay.ts` polls `timer(0, 1500)` over a 30s window (≈20 requests on
   **one code from one IP**) to await webhook-driven `CONFIRMED` (issue #50, merged). A naïve per-IP
   or per-code limit would **throttle a legitimate payer**. → **Default limits MUST clear ~20 req/30s
   for a single client**; pinned by a regression test (AC-5). This is the central reason this gate
   exists.
3. **Deployment is a single Render free instance, no Redis, no CDN** (ADR-0004 + deploy infra). ⇒
   **in-memory** limiter is correct; distributed state would be over-engineering. Render sits behind a
   proxy, so the client IP arrives via `X-Forwarded-For` — the filter must read it, not the proxy hop
   (AC-6). *(confirmed: no Redis/cache dependency anywhere; `build.gradle`, `compose.yaml`.)*
4. **`GET /{code}` has live downstream consumers beyond #50** — `booking-view.ts` and the
   confirmation deep-link all use code-in-path. Moving the code out of the path is a breaking FE
   change, not a backend-only tweak → informs the AC-2 decision (kept in path; ADR-0006).
5. **AC-3 ("revisit when the real auth model replaces the `SecurityConfig` placeholder") is a future
   revisit, not buildable in this slice.** It belongs to the deferred auth-model work; this slice
   delivers the rate-limit + the recorded code-in-URL decision and explicitly leaves the auth revisit
   to that issue (Non-goals).

### Decisions taken with the owner (AskUserQuestion, 2026-06-30)

- **(AC-2) Code-in-URL → KEEP IN PATH**, recorded as **ADR-0006**. Rationale: the merged FE
  (polling, view, deep-link) and REST/UX depend on the path; app-level "never log the code"
  discipline + the new rate limit + base32 entropy mitigate the log-exposure residual; the clean fix
  travels with the auth-model work. Backend-only slice, no FE change.
- **(strategy) Rate limit keyed PER-IP + PER-CODE.** Per-IP is the primary defense against the
  enumeration oracle (attacker tries many codes from an IP); per-code adds a cap against hammering a
  single known code. Per-code cap is set **above** the 20/30s poll so legitimate polling never trips.
- **(scope) Also rate-limit `POST /api/bookings` (create)** — it is public `permitAll` too. Per-IP
  applies to all three endpoints; per-code applies only to the two code-keyed endpoints (create has
  no code).

---

## Acceptance criteria (testable)

> Written at the application/web boundary (the filter is itself an adapter-level concern, so its ACs
> are legitimately HTTP-level). Limits are tiny in tests via `@TestPropertySource`.

- [ ] **AC-1 (per-IP throttle):** Given a per-IP capacity `N` for `GET /api/bookings/*`, when one IP
  makes `N` requests then one more within the window, then the `N+1`th gets `429` with a
  `Retry-After` header and body `{"error":"RATE_LIMITED"}`, while the first `N` are not rate-limited
  (their status is the normal 200/404). *Pinned by:* `RateLimitFilterTest.perIpOverLimitIs429`.
- [ ] **AC-2 (per-IP isolation):** Given IP `A` has exhausted its bucket, when a request arrives from
  a different IP `B`, then `B` is **not** rate-limited. *Pinned by:* `RateLimitFilterTest.perIpIsKeyedByClientIp`.
- [ ] **AC-3 (per-code throttle):** Given a per-code capacity `M` on `GET /api/bookings/{code}`, when
  the same code is requested `M+1` times from within the window (even across IPs), then the `M+1`th
  gets `429`; a **different** code from the same IP (IP bucket permitting) is not code-limited.
  *Pinned by:* `RateLimitFilterTest.perCodeOverLimitIs429`, `RateLimitFilterTest.perCodeIsKeyedByCode`.
- [ ] **AC-4 (create is per-IP limited, not per-code):** Given the per-IP capacity, when one IP posts
  `POST /api/bookings` over the limit, then it gets `429`; create is governed by the per-IP bucket
  only (it carries no code). *Pinned by:* `RateLimitFilterTest.createIsPerIpLimited`.
- [ ] **AC-5 (legitimate payment polling is NOT throttled — drift regression):** Given the **default**
  configured limits, when a single client issues 20 `GET /api/bookings/{code}` within 30s (the
  `booking-pay` poll budget), then **none** is rate-limited. *Pinned by:*
  `RateLimitDefaultsTest.paymentPollingWithinDefaultsIsNotLimited`.
- [ ] **AC-6 (client IP behind a proxy):** Given a request carrying `X-Forwarded-For: <client>, <proxy>`,
  when the limiter keys the request, then it uses the **client** (first) entry, not
  `getRemoteAddr()`; a malformed/absent header falls back to `getRemoteAddr()`. *Pinned by:*
  `ClientIpResolverTest` (pure) + `RateLimitFilterTest.usesForwardedForClientIp`.
- [ ] **AC-7 (token refill):** Given an emptied bucket, when `refillPeriod` elapses (advance the
  injected `Clock`), then requests are allowed again proportionally to the elapsed time. *Pinned by:*
  `TokenBucketTest.refillsOverTime`, `TokenBucketTest.partialRefill`.
- [ ] **AC-8 (preflight + disabled bypass):** Given a CORS `OPTIONS` preflight, it is never counted
  against a bucket; and given `riviera.ratelimit.enabled=false`, no request is ever rate-limited.
  *Pinned by:* `RateLimitFilterTest.preflightIsNotCounted`, `RateLimitDisabledTest.disabledNeverLimits`.
- [ ] **AC-9 (boundaries intact):** `ApplicationModules.verify()` passes; no JPA introduced; the
  filter imports no module internals. *Pinned by:* `ModularityTests`, `JdbcOnlyArchitectureTests`.
- [ ] **AC-10 (code never logged):** The filter logs at most the resolved IP (newline-sanitised) and
  a fixed dimension label — **never** the booking code (invariant #7). *Pinned by:*
  `RateLimitFilterTest.bookingCodeIsNeverLogged` (a Logback `ListAppender` captures the filter's
  DEBUG output while a per-code 429 fires and asserts the code never appears) + code review (RV-BE
  booking-code).

## Non-goals

- **Moving the booking code out of the URL path** — explicitly decided against (ADR-0006). Kept in
  path; the move (if ever) travels with the auth model.
- **The real authentication model** replacing the `SecurityConfig` placeholder (issue #56 AC-3) —
  deferred to the auth-model work; this slice only adds the rate limit + records the URL decision.
- **Distributed / multi-instance rate limiting (Redis, etc.)** — single Render instance (ADR-0004);
  revisit only if the backend is horizontally scaled.
- **A new rate-limiting dependency (bucket4j, resilience4j, Caffeine)** — a small hand-rolled token
  bucket + bounded map is enough and keeps the minimal-dependency posture; see Risk R-3.
- **Throttling the operator (httpBasic) or venue/staff write endpoints** — those are auth-gated, not
  the public oracle this issue targets.
- **Rate-limit metrics / dashboards / `X-RateLimit-*` informational headers** — `Retry-After` on the
  429 is enough for v1; observability is a later hardening.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Limit too strict → throttles the legitimate 20/30s payment poll (the drift in grill #2) | med | high | Default per-code/per-IP capacities set comfortably above 20/30s; pinned by `RateLimitDefaultsTest` (AC-5); limits configurable per env | impl | open |
| R-2 | `X-Forwarded-For` spoofing — a client forges the header to dodge/poison the per-IP limit | med | med | Use the first XFF hop with `getRemoteAddr()` fallback; documented v1 limitation (no trusted-proxy allowlist yet). Per-code bucket + base32 entropy back it up; the real fix is a proxy-trust config with the auth model. ADR-0006 notes it | impl | accepted (v1) |
| R-3 | Per-code map is a memory-DoS vector — an attacker rotating codes creates a bucket per code | med | med | `ConcurrentHashMap` **hard-bounded** by `max-tracked-keys`: at the cap, prune full (idle) buckets (lossless), and if that frees nothing, reset the map (backstop, fail-open one window, only reachable under a flood the per-IP limit gates). Pinned indirectly by the bounded-map logic | impl | resolved (review-gate fix) |
| R-4 | Booking code logged via the limiter (breaks #7) | low | high | The code is only a map key; never passed to a logger. Log only the IP (newline-sanitised) + path template. AC-10 + review gate | impl | open |
| R-5 | Filter ordering wrong — runs after auth so a 401 path is counted, or before CORS so preflight 429s | low | med | Registered in the security chain after CORS; `OPTIONS` excluded; endpoints are `permitAll` so no auth interaction. AC-8 | impl | open |
| R-6 | Concurrency bug in the bucket (lost decrement under load → over-admits, or NPE) | low | med | `TokenBucket` mutations guarded (`synchronized`/atomic); `computeIfAbsent` for bucket creation; pure `TokenBucketTest`. Over-admission is fail-open (acceptable), never fail-closed on a legit user | impl | open |
| R-7 | Counting a request twice (filter runs twice per request) | low | low | `OncePerRequestFilter` guarantees one invocation per request | impl | resolved by design |

## Open questions / Assumptions

- **Assumption:** Default limits — per-IP `60 / 1 min`, per-code `30 / 30 s` — clear the 20/30s poll
  with headroom while still bounding a scripted enumerator; all four values configurable via
  `riviera.ratelimit.*`. Chosen here because the poll budget (grill #2) is the binding constraint. —
  *Owner:* impl
- **Assumption:** A single Render instance (ADR-0004) makes in-memory state correct; if the backend is
  ever scaled out, the limiter becomes per-instance (looser) and a distributed store is the follow-up.
  — *Owner:* impl
- **Assumption:** `X-Forwarded-For` from Render is trustworthy enough for v1 (no public path bypasses
  the proxy). Documented as R-2 / in ADR-0006. — *Owner:* impl

### Resolved

- **(AC-2) code-in-URL** — RESOLVED with the owner: keep in path; ADR-0006.
- **(strategy) keying** — RESOLVED with the owner: per-IP + per-code.
- **(scope) create endpoint** — RESOLVED with the owner: include `POST /api/bookings` (per-IP).

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** This slice adds an HTTP rate-limit filter in front of
existing endpoints; it writes no `availability(set_id, booking_date)` row and changes no booking,
claim, or release path. The only concurrency is in the in-memory token buckets (R-6), which is
unrelated to the availability source-of-truth invariant.

## Spring Modulith — modules, interfaces, events

**Modules touched: none.** The `RateLimitFilter`, `RateLimitProperties`, `TokenBucket`, and
`ClientIpResolver` live in the **root package** `ai.riviera.platform` (an app-wide web concern, like
`SecurityConfig`/`WebCorsConfig`/`TimeConfig`), which the Modulith analysis does not treat as a
module. The filter references the booking endpoints by **URL-path string**, importing nothing from
the `booking` module's `api/`/`application.*`/`infrastructure.*`. Therefore:

- **No new `api/`/`spi/` named interface, no new `allowedDependencies`, no domain event.**
- `ModularityTests.verifiesModularStructure()` is unaffected and must stay green (AC-9).
- `SecurityConfig` (already root) is modified to register the filter — same package, no boundary
  crossing.

**Domain events:** none.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no money moves.** The limiter throttles requests; it issues no charge/refund, touches no
PaymentIntent, ledger, or webhook. The `POST /api/bookings` create path it fronts is unchanged
(Stripe behaviour intact). Collect-only / no-Connect (ADR-0002 / invariant #8) is unaffected, as the
issue notes.

## Angular — frontend surfaces touched

**N/A — backend-only.** The code stays in the URL path (ADR-0006), so the merged FE
(`booking.service.ts`, `booking-pay.ts`, `booking-view.ts`, the confirmation deep-link) is untouched.
The limiter is transparent to a well-behaved client; AC-5 pins that the existing poll volume is not
throttled, so no FE change or new e2e is required. *(If a future change surfaces a 429 to users, a
retry/back-off UX + e2e would be added then.)*

## FE↔BE contract

**No contract change** to the existing endpoints' success/known-error shapes. **One additive
response:** any of the three endpoints may now return `429 Too Many Requests` with header
`Retry-After: <seconds>` and body `{"error":"RATE_LIMITED"}` (same `{"error":...}` envelope as the
other error responses). No request shape changes; the booking code stays a path variable.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `TokenBucket` + `ClientIpResolver` (pure, test-first) | ✅ | `[#56] Token-bucket + client-IP resolver (pure…)` |
| 1 — `RateLimitProperties` + `RateLimitFilter` + `SecurityConfig` wiring + properties | ✅ | `[#56] Per-IP + per-code rate-limit filter…` |
| 2 — HTTP integration tests (per-IP/per-code/create/poll-regression/preflight/disabled) | ✅ | `[#56] HTTP tests…` |
| 3 — ADR-0006 + verify + review gate | ✅ | `[#56] Plan doc + ADR-0006…`, `[#56] Review-gate fixes…` |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as the code.

### Review-gate note (2026-06-30)

Ran the SDLC review gate: `/code-review origin/main...HEAD` (high effort, 8 finder angles) +
`riviera-review-overlay`. Full backend suite green at the gate (incl. `ModularityTests`,
`JdbcOnlyArchitectureTests`). Highest-stakes overlay items: **RV-BE-1 availability** — N/A (no
availability write path); **payment-confirmation (#8)** — N/A (no money moves); **booking-code #7** —
PASS (the code is only a map key, never logged; now pinned by `bookingCodeIsNeverLogged`).
**RV-PROC-1** — PASS (every touched area has its skill on the *Skills consulted* line; DB/FE/money N/A).

**Confirmed findings — fixed through the loop** (re-ran the routing gate per fix: `riviera-modulith`
+ `riviera-java-conventions`; area stayed backend Java + config + tests, no new area):

- **[Major] Soft cap did not actually bound the tracked-key maps** (2 angles). `computeIfAbsent` always
  added a bucket even when the prune (which only reclaims *full* buckets) freed nothing, so a sustained
  key-rotation flood could grow memory past `maxTrackedKeys`. **Fix:** `bucketFor` now prunes full
  buckets at the cap and, if that frees nothing, resets the map as a hard backstop — memory is bounded.
- **[Medium] Per-IP limit could throttle multiple legitimate payers behind one shared public IP**
  (carrier-grade NAT / venue WiFi: same `X-Forwarded-For` client). **Fix:** raised the per-IP default
  60→**120 / min** (tolerates ~3 concurrent payment polls of ~40/min) and documented the shared-IP
  tuning in `application.properties`.
- **[Minor] Hot-path redundancy** — the path was parsed and the `AntPathMatcher` run 3–4× per request
  (`isBookingEndpoint` + `bookingCode`) and `bucketFor` did a double map lookup. **Fix:** a single
  `targetOf(request)` classifies once (matched? + code); `bucketFor` does one `get` then create.
- **[Minor] AC-10 claimed a "code never logged" test that didn't exist.** **Fix:** added
  `RateLimitFilterTest.bookingCodeIsNeverLogged` (Logback `ListAppender`) so #7 is now genuinely pinned.
- **[Minor] `ClientIpResolver` stripped only CR/LF.** **Fix:** broadened to all control chars
  (`\p{Cntrl}`) + Unicode line/paragraph separators (defends terminal-escape injection too); new test.
- **[Minor] Test-stub duplication** between the rate-limit tests and `WebCorsConfigTest`, plus a
  triplicated `fromIp` helper. **Fix:** extracted a shared `WebSliceStubs` (`@TestConfiguration` + static
  `fromIp`); both suites use it, removing ~150 lines of drift-prone duplication.

**Accepted / documented (no change):**

- **`X-Forwarded-For` is trusted without a proxy-allowlist** — accepted for v1 (R-2 / ADR-0006); a forged
  header can dodge the per-IP limit, backed up by the per-code cap + base32 entropy; proxy-trust travels
  with the auth model.
- **The prune's reset backstop is fail-open for one window under an extreme flood** — only reachable at a
  request rate the per-IP limit gates first; a scheduled/LRU/Caffeine eviction is the future hardening if
  the backend is ever horizontally scaled (also where in-memory state would need revisiting).
- **AC-3 (revisit endpoints with the real auth model)** — out of scope here; tracked by the auth-model work.

---

## File structure

**Root package `ai.riviera.platform` (app-wide web config — not a module)**
- `TokenBucket.java` — **new**, package-private pure token-bucket (capacity, refill period, `tryAcquire(Instant)`).
- `ClientIpResolver.java` — **new**, package-private; first `X-Forwarded-For` hop with `getRemoteAddr()` fallback + newline sanitisation.
- `RateLimitProperties.java` — **new**, `@ConfigurationProperties("riviera.ratelimit")` record (`enabled`, `perIp`, `perCode`, `maxTrackedKeys`).
- `RateLimitFilter.java` — **new**, package-private `OncePerRequestFilter`; matches the three paths, two bounded bucket maps, 429 + `Retry-After`.
- `SecurityConfig.java` — **modify**: `@EnableConfigurationProperties(...RateLimitProperties.class)`, register `RateLimitFilter` in the chain (after CORS), construct it from properties + `Clock`.
- `src/main/resources/application.properties` — **modify**: documented `riviera.ratelimit.*` defaults.

**Docs**
- `docs/adr/0006-booking-code-stays-in-url-path.md` — **new** (AC-2 recorded decision).

**Tests (`src/test/java/ai/riviera/platform/`)**
- `TokenBucketTest.java` — pure unit (AC-7).
- `ClientIpResolverTest.java` — pure unit (AC-6).
- `RateLimitFilterTest.java` — `@WebMvcTest` slice + stubs (WebCorsConfigTest pattern), tiny limits via `@TestPropertySource`, controllable `Clock` (AC-1/2/3/4/6/8).
- `RateLimitDefaultsTest.java` — `@WebMvcTest` with the **default** properties; 20 GETs/30s not limited (AC-5).
- `RateLimitDisabledTest.java` — `enabled=false` bypass (AC-8).

---

## Phase 0 — `TokenBucket` + `ClientIpResolver` (pure, test-first)

**Files:** Create `TokenBucket.java`, `ClientIpResolver.java`; Test `TokenBucketTest.java`,
`ClientIpResolverTest.java`.

> Load `riviera-java-conventions` (done). Pure classes, no Spring — fast unit tests, no Docker.

- [ ] **Step 1: failing tests** — `TokenBucketTest`: a bucket of capacity 3 allows 3 `tryAcquire`,
  refuses the 4th; after one `refillPeriod` elapses (fixed `Instant` advanced by hand) it allows
  again; partial elapsed time refills proportionally (floor). `ClientIpResolverTest`: `"1.2.3.4, 10.0.0.1"`
  → `"1.2.3.4"`; absent/blank header → `getRemoteAddr()`; a value containing `\r`/`\n` is sanitised.
- [ ] **Step 2: run → FAIL** — `./gradlew test --tests "*TokenBucketTest" --tests "*ClientIpResolverTest"`.
- [ ] **Step 3: implement** both pure classes (token bucket guarded for concurrent `tryAcquire`;
  resolver returns a sanitised string).
- [ ] **Step 4: run → PASS** (same command).
- [ ] **Step 6: commit** `[#56] Token-bucket + client-IP resolver (pure)`.
- [ ] **Step 7: update execution status.**

## Phase 1 — `RateLimitProperties` + `RateLimitFilter` + wiring

**Files:** Create `RateLimitProperties.java`, `RateLimitFilter.java`; Modify `SecurityConfig.java`,
`application.properties`.

> Load `riviera-modulith` (done — root-package web concern) + `riviera-java-conventions` (done).

- [ ] **Step 1:** add the `riviera.ratelimit.*` defaults to `application.properties` (documented like
  the existing blocks); define the `RateLimitProperties` record with `@DefaultValue`s so the binder
  is safe even if a property is absent.
- [ ] **Step 3: implement `RateLimitFilter`** — package-private `OncePerRequestFilter`:
  - Skip when `!enabled` or method is `OPTIONS`; skip when the request path matches none of the three
    endpoint matchers (`GET /api/bookings/*` view, `POST /api/bookings/*/cancel`, `POST /api/bookings`
    exact). Use named `RequestMatcher`/`AntPathMatcher` constants mirroring `SecurityConfig`.
  - Resolve the client IP via `ClientIpResolver`; per-IP `tryAcquire`. For the two code-keyed paths,
    extract the code path segment and per-code `tryAcquire`. Reject (429) if **either** fails.
  - On reject: `response.setStatus(429)`, `Retry-After` = whole seconds to the next token, body
    `{"error":"RATE_LIMITED"}` (`application/json`), and **short-circuit** (do not call the chain).
  - Buckets via `map.computeIfAbsent(key, k -> new TokenBucket(...))`; prune when `map.size() >
    maxTrackedKeys` (drop full/idle buckets). `Clock` injected.
  - Logging: at most `log.debug` with the sanitised IP + path template; never the code.
  - Register in `SecurityConfig`'s chain after CORS (`http.addFilterAfter(rateLimitFilter, CorsFilter.class)`
    or `addFilterBefore(..., AuthorizationFilter.class)`), built from `RateLimitProperties` + `Clock`.
- [ ] **Step 4:** `./gradlew test --tests "*ModularityTests" --tests "*JdbcOnlyArchitectureTests"`
  green (boundaries intact, no JPA).
- [ ] **Step 6: commit** `[#56] Per-IP + per-code rate limit filter on public booking endpoints`.
- [ ] **Step 7: update execution status.**

## Phase 2 — HTTP integration tests

**Files:** Create `RateLimitFilterTest.java`, `RateLimitDefaultsTest.java`, `RateLimitDisabledTest.java`.

> `@WebMvcTest` + `@Import({SecurityConfig, WebCorsConfig, RateLimitFilter/props, stubs})` mirroring
> `WebCorsConfigTest`; tiny limits via `@TestPropertySource`; set client IP per request with
> `.with(r -> { r.setRemoteAddr("1.1.1.1"); return r; })` or the `X-Forwarded-For` header; override
> the `Clock` bean with a controllable one to exercise refill windows.

- [ ] **Step 1: failing tests** for AC-1..AC-6, AC-8 (list above). Stub `ViewBooking`/`CancelBooking`/
  `CreateBooking` so matched requests reach a deterministic 200/404 when **not** limited, proving the
  first N pass and only the overflow is 429.
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3:** (filter already implemented in Phase 1) — adjust only if a test reveals a gap.
- [ ] **Step 4: run → PASS**; then end-of-phase regression: `./gradlew test --tests "*RateLimit*"`
  and `./gradlew test --tests "*BookingControllerIT"` (the existing booking HTTP contract still
  green — defaults must not throttle its sequential calls).
- [ ] **Step 6: commit** `[#56] HTTP tests: per-IP/per-code throttle, poll-safe defaults, preflight/disabled bypass`.
- [ ] **Step 7: update execution status.**

## Phase 3 — ADR-0006 + verify + review gate

**Files:** Create `docs/adr/0006-booking-code-stays-in-url-path.md`.

- [ ] **Step 1:** write ADR-0006 (status Accepted; context = unguessable code as bearer credential in
  the path; decision = keep in path for v1; consequences = log-exposure residual mitigated by app log
  discipline + rate limit + base32 entropy, XFF-spoofing caveat, revisit with auth model; alternatives
  = header / POST-body-hybrid, both breaking the merged FE; downstream consumers #50/booking-view/
  deep-link). Reference issue #56 and invariant #7.
- [ ] **Step 2:** full backend suite `./gradlew test` green (incl. `ModularityTests`,
  `JdbcOnlyArchitectureTests`).
- [ ] **Step 3: review gate** — `/code-review origin/main...HEAD` + `riviera-review-overlay`; resolve
  findings through the loop (re-run the Skill-routing gate per fix). Record the review note here.
- [ ] **Step 6: commit** `[#56] ADR-0006: booking code stays in the URL path; review-gate note`.
- [ ] **Step 7:** push the branch; ask the owner before opening the PR.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

> The gate before claiming done.

- [ ] **AC-1..AC-10:** `./gradlew test --tests "*RateLimit*" --tests "*TokenBucketTest" --tests "*ClientIpResolverTest" --tests "*ModularityTests" --tests "*JdbcOnlyArchitectureTests"` → all green. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] **No JPA** introduced (invariant #1) — verified by `JdbcOnlyArchitectureTests`.
- [ ] **Availability** section: justified `N/A` (no availability write path) — invariant #2 untouched.
- [ ] **Modulith** section filled; filter in root package, no cross-module imports; `ModularityTests` green (invariant #11).
- [ ] **Payment/payout** section: justified `N/A` (no money moves); collect-only unaffected (invariant #8).
- [ ] **Booking code never logged** (invariant #7) — limiter uses the code only as a map key.
- [ ] Client IP read from `X-Forwarded-For` (proxy-correct); spoofing caveat documented (R-2).
- [ ] Default limits clear the 20/30s payment poll (AC-5) — the grill-#2 regression guarded.
- [ ] Limits configurable via `riviera.ratelimit.*`; `enabled=false` bypass works.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows at done; Open Questions resolved or deferred with an issue #.
