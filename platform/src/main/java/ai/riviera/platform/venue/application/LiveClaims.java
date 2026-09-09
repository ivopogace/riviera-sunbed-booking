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
 * The one live-claim question a layout write and the owner's beach-map read both ask: is anyone
 * still owed this exact spot? Yes when a hold sits on a day that is today or later in
 * {@code Europe/Tirane} (invariant #6), or when a booking on the set can still be honoured —
 * which statuses those are is {@code booking}'s call, reached through {@link BookingPresence}.
 * The write guards ask it as a boolean before refusing a move or a removal; the read asks it per
 * set with the nearest dates, so the lock the canvas shows is the lock the server enforces.
 * Holding both answers here is what keeps them from drifting (ADR-0018: one rule, two callers).
 *
 * <p>A past hold freezes nothing: a past date is never claimable (reserve and staff mark both refuse
 * it), so the range the cutoff ignores is one nothing can be written into. Rationale:
 * RESPONSIBILITIES.md §venue. Callers on the write side must already hold the set row locks.
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
}
