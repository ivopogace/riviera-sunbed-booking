package ai.riviera.platform.booking.infrastructure.in;

import ai.riviera.platform.booking.application.in.WeatherRefundOutcome;

/**
 * The HTTP response for an admin weather refund (U9, issue #12): how many bookings were cancelled +
 * fully refunded and the total in integer minor units + ISO currency (invariant #5). A thin wire DTO
 * over {@link WeatherRefundOutcome}.
 */
record WeatherRefundView(int refundedCount, long totalRefundedMinor, String currency) {

	static WeatherRefundView of(WeatherRefundOutcome outcome) {
		return new WeatherRefundView(outcome.refundedCount(), outcome.totalRefundedMinor(),
				outcome.currency());
	}
}
