package ai.riviera.platform.venue.application;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Pins {@link SetCommand}'s row-label bound: the operator's own words are limited to
 * {@link VenueFieldValidation#MAX_ROW_LABEL_LENGTH} code points — matching Postgres
 * {@code char_length}, so the V43 CHECK stays the backstop — and a violation is rejected at the
 * application boundary (→ {@code 400 INVALID_REQUEST}, §6b).
 */
class SetCommandTest {

	private static SetCommand withRowLabel(String rowLabel) {
		return new SetCommand(rowLabel, 1, "PREMIUM", "ONLINE", 4500, "EUR", 1, 1);
	}

	@Test
	void acceptsADescriptiveRowLabel() {
		assertEquals("Front row · Sea view", withRowLabel("Front row · Sea view").rowLabel());
	}

	@Test
	void acceptsARowLabelAtTheLengthBound() {
		String atBound = "ë".repeat(VenueFieldValidation.MAX_ROW_LABEL_LENGTH);

		assertEquals(atBound, withRowLabel(atBound).rowLabel());
	}

	@Test
	void rejectsARowLabelOverTheLengthBound() {
		String overBound = "a".repeat(VenueFieldValidation.MAX_ROW_LABEL_LENGTH + 1);

		assertThrows(IllegalArgumentException.class, () -> withRowLabel(overBound));
	}

	@Test
	void countsTheBoundInCodePointsLikeCharLength() {
		// 40 code points that exceed 40 UTF-16 units — must still pass, as Postgres char_length would.
		String astral = "🌴".repeat(VenueFieldValidation.MAX_ROW_LABEL_LENGTH);

		assertEquals(astral, withRowLabel(astral).rowLabel());
	}

	@Test
	void rejectsABlankRowLabel() {
		assertThrows(IllegalArgumentException.class, () -> withRowLabel("  "));
		assertThrows(IllegalArgumentException.class, () -> withRowLabel(null));
	}
}
