package ai.riviera.platform;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.booking.vocabulary.RemodelCommit;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.api.BeachMapRemodel;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
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
 * the operator's refund confirmation, and applies every claim, all inside {@code venue}'s
 * transaction; the gate proceeds only when it answered applied. Each port asserts venue ownership
 * itself (invariant #13); this class holds no rule.
 */
@Component
class RemodelCommitService {

	private final BeachMapRemodel remodel;
	private final RemodelClaims claims;

	RemodelCommitService(BeachMapRemodel remodel, RemodelClaims claims) {
		this.remodel = remodel;
		this.claims = claims;
	}

	RemodelCommitOutcome commit(OperatorId operator, VenueId venue, long expectedVersion, List<LayoutCell> cells,
			PreviewToken token, RefundConfirmation confirmation) {
		AtomicReference<RemodelCommitOutcome> decided = new AtomicReference<>();
		LayoutCommitOutcome layout = remodel.commit(operator, venue, expectedVersion, cells, disturbed -> {
			decided.set(decide(operator, venue, disturbed, token, confirmation));
			return decided.get() instanceof RemodelCommitOutcome.Committed;
		});
		return switch (layout) {
			case LayoutCommitOutcome.Committed ignored -> decidedOrFail(decided);
			case LayoutCommitOutcome.Refused ignored -> decidedOrFail(decided);
			case LayoutCommitOutcome.SetsInUse(var sets) -> new RemodelCommitOutcome.SetsInUse(sets);
			case LayoutCommitOutcome.Rejected(var reason) -> new RemodelCommitOutcome.Rejected(reason);
		};
	}

	private RemodelCommitOutcome decide(OperatorId operator, VenueId venue, List<DisturbedSet> disturbed,
			PreviewToken token, RefundConfirmation confirmation) {
		List<SetId> setIds = disturbed.stream().map(DisturbedSet::setId).toList();
		if (disturbed.stream().anyMatch(set -> !set.walkInHolds().isEmpty())) {
			return new RemodelCommitOutcome.StalePreview(disturbed, claims.classify(operator, venue, setIds));
		}
		return switch (claims.commit(operator, venue, setIds, token, confirmation)) {
			case RemodelCommit.Applied(var receipt, var committedAt, var applied) ->
				new RemodelCommitOutcome.Committed(receipt, committedAt, applied);
			case RemodelCommit.Stale(var fresh) -> new RemodelCommitOutcome.StalePreview(disturbed, fresh);
			case RemodelCommit.Refused(var fresh) -> new RemodelCommitOutcome.Refused(disturbed, fresh);
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
