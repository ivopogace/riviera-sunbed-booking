package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

import ai.riviera.platform.booking.application.reserve.BookingConfirmation;

/**
 * The {@code 202 Accepted} response body for a Request-to-Book creation (issue #98): the shared
 * {@link CreatedBookingView} summary (status {@code PENDING_REQUEST}) plus the venue-response
 * deadline, an ISO-8601 UTC instant (invariant #6). Deliberately <strong>no</strong>
 * {@code clientSecret}/{@code paymentIntentId} — no PaymentIntent is <em>on record</em> until the
 * venue accepts (payment-request-on-accept); the guest checks status on the code-gated booking
 * view and pays from there once accepted.
 */
record RequestedView(@JsonUnwrapped CreatedBookingView booking, Instant requestExpiresAt) {

	static RequestedView of(BookingConfirmation confirmation, Instant requestExpiresAt) {
		return new RequestedView(CreatedBookingView.of(confirmation), requestExpiresAt);
	}
}
