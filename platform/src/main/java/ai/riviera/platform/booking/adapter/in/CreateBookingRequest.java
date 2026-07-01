package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.customer.api.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The {@code POST /api/bookings} request body. A transport DTO using primitives/strings on
 * the wire (the booking date is an ISO {@code LocalDate} string); {@link #toCommand()} maps it
 * onto the typed {@link CreateBookingCommand}, validating presence and shape. Any bad input
 * surfaces as {@link IllegalArgumentException}, which the controller maps to {@code 400}
 * (the project has no {@code spring-boot-starter-validation}, so validation is explicit here).
 */
record CreateBookingRequest(Long setId, String bookingDate, Contact contact) {

	record Contact(String email, String fullName, String phone) {
	}

	CreateBookingCommand toCommand() {
		if (setId == null) {
			throw new IllegalArgumentException("setId is required");
		}
		if (bookingDate == null || bookingDate.isBlank()) {
			throw new IllegalArgumentException("bookingDate is required");
		}
		if (contact == null) {
			throw new IllegalArgumentException("contact is required");
		}
		LocalDate date;
		try {
			date = LocalDate.parse(bookingDate);
		}
		catch (DateTimeParseException e) {
			throw new IllegalArgumentException("bookingDate must be an ISO date (YYYY-MM-DD)", e);
		}
		// GuestContact's canonical constructor validates email/name/phone are present.
		GuestContact guest = new GuestContact(contact.email(), contact.fullName(), contact.phone());
		return new CreateBookingCommand(new SetId(setId), date, guest);
	}
}
