package ai.riviera.platform;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.VenueChangeFee;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.booking.vocabulary.RemodelCommit;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.api.BeachMapRemodel;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.GateVerdict;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.LayoutCommitOutcome;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The remodel commit's orchestration at the platform edge (ADR-0020): {@code venue} owns the
 * transaction and the venue-wide set lock through {@link BeachMapRemodel#commit}, and this class is
 * its gate — asked once, under the locks, with the disturbed sets and their staff holds. A held set
 * is a claim the preview could not have offered a save for, so it answers the fresh picture as
 * stale; otherwise {@link RemodelClaims#commit} re-derives the classification, checks the token and
 * the operator's refund confirmation, and settles every claim, all inside {@code venue}'s
 * transaction; the gate proceeds only when it answered applied, naming the sets of the claims
 * {@code booking} kept so {@code venue} leaves them as stored. A layout that gives a kept set's label
 * to another set comes back as displaced, the transaction having rolled back, and is answered as
 * refused with the fresh picture. Each port asserts venue ownership itself (invariant #13); this
 * class holds no rule.
 */
@Component
class RemodelCommitService {

	private final BeachMapRemodel remodel;
	private final RemodelClaims claims;

	RemodelCommitService(BeachMapRemodel remodel, RemodelClaims claims) {
		this.remodel = remodel;
		this.claims = claims;
	}

	/** The rate the refusal pictures quote — the same one the preview did, straight off the port. */
	VenueChangeFee venueChangeFee() {
		return claims.venueChangeFee();
	}

	RemodelCommitOutcome commit(OperatorId operator, VenueId venue, long expectedVersion, List<LayoutCell> cells,
			PreviewToken token, RefundConfirmation confirmation) {
		AtomicReference<RemodelCommitOutcome> decided = new AtomicReference<>();
		AtomicReference<List<DisturbedSet>> seen = new AtomicReference<>();
		LayoutCommitOutcome layout = remodel.commit(operator, venue, expectedVersion, cells, disturbed -> {
			seen.set(disturbed);
			decided.set(decide(operator, venue, disturbed, token, confirmation));
			return decided.get() instanceof RemodelCommitOutcome.Committed(var receipt, var at, var settled)
					? new GateVerdict.Proceed(keptSetsOf(settled))
					: GateVerdict.Decline.DECLINED;
		});
		return switch (layout) {
			case LayoutCommitOutcome.Committed ignored -> decidedOrFail(decided);
			case LayoutCommitOutcome.Refused ignored -> decidedOrFail(decided);
			case LayoutCommitOutcome.KeptSetsDisplaced ignored -> new RemodelCommitOutcome.Refused(seen.get(),
					((RemodelCommitOutcome.Committed) decidedOrFail(decided)).settled());
			case LayoutCommitOutcome.SetsInUse(var sets) -> new RemodelCommitOutcome.SetsInUse(sets);
			case LayoutCommitOutcome.Rejected(var reason) -> new RemodelCommitOutcome.Rejected(reason);
		};
	}

	/** The sets of the claims {@code booking} kept, each once, in classification order. */
	private static List<SetId> keptSetsOf(List<RemodelClaim> settled) {
		return settled.stream()
				.filter(claim -> claim.outcome() instanceof RemodelOutcome.Blocked)
				.map(claim -> claim.from().setId())
				.distinct()
				.toList();
	}

	private RemodelCommitOutcome decide(OperatorId operator, VenueId venue, List<DisturbedSet> disturbed,
			PreviewToken token, RefundConfirmation confirmation) {
		List<SetId> setIds = disturbed.stream().map(DisturbedSet::setId).toList();
		if (disturbed.stream().anyMatch(set -> !set.walkInHolds().isEmpty())) {
			return new RemodelCommitOutcome.StalePreview(disturbed, claims.classify(operator, venue, setIds));
		}
		return switch (claims.commit(operator, venue, setIds, token, confirmation)) {
			case RemodelCommit.Applied(var receipt, var committedAt, var settled) ->
				new RemodelCommitOutcome.Committed(receipt, committedAt, settled);
			case RemodelCommit.Stale(var fresh) -> new RemodelCommitOutcome.StalePreview(disturbed, fresh);
			case RemodelCommit.Unconfirmed(var fresh) -> new RemodelCommitOutcome.NotConfirmed(disturbed, fresh);
		};
	}

	private static RemodelCommitOutcome decidedOrFail(AtomicReference<RemodelCommitOutcome> decided) {
		RemodelCommitOutcome outcome = decided.get();
		if (outcome == null) {
			throw new IllegalStateException("the layout write answered without asking the gate");
		}
		return outcome;
	}
}
