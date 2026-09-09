package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The gate's place in the shared layout write: asked once, after the venue row and every set row are
 * locked and before anything is written, with the disturbed sets and their walk-in holds; a refusing
 * gate writes nothing and spends no token; a proceeding gate is still followed by the probe, so a
 * claim it left behind is refused and never written over. The save's own cases — the shape
 * rejections, the diff, the retire-or-delete choice — stay pinned through the PUT in
 * {@code VenueAdminServiceTest}.
 */
class LayoutWriterTest {

	private static final Clock CLOCK = Clock.fixed(Instant.parse("2027-06-15T22:30:00Z"), ZoneOffset.UTC);
	private static final LocalDate TODAY_IN_TIRANE = LocalDate.of(2027, 6, 16);
	private static final VenueId VENUE = new VenueId(3);
	private static final SetId A1 = new SetId(11);
	private static final SetId A2 = new SetId(12);
	private static final SetPlacement AT_A1 = new SetPlacement("A", 1, 1, 1);
	private static final SetPlacement AT_A2 = new SetPlacement("A", 2, 2, 1);
	private static final LayoutCommand KEEP_A2_ONLY = new LayoutCommand(List.of(
			new SetCommand("A", 2, "STANDARD", Pool.ONLINE, 2000, "EUR", 2, 1)));

	private final Venues venues = mock(Venues.class);
	private final SetAvailabilityLookup availability = mock(SetAvailabilityLookup.class);
	private final BookingPresence bookings = mock(BookingPresence.class);
	private final LayoutWriter writer = new LayoutWriter(venues,
			new LiveClaims(availability, bookings, CLOCK), bookings, CLOCK);

	private void givenLockedMap() {
		when(venues.venueExists(VENUE)).thenReturn(true);
		when(venues.lockAndReadSetVersion(VENUE)).thenReturn(4L);
		when(venues.lockSetsOfVenue(VENUE)).thenReturn(List.of(new PlacedSet(A1, AT_A1), new PlacedSet(A2, AT_A2)));
	}

	@Test
	void theGateIsAskedAfterTheLocksWithTheDisturbedSetsAndTheirHoldsAndBeforeAnyWrite() {
		givenLockedMap();
		when(availability.walkInHoldsFrom(List.of(A1), TODAY_IN_TIRANE))
				.thenReturn(Map.of(A1, List.of(TODAY_IN_TIRANE.plusDays(2))));
		List<DisturbedSet> seen = new ArrayList<>();
		List<String> order = new ArrayList<>();
		when(venues.lockSetsOfVenue(VENUE)).thenAnswer(inv -> {
			order.add("lock");
			return List.of(new PlacedSet(A1, AT_A1), new PlacedSet(A2, AT_A2));
		});

		LayoutWrite outcome = writer.write(VENUE, 4, KEEP_A2_ONLY, disturbed -> {
			order.add("gate");
			seen.addAll(disturbed);
			return false;
		});

		assertEquals(LayoutWrite.Refused.REFUSED, outcome);
		assertEquals(List.of("lock", "gate"), order);
		assertEquals(List.of(new DisturbedSet(A1, AT_A1, List.of(TODAY_IN_TIRANE.plusDays(2)))), seen);
		verify(venues, never()).deleteSet(any(), any());
		verify(venues, never()).retireSet(any(), any(), any());
		verify(venues, never()).updateSet(any(), any(), any());
		verify(venues, never()).insertSets(any(), any());
		verify(venues, never()).incrementSetVersion(any());
		verify(availability, never()).nearestClaimsFrom(anyCollection(), any());
	}

	@Test
	void aProceedingGateIsStillFollowedByTheProbeWhichRefusesAClaimItLeftBehind() {
		givenLockedMap();
		when(bookings.nearestLiveBookings(List.of(A1))).thenReturn(Map.of(A1, TODAY_IN_TIRANE.plusDays(3)));

		LayoutWrite outcome = writer.write(VENUE, 4, KEEP_A2_ONLY, disturbed -> true);

		assertEquals(new LayoutWrite.SetsInUse(List.of(new BlockedSet(new PlacedSet(A1, AT_A1),
				new SetLock(A1, TODAY_IN_TIRANE.plusDays(3), null)))), outcome);
		verify(venues, never()).retireSet(any(), any(), any());
		verify(venues, never()).incrementSetVersion(any());
	}

	@Test
	void aProceedingGateWithNothingLeftBehindWritesTheDiffAndSpendsTheToken() {
		givenLockedMap();
		when(bookings.hasBookings(A1)).thenReturn(true);
		AtomicReference<List<DisturbedSet>> seen = new AtomicReference<>();

		LayoutWrite outcome = writer.write(VENUE, 4, KEEP_A2_ONLY, disturbed -> {
			seen.set(disturbed);
			return true;
		});

		assertEquals(LayoutWrite.Written.WRITTEN, outcome);
		assertEquals(List.of(new DisturbedSet(A1, AT_A1, List.of())), seen.get());
		InOrder order = inOrder(venues);
		order.verify(venues).lockAndReadSetVersion(VENUE);
		order.verify(venues).lockSetsOfVenue(VENUE);
		order.verify(venues).retireSet(VENUE, A1, CLOCK.instant());
		order.verify(venues).updateSet(VENUE, A2, KEEP_A2_ONLY.sets().getFirst());
		order.verify(venues).incrementSetVersion(VENUE);
	}

	@Test
	void aRepaintAsksTheGateWithNoDisturbedSetsAndReadsNoHolds() {
		givenLockedMap();
		LayoutCommand repaint = new LayoutCommand(List.of(
				new SetCommand("Front", 1, "PREMIUM", Pool.WALK_IN, 9900, "EUR", 1, 1),
				new SetCommand("Front", 2, "PREMIUM", Pool.ONLINE, 9900, "EUR", 2, 1)));
		AtomicReference<List<DisturbedSet>> seen = new AtomicReference<>();

		assertEquals(LayoutWrite.Written.WRITTEN, writer.write(VENUE, 4, repaint, disturbed -> {
			seen.set(disturbed);
			return true;
		}));
		assertTrue(seen.get().isEmpty());
		verify(availability, never()).walkInHoldsFrom(anyCollection(), any());
	}

	@Test
	void aStaleTokenIsRejectedBeforeTheSetLocksAndTheGate() {
		when(venues.venueExists(VENUE)).thenReturn(true);
		when(venues.lockAndReadSetVersion(VENUE)).thenReturn(5L);

		LayoutWrite outcome = writer.write(VENUE, 4, KEEP_A2_ONLY, disturbed -> {
			throw new AssertionError("the gate is never asked on a stale token");
		});

		assertEquals(new LayoutWrite.Rejected(LayoutRejection.STALE_WRITE), outcome);
		verify(venues, never()).lockSetsOfVenue(any());
	}
}
