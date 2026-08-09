package ai.riviera.platform.booking.application.checkin;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The staff check-in command (#583) — the inbound port the booking module's operator REST adapter
 * calls to record, off the scanned or typed booking code, that the guest arrived: the guarded
 * {@code CONFIRMED → COMPLETED} transition, valid only on the booking's service date (today in
 * {@code Europe/Tirane}, invariant #6). Internal to {@code booking}, not cross-module {@code api/}
 * (invariant #11): the only caller is this module's own REST adapter — the {@code ListDailyBookings}
 * precedent.
 */
public interface CheckInBooking {

	/**
	 * Check the guest with this {@code code} in at {@code venueId}. Venue-scoped (invariant #13):
	 * asserts {@code operator} owns {@code venueId} <em>first</em> — {@code 403} on a mismatch,
	 * before any lookup. Single-use: a second scan answers {@link CheckInResult.AlreadyCheckedIn};
	 * concurrent scans yield exactly one {@link CheckInResult.CheckedIn}. Unknown codes and another
	 * venue's codes are one indistinguishable {@link CheckInResult.NotFound} (non-enumerating), and
	 * no outcome ever carries the code back (invariant #7).
	 */
	CheckInResult checkIn(OperatorId operator, VenueId venueId, String code);
}
