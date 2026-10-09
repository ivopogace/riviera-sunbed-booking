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

### Extension members past `code`

A body may carry an RFC 9457 extension member past `code` only where the module that writes it
owns its meaning, so it is built in that module's controller on `ApiProblem.of(...)`, never added
to `shared` (admission by ownership: `RESPONSIBILITIES.md` § `shared`). Current members:

- `sets` on `venue`'s `409 SETS_IN_USE` (layout replace): the removed sets a live claim pins.
- `field` on `venue`'s set-write `400 INVALID_REQUEST` (`POST …/sets`, `PATCH …/sets/{id}`, the
  batch `PATCH …/sets`): `"price"` when the price broke `SetPrice` (or, on a single-set write, was
  missing; a batch without one leaves prices untouched), so the editor
  binds the error to its price input (#1463). Any other 400 on those routes (an unknown pool, a
  missing `expectedVersion`, a grid field) comes from the advice and carries no `field`.

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
per-controller `@ExceptionHandler`s. `RateLimitFilter` (429) and
`SecurityProblemResponses` (security-chain 401/403, proof-of-work refusals, the edge's 413 `PAYLOAD_TOO_LARGE` for a body
past its cap) mirror the shape by hand (they reject before MVC dispatch).

- Validation: presence/shape/format at the edge (`toCommand()`); domain invariants in the value
  object's constructor and the application service; no HTTP status in the domain.
- Status map: availability/uniqueness conflict `409`; not-bookable/cutoff `422`; unknown id `404`;
  malformed body `400`; bad credentials `401`; ownership `403`; rate limit `429`. Framework errors:
  `400` → `INVALID_REQUEST`, `413` → `PAYLOAD_TOO_LARGE` (pinned literally — the base handler is
  `final` and the 413 constant name is unstable), otherwise the HTTP status name
  (`ApiErrorHandlerTest`).
- `instance` is never sent: no per-occurrence URI (#7). Spring auto-fills a null `instance` with
  the request URI, on `/api/bookings/{code}` the bearer credential, so `web`'s
  `ProblemInstanceConfig` clears it on every MVC-written body; the hand-built filter-chain bodies
  omit it. Never set one (`ProblemDetail.setInstance`), not even a constant path.
- `/error` follows the contract: `web`'s `ProblemErrorController` replaces Boot's `BasicErrorController`, so a
  filter-thrown exception, a `sendError` or an unmapped exception answers `ApiProblem.of(status,
  ApiErrorHandler.defaultCode(status), …)` with the dispatched status kept, on every path, never Boot's
  `path`/`timestamp` map or whitelabel page (`ErrorDispatchProblemIT`).

**Validation is centralized-explicit:** hand-rolled checks in `toCommand()`, translated at the
controller, mapped once by the advice — save a refusal whose body names its field (§ *Extension
members past `code`*), which its controller checks and answers before `toCommand()`.
No `spring-boot-starter-validation`/`@Valid` — the checks are parse/cross-field logic, and
annotations would split validation across two mechanisms.
