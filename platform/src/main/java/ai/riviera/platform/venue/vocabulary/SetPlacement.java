package ai.riviera.platform.venue.vocabulary;

/**
 * Where a set sits on the beach map: the row label and position number a guest is told, and the
 * grid cell the editor paints. Read off a stored row (so an edit is judged against what is actually
 * stored) and submitted as a cell of a layout the remodel preview diffs. Coordinates and the
 * position number are 1-based, as the V12 CHECKs hold them.
 */
public record SetPlacement(String rowLabel, int positionNo, int gridX, int gridY) {

	public SetPlacement {
		if (rowLabel == null || rowLabel.isBlank()) {
			throw new IllegalArgumentException("rowLabel is required");
		}
		if (positionNo < 1 || gridX < 1 || gridY < 1) {
			throw new IllegalArgumentException("positionNo, gridX and gridY must be >= 1");
		}
	}
}
