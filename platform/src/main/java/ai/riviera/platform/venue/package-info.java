/**
 * Venue bounded context — venue profiles, the beach map / layout, set positions,
 * online-vs-walk-in pool assignment, pricing, and booking mode (Instant / Request).
 * Aggregate roots: {@code Venue}, {@code BeachMap}.
 *
 * <p>Full-module layout (ADR-0007): it owns an application service
 * ({@code VenueAdminService}), so it takes the full template — {@code api} + {@code spi}
 * + {@code application} + {@code adapter.in} + {@code adapter.out} (no {@code domain}
 * today). It is the one module that owns a <strong>cross-module dependency inversion</strong>:
 * {@code venue.spi.SetAvailabilityLookup} is declared here and implemented by
 * {@code availability} (which lists {@code venue::api} + {@code venue::spi}), so the beach-map
 * read can overlay live per-{@code (set, date)} availability without venue depending on
 * availability. Cross-module access is via this module's {@code api/} port (inbound) or its
 * {@code spi/} driven port (inverted) — never a reach into its internals.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Venue",
    // operator::api: VenueAdminService asserts per-venue ownership before a beach-map edit
    // (invariant #13). operator publishes its own VenueRef, so this edge does not cycle.
    allowedDependencies = { "operator::api", "operator::vocabulary" }
)
package ai.riviera.platform.venue;
