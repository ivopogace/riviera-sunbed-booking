package ai.riviera.platform.venue.spi;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The one live fact the static beach map lacks about a venue as a whole: whether any of its sets
 * has ever been booked. Used by the {@code venue} bulk-layout write (O3, issue #172) to enforce the
 * <em>reject-unless-unclaimed</em> guard — a destructive layout replace is refused if the venue has
 * any booking, so no set that a {@code booking} row references (FK {@code booking.set_id}) can be
 * deleted out from under it.
 *
 * <p><strong>Driven (SPI) port, dependency-inverted (invariant #11).</strong> Declared here, in the
 * <em>consumer</em>'s {@code spi} named interface — the surface venue needs another module to
 * implement — and <em>implemented by the {@code booking} module</em> (the sole owner/reader of the
 * {@code booking} table). The natural call direction ({@code venue} asking {@code booking}) would
 * risk a Modulith cycle; inverting it keeps the graph acyclic: {@code booking → venue} (via
 * {@code venue::api} + {@code venue::spi}) is the existing, allowed direction, and {@code venue}
 * never imports {@code booking}. It mirrors {@link SetAvailabilityLookup} exactly. {@code ModularityTests}
 * is the gate. It lives in {@code spi}, not {@code api}, because it is an "implement-me" port, not a
 * "call-me" one (see the {@code venue.spi} package docs and the {@code riviera-modulith} api-vs-spi rule).
 */
public interface BookingPresence {

	/**
	 * Whether the venue has <strong>any</strong> booking, of any status (incl. terminal history) — a
	 * booking of any state still pins its set via the {@code booking.set_id} FK. Serves the layout-replace
	 * guard, which treats a single booking as "claimed" (invariant #2 / issue #172).
	 *
	 * @param venueId the venue whose bookings to probe
	 * @return {@code true} if at least one booking row references the venue
	 */
	boolean hasBookings(VenueId venueId);
}
