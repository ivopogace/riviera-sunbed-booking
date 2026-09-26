package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.booking.application.remodel.ReceiptKept;
import ai.riviera.platform.booking.application.remodel.ReceiptMove;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcome;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcomeKind;
import ai.riviera.platform.booking.application.remodel.RemodelReceipt;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * A remodel-commit receipt on {@code GET /api/venues/{venueId}/remodels/{receiptId}}: when, every
 * move, every claim ended (refunded, released, declined), every claim kept with its reason, and the
 * refund reason. Bookings ride by id, never code (invariant #7); days ISO; spots as they were.
 * {@code refundedTotal}/{@code feeTotal} are {@code null} when nobody was refunded, so a zero never
 * reads as a refund; one currency is sound as collection is EUR-only (invariant #5). Venue-change
 * fees are as charged then, not today's rate. {@link Summary}: list row. Mirrors FE RemodelReceipt.
 */
record RemodelReceiptView(long receiptId, Instant committedAt, List<MoveView> moves, List<ClaimView> refunds,
		List<ReleaseView> releases, List<KeptView> kept, String refundReason, MoneyView refundedTotal,
		MoneyView feeTotal) {

	static RemodelReceiptView of(RemodelReceipt receipt) {
		List<ReceiptOutcome> refunds = receipt.refunds();
		return new RemodelReceiptView(receipt.id().value(), receipt.committedAt(),
				receipt.moves().stream().map(MoveView::of).toList(),
				refunds.stream().map(ClaimView::of).toList(),
				receipt.outcomes().stream()
						.filter(outcome -> outcome.kind() != ReceiptOutcomeKind.REFUND)
						.map(ReleaseView::of)
						.toList(),
				receipt.kept().stream().map(KeptView::of).toList(),
				receipt.refundReason(),
				refunds.isEmpty() ? null : new MoneyView(receipt.refundedMinor(), refunds.getFirst().currency()),
				refunds.isEmpty() ? null : new MoneyView(receipt.feeTotalMinor(), refunds.getFirst().currency()));
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

	/** {@code fee} is what the venue was charged for this refund, as it was charged. */
	record ClaimView(long bookingId, String bookingDate, SpotView from, MoneyView amount, MoneyView fee) {

		static ClaimView of(ReceiptOutcome outcome) {
			return new ClaimView(outcome.bookingId().value(), outcome.bookingDate().toString(),
					SpotView.of(outcome.spot()), new MoneyView(outcome.amountMinor(), outcome.currency()),
					new MoneyView(outcome.feeMinor(), outcome.currency()));
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

	/** {@code reason} is {@code FROZEN} or {@code NO_MOVE_CANDIDATE}; the set stayed on the map as stored. */
	record KeptView(long bookingId, String bookingDate, SpotView from, String reason) {

		static KeptView of(ReceiptKept kept) {
			return new KeptView(kept.bookingId().value(), kept.bookingDate().toString(), SpotView.of(kept.spot()),
					kept.reason().name());
		}
	}

	record SpotView(long setId, String rowLabel, int positionNo) {

		static SpotView of(SpotRef ref) {
			return new SpotView(ref.setId().value(), ref.rowLabel(), ref.positionNo());
		}
	}
}
