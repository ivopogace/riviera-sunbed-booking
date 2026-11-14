package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SupportContactTest {

	@Test
	void aConfiguredNumberIsDisplayedWithItsPlusAndLinkedOnWaMe() {
		SupportContact contact = new SupportContact(null, "355691234567");

		assertEquals(Optional.of("+355691234567"), contact.whatsappNumber());
		assertEquals(Optional.of(URI.create("https://wa.me/355691234567")), contact.whatsappLink());
		assertEquals(Optional.empty(), contact.email());
		assertTrue(contact.hasChannel());
	}

	@Test
	void noChannelConfiguredRendersNothing() {
		SupportContact none = SupportContact.NONE;

		assertEquals(Optional.empty(), none.email());
		assertEquals(Optional.empty(), none.whatsappNumber());
		assertEquals(Optional.empty(), none.whatsappLink());
		assertFalse(none.hasChannel());
	}

	@Test
	void theSameDayPromiseHoldsFromTheFirstOfMayToTheLastOfOctober() {
		assertFalse(SupportContact.answersSameDayOn(LocalDate.of(2027, 4, 30)));
		assertTrue(SupportContact.answersSameDayOn(LocalDate.of(2027, 5, 1)));
		assertTrue(SupportContact.answersSameDayOn(LocalDate.of(2027, 10, 31)));
		assertFalse(SupportContact.answersSameDayOn(LocalDate.of(2027, 11, 1)));
		assertFalse(SupportContact.answersSameDayOn(LocalDate.of(2027, 1, 15)));
	}
}
