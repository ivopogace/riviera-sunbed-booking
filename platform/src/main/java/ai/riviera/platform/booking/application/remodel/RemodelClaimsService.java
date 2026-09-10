package ai.riviera.platform.booking.application.remodel;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Collection;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.domain.FreeSpot;
import ai.riviera.platform.booking.domain.MoveRanking;
import ai.riviera.platform.booking.domain.RemodelZone;
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
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetSpot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Serves {@link RemodelClaims}: assert ownership, read the live bookings on the disturbed sets, and
 * classify each in {@code (service date, booking id)} order — the zone first ({@link RemodelZones}),
 * then a move candidate ({@link MoveRanking}) off that date's free online sets less the disturbed
 * ones and less what an earlier claim took, then the status split. The free pool is read once per
 * distinct date and only when a claim needs it. {@link #classify} is read-only and unlocked, advisory
 * by contract; {@link #commit} runs the same classification inside the caller's transaction — the
 * edge calls it from inside the layout write, under {@code venue}'s set locks — and applies every
 * claim: a move claims the candidate's row and re-seats the booking, a refund, release or decline
 * runs the module's own guarded transition for that status. Each leg frees the {@code (set, date)}
 * row it held and publishes the fact the rest of the platform already reacts to, so no refund,
 * reversal or mail is driven from here. Rationale: RESPONSIBILITIES.md §booking.
 */
@Service
class RemodelClaimsService implements RemodelClaims {

	private final VenueOwnership ownership;
	private final Bookings bookings;
	private final SetBookingFacts facts;
	private final RemodelZones zones;
	private final AvailabilityClaim availability;
	private final RemodelReceipts receipts;
	private final ApplicationEventPublisher events;
	private final Clock clock;

	RemodelClaimsService(VenueOwnership ownership, Bookings bookings, SetBookingFacts facts,
			RemodelZones zones, AvailabilityClaim availability, RemodelReceipts receipts,
			ApplicationEventPublisher events, Clock clock) {
		this.ownership = ownership;
		this.bookings = bookings;
		this.facts = facts;
		this.zones = zones;
		this.availability = availability;
		this.receipts = receipts;
		this.events = events;
		this.clock = clock;
	}

	@Override
	@Transactional(readOnly = true)
	public List<RemodelClaim> classify(OperatorId operator, VenueId venueId, Collection<SetId> disturbedSets) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		return classifyOwned(venueId, disturbedSets);
	}

	@Override
	@Transactional
	public RemodelCommit commit(OperatorId operator, VenueId venueId, Collection<SetId> disturbedSets,
			PreviewToken token, RefundConfirmation confirmation) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		List<RemodelClaim> fresh = classifyOwned(venueId, disturbedSets);
		if (!token.covers(fresh)) {
			return new RemodelCommit.Stale(fresh);
		}
		if (fresh.stream().anyMatch(claim -> claim.outcome() instanceof RemodelOutcome.Blocked)) {
			return new RemodelCommit.Refused(fresh);
		}
		int refunds = (int) fresh.stream().filter(claim -> claim.outcome() == RemodelOutcome.Refund.REFUND).count();
		if (!authorises(confirmation, refunds)) {
			return new RemodelCommit.Unconfirmed(fresh);
		}
		Instant committedAt = clock.instant();
		List<ReceiptMove> moves = new ArrayList<>();
		List<ReceiptOutcome> outcomes = new ArrayList<>();
		for (RemodelClaim claim : fresh) {
			apply(venueId, claim, committedAt, moves, outcomes);
		}
		ReceiptId receipt = receipts.store(new NewReceipt(venueId, operator, committedAt, moves, outcomes,
				confirmation.reason()));
		return new RemodelCommit.Applied(receipt, committedAt, fresh);
	}

	/** A commit that refunds nobody needs no confirmation; one that does needs the count and a reason. */
	private static boolean authorises(RefundConfirmation confirmation, int refunds) {
		return refunds == 0 || (confirmation.refundCount() == refunds && !confirmation.reason().isBlank());
	}

	private void apply(VenueId venueId, RemodelClaim claim, Instant committedAt, List<ReceiptMove> moves,
			List<ReceiptOutcome> outcomes) {
		switch (claim.outcome()) {
			case RemodelOutcome.Move move -> moves.add(applyMove(venueId, claim, move, committedAt));
			case RemodelOutcome.Refund ignored -> outcomes.add(applyRefund(venueId, claim, committedAt));
			case RemodelOutcome.Release ignored -> outcomes.add(applyRelease(venueId, claim));
			case RemodelOutcome.Decline ignored -> outcomes.add(applyDecline(venueId, claim));
			case RemodelOutcome.Blocked ignored ->
				throw new IllegalStateException("a blocked claim is refused before anything is applied");
		}
	}

	/**
	 * Cancel a confirmed claim the remodel strands and refund it in full. The refund itself is issued
	 * after commit by the module's {@code BookingCancelled} listener (invariant #10 computed here,
	 * invariant #8 honoured there); the payout reversal rides the same fact.
	 */
	private ReceiptOutcome applyRefund(VenueId venueId, RemodelClaim claim, Instant cancelledAt) {
		CancelledBooking cancelled = bookings
				.cancelConfirmed(claim.bookingId().value(), cancelledAt, claim.amountMinor(), RefundReason.VENUE_CHANGE)
				.orElseThrow(() -> lostUnderLock(claim, "confirmed"));
		availability.release(cancelled.setId(), cancelled.bookingDate());
		events.publishEvent(new BookingCancelled(claim.bookingId(), venueId, cancelled.setId(),
				cancelled.bookingDate(), claim.amountMinor(), claim.currency(), RefundReason.VENUE_CHANGE));
		return outcomeOf(claim, ReceiptOutcomeKind.REFUND);
	}

	/**
	 * Release an unpaid claim: the same guarded {@code AWAITING_PAYMENT → CANCELLED} transition the
	 * payment-canceled webhook and the TTL sweep share through {@code ClaimReleaseService} — kept in
	 * step with it by hand, because that seam answers only whether it released and this leg needs the
	 * freed claim's spot for the receipt and publishes {@code BookingCancelled}, which the seam's two
	 * drivers must not. The zero refund on that event is what mails the guest without moving money —
	 * no refund is issued and no payout reversal is posted for a booking that never collected, and the
	 * module's own listener voids the intent the guest could otherwise still pay.
	 */
	private ReceiptOutcome applyRelease(VenueId venueId, RemodelClaim claim) {
		ClaimRef released = bookings.cancelAwaitingPayment(claim.bookingId().value())
				.orElseThrow(() -> lostUnderLock(claim, "awaiting payment"));
		availability.release(released.setId(), released.bookingDate());
		events.publishEvent(new BookingCancelled(claim.bookingId(), venueId, released.setId(),
				released.bookingDate(), 0, claim.currency(), RefundReason.VENUE_CHANGE));
		return outcomeOf(claim, ReceiptOutcomeKind.RELEASE);
	}

	/** Decline a pending request: the venue-scoped guarded transition and the fact its mail listens for. */
	private ReceiptOutcome applyDecline(VenueId venueId, RemodelClaim claim) {
		ClaimRef declined = bookings.declinePending(claim.bookingId().value(), venueId)
				.orElseThrow(() -> lostUnderLock(claim, "pending"));
		availability.release(declined.setId(), declined.bookingDate());
		events.publishEvent(new BookingRequestDeclined(claim.bookingId(), declined.setId(), declined.bookingDate()));
		return outcomeOf(claim, ReceiptOutcomeKind.DECLINE);
	}

	private static ReceiptOutcome outcomeOf(RemodelClaim claim, ReceiptOutcomeKind kind) {
		return new ReceiptOutcome(claim.bookingId(), claim.bookingDate(), claim.from(), kind, claim.amountMinor(),
				claim.currency());
	}

	private static IllegalStateException lostUnderLock(RemodelClaim claim, String was) {
		return new IllegalStateException(
				"booking " + claim.bookingId().value() + " was no longer " + was + " under the venue lock");
	}

	/** Claim the candidate before releasing the old row (invariant #2), then re-seat the booking. */
	private ReceiptMove applyMove(VenueId venueId, RemodelClaim claim, RemodelOutcome.Move move, Instant movedAt) {
		ClaimOutcome claimed = availability.claim(move.to().setId(), claim.bookingDate());
		if (claimed != ClaimOutcome.CLAIMED) {
			throw new IllegalStateException("move candidate " + move.to().setId().value() + " on "
					+ claim.bookingDate() + " was not free under the venue lock: " + claimed);
		}
		availability.release(claim.from().setId(), claim.bookingDate());
		if (!bookings.moveToSet(claim.bookingId().value(), claim.from().setId(), move.to().setId(), movedAt)) {
			throw new IllegalStateException("booking " + claim.bookingId().value() + " left set "
					+ claim.from().setId().value() + " under the venue lock");
		}
		events.publishEvent(new BookingMoved(claim.bookingId(), venueId, claim.from().setId(), move.to().setId(),
				claim.bookingDate()));
		return new ReceiptMove(claim.bookingId(), claim.bookingDate(), claim.from(), move.to(), move.rowsAway(),
				move.positionsAway());
	}

	private List<RemodelClaim> classifyOwned(VenueId venueId, Collection<SetId> disturbedSets) {
		Set<SetId> disturbed = Set.copyOf(disturbedSets);
		if (disturbed.isEmpty()) {
			return List.of();
		}
		List<LiveClaim> claims = bookings.findLiveOnSets(disturbed).stream()
				.sorted(Comparator.comparing(LiveClaim::bookingDate).thenComparingLong(LiveClaim::bookingId))
				.toList();
		if (claims.isEmpty()) {
			return List.of();
		}
		Map<SetId, SetSpot> spots = facts.activeSetsOf(venueId).stream()
				.collect(Collectors.toMap(SetSpot::setId, Function.identity()));
		Instant now = clock.instant();
		Map<LocalDate, List<FreeSpot>> pools = new HashMap<>();
		List<RemodelClaim> result = new ArrayList<>(claims.size());
		for (LiveClaim claim : claims) {
			SetSpot from = spots.get(claim.setId());
			if (from == null) {
				throw new IllegalStateException("live booking " + claim.bookingId() + " holds a set off the active map");
			}
			RemodelOutcome outcome = outcomeOf(claim, from, zones.zoneOf(claim.bookingDate(), now),
					() -> pools.computeIfAbsent(claim.bookingDate(), date -> freePoolOn(venueId, date, disturbed)));
			result.add(new RemodelClaim(new BookingId(claim.bookingId()), refOf(from), claim.bookingDate(),
					claim.amountMinor(), claim.currency(), outcome));
		}
		return List.copyOf(result);
	}

	private List<FreeSpot> freePoolOn(VenueId venueId, LocalDate date, Set<SetId> disturbed) {
		return facts.freeOnlineSetsOn(venueId, date).stream()
				.filter(spot -> !disturbed.contains(spot.setId()))
				.map(spot -> new FreeSpot(spot, date))
				.collect(Collectors.toCollection(ArrayList::new));
	}

	private static RemodelOutcome outcomeOf(LiveClaim claim, SetSpot from, RemodelZone zone,
			Supplier<List<FreeSpot>> freePool) {
		if (zone == RemodelZone.FROZEN) {
			return new RemodelOutcome.Blocked(BlockReason.FROZEN);
		}
		List<FreeSpot> pool = freePool.get();
		Optional<MoveRanking.Move> move = MoveRanking.pick(from, claim.bookingDate(), pool);
		if (move.isPresent()) {
			pool.removeIf(candidate -> candidate.spot().setId().equals(move.get().to().setId()));
			return new RemodelOutcome.Move(refOf(move.get().to()), move.get().rowsAway(), move.get().positionsAway());
		}
		if (zone == RemodelZone.MOVE_ONLY) {
			return new RemodelOutcome.Blocked(BlockReason.NO_MOVE_CANDIDATE);
		}
		return switch (claim.status()) {
			case CONFIRMED -> RemodelOutcome.Refund.REFUND;
			case AWAITING_PAYMENT -> RemodelOutcome.Release.RELEASE;
			case PENDING_REQUEST -> RemodelOutcome.Decline.DECLINE;
			case CANCELLED, COMPLETED, NO_SHOW, DECLINED, EXPIRED, WITHDRAWN ->
				throw new IllegalStateException("a settled booking is not a live claim: " + claim.status());
		};
	}

	private static SpotRef refOf(SetSpot spot) {
		return new SpotRef(spot.setId(), spot.placement().rowLabel(), spot.placement().positionNo());
	}
}
