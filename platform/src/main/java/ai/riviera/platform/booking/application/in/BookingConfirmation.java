package ai.riviera.platform.booking.application.in;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.api.SetBookingInfo;

/**
 * The successful result of creating a booking — everything the caller needs to show a
 * confirmation: the unguessable {@code code} (invariant #7), the {@code status}
 * ({@code CONFIRMED} in U3), the {@code set} (venue + label + price), and the
 * {@code bookingDate}. The amount is {@code set.price()} — integer minor units (invariant
 * #5). A pure value carried out of the use case.
 */
public record BookingConfirmation(String code, BookingStatus status, SetBookingInfo set,
		LocalDate bookingDate) {
}
