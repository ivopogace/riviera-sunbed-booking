package ai.riviera.platform;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.booking.vocabulary.VenueChangeFee;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The remodel picture on the wire, assembled once for the preview and for the two commit refusals
 * that answer with a fresh picture: {@code venue}'s disturbed sets with their walk-in holds and
 * {@code booking}'s classified claims become the five groups, {@code keep} (the blocking claims' and
 * the held sets, by id) and the {@link PreviewToken} over the classification.
 *
 * <p>The venue-change fee is quoted with the picture: {@code payout} decides the amount and it
 * reaches here through {@code booking}, which is what keeps this root class off {@code payout}
 * entirely (ADR-0020, ADR-0021). The total is the rate times the refund count — the picture's own
 * price, not a stored one; a commit snapshots what it actually charged onto its receipt.
 */
final class RemodelPreviewAssembler {

	private RemodelPreviewAssembler() {
	}

	static RemodelPreviewResponse assemble(List<DisturbedSet> disturbed, List<RemodelClaim> classified,
			VenueChangeFee fee) {
		MoneyView feePerRefund = new MoneyView(fee.perRefundMinor(), fee.currency());
		List<RemodelPreviewResponse.MoveView> moves = new ArrayList<>();
		List<RemodelPreviewResponse.ClaimView> refunds = new ArrayList<>();
		List<RemodelPreviewResponse.ReleaseView> releases = new ArrayList<>();
		List<RemodelPreviewResponse.BlockView> blocks = new ArrayList<>();
		Map<SetId, RemodelPreviewResponse.SpotView> keep = new TreeMap<>(Comparator.comparingLong(SetId::value));
		for (RemodelClaim claim : classified) {
			long id = claim.bookingId().value();
			String date = claim.bookingDate().toString();
			MoneyView amount = new MoneyView(claim.amountMinor(), claim.currency());
			RemodelPreviewResponse.SpotView from = spot(claim.from());
			switch (claim.outcome()) {
				case RemodelOutcome.Move(var to, var rowsAway, var positionsAway) ->
					moves.add(new RemodelPreviewResponse.MoveView(id, date, amount, from, spot(to), rowsAway,
							positionsAway));
				case RemodelOutcome.Refund ignored ->
					refunds.add(new RemodelPreviewResponse.ClaimView(id, date, amount, from, feePerRefund));
				case RemodelOutcome.Release release ->
					releases.add(new RemodelPreviewResponse.ReleaseView(id, date, amount, from, release.name()));
				case RemodelOutcome.Decline decline ->
					releases.add(new RemodelPreviewResponse.ReleaseView(id, date, amount, from, decline.name()));
				case RemodelOutcome.Blocked(var reason) -> {
					blocks.add(new RemodelPreviewResponse.BlockView(id, date, amount, from, reason.name()));
					keep.put(claim.from().setId(), from);
				}
			}
		}
		List<RemodelPreviewResponse.StaffHoldView> staffHolds = new ArrayList<>();
		for (DisturbedSet set : disturbed) {
			if (!set.walkInHolds().isEmpty()) {
				RemodelPreviewResponse.SpotView spot = new RemodelPreviewResponse.SpotView(set.setId().value(),
						set.placement().rowLabel(), set.placement().positionNo());
				staffHolds.add(new RemodelPreviewResponse.StaffHoldView(spot,
						set.walkInHolds().stream().map(Object::toString).toList()));
				keep.put(set.setId(), spot);
			}
		}
		return new RemodelPreviewResponse(moves, refunds, releases, staffHolds, blocks, List.copyOf(keep.values()),
				PreviewToken.of(classified).value(),
				new MoneyView(fee.totalFor(refunds.size()), fee.currency()));
	}

	static RemodelPreviewResponse.SpotView spot(SpotRef ref) {
		return new RemodelPreviewResponse.SpotView(ref.setId().value(), ref.rowLabel(), ref.positionNo());
	}
}
