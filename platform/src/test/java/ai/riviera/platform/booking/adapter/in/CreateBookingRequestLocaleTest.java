package ai.riviera.platform.booking.adapter.in;

import java.util.List;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import ai.riviera.platform.shared.SiteLocale;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** The create bodies' {@code locale}: a served code selects its locale, anything else (absent included) English. */
class CreateBookingRequestLocaleTest {

	private static final CreateBookingRequest.Contact CONTACT =
			new CreateBookingRequest.Contact("guest@example.com", "Guest", "+355690000000");

	@ParameterizedTest
	@CsvSource(nullValues = "NULL", value = { "sq,SQ", "it,IT", "en,EN", "NULL,EN", "de,EN", "'../sq',EN", "SQ,EN" })
	void aBookingTakesTheServedLocaleItNames(String wire, SiteLocale expected) {
		CreateBookingRequest request = new CreateBookingRequest(7L, "2027-07-03", null, CONTACT, wire);

		assertEquals(expected, request.toCommand(null).locale());
	}

	@ParameterizedTest
	@CsvSource(nullValues = "NULL", value = { "it,IT", "NULL,EN", "xx,EN" })
	void aStayTakesTheServedLocaleItNames(String wire, SiteLocale expected) {
		CreateStayRequest request = new CreateStayRequest(List.of(
				new CreateStayRequest.StretchRequest(7L, "2027-07-03", "2027-07-04"),
				new CreateStayRequest.StretchRequest(8L, "2027-07-05", "2027-07-06")), CONTACT, wire);

		assertEquals(expected, request.toCommand(null).locale());
	}
}
