package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.booking.application.MailDisclosure;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The successful result of creating a booking, for the confirmation screen: the unguessable
 * {@code code} (invariant #7), the {@code status}, the {@code set} (venue + label + per-day price),
 * the days ({@code bookingDate} to {@code lastDate}, inclusive) and the stay's total {@code amount}
 * in integer minor units (invariant #5). {@code confirmationMail} is {@code ConfirmationMailDisclosure}'s answer
 * for the creating session; every pre-payment outcome carries {@code UNDISCLOSED}.
 */
public record BookingConfirmation(String code, BookingStatus status, SetBookingInfo set,
		LocalDate bookingDate, LocalDate lastDate, MoneyView amount, MailDisclosure confirmationMail) {
}
