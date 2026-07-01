package ai.riviera.platform.venue.application;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.api.VenueRef;
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
 *
 * <p>Each beach-map edit is venue-scoped: the first act of {@code addSet}/{@code editSet}/
 * {@code removeSet} is {@link VenueOwnership#assertOwns} on the acting {@link OperatorId}, so an
 * operator cannot touch another operator's venue (invariant #13, BOLA) — the check is here in the
 * application service, not the controller, so no driving adapter can bypass it. {@code onboard}
 * (venue creation) has no path {@code venueId} and stays role-gated only (creator-owns-on-create is
 * deferred to #74).
 */
@Service
class VenueAdminService implements OnboardVenue, EditBeachMap {

	private final Venues venues;
	private final VenueOwnership ownership;

	VenueAdminService(Venues venues, VenueOwnership ownership) {
		this.venues = venues;
		this.ownership = ownership;
	}

	@Override
	@Transactional
	public VenueId onboard(NewVenueCommand command) {
		return new VenueId(venues.insertVenue(command));
	}

	@Override
	@Transactional
	public AddSetOutcome addSet(OperatorId operator, VenueId venueId, SetCommand command) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
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
	public ChangeOutcome editSet(OperatorId operator, VenueId venueId, SetId setId, SetCommand command) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
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
		// Rows-affected is the race backstop: if the set was deleted concurrently after the
		// existence check above, the UPDATE touches 0 rows and we must not report success.
		int updated = venues.updateSet(venueId, setId, command);
		return updated == 0
				? new ChangeOutcome.Rejected(SetRejection.NO_SUCH_SET)
				: ChangeOutcome.Applied.APPLIED;
	}

	@Override
	@Transactional
	public ChangeOutcome removeSet(OperatorId operator, VenueId venueId, SetId setId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (!venues.venueExists(venueId)) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
		}
		// The DELETE's rows-affected is the existence check: 0 ⇒ no such set (also covers a
		// concurrent delete), 1 ⇒ removed. No separate pre-check needed.
		int deleted = venues.deleteSet(venueId, setId);
		return deleted == 0
				? new ChangeOutcome.Rejected(SetRejection.NO_SUCH_SET)
				: ChangeOutcome.Applied.APPLIED;
	}

	private static SetRejection toRejection(Venues.Conflict conflict) {
		return switch (conflict) {
			case DUPLICATE_POSITION -> SetRejection.DUPLICATE_POSITION;
			case CELL_TAKEN -> SetRejection.CELL_TAKEN;
		};
	}
}
