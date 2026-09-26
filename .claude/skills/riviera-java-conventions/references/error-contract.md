# Request validation & the error contract

Every API error is an RFC-7807 `ProblemDetail` (`application/problem+json`) with a stable
`code` extension, built in exactly two places; the filter chain's rejections mirror it by hand
(below).

## `ApiProblem` (`ai.riviera.platform.shared`)

The one factory for the wire shape; controllers use it when a typed-outcome `switch` rejects.
`detail` never carries a booking code (#7), an exception message or any internal echo.

**`detail` states the condition, not the remedy.** `code` is the contract; wording a human
reads belongs to the client. Write the fact about server state (*"Another set already
occupies this grid cell."*), never a consequence, a remedy or UI navigation.

- **Name the condition class, not the arm, and keep the class true.** A code serving several
  guards (`SET_IN_USE`: move, save-that-moves, remove) gets one `detail` naming no arm, and
  the ITs assert the same string at every arm. Too short is untrue ("This set is in use."
  reads as occupied now); too broad is uncharacterizing. *"has a booking or a **current**
  hold"* is the narrowest statement true at every arm.
- **No call site is exempt**, mapper or not (`RATE_LIMITED`, `CANNOT_SUSPEND_SELF` have none).
  Enumerate by mechanism: `grep -rn "ApiProblem\." platform/src/main` unrolled through each
  controller's local `problem(...)`/`error(...)` helper, plus the hand-built JSON in
  `RateLimitFilter` and `SecurityProblemResponses` — a phrase grep misses all of those.
- **One string per code and token.** `MISSING_CURRENT_PASSWORD` (operator + customer),
  `REQUEST_NOT_PENDING` (accept, decline, withdraw — may not say "already been decided").
  `STALE_WRITE` guards two tokens, two conditions, so it carries one string per token:
  `venue.version` (the profile write, `STALE_PROFILE_DETAIL`) and `venue.set_version` (reprice,
  rename, batch apply, replace and remodel share `STALE_SETS_DETAIL` — may not claim *prices*
  or *layout*). `CurrentPasswordDetailTwinTest` pins its pair live.
- **Not findings:** `UNSUPPORTED_FORMAT` (states what the server accepts),
  `BOOTSTRAP_CREDENTIAL_MANAGED`, `SET_NOT_BOOKABLE_ONLINE`, `RATE_LIMITED`'s *"Too many
  requests."* (any widening leaks which of four dimensions fired).

## `ApiErrorHandler` (root package)

The single `@RestControllerAdvice`, extending `ResponseEntityExceptionHandler`:
`shared.InvalidApiRequestException` → `400 INVALID_REQUEST`; `BlockedPasswordException` →
`400 PASSWORD_CONTAINS_BLOCKED_TERM`; `AuthenticationException` → `401 INVALID_CREDENTIALS`
(one body for every cause — telling them apart is account enumeration); `DuplicateKeyException` →
`409 CONFLICT` (unique-constraint race backstop); `NotVenueOwnerException` /
`AccessDeniedException` → `403`. Raw `IllegalArgumentException` and non-duplicate
`DataIntegrityViolationException` are deliberately unmapped — they are server bugs and reach
the framework's logged 500. A controller feeding request input into IAE-throwing guards
(`toCommand()`, `PeriodKey.of`, enum parses) translates at the conversion boundary via
`InvalidApiRequestException.parsing(...)`. `ErrorContractArchitectureTests` forbids
per-controller `@ExceptionHandler`s. `RateLimitFilter` and `SecurityProblemResponses`
(security-chain 401/403, proof-of-work refusals) mirror the shape by hand (they reject before
MVC dispatch).

- Validation: presence/shape/format at the edge (`toCommand()`); domain invariants in the value
  object's constructor and the application service; no HTTP status in the domain.
- Status map: availability/uniqueness conflict `409`; not-bookable/cutoff `422`; unknown id `404`;
  malformed body `400`; bad credentials `401`; ownership `403`; rate limit `429`. Framework errors:
  `400` → `INVALID_REQUEST`, `413` → `PAYLOAD_TOO_LARGE` (pinned literally — the base handler is
  `final` and the 413 constant name is unstable), otherwise the HTTP status name
  (`ApiErrorHandlerTest`).
- `instance` is `about:blank` by construction (Spring would auto-fill the request URI, which
  on `/api/bookings/{code}` is the bearer credential); a controller may override with a
  known-safe URI.

**Validation is centralized-explicit:** hand-rolled checks in `toCommand()`, translated at the
controller, mapped once by the advice. No `spring-boot-starter-validation`/`@Valid` — the
checks are parse/cross-field logic, and annotations would split validation across two
mechanisms.
