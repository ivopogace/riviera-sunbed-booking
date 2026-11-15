package ai.riviera.platform.venue.vocabulary;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The venue phone mirrors {@code venue_phone_check} (V86): an international E.164 number, typed with the
 * {@code +} or {@code 00} prefix and any spacing a human uses, stored as {@code +} and its digits.
 */
class VenuePhoneTest {

	@ParameterizedTest
	@ValueSource(strings = { "+355691234567", "+355 69 123 4567", "00355 69 123 4567", "+355-69-123.4567",
			"+355 (69) 123 4567", "  +355691234567  " })
	void anInternationalNumberIsKeptAsE164(String typed) {
		assertEquals("+355691234567", VenuePhone.parse(typed).e164());
	}

	@ParameterizedTest
	@ValueSource(strings = { "069 123 4567", "355691234567", "+0355691234567", "0035569123456a", "+355 69 123 4567 ext 2",
			"+1234567", "+1234567890123456", "+", "++355691234567", "+355+691234567" })
	void anythingElseIsRefused(String typed) {
		assertThrows(IllegalArgumentException.class, () -> VenuePhone.parse(typed));
	}

	/** A number pasted from a web page carries Unicode spaces the console's JavaScript {@code \s} strips. */
	@ParameterizedTest
	@ValueSource(strings = { "+355\u00a069\u00a0123\u00a04567", "+355\u202f69\u202f123\u202f4567", "+355\u200969\u20091234567",
			"\ufeff+355691234567", "+355\u300069\u30001234567" })
	void unicodeSpacesAreStrippedAsTheConsoleStripsThem(String typed) {
		assertEquals("+355691234567", VenuePhone.parse(typed).e164());
	}

	@ParameterizedTest
	@ValueSource(strings = { "", "   ", "\u00a0\u00a0", "\u202f" })
	void aValueOfSpacesAloneIsNoPhone(String typed) {
		assertNull(VenuePhone.parseOrNone(typed));
	}

	@Test
	void parseOrNoneParsesAnythingElse() {
		assertNull(VenuePhone.parseOrNone(null));
		assertEquals("+355691234567", VenuePhone.parseOrNone("00355 69 123 4567").e164());
		assertThrows(IllegalArgumentException.class, () -> VenuePhone.parseOrNone("069 123 4567"));
	}

	@Test
	void theBoundsAreEightToFifteenDigits() {
		assertEquals("+12345678", VenuePhone.parse("+12345678").e164());
		assertEquals("+123456789012345", VenuePhone.parse("+123456789012345").e164());
	}

	@Test
	void theConstructorRefusesANonCanonicalValue() {
		assertThrows(IllegalArgumentException.class, () -> new VenuePhone("+355 69 123 4567"));
		assertThrows(IllegalArgumentException.class, () -> new VenuePhone(null));
	}
}
