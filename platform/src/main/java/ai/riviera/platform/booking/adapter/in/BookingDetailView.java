package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.application.view.BookingDetail;
import ai.riviera.platform.venue.vocabulary.MoneyView;

import java.time.Instant;

/**
 * The {@code 200} response body for {@code GET /api/bookings/{code}} (U6) — the booking summary plus
 * the server-computed cancellation terms the Angular app renders. Money travels as {@link MoneyView}
 * (integer minor units + ISO currency, invariant #5); the date as an ISO {@code LocalDate} string.
 * {@code refundedAmount} is {@code null} unless the booking is already cancelled.
 * {@code emailWithheld} is {@code true} only for a {@code CONFIRMED} booking whose
 * confirmation mail was suppressed — never before payment, so this code-gated view cannot be used as
 * a suppression oracle (D-8). {@code payWindowClosed} says the service day has opened, so
 * {@code payment} is {@code null} and no payment may still be taken (invariant #4).
 * {@code cancelReason} names which cancellation a cancelled booking went through
 * ({@code POLICY}/{@code WEATHER}/{@code CONFLICT}), and is {@code null} both for a live booking and
 * for one cancelled without ever being charged. {@code refundOutstanding} is {@code true} only while
 * a cancelled booking's refund is decided but not yet accepted by the gateway — the panel then says
 * the refund is being processed instead of on its way. Mirrors the FE {@code BookingDetail} type.
 */
record BookingDetailView(String code, String status, long venueId, String venueName, String rowLabel,
		int positionNo, String bookingDate, MoneyView amount, boolean cancellable, boolean withdrawable,
		boolean beforeCutoff, MoneyView refundIfCancelledNow, MoneyView refundedAmount,
		boolean refundOutstanding,
		Instant requestExpiresAt, PaymentCredentialsView payment, boolean emailWithheld,
		boolean payWindowClosed, String cancelReason, String cancellationWindowAtBirth) {

	static BookingDetailView of(BookingDetail d) {
		return new BookingDetailView(d.code(), d.status().name(), d.venueId().value(), d.venueName(),
				d.rowLabel(), d.positionNo(), d.bookingDate().toString(), d.amount(), d.cancellable(),
				d.withdrawable(), d.beforeCutoff(), d.refundIfCancelledNow(), d.refundedAmount(),
				d.refundOutstanding(), d.requestExpiresAt(),
				d.payment() == null ? null
						: new PaymentCredentialsView(d.payment().clientSecret(),
								d.payment().paymentIntentId()),
				d.emailWithheld(), d.payWindowClosed(),
				d.cancelReason() == null ? null : d.cancelReason().name(),
				d.cancellationWindowAtBirth().name());
	}

	/** The open PaymentIntent's credentials — present only while {@code AWAITING_PAYMENT}. */
	record PaymentCredentialsView(String clientSecret, String paymentIntentId) {
	}
}
