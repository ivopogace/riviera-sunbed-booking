package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The {@code POST /api/bookings} request body. A transport DTO using primitives/strings on
 * the wire (the dates are ISO {@code LocalDate} strings; {@code lastDate} is optional and defaults
 * to {@code bookingDate}, a one-day booking); {@link #toCommand} maps it onto the typed
 * {@link CreateBookingCommand}, validating presence, shape and the span's bounds. Any bad input
 * surfaces as {@link IllegalArgumentException}, which the controller's conversion wrap translates
 * to the typed 400 (the project has no {@code spring-boot-starter-validation}, so validation is
 * explicit here).
 */
record CreateBookingRequest(Long setId, String bookingDate, String lastDate, Contact contact) {

	record Contact(String email, String fullName, String phone) {
	}

	CreateBookingCommand toCommand(CustomerAccountId accountId) {
		if (setId == null) {
			throw new IllegalArgumentException("setId is required");
		}
		if (bookingDate == null || bookingDate.isBlank()) {
			throw new IllegalArgumentException("bookingDate is required");
		}
		if (contact == null) {
			throw new IllegalArgumentException("contact is required");
		}
		LocalDate first = parseDate(bookingDate, "bookingDate");
		LocalDate last = lastDate == null || lastDate.isBlank() ? first : parseDate(lastDate, "lastDate");
		// GuestContact's canonical constructor validates email/name/phone are present.
		GuestContact guest = new GuestContact(contact.email(), contact.fullName(), contact.phone());
		// accountId is the signed-in tourist's account link — null for a guest.
		return new CreateBookingCommand(new SetId(setId), first, last, guest, accountId);
	}

	private static LocalDate parseDate(String value, String field) {
		try {
			return LocalDate.parse(value);
		}
		catch (DateTimeParseException e) {
			throw new IllegalArgumentException(field + " must be an ISO date (YYYY-MM-DD)", e);
		}
	}
}
