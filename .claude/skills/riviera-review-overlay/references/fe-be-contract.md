# Riviera FE↔BE contract overlay items

Repo-specific full-stack contract bank items. Loaded by `riviera-review-overlay`
and layered onto whatever generic contract bank the active review engine runs
(today: the `code-review` plugin) — walked after it.

Activates when the parent skill's contract bank activates (Full-stack scope OR a
contract change). Invariant numbers reference `CLAUDE.md`.

## Items

### RV-CT-1. API typing — no `as any`, no hand-stubbed DTOs
**Gate:** Does the Angular client consume the API through generated or explicitly
typed services, with the backend DTO as the single source of shape?
- [ ] no contract change
- [ ] client typed from the backend contract (generated from OpenAPI, or a typed service mirroring the DTO)
- [ ] `as any` / untyped `any` on a response (violation)
- [ ] frontend interface silently diverges from the backend DTO (drift)

**Follow-up:**
- If an OpenAPI-generated client is used, regenerate after a backend contract change
  and commit the regenerated client with the consumer in the same PR; never hand-edit
  generated files.
- If typing by hand, the DTO is authoritative — keep one definition, don't let FE and
  BE compute the shape independently.

**Default severity:** Major for `as any` on a contract response; Major for a stale
hand-stubbed type.
**Skill framing:**
- Pre-impl: "How will the FE be typed against this endpoint — generated or
  hand-typed? Capture the regenerate step as a phase if generated."
- Peer-review: "Grep the diff for `as any` near HTTP calls. Does the FE type match
  the BE DTO?"

---

### RV-CT-2. Money and dates on the wire (invariants #5, #6)
**Gate:** Do money and dates cross the boundary in the agreed shape?
- [ ] amounts as integer minor units + ISO currency code
- [ ] amount sent/received as a float or euro-decimal string (violation)
- [ ] booking date as ISO `LocalDate` (`YYYY-MM-DD`), not a timestamp
- [ ] a date sent as a full `Instant` that can shift the calendar day across zones (violation)

**Follow-up:**
- Agree once, both sides honor it; the money and calendar-date rules are canonical
  in invariants #5 and #6 — check against them, don't re-derive.

**Default severity:** Major for float money on the wire or a day-shifting date
encoding.
**Skill framing:**
- Peer-review: "Inspect the JSON for amounts and dates. Minor-units integer? Plain
  `LocalDate`? Any timestamp standing in for a calendar day?"

---

### RV-CT-3. Payment confirmation flow — webhook is truth, redirect is UX (invariant #8)
**Gate:** Is the end-to-end payment flow confirmed by a server-side verified webhook,
with the client redirect treated as UX only?
- [ ] no payment flow change
- [ ] booking confirmed server-side on a verified webhook; FE shows a finalizing→confirmed state reconciled from the server
- [ ] FE marks the booking confirmed purely from the Stripe redirect (violation)
- [ ] FE polls/loads the server booking state to confirm (acceptable)

**Follow-up:**
- The redirect can be lost (closed tab, retries). The booking's confirmed state lives
  on the server, set by the webhook. The FE reads that state; it doesn't assert it.
- This is the same invariant from both ends — pair with RV-BE-7 (backend) and
  RV-FE-4 (frontend).

**Default severity:** **Blocker** for a client-asserted confirmation; this is a
money/trust correctness bug.
**Skill framing:**
- Pre-impl: "Draw the payment sequence: who confirms the booking, and from what
  signal? It must be the verified webhook."
- Peer-review: "Follow the confirm path across FE and BE. Does anything but the
  verified webhook set CONFIRMED?"

---

### RV-CT-4. Double-submit / idempotency across the boundary
**Gate:** Are reserve-and-pay actions safe against double submission and retries?
- [ ] booking creation is idempotent or guarded against double-submit
- [ ] a retried/duplicated submit can create two bookings or two charges (violation)
- [ ] the FE disables/locks the submit while in flight
- [ ] backend dedupes via the availability claim (invariant #2) and the Stripe idempotency key (invariant #8)

**Follow-up:**
- The availability single-winner guarantee (RV-BE-1) already stops two confirmed
  bookings for the same set; ensure the *same user* double-clicking doesn't create a
  duplicate booking/charge either.
- FE locks the button during the request; BE keys the operation so a retry is a
  no-op.

**Default severity:** Major for an unguarded double-submit path.
**Skill framing:**
- Peer-review: "What happens on a double-click or a network-retry of 'Book & pay'?
  Two bookings? Two charges?"

---

### RV-CT-5. Error contract is consistent and surfaced
**Gate:** Do business errors follow the shipped RFC-7807 contract, with a stable
machine-readable `code` the FE branches on?
- [ ] business errors are `ProblemDetail` (`application/problem+json`) with the `code` extension (e.g. `409 SET_TAKEN`, `BOOKING_CLOSED`, `NOT_ONLINE_POOL`)
- [ ] domain conflicts surface as generic 500s or a bespoke `{"error": …}` body (violation)
- [ ] FE shows a raw error string instead of a user-meaningful message
- [ ] a new business rejection ships without its own `code` the FE can explain

**Follow-up:**
- The contract is shipped and centralized (RV-BE-10): `ApiProblem` +
  `ApiErrorHandler` build every error body — mechanics in
  `riviera-java-conventions/references/error-contract.md`.
- The FE maps each `code` to a helpful message and, for `SET_TAKEN`, refreshes the
  map (RV-FE-2).

**Default severity:** Major for conflicts surfacing as 500s or a body outside the
ProblemDetail contract; Minor for a missing friendly message.
**Skill framing:**
- Peer-review: "List the business error responses. ProblemDetail with a stable
  `code`? Does the FE handle `SET_TAKEN` by refreshing rather than erroring?"
