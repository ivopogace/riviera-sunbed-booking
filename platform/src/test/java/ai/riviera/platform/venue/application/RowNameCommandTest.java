package ai.riviera.platform.venue.application;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The validated intent to rename one beach-map row. Mirrors {@link RowPriceCommand}'s edge
 * discipline: the source label is required, and the new label carries the same bound
 * {@link SetCommand} applies and {@code set_position_row_label_check} enforces — so a malformed
 * rename is rejected at the application boundary (→ {@code 400 INVALID_REQUEST}, §6b) rather than
 * surfacing as a constraint violation.
 */
class RowNameCommandTest {

	private static final String FORTY_CODE_POINTS = "Under the pines · sea-facing back row!!!";

	@Test
	void acceptsAValidRename() {
		RowNameCommand command = new RowNameCommand("B", "Back row");

		assertEquals("B", command.rowLabel());
		assertEquals("Back row", command.newLabel());
	}

	@Test
	void acceptsANewLabelAtTheLengthBound() {
		assertEquals(40, FORTY_CODE_POINTS.codePointCount(0, FORTY_CODE_POINTS.length()));

		assertEquals(FORTY_CODE_POINTS, new RowNameCommand("B", FORTY_CODE_POINTS).newLabel());
	}

	@Test
	void rejectsANewLabelOverTheLengthBound() {
		assertThrows(IllegalArgumentException.class,
				() -> new RowNameCommand("B", FORTY_CODE_POINTS + "x"));
	}

	@Test
	void rejectsBlankLabels() {
		assertThrows(IllegalArgumentException.class, () -> new RowNameCommand("  ", "Back row"));
		assertThrows(IllegalArgumentException.class, () -> new RowNameCommand(null, "Back row"));
		assertThrows(IllegalArgumentException.class, () -> new RowNameCommand("B", "  "));
		assertThrows(IllegalArgumentException.class, () -> new RowNameCommand("B", null));
	}
}
