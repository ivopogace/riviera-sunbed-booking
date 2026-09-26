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
 * The remodel commit's gate at the edge (ADR-0020): {@link BeachMapRemodel#commit} owns the
 * transaction and set lock and asks it once, under the locks, with the disturbed sets. A staff-held
 * set answers stale (the preview offered no save for it); else {@link RemodelClaims#commit} checks
 * token and refund confirmation and settles every claim in that transaction; only applied proceeds,
 * naming the kept claims' sets. A layout giving a kept set's label away rolls back → refused with
 * the fresh picture. Ports assert ownership (#13). Rationale: RESPONSIBILITIES.md §Platform edge.
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
