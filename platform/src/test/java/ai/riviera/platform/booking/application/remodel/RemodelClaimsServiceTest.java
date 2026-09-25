package ai.riviera.platform.booking.application.remodel;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import org.springframework.context.ApplicationEventPublisher;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.events.BookingMoved;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.vocabulary.BlockReason;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelCommit;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.booking.vocabulary.VenueChangeFee;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.SetSpot;
import ai.riviera.platform.venue.vocabulary.Tier;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyLong;

/**
 * The classification, keyed on the claim then split by status: a frozen claim blocks; a claim with
 * a candidate free on every day of its span moves (one candidate serves one claim per day); a
 * move-only claim with none blocks naming the set to keep; beyond the floor {@code CONFIRMED}
 * refunds, {@code AWAITING_PAYMENT} releases, {@code PENDING_REQUEST} declines. The commit applies
 * all four, keeps a blocked claim where it is and receipts it, and a picture that refunds guests
 * needs the operator's typed count and reason.
 * Ownership asserts before any read (invariant #13). The clock is fixed at 10:00 Tirane on 10 Sept
 * 2026 against the 24h / 96h windows.
 */
class RemodelClaimsServiceTest {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final Clock CLOCK =
			Clock.fixed(ZonedDateTime.of(2026, 9, 10, 10, 0, 0, 0, TIRANE).toInstant(), ZoneId.of("UTC"));
	private static final OperatorId OWNER = new OperatorId(7);
	private static final VenueId VENUE = new VenueId(3);
	private static final LocalDate TOMORROW = LocalDate.of(2026, 9, 11);
	private static final LocalDate IN_THREE_DAYS = LocalDate.of(2026, 9, 13);
	private static final LocalDate IN_TEN_DAYS = LocalDate.of(2026, 9, 20);

	private static final SetSpot A1 = spot(1, "A", 1, 1, Tier.STANDARD);
	private static final SetSpot A2 = spot(2, "A", 2, 1, Tier.STANDARD);
	private static final SetSpot A3 = spot(3, "A", 3, 1, Tier.STANDARD);
	private static final SetSpot B1 = spot(11, "B", 1, 2, Tier.PREMIUM);

	private final VenueOwnership ownership = mock(VenueOwnership.class);
	private final Bookings bookings = mock(Bookings.class);
	private final SetBookingFacts facts = mock(SetBookingFacts.class);
	private final AvailabilityClaim availability = mock(AvailabilityClaim.class);
	private final RemodelReceipts receipts = mock(RemodelReceipts.class);
	private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
	private static final VenueChangeFee FEE = new VenueChangeFee(500L, "EUR");
	private final RemodelClaimsService service = new RemodelClaimsService(ownership, bookings, facts,
			new RemodelZones(new BookingCutoff(CLOCK),
					new RemodelWindows(Duration.ofHours(24), Duration.ofHours(96)), CLOCK),
			availability, receipts, events, () -> FEE, CLOCK);

	private static SetSpot spot(long id, String row, int position, int gridY, Tier tier) {
		return new SetSpot(new SetId(id), new SetPlacement(row, position, position, gridY), tier, Pool.ONLINE);
	}

	private static LiveClaim claim(long bookingId, SetSpot on, LocalDate date, BookingStatus status) {
		return new LiveClaim(bookingId, on.setId(), date, date, status, 4500, "EUR");
	}

	private static LiveClaim stay(long bookingId, SetSpot on, LocalDate first, LocalDate last, BookingStatus status) {
		return new LiveClaim(bookingId, on.setId(), first, last, status, 4500, "EUR");
	}

	private static SpotRef ref(SetSpot spot) {
		return new SpotRef(spot.setId(), spot.placement().rowLabel(), spot.placement().positionNo());
	}

	private void givenMap(List<SetSpot> active, LocalDate date, List<SetSpot> freeOn) {
		when(facts.activeSetsOf(VENUE)).thenReturn(active);
		when(facts.freeOnlineSetsOn(VENUE, date)).thenReturn(freeOn);
	}

	@Test
	void quotesTheVenueChangeFeeItIsGiven() {
		assertEquals(FEE, service.venueChangeFee(),
				"the rate is payout's, read straight off the port and never recomputed here");
	}

	@Test
	void aNonOwnerIsRefusedBeforeAnyRead() {
		doThrow(new NotVenueOwnerException(OWNER, new VenueRef(VENUE.value())))
				.when(ownership).assertOwns(OWNER, new VenueRef(VENUE.value()));

		assertThrows(NotVenueOwnerException.class,
				() -> service.classify(OWNER, VENUE, List.of(A1.setId())));
		verify(bookings, never()).findLiveOnSets(anyCollection());
	}

	@Test
	void noDisturbedSetsMeansNoReadAndNoClaims() {
		assertTrue(service.classify(OWNER, VENUE, List.of()).isEmpty());
		verify(bookings, never()).findLiveOnSets(anyCollection());
		InOrder order = inOrder(ownership);
		order.verify(ownership).assertOwns(OWNER, new VenueRef(VENUE.value()));
	}

	@Test
	void aFrozenClaimBlocksWhateverIsFree() {
		when(bookings.findLiveOnSets(Set.of(A1.setId())))
				.thenReturn(List.of(claim(100, A1, TOMORROW, BookingStatus.CONFIRMED)));
		givenMap(List.of(A1, A2, A3), TOMORROW, List.of(A3));

		List<RemodelClaim> claims = service.classify(OWNER, VENUE, List.of(A1.setId()));

		assertEquals(List.of(new RemodelClaim(new BookingId(100), ref(A1), TOMORROW, TOMORROW, 4500, "EUR",
				new RemodelOutcome.Blocked(BlockReason.FROZEN))), claims);
		verify(facts, never()).freeOnlineSetsOn(any(), any());
	}

	@Test
	void aMoveOnlyClaimMovesToTheRankedCandidateOrBlocksNamingItsSet() {
		when(bookings.findLiveOnSets(Set.of(A1.setId())))
				.thenReturn(List.of(claim(101, A1, IN_THREE_DAYS, BookingStatus.CONFIRMED)));
		givenMap(List.of(A1, A2, A3, B1), IN_THREE_DAYS, List.of(B1, A3));

		assertEquals(new RemodelOutcome.Move(ref(A3), 0, 2),
				service.classify(OWNER, VENUE, List.of(A1.setId())).getFirst().outcome());

		givenMap(List.of(A1, A2, A3, B1), IN_THREE_DAYS, List.of());
		assertEquals(new RemodelOutcome.Blocked(BlockReason.NO_MOVE_CANDIDATE),
				service.classify(OWNER, VENUE, List.of(A1.setId())).getFirst().outcome());
	}

	@Test
	void beyondTheFloorWithNoCandidateTheStatusDecides() {
		when(bookings.findLiveOnSets(Set.of(A1.setId()))).thenReturn(List.of(
				claim(102, A1, IN_TEN_DAYS, BookingStatus.CONFIRMED),
				claim(103, A1, IN_TEN_DAYS.plusDays(1), BookingStatus.AWAITING_PAYMENT),
				claim(104, A1, IN_TEN_DAYS.plusDays(2), BookingStatus.PENDING_REQUEST)));
		when(facts.activeSetsOf(VENUE)).thenReturn(List.of(A1));
		when(facts.freeOnlineSetsOn(any(), any())).thenReturn(List.of());

		List<RemodelOutcome> outcomes = service.classify(OWNER, VENUE, List.of(A1.setId())).stream()
				.map(RemodelClaim::outcome).toList();

		assertEquals(List.of(RemodelOutcome.Refund.REFUND, RemodelOutcome.Release.RELEASE,
				RemodelOutcome.Decline.DECLINE), outcomes);
	}

	@Test
	void oneCandidateServesOneClaimPerDateAndADisturbedSetIsNeverACandidate() {
		when(bookings.findLiveOnSets(Set.of(A1.setId(), A2.setId()))).thenReturn(List.of(
				claim(106, A2, IN_TEN_DAYS, BookingStatus.CONFIRMED),
				claim(105, A1, IN_TEN_DAYS, BookingStatus.CONFIRMED)));
		givenMap(List.of(A1, A2, A3, B1), IN_TEN_DAYS, List.of(A2, A3));

		List<RemodelClaim> claims = service.classify(OWNER, VENUE, List.of(A1.setId(), A2.setId()));

		assertEquals(List.of(new BookingId(105), new BookingId(106)),
				claims.stream().map(RemodelClaim::bookingId).toList());
		assertEquals(new RemodelOutcome.Move(ref(A3), 0, 2), claims.get(0).outcome());
		assertEquals(RemodelOutcome.Refund.REFUND, claims.get(1).outcome());
		verify(facts).freeOnlineSetsOn(VENUE, IN_TEN_DAYS);
	}

	@Test
	void aStayMovesOnlyToASetFreeOnEveryDayOfItsSpan() {
		LocalDate second = IN_TEN_DAYS.plusDays(1);
		LocalDate last = IN_TEN_DAYS.plusDays(2);
		when(bookings.findLiveOnSets(Set.of(A1.setId())))
				.thenReturn(List.of(stay(215, A1, IN_TEN_DAYS, last, BookingStatus.CONFIRMED)));
		givenMap(List.of(A1, A2, A3), IN_TEN_DAYS, List.of(A2, A3));
		when(facts.freeOnlineSetsOn(VENUE, second)).thenReturn(List.of(A3));
		when(facts.freeOnlineSetsOn(VENUE, last)).thenReturn(List.of(A2, A3));

		assertEquals(new RemodelOutcome.Move(ref(A3), 0, 2),
				service.classify(OWNER, VENUE, List.of(A1.setId())).getFirst().outcome(),
				"the nearer set is held on the stay's second day, so the farther one free all three days wins");
	}

	@Test
	void aMoveOnlyStayWithNoWholeSpanCandidateIsKeptAndTheCommitAnswersNormally() {
		LocalDate second = IN_THREE_DAYS.plusDays(1);
		LocalDate last = IN_THREE_DAYS.plusDays(2);
		when(bookings.findLiveOnSets(Set.of(A1.setId())))
				.thenReturn(List.of(stay(216, A1, IN_THREE_DAYS, last, BookingStatus.CONFIRMED)));
		givenMap(List.of(A1, A2), IN_THREE_DAYS, List.of(A2));
		when(facts.freeOnlineSetsOn(VENUE, second)).thenReturn(List.of());
		when(facts.freeOnlineSetsOn(VENUE, last)).thenReturn(List.of(A2));
		when(receipts.store(any())).thenReturn(RECEIPT);
		RemodelClaim kept = new RemodelClaim(new BookingId(216), ref(A1), IN_THREE_DAYS, last, 4500, "EUR",
				new RemodelOutcome.Blocked(BlockReason.NO_MOVE_CANDIDATE));

		assertEquals(List.of(kept), service.classify(OWNER, VENUE, List.of(A1.setId())));
		RemodelCommit outcome = service.commit(OWNER, VENUE, List.of(A1.setId()), previewOf(kept), RefundConfirmation.NONE);

		assertEquals(new RemodelCommit.Applied(RECEIPT, CLOCK.instant(), List.of(kept)), outcome);
		verify(availability, never()).claim(any(), any());
		verify(availability, never()).release(any(), any());
		verify(bookings, never()).moveToSet(anyLong(), any(), any(), any());
		verify(receipts).store(new NewReceipt(VENUE, OWNER, CLOCK.instant(), List.of(), List.of(), "",
				List.of(new ReceiptKept(new BookingId(216), IN_THREE_DAYS, ref(A1), BlockReason.NO_MOVE_CANDIDATE))));
	}

	@Test
	void aSetPickedForAStayLeavesEveryDayOfItsSpan() {
		LocalDate day1 = IN_TEN_DAYS.plusDays(1);
		LocalDate day2 = IN_TEN_DAYS.plusDays(2);
		LocalDate day3 = IN_TEN_DAYS.plusDays(3);
		when(bookings.findLiveOnSets(Set.of(A1.setId(), A2.setId()))).thenReturn(List.of(
				stay(218, A2, day1, day3, BookingStatus.CONFIRMED),
				stay(217, A1, IN_TEN_DAYS, day2, BookingStatus.CONFIRMED)));
		when(facts.activeSetsOf(VENUE)).thenReturn(List.of(A1, A2, A3));
		when(facts.freeOnlineSetsOn(eq(VENUE), any())).thenReturn(List.of(A3));

		List<RemodelClaim> claims = service.classify(OWNER, VENUE, List.of(A1.setId(), A2.setId()));

		assertEquals(List.of(new BookingId(217), new BookingId(218)),
				claims.stream().map(RemodelClaim::bookingId).toList());
		assertEquals(new RemodelOutcome.Move(ref(A3), 0, 2), claims.get(0).outcome());
		assertEquals(RemodelOutcome.Refund.REFUND, claims.get(1).outcome(),
				"A3 went to the stay that also holds the second one's first two days");
	}

	private static final ReceiptId RECEIPT = new ReceiptId(42);
	private static final RefundConfirmation CONFIRMED_ONE = new RefundConfirmation(1, "Re-laying row A");

	private PreviewToken previewOf(RemodelClaim... claims) {
		return PreviewToken.of(List.of(claims));
	}

	@Test
	void commitRefusesANonOwnerBeforeAnyRead() {
		doThrow(new NotVenueOwnerException(OWNER, new VenueRef(VENUE.value())))
				.when(ownership).assertOwns(OWNER, new VenueRef(VENUE.value()));

		assertThrows(NotVenueOwnerException.class,
				() -> service.commit(OWNER, VENUE, List.of(A1.setId()), previewOf(), RefundConfirmation.NONE));
		verify(bookings, never()).findLiveOnSets(anyCollection());
	}

	@Test
	void commitAnswersStaleWhenTheTokenDoesNotCoverTheFreshClaimsAndWritesNothing() {
		when(bookings.findLiveOnSets(Set.of(A1.setId())))
				.thenReturn(List.of(claim(200, A1, IN_TEN_DAYS, BookingStatus.CONFIRMED)));
		givenMap(List.of(A1, A2, A3), IN_TEN_DAYS, List.of(A2));
		RemodelClaim previewedElsewhere = new RemodelClaim(new BookingId(201), ref(A1), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR",
				new RemodelOutcome.Move(ref(A2), 0, 1));

		RemodelCommit outcome = service.commit(OWNER, VENUE, List.of(A1.setId()), previewOf(previewedElsewhere), RefundConfirmation.NONE);

		RemodelCommit.Stale stale = (RemodelCommit.Stale) outcome;
		assertEquals(List.of(new BookingId(200)), stale.fresh().stream().map(RemodelClaim::bookingId).toList());
		verify(availability, never()).claim(any(), any());
		verify(bookings, never()).moveToSet(any(Long.class), any(), any(), any());
		verify(receipts, never()).store(any());
		verify(events, never()).publishEvent(any());
	}

	@Test
	void aBlockedClaimIsKeptAndReceiptedWhileTheRestSettles() {
		RemodelClaim frozen = new RemodelClaim(new BookingId(202), ref(A1), TOMORROW, TOMORROW, 4500, "EUR",
				new RemodelOutcome.Blocked(BlockReason.FROZEN));
		RemodelClaim move = new RemodelClaim(new BookingId(203), ref(A2), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR",
				new RemodelOutcome.Move(ref(A3), 0, 1));
		when(bookings.findLiveOnSets(Set.of(A1.setId(), A2.setId()))).thenReturn(List.of(
				claim(203, A2, IN_TEN_DAYS, BookingStatus.CONFIRMED),
				claim(202, A1, TOMORROW, BookingStatus.CONFIRMED)));
		givenMap(List.of(A1, A2, A3), IN_TEN_DAYS, List.of(A3));
		when(availability.claim(A3.setId(), IN_TEN_DAYS)).thenReturn(ClaimOutcome.CLAIMED);
		when(bookings.moveToSet(203, A2.setId(), A3.setId(), CLOCK.instant())).thenReturn(true);
		when(receipts.store(any())).thenReturn(RECEIPT);

		RemodelCommit outcome = service.commit(OWNER, VENUE, List.of(A1.setId(), A2.setId()), previewOf(frozen, move),
				RefundConfirmation.NONE);

		assertEquals(new RemodelCommit.Applied(RECEIPT, CLOCK.instant(), List.of(frozen, move)), outcome);
		verify(availability, never()).claim(eq(A1.setId()), any());
		verify(availability, never()).release(eq(A1.setId()), any());
		verify(bookings, never()).moveToSet(eq(202L), any(), any(), any());
		verify(events).publishEvent(new BookingMoved(new BookingId(203), VENUE, A2.setId(), A3.setId(), IN_TEN_DAYS));
		verifyNoMoreInteractions(events);
		verify(receipts).store(new NewReceipt(VENUE, OWNER, CLOCK.instant(),
				List.of(new ReceiptMove(new BookingId(203), IN_TEN_DAYS, ref(A2), ref(A3), 0, 1)), List.of(), "",
				List.of(new ReceiptKept(new BookingId(202), TOMORROW, ref(A1), BlockReason.FROZEN))));
	}

	@Test
	void refundsAConfirmedClaimWithVenueChange() {
		RemodelClaim refund = new RemodelClaim(new BookingId(210), ref(A1), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR",
				RemodelOutcome.Refund.REFUND);
		when(bookings.findLiveOnSets(Set.of(A1.setId())))
				.thenReturn(List.of(claim(210, A1, IN_TEN_DAYS, BookingStatus.CONFIRMED)));
		givenMap(List.of(A1), IN_TEN_DAYS, List.of());
		when(bookings.cancelConfirmed(210, CLOCK.instant(), 4500, RefundReason.VENUE_CHANGE))
				.thenReturn(java.util.Optional.of(new CancelledBooking(210, VENUE, A1.setId(), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR")));
		when(receipts.store(any())).thenReturn(RECEIPT);

		RemodelCommit outcome = service.commit(OWNER, VENUE, List.of(A1.setId()), previewOf(refund), CONFIRMED_ONE);

		assertEquals(new RemodelCommit.Applied(RECEIPT, CLOCK.instant(), List.of(refund)), outcome);
		InOrder order = inOrder(bookings, availability, events, receipts);
		order.verify(bookings).cancelConfirmed(210, CLOCK.instant(), 4500, RefundReason.VENUE_CHANGE);
		order.verify(availability).release(A1.setId(), IN_TEN_DAYS);
		order.verify(events).publishEvent(new BookingCancelled(new BookingId(210), VENUE, A1.setId(), IN_TEN_DAYS,
				4500, "EUR", RefundReason.VENUE_CHANGE));
		order.verify(receipts).store(new NewReceipt(VENUE, OWNER, CLOCK.instant(), List.of(),
				List.of(new ReceiptOutcome(new BookingId(210), IN_TEN_DAYS, ref(A1), ReceiptOutcomeKind.REFUND,
						4500, "EUR", 500L)),
				"Re-laying row A", List.of()));
		verify(availability, never()).claim(any(), any());
		verify(bookings, never()).moveToSet(anyLong(), any(), any(), any());
	}

	@Test
	void releasesUnpaidAndDeclinesPendingWithoutMoney() {
		RemodelClaim release = new RemodelClaim(new BookingId(211), ref(A1), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR",
				RemodelOutcome.Release.RELEASE);
		RemodelClaim decline = new RemodelClaim(new BookingId(212), ref(A1), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR",
				RemodelOutcome.Decline.DECLINE);
		when(bookings.findLiveOnSets(Set.of(A1.setId()))).thenReturn(List.of(
				claim(211, A1, IN_TEN_DAYS, BookingStatus.AWAITING_PAYMENT),
				claim(212, A1, IN_TEN_DAYS, BookingStatus.PENDING_REQUEST)));
		givenMap(List.of(A1), IN_TEN_DAYS, List.of());
		when(bookings.cancelAwaitingPayment(211))
				.thenReturn(java.util.Optional.of(new ClaimRef(A1.setId(), IN_TEN_DAYS, IN_TEN_DAYS)));
		when(bookings.declinePending(212, VENUE))
				.thenReturn(java.util.Optional.of(new ClaimRef(A1.setId(), IN_TEN_DAYS, IN_TEN_DAYS)));
		when(receipts.store(any())).thenReturn(RECEIPT);

		RemodelCommit outcome = service.commit(OWNER, VENUE, List.of(A1.setId()), previewOf(release, decline),
				RefundConfirmation.NONE);

		assertEquals(new RemodelCommit.Applied(RECEIPT, CLOCK.instant(), List.of(release, decline)), outcome);
		verify(events).publishEvent(new BookingCancelled(new BookingId(211), VENUE, A1.setId(), IN_TEN_DAYS,
				0, "EUR", RefundReason.VENUE_CHANGE));
		verify(events).publishEvent(new BookingRequestDeclined(new BookingId(212), A1.setId(), IN_TEN_DAYS));
		verify(availability, times(2)).release(A1.setId(), IN_TEN_DAYS);
		verify(bookings, never()).cancelConfirmed(anyLong(), any(), anyLong(), any());
		verify(receipts).store(new NewReceipt(VENUE, OWNER, CLOCK.instant(), List.of(), List.of(
				new ReceiptOutcome(new BookingId(211), IN_TEN_DAYS, ref(A1), ReceiptOutcomeKind.RELEASE, 4500, "EUR", 0L),
				new ReceiptOutcome(new BookingId(212), IN_TEN_DAYS, ref(A1), ReceiptOutcomeKind.DECLINE, 4500, "EUR", 0L)),
				"", List.of()));
	}

	@Test
	void refusesACommitWhoseRefundCountOrReasonDoesNotMatch() {
		RemodelClaim first = new RemodelClaim(new BookingId(213), ref(A1), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR",
				RemodelOutcome.Refund.REFUND);
		RemodelClaim second = new RemodelClaim(new BookingId(214), ref(A1), IN_TEN_DAYS.plusDays(1), IN_TEN_DAYS.plusDays(1), 4500, "EUR",
				RemodelOutcome.Refund.REFUND);
		when(bookings.findLiveOnSets(Set.of(A1.setId()))).thenReturn(List.of(
				claim(213, A1, IN_TEN_DAYS, BookingStatus.CONFIRMED),
				claim(214, A1, IN_TEN_DAYS.plusDays(1), BookingStatus.CONFIRMED)));
		givenMap(List.of(A1), IN_TEN_DAYS, List.of());
		when(facts.freeOnlineSetsOn(VENUE, IN_TEN_DAYS.plusDays(1))).thenReturn(List.of());
		when(bookings.cancelConfirmed(eq(213L), any(), eq(4500L), eq(RefundReason.VENUE_CHANGE)))
				.thenReturn(java.util.Optional.of(new CancelledBooking(213, VENUE, A1.setId(), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR")));
		when(bookings.cancelConfirmed(eq(214L), any(), eq(4500L), eq(RefundReason.VENUE_CHANGE)))
				.thenReturn(java.util.Optional.of(
						new CancelledBooking(214, VENUE, A1.setId(), IN_TEN_DAYS.plusDays(1), IN_TEN_DAYS.plusDays(1), 4500, "EUR")));
		when(receipts.store(any())).thenReturn(RECEIPT);
		PreviewToken previewed = previewOf(first, second);

		assertEquals(new RemodelCommit.Unconfirmed(List.of(first, second)),
				service.commit(OWNER, VENUE, List.of(A1.setId()), previewed, CONFIRMED_ONE));
		assertEquals(new RemodelCommit.Unconfirmed(List.of(first, second)),
				service.commit(OWNER, VENUE, List.of(A1.setId()), previewed, new RefundConfirmation(2, "   ")));
		assertInstanceOf(RemodelCommit.Applied.class,
				service.commit(OWNER, VENUE, List.of(A1.setId()), previewed, new RefundConfirmation(2, "Re-laying")));
	}

	@Test
	void commitMovesEveryClaimClaimingTheCandidateBeforeReleasingTheOldRowAndReceiptsIt() {
		when(bookings.findLiveOnSets(Set.of(A1.setId()))).thenReturn(List.of(
				claim(203, A1, IN_TEN_DAYS, BookingStatus.CONFIRMED),
				claim(204, A1, IN_TEN_DAYS.plusDays(1), BookingStatus.PENDING_REQUEST)));
		givenMap(List.of(A1, A2, A3), IN_TEN_DAYS, List.of(A2, A3));
		when(facts.freeOnlineSetsOn(VENUE, IN_TEN_DAYS.plusDays(1))).thenReturn(List.of(A3));
		when(availability.claim(any(), any())).thenReturn(ClaimOutcome.CLAIMED);
		when(bookings.moveToSet(any(Long.class), any(), any(), any())).thenReturn(true);
		when(receipts.store(any())).thenReturn(RECEIPT);
		RemodelClaim first = new RemodelClaim(new BookingId(203), ref(A1), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR",
				new RemodelOutcome.Move(ref(A2), 0, 1));
		RemodelClaim second = new RemodelClaim(new BookingId(204), ref(A1), IN_TEN_DAYS.plusDays(1), IN_TEN_DAYS.plusDays(1), 4500, "EUR",
				new RemodelOutcome.Move(ref(A3), 0, 2));

		RemodelCommit outcome = service.commit(OWNER, VENUE, List.of(A1.setId()), previewOf(first, second), RefundConfirmation.NONE);

		assertEquals(new RemodelCommit.Applied(RECEIPT, CLOCK.instant(), List.of(first, second)), outcome);
		InOrder order = inOrder(availability, bookings, events, receipts);
		order.verify(availability).claim(A2.setId(), IN_TEN_DAYS);
		order.verify(availability).release(A1.setId(), IN_TEN_DAYS);
		order.verify(bookings).moveToSet(203, A1.setId(), A2.setId(), CLOCK.instant());
		order.verify(events).publishEvent(new BookingMoved(new BookingId(203), VENUE, A1.setId(), A2.setId(), IN_TEN_DAYS));
		order.verify(availability).claim(A3.setId(), IN_TEN_DAYS.plusDays(1));
		order.verify(availability).release(A1.setId(), IN_TEN_DAYS.plusDays(1));
		order.verify(bookings).moveToSet(204, A1.setId(), A3.setId(), CLOCK.instant());
		order.verify(receipts).store(new NewReceipt(VENUE, OWNER, CLOCK.instant(), List.of(
				new ReceiptMove(new BookingId(203), IN_TEN_DAYS, ref(A1), ref(A2), 0, 1),
				new ReceiptMove(new BookingId(204), IN_TEN_DAYS.plusDays(1), ref(A1), ref(A3), 0, 2)),
				List.of(), "", List.of()));
	}

	@Test
	void commitMovesAStayEveryDayAndPublishesItsLastDay() {
		LocalDate last = IN_TEN_DAYS.plusDays(2);
		when(bookings.findLiveOnSets(Set.of(A1.setId()))).thenReturn(List.of(
				new LiveClaim(208, A1.setId(), IN_TEN_DAYS, last, BookingStatus.CONFIRMED, 13500, "EUR")));
		when(facts.activeSetsOf(VENUE)).thenReturn(List.of(A1, A2));
		when(facts.freeOnlineSetsOn(eq(VENUE), any())).thenReturn(List.of(A2));
		when(availability.claim(any(), any())).thenReturn(ClaimOutcome.CLAIMED);
		when(bookings.moveToSet(any(Long.class), any(), any(), any())).thenReturn(true);
		when(receipts.store(any())).thenReturn(RECEIPT);
		RemodelClaim stay = new RemodelClaim(new BookingId(208), ref(A1), IN_TEN_DAYS, last, 13500, "EUR",
				new RemodelOutcome.Move(ref(A2), 0, 1));

		service.commit(OWNER, VENUE, List.of(A1.setId()), previewOf(stay), RefundConfirmation.NONE);

		for (LocalDate day : List.of(IN_TEN_DAYS, IN_TEN_DAYS.plusDays(1), last)) {
			verify(availability).claim(A2.setId(), day);
			verify(availability).release(A1.setId(), day);
		}
		verify(events).publishEvent(new BookingMoved(new BookingId(208), VENUE, A1.setId(), A2.setId(), IN_TEN_DAYS,
				last));
	}

	@Test
	void commitStillMatchesATokenWhoseMoveWasReRankedAndTolerantOfAVanishedClaim() {
		when(bookings.findLiveOnSets(Set.of(A1.setId())))
				.thenReturn(List.of(claim(205, A1, IN_TEN_DAYS, BookingStatus.CONFIRMED)));
		givenMap(List.of(A1, A2, A3), IN_TEN_DAYS, List.of(A3));
		when(availability.claim(any(), any())).thenReturn(ClaimOutcome.CLAIMED);
		when(bookings.moveToSet(any(Long.class), any(), any(), any())).thenReturn(true);
		when(receipts.store(any())).thenReturn(RECEIPT);
		PreviewToken previewed = previewOf(
				new RemodelClaim(new BookingId(205), ref(A1), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR", new RemodelOutcome.Move(ref(A2), 0, 1)),
				new RemodelClaim(new BookingId(206), ref(A1), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR", new RemodelOutcome.Move(ref(A3), 0, 2)));

		RemodelCommit outcome = service.commit(OWNER, VENUE, List.of(A1.setId()), previewed, RefundConfirmation.NONE);

		RemodelCommit.Applied applied = (RemodelCommit.Applied) outcome;
		assertEquals(new RemodelOutcome.Move(ref(A3), 0, 2), applied.settled().getFirst().outcome());
		verify(bookings).moveToSet(205, A1.setId(), A3.setId(), CLOCK.instant());
	}

	@Test
	void aCandidateNotWonUnderTheLockThrowsSoTheTransactionRollsBack() {
		when(bookings.findLiveOnSets(Set.of(A1.setId())))
				.thenReturn(List.of(claim(207, A1, IN_TEN_DAYS, BookingStatus.CONFIRMED)));
		givenMap(List.of(A1, A2), IN_TEN_DAYS, List.of(A2));
		when(availability.claim(A2.setId(), IN_TEN_DAYS)).thenReturn(ClaimOutcome.ALREADY_TAKEN);
		PreviewToken previewed = previewOf(new RemodelClaim(new BookingId(207), ref(A1), IN_TEN_DAYS, IN_TEN_DAYS, 4500, "EUR",
				new RemodelOutcome.Move(ref(A2), 0, 1)));

		assertThrows(IllegalStateException.class, () -> service.commit(OWNER, VENUE, List.of(A1.setId()), previewed, RefundConfirmation.NONE));
		verify(availability, never()).release(any(), any());
		verify(bookings, never()).moveToSet(any(Long.class), any(), any(), any());
		verify(receipts, never()).store(any());
	}
}
