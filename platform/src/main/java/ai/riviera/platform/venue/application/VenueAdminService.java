package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

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
 * The venue edit use cases: edit a venue's beach-map layout (U7) and its
 * profile fields — amenities + distance-to-water. Package-private — the public seams
 * are the {@link EditBeachMap} / {@link EditVenueProfile} ports (invariant #11);
 * one implementation, but the ports give the web adapter a clean, mockable entry point. The hard
 * command validation lives in the command records ({@link SetCommand});
 * this service owns the orchestration: existence checks, conflict→{@link SetRejection} mapping,
 * and the transactional write through {@link Venues}. The DB UNIQUE constraints (V2/V12) are the
 * race-safe backstop behind the pre-checks. Venue creation is its own conversation —
 * {@link OnboardVenueService}.
 *
 * <p>Each venue-scoped edit is guarded: the first act of {@code addSet}/{@code editSet}/
 * {@code removeSet}/{@code updateProfile} is {@link VenueOwnership#assertOwns} on the acting
 * {@link OperatorId}, so an operator cannot touch another operator's venue (invariant #13, BOLA) —
 * the check is here in the application service, not the controller, so no driving adapter can
 * bypass it.
 */
@Service
class VenueAdminService
		implements EditBeachMap, EditVenueProfile, ViewVenueProfile, ListOwnedVenues {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final Venues venues;
	private final VenueOwnership ownership;
	private final SetAvailabilityLookup availability;
	private final BookingPresence bookings;
	private final Clock clock;

	VenueAdminService(Venues venues, VenueOwnership ownership, SetAvailabilityLookup availability,
			BookingPresence bookings, Clock clock) {
		this.venues = venues;
		this.ownership = ownership;
		this.availability = availability;
		this.bookings = bookings;
		this.clock = clock;
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
		Set<VenueId> ids = ownership.ownedVenues(operator).stream()
				.map(ref -> new VenueId(ref.value()))
				.collect(Collectors.toSet());
		// Short-circuit an operator that owns nothing, so no `IN ()` predicate reaches the database.
		return ids.isEmpty() ? List.of() : venues.findSummaries(ids);
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
		if (placement.get().disturbedBy(command) && isLivelyClaimed(setId)) {
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
		if (isLivelyClaimedOrEverBooked(setId)) {
			return new ChangeOutcome.Rejected(SetRejection.SET_IN_USE);
		}
		venues.deleteSet(venueId, setId);
		return ChangeOutcome.Applied.APPLIED;
	}

	/**
	 * Whether a hold on any of these sets is still ahead — dated today or later in
	 * {@code Europe/Tirane} (invariant #6). The availability arm <em>all three</em> layout writes
	 * share: a hold whose day has passed can neither be stranded by a move nor be lost by a delete
	 * that matters, and no write path can add one behind this cutoff (invariant #4 closes the sale
	 * the evening before, and a staff mark refuses a past date) — which is why the probe stays
	 * race-safe under the row locks. Callers must already hold those locks.
	 */
	private boolean hasLiveHold(Collection<SetId> setIds) {
		return availability.anyClaimsFrom(setIds, LocalDate.now(clock.withZone(TIRANE)));
	}

	/**
	 * Whether anyone is still owed this exact spot — a live hold, or a booking that has not reached
	 * a terminal state. The <em>edit</em> question: an {@code UPDATE} of pool or coordinates strands
	 * only a guest who is still coming, so last season's cancelled booking must not freeze the map
	 * forever. Callers must already hold the row lock.
	 */
	private boolean isLivelyClaimed(SetId setId) {
		return hasLiveHold(List.of(setId)) || bookings.hasLiveBookings(setId);
	}

	/**
	 * Whether a live hold or a booking of <em>any</em> status pins this set. The <em>delete</em>
	 * question, stricter than {@link #isLivelyClaimed} on the booking arm alone: the RESTRICT
	 * {@code booking.set_id} FK makes a set carrying any booking undeletable, so refusing here turns
	 * what would surface as a server error into an honest conflict. History does not block on the
	 * availability arm — a past hold CASCADEs away describing a day that is already gone.
	 * Rationale: RESPONSIBILITIES.md §venue. Callers must already hold the row lock.
	 */
	private boolean isLivelyClaimedOrEverBooked(SetId setId) {
		return hasLiveHold(List.of(setId)) || bookings.hasBookings(setId);
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
		// Optimistic lock — take the venue row lock and read set_version (the SAME token replaceLayout
		// guards, so a replace and a reprice off the same value cannot both win) BEFORE the reprice UPDATE.
		// A mismatch is a stale version. Order matches replaceLayout (venue row before its set rows) → no
		// deadlock (R-1). The token is advanced ONLY after a successful reprice below, so a NO_SUCH_ROW
		// reject leaves it untouched — the acting tab's own next edit off the same token still works.
		if (venues.lockAndReadSetVersion(venueId) != expectedVersion) {
			return new ChangeOutcome.Rejected(SetRejection.STALE_WRITE);
		}
		// Non-destructive: the UPDATE's rows-affected is the row existence check (0 ⇒ no set carries
		// the label). Repricing never touches availability/set identity, so — unlike replaceLayout — it
		// needs no claim probe and is allowed on a venue with bookings/holds (see EditBeachMap#repriceRow).
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
		// Broader than the UNIQUE index, which misses a shared label whose position numbers never collide.
		if (venues.rowNameTaken(venueId, command)) {
			return new ChangeOutcome.Rejected(SetRejection.ROW_NAME_TAKEN);
		}
		// No claim probe: nothing a hold or booking depends on changes (see EditBeachMap#renameRow).
		int updated = venues.renameRow(venueId, command);
		if (updated == 0) {
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
		// Optimistic lock — take the venue row lock and read set_version BEFORE lockSetsOfVenue's
		// FOR UPDATE. Both set-writes acquire the venue row first, then their set rows: one consistent order
		// → no deadlock (R-1). A mismatch means another replace/reprice advanced it since the load →
		// STALE_WRITE. The token is advanced by incrementSetVersion ONLY on the success path below, so a
		// LAYOUT_IN_USE reject (or any early return) leaves it untouched — the acting tab's own retry off the
		// same token still works, and it is the SAME token repriceRow guards, so a replace and a reprice
		// racing off the same value cannot both win.
		if (venues.lockAndReadSetVersion(venueId) != expectedVersion) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.STALE_WRITE);
		}
		// Refuse rather than CASCADE away a live hold or trip the RESTRICT booking FK (invariant #2).
		// Lock the venue's set rows FOR UPDATE *before* the claim probe (invariant #2): a walk-in mark
		// or booking racing in after the probe but before deleteAllSets would otherwise be lost — the
		// lock makes that concurrent insert block on its FK's FOR KEY SHARE until this tx ends, so it is
		// either seen by the probe (→ reject) or fails cleanly against the replaced layout. Never a
		// silent cascade of a committed hold.
		List<SetId> existing = venues.lockSetsOfVenue(venueId);
		if (hasLiveHold(existing) || bookings.hasBookings(venueId)) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.LAYOUT_IN_USE);
		}
		// Unclaimed: replace the whole map atomically (both writes in this @Transactional unit), then
		// advance the token — the increment commits with the write, so the token moves iff the layout did.
		venues.deleteAllSets(venueId);
		venues.insertSets(venueId, command.sets());
		venues.incrementSetVersion(venueId);
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
