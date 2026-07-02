package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;

import ai.riviera.platform.booking.application.request.PendingRequest;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * One pending request in the operator queue response (issue #98). Id-based — deliberately
 * carries <strong>no booking code</strong> (invariant #7): the operator accepts/declines by
 * {@code bookingId}; the code becomes staff-relevant only once the booking is confirmed (then
 * the daily view shows it). Money as {@link MoneyView} (integer minor units, invariant #5);
 * dates ISO; instants ISO-8601 UTC (invariant #6).
 */
record PendingRequestView(long bookingId, long setId, String bookingDate, String guestName,
		MoneyView amount, Instant requestedAt, Instant requestExpiresAt) {

	static PendingRequestView of(PendingRequest request) {
		return new PendingRequestView(request.bookingId(), request.setId().value(),
				request.bookingDate().toString(), request.guestName(),
				new MoneyView(request.amountMinor(), request.currency()),
				request.requestedAt(), request.requestExpiresAt());
	}
}
