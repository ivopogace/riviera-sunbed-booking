package ai.riviera.platform.venue.spi;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The one live fact the static beach map lacks: whether a venue — or one of its individual sets —
 * has ever been booked — and, separately, whether it is booked by anyone still coming. The scope
 * follows what the write touches: the bulk replace asks about the whole venue because it deletes
 * every set, the per-set writes about the one set. The <em>strictness</em> follows what the write
 * destroys: a delete is refused by any booking ever, because the {@code booking.set_id} FK pins the
 * row regardless of status, while an edit is refused only by a live booking, because repositioning
 * a set strands a guest who is still coming and nobody else.
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
	 * Serves the per-set <em>remove</em> guard, which must not delete a set the RESTRICT FK pins
	 * (invariant #2) — the edit guard asks {@link #hasLiveBookings} instead. Set-scoped on purpose:
	 * a booking on a neighbouring set of the same venue does not claim this one.
	 *
	 * @param setId the set position to probe
	 * @return {@code true} if at least one booking row references the set
	 */
	boolean hasBookings(SetId setId);

	/**
	 * Whether this set has a booking that can <strong>still be honoured</strong> — one in a
	 * non-terminal status. Serves the per-set <em>edit</em> guard, where the question is not "was
	 * this set ever sold?" but "would moving it strand a guest who is still coming?": a cancelled
	 * or completed booking pins the row against deletion, yet nothing is harmed by repositioning
	 * the set afterwards. Which statuses count as live is <strong>this module's</strong> call, not
	 * the caller's — {@code venue} must never enumerate booking statuses.
	 *
	 * @param setId the set position to probe
	 * @return {@code true} if at least one non-terminal booking references the set
	 */
	boolean hasLiveBookings(SetId setId);
}
