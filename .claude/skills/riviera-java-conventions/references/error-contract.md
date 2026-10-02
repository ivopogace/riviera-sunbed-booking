# Request validation & the error contract

Every API error is an RFC-7807 `ProblemDetail` (`application/problem+json`) with a stable
`code` extension, built in exactly two places; the filter chain's rejections mirror it by hand
(below).

## `ApiProblem` (`ai.riviera.platform.shared`)

The one factory for the wire shape; controllers use it when a typed-outcome `switch` rejects.
`code` is the contract: the SPA branches on it alone (`frontend/src/app/shared/api-error.ts`) and
maps it to its own copy, so a renamed or re-purposed code is a breaking change. `detail` is for a
human reading the raw response: state the condition in a sentence, and never carry a booking code
(#7), an exception message or any internal echo. Enumerate every call site by mechanism, not by
phrase: `grep -rn "ApiProblem\." platform/src/main` unrolled through each controller's local
`problem(...)`/`error(...)` helper, plus the hand-built JSON in `RateLimitFilter` and
`SecurityProblemResponses`.

## `ApiErrorHandler` (`web`)

The single `@RestControllerAdvice`, extending `ResponseEntityExceptionHandler`:
`shared.InvalidApiRequestException` → `400 INVALID_REQUEST`; `BlockedPasswordException` →
`400 PASSWORD_CONTAINS_BLOCKED_TERM`; `AuthenticationException` → `401 INVALID_CREDENTIALS`
(one body for every cause — telling them apart is account enumeration); `DuplicateKeyException` →
`409 CONFLICT` (unique-constraint race backstop); `NotVenueOwnerException` → `403 NOT_VENUE_OWNER`;
`AccessDeniedException`, `NoOperableOperatorException`, `NotSignedInCustomerException` → `403 ACCESS_DENIED`. Raw `IllegalArgumentException` and non-duplicate
`DataIntegrityViolationException` are deliberately unmapped — they are server bugs and reach
the framework's logged 500. A controller feeding request input into IAE-throwing guards
(`toCommand()`, `PeriodKey.of`, enum parses) translates at the conversion boundary via
`InvalidApiRequestException.parsing(...)`. `ErrorContractArchitectureTests` forbids
per-controller `@ExceptionHandler`s. `RateLimitFilter` (429, and 413 `PAYLOAD_TOO_LARGE` for a login body past its 8 KiB cap) and
`SecurityProblemResponses` (security-chain 401/403, proof-of-work refusals) mirror the shape by hand (they reject before
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
