/**
 * The venue module: profiles, the beach map (set positions, online-vs-walk-in pools), pricing and
 * booking mode, in the {@code venue} and {@code set_position} tables; the commission rate is
 * effective-dated in {@code venue_commission_rate}. The map is the <em>active</em> set rows (the
 * {@code active_set_position} view): a set with booking history is retired, never deleted (ADR-0019).
 * Full ADR-0007 layout. Others call its {@code api}; {@code availability} and {@code booking}
 * implement its {@code spi} (each granted {@code venue::spi}), so venue never depends on them (#11).
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Venue",
    // operator::api: BeachMapEditService asserts per-venue ownership before a beach-map edit
    // (invariant #13). operator publishes its own VenueRef, so this edge does not cycle.
    // review::events + ::api: the rating listener re-reads the aggregate review computed; review is a leaf.
    allowedDependencies = { "operator::api", "operator::vocabulary", "review::api", "review::events", "review::vocabulary", "shared" }
)
package ai.riviera.platform.venue;
