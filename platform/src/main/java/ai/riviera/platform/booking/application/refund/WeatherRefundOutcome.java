package ai.riviera.platform.booking.application.refund;

import java.util.List;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The result of an admin weather refund for a venue and date, money in integer minor units + ISO
 * currency (invariant #5): the lone one-day bookings cancelled and refunded in full, the days of stays
 * refunded while the stays continue (issue #1210), and the bookings whose day the guest had checked into,
 * by id — never by code (invariant #7) — so the operator sees what was left standing. All zero with an
 * empty list is a valid no-op. Rationale: RESPONSIBILITIES.md §booking.
 */
public record WeatherRefundOutcome(int refundedCount, long totalRefundedMinor, String currency,
		int dayRefundCount, long dayRefundedMinor, List<BookingId> notRefunded) {

	public WeatherRefundOutcome {
		notRefunded = List.copyOf(notRefunded);
	}
}
