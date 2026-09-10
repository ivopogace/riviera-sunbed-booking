package ai.riviera.platform;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.booking.vocabulary.VenueChangeFee;
import ai.riviera.platform.venue.vocabulary.LockedSet;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * A committed remodel on the wire: the receipt the console can open later and everything it did —
 * the bookings it moved, the confirmed ones it refunded in full, the unpaid ones it released and
 * the requests it declined, in the preview's own shapes, with the operator's reason and what the
 * commit returned to guests. {@code refundedTotal} is {@code null} when it refunded nobody, so a
 * zero is never rendered as a refund; it sums the minor units and carries one currency code, which
 * is sound because collection is EUR-only (invariant #5) so every refund in a commit shares it.
 * {@code feeTotal} is what those refunds cost the venue, at the rate the commit charged and wrote
 * onto its receipt; {@code null} alongside {@code refundedTotal} when it refunded nobody.
 * Bookings by id, never by code (invariant #7).
 */
record RemodelCommitResponse(long receiptId, Instant committedAt, List<RemodelPreviewResponse.MoveView> moves,
		List<RemodelPreviewResponse.ClaimView> refunds, List<RemodelPreviewResponse.ReleaseView> releases,
		String refundReason, MoneyView refundedTotal, MoneyView feeTotal) {

	static RemodelCommitResponse of(RemodelCommitOutcome.Committed committed, String refundReason,
			VenueChangeFee fee) {
		MoneyView feePerRefund = new MoneyView(fee.perRefundMinor(), fee.currency());
		List<RemodelPreviewResponse.MoveView> moves = new ArrayList<>();
		List<RemodelPreviewResponse.ClaimView> refunds = new ArrayList<>();
		List<RemodelPreviewResponse.ReleaseView> releases = new ArrayList<>();
		long refundedMinor = 0;
		String currency = null;
		for (RemodelClaim claim : committed.applied()) {
			long id = claim.bookingId().value();
			String date = claim.bookingDate().toString();
			MoneyView amount = new MoneyView(claim.amountMinor(), claim.currency());
			RemodelPreviewResponse.SpotView from = RemodelPreviewAssembler.spot(claim.from());
			switch (claim.outcome()) {
				case RemodelOutcome.Move(var to, var rowsAway, var positionsAway) ->
					moves.add(new RemodelPreviewResponse.MoveView(id, date, amount, from,
							RemodelPreviewAssembler.spot(to), rowsAway, positionsAway));
				case RemodelOutcome.Refund ignored -> {
					refunds.add(new RemodelPreviewResponse.ClaimView(id, date, amount, from, feePerRefund));
					refundedMinor += claim.amountMinor();
					currency = claim.currency();
				}
				case RemodelOutcome.Release release ->
					releases.add(new RemodelPreviewResponse.ReleaseView(id, date, amount, from, release.name()));
				case RemodelOutcome.Decline decline ->
					releases.add(new RemodelPreviewResponse.ReleaseView(id, date, amount, from, decline.name()));
				case RemodelOutcome.Blocked ignored ->
					throw new IllegalStateException("a committed remodel applies no blocked claim");
			}
		}
		return new RemodelCommitResponse(committed.receiptId().value(), committed.committedAt(), moves, refunds,
				releases, refundReason, currency == null ? null : new MoneyView(refundedMinor, currency),
				currency == null ? null : new MoneyView(fee.totalFor(refunds.size()), fee.currency()));
	}

	/** One set a {@code 409 SETS_IN_USE} names, in the bulk save's own wire shape. */
	record LockedSetView(long setId, String rowLabel, int positionNo, String bookedOn, String heldOn) {

		static LockedSetView of(LockedSet locked) {
			return new LockedSetView(locked.setId().value(), locked.placement().rowLabel(),
					locked.placement().positionNo(),
					locked.bookedOn() == null ? null : locked.bookedOn().toString(),
					locked.heldOn() == null ? null : locked.heldOn().toString());
		}
	}
}
