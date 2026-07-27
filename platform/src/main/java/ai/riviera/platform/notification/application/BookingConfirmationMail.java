package ai.riviera.platform.notification.application;

import java.time.LocalDate;

/**
 * Everything the booking-confirmation email renders (#371, epic #367 story 1) — structured, not
 * pre-rendered, so each {@link Mailer} implementation decides its own presentation: {@code SmtpMailer}
 * formats a plain-text body, {@code MockMailer} records the fields verbatim for ITs to assert on.
 *
 * <p>{@code bookingCode} is the tourist's venue-arrival credential (invariant #7): it must never be
 * logged, and it deliberately never enters an event payload (see
 * {@code booking.vocabulary.BookingNotificationInfo}). {@code amountMinor} + {@code currency} are
 * integer minor units + ISO 4217 (invariant #5) — formatting for display happens in the transport,
 * never by re-deriving a decimal amount anywhere else. {@code bookingDate} is the service date as a
 * {@code LocalDate} in {@code Europe/Tirane} (invariant #6), carried straight off
 * {@code BookingConfirmed}.
 *
 * <p>{@code rowLabel} + {@code positionNo} are the beach-map spot, sourced from
 * {@code venue.api.SetBookingFacts}. Unpublished module-internal value (#382) — public only for the
 * module's own {@code adapter} packages (the listener assembles it, the transports render it).
 */
public record BookingConfirmationMail(String bookingCode, String venueName, LocalDate bookingDate,
		String rowLabel, int positionNo, long amountMinor, String currency) {
}
