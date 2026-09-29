package ai.riviera.platform.booking.application.refund;

import java.util.List;

/**
 * The admin's way to a booking for the venue day refund (ADR-0027 decision 1): a guest's bookings by the
 * email they booked with, since the audited admin path may carry an id but never a code (#7). The
 * address stops at {@code customer::api}; every later read is by id. Internal to {@code booking}.
 */
public interface GuestDayRefundLookup {

	/**
	 * The bookings made with this address, newest first, each with its days' state; empty for an unknown address
	 * <em>and</em> for a known one with no bookings — the same answer, so the surface is no address oracle.
	 */
	List<GuestBooking> forEmail(String email);
}
