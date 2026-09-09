package ai.riviera.platform.venue.application;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetView;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Serves {@link ViewBeachMap}: assert ownership, compose the map through this module's own
 * {@link VenueCatalog} (the tourist read, fence included — the editor seeded from it before this
 * read existed and keeps that behaviour), then ask {@link LiveClaims} which of the map's sets are
 * pinned. Package-private behind its port (invariant #11).
 *
 * <p>Ownership asserts <strong>first</strong> (invariant #13, BOLA): a non-owner is
 * {@code NotVenueOwnerException} → 403 before any existence probe, so the read discloses nothing
 * about venues you don't own — {@code 403} outranks {@code 404}, matching every sibling
 * venue-scoped service.
 */
@Service
class BeachMapReadService implements ViewBeachMap {

	private final VenueOwnership ownership;
	private final VenueCatalog catalog;
	private final LiveClaims claims;

	BeachMapReadService(VenueOwnership ownership, VenueCatalog catalog, LiveClaims claims) {
		this.ownership = ownership;
		this.catalog = catalog;
		this.claims = claims;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<OperatorBeachMap> beachMapFor(OperatorId operator, VenueId venueId) {
		// Ownership first — 403 outranks 404, so a non-owner never learns whether the venue exists.
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		return catalog.findVenueMap(venueId, claims.today()).map(map -> {
			List<SetId> setIds = map.sets().stream().map(SetView::id).map(SetId::new).toList();
			List<SetLock> locks = claims.locksOn(setIds).values().stream()
					.sorted(Comparator.comparingLong(lock -> lock.setId().value()))
					.toList();
			return new OperatorBeachMap(map, locks);
		});
	}
}
