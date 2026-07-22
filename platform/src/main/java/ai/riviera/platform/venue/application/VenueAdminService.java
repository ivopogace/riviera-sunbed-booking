package ai.riviera.platform.venue.application;

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
 * bypass it. {@code onboard} (venue creation) has no path {@code venueId} to check against — instead
 * it <em>writes</em> ownership: the creating operator is recorded as the new venue's owner in the same
 * transaction (creator-owns-on-create, #115), so a create-then-edit flow works and no venue is ever
 * left unowned.
 */
@Service
class VenueAdminService
		implements OnboardVenue, EditBeachMap, EditVenueProfile, ViewVenueProfile, ListOwnedVenues {

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
	public VenueId onboard(OperatorId creator, NewVenueCommand command) {
		VenueId id = new VenueId(venues.insertVenue(command));
		// Creator-owns-on-create (#115, invariant #13): record ownership atomically with the insert.
		// If this write fails the whole create rolls back — a venue is never left owned by no one, and
		// the creator is never 403'd on the venue it just made.
		ownership.assignOwner(creator, new VenueRef(id.value()));
		return id;
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
		// Conditional on the loaded version (#224): of two writers off the same version the winner bumps
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
		// No assertOwns here — and that is the point (invariant #13, S9 #277): the id set IS the
		// ownership mapping, so the result is scoped to the authenticated principal by construction.
		// There is no venue id in the request to tamper with, which is what makes GET /api/venues/mine
		// BOLA-safe without an object-level check.
		Set<VenueId> ids = ownership.ownedVenues(operator).stream()
				.map(ref -> new VenueId(ref.value()))
				.collect(Collectors.toSet());
		// Short-circuit an operator that owns nothing (a freshly-approved one, #115): an empty list,
		// never null — and no `IN ()` predicate reaches the database.
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
	public ChangeOutcome repriceRow(OperatorId operator, VenueId venueId, long expectedVersion,
			RowPriceCommand command) {
		// Ownership first — fail closed before any read/write (invariant #13, BOLA).
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (!venues.venueExists(venueId)) {
			return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
		}
		// #226 optimistic lock — take the venue row lock and read set_version (the SAME token replaceLayout
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
		// #226 optimistic lock — take the venue row lock and read set_version BEFORE lockSetsOfVenue's
		// FOR UPDATE. Both set-writes acquire the venue row first, then their set rows: one consistent order
		// → no deadlock (R-1). A mismatch means another replace/reprice advanced it since the load →
		// STALE_WRITE. The token is advanced by incrementSetVersion ONLY on the success path below, so a
		// LAYOUT_IN_USE reject (or any early return) leaves it untouched — the acting tab's own retry off the
		// same token still works, and it is the SAME token repriceRow guards, so a replace and a reprice
		// racing off the same value cannot both win.
		if (venues.lockAndReadSetVersion(venueId) != expectedVersion) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.STALE_WRITE);
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
