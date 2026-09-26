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
 * A committed remodel on the wire: the receipt id and everything the commit did — moves, full
 * refunds of confirmed bookings, released unpaid ones, declined requests and claims kept in place
 * (their sets left as stored) — in the preview's shapes, with the operator's refund reason.
 * {@code refundedTotal} and {@code feeTotal} (the refunds' cost to the venue at the rate quoted
 * with this commit) are {@code null} when nobody was refunded, so a zero never renders as a refund;
 * one currency suffices as collection is EUR-only (invariant #5). Bookings by id, never code (#7).
 */
record RemodelCommitResponse(long receiptId, Instant committedAt, List<RemodelPreviewResponse.MoveView> moves,
		List<RemodelPreviewResponse.ClaimView> refunds, List<RemodelPreviewResponse.ReleaseView> releases,
		List<RemodelPreviewResponse.BlockView> kept, String refundReason, MoneyView refundedTotal,
		MoneyView feeTotal) {

	static RemodelCommitResponse of(RemodelCommitOutcome.Committed committed, String refundReason,
			VenueChangeFee fee) {
		MoneyView feePerRefund = new MoneyView(fee.perRefundMinor(), fee.currency());
		List<RemodelPreviewResponse.MoveView> moves = new ArrayList<>();
		List<RemodelPreviewResponse.ClaimView> refunds = new ArrayList<>();
		List<RemodelPreviewResponse.ReleaseView> releases = new ArrayList<>();
		List<RemodelPreviewResponse.BlockView> kept = new ArrayList<>();
		long refundedMinor = 0;
		String currency = null;
		for (RemodelClaim claim : committed.settled()) {
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
				case RemodelOutcome.Blocked(var reason) ->
					kept.add(new RemodelPreviewResponse.BlockView(id, date, amount, from, reason.name()));
			}
		}
		return new RemodelCommitResponse(committed.receiptId().value(), committed.committedAt(), moves, refunds,
				releases, kept, refundReason, currency == null ? null : new MoneyView(refundedMinor, currency),
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
