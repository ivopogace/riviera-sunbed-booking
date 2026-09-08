package ai.riviera.platform.venue.application;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue profile use cases: the owner's profile read and full-replace write (amenities,
 * distance-to-water, booking mode, sales close) and the signed-in operator's own-venues read.
 * Package-private — the public seams are the {@link EditVenueProfile}, {@link ViewVenueProfile}
 * and {@link ListOwnedVenues} ports (invariant #11). The beach-map writes are
 * {@link BeachMapEditService}'s; venue creation is {@link OnboardVenueService}'s.
 *
 * <p>Each venue-scoped call is guarded: its first act is {@link VenueOwnership#assertOwns} on the
 * acting {@link OperatorId}, so an operator cannot touch another operator's venue (invariant #13,
 * BOLA) — the check is here in the application service, not the controller, so no driving adapter
 * can bypass it.
 */
@Service
class VenueAdminService implements EditVenueProfile, ViewVenueProfile, ListOwnedVenues {

	private final Venues venues;
	private final VenueOwnership ownership;

	VenueAdminService(Venues venues, VenueOwnership ownership) {
		this.venues = venues;
		this.ownership = ownership;
	}

	@Override
	@Transactional
	public ProfileUpdateOutcome updateProfile(OperatorId operator, VenueId venueId,
			long expectedVersion, VenueProfileCommand command) {
		ownership.assertOwns(operator, new VenueRef(venueId.value())); // invariant #13, first & unchanged
		// Existence is checked BEFORE the conditional write so that a 0-rows result is unambiguous: here
		// it can only mean the loaded version no longer matches (stale tab), never no-such-venue (R-2).
		if (!venues.venueExists(venueId)) {
			return ProfileUpdateOutcome.NO_SUCH_VENUE;
		}
		// Conditional on the loaded version: of two writers off the same version the winner bumps
		// version→+1, so the loser's WHERE version=:expected then matches nothing (READ COMMITTED
		// re-evaluates the qual after the winner commits) → 0 rows → STALE_WRITE, rather than silently
		// clobbering booking_mode/booking_cutoff. The amenity replace runs in the same @Transactional unit.
		int rows = venues.updateVenueProfile(venueId, expectedVersion, command);
		return rows == 0 ? ProfileUpdateOutcome.STALE_WRITE : ProfileUpdateOutcome.APPLIED;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<VenueProfileView> profileFor(OperatorId operator, VenueId venueId) {
		// Ownership first — an operator may only read their own venue's profile (which carries the
		// commission rate + payout currency); a mismatch throws NotVenueOwnerException → 403 (#13, BOLA).
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		return venues.findProfile(venueId);
	}

	@Override
	@Transactional(readOnly = true)
	public List<OwnedVenueView> ownedBy(OperatorId operator) {
		// No assertOwns: the ownership mapping IS the filter, so there is no id to tamper with (#13).
		Set<VenueId> ids = Set.copyOf(ownership.ownedVenues(operator).stream()
				.map(ref -> new VenueId(ref.value()))
				.toList());
		// Short-circuit an operator that owns nothing, so no `IN ()` predicate reaches the database.
		return ids.isEmpty() ? List.of() : venues.findSummaries(ids);
	}
}
