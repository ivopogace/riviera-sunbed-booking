package ai.riviera.platform.booking.application.checkin;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The staff check-in command — the inbound port the booking module's operator REST adapter
 * calls to record, off the scanned or typed booking code, that the guest arrived today: the
 * guarded stamp on today's {@code booking_day} row (today in {@code Europe/Tirane}, invariant
 * #6), which resolves the stay {@code COMPLETED} when it was the last service day. Internal to
 * {@code booking}, not cross-module {@code api/} (invariant #11): the only caller is this module's
 * own REST adapter — the {@code ListDailyBookings} precedent.
 */
public interface CheckInBooking {

	/**
	 * Venue-scoped (#13): {@code 403} unless {@code operator} owns {@code venueId}, before lookup.
	 * Once per service day (a repeat is {@code AlreadyCheckedIn}; concurrent scans, one
	 * {@code CheckedIn}). Unknown and other-venue codes: one {@code NotFound}. No code echoed (#7).
	 */
	CheckInResult checkIn(OperatorId operator, VenueId venueId, String code);
}
