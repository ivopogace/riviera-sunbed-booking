package ai.riviera.platform.venue.vocabulary;

/**
 * Where a set sits on the beach map: the row label and position number a guest is told, and the
 * grid cell the editor paints. Read off a stored row (so an edit is judged against what is actually
 * stored) and submitted as a cell of a layout the remodel preview diffs. Coordinates and the
 * position number are 1-based, as the V12 CHECKs hold them.
 */
public record SetPlacement(String rowLabel, int positionNo, int gridX, int gridY) {

	/** Grid rows a beach map may have: one per letter, the editors' cap; twin of V78's {@code set_position_grid_y_lettered_check}. */
	public static final int MAX_GRID_ROWS = 26;

	/** The label every set on 1-based grid row {@code gridY} takes, {@code A} to {@code Z}; rows are never named (#1586). */
	public static String rowLabelOf(int gridY) {
		if (gridY < 1 || gridY > MAX_GRID_ROWS) {
			throw new IllegalArgumentException("gridY must be between 1 and " + MAX_GRID_ROWS);
		}
		return String.valueOf((char) ('A' + gridY - 1));
	}

	public SetPlacement {
		if (rowLabel == null || rowLabel.isBlank()) {
			throw new IllegalArgumentException("rowLabel is required");
		}
		if (positionNo < 1 || gridX < 1 || gridY < 1) {
			throw new IllegalArgumentException("positionNo, gridX and gridY must be >= 1");
		}
	}

	/** How many rows apart two spots are: the move distance's first measure, {@code 0} on the same row. */
	public int rowsAway(SetPlacement other) {
		return Math.abs(gridY - other.gridY);
	}

	/** How many positions apart two spots are along their rows: the move distance's second measure. */
	public int positionsAway(SetPlacement other) {
		return Math.abs(positionNo - other.positionNo);
	}
}
