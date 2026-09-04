# Proof-of-work fence on booking create Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** `POST /api/bookings` joins the edge's fenced route set for **every** caller — guest or
signed-in customer — so a script cannot hold a venue's online pool for the pay window, and the
draft privacy policy discloses the mechanism.

**Architecture:** The single significant decision is that **nothing new is built** — the route
name is added to `ChallengeVerificationFilter`'s fenced set and the checkout dialog hosts the
already-shipped `ChallengeWidget`. The fence stays an edge concern (ADR-0017): the `booking`
module does not learn the challenge exists, no port changes, no migration, and the availability
claim is never reached on a refusal because the filter runs ahead of MVC dispatch.

**Persistence:** JDBC only (invariant #1). No migration — the fence reuses the `challenge` module's
`challenge_registry` (V49). No table in this slice's diff.

**Source of intent:** GitHub issue #907 (parent epic #903; ADR-0016 Decision 2, ADR-0017, D-8,
stories 17 + 30).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the stale
"both language variants" AC, see Q-1, and confirmed both blockers are on `main`) ·
`riviera-plan-doc` (this template — forced the Module-ownership table that pins the fence at the
edge, and the FE↔BE contract row for the header) · `tdd` (each phase is red-first at a seam named
below; the backend ITs solve a real challenge, they never bypass one) · `riviera-review-overlay`
(review gate — runs when the PR is marked ready) · `riviera-docs-freshness` (**ran** over
`origin/main..HEAD` at close-out — findings recorded in the Execution status) ·
`riviera-modulith` (confirmed the fenced-route set belongs in the composition root, not `booking`;
no `allowedDependencies` change — the root already holds `challenge::api` + `::vocabulary`) ·
`riviera-java-conventions` (§6a named the route constant; §6c held the filter's new comment to one
line; §9 kept the IT on real Postgres with a solved challenge) · `riviera-frontend` (the widget is
`shared/`, the dialog is the `booking/` feature, the disclosure is `pages/legal/` — no new
cross-feature edge) · `angular-developer` + angular-cli MCP (v22 `viewChild`/`model` signal APIs on
the widget host, `await solved()` before submit) · `riviera-tailwind` (the widget's own skin is
token-driven; the dialog adds only spacing utilities — no new token, no `@apply`) ·
`playwright-cli` (the two-suite split: mocked journeys carry the fence, one real-backend solve) ·
`riviera-local-debug` (cloud recipe: `gradle --no-daemon` on the JDK-21 daemon,
`PW_CHROMIUM_EXECUTABLE` for the mocked suite, scoped test runs only)

**Branch:** `claude/sdlc-907-c0s0x4` — the session's designated remote branch stands in for
`feature/pow-fence-booking-create` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the fence is on and a guest posts a booking for a free online set carrying a
  solution minted by the real endpoint and solved with the library, when the create runs, then the
  booking row exists and the response is the normal create outcome. *Seam:* `POST /api/bookings` at
  the HTTP edge (the fence is an edge concern; `booking`'s ports are untouched) · *Pinned by:*
  `BookingCreateChallengeIT.createsAGuestBookingWithASolvedChallenge`
- [ ] **AC-2:** Given the same, but the caller holds a CUSTOMER session, when the create runs, then
  it is accepted identically — the verifier has no auth-state branch. *Seam:* `POST /api/bookings`
  with a `SESSION` cookie · *Pinned by:*
  `BookingCreateChallengeIT.createsASignedInCustomerBookingWithASolvedChallenge`
- [ ] **AC-3:** Given the fence is on, when a create arrives with no / a forged / an expired / an
  already-claimed solution, then it is refused `400` with `CHALLENGE_REQUIRED`, `CHALLENGE_INVALID`,
  `CHALLENGE_EXPIRED`, `CHALLENGE_EXPIRED` respectively, and the `availability`, `booking` and
  `payment` tables are unchanged. *Seam:* `POST /api/bookings` + direct row counts on the three
  tables · *Pinned by:* `BookingCreateChallengeIT.rejectsAMissingHeader`, `.rejectsAForgedSignature`,
  `.rejectsAnExpiredChallenge`, `.rejectsAReplayedSolution`,
  `.aRefusalClaimsNoAvailabilityAndWritesNoBookingOrPayment`
- [ ] **AC-4:** Given the shipped `riviera.ratelimit.per-ip` create budget, when a single client
  spends it entirely on challenge-refused creates, then the next create is `429 RATE_LIMITED` — the
  refusal drew from the bucket. *Seam:* `POST /api/bookings` from one fixed `X-Forwarded-For` ·
  *Pinned by:* `BookingCreateChallengeIT.aChallengeFailureStillSpendsThePerIpCreateBudget`
- [ ] **AC-5:** Given `riviera.altcha.enabled=false`, when a create arrives with no header, then it
  reaches the controller unchanged. *Seam:* `POST /api/bookings` in the web slice · *Pinned by:*
  `AltchaDisabledTest.bookingCreateAdmitsWithoutAHeader`
- [ ] **AC-6:** Given each fenced route including `/api/bookings`, when the port answers
  missing / INVALID / EXPIRED, then the filter writes the matching `400` problem body with no
  `SESSION` cookie. *Seam:* the filter over each fenced route in the `@WebMvcTest` slice ·
  *Pinned by:* `ChallengeVerificationFilterTest` (its `fencedRoutes()` source gains `/api/bookings`)
- [ ] **AC-7:** Given the diff, when the structural net runs, then `booking` imports nothing new and
  the root reaches `challenge` only through `api`/`vocabulary`. *Seam:*
  `ApplicationModules.of(PlatformApplication.class).verify()` · *Pinned by:* `ModularityTests`,
  `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`
- [ ] **AC-8:** Given the fence is on and the widget has verified, when the tourist submits the
  Review step, then the create request carries the solution in `X-Altcha-Payload`. *Seam:* the
  `POST /api/bookings` request observed through `HttpTestingController` · *Pinned by:*
  `booking-dialog.spec.ts` › "sends the solved challenge as the fence header on create"
- [ ] **AC-9:** Given the fence is on, when the create is refused with a challenge code, then the
  dialog renders that rejection's one shared message and asks the widget for a fresh solve, and no
  booking hand-off is emitted. *Seam:* the dialog's rendered error region + the widget wrapper's
  `refresh()` · *Pinned by:* `booking-dialog.spec.ts` › "a challenge rejection names the reason and
  restarts the widget"
- [ ] **AC-10:** Given `ProofOfWork.enabled()` is `false`, when the dialog renders and submits, then
  no widget is in the DOM and the create carries no fence header. *Seam:* the dialog's DOM +
  the `POST /api/bookings` request headers · *Pinned by:* `booking-dialog.spec.ts` › "the kill
  switch hides the widget and the create carries no header"
- [ ] **AC-11:** Given the mocked API, when the Instant-Book and same-day journeys run in Chromium,
  then the widget is visible on checkout, really solves against the mocked challenge route, and the
  create carries a decoded solution counter; and a refusal renders its message with a fresh
  challenge, while the kill switch hides the widget and booking still completes. *Seam:* the
  rendered `/venues/1` checkout route + the mocked `POST /api/bookings` request headers ·
  *Pinned by:* `frontend/e2e/booking-flow.e2e.ts`, `frontend/e2e/same-day-booking.e2e.ts`,
  `frontend/e2e/booking-challenge.e2e.ts`
- [ ] **AC-12:** Given a real backend, when a guest books a free online set, then the widget solves a
  real challenge, the edge verifies and claims its nonce, and the booking is created. *Seam:* the
  running SPA against `POST /api/bookings` · *Pinned by:*
  `frontend/e2e/real-backend/booking-challenge.e2e.ts`
- [ ] **AC-13:** Given the checkout step with the widget mounted, when the a11y and contrast specs
  run, then axe reports no serious violations and every widget ink pair clears AA on the dialog
  glass in all three themes. *Seam:* the rendered dialog (jsdom axe) + the composited dialog-glass
  surface maths · *Pinned by:* `booking-dialog.a11y.spec.ts`, `booking-dialog.contrast.spec.ts`,
  and the axe runs inside `booking-flow.e2e.ts` / `booking-challenge.e2e.ts`
- [ ] **AC-14:** Given `/legal/privacy`, when it renders, then it shows a security-measures section
  stating the self-hosted proof-of-work challenge sets no cookie, does no fingerprinting and sends
  nothing to a third party, and that passwords are checked against length and a blocklist only —
  carrying a visible draft / legal-review-pending marker — and its contrast holds. *Seam:* the
  rendered `/legal/privacy` route · *Pinned by:* `privacy-policy.spec.ts` ›
  "states the security measures, marked for legal review", `legal-pages.contrast.spec.ts`,
  `frontend/e2e/legal-pages.e2e.ts`
- [ ] **AC-15:** Given `RESPONSIBILITIES.md` § *Platform edge*, when the fenced-route list is read,
  then it names booking create alongside the three auth routes and no longer says booking create
  "joins in its own slice". *Seam:* the document itself · *Pinned by:* review (RV-PROC) — prose has
  no test; `riviera-docs-freshness` at close-out re-checks the count wording.

## Non-goals

- **No change to the pay path.** The challenge is spent on create only; `POST /api/bookings/{code}/pay`,
  the PaymentIntent, the Stripe webhook and the payment poll are untouched (AC-4's budget check is
  the proof that only the create bucket moves).
- **No new fenced routes.** Booking create completes ADR-0016's set; the token-redemption routes and
  both sign-ins stay unfenced by decision.
- **No rate-limit retuning.** The per-IP create budget keeps its shipped capacity.
- **No i18n mechanism.** The privacy page is English-only today (Q-1); this slice adds a paragraph,
  not a translation layer.
- **No counsel text.** The privacy page stays a draft; the new paragraph carries the same marker.
- **No widget redesign.** `shared/challenge-widget.ts` is reused as shipped, including its #920
  24 px checkbox exemption.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. The booking-create flow keeps every outcome it has
(`201 CONFIRMED`, `202 AWAITING_PAYMENT`, `202 PENDING_REQUEST`, and each rejection code); the
fence adds refusals ahead of it and adds no branch inside it.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Where the widget mounts trades the solve's head start against the dialog's above-the-fold budget | high | med | **Resolved by the maintainer**: Review step. Mounting on Details was measured to push the panel from 638 px to 714 px at the 700 px viewport, clamping it and breaking the #188/#186 above-the-fold guard. On Review the solve still starts a step early — advancing focuses the primary button inside the widget's form, and the wrapper's `onLoad` starts a solve when the form already holds focus — so it overlaps reading the summary and terms; `solved()` awaits it at submit as a backstop | maintainer | closed — see the Resolved note below |
| R-2 | Unit specs that render `BookingDialog` / `VenueMap` acquire a live `httpResource` probe of `/api/auth/challenge`, so `httpMock.verify()` fails on an unexpected request | high | med | Provide a `FakeProofOfWork` in those four specs (the `auth-page.spec.ts` precedent) — no HTTP at all — and `vi.mock('altcha')` + `defineFakeAltchaElement` wherever the fence is switched on | agent | open |
| R-3 | Every mocked e2e that opens the booking dialog now renders a widget whose challenge fetch is unrouted, so the probe errors, reads the fence as **on**, and the journey hangs on an unsolvable widget | high | high | Route the challenge endpoint in every affected spec: `mockChallengeFence(page, 'on')` where the fence is the subject, `'off'` where it is noise. Enumerate the population by mechanism (specs that open the dialog), not by resemblance — see the Generalization-audit log | agent | open |
| R-4 | A challenge refusal returns `400`, which the dialog's existing `bookingErrorOf` maps to `UNKNOWN` — the tourist gets "Something went wrong" and retries into a second refusal forever | med | high | Widen `bookingErrorOf` to `BookingErrorCode \| ChallengeRejection` via `challengeRejection(problemCodeOf(error)) ?? …` (the `customer-auth.ts` shape), and have the dialog call `refresh()` on any challenge rejection so the retry has a fresh solution | agent | open |
| R-5 | Full-suite-only failure: `BookingCreateChallengeIT` shares the per-IP create bucket with every other MockMvc booking test in the cached context and 429s mid-run | med | high | Every request uses `SessionLoginSupport.uniqueClientIp()` except AC-4's, which pins one address deliberately and owns it for the whole test (`riviera-local-debug` § *full-suite-only failure class*) | agent | open |
| R-6 | The IT's own `riviera.altcha.cost` override forks the Spring context; a wrong property set makes it either slow (shipped cost 5000) or silently unfenced | low | med | Mirror `OperatorRegisterChallengeIT` exactly: `cost=10` + a known `hmac-secret` in `@TestPropertySource`, so the expired-challenge case can be minted locally | agent | open |
| R-7 | Error contract drift: the refusal body is written by `SecurityProblemResponses`, not `ApiProblem`, because the filter runs before MVC dispatch | low | low | No new response shape — the three codes and their bodies already ship; `ChallengeVerificationFilterTest` asserts the body per route including the new one (`riviera-java-conventions` §6b) | agent | open |
| R-8 | Availability regression by accident — the fence sits on the one route that claims a set | low | high | The filter returns before `chain.doFilter`, so `AvailabilityClaim` is never reached on a refusal; AC-3 asserts zero rows in `availability` for the target `(set, date)`. Invariant #2's own pin, `ConcurrentReservationIT`, is untouched and must stay green | agent | open |
| R-9 | Flyway version collision | none | — | No migration in this slice; `V49` is the highest on `main` and no PR is open | agent | closed — no schema change |

## Open questions / Assumptions

### Resolved

- **Q-2 (settled by the maintainer at phase 2):** the shared-form mount that would satisfy the
  issue's "solving starts when the tourist focuses the contact form" literally was measured to break
  a shipped guard — with the widget on Details the panel's natural height goes 638 px → 714 px at the
  700 px laptop viewport the #188/#186 guard uses, so it clamps to 660 px and the Details step no
  longer fits above the fold. Put to the maintainer with those numbers; **outcome: host the widget on
  the Review step**, which is also the issue's own first clause ("the checkout step that submits the
  booking hosts the shared wrapper"). The solve still starts a step before the tap: advancing to
  Review moves focus to the primary button inside the widget's form, and the widget wrapper's
  `onLoad` handler starts a solve when the form already holds focus — so the work overlaps reading
  the summary, total, terms and consent. `booking-flow.e2e.ts` pins that Details carries no widget
  and Review's solve completes before the pay tap.

- **Q-1 (drift, resolved at plan time):** The issue's AC says the privacy paragraph must appear in
  "both language variants the page carries". The page carries **one** — it is English-only:
  `frontend/src/app/pages/legal/privacy-policy.html` is a single static template and
  `grep -rln 'i18n\|\$localize\|Shqip\|sq-AL' frontend/src` returns nothing, so no i18n mechanism
  exists to carry a second variant. The page's own Javadoc records that the dual Albanian/GDPR
  framing is part of the pending counsel text. **Outcome:** ship the paragraph in the one language
  the page carries; adding a translation layer is out of scope (Non-goals) and belongs with the
  counsel text. Recorded on the issue.

## Availability & concurrency (invariant #2)

The slice touches the one route that claims availability, so this section is a spec, not a formality
— its whole content is that **the fence must not reach the claim**.

- **Write paths to `availability(set_id, booking_date)`:** unchanged — online create (this route),
  staff tap-to-mark, cancellation release, request accept/decline/expiry/withdraw release, admin
  weather refund. This slice adds **no** write path and removes none.
- **Uniqueness guarantee:** unchanged — the `(set_id, booking_date)` unique constraint plus the
  claim's `INSERT … ON CONFLICT DO NOTHING` inside the reservation transaction.
- **Concurrency strategy:** unchanged. The fence is a servlet filter that either calls
  `chain.doFilter` or writes a `400` and returns; it holds no transaction and takes no lock. A
  refused create therefore performs **zero** availability work — asserted directly by AC-3, which
  counts `availability` rows for the target `(set, date)` after each refusal.
- **Pool rule (invariant #3):** unchanged — the claim still rejects a non-`ONLINE` set.
- **Cutoff rule (invariant #4):** unchanged. The fence runs before the controller and is
  deadline-blind; the venue's `sales_close` fence stays exactly where it is in the reserve service.
  The pay path's deadline fence is out of scope (Non-goals).
- **Pinning test:** `ConcurrentReservationIT` (untouched, must stay green — it proves two concurrent
  reservations of the same `(set, date)` cannot both succeed) plus
  `BookingCreateChallengeIT.aRefusalClaimsNoAvailabilityAndWritesNoBookingOrPayment` for the new
  refusal path.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | *(composition root — not a module)* | existing | — | `ChallengeVerificationFilter` and its fenced-route set live at the root: deciding **which routes are fenced** is explicitly on the `challenge` module's Not-My-Job list (ADR-0017) |
| M-2 | `challenge` | existing, **unchanged** | — | Already publishes `api.ProofOfWorkChallenges` + `vocabulary.ChallengeVerdict`; the root's grant covers both. No new code |
| M-3 | `booking` | existing, **unchanged** | `Booking` | The module must not learn the challenge exists — no import, no port, no property. Its only relationship to this slice is that AC-3 asserts its table stays empty on a refusal |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `challenge.api` | `ProofOfWorkChallenges#enabled()` / `#verify(String)` | `ChallengeVerdict` | the composition root (`ChallengeVerificationFilter`) — **existing grant, unchanged** |

**Domain events (id-based payloads, invariant #11)**

None added or changed. The eight shipped events are untouched; a refused create publishes nothing
because it never reaches the application service.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| "`POST /api/bookings` is a fenced route" | composition root (edge) | `RESPONSIBILITIES.md` § *Platform edge* Job: the public writes that cost money or inventory are fenced at the edge; **not** `challenge` (its Not-My-Job: "deciding which routes are fenced, the filter and its ordering, the problem bodies — those are the composition root's"); **not** `booking` (a domain module that knew the challenge existed would invert ADR-0017) |
| "verify a solution and claim its nonce once" | `challenge` | `challenge` Job: verify a widget's solution and accept each solution exactly once via the `challenge_registry` claim. Called through the existing `api` port; **no new code in the module** |
| "the checkout hosts the widget and sends the header" | frontend `booking/` feature | `riviera-frontend`: the dialog is the `booking/` feature's component; the widget is a `shared/` presentational primitive and the enabled-probe a `core/` singleton — the import direction stays features → `core`/`shared` |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves in this slice. Recorded rather than omitted because the fenced route is the
*entry* to the payment flow:

- No PaymentIntent is created on a refused create — the filter returns before the reserve service,
  so `payment` is never called (asserted by AC-3's `payment` row count).
- The Stripe webhook remains the source of truth for payment state (invariant #8), untouched.
- No commission, ledger, refund or currency code is read or written by this diff.
- `riviera-stripe-payments` was deliberately **not** loaded: the issue's own gate says to load it
  "if the plan finds the intent path touched (it should not be)", and the intent path is not
  touched — the diff contains no `payment`/`payout` file. If phase 1 discovers otherwise, the
  Skill-routing gate re-runs before that code is written.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-dialog.ts` | existing | standalone component | Signals; `viewChild(ChallengeWidget)` + a `challengePayload` signal bound two-way to the widget's `model` | Signal Forms (unchanged) |
| FE-2 | `booking/booking.service.ts` | existing | `@Service()` | — | — |
| FE-3 | `shared/challenge-widget.ts` | existing, **reused unchanged** | standalone component | its own | — |
| FE-4 | `core/proof-of-work.ts` | existing, **reused unchanged** | `@Service()` | `httpResource` probe | — |
| FE-5 | `pages/legal/privacy-policy.html` | existing | template | static | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`/`model()`
signal APIs. No deviation. The dialog gains no new Tailwind token — only spacing utilities around
the widget, whose skin is already token-driven.

## FE↔BE contract

- **New/changed endpoints:** none. `POST /api/bookings` keeps its request body and every response
  shape; it gains an **optional-when-off, required-when-on request header** `X-Altcha-Payload`, and
  three additional `400` problem `code`s — `CHALLENGE_REQUIRED`, `CHALLENGE_INVALID`,
  `CHALLENGE_EXPIRED` — all three already shipped and already spelled once in
  `frontend/src/app/shared/challenge.ts`.
- **Client typing:** `BookingService.createBooking` takes an optional `challenge?: string` and sends
  `challengeHeaders(challenge)`; the error mapper returns
  `BookingErrorCode | ChallengeRejection`. No `as any`.
- **Money/date on the wire:** unchanged — integer minor units + ISO currency, booking date as an
  ISO `LocalDate`.

## Execution status

**Stage pointer:** `review gate — findings being fixed`

**Next action:** finish the review gate's remaining agents, then the close-out commit (F-1:
tick the AC / phase-step / self-review boxes, cite `merged via PR #923`) and merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Fence booking create at the edge (backend) | ✅ | (this commit) |
| 1 — The widget on checkout and the header on create (frontend) | ✅ | (this commit) |
| 2 — Playwright: the two journeys, the dedicated spec, the real solve | ✅ | (this commit) |
| 3 — Privacy-policy security measures + `RESPONSIBILITIES.md` | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (CLAUDE.md agent) | The plan doc's phase table read ✅ while its AC, phase-step and self-review checkboxes were all still unticked — the doc misstated its own completion state | fixed in the close-out commit |
| F-2 | review gate (comment-compliance agent) | `booking-dialog.a11y.spec.ts`'s class TSDoc still claimed the widget is "mounted in the form on both steps" — true before the Q-2 decision moved it to Review, false after, and contradicted by the spec's own test bodies | fixed-in-`7e923b4` |
| F-3 | review gate (bug-scan agent) | The Back→Forward path destroys and rebuilds the widget — a shape no fenced auth form has, since only this dialog puts the widget inside a step branch. Traced as correct (the remount's forced re-verify discards the stale payload before it can be submitted) but untested | test added, `booking-dialog.spec.ts` › "survives a Back to Details and forward again" |
| — | sonar gate | 0 new issues, 0 hotspots, 0 duplicated blocks, 97.37% new-code coverage (`new_lines` = 90, so a real analysis ran) | clear |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/ChallengeVerificationFilter.java` — the fenced-route
  set gains `/api/bookings`; the Javadoc's "the remaining public writes join here" note retires
- `platform/src/test/java/ai/riviera/platform/ChallengeVerificationFilterTest.java` — `/api/bookings`
  joins `fencedRoutes()` and `bodyFor`
- `platform/src/test/java/ai/riviera/platform/AltchaDisabledTest.java` — the kill switch admits a
  header-less create
- `platform/src/test/java/ai/riviera/platform/BookingCreateChallengeIT.java` — the whole path over
  real Postgres, both principals
- `platform/src/test/java/ai/riviera/platform/CsrfProtectionIT.java` and
  `platform/src/test/java/ai/riviera/platform/{booking/BookingControllerIT,booking/BookingViewIT,booking/CreateBookingStripeProfileIT,booking/RequestAcceptPayIT,booking/RequestToBookFlowIT,booking/SameDayRequestLifecycleIT,notification/BookingCancellationMailIT,notification/BookingConfirmationMailIT}.java`
  — the mechanical sweep: every existing test that posts to the newly fenced route now solves a real
  challenge instead of bypassing one (the #922 precedent). `RateLimitFilterTest` needs nothing — it
  already runs with `riviera.altcha.enabled=false` so its budgets are measured without the fence
- `frontend/src/app/booking/booking.service.ts` — `createBooking` sends the fence header;
  `bookingErrorOf` maps the three challenge codes
- `frontend/src/app/booking/booking.service.spec.ts` — the header and the widened mapper
- `frontend/src/app/booking/booking-dialog.ts` — hosts the widget, awaits `solved()`, restarts on a
  rejection
- `frontend/src/app/booking/booking-dialog.spec.ts` — AC-8 / AC-9 / AC-10
- `frontend/src/app/booking/booking-dialog.a11y.spec.ts` — axe with the widget mounted on Review
- `frontend/src/app/booking/booking-dialog.contrast.spec.ts` — the widget's ink pairs on the dialog
  glass, three themes
- `frontend/src/app/venue/venue-map.spec.ts` and `frontend/src/app/venue/venue-map.a11y.spec.ts`
  — the `FakeProofOfWork` provider (R-2)
- `frontend/src/app/pages/legal/privacy-policy.html|.ts` — the security-measures section
- `frontend/src/app/pages/legal/privacy-policy.spec.ts` — AC-14
- `frontend/e2e/booking-challenge.e2e.ts` — the dedicated mocked fence spec
- `frontend/e2e/booking-flow.e2e.ts` — the Instant-Book journey carries the fence
- `frontend/e2e/same-day-booking.e2e.ts` — the same-day journey carries the fence
- `frontend/e2e/support/auth-mocks.ts` — `mockChallengeFence` gains a booking-create screen helper
- `frontend/e2e/support/booking-dialog.ts` — `completeDialog` awaits the widget when the fence is on
- `frontend/e2e/real-backend/booking-challenge.e2e.ts` — one real solve, one real booking
- `frontend/e2e/legal-pages.e2e.ts` — the new privacy section is rendered and audited
- `frontend/e2e/{availability-calendar,booking-back-hover-border,find-a-booking,fixed-fill-state-skins,form-error-token-skin,my-bookings,request-to-book,suppressed-confirmation,touch-targets-tourist,venue-map-pan}.e2e.ts`
  — the fence is routed off (or on) so an unrouted probe cannot hang the journey (R-3)
- `RESPONSIBILITIES.md` — § *Platform edge* names booking create among the fenced routes
- `docs/architecture/auth-signin-register.md` — the D-8 status line and challenge paragraph
  move to past tense now that #907 is the last of the four fences
- `docs/plans/pow-fence-auth-forms.md` — **deleted**: its PR (#922) merged, and this is the
  next close-out (`riviera-docs-freshness` § *Plan-doc retirement*)
- `docs/plans/pow-fence-booking-create.md` — this plan

---

## Phase 0 — Fence booking create at the edge (backend)

**Files:** Modify `platform/src/main/java/ai/riviera/platform/ChallengeVerificationFilter.java` ·
Modify `ChallengeVerificationFilterTest.java`, `AltchaDisabledTest.java` · Create
`BookingCreateChallengeIT.java`

- [ ] **Step 1: Write the failing tests** — `/api/bookings` into `fencedRoutes()` + `bodyFor`, the
  kill-switch case, and `BookingCreateChallengeIT` (guest + customer accept; missing / forged /
  expired / replayed refuse; the three tables stay untouched; the per-IP budget still drains).
  Modelled on `OperatorRegisterChallengeIT` — `cost=10`, a known `hmac-secret`, real solves.
- [ ] **Step 2: Run them, verify they fail** —
  `gradle --no-daemon --console=plain test --tests "*ChallengeVerificationFilterTest*"` → FAIL
  (a solved create reaches the controller instead of being fenced: the missing-header case returns
  the controller's answer, not `CHALLENGE_REQUIRED`).
- [ ] **Step 3: Minimal implementation** — add `"/api/bookings"` to `FENCED_POSTS` and retire the
  "the remaining public writes join here in their own slices" clause from its one-line comment.
- [ ] **Step 4: Run them, verify they pass** —
  `gradle --no-daemon --console=plain test --tests "*ChallengeVerificationFilterTest*" --tests "*AltchaDisabledTest*"`
  then `--tests "*BookingCreateChallengeIT*"` (one IT class at a time), then the structural net.
- [ ] **Step 5: Generalization-audit pass** — population: every place that enumerates the fenced
  route set. Record the enumerating command in the log below.
- [ ] **Step 6: Commit** — `git commit -m "Fence booking create with the proof-of-work challenge (#907)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The widget on checkout and the header on create (frontend)

**Files:** Modify `booking.service.ts`, `booking-dialog.ts` and their specs · Modify
`booking-dialog.a11y.spec.ts`, `booking-dialog.contrast.spec.ts`, `venue-map.spec.ts`,
`venue-map.a11y.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-8/9/10 in `booking-dialog.spec.ts` (with
  `FakeProofOfWork`, `vi.mock('altcha')` and `defineFakeAltchaElement`), the header + widened mapper
  in `booking.service.spec.ts`, the widget's ink pairs on the dialog glass in the contrast spec.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- booking-dialog booking.service` → FAIL
  (no widget in the DOM; the create request carries no `X-Altcha-Payload`).
- [ ] **Step 3: Minimal implementation** — `createBooking(request, terms?, challenge?)` with
  `challengeHeaders`; `bookingErrorOf` → `challengeRejection(problemCodeOf(error)) ?? …`; the dialog
  injects `ProofOfWork`, mounts `<app-challenge-widget>` once inside the form (R-1), awaits
  `solved()` before the create, and on `isChallengeRejection` shows the shared message and calls
  `refresh()`.
- [ ] **Step 4: Run them, verify they pass** — `npm test`, then `npm run lint` and
  `npm run format:check`.
- [ ] **Step 5: Generalization-audit pass** — population: every unit spec that renders a component
  which now injects `ProofOfWork` (R-2). Enumerate by mechanism, not by name.
- [ ] **Step 6: Commit** — `git commit -m "Host the proof-of-work widget on booking checkout (#907)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Playwright: the two journeys, the dedicated spec, the real solve

**Files:** Create `frontend/e2e/booking-challenge.e2e.ts`,
`frontend/e2e/real-backend/booking-challenge.e2e.ts` · Modify `booking-flow.e2e.ts`,
`same-day-booking.e2e.ts`, `support/auth-mocks.ts`, `support/booking-dialog.ts`, and every mocked
spec that opens the booking dialog (R-3)

- [ ] **Step 1: Write the failing specs** — the widget visible on checkout, a real Chromium solve,
  the decoded counter on the create, each refusal's message + fresh challenge, the kill switch.
- [ ] **Step 2: Run them, verify they fail** —
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- booking-challenge` → FAIL.
- [ ] **Step 3: Minimal implementation** — wire `mockChallengeFence` through the affected specs and
  the two journeys; teach `completeDialog` to await the widget when the fence is on.
- [ ] **Step 4: Run them, verify they pass** — the full mocked suite
  (`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`), since R-3's population
  spans it. The real-backend spec is local-only and never runs in CI.
- [ ] **Step 5: Generalization-audit pass** — population: every mocked spec that opens the booking
  dialog. Record the enumerating command.
- [ ] **Step 6: Commit** — `git commit -m "Cover the fenced booking checkout end to end (#907)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Privacy-policy security measures + `RESPONSIBILITIES.md`

**Files:** Modify `privacy-policy.html`, `privacy-policy.ts`, `privacy-policy.spec.ts`,
`legal-pages.contrast.spec.ts` (if a new ink pair appears), `frontend/e2e/legal-pages.e2e.ts`,
`RESPONSIBILITIES.md`

- [ ] **Step 1: Write the failing test** — `privacy-policy.spec.ts` asserts the section exists,
  names the three "nots" (no cookie, no fingerprinting, no third party) and the password rule, and
  carries a visible legal-review marker.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- privacy-policy` → FAIL.
- [ ] **Step 3: Minimal implementation** — the section in `privacy-policy.html` (same card-glass
  section shape as its siblings), a line in the component Javadoc, and the `RESPONSIBILITIES.md`
  fenced-route sentence.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- privacy-policy legal-pages`, then
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- legal-pages`.
- [ ] **Step 5: Generalization-audit pass** — population: every substrate doc that enumerates the
  fenced routes (`riviera-docs-freshness`'s counting sweep for "the three auth routes").
- [ ] **Step 6: Commit** — `git commit -m "Disclose the proof-of-work challenge on the draft privacy policy (#907)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-04 | Phase 3 — the fenced route set gains a fourth member | Every substrate doc or source file that **enumerates** the fenced routes or counts them ("the three auth routes"), because a count is the shape of claim that silently goes stale — `riviera-docs-freshness`'s counting sweep | `grep -rn "three auth routes\|three fenced routes" --include=*.md --include=*.ts --include=*.java .` (0 left after the RESPONSIBILITIES.md edit) plus `grep -rln "forgot-password" --include=*.md --include=*.java --include=*.ts .` for the enumerations that do not use a count | 3 docs carried a claim | `RESPONSIBILITIES.md` § *Platform edge*: "the three auth routes … booking create joins in its own slice" → the four routes, plus the every-caller and invariant-#2 properties and the Review-step placement. `docs/architecture/auth-signin-register.md`: the D-8 status line said #906–#907 were "in flight" and the challenge paragraph said "the other three forms follow" — both now past tense. `docs/adr/ADR-0016` already named the final set (a decision record written ahead) and needed no edit; `CLAUDE.md` describes the fence without listing routes. Also retired `docs/plans/pow-fence-auth-forms.md`, whose PR #922 merged — this is the next close-out after it |
| 2026-09-04 | Phase 2 — the checkout gains a widget that fetches a challenge | Every mocked e2e spec that reaches the booking dialog's **Review** step, because that is where the widget mounts and an unrouted `/api/auth/challenge` makes `ProofOfWork` read the fence as ON (a transport failure is deliberately read as on) and renders a widget stuck in its error state. Enumerated by the action that reaches Review, not by file name | `grep -rln "completeDialog\|Continue to payment\|Send request" frontend/e2e --include=*.e2e.ts \| grep -v real-backend` | 10 specs | 3 carry the fence ON because it is their subject (`booking-flow`, `same-day-booking`, the new `booking-challenge`); the other 7 route it OFF explicitly, so none of them audits or measures a broken widget — the `RateLimitFilterTest` precedent of keeping a test's own subject clean. `touch-targets-tourist` keeps its own fence-ON register-card sweep, which re-routes after the file-level OFF |
| 2026-09-04 | Phase 1 — a component starts injecting `ProofOfWork` | Every unit spec that renders a component injecting `ProofOfWork`, because the service's `httpResource` probe fires an unanswered request that parks `whenStable` and trips `httpMock.verify()` — the mechanism is the injection, not the component's name | `grep -rl "inject(ProofOfWork)" frontend/src/app --include=*.ts` (3 components), then `grep -rlE 'createComponent\((BookingDialog\|AuthPage\|ForgotPassword\|VenueMap)\)' frontend/src --include=*.spec.ts` | 8 specs | The 4 auth specs already carry a `FakeProofOfWork` (shipped with #922); the 4 new members — `booking-dialog.spec.ts`, `booking-dialog.a11y.spec.ts`, `venue-map.spec.ts`, `venue-map.a11y.spec.ts` — get one. The two venue-map specs fake the fence **off** (they test the map, not the fence); the dialog a11y spec fakes it **on**, so axe audits the widget that is actually in the modal's tab order |
| 2026-09-04 | Phase 0 — adding a route to the fenced set | Every test that issues an HTTP `POST` to `/api/bookings` (the newly fenced route), i.e. every caller that was passing the fence by not existing yet. Enumerated by literal path, then swept for constant-named and non-MockMvc callers so resemblance could not decide it | `grep -rn 'post("/api/bookings")' platform/src/test/java` (27 sites / 12 files), then `grep -rhoE 'post\([A-Za-z_][A-Za-z0-9_.]*\)' platform/src/test/java \| sort \| uniq -c` and `grep -rln "WebTestClient\|TestRestTemplate" platform/src/test/java` (no further callers) | 27 sites, 12 files | 23 sites in 8 IT classes get a real solved challenge (the #922 precedent — solve, never bypass); `CsrfProtectionIT` gets one so its 404-vs-403 assertion still reaches the domain; `AltchaDisabledTest` + `BookingCreateChallengeIT` are the fence's own tests; `RateLimitFilterTest` needs **no** change — it already sets `riviera.altcha.enabled=false`, deliberately measuring the budgets without the fence (an edit there was written and reverted once its own failure showed the fence was off) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-4:** `gradle --no-daemon --console=plain test --tests "*BookingCreateChallengeIT*"` → PASS.
- [ ] **AC-5, AC-6:** `gradle --no-daemon --console=plain test --tests "*AltchaDisabledTest*" --tests "*ChallengeVerificationFilterTest*"` → PASS.
- [ ] **AC-7:** `gradle --no-daemon --console=plain test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` → PASS.
- [ ] **AC-8..AC-10, AC-13 (jsdom), AC-14:** `npm test` → PASS.
- [ ] **AC-11, AC-13 (browser):** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → PASS.
- [ ] **AC-12:** `npm run test:e2e -- booking-challenge` against a running stack → PASS (local-only).
- [ ] **AC-15:** the fenced-route sentence in `RESPONSIBILITIES.md` names booking create.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; the refusal path is proven to claim nothing (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — unchanged, and shown to be unchanged.
- [ ] **Modulith** section filled; `booking` imports nothing new; the root reaches `challenge` only
      through `api`/`vocabulary` (invariant #11).
- [ ] **Payment/payout** N/A justified; no PaymentIntent on a refused create (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched: no new time arithmetic (invariant #6).
- [ ] Booking codes still absent from logs and problem bodies (invariant #7).
- [ ] No Flyway migration needed; none added (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
