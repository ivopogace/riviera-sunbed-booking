package ai.riviera.platform.booking.application.refund;

import java.util.List;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The result of an admin weather refund: how many one-day bookings were cancelled and fully
 * refunded for the venue+date, the total in integer minor units + ISO currency (invariant #5), and
 * the stays the run could not refund. A {@code refundedCount} of 0 with an empty list means there
 * was nothing on that day — a valid no-op, not an error.
 *
 * <p>{@code manualRefunds} names every booking spanning more than one day that covers the date:
 * refunding only the stormy day is a partial refund of a live booking, which the single reversal per
 * booking (invariant #9) cannot express, so such a stay is left untouched and handed to the operator
 * by id — never by code (invariant #7) — rather than skipped silently.
 */
public record WeatherRefundOutcome(int refundedCount, long totalRefundedMinor, String currency,
		List<BookingId> manualRefunds) {

	public WeatherRefundOutcome {
		manualRefunds = List.copyOf(manualRefunds);
	}
}
