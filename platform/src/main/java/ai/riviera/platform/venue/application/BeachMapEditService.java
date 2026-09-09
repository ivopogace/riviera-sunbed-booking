package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The beach-map edit use cases (U7): place, re-place and remove a set, reprice and rename a row,
 * replace the whole layout, and apply a batch of price/tier/pool changes. Package-private — the
 * public seam is the {@link EditBeachMap} port (invariant #11). The hard command validation lives
 * in the command records ({@link SetCommand}, {@link SetBatchCommand}); this service owns the
 * orchestration: existence checks, the row locks, the claim probes, conflict→{@link SetRejection}
 * mapping, and the transactional write through {@link Venues}. The DB UNIQUE constraints (V2/V12)
 * are the race-safe backstop behind the pre-checks. The profile and own-venues reads are
 * {@link VenueAdminService}'s; venue creation is {@link OnboardVenueService}'s.
 *
 * <p>Every write is guarded: its first act is {@link VenueOwnership#assertOwns} on the acting
 * {@link OperatorId}, so an operator cannot touch another operator's venue (invariant #13, BOLA) —
 * the check is here in the application service, not the controller, so no driving adapter can
 * bypass it. Which writes ask the claim question, and why the pool never does:
 * RESPONSIBILITIES.md §venue.
 */
@Service
class BeachMapEditService implements EditBeachMap {

	private final Venues venues;
	private final VenueOwnership ownership;
	private final LiveClaims claims;
	private final BookingPresence bookings;
	private final Clock clock;

	BeachMapEditService(Venues venues, VenueOwnership ownership, LiveClaims claims,
			BookingPresence bookings, Clock clock) {
		this.venues = venues;
		this.ownership = ownership;
		this.claims = claims;
		this.bookings = bookings;
		this.clock = clock;
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
		// Lock BEFORE the claim probe: a claim racing in behind the probe would otherwise be lost.
		Optional<SetPlacement> placement = venues.lockSet(venueId, setId);
		if (placement.isEmpty()) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_SET);
		}
		if (placement.get().disturbedBy(command) && claims.isLivelyClaimed(setId)) {
			return new ChangeOutcome.Rejected(SetRejection.SET_IN_USE);
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
	public ChangeOutcome removeSet(OperatorId operator, VenueId venueId, SetId setId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (!venues.venueExists(venueId)) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
		}
		// Lock BEFORE the claim probe: a claim racing in behind the probe would otherwise be lost.
		if (venues.lockSet(venueId, setId).isEmpty()) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_SET);
		}
		if (claims.isLivelyClaimed(setId)) {
			return new ChangeOutcome.Rejected(SetRejection.SET_IN_USE);
		}
		if (bookings.hasBookings(setId)) {
			venues.retireSet(venueId, setId, clock.instant());
		}
		else {
			venues.deleteSet(venueId, setId);
		}
		return ChangeOutcome.Applied.APPLIED;
	}


	@Override
	@Transactional
	public ChangeOutcome repriceRow(OperatorId operator, VenueId venueId, long expectedVersion,
			RowPriceCommand command) {
		// Ownership first — fail closed before any read/write (invariant #13, BOLA).
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (!venues.venueExists(venueId)) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
		}
		// Venue row lock + token read first (venue before set rows, as every set-write); advanced only on success.
		if (venues.lockAndReadSetVersion(venueId) != expectedVersion) {
			return new ChangeOutcome.Rejected(SetRejection.STALE_WRITE);
		}
		// Rows-affected is the existence check (0 ⇒ no set carries the label); no claim probe (EditBeachMap#repriceRow).
		int updated = venues.repriceRow(venueId, command);
		if (updated == 0) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_ROW);
		}
		venues.incrementSetVersion(venueId); // advance the token iff a row was actually repriced
		return ChangeOutcome.Applied.APPLIED;
	}

	@Override
	@Transactional
	public ChangeOutcome renameRow(OperatorId operator, VenueId venueId, long expectedVersion,
			RowNameCommand command) {
		// Ownership first — fail closed before any read/write (invariant #13, BOLA).
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (!venues.venueExists(venueId)) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
		}
		// Same token, lock and order as repriceRow — no new lock edge, and only one racer off a value wins.
		if (venues.lockAndReadSetVersion(venueId) != expectedVersion) {
			return new ChangeOutcome.Rejected(SetRejection.STALE_WRITE);
		}
		Set<String> labels = venues.distinctRowLabels(venueId);
		// Existence first: a rename of a row that is gone must say so, not blame the target label.
		if (!labels.contains(command.rowLabel())) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_ROW);
		}
		if (command.newLabel().equals(command.rowLabel())) {
			// Nothing to write: spending the shared token here would stale every other tab for free.
			return ChangeOutcome.Applied.APPLIED;
		}
		// Broader than the UNIQUE index, which misses a shared label whose position numbers never collide.
		if (labels.contains(command.newLabel())) {
			return new ChangeOutcome.Rejected(SetRejection.ROW_NAME_TAKEN);
		}
		// Rows-affected still guards: a concurrent removeSet can empty the row after the label read.
		if (venues.renameRow(venueId, command) == 0) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_ROW);
		}
		venues.incrementSetVersion(venueId); // advance the token iff a row was actually renamed
		return ChangeOutcome.Applied.APPLIED;
	}

	@Override
	@Transactional
	public ReplaceLayoutOutcome replaceLayout(OperatorId operator, VenueId venueId, long expectedVersion,
			LayoutCommand command) {
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
		if (command.splitsRowLabel()) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.ROW_NAME_TAKEN);
		}
		// Venue row lock + token read before the set locks (venue before set rows, as every set-write); advanced only on success.
		if (venues.lockAndReadSetVersion(venueId) != expectedVersion) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.STALE_WRITE);
		}
		// Lock the set rows before the probe: a racing claim is either seen (→ reject) or blocks on its FK (invariant #2).
		List<SetId> existing = venues.lockSetsOfVenue(venueId);
		if (claims.hasLiveHold(existing) || bookings.hasBookings(venueId)) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.LAYOUT_IN_USE);
		}
		// Unclaimed: replace atomically, then advance the token — it moves iff the layout did.
		venues.deleteAllSets(venueId);
		venues.insertSets(venueId, command.sets());
		venues.incrementSetVersion(venueId);
		return ReplaceLayoutOutcome.Replaced.REPLACED;
	}

	@Override
	@Transactional
	public SetBatchOutcome applyToSets(OperatorId operator, VenueId venueId, long expectedVersion,
			SetBatchCommand command) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (!venues.venueExists(venueId)) {
			return new SetBatchOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
		}
		// Venue row first, then the set rows — the order every set-write takes, so none can deadlock another.
		if (venues.lockAndReadSetVersion(venueId) != expectedVersion) {
			return new SetBatchOutcome.Rejected(SetRejection.STALE_WRITE);
		}
		// No claim question; the FOR UPDATE makes a racing claim read the committed pool (RESPONSIBILITIES.md §venue).
		Set<SetId> locked = venues.lockSets(venueId, command.setIds());
		if (locked.size() != command.setIds().size()) {
			return new SetBatchOutcome.Rejected(SetRejection.NO_SUCH_SET);
		}
		int updated = venues.updateSetFields(venueId, command);
		venues.incrementSetVersion(venueId); // advance the token iff the batch wrote
		return new SetBatchOutcome.Applied(updated);
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
