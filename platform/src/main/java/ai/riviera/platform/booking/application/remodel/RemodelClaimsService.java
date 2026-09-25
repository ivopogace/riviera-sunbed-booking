package ai.riviera.platform.booking.application.remodel;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Collection;
import java.util.Optional;
import java.util.function.Function;
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
import ai.riviera.platform.booking.domain.ServiceDays;
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
import ai.riviera.platform.booking.spi.VenueChangeFeeRate;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.booking.vocabulary.VenueChangeFee;
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
 * then a move candidate ({@link MoveRanking}) off the online sets free on every day of the claim's
 * span, less the disturbed ones and less what an earlier claim took on any of those days, then the
 * status split. The free pool is read once per distinct date and only when a claim needs it. {@link #classify} is read-only and unlocked, advisory
 * by contract; {@link #commit} runs the same classification inside the caller's transaction — the
 * edge calls it from inside the layout write, under {@code venue}'s set locks — and settles every
 * claim: a move claims the candidate's rows and re-seats the booking, a refund, release or decline
 * runs the module's own guarded transition for that status, and a blocked claim is kept where it is
 * with a receipt line and nothing else. Each ending frees every {@code (set, date)} row of the span
 * it held, and each move or ending publishes the fact the rest of the platform already reacts to, so
 * no refund, reversal or mail is driven from here. Rationale: RESPONSIBILITIES.md §booking.
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
	private final VenueChangeFeeRate feeRate;
	private final Clock clock;

	RemodelClaimsService(VenueOwnership ownership, Bookings bookings, SetBookingFacts facts,
			RemodelZones zones, AvailabilityClaim availability, RemodelReceipts receipts,
			ApplicationEventPublisher events, VenueChangeFeeRate feeRate, Clock clock) {
		this.ownership = ownership;
		this.bookings = bookings;
		this.facts = facts;
		this.zones = zones;
		this.availability = availability;
		this.receipts = receipts;
		this.events = events;
		this.feeRate = feeRate;
		this.clock = clock;
	}

	@Override
	public VenueChangeFee venueChangeFee() {
		return feeRate.perRefund();
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
		int refunds = (int) fresh.stream().filter(claim -> claim.outcome() == RemodelOutcome.Refund.REFUND).count();
		if (!authorises(confirmation, refunds)) {
			return new RemodelCommit.Unconfirmed(fresh);
		}
		Instant committedAt = clock.instant();
		long feeMinor = feeRate.perRefund().perRefundMinor();
		List<ReceiptMove> moves = new ArrayList<>();
		List<ReceiptOutcome> outcomes = new ArrayList<>();
		List<ReceiptKept> kept = new ArrayList<>();
		for (RemodelClaim claim : fresh) {
			apply(venueId, claim, committedAt, feeMinor, moves, outcomes, kept);
		}
		ReceiptId receipt = receipts.store(new NewReceipt(venueId, operator, committedAt, moves, outcomes,
				confirmation.reason(), kept));
		return new RemodelCommit.Applied(receipt, committedAt, fresh);
	}

	/** A commit that refunds nobody needs no confirmation; one that does needs the count and a reason. */
	private static boolean authorises(RefundConfirmation confirmation, int refunds) {
		return refunds == 0 || (confirmation.refundCount() == refunds && !confirmation.reason().isBlank());
	}

	/** A blocked claim is kept: its booking, its rows and its set are left exactly as they are, and the receipt says why. */
	private void apply(VenueId venueId, RemodelClaim claim, Instant committedAt, long feeMinor,
			List<ReceiptMove> moves, List<ReceiptOutcome> outcomes, List<ReceiptKept> kept) {
		switch (claim.outcome()) {
			case RemodelOutcome.Move move -> moves.add(applyMove(venueId, claim, move, committedAt));
			case RemodelOutcome.Refund ignored -> outcomes.add(applyRefund(venueId, claim, committedAt, feeMinor));
			case RemodelOutcome.Release ignored -> outcomes.add(applyRelease(venueId, claim));
			case RemodelOutcome.Decline ignored -> outcomes.add(applyDecline(venueId, claim));
			case RemodelOutcome.Blocked(var reason) ->
				kept.add(new ReceiptKept(claim.bookingId(), claim.bookingDate(), claim.from(), reason));
		}
	}

	/**
	 * Cancel a confirmed claim the remodel strands and refund it in full. The refund itself is issued
	 * after commit by the module's {@code BookingCancelled} listener (invariant #10 computed here,
	 * invariant #8 honoured there); the payout reversal and the venue-change fee ride the same fact.
	 * {@code feeMinor} is the rate quoted when this commit ran, recorded on the receipt line so it reads
	 * back what the operator confirmed rather than today's rate. It is not a pin on what the ledger
	 * charges: the fee is a stored setting both sides read when they need it, so an edit landing
	 * between this commit and the asynchronous charge is charged at the new amount, and the free exit
	 * of a moved booking charges one with no receipt line at all. Rationale: ADR-0021.
	 */
	private ReceiptOutcome applyRefund(VenueId venueId, RemodelClaim claim, Instant cancelledAt, long feeMinor) {
		CancelledBooking cancelled = bookings
				.cancelConfirmed(claim.bookingId().value(), cancelledAt, claim.amountMinor(), RefundReason.VENUE_CHANGE)
				.orElseThrow(() -> lostUnderLock(claim, "confirmed"));
		releaseSpan(cancelled.setId(), cancelled.bookingDate(), cancelled.lastDate());
		events.publishEvent(new BookingCancelled(claim.bookingId(), venueId, cancelled.setId(),
				cancelled.bookingDate(), claim.amountMinor(), claim.currency(), RefundReason.VENUE_CHANGE,
				cancelled.lastDate()));
		return outcomeOf(claim, ReceiptOutcomeKind.REFUND, feeMinor);
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
		releaseSpan(released.setId(), released.bookingDate(), released.lastDate());
		events.publishEvent(new BookingCancelled(claim.bookingId(), venueId, released.setId(),
				released.bookingDate(), 0, claim.currency(), RefundReason.VENUE_CHANGE, released.lastDate()));
		return outcomeOf(claim, ReceiptOutcomeKind.RELEASE, 0L);
	}

	/** Decline a pending request: the venue-scoped guarded transition and the fact its mail listens for. */
	private ReceiptOutcome applyDecline(VenueId venueId, RemodelClaim claim) {
		ClaimRef declined = bookings.declinePending(claim.bookingId().value(), venueId)
				.orElseThrow(() -> lostUnderLock(claim, "pending"));
		releaseSpan(declined.setId(), declined.bookingDate(), declined.lastDate());
		events.publishEvent(new BookingRequestDeclined(claim.bookingId(), declined.setId(), declined.bookingDate()));
		return outcomeOf(claim, ReceiptOutcomeKind.DECLINE, 0L);
	}

	private static ReceiptOutcome outcomeOf(RemodelClaim claim, ReceiptOutcomeKind kind, long feeMinor) {
		return new ReceiptOutcome(claim.bookingId(), claim.bookingDate(), claim.from(), kind, claim.amountMinor(),
				claim.currency(), feeMinor);
	}

	private static IllegalStateException lostUnderLock(RemodelClaim claim, String was) {
		return new IllegalStateException(
				"booking " + claim.bookingId().value() + " was no longer " + was + " under the venue lock");
	}

	/**
	 * Claim every day of the span on the candidate before releasing the old rows (invariant #2), then
	 * re-seat the booking. A day not won under the venue lock throws, and the commit's transaction
	 * moves nothing.
	 */
	private ReceiptMove applyMove(VenueId venueId, RemodelClaim claim, RemodelOutcome.Move move, Instant movedAt) {
		for (LocalDate day : ServiceDays.between(claim.bookingDate(), claim.lastDate())) {
			ClaimOutcome claimed = availability.claim(move.to().setId(), day);
			if (claimed != ClaimOutcome.CLAIMED) {
				throw new IllegalStateException("move candidate " + move.to().setId().value() + " on "
						+ day + " was not free under the venue lock: " + claimed);
			}
		}
		releaseSpan(claim.from().setId(), claim.bookingDate(), claim.lastDate());
		if (!bookings.moveToSet(claim.bookingId().value(), claim.from().setId(), move.to().setId(), movedAt)) {
			throw new IllegalStateException("booking " + claim.bookingId().value() + " left set "
					+ claim.from().setId().value() + " under the venue lock");
		}
		events.publishEvent(new BookingMoved(claim.bookingId(), venueId, claim.from().setId(), move.to().setId(),
				claim.bookingDate(), claim.lastDate()));
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
		FreePools pools = new FreePools(venueId, disturbed);
		List<RemodelClaim> result = new ArrayList<>(claims.size());
		for (LiveClaim claim : claims) {
			SetSpot from = spots.get(claim.setId());
			if (from == null) {
				throw new IllegalStateException("live booking " + claim.bookingId() + " holds a set off the active map");
			}
			RemodelOutcome outcome = outcomeOf(claim, from, zones.zoneOf(claim.bookingDate(), now), pools);
			result.add(new RemodelClaim(new BookingId(claim.bookingId()), refOf(from), claim.bookingDate(),
					claim.lastDate(), claim.amountMinor(), claim.currency(), outcome));
		}
		return List.copyOf(result);
	}

	private static RemodelOutcome outcomeOf(LiveClaim claim, SetSpot from, RemodelZone zone, FreePools pools) {
		if (zone == RemodelZone.FROZEN) {
			return new RemodelOutcome.Blocked(BlockReason.FROZEN);
		}
		List<LocalDate> span = ServiceDays.between(claim.bookingDate(), claim.lastDate());
		Optional<MoveRanking.Move> move = MoveRanking.pick(from, claim.bookingDate(), pools.freeThroughout(span));
		if (move.isPresent()) {
			pools.take(move.get().to().setId(), span);
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

	/** Every day of the span, one {@code (set, date)} row each (invariant #2). */
	private void releaseSpan(SetId setId, LocalDate firstDay, LocalDate lastDay) {
		for (LocalDate day : ServiceDays.between(firstDay, lastDay)) {
			availability.release(setId, day);
		}
	}

	private static SpotRef refOf(SetSpot spot) {
		return new SpotRef(spot.setId(), spot.placement().rowLabel(), spot.placement().positionNo());
	}

	/**
	 * One classification's free online sets per date, less the disturbed ones, each date read once and
	 * only when a claim's span reaches it; a set an earlier claim takes leaves every day of that span.
	 */
	private final class FreePools {

		private final VenueId venueId;
		private final Set<SetId> disturbed;
		private final Map<LocalDate, Map<SetId, SetSpot>> byDate = new HashMap<>();

		FreePools(VenueId venueId, Set<SetId> disturbed) {
			this.venueId = venueId;
			this.disturbed = disturbed;
		}

		/** The spots free on every day of {@code span}, dated on its first day. */
		List<FreeSpot> freeThroughout(List<LocalDate> span) {
			LocalDate first = span.getFirst();
			return on(first).values().stream()
					.filter(spot -> span.stream().allMatch(day -> on(day).containsKey(spot.setId())))
					.map(spot -> new FreeSpot(spot, first))
					.toList();
		}

		void take(SetId setId, List<LocalDate> span) {
			span.forEach(day -> on(day).remove(setId));
		}

		private Map<SetId, SetSpot> on(LocalDate date) {
			return byDate.computeIfAbsent(date, day -> facts.freeOnlineSetsOn(venueId, day).stream()
					.filter(spot -> !disturbed.contains(spot.setId()))
					.collect(Collectors.toMap(SetSpot::setId, Function.identity(), (a, b) -> a, LinkedHashMap::new)));
		}
	}
}
