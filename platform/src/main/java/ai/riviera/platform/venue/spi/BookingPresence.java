package ai.riviera.platform.venue.spi;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The one live fact the static beach map lacks: whether a venue — or one of its individual sets —
 * has ever been booked. Used by the {@code venue} layout writes to enforce the
 * <em>reject-unless-unclaimed</em> guard, so no set that a {@code booking} row references (FK
 * {@code booking.set_id}) can be deleted or repositioned out from under it. The bulk replace asks
 * about the whole venue because it deletes every set; the per-set edit/remove asks about the one
 * set it touches.
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
	 * guard, which treats a single booking as "claimed" (invariant #2).
	 *
	 * @param venueId the venue whose bookings to probe
	 * @return {@code true} if at least one booking row references the venue
	 */
	boolean hasBookings(VenueId venueId);

	/**
	 * Whether <strong>this set</strong> has any booking, of any status (incl. terminal history).
	 * Serves the per-set edit/remove guard, which must not delete a set the RESTRICT FK pins, nor
	 * move one a booking still points at (invariants #2/#3). Set-scoped on purpose: a booking on a
	 * neighbouring set of the same venue does not claim this one.
	 *
	 * @param setId the set position to probe
	 * @return {@code true} if at least one booking row references the set
	 */
	boolean hasBookings(SetId setId);
}
