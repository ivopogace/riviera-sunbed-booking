# Riviera FE↔BE contract overlay items

Repo-specific full-stack contract bank items, layered onto the active review engine's
generic contract bank and walked after it. Activates on Full-stack scope OR a contract
change. Invariant numbers reference `CLAUDE.md`.

### RV-CT-1. API typing — no `as any`, no hand-stubbed DTOs
**Gate:** Does the Angular client consume the API through generated or explicitly typed
services, with the backend DTO as the single source of shape?
- [ ] no contract change
- [ ] client typed from the backend contract (generated from OpenAPI, or a typed service mirroring the DTO)
- [ ] `as any` / untyped `any` on a response (violation)
- [ ] frontend interface silently diverges from the backend DTO (drift)

**Follow-up:**
- A generated client is regenerated after a backend contract change and committed with the
  consumer in the same PR; never hand-edit generated files.
- Hand-typed: the DTO is authoritative — one definition.
- The linter already fails the build on `no-explicit-any` and the type-aware unsafe-`any`
  family (`no-unsafe-assignment`/`-member-access`/`-argument`/`-call`/`-return`), so
  review effort goes to what a type system cannot see: whether the FE type is *truthful*
  about the backend DTO. Compare field by field.

**Default severity:** Major for `as any` on a contract response; Major for a stale
hand-stubbed type.

---

### RV-CT-2. Money and dates on the wire (invariants #5, #6)
**Gate:** Do money and dates cross the boundary in the agreed shape?
- [ ] amounts as integer minor units + ISO currency code
- [ ] amount sent/received as a float or euro-decimal string (violation)
- [ ] booking date as ISO `LocalDate` (`YYYY-MM-DD`), not a timestamp
- [ ] a date sent as a full `Instant` that can shift the calendar day across zones (violation)

**Default severity:** Major for float money on the wire or a day-shifting date encoding.

---

### RV-CT-3. Payment confirmation flow — webhook is truth, redirect is UX (invariant #8)
**Gate:** Is the end-to-end payment flow confirmed by a server-side verified webhook, with
the client redirect treated as UX only?
- [ ] no payment flow change
- [ ] booking confirmed server-side on a verified webhook; FE shows a finalizing→confirmed state reconciled from the server
- [ ] FE marks the booking confirmed purely from the Stripe redirect (violation)
- [ ] FE polls/loads the server booking state to confirm (acceptable)

**Follow-up:** the redirect can be lost (closed tab, retries); the confirmed state lives on
the server, set by the webhook. Follow the confirm path across FE and BE: does anything
but the verified webhook set CONFIRMED? Pair with RV-BE-7 and RV-FE-4.

**Default severity:** **Blocker** for a client-asserted confirmation.

---

### RV-CT-4. Double-submit / idempotency across the boundary
**Gate:** Are reserve-and-pay actions safe against double submission and retries?
- [ ] booking creation is idempotent or guarded against double-submit
- [ ] a retried/duplicated submit can create two bookings or two charges (violation)
- [ ] the FE locks the submit while in flight
- [ ] backend dedupes via the availability claim (invariant #2) and the Stripe idempotency key (invariant #8)

**Follow-up:** the availability single-winner guarantee (RV-BE-1) stops two confirmed
bookings for the same set; ensure the *same user* double-clicking doesn't create a
duplicate booking/charge either.

**Default severity:** Major for an unguarded double-submit path.

---

### RV-CT-5. Error contract is consistent and surfaced
**Gate:** Do business errors follow the RFC-7807 contract, with a stable machine-readable
`code` the FE branches on?
- [ ] business errors are `ProblemDetail` (`application/problem+json`) with the `code` extension (e.g. `409 SET_TAKEN`, `BOOKING_CLOSED`, `NOT_ONLINE_POOL`)
- [ ] domain conflicts surface as generic 500s or a bespoke `{"error": …}` body (violation)
- [ ] FE shows a raw error string instead of a user-meaningful message
- [ ] a new business rejection ships without its own `code` the FE can explain

**Follow-up:** `ApiProblem` + `ApiErrorHandler` build every error body
(`riviera-java-conventions/references/error-contract.md`); the FE maps each `code` to a
message and, for `SET_TAKEN`, refreshes the map (RV-FE-2).

**Default severity:** Major for conflicts surfacing as 500s or a body outside the
ProblemDetail contract; Minor for a missing friendly message.
