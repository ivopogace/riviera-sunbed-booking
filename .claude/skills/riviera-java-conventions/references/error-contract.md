# Request validation & the error contract (one contract, shipped by #97)

Every API error is an **RFC-7807 `ProblemDetail`** (`application/problem+json`) carrying a
stable machine-readable **`code`** extension. The shape is built in exactly two places:

- **`ApiProblem`** (`ai.riviera.platform.shared`, the Shared Kernel — moved out of the root
  package in #371 so modules may depend on it without cycling back into the composition root)
  — the one factory for the wire shape. Controllers use it
  when an exhaustive typed-outcome `switch` rejects (typed outcomes are returned, not thrown
  — SKILL.md §6 — so an advice never sees them). `detail` must be safe for any caller: never
  a booking code (invariant #7), an exception message, or another internal echo.
- **`detail` states the condition, not the remedy** (#610). The stable contract a client
  switches on is `code`; the wording a human reads belongs to whichever client is rendering,
  because only it knows the surface, the audience and what the user can do next. A `detail`
  written as operator- or tourist-facing copy therefore becomes a **second copy** of wording
  the client already owns — one that reaches no user and that nothing keeps in sync. That is
  not hypothetical: `SET_IN_USE` and `LAYOUT_IN_USE` each carried the console's own sentence,
  drifted apart when #567 sharpened one and left the other stale, and cost #607 a slice to
  re-align before #610 removed the duplicate outright.
  - **Write the condition, and only the condition.** *"Another set already occupies this grid
    cell."*, *"No set on this venue has that row label."*, *"This set has a booking or a current
    hold."* — a fact about server state. Not *"…so it can't be moved, repooled or removed"* (a
    consequence the client states better), not *"Reload the latest and try again"* (a remedy),
    never *"Switch to Edit sets…"* (UI navigation the API cannot know).
  - **Name the condition class, not the arm — and make sure the class is true.** `SET_IN_USE`
    serves two guards of different breadth and those guards are expected to change (#609), so
    its `detail` names no arm: one that describes which arm fired goes stale when the arm does,
    and the ITs assert the *same* string at every arm to pin that property rather than the
    sentence. **Two traps on the way there, both hit while writing this rule.** *Too short and
    untrue:* "This set is in use." is **false** for the commonest remove refusal — a set whose
    only booking is a long-cancelled one is not in use, it is undeletable by the RESTRICT
    `booking.set_id` FK (`RESPONSIBILITIES.md` §venue). *Too broad to characterize:* "has a
    booking or a hold" is then true of sets the server happily edits, since a hold whose day has
    passed stops locking anything (#599/#602) — an integrator reading it re-learns the belief
    those slices removed. The shipped wording, "has a booking or a **current** hold", is the
    narrowest statement that is true at every arm: it conveys the hold's liveness without
    restating the guard's date arithmetic, which is the copy posture #607 settled.
  - **Known exceptions, not yet fixed — a floor, not the population.** Six strings across
    **seven call sites** still speak in remedy voice: the three `STALE_WRITE` details in
    `VenueAdminController`, plus `"You cannot suspend the account you are signed in with."`,
    `"You do not manage this venue."`, and `"Enter your current password."` — which is itself
    **twinned** across `OperatorAccountController` and `MyAccountController`, so fixing the one
    you grep first re-creates the drift-between-twins defect this rule exists to prevent. They
    were found by a phrase sweep (`try again|reload|please|your |you `), which is a **lower
    bound** — it would not have caught either string #610 fixed, since neither contains those
    words. The real population is the intersection of ~49 server `detail` literals with the ~21
    client `code`→copy mappers, and it has never been enumerated (issue #644). Treat an absence
    from this list as unexamined, not clean.
- **`ApiErrorHandler`** (root package) — the **single** `@RestControllerAdvice` for
  everything thrown: `shared.InvalidApiRequestException` (typed edge validation, #118) →
  `400 INVALID_REQUEST`, `DuplicateKeyException` → `409 CONFLICT` (the unique-constraint-race
  backstop, invariant #12), `NotVenueOwnerException`/`AccessDeniedException` → `403`
  (invariant #13); it extends `ResponseEntityExceptionHandler` so framework errors carry the
  same shape. **Raw `IllegalArgumentException` and non-duplicate
  `DataIntegrityViolationException` are deliberately unmapped since #118** — they signal
  server bugs (a domain invariant on stored data, a schema/FK/NOT-NULL fault) and propagate
  to the framework's logged 500; edge code throws the typed exception directly, and a
  controller feeding request input into IAE-throwing guards (`toCommand()`, `PeriodKey.of`,
  enum parses) translates at the conversion boundary via
  `InvalidApiRequestException.parsing(...)`. **Per-controller `@ExceptionHandler`s are
  forbidden** — machine-locked by `ErrorContractArchitectureTests`. (`RateLimitFilter`
  mirrors the shape by hand: it rejects before MVC dispatch.)
- **Where validation lives.** Presence/shape/format checks belong at the edge (the DTO's
  `toCommand()`), domain invariants in the value object's canonical constructor (`Money`,
  ids) and the application service. Keep HTTP-status mapping out of the domain — the
  controller/advice maps a typed outcome or exception to a status.
- **Status mapping, centrally defined:** availability/uniqueness conflicts → `409`;
  not-bookable/cutoff → `422`; unknown id → `404`; malformed body → `400`; ownership → `403`;
  rate limit → `429`. Framework-raised errors carry a **derived stable code**: `400` →
  `INVALID_REQUEST`, `413` → `PAYLOAD_TOO_LARGE` (pinned literally — the multipart backstop,
  #142: the base class's `MaxUploadSizeExceededException` handler is `final`, so no same-advice
  `@ExceptionHandler`, and the 413 `HttpStatus` constant name is unstable across framework
  versions), otherwise the HTTP status name (`METHOD_NOT_ALLOWED`,
  `UNSUPPORTED_MEDIA_TYPE`, …) — pinned by `ApiErrorHandlerTest`.
- **`instance` is redacted by construction.** Spring auto-fills a null ProblemDetail
  `instance` with the raw request URI — on `/api/bookings/{code}` paths that is the bearer
  credential (invariant #7). `ApiProblem` pins every body to `about:blank` (the advice
  re-applies it to framework-built bodies); a controller may override with a known-safe URI
  (`BookingController` uses its collection path).

> **Decision settled at #97's plan stage:** **centralized-explicit validation** — hand-rolled
> checks in `toCommand()` throwing `IllegalArgumentException`, translated at the controller's
> conversion boundary (#118) and mapped once by the advice.
> `spring-boot-starter-validation`/`@Valid` was deliberately **not** adopted (three DTOs whose
> checks are parse/cross-field logic; annotations would split validation across two
> mechanisms; explicit code in records is the house idiom). Reversible in one dependency line
> if the DTO count ever makes annotations pay — rationale in
> `docs/plans/error-contract-problemdetail.md`.
