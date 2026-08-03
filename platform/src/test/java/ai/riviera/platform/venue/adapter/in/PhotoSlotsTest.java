package ai.riviera.platform.venue.adapter.in;

import java.util.Locale;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Pins the slot parser's contract at its own seam (#504). It was a private method on
 * {@code VenuePhotoController} until the admin takedown gave it a second caller; extracting it made
 * one parse rule serve three endpoints, so the rule is tested here once rather than incidentally
 * through whichever controller IT happens to drive it. Both wire answers matter: a valid lower-case
 * slot resolves, and an unknown one raises the typed edge-validation signal the advice maps to
 * {@code 400 INVALID_REQUEST} — never an escaping {@code IllegalArgumentException} (a 500).
 */
class PhotoSlotsTest {

	@Test
	void parsesEveryLowerCaseSlotName() {
		for (PhotoSlot slot : PhotoSlot.values()) {
			assertEquals(slot, PhotoSlots.parse(slot.name().toLowerCase(Locale.ROOT)));
		}
	}

	@Test
	void parseIsCaseInsensitive() {
		assertEquals(PhotoSlot.COVER, PhotoSlots.parse("Cover"));
		assertEquals(PhotoSlot.COVER, PhotoSlots.parse("COVER"));
	}

	@Test
	void unknownSlotRaisesTheTypedEdgeValidationSignal() {
		assertThrows(InvalidApiRequestException.class, () -> PhotoSlots.parse("lobby"));
		assertThrows(InvalidApiRequestException.class, () -> PhotoSlots.parse(""));
	}
}
