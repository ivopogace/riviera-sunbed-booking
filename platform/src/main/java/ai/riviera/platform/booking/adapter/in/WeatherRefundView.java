package ai.riviera.platform.booking.adapter.in;

import java.util.List;

import ai.riviera.platform.booking.application.refund.WeatherRefundOutcome;
import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The HTTP response for an admin weather refund: how many lone one-day bookings were cancelled + fully
 * refunded and their total, how many stays had the day refunded and that total (integer minor units +
 * ISO currency, invariant #5), and the bookings whose day the guest had checked into and so kept — a
 * count and their booking ids, never codes (invariant #7). A thin wire DTO over {@link WeatherRefundOutcome}.
 */
record WeatherRefundView(int refundedCount, long totalRefundedMinor, String currency, int dayRefundCount,
		long dayRefundedMinor, int notRefundedCount, List<Long> notRefundedBookingIds) {

	static WeatherRefundView of(WeatherRefundOutcome outcome) {
		List<Long> kept = outcome.notRefunded().stream().map(BookingId::value).toList();
		return new WeatherRefundView(outcome.refundedCount(), outcome.totalRefundedMinor(), outcome.currency(),
				outcome.dayRefundCount(), outcome.dayRefundedMinor(), kept.size(), kept);
	}
}
