package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The one live-claim predicate the layout-write guards and the owner's beach-map read share: a hold
 * dated today or later in {@code Europe/Tirane}, or a booking that can still be honoured. The
 * per-set lock facts the read answers must agree with the boolean the guards ask, set by set —
 * a cell the canvas shows free is one the server would let move.
 */
class LiveClaimsTest {

	/** 22:30Z on the 15th is already the 16th in Tirane — a UTC-date regression (invariant #6) fails here. */
	private static final Clock CLOCK = Clock.fixed(Instant.parse("2027-06-15T22:30:00Z"), ZoneOffset.UTC);
	private static final LocalDate TODAY_IN_TIRANE = LocalDate.of(2027, 6, 16);

	private static final SetId HELD_TODAY = new SetId(1L);
	private static final SetId HELD_YESTERDAY = new SetId(2L);
	private static final SetId BOOKED = new SetId(3L);
	private static final SetId FREE = new SetId(4L);
	private static final SetId HELD_AND_BOOKED = new SetId(5L);

	private final FakeAvailability availability = new FakeAvailability();
	private final FakeBookings bookings = new FakeBookings();
	private final LiveClaims claims = new LiveClaims(availability, bookings, CLOCK);

	@Test
	void todayIsTheTiraneDate() {
		assertEquals(TODAY_IN_TIRANE, claims.today());
	}

	@Test
	void locksOnAnswersTheNearestHoldAndBookingPerSetAndSkipsFreeSets() {
		availability.holdOn.put(HELD_TODAY, TODAY_IN_TIRANE);
		availability.holdOn.put(HELD_YESTERDAY, TODAY_IN_TIRANE.minusDays(1));
		bookings.liveOn.put(BOOKED, TODAY_IN_TIRANE.plusDays(3));
		availability.holdOn.put(HELD_AND_BOOKED, TODAY_IN_TIRANE.plusDays(1));
		bookings.liveOn.put(HELD_AND_BOOKED, TODAY_IN_TIRANE.plusDays(1));

		Map<SetId, SetLock> locks = claims.locksOn(
				List.of(HELD_TODAY, HELD_YESTERDAY, BOOKED, FREE, HELD_AND_BOOKED));

		assertEquals(Map.of(
				HELD_TODAY, new SetLock(HELD_TODAY, null, TODAY_IN_TIRANE),
				BOOKED, new SetLock(BOOKED, TODAY_IN_TIRANE.plusDays(3), null),
				HELD_AND_BOOKED, new SetLock(HELD_AND_BOOKED, TODAY_IN_TIRANE.plusDays(1),
						TODAY_IN_TIRANE.plusDays(1))),
				locks, "a past hold and a free set carry no lock; both dates ride when both facts hold");
		assertEquals(TODAY_IN_TIRANE, availability.askedFrom, "the hold cutoff is today in Tirane, inclusive");
	}

	@Test
	void theGuardAgreesWithTheReadSetBySet() {
		availability.holdOn.put(HELD_TODAY, TODAY_IN_TIRANE);
		availability.holdOn.put(HELD_YESTERDAY, TODAY_IN_TIRANE.minusDays(1));
		bookings.liveOn.put(BOOKED, TODAY_IN_TIRANE.plusDays(3));

		assertTrue(claims.isLivelyClaimed(HELD_TODAY));
		assertFalse(claims.isLivelyClaimed(HELD_YESTERDAY));
		assertTrue(claims.isLivelyClaimed(BOOKED));
		assertFalse(claims.isLivelyClaimed(FREE));
		assertTrue(claims.hasLiveHold(List.of(HELD_YESTERDAY, HELD_TODAY)));
		assertFalse(claims.hasLiveHold(List.of(HELD_YESTERDAY, BOOKED)),
				"the hold arm alone ignores bookings — the replace guard pairs it with the venue-wide booking probe");
	}

	@Test
	void anEmptySetListLocksNothing() {
		assertEquals(Map.of(), claims.locksOn(List.of()));
	}

	/** Mirrors the SQL: a hold is a day per set, {@code >= from} inclusive. */
	private static final class FakeAvailability implements SetAvailabilityLookup {
		final Map<SetId, LocalDate> holdOn = new HashMap<>();
		LocalDate askedFrom;

		@Override
		public Set<SetId> takenOn(Collection<SetId> setIds, LocalDate date) {
			return Set.of();
		}

		@Override
		public boolean anyClaimsFrom(Collection<SetId> setIds, LocalDate from) {
			return !nearestClaimsFrom(setIds, from).isEmpty();
		}

		@Override
		public Map<SetId, LocalDate> nearestClaimsFrom(Collection<SetId> setIds, LocalDate from) {
			askedFrom = from;
			return setIds.stream()
					.filter(id -> holdOn.containsKey(id) && !holdOn.get(id).isBefore(from))
					.collect(Collectors.toMap(id -> id, holdOn::get));
		}

		@Override
		public Map<SetId, String> statesOn(Collection<SetId> setIds, LocalDate date) {
			return Map.of();
		}

		@Override
		public Map<LocalDate, Integer> takenCountsBetween(Collection<SetId> setIds, LocalDate from, LocalDate to) {
			return Map.of();
		}
	}

	/** Mirrors the SQL: a live booking is a day per set, whatever the day. */
	private static final class FakeBookings implements BookingPresence {
		final Map<SetId, LocalDate> liveOn = new HashMap<>();

		@Override
		public boolean hasBookings(SetId setId) {
			return liveOn.containsKey(setId);
		}

		@Override
		public boolean hasLiveBookings(SetId setId) {
			return liveOn.containsKey(setId);
		}

		@Override
		public ai.riviera.platform.venue.vocabulary.LiveBookingCounts liveBookingsFrom(VenueId venueId, LocalDate from) {
			return new ai.riviera.platform.venue.vocabulary.LiveBookingCounts(0, 0);
		}

		@Override
		public Map<SetId, LocalDate> nearestLiveBookings(Collection<SetId> setIds) {
			return setIds.stream()
					.filter(liveOn::containsKey)
					.collect(Collectors.toMap(id -> id, liveOn::get));
		}
	}
}
