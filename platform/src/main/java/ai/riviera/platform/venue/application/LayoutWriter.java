package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Component;

import ai.riviera.platform.venue.api.RemodelGate;
import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The one bulk layout write, shared by the save and the remodel commit: the shape checks, the venue
 * row lock and token compare, the {@code FOR UPDATE} over every active set row, the cell-keyed
 * {@link LayoutDiff}, then the caller's {@link RemodelGate} — asked once, with the disturbed sets and
 * their walk-in holds, before anything is written — then the save's own live-claim probe, then the
 * write: removals (retire with history, delete without), parked labels, in-place updates, inserts,
 * the token. The save's gate always proceeds, so the probe alone decides; the commit's gate moves the
 * bookings first, and the probe then finds nothing unless the gate left a claim behind. Runs inside
 * the caller's transaction, after the caller asserted ownership (invariant #13). Rationale:
 * RESPONSIBILITIES.md §venue.
 */
@Component
class LayoutWriter {

	private final Venues venues;
	private final LiveClaims claims;
	private final BookingPresence bookings;
	private final Clock clock;

	LayoutWriter(Venues venues, LiveClaims claims, BookingPresence bookings, Clock clock) {
		this.venues = venues;
		this.claims = claims;
		this.bookings = bookings;
		this.clock = clock;
	}

	LayoutWrite write(ai.riviera.platform.venue.vocabulary.VenueId venueId, long expectedVersion,
			LayoutCommand command, RemodelGate gate) {
		if (command.isEmpty()) {
			return new LayoutWrite.Rejected(LayoutRejection.EMPTY_LAYOUT);
		}
		if (command.tooLarge()) {
			return new LayoutWrite.Rejected(LayoutRejection.LAYOUT_TOO_LARGE);
		}
		if (!venues.venueExists(venueId)) {
			return new LayoutWrite.Rejected(LayoutRejection.NO_SUCH_VENUE);
		}
		Optional<Venues.Conflict> internal = command.duplicateWithin();
		if (internal.isPresent()) {
			return new LayoutWrite.Rejected(toRejection(internal.get()));
		}
		if (command.splitsRowLabel()) {
			return new LayoutWrite.Rejected(LayoutRejection.ROW_NAME_TAKEN);
		}
		// Venue row lock + token read before the set locks (venue before set rows, as every set-write); advanced only on success.
		if (venues.lockAndReadSetVersion(venueId) != expectedVersion) {
			return new LayoutWrite.Rejected(LayoutRejection.STALE_WRITE);
		}
		// Lock the set rows before the gate and the probe: a racing claim is either seen or blocks on its FK (invariant #2).
		LayoutDiff diff = LayoutDiff.of(venues.lockSetsOfVenue(venueId), command);
		List<PlacedSet> disturbed = diff.disturbed();
		if (!gate.proceed(withHolds(disturbed))) {
			return LayoutWrite.Refused.REFUSED;
		}
		Map<SetId, SetLock> locks = claims.locksOn(disturbed.stream().map(PlacedSet::id).toList());
		if (!locks.isEmpty()) {
			return new LayoutWrite.SetsInUse(disturbed.stream()
					.filter(set -> locks.containsKey(set.id()))
					.map(set -> new BlockedSet(set, locks.get(set.id())))
					.toList());
		}
		// Removals first, so a slot they free is open before an update or an insert takes it.
		for (PlacedSet gone : diff.removed()) {
			if (bookings.hasBookings(gone.id())) {
				venues.retireSet(venueId, gone.id(), clock.instant());
			}
			else {
				venues.deleteSet(venueId, gone.id());
			}
		}
		List<SetId> colliding = diff.collidingUpdates();
		if (!colliding.isEmpty()) {
			venues.parkRowLabels(venueId, colliding);
		}
		for (LayoutDiff.Update kept : diff.updates()) {
			venues.updateSet(venueId, kept.stored().id(), kept.command());
		}
		venues.insertSets(venueId, diff.inserts());
		venues.incrementSetVersion(venueId);
		return LayoutWrite.Written.WRITTEN;
	}

	private List<DisturbedSet> withHolds(List<PlacedSet> disturbed) {
		if (disturbed.isEmpty()) {
			return List.of();
		}
		Map<SetId, List<java.time.LocalDate>> holds = claims.walkInHoldsOn(disturbed.stream().map(PlacedSet::id).toList());
		return disturbed.stream()
				.map(set -> new DisturbedSet(set.id(), set.placement(), holds.getOrDefault(set.id(), List.of())))
				.toList();
	}

	private static LayoutRejection toRejection(Venues.Conflict conflict) {
		return switch (conflict) {
			case DUPLICATE_POSITION -> LayoutRejection.DUPLICATE_POSITION;
			case CELL_TAKEN -> LayoutRejection.CELL_TAKEN;
		};
	}
}
