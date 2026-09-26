/**
 * The availability module — the per-{@code (set, date)} source of truth (free / booked-online /
 * staff-marked) and the <strong>only</strong> writer of that table; enforces invariant #2 via a
 * unique constraint plus a row-lock / {@code INSERT ... ON CONFLICT} claim. No {@code domain}
 * package: the constraint is the rule (ADR-0018). Otherwise the full template (ADR-0007):
 * {@code api} + {@code vocabulary} + {@code application} + {@code adapter.in}/{@code adapter.out};
 * it implements {@code venue::spi} ({@code SetAvailabilityLookup}) and owns no {@code spi}.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Availability",
    // Depends on the operator module's api port (issue #73) so staff tap-to-mark verifies the
    // operator owns the set's venue (invariant #13), resolving that venue from the set id.
    allowedDependencies = { "venue::api", "venue::vocabulary", "venue::spi", "operator::api", "operator::vocabulary", "shared" }
)
package ai.riviera.platform.availability;
