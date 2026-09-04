/**
 * The venue module — venue profiles, the beach map / layout, set positions,
 * online-vs-walk-in pool assignment, pricing, and booking mode (Instant / Request).
 * The state is the {@code venue} and {@code set_position} tables: a venue's beach map is its set
 * rows, and the commission rate is effective-dated in {@code venue_commission_rate}.
 *
 * <p>Full-module layout (ADR-0007): it owns an application service
 * ({@code VenueAdminService}), so it takes the full template — {@code api} + {@code spi}
 * + {@code vocabulary} + {@code application} + {@code adapter.in} + {@code adapter.out} + a one-type
 * {@code domain} ({@code SalesClose}). It is the one module that owns <strong>cross-module dependency inversions</strong>:
 * the driven ports declared in {@code venue.spi} (inventory: that package's Javadoc) are
 * implemented by {@code availability} and {@code booking} — each of which lists
 * {@code venue::spi} — so venue's reads and write guards can consult live availability,
 * booking presence, and the sales-window verdict without venue depending on those modules.
 * Cross-module access is via this module's {@code api/} port (inbound) or its
 * {@code spi/} driven ports (inverted) — never a reach into its internals.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Venue",
    // operator::api: VenueAdminService asserts per-venue ownership before a beach-map edit
    // (invariant #13). operator publishes its own VenueRef, so this edge does not cycle.
    // review::events + ::api: the rating listener re-reads the aggregate review computed; review is a leaf.
    allowedDependencies = { "operator::api", "operator::vocabulary", "review::api", "review::events", "review::vocabulary", "shared" }
)
package ai.riviera.platform.venue;
