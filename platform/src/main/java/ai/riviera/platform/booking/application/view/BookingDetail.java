package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.review.vocabulary.ReviewPanel;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The booking-view screen (U6): cancellation terms server-computed (invariant #10), money in minor
 * units (#5), pay deadline computed server-side in {@code Europe/Tirane} (#4, #6). {@code cancellable}
 * ({@code CONFIRMED}, window open) and {@code withdrawable} (a {@code PENDING_REQUEST} retraction, no
 * policy) are never both true; {@code payment} is set only while payable. {@code emailWithheld} is
 * asked only once {@code CONFIRMED}, else this code-gated view is a suppression oracle.
 * {@code reviewPanel} is review's answer — never derive it from {@code status}.
 */
public record BookingDetail(String code, BookingStatus status, VenueId venueId, String venueName,
		String rowLabel, int positionNo, LocalDate bookingDate, LocalDate lastDate, MoneyView amount,
		boolean cancellable,
		boolean withdrawable, boolean beforeCutoff, MoneyView refundIfCancelledNow,
		MoneyView refundedAmount, boolean refundOutstanding,
		java.time.Instant requestExpiresAt,
		ai.riviera.platform.payment.vocabulary.PaymentCredentials payment, boolean emailWithheld,
		boolean payWindowClosed, RefundReason cancelReason,
		CancellationWindow cancellationWindowAtBirth, ReviewPanel reviewPanel,
		String reviewNameSuggestion, BookingMove move) {
}
