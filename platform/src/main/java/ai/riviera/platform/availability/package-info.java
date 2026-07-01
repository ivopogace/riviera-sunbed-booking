/**
 * Availability bounded context — the per-{@code (set, date)} source of truth
 * (free / booked-online / staff-marked). The <strong>only</strong> writer of that
 * table; enforces invariant #2 (a set is held by at most one party per date) via a
 * unique constraint plus a row-lock / {@code INSERT ... ON CONFLICT} claim.
 * Aggregate root: {@code SetAvailability}.
 *
 * <p>Full-module layout (ADR-0007): it owns an application service (the synchronous
 * claim port with real concurrency semantics), so it takes the full template —
 * {@code api} + {@code application} + {@code adapter.in} + {@code adapter.out}
 * (no {@code domain} today). It implements {@code venue::spi}
 * ({@code SetAvailabilityLookup}); it owns no {@code spi} of its own.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Availability",
    // Depends on the operator module's api port (issue #73) so staff tap-to-mark verifies the
    // operator owns the set's venue (invariant #13), resolving that venue from the set id.
    allowedDependencies = { "venue::api", "venue::vocabulary", "venue::spi", "operator::api", "operator::vocabulary" }
)
package ai.riviera.platform.availability;
