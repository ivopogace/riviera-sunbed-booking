package ai.riviera.platform.venue.application;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;
import ai.riviera.platform.venue.application.in.AddSetOutcome;
import ai.riviera.platform.venue.application.in.ChangeOutcome;
import ai.riviera.platform.venue.application.in.EditBeachMap;
import ai.riviera.platform.venue.application.in.NewVenueCommand;
import ai.riviera.platform.venue.application.in.OnboardVenue;
import ai.riviera.platform.venue.application.in.SetCommand;
import ai.riviera.platform.venue.application.in.SetRejection;
import ai.riviera.platform.venue.application.out.Venues;

/**
 * The venue write use cases (U7): onboard a venue and edit its beach-map layout. Package-private
 * — the public seams are the {@link OnboardVenue} / {@link EditBeachMap} ports (invariant #11);
 * one implementation, but the ports give the web adapter a clean, mockable entry point. The hard
 * command validation lives in the command records ({@link NewVenueCommand} / {@link SetCommand});
 * this service owns the orchestration: existence checks, conflict→{@link SetRejection} mapping,
 * and the transactional write through {@link Venues}. The DB UNIQUE constraints (V2/V12) are the
 * race-safe backstop behind the pre-checks.
 */
@Service
class VenueAdminService implements OnboardVenue, EditBeachMap {

	private final Venues venues;

	VenueAdminService(Venues venues) {
		this.venues = venues;
	}

	@Override
	@Transactional
	public VenueId onboard(NewVenueCommand command) {
		return new VenueId(venues.insertVenue(command));
	}

	@Override
	@Transactional
	public AddSetOutcome addSet(VenueId venueId, SetCommand command) {
		if (!venues.venueExists(venueId)) {
			return new AddSetOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
		}
		Optional<Venues.Conflict> conflict = venues.findConflict(venueId, command, Optional.empty());
		if (conflict.isPresent()) {
			return new AddSetOutcome.Rejected(toRejection(conflict.get()));
		}
		return new AddSetOutcome.Added(new SetId(venues.insertSet(venueId, command)));
	}

	@Override
	@Transactional
	public ChangeOutcome editSet(VenueId venueId, SetId setId, SetCommand command) {
		if (!venues.venueExists(venueId)) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
		}
		if (!venues.setExists(venueId, setId)) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_SET);
		}
		Optional<Venues.Conflict> conflict = venues.findConflict(venueId, command, Optional.of(setId));
		if (conflict.isPresent()) {
			return new ChangeOutcome.Rejected(toRejection(conflict.get()));
		}
		venues.updateSet(venueId, setId, command);
		return ChangeOutcome.Applied.APPLIED;
	}

	@Override
	@Transactional
	public ChangeOutcome removeSet(VenueId venueId, SetId setId) {
		if (!venues.venueExists(venueId)) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
		}
		if (!venues.setExists(venueId, setId)) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_SET);
		}
		venues.deleteSet(venueId, setId);
		return ChangeOutcome.Applied.APPLIED;
	}

	private static SetRejection toRejection(Venues.Conflict conflict) {
		return switch (conflict) {
			case DUPLICATE_POSITION -> SetRejection.DUPLICATE_POSITION;
			case CELL_TAKEN -> SetRejection.CELL_TAKEN;
		};
	}
}
