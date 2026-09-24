package ai.riviera.platform.booking.adapter.in;

import java.util.List;

import ai.riviera.platform.booking.application.refund.WeatherRefundOutcome;
import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The HTTP response for an admin weather refund: how many one-day bookings were cancelled + fully
 * refunded, the total in integer minor units + ISO currency (invariant #5), and the stays left for a
 * manual refund — a count and their booking ids, never codes (invariant #7). A thin wire DTO over
 * {@link WeatherRefundOutcome}.
 */
record WeatherRefundView(int refundedCount, long totalRefundedMinor, String currency,
		int manualRefundCount, List<Long> manualRefundBookingIds) {

	static WeatherRefundView of(WeatherRefundOutcome outcome) {
		List<Long> manual = outcome.manualRefunds().stream().map(BookingId::value).toList();
		return new WeatherRefundView(outcome.refundedCount(), outcome.totalRefundedMinor(),
				outcome.currency(), manual.size(), manual);
	}
}
