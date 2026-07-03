# Request validation & the error contract (one contract, shipped by #97)

Every API error is an **RFC-7807 `ProblemDetail`** (`application/problem+json`) carrying a
stable machine-readable **`code`** extension. The shape is built in exactly two places:

- **`ApiProblem`** (root package) — the one factory for the wire shape. Controllers use it
  when an exhaustive typed-outcome `switch` rejects (typed outcomes are returned, not thrown
  — SKILL.md §6 — so an advice never sees them). `detail` must be safe for any caller: never
  a booking code (invariant #7), an exception message, or another internal echo.
- **`ApiErrorHandler`** (root package) — the **single** `@RestControllerAdvice` for
  everything thrown: `IllegalArgumentException` → `400 INVALID_REQUEST`,
  `DataIntegrityViolationException` → `409 CONFLICT` (the constraint-race backstop,
  invariant #12), `NotVenueOwnerException`/`AccessDeniedException` → `403` (invariant #13);
  it extends `ResponseEntityExceptionHandler` so framework errors carry the same shape.
  **Per-controller `@ExceptionHandler`s are forbidden** — machine-locked by
  `ErrorContractArchitectureTests`. (`RateLimitFilter` mirrors the shape by hand: it rejects
  before MVC dispatch.)
- **Where validation lives.** Presence/shape/format checks belong at the edge (the DTO's
  `toCommand()`), domain invariants in the value object's canonical constructor (`Money`,
  ids) and the application service. Keep HTTP-status mapping out of the domain — the
  controller/advice maps a typed outcome or exception to a status.
- **Status mapping, centrally defined:** availability/uniqueness conflicts → `409`;
  not-bookable/cutoff → `422`; unknown id → `404`; malformed body → `400`; ownership → `403`;
  rate limit → `429`. Framework-raised errors carry a **derived stable code**: `400` →
  `INVALID_REQUEST`, otherwise the HTTP status name (`METHOD_NOT_ALLOWED`,
  `UNSUPPORTED_MEDIA_TYPE`, …) — pinned by `ApiErrorHandlerTest`.
- **`instance` is redacted by construction.** Spring auto-fills a null ProblemDetail
  `instance` with the raw request URI — on `/api/bookings/{code}` paths that is the bearer
  credential (invariant #7). `ApiProblem` pins every body to `about:blank` (the advice
  re-applies it to framework-built bodies); a controller may override with a known-safe URI
  (`BookingController` uses its collection path).

> **Decision settled at #97's plan stage:** **centralized-explicit validation** — hand-rolled
> checks in `toCommand()` throwing `IllegalArgumentException`, mapped once by the advice.
> `spring-boot-starter-validation`/`@Valid` was deliberately **not** adopted (three DTOs whose
> checks are parse/cross-field logic; annotations would split validation across two
> mechanisms; explicit code in records is the house idiom). Reversible in one dependency line
> if the DTO count ever makes annotations pay — rationale in
> `docs/plans/error-contract-problemdetail.md`.
