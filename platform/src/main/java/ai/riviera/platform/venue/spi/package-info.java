/**
 * Venue's driven ports that <em>another module implements</em> (#11); ports other modules call live
 * in {@code venue.api}. {@link SetAvailabilityLookup} ({@code availability}) overlays live
 * per-{@code (set, date)} state on the dated reads; {@link BookingPresence} ({@code booking}) says
 * which sets guests are still owed; {@link SalesWindow} ({@code booking}) answers the sales verdict;
 * {@link RemodelGate} ({@code remodel}) is the remodel commit's callback, asked under its locks.
 * Grant {@code venue::spi} only to the implementing module.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.venue.spi;
