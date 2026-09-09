package ai.riviera.platform.venue.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.api.BeachMapRemodel;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.LayoutPreview;
import ai.riviera.platform.venue.vocabulary.PreviewRejection;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Serves {@link BeachMapRemodel}: ownership first, then the token, then {@link LayoutDiff} over the
 * unlocked active map, then the walk-in holds on the disturbed sets through {@link LiveClaims}. The
 * hold arm and the diff are the save's own; the difference is the missing {@code FOR UPDATE},
 * which is why the answer is advisory. Read-only, so it can never queue a claim's FK lock.
 */
@Service
class BeachMapPreviewService implements BeachMapRemodel {

	private final VenueOwnership ownership;
	private final Venues venues;
	private final LiveClaims claims;

	BeachMapPreviewService(VenueOwnership ownership, Venues venues, LiveClaims claims) {
		this.ownership = ownership;
		this.venues = venues;
		this.claims = claims;
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
}
