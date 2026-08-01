package ai.riviera.platform.venue.application;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Serves {@link ViewDailyAvailability} (issue #207): assert ownership, resolve the venue's set
 * ids (the layout is {@code venue}'s), then ask the dependency-inverted
 * {@code SetAvailabilityLookup} (implemented by {@code availability}, the table's sole owner) for
 * the day's state tokens — the same composition split as the public map read (#44), one
 * state-aware step deeper. Package-private behind its port (invariant #11).
 *
 * <p>Ownership asserts <strong>first</strong> (invariant #13, BOLA): a non-owner is
 * {@code NotVenueOwnerException} → 403 before any existence probe, so the read discloses nothing
 * about venues you don't own — {@code 403} outranks {@code 404}, matching every sibling
 * venue-scoped service.
 */
@Service
class DailyAvailabilityService implements ViewDailyAvailability {

	private final Venues venues;
	private final VenueOwnership ownership;
	private final SetAvailabilityLookup availability;

	DailyAvailabilityService(Venues venues, VenueOwnership ownership,
			SetAvailabilityLookup availability) {
		this.venues = venues;
		this.ownership = ownership;
		this.availability = availability;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<List<SetDayState>> statesFor(OperatorId operator, VenueId venueId, LocalDate date) {
		// Ownership first — 403 outranks 404, so a non-owner never learns whether the venue exists.
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (!venues.venueExists(venueId)) {
			return Optional.empty();
		}
		Map<SetId, String> states = availability.statesOn(venues.setIdsOf(venueId), date);
		return Optional.of(states.entrySet().stream()
				.map(entry -> new SetDayState(entry.getKey().value(), entry.getValue()))
				.sorted(Comparator.comparingLong(SetDayState::setId))
				.toList());
	}
}
