package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;
import ai.riviera.platform.venue.api.RemodelGate;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.LayoutCommitOutcome;
import ai.riviera.platform.venue.vocabulary.LayoutPreview;
import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import ai.riviera.platform.venue.vocabulary.LockedSet;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.PreviewRejection;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The dry run: ownership first, then the token, then the diff against the active map with no lock
 * and no write; only the removed and repositioned sets are answered, each with its walk-in holds
 * from today in {@code Europe/Tirane}. The commit: ownership first, then the shared writer with the
 * caller's gate, its four answers mapped one to one.
 */
class BeachMapRemodelServiceTest {

	private static final Clock CLOCK = Clock.fixed(Instant.parse("2027-06-15T22:30:00Z"), ZoneOffset.UTC);
	private static final LocalDate TODAY_IN_TIRANE = LocalDate.of(2027, 6, 16);
	private static final OperatorId OWNER = new OperatorId(7);
	private static final VenueId VENUE = new VenueId(3);
	private static final SetId A1 = new SetId(11);
	private static final SetId A2 = new SetId(12);
	private static final SetId A3 = new SetId(13);

	private final VenueOwnership ownership = mock(VenueOwnership.class);
	private final Venues venues = mock(Venues.class);
	private final SetAvailabilityLookup availability = mock(SetAvailabilityLookup.class);
	private final LayoutWriter writer = mock(LayoutWriter.class);
	private final org.springframework.transaction.PlatformTransactionManager transactions =
			mock(org.springframework.transaction.PlatformTransactionManager.class);
	private final org.springframework.transaction.support.SimpleTransactionStatus status =
			new org.springframework.transaction.support.SimpleTransactionStatus();
	private final BeachMapRemodelService service = new BeachMapRemodelService(ownership, venues,
			new LiveClaims(availability, mock(BookingPresence.class), CLOCK), writer, transactions);

	{
		when(transactions.getTransaction(any())).thenReturn(status);
	}

	private static PlacedSet stored(SetId id, String row, int position, int x, int y) {
		return new PlacedSet(id, new SetPlacement(row, position, x, y));
	}

	private void givenMap(long setVersion, PlacedSet... sets) {
		when(venues.setVersionOf(VENUE)).thenReturn(OptionalLong.of(setVersion));
		when(venues.placedSetsOf(VENUE)).thenReturn(List.of(sets));
	}

	@Test
	void aNonOwnerIsRefusedBeforeAnyRead() {
		doThrow(new NotVenueOwnerException(OWNER, new VenueRef(VENUE.value())))
				.when(ownership).assertOwns(OWNER, new VenueRef(VENUE.value()));

		assertThrows(NotVenueOwnerException.class,
				() -> service.preview(OWNER, VENUE, 0, List.of(new SetPlacement("A", 1, 1, 1))));
		verify(venues, never()).setVersionOf(any());
	}

	@Test
	void anUnknownVenueAndAStaleTokenAreRejectedWithoutADiff() {
		when(venues.setVersionOf(VENUE)).thenReturn(OptionalLong.empty());
		assertEquals(new LayoutPreview.Rejected(PreviewRejection.NO_SUCH_VENUE),
				service.preview(OWNER, VENUE, 0, List.of(new SetPlacement("A", 1, 1, 1))));

		when(venues.setVersionOf(VENUE)).thenReturn(OptionalLong.of(4));
		assertEquals(new LayoutPreview.Rejected(PreviewRejection.STALE_WRITE),
				service.preview(OWNER, VENUE, 3, List.of(new SetPlacement("A", 1, 1, 1))));
		verify(venues, never()).placedSetsOf(any());
	}

	@Test
	void aRepaintInPlaceDisturbsNothingAndAsksNoHolds() {
		givenMap(4, stored(A1, "A", 1, 1, 1), stored(A2, "A", 2, 2, 1));

		LayoutPreview preview = service.preview(OWNER, VENUE, 4,
				List.of(new SetPlacement("Front", 1, 1, 1), new SetPlacement("Front", 2, 2, 1)));

		assertEquals(new LayoutPreview.Disturbing(List.of()), preview);
		verify(availability, never()).walkInHoldsFrom(anyCollection(), any());
		verify(venues, never()).lockSetsOfVenue(any());
	}

	@Test
	void theRemovedAndRepositionedSetsAreAnsweredWithTheirWalkInHoldsFromToday() {
		givenMap(4, stored(A1, "A", 1, 1, 1), stored(A2, "A", 2, 2, 1), stored(A3, "A", 3, 3, 1));
		when(availability.walkInHoldsFrom(List.of(A2, A3), TODAY_IN_TIRANE))
				.thenReturn(Map.of(A3, List.of(TODAY_IN_TIRANE.plusDays(2))));

		LayoutPreview preview = service.preview(OWNER, VENUE, 4,
				List.of(new SetPlacement("A", 1, 1, 1), new SetPlacement("A", 9, 2, 1)));

		assertEquals(new LayoutPreview.Disturbing(List.of(
				new DisturbedSet(A2, new SetPlacement("A", 2, 2, 1), List.of()),
				new DisturbedSet(A3, new SetPlacement("A", 3, 3, 1), List.of(TODAY_IN_TIRANE.plusDays(2))))),
				preview);
	}

	private static final List<LayoutCell> CELLS = List.of(
			new LayoutCell("A", 1, "STANDARD", Pool.ONLINE, 2000, "EUR", 1, 1));
	private static final RemodelGate PROCEED = disturbed -> true;

	@Test
	void commitRefusesANonOwnerBeforeTheWriter() {
		doThrow(new NotVenueOwnerException(OWNER, new VenueRef(VENUE.value())))
				.when(ownership).assertOwns(OWNER, new VenueRef(VENUE.value()));

		assertThrows(NotVenueOwnerException.class, () -> service.commit(OWNER, VENUE, 4, CELLS, PROCEED));
		verify(writer, never()).write(any(), org.mockito.ArgumentMatchers.anyLong(), any(), any());
	}

	@Test
	void commitHandsTheCellsAndTheGateToTheWriterAndMapsEveryAnswer() {
		when(writer.write(VENUE, 4, LayoutCommand.of(CELLS), PROCEED)).thenReturn(LayoutWrite.Written.WRITTEN);
		assertEquals(LayoutCommitOutcome.Committed.COMMITTED, service.commit(OWNER, VENUE, 4, CELLS, PROCEED));
		assertEquals(false, status.isRollbackOnly(), "a written layout commits");

		when(writer.write(VENUE, 4, LayoutCommand.of(CELLS), PROCEED)).thenReturn(LayoutWrite.Refused.REFUSED);
		assertEquals(LayoutCommitOutcome.Refused.REFUSED, service.commit(OWNER, VENUE, 4, CELLS, PROCEED));

		when(writer.write(VENUE, 4, LayoutCommand.of(CELLS), PROCEED))
				.thenReturn(new LayoutWrite.Rejected(LayoutRejection.STALE_WRITE));
		assertEquals(new LayoutCommitOutcome.Rejected(LayoutRejection.STALE_WRITE),
				service.commit(OWNER, VENUE, 4, CELLS, PROCEED));

		SetPlacement at = new SetPlacement("A", 2, 2, 1);
		when(writer.write(VENUE, 4, LayoutCommand.of(CELLS), PROCEED)).thenReturn(new LayoutWrite.SetsInUse(
				List.of(new BlockedSet(new PlacedSet(A2, at), new SetLock(A2, TODAY_IN_TIRANE.plusDays(3), null)))));
		assertEquals(new LayoutCommitOutcome.SetsInUse(List.of(new LockedSet(A2, at, TODAY_IN_TIRANE.plusDays(3), null))),
				service.commit(OWNER, VENUE, 4, CELLS, PROCEED));
		assertEquals(true, status.isRollbackOnly(),
				"anything but a written layout rolls the unit back, so a move the gate made never survives");
	}
}
