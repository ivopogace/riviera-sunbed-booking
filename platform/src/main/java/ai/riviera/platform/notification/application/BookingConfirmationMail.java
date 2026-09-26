package ai.riviera.platform.notification.application;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;

/**
 * What the booking-confirmation email renders, structured so each {@link Mailer} owns presentation.
 * {@code bookingCode} is a bearer credential (invariant #7): never log it or put it in an event
 * payload. {@code amountMinor} (the stay's total) + {@code currency} are minor units + ISO 4217 (#5),
 * formatted only by the transport; the dates are inclusive {@code Europe/Tirane} service days (#6).
 * The birth window is rendered, never decided: only CLOSED may say "can't cancel", and {@code null}
 * (older payloads) renders like FREE, forever. Rules: {@code RESPONSIBILITIES.md} §notification.
 */
public record BookingConfirmationMail(String bookingCode, String venueName, LocalDate bookingDate,
		LocalDate lastDate, String rowLabel, int positionNo, long amountMinor, String currency,
		CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {

	/** A one-day booking: its last day is its first. */
	public BookingConfirmationMail(String bookingCode, String venueName, LocalDate bookingDate,
			String rowLabel, int positionNo, long amountMinor, String currency,
			CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {
		this(bookingCode, venueName, bookingDate, bookingDate, rowLabel, positionNo, amountMinor, currency,
				cancellationWindowAtBirth, lateCancelRefundBps);
	}
}
