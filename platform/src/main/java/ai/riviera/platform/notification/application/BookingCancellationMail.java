package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.RefundReason;

/**
 * Structured facts the cancellation/refund mail renders, like {@link BookingConfirmationMail}.
 * {@code refundMinor} + {@code currency} are the server-computed refund decision (invariants #5, #10),
 * not a settlement: the copy says the refund is on its way, never that it arrived; zero is real and
 * renders as words, never {@code EUR 0.00}. {@code bookingCode} is a bearer credential (#7) — never log
 * it. {@code rebookLink} is non-null only on a venue-caused (remodel) cancellation, which is what tells
 * the two {@link RefundReason#VENUE_CHANGE} shapes apart; it embeds no credential.
 */
public record BookingCancellationMail(String bookingCode, String venueName, LocalDate bookingDate,
		LocalDate lastDate, long refundMinor, String currency, RefundReason reason, URI rebookLink) {

	/** A one-day booking: its last day is its first. */
	public BookingCancellationMail(String bookingCode, String venueName, LocalDate bookingDate,
			long refundMinor, String currency, RefundReason reason, URI rebookLink) {
		this(bookingCode, venueName, bookingDate, bookingDate, refundMinor, currency, reason, rebookLink);
	}
}
