package ai.riviera.platform.venue.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.api.BeachMapRemodel;
import ai.riviera.platform.venue.api.RemodelGate;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.LayoutCommitOutcome;
import ai.riviera.platform.venue.vocabulary.LayoutPreview;
import ai.riviera.platform.venue.vocabulary.LockedSet;
import ai.riviera.platform.venue.vocabulary.PreviewRejection;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Serves {@link BeachMapRemodel}. The preview: ownership first, then the token, then
 * {@link LayoutDiff} over the unlocked active map, then the walk-in holds on the disturbed sets
 * through {@link LiveClaims} — the save's own arms without the {@code FOR UPDATE}, which is why the
 * answer is advisory, and read-only so it can never queue a claim's FK lock. The commit: ownership
 * first, then {@link LayoutWriter#write} with the caller's gate, in a transaction this service opens
 * explicitly — the gate, and whatever the caller does inside it, shares that transaction and the
 * venue's set locks — and commits only when the layout was written: any other answer rolls the
 * whole unit back, so a move the gate made never survives a save that did not happen.
 */
@Service
class BeachMapRemodelService implements BeachMapRemodel {

	private final VenueOwnership ownership;
	private final Venues venues;
	private final LiveClaims claims;
	private final LayoutWriter writer;
	private final TransactionTemplate commitTransaction;

	BeachMapRemodelService(VenueOwnership ownership, Venues venues, LiveClaims claims, LayoutWriter writer,
			PlatformTransactionManager transactions) {
		this.ownership = ownership;
		this.venues = venues;
		this.claims = claims;
		this.writer = writer;
		this.commitTransaction = new TransactionTemplate(transactions);
	}

	@Override
	@Transactional(readOnly = true)
	public LayoutPreview preview(OperatorId operator, VenueId venueId, long expectedVersion,
			List<SetPlacement> cells) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		OptionalLong setVersion = venues.setVersionOf(venueId);
		if (setVersion.isEmpty()) {
			return new LayoutPreview.Rejected(PreviewRejection.NO_SUCH_VENUE);
		}
		if (setVersion.getAsLong() != expectedVersion) {
			return new LayoutPreview.Rejected(PreviewRejection.STALE_WRITE);
		}
		List<PlacedSet> disturbed = LayoutDiff.disturbedBy(venues.placedSetsOf(venueId), cells);
		if (disturbed.isEmpty()) {
			return new LayoutPreview.Disturbing(List.of());
		}
		Map<SetId, List<LocalDate>> holds = claims.walkInHoldsOn(disturbed.stream().map(PlacedSet::id).toList());
		return new LayoutPreview.Disturbing(disturbed.stream()
				.map(set -> new DisturbedSet(set.id(), set.placement(), holds.getOrDefault(set.id(), List.of())))
				.toList());
	}

	@Override
	public LayoutCommitOutcome commit(OperatorId operator, VenueId venueId, long expectedVersion,
			List<LayoutCell> cells, RemodelGate gate) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		LayoutCommand command = LayoutCommand.of(cells);
		return commitTransaction.execute(status -> {
			LayoutWrite write = writer.write(venueId, expectedVersion, command, gate);
			if (!(write instanceof LayoutWrite.Written)) {
				status.setRollbackOnly();
			}
			return switch (write) {
				case LayoutWrite.Written ignored -> LayoutCommitOutcome.Committed.COMMITTED;
				case LayoutWrite.Refused ignored -> LayoutCommitOutcome.Refused.REFUSED;
				case LayoutWrite.SetsInUse(var sets) -> new LayoutCommitOutcome.SetsInUse(sets.stream()
						.map(blocked -> new LockedSet(blocked.set().id(), blocked.set().placement(),
								blocked.lock().bookedOn(), blocked.lock().heldOn()))
						.toList());
				case LayoutWrite.Rejected(var reason) -> new LayoutCommitOutcome.Rejected(reason);
			};
		});
	}
}
