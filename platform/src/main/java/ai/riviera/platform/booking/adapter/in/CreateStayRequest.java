package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;

import ai.riviera.platform.booking.application.reserve.CreateStayCommand;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The {@code POST /api/stays} body: the plan's stretches (set + ISO first/last date each) and the
 * guest contact. {@link #toCommand} maps it onto the typed {@link CreateStayCommand}, whose
 * constructor validates the shape; bad input throws {@link IllegalArgumentException}, the
 * controller's conversion wrap makes it the typed 400.
 */
record CreateStayRequest(List<StretchRequest> stretches, CreateBookingRequest.Contact contact) {

	record StretchRequest(Long setId, String firstDate, String lastDate) {
	}

	CreateStayCommand toCommand(CustomerAccountId accountId) {
		if (stretches == null || stretches.isEmpty()) {
			throw new IllegalArgumentException("stretches are required");
		}
		if (contact == null) {
			throw new IllegalArgumentException("contact is required");
		}
		List<CreateStayCommand.Stretch> typed = stretches.stream().map(stretch -> {
			if (stretch.setId() == null) {
				throw new IllegalArgumentException("every stretch needs a setId");
			}
			return new CreateStayCommand.Stretch(new SetId(stretch.setId()), parseDate(stretch.firstDate(), "firstDate"),
					parseDate(stretch.lastDate(), "lastDate"));
		}).toList();
		return new CreateStayCommand(typed, new GuestContact(contact.email(), contact.fullName(), contact.phone()),
				accountId);
	}

	private static LocalDate parseDate(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(field + " is required on every stretch");
		}
		try {
			return LocalDate.parse(value);
		}
		catch (DateTimeParseException e) {
			throw new IllegalArgumentException(field + " must be an ISO date (YYYY-MM-DD)", e);
		}
	}
}
