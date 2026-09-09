package ai.riviera.platform;

import java.util.List;

import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;

/**
 * The remodel commit's body — the bulk beach-map save's body verbatim ({@code sets} plus the loaded
 * {@code expectedVersion} token) and the {@code previewToken} the preview answered. A missing field,
 * an unknown pool or tier token, or a cell off the save's rules is {@code 400 INVALID_REQUEST}.
 */
record RemodelCommitRequest(List<Cell> sets, Long expectedVersion, String previewToken) {

	record Cell(String rowLabel, Integer positionNo, String tier, String pool, MoneyView price, Integer gridX,
			Integer gridY) {

		LayoutCell toCell() {
			if (positionNo == null || gridX == null || gridY == null || price == null || pool == null) {
				throw new IllegalArgumentException("positionNo, pool, price, gridX and gridY are required");
			}
			return new LayoutCell(rowLabel, positionNo, tier, Pool.valueOf(pool), price.minorUnits(),
					price.currency(), gridX, gridY);
		}
	}

	long requireExpectedVersion() {
		if (expectedVersion == null) {
			throw new IllegalArgumentException("expectedVersion is required");
		}
		return expectedVersion;
	}

	PreviewToken requireToken() {
		if (previewToken == null) {
			throw new IllegalArgumentException("previewToken is required");
		}
		return new PreviewToken(previewToken);
	}

	List<LayoutCell> toCells() {
		if (sets == null) {
			throw new IllegalArgumentException("sets is required");
		}
		return sets.stream().map(Cell::toCell).toList();
	}
}
