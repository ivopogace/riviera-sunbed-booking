package ai.riviera.platform.booking.application.refund;

import java.util.List;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The result of an admin weather refund: how many one-day bookings for the venue+date were
 * cancelled and fully refunded, the total in integer minor units + ISO currency (invariant #5), and
 * the stays it could not refund. A {@code refundedCount} of 0 with an empty list is a valid no-op.
 *
 * <p>{@code manualRefunds} names every multi-day booking covering the date, left untouched for the
 * operator by id — never by code (invariant #7) — since one reversal per booking (invariant #9)
 * cannot express a partial refund of a live booking. Rationale: RESPONSIBILITIES.md §booking.
 */
public record WeatherRefundOutcome(int refundedCount, long totalRefundedMinor, String currency,
		List<BookingId> manualRefunds) {

	public WeatherRefundOutcome {
		manualRefunds = List.copyOf(manualRefunds);
	}
}
