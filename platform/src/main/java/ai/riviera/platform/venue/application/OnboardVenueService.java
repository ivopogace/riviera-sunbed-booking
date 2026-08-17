package ai.riviera.platform.venue.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue onboarding use case (U7), split from {@code VenueAdminService}: creation is its own
 * conversation — it has no path {@code venueId} to ownership-check against (invariant #13) and is
 * the one write that consults the platform's creation terms. Package-private; the public seam is
 * the {@link OnboardVenue} port. The commission rate is stamped here from
 * {@link VenueCreationProperties} — never taken from the command — so no driving adapter can
 * supply one. The creating operator is recorded as the new venue's owner in the same transaction
 * (creator-owns-on-create), so a create-then-edit flow works and no venue is ever left unowned.
 */
@Service
class OnboardVenueService implements OnboardVenue {

	private final Venues venues;
	private final VenueOwnership ownership;
	private final VenueCreationProperties creation;

	OnboardVenueService(Venues venues, VenueOwnership ownership, VenueCreationProperties creation) {
		this.venues = venues;
		this.ownership = ownership;
		this.creation = creation;
	}

	@Override
	@Transactional
	public VenueId onboard(OperatorId creator, NewVenueCommand command) {
		// The platform's term, stamped here so no driving adapter can supply a rate (issue #692).
		VenueId id = new VenueId(venues.insertVenue(command, creation.defaultCommissionBps()));
		// Ownership is written atomically with the insert: if it fails the whole create rolls back.
		ownership.assignOwner(creator, new VenueRef(id.value()));
		return id;
	}
}
