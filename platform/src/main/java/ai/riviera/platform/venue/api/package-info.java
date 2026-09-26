/**
 * Published <strong>ports</strong> surface of the {@code venue} module (invariant #11) —
 * interfaces ({@link VenueCatalog}, {@link SetBookingFacts}, {@link VenueRates},
 * {@link BeachMapRemodel}, and the caller-implemented {@link RemodelGate} callback); typed ids and
 * value records live in the sibling {@code vocabulary} named interface. A Spring Modulith named interface, so sibling modules (e.g.
 * {@code availability} via {@link SetBookingFacts#poolForClaim}) depend on it, never on venue's
 * {@code application.*}/{@code adapter.*} packages.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.venue.api;
