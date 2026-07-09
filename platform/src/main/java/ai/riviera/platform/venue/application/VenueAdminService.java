package ai.riviera.platform.venue.application;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue write use cases: onboard a venue (U7), edit its beach-map layout (U7), and edit its
 * profile fields — amenities + distance-to-water (T7, #140). Package-private — the public seams
 * are the {@link OnboardVenue} / {@link EditBeachMap} / {@link EditVenueProfile} ports (invariant #11);
 * one implementation, but the ports give the web adapter a clean, mockable entry point. The hard
 * command validation lives in the command records ({@link NewVenueCommand} / {@link SetCommand});
 * this service owns the orchestration: existence checks, conflict→{@link SetRejection} mapping,
 * and the transactional write through {@link Venues}. The DB UNIQUE constraints (V2/V12) are the
 * race-safe backstop behind the pre-checks.
 *
 * <p>Each venue-scoped edit is guarded: the first act of {@code addSet}/{@code editSet}/
 * {@code removeSet}/{@code updateProfile} is {@link VenueOwnership#assertOwns} on the acting
 * {@link OperatorId}, so an operator cannot touch another operator's venue (invariant #13, BOLA) —
 * the check is here in the application service, not the controller, so no driving adapter can
 * bypass it. {@code onboard}
 * (venue creation) has no path {@code venueId} and stays role-gated only (creator-owns-on-create is
 * deferred to #74).
 */
@Service
class VenueAdminService implements OnboardVenue, EditBeachMap, EditVenueProfile {

	private final Venues venues;
	private final VenueOwnership ownership;
	private final SetAvailabilityLookup availability;
	private final BookingPresence bookings;

	VenueAdminService(Venues venues, VenueOwnership ownership, SetAvailabilityLookup availability,
			BookingPresence bookings) {
		this.venues = venues;
		this.ownership = ownership;
		this.availability = availability;
		this.bookings = bookings;
	}

	@Override
	@Transactional
	public VenueId onboard(NewVenueCommand command) {
		return new VenueId(venues.insertVenue(command));
	}

	@Override
	@Transactional
	public ChangeOutcome updateProfile(OperatorId operator, VenueId venueId, VenueProfileCommand command) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		// Rows-affected on the venue UPDATE is the existence check: 0 ⇒ no such venue. The amenity
		// set is replaced inside the same @Transactional unit (see JdbcVenues#updateVenueProfile).
		int rows = venues.updateVenueProfile(venueId, command);
		return rows == 0
				? new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE)
				: ChangeOutcome.Applied.APPLIED;
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

	@Override
	@Transactional
	public ChangeOutcome repriceRow(OperatorId operator, VenueId venueId, RowPriceCommand command) {
		// Ownership first — fail closed before any read/write (invariant #13, BOLA).
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (!venues.venueExists(venueId)) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
		}
		// Non-destructive: the UPDATE's rows-affected is the row existence check (0 ⇒ no set carries
		// the label). Repricing never touches availability/set identity, so — unlike replaceLayout — it
		// needs no claim probe and is allowed on a venue with bookings/holds (see EditBeachMap#repriceRow).
		int updated = venues.repriceRow(venueId, command);
		return updated == 0
				? new ChangeOutcome.Rejected(SetRejection.NO_SUCH_ROW)
				: ChangeOutcome.Applied.APPLIED;
	}

	@Override
	@Transactional
	public ReplaceLayoutOutcome replaceLayout(OperatorId operator, VenueId venueId, LayoutCommand command) {
		// Ownership first — fail closed before any read/write (invariant #13, BOLA).
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (command.isEmpty()) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.EMPTY_LAYOUT);
		}
		if (command.tooLarge()) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.LAYOUT_TOO_LARGE);
		}
		if (!venues.venueExists(venueId)) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.NO_SUCH_VENUE);
		}
		Optional<Venues.Conflict> internal = command.duplicateWithin();
		if (internal.isPresent()) {
			return new ReplaceLayoutOutcome.Rejected(toReplaceRejection(internal.get()));
		}
		// Reject-unless-unclaimed (issue #172): a booking (any status) pins its set via the RESTRICT FK,
		// and an availability hold (any date) would be silently CASCADE-dropped by the delete — either
		// destroys invariant-#2 state, so refuse the destructive replace and delete nothing.
		//
		// Lock the venue's set rows FOR UPDATE *before* the claim probe (invariant #2): a walk-in mark
		// or booking racing in after the probe but before deleteAllSets would otherwise be lost — the
		// lock makes that concurrent insert block on its FK's FOR KEY SHARE until this tx ends, so it is
		// either seen by the probe (→ reject) or fails cleanly against the replaced layout. Never a
		// silent cascade of a committed hold.
		List<SetId> existing = venues.lockSetsOfVenue(venueId);
		if (availability.anyClaims(existing) || bookings.hasBookings(venueId)) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.LAYOUT_IN_USE);
		}
		// Unclaimed: replace the whole map atomically (both writes in this @Transactional unit).
		venues.deleteAllSets(venueId);
		venues.insertSets(venueId, command.sets());
		return ReplaceLayoutOutcome.Replaced.REPLACED;
	}

	private static ReplaceRejection toReplaceRejection(Venues.Conflict conflict) {
		return switch (conflict) {
			case DUPLICATE_POSITION -> ReplaceRejection.DUPLICATE_POSITION;
			case CELL_TAKEN -> ReplaceRejection.CELL_TAKEN;
		};
	}

	private static SetRejection toRejection(Venues.Conflict conflict) {
		return switch (conflict) {
			case DUPLICATE_POSITION -> SetRejection.DUPLICATE_POSITION;
			case CELL_TAKEN -> SetRejection.CELL_TAKEN;
		};
	}
}
