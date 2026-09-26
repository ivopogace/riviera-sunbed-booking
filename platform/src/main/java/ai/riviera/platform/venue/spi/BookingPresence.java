package ai.riviera.platform.venue.spi;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Map;

import ai.riviera.platform.venue.vocabulary.LiveBookingCounts;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driven SPI port (invariant #11), implemented by {@code booking}: the live fact the static map lacks —
 * whether a set was ever booked, and whether anyone booked on it is still coming. Only a live booking
 * refuses a layout write (moving or removing the set would strand that guest); any booking at all makes a
 * removal retire the set rather than delete it (ADR-0019). Which statuses count is {@code booking}'s call;
 * {@code venue} never enumerates them. Rationale: RESPONSIBILITIES.md §venue.
 */
public interface BookingPresence {

	/**
	 * Whether any booking of any status, terminal included, references this set — decides retire vs delete on
	 * every removal (ADR-0019). Set-scoped: a booking on a neighbouring set pins nothing here.
	 */
	boolean hasBookings(SetId setId);

	/**
	 * Whether a non-terminal booking references this set — the per-set edit and remove guards; a finished
	 * booking refuses nothing. Which statuses are live is {@code booking}'s call.
	 */
	boolean hasLiveBookings(SetId setId);

	/**
	 * For each of {@code setIds} with a live booking, its earliest service day; other sets are absent, never
	 * {@code null}, and an empty input touches no database. Feeds the owner's map locks and the bulk save's refusal.
	 */
	Map<SetId, LocalDate> nearestLiveBookings(Collection<SetId> setIds);

	/**
	 * What the venue's guests are still owed from {@code from} (a civil day in {@code Europe/Tirane})
	 * on: bookings a guest may still turn up on, and requests the venue has not answered. Serves the
	 * close-for-season response; which statuses count is this module's call.
	 */
	LiveBookingCounts liveBookingsFrom(VenueId venueId, LocalDate from);
}
