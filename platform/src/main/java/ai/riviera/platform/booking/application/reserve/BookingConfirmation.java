package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The successful result of creating a booking — everything the caller needs to show a
 * confirmation: the unguessable {@code code} (invariant #7), the {@code status}, the {@code set}
 * (venue + label + per-day price), the days ({@code bookingDate} the first, {@code lastDate} the
 * last, inclusive) and the stay's total {@code amount} — integer minor units (invariant #5). A pure
 * value carried out of the use case.
 *
 * <p>{@code emailWithheld} says the confirmation mail was suppressed, so the confirmation screen can
 * drop its "we've also emailed it to you" claim and tell the guest to save the code. Only the
 * {@code CONFIRMED} outcome can carry it: the {@code AWAITING_PAYMENT} and {@code PENDING_REQUEST}
 * outcomes are pre-payment, where answering the question at all would leak suppression status for an
 * arbitrary address.
 */
public record BookingConfirmation(String code, BookingStatus status, SetBookingInfo set,
		LocalDate bookingDate, LocalDate lastDate, MoneyView amount, boolean emailWithheld) {
}
