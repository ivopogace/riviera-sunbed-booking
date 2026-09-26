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
 * The remodel picture on the wire, for the preview and the two commit refusals that answer a fresh
 * one: {@code venue}'s disturbed sets with walk-in holds and {@code booking}'s classified claims
 * become the five groups, {@code keep} (by id: the blocked claims' sets, which the save keeps
 * itself, and the held sets, which the operator must keep) and the {@link PreviewToken}. The fee
 * quote reaches here via {@code booking}, keeping the root off {@code payout} (ADR-0020, ADR-0021);
 * its total is rate × refund count, while a commit snapshots what it charged onto its receipt.
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
