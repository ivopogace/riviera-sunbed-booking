/**
 * Venue's driven ports that <em>another module implements</em> (#11); ports other modules call live
 * in {@code venue.api}, and a port venue's own adapter implements stays in {@code application}.
 * {@link SetAvailabilityLookup} ({@code availability}) overlays live per-{@code (set, date)} state on
 * the dated reads; {@link BookingPresence} ({@code booking}) says which sets guests are still owed;
 * {@link SalesWindow} ({@code booking}) answers the open/closed sales verdict, so venue never
 * re-derives it. Grant {@code venue::spi} only to the implementing module.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.venue.spi;
