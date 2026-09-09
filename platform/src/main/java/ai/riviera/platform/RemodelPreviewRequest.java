package ai.riviera.platform;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.SetPlacement;

/**
 * The remodel preview's body — the bulk beach-map save's body verbatim ({@code sets} plus the
 * loaded {@code expectedVersion} token), of which the dry run reads only each cell's placement: the
 * tier, pool and price a cell carries are the save's concern, and the editor sends one body to
 * both. A missing token or an out-of-range coordinate is {@code 400 INVALID_REQUEST}.
 */
record RemodelPreviewRequest(List<Cell> sets, Long expectedVersion) {

	record Cell(String rowLabel, Integer positionNo, Integer gridX, Integer gridY) {

		SetPlacement toPlacement() {
			if (positionNo == null || gridX == null || gridY == null) {
				throw new IllegalArgumentException("positionNo, gridX and gridY are required");
			}
			return new SetPlacement(rowLabel, positionNo, gridX, gridY);
		}
	}

	long requireExpectedVersion() {
		if (expectedVersion == null) {
			throw new IllegalArgumentException("expectedVersion is required");
		}
		return expectedVersion;
	}

	List<SetPlacement> toPlacements() {
		if (sets == null) {
			throw new IllegalArgumentException("sets is required");
		}
		return sets.stream().map(Cell::toPlacement).toList();
	}
}
