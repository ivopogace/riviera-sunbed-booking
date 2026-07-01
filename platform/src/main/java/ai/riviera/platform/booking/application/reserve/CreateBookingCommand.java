package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.customer.api.GuestContact;
import ai.riviera.platform.venue.api.SetId;

/**
 * The intent to create an Instant booking: which set, for which calendar day (a
 * {@code LocalDate} reasoned in {@code Europe/Tirane}, invariant #6), and the guest's
 * contact. A transport-agnostic command — the web {@code CreateBookingRequest} maps onto it,
 * so the use case has no dependency on HTTP.
 */
public record CreateBookingCommand(SetId setId, LocalDate bookingDate, GuestContact contact) {
}
