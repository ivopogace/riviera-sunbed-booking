# Riviera FE↔BE contract overlay items

Activates on Full-stack scope or any contract change. Invariant numbers: `CLAUDE.md`.

### RV-CT-1. API typing — Major
The Angular client consumes the API through generated or explicitly typed services with the
backend DTO as the single source of shape; no `as any` on a response; a generated client is
regenerated and committed with its consumer, never hand-edited. The linter already fails
`no-explicit-any` and the unsafe-`any` family, so review effort goes to whether the FE type is
*truthful* about the DTO — compare field by field.

### RV-CT-2. Money and dates on the wire (#5, #6) — Major
Amounts as integer minor units + ISO currency, never a float or euro string; booking date as
ISO `LocalDate` (`YYYY-MM-DD`), never an `Instant` that can shift the calendar day.

### RV-CT-3. Payment confirmation (#8) — **Blocker**
Booking confirmed server-side on a verified webhook; the FE shows finalizing→confirmed
reconciled from the server (polling/loading server state is fine). Follow the confirm path
across FE and BE: nothing but the verified webhook sets CONFIRMED. Pair with RV-BE-7, RV-FE-4.

### RV-CT-4. Double-submit / idempotency — Major
Booking creation guarded against double submit: FE locks the submit in flight; backend dedupes
via the availability claim (#2) and the Stripe idempotency key (#8). The single-winner
guarantee stops two bookings for one set; also check the *same user* double-clicking can't
create a duplicate booking or charge.

### RV-CT-5. Error contract — Major for a 500 or non-ProblemDetail body; Minor for a missing friendly message
Business errors are `ProblemDetail` (`application/problem+json`) with a stable `code`
(`409 SET_TAKEN`, `BOOKING_CLOSED`, `NOT_ONLINE_POOL`), built by `ApiProblem` + `ApiErrorHandler`
(`riviera-java-conventions/references/error-contract.md`); a new rejection ships its own `code`;
the FE maps each `code` to a message and, for `SET_TAKEN`, refreshes the map (RV-FE-2).
