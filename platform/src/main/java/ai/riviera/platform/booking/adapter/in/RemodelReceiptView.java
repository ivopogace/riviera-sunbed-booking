package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.booking.application.remodel.ReceiptMove;
import ai.riviera.platform.booking.application.remodel.RemodelReceipt;
import ai.riviera.platform.booking.vocabulary.SpotRef;

/**
 * A remodel-commit receipt on the wire of {@code GET /api/venues/{venueId}/remodels/{receiptId}}:
 * when it was committed and every move — the booking by id (never by code, invariant #7), its day
 * (ISO {@code YYYY-MM-DD}), both spots as they were and the distance. {@link Summary} is the list
 * row. Mirrors the FE {@code RemodelReceipt} type.
 */
record RemodelReceiptView(long receiptId, Instant committedAt, List<MoveView> moves) {

	static RemodelReceiptView of(RemodelReceipt receipt) {
		return new RemodelReceiptView(receipt.id().value(), receipt.committedAt(),
				receipt.moves().stream().map(MoveView::of).toList());
	}

	record Summary(long receiptId, Instant committedAt, int moveCount) {

		static Summary of(RemodelReceipt receipt) {
			return new Summary(receipt.id().value(), receipt.committedAt(), receipt.moves().size());
		}
	}

	record MoveView(long bookingId, String bookingDate, SpotView from, SpotView to, int rowsAway, int positionsAway) {

		static MoveView of(ReceiptMove move) {
			return new MoveView(move.bookingId().value(), move.bookingDate().toString(), SpotView.of(move.from()),
					SpotView.of(move.to()), move.rowsAway(), move.positionsAway());
		}
	}

	record SpotView(long setId, String rowLabel, int positionNo) {

		static SpotView of(SpotRef ref) {
			return new SpotView(ref.setId().value(), ref.rowLabel(), ref.positionNo());
		}
	}
}
