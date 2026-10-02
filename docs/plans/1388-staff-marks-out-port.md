# #1388 — staff hold/release SQL behind an availability out port; no JDBC in `application/`

Issue #1388 (epic #1337 item 2). Branch: `feature/1388-staff-marks-out-port`, off `main` @ `8ab3acb`.

## Intake (grilled against `main` @ 8ab3acb)

- Still true: `StaffAvailabilityService` is the only `..application..` class importing
  `org.springframework.jdbc` / `java.sql` / `javax.sql` (grep over `*/application`).
- Owner: `availability` (sole writer of `set_availability`); the writer stays in the module, so
  `ResponsibilitiesArchitectureTests`' sole-writer scan (and #1387's data-driven map) stays green.
- No Flyway, no API change. Siblings touching the same files: #1391 (JdbcOnly), #1390 (net line).

## Acceptance criteria

1. Given `StaffAvailabilityService`, it imports no JDBC type — pinned by the new rule in
   `JdbcOnlyArchitectureTests` (production scan).
2. Given a staff mark / release, the same `INSERT … ON CONFLICT (set_id, booking_date) DO NOTHING`
   and `DELETE … AND state = 'STAFF_MARKED'` run inside the service's `@Transactional` method — pinned
   unchanged by `StaffAvailabilityIT`, `StaffAvailabilityControllerIT`,
   `StaffMarkVsOnlineClaimConcurrencyIT`, `ConcurrentClaimIT`.
3. Given a fixture class in an `application` package naming `JdbcClient`, `java.sql` or
   `javax.sql`, the rule reports it; a JDBC-free fixture is not reported — `JdbcOnlyArchitectureTests`
   against `ai.riviera.applicationjdbcfixture`.
4. The structural net (six classes) is green.

## Modulith

New internal outbound port `availability.application.StaffMarks` (public, unpublished: only
`adapter.out.JdbcStaffMarks` implements it — the `challenge.application.ChallengeRegistry` shape).
Not `api` (nobody outside calls it), not `spi` (no other module implements it).

## Availability & concurrency (invariant #2)

Statements copied verbatim. The adapter carries no `@Transactional`: it joins the service's
transaction, so the ownership check, the retired-set lock (`poolForClaim`) and the write stay in one
transaction exactly as before. The primitive remains the unique `(set_id, booking_date)` row +
`ON CONFLICT DO NOTHING`.

## Risks

- Another `application` class already reaching `org.springframework.jdbc` transitively
  (e.g. a `DataAccessException` subtype lives in `org.springframework.dao`, not `jdbc`) — the
  production run shows it.

## Execution status

- [x] Phase 1: rule + fixtures (red on production)
- [x] Phase 2: port + adapter, service JDBC-free (green)
- [x] Phase 3: docs (RESPONSIBILITIES §availability + machine-checked table)
