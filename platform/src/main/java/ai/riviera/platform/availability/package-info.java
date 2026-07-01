/**
 * Availability bounded context — the per-{@code (set, date)} source of truth
 * (free / booked-online / staff-marked). The <strong>only</strong> writer of that
 * table; enforces invariant #2 (a set is held by at most one party per date) via a
 * unique constraint plus a row-lock / {@code INSERT ... ON CONFLICT} claim.
 * Aggregate root: {@code SetAvailability}.
 *
 * <p>Hexagonal layout (invariant #11): {@code api}, {@code application.in/out},
 * {@code domain}, {@code infrastructure.in/out}.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Availability",
    // Depends on the operator module's api port (issue #73) so staff tap-to-mark verifies the
    // operator owns the set's venue (invariant #13), resolving that venue from the set id.
    allowedDependencies = { "venue::api", "venue::spi", "operator::api" }
)
package ai.riviera.platform.availability;
