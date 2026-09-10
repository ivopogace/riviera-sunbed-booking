package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.booking.application.remodel.ReceiptMove;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcome;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcomeKind;
import ai.riviera.platform.booking.application.remodel.RemodelReceipt;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * A remodel-commit receipt on the wire of {@code GET /api/venues/{venueId}/remodels/{receiptId}}:
 * when it was committed, every move, every claim it ended instead — refunded, released or declined —
 * the operator's reason and what it returned to guests. The booking rides by id (never by code,
 * invariant #7), its day as ISO {@code YYYY-MM-DD}, both spots as they were. {@code refundedTotal}
 * is {@code null} when the commit refunded nobody, so a zero never reads as a refund.
 * {@link Summary} is the list row. Mirrors the FE {@code RemodelReceipt} type.
 */
record RemodelReceiptView(long receiptId, Instant committedAt, List<MoveView> moves, List<ClaimView> refunds,
		List<ReleaseView> releases, String refundReason, MoneyView refundedTotal) {

	static RemodelReceiptView of(RemodelReceipt receipt) {
		List<ReceiptOutcome> refunds = receipt.refunds();
		return new RemodelReceiptView(receipt.id().value(), receipt.committedAt(),
				receipt.moves().stream().map(MoveView::of).toList(),
				refunds.stream().map(ClaimView::of).toList(),
				receipt.outcomes().stream()
						.filter(outcome -> outcome.kind() != ReceiptOutcomeKind.REFUND)
						.map(ReleaseView::of)
						.toList(),
				receipt.refundReason(),
				refunds.isEmpty() ? null : new MoneyView(receipt.refundedMinor(), refunds.getFirst().currency()));
	}

	record Summary(long receiptId, Instant committedAt, int moveCount, int refundCount) {

		static Summary of(RemodelReceipt receipt) {
			return new Summary(receipt.id().value(), receipt.committedAt(), receipt.moves().size(),
					receipt.refunds().size());
		}
	}

	record MoveView(long bookingId, String bookingDate, SpotView from, SpotView to, int rowsAway, int positionsAway) {

		static MoveView of(ReceiptMove move) {
			return new MoveView(move.bookingId().value(), move.bookingDate().toString(), SpotView.of(move.from()),
					SpotView.of(move.to()), move.rowsAway(), move.positionsAway());
		}
	}

	record ClaimView(long bookingId, String bookingDate, SpotView from, MoneyView amount) {

		static ClaimView of(ReceiptOutcome outcome) {
			return new ClaimView(outcome.bookingId().value(), outcome.bookingDate().toString(),
					SpotView.of(outcome.spot()), new MoneyView(outcome.amountMinor(), outcome.currency()));
		}
	}

	/** {@code kind} is {@code RELEASE} for an unpaid booking, {@code DECLINE} for a pending request. */
	record ReleaseView(long bookingId, String bookingDate, SpotView from, MoneyView amount, String kind) {

		static ReleaseView of(ReceiptOutcome outcome) {
			return new ReleaseView(outcome.bookingId().value(), outcome.bookingDate().toString(),
					SpotView.of(outcome.spot()), new MoneyView(outcome.amountMinor(), outcome.currency()),
					outcome.kind().name());
		}
	}

	record SpotView(long setId, String rowLabel, int positionNo) {

		static SpotView of(SpotRef ref) {
			return new SpotView(ref.setId().value(), ref.rowLabel(), ref.positionNo());
		}
	}
}
