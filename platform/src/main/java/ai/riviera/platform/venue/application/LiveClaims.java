package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Component;

import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The one live-claim question layout writes and the owner's beach-map read both ask: is anyone
 * still owed this spot? Yes for a hold dated today or later in {@code Europe/Tirane} (invariant #6)
 * or a booking {@link BookingPresence} says can still be honoured. One holder keeps the lock the
 * canvas shows equal to the lock the server enforces (ADR-0018), and reads "today" in one place.
 * Write-side callers must already hold the set row locks. Rationale: RESPONSIBILITIES.md §venue.
 */
@Component
class LiveClaims {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final SetAvailabilityLookup availability;
	private final BookingPresence bookings;
	private final Clock clock;

	LiveClaims(SetAvailabilityLookup availability, BookingPresence bookings, Clock clock) {
		this.availability = availability;
		this.bookings = bookings;
		this.clock = clock;
	}

	/** Today in {@code Europe/Tirane} — the first day a hold still counts. */
	LocalDate today() {
		return LocalDate.now(clock.withZone(TIRANE));
	}

	/** The availability arm alone: a hold on any of these sets dated today or later. */
	boolean hasLiveHold(Collection<SetId> setIds) {
		return availability.anyClaimsFrom(setIds, today());
	}

	/** Both arms for one set: a live hold, or a booking that can still be honoured. */
	boolean isLivelyClaimed(SetId setId) {
		return hasLiveHold(List.of(setId)) || bookings.hasLiveBookings(setId);
	}

	/**
	 * The locked subset of {@code setIds} with the nearest date behind each arm — a free set is
	 * absent. Agrees with {@link #isLivelyClaimed} set by set; an empty input answers empty.
	 */
	Map<SetId, SetLock> locksOn(Collection<SetId> setIds) {
		Map<SetId, LocalDate> heldOn = availability.nearestClaimsFrom(setIds, today());
		Map<SetId, LocalDate> bookedOn = bookings.nearestLiveBookings(setIds);
		return Stream.concat(heldOn.keySet().stream(), bookedOn.keySet().stream())
				.distinct()
				.collect(Collectors.toUnmodifiableMap(id -> id,
						id -> new SetLock(id, bookedOn.get(id), heldOn.get(id))));
	}

	/** The staff walk-in holds from today on each of these sets, oldest first — the preview's hold group. */
	Map<SetId, List<LocalDate>> walkInHoldsOn(Collection<SetId> setIds) {
		return availability.walkInHoldsFrom(setIds, today());
	}
}
