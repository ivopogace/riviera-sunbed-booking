package ai.riviera.platform.venue.vocabulary;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
	@ValueSource(strings = { "+355 69 123 4567", "+355 69 123 4567", "+355 69 1234567",
			"﻿+355691234567", "+355　69　1234567" })
	void unicodeSpacesAreStrippedAsTheConsoleStripsThem(String typed) {
		assertEquals("+355691234567", VenuePhone.parse(typed).e164());
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
