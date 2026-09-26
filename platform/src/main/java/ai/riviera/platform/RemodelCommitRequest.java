package ai.riviera.platform;

import java.util.List;

import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;

/**
 * The remodel commit's body: the bulk beach-map save's body verbatim ({@code sets} plus the loaded
 * {@code expectedVersion} token), the preview's {@code previewToken}, and the operator's refund
 * confirmation (the count read off the preview and the reason), both absent if nobody is refunded.
 * A refunding picture is not validated here but answered {@code 409 REFUND_NOT_CONFIRMED}: only
 * the classification re-derived under lock knows the number. A missing required field, an unknown
 * pool or tier token, or a cell off the save's rules is {@code 400 INVALID_REQUEST}.
 */
record RemodelCommitRequest(List<Cell> sets, Long expectedVersion, String previewToken, Integer refundCount,
		String refundReason) {

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

	RefundConfirmation confirmation() {
		return new RefundConfirmation(refundCount == null ? 0 : refundCount, refundReason);
	}

	List<LayoutCell> toCells() {
		if (sets == null) {
			throw new IllegalArgumentException("sets is required");
		}
		return sets.stream().map(Cell::toCell).toList();
	}
}
