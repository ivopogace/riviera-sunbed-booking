# Request validation & the error contract

Every API error is an RFC-7807 `ProblemDetail` (`application/problem+json`) carrying a
stable machine-readable `code` extension. The shape is built in exactly two places.

## `ApiProblem` (`ai.riviera.platform.shared`)

The one factory for the wire shape. Controllers use it when an exhaustive typed-outcome
`switch` rejects (typed outcomes are returned, not thrown — SKILL.md §6 — so an advice
never sees them). `detail` must be safe for any caller: never a booking code (invariant
#7), an exception message, or another internal echo.

**`detail` states the condition, not the remedy.** The stable contract a client switches
on is `code`; the wording a human reads belongs to the client rendering it, which alone
knows the surface, the audience, and what the user can do next. A `detail` written as
user-facing copy becomes a second copy of wording the client owns, reaching no user and
kept in sync by nothing.

- **Write the condition, and only the condition.** *"Another set already occupies this grid
  cell."*, *"No set on this venue has that row label."*, *"This set has a booking or a
  current hold."* — a fact about server state. Not a consequence (*"…so it can't be moved,
  repooled or removed"*), not a remedy (*"Reload the latest and try again"*), never UI
  navigation (*"Switch to Edit sets…"*).
- **Name the condition class, not the arm — and make sure the class is true.** A code that
  serves several guards (`SET_IN_USE` serves two of different breadth) gets a `detail` that
  names no arm, and the ITs assert the same string at every arm. Two traps: *too short and
  untrue* ("This set is in use." is false for a set whose only booking is long-cancelled —
  undeletable by the RESTRICT `booking.set_id` FK, not in use) and *too broad to
  characterize* ("has a booking or a hold" is true of sets the server happily edits, since a
  hold whose day has passed locks nothing). "has a booking or a **current** hold" is the
  narrowest statement true at every arm.
- **No remedy-voiced `detail` is left in the tree, and none is exempt.** Scope is every
  `detail` in remedy voice, whether or not a client mapper duplicates it
  (`RATE_LIMITED` and `CANNOT_SUSPEND_SELF` have no client `code`→copy mapper and are still
  in scope). Enumerate call sites by mechanism, not phrase: `grep -rn "ApiProblem\."
  platform/src/main` unrolled through each controller's local `problem(...)`/`error(...)`
  helper — a literal in a `switch` arm behind a helper, a *consequence* clause with no
  banned phrase, and the hand-built JSON in `RateLimitFilter` all escape a phrase grep.
- **One code, one string — pin the pair, not the sentence.** Codes emitted from more than
  one call site: `MISSING_CURRENT_PASSWORD` (operator + customer password change — the
  client owns that sentence as `CURRENT_PASSWORD_REQUIRED_MESSAGE`), `REQUEST_NOT_PENDING`
  (accept, decline, withdraw — the shared wording may not say "already been decided",
  false of the withdrawn route), and `STALE_WRITE`'s two set-writes (one
  `venue.set_version` token, so neither may claim *prices* or *layout* changed).
  `CurrentPasswordDetailTwinTest` asserts its pair's two live responses equal each other,
  so a one-sided edit is red even when the new wording is fine alone.
- **Examined and deliberately left:** `UNSUPPORTED_FORMAT` (byte-identical to
  `venue-tab.ts`'s copy, but a true statement of what the server accepts, not a remedy),
  `BOOTSTRAP_CREDENTIAL_MANAGED` (trailing "…and cannot be changed here"),
  `SET_NOT_BOOKABLE_ONLINE` (a prose transliteration of its own code). `RATE_LIMITED`'s
  *"Too many requests."* is a knowing restatement: every truthful widening either leaks
  which of the four rate-limit dimensions fired or is false at one of them.

## `ApiErrorHandler` (root package)

The single `@RestControllerAdvice` for everything thrown: `shared.InvalidApiRequestException`
(typed edge validation) → `400 INVALID_REQUEST`, `DuplicateKeyException` → `409 CONFLICT`
(the unique-constraint-race backstop, invariant #12), `NotVenueOwnerException` /
`AccessDeniedException` → `403` (invariant #13); it extends
`ResponseEntityExceptionHandler` so framework errors carry the same shape. Raw
`IllegalArgumentException` and non-duplicate `DataIntegrityViolationException` are
deliberately unmapped — they signal server bugs (a domain invariant on stored data, a
schema/FK/NOT-NULL fault) and propagate to the framework's logged 500; edge code throws the
typed exception directly, and a controller feeding request input into IAE-throwing guards
(`toCommand()`, `PeriodKey.of`, enum parses) translates at the conversion boundary via
`InvalidApiRequestException.parsing(...)`. Per-controller `@ExceptionHandler`s are
forbidden — machine-locked by `ErrorContractArchitectureTests`. (`RateLimitFilter` mirrors
the shape by hand: it rejects before MVC dispatch.)

- **Where validation lives.** Presence/shape/format checks at the edge (the DTO's
  `toCommand()`), domain invariants in the value object's canonical constructor (`Money`,
  ids) and the application service. Keep HTTP-status mapping out of the domain.
- **Status mapping:** availability/uniqueness conflicts → `409`; not-bookable/cutoff →
  `422`; unknown id → `404`; malformed body → `400`; ownership → `403`; rate limit →
  `429`. Framework-raised errors carry a derived stable code: `400` → `INVALID_REQUEST`,
  `413` → `PAYLOAD_TOO_LARGE` (pinned literally — the base class's
  `MaxUploadSizeExceededException` handler is `final`, so no same-advice
  `@ExceptionHandler`, and the 413 `HttpStatus` constant name is unstable across framework
  versions), otherwise the HTTP status name (`METHOD_NOT_ALLOWED`,
  `UNSUPPORTED_MEDIA_TYPE`, …) — pinned by `ApiErrorHandlerTest`.
- **`instance` is redacted by construction.** Spring auto-fills a null ProblemDetail
  `instance` with the raw request URI — on `/api/bookings/{code}` paths that is the bearer
  credential (invariant #7). `ApiProblem` pins every body to `about:blank` (the advice
  re-applies it to framework-built bodies); a controller may override with a known-safe URI
  (`BookingController` uses its collection path).

**Validation decision: centralized-explicit** — hand-rolled checks in `toCommand()`
throwing `IllegalArgumentException`, translated at the controller's conversion boundary and
mapped once by the advice. `spring-boot-starter-validation`/`@Valid` was deliberately not
adopted (the checks are parse/cross-field logic; annotations would split validation across
two mechanisms; explicit code in records is the house idiom). Reversible in one dependency
line if the DTO count ever makes annotations pay — `docs/plans/error-contract-problemdetail.md`.
