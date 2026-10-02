package ai.riviera.platform.booking.application.remodel;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.HashSet;
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
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.FreeSpot;
import ai.riviera.platform.booking.domain.MoveRanking;
import ai.riviera.platform.booking.domain.RemodelZone;
import ai.riviera.platform.booking.domain.ServiceDays;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.events.BookingMoved;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.StayCancelled;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.booking.events.StayRequestDeclined;
import ai.riviera.platform.booking.vocabulary.BlockReason;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
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
 * Serves {@link RemodelClaims}, owner-asserted: classifies the live bookings on the disturbed sets
 * in {@code (service date, id)} order, by zone ({@link RemodelZones}), then a move candidate
 * ({@link MoveRanking}) free on every day of the span and untaken by an earlier claim, then status;
 * a released stretch takes its stay's other unpaid stretches into the picture (#1292). {@link #classify}
 * is read-only and advisory; {@link #commit} re-classifies inside {@code venue}'s locked layout write,
 * settles each claim and frees every {@code (set, date)} it ends. Rationale: {@code RESPONSIBILITIES.md} §booking.
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
		return classifyOwned(venueId, disturbedSets).claims();
	}

	@Override
	@Transactional
	public RemodelCommit commit(OperatorId operator, VenueId venueId, Collection<SetId> disturbedSets,
			PreviewToken token, RefundConfirmation confirmation) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		Classification fresh = classifyOwned(venueId, disturbedSets);
		if (!token.covers(fresh.claims())) {
			return new RemodelCommit.Stale(fresh.claims());
		}
		int refunds = (int) fresh.claims().stream().filter(claim -> claim.outcome() == RemodelOutcome.Refund.REFUND).count();
		if (!authorises(confirmation, refunds)) {
			return new RemodelCommit.Unconfirmed(fresh.claims());
		}
		Instant committedAt = clock.instant();
		long feeMinor = feeRate.perRefund().perRefundMinor();
		Settled settled = new Settled(new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new HashSet<>());
		for (RemodelClaim claim : fresh.claims()) {
			apply(venueId, claim, fresh.stayEndingWith(claim), committedAt, feeMinor, settled);
		}
		for (StayId stay : fresh.staysEndingWhole()) {
			events.publishEvent(new StayCancelled(stay, 0, fresh.currencyOf().get(stay), RefundReason.VENUE_CHANGE));
		}
		ReceiptId receipt = receipts.store(new NewReceipt(venueId, operator, committedAt, settled.moves(),
				settled.outcomes(), confirmation.reason(), settled.kept()));
		return new RemodelCommit.Applied(receipt, committedAt, fresh.claims());
	}

	/** A commit that refunds nobody needs no confirmation; one that does needs the count and a reason. */
	private static boolean authorises(RefundConfirmation confirmation, int refunds) {
		return refunds == 0 || (confirmation.refundCount() == refunds && !confirmation.reason().isBlank());
	}

	/** A blocked claim is kept: its booking, its rows and its set are left exactly as they are, and the receipt says why. */
	private void apply(VenueId venueId, RemodelClaim claim, StayId stayEndingWith, Instant committedAt, long feeMinor,
			Settled settled) {
		switch (claim.outcome()) {
			case RemodelOutcome.Move move -> settled.moves().add(applyMove(venueId, claim, move, committedAt));
			case RemodelOutcome.Refund ignored ->
				settled.outcomes().add(applyRefund(venueId, claim, committedAt, feeMinor));
			case RemodelOutcome.Release ignored -> settled.outcomes().add(applyRelease(venueId, claim, stayEndingWith));
			case RemodelOutcome.Decline ignored ->
				settled.outcomes().add(applyDecline(venueId, claim, settled.declinedStays()));
			case RemodelOutcome.Blocked(var reason) ->
				settled.kept().add(new ReceiptKept(claim.bookingId(), claim.bookingDate(), claim.from(), reason));
		}
	}

	/** What one commit settled so far: the receipt's lines, and the stay requests it already declined whole. */
	private record Settled(List<ReceiptMove> moves, List<ReceiptOutcome> outcomes, List<ReceiptKept> kept,
			Set<StayId> declinedStays) {
	}

	/**
	 * Cancels a stranded confirmed claim with a {@code VENUE_CHANGE} refund of all that remains, read under its row lock
	 * (a day refunded meanwhile is counted, #1281); refund, reversal and fee drain after commit off {@code BookingCancelled}.
	 * {@code feeMinor}, the quoted rate, is recorded on the receipt line, not what the ledger charges (ADR-0021).
	 */
	private ReceiptOutcome applyRefund(VenueId venueId, RemodelClaim claim, Instant cancelledAt, long feeMinor) {
		long remainingMinor = bookings.lockRemainingMinor(claim.bookingId().value());
		CancelledBooking cancelled = bookings
				.cancelConfirmed(claim.bookingId().value(), cancelledAt, remainingMinor, RefundReason.VENUE_CHANGE,
						remainingMinor)
				.orElseThrow(() -> lostUnderLock(claim, "confirmed"));
		releaseHeld(cancelled.id(), cancelled.setId(), cancelled.bookingDate(), cancelled.lastDate());
		events.publishEvent(new BookingCancelled(claim.bookingId(), venueId, cancelled.setId(),
				cancelled.bookingDate(), remainingMinor, claim.currency(), RefundReason.VENUE_CHANGE,
				cancelled.lastDate()));
		return new ReceiptOutcome(claim.bookingId(), claim.bookingDate(), claim.from(), ReceiptOutcomeKind.REFUND,
				remainingMinor, claim.currency(), feeMinor);
	}

	/**
	 * Releases an unpaid claim by the guarded transition {@code ClaimReleaseService} runs, kept in step by hand: this
	 * leg needs the freed spot and publishes {@code BookingCancelled} (zero refund, no money; a listener voids the
	 * intent), stamped with {@code stayEndingWith} when the stay ends whole so the stay's one mail covers it.
	 */
	private ReceiptOutcome applyRelease(VenueId venueId, RemodelClaim claim, StayId stayEndingWith) {
		ClaimRef released = bookings.cancelAwaitingPayment(claim.bookingId().value())
				.orElseThrow(() -> lostUnderLock(claim, "awaiting payment"));
		releaseSpan(released.setId(), released.bookingDate(), released.lastDate());
		events.publishEvent(new BookingCancelled(claim.bookingId(), venueId, released.setId(),
				released.bookingDate(), 0, claim.currency(), RefundReason.VENUE_CHANGE, released.lastDate(),
				stayEndingWith));
		return outcomeOf(claim, ReceiptOutcomeKind.RELEASE, 0L);
	}

	/**
	 * Decline a pending request: the guarded transition and its fact; it held nothing to release (ADR-0025).
	 * A stay request's stretch declines its whole stay, once per commit however many stretches it disturbs (#1267).
	 */
	private ReceiptOutcome applyDecline(VenueId venueId, RemodelClaim claim, Set<StayId> declinedStays) {
		Optional<ClaimRef> lone = bookings.declinePending(claim.bookingId().value(), venueId, DeclineReason.SET_UNAVAILABLE);
		if (lone.isPresent()) {
			events.publishEvent(new BookingRequestDeclined(claim.bookingId(), lone.get().setId(), lone.get().bookingDate(),
					lone.get().lastDate(), DeclineReason.SET_UNAVAILABLE));
			return outcomeOf(claim, ReceiptOutcomeKind.DECLINE, 0L);
		}
		StayId stay = bookings.stayOf(claim.bookingId().value()).orElseThrow(() -> lostUnderLock(claim, "pending"));
		if (declinedStays.add(stay)) {
			if (!bookings.declinePendingStay(stay, venueId, DeclineReason.SET_UNAVAILABLE)) {
				throw lostUnderLock(claim, "pending");
			}
			events.publishEvent(new StayRequestDeclined(stay, DeclineReason.SET_UNAVAILABLE));
		}
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
	 * Claim every day the booking still holds, read under its row lock, on the candidate before releasing the old
	 * rows (#2; a venue-released day is neither claimed nor freed, ADR-0027, #1281), then re-seat the booking. A day
	 * not won under the venue lock throws, and the commit's transaction moves nothing.
	 */
	private ReceiptMove applyMove(VenueId venueId, RemodelClaim claim, RemodelOutcome.Move move, Instant movedAt) {
		bookings.lockById(claim.bookingId().value());
		List<LocalDate> held = ServiceDays.held(claim.bookingDate(), claim.lastDate(),
				bookings.findReleasedDays(claim.bookingId().value()));
		for (LocalDate day : held) {
			ClaimOutcome claimed = availability.claim(move.to().setId(), day);
			if (claimed != ClaimOutcome.CLAIMED) {
				throw new IllegalStateException("move candidate " + move.to().setId().value() + " on "
						+ day + " was not free under the venue lock: " + claimed);
			}
		}
		for (LocalDate day : held) {
			availability.release(claim.from().setId(), day);
		}
		if (!bookings.moveToSet(claim.bookingId().value(), claim.from().setId(), move.to().setId(), movedAt)) {
			throw new IllegalStateException("booking " + claim.bookingId().value() + " left set "
					+ claim.from().setId().value() + " under the venue lock");
		}
		events.publishEvent(new BookingMoved(claim.bookingId(), venueId, claim.from().setId(), move.to().setId(),
				claim.bookingDate(), claim.lastDate()));
		return new ReceiptMove(claim.bookingId(), claim.bookingDate(), claim.from(), move.to(), move.rowsAway(),
				move.positionsAway());
	}

	/**
	 * The picture, iterated to a fixpoint over the stays a release ends (#1292): a released stretch brings its
	 * stay's other {@code AWAITING_PAYMENT} stretches in as releases, which take no candidate, so each pass
	 * re-allocates the free sets among the rest until no new stay joins.
	 */
	private Classification classifyOwned(VenueId venueId, Collection<SetId> disturbedSets) {
		Set<SetId> disturbed = Set.copyOf(disturbedSets);
		if (disturbed.isEmpty()) {
			return Classification.EMPTY;
		}
		List<LiveClaim> onSets = bookings.findLiveOnSets(disturbed);
		if (onSets.isEmpty()) {
			return Classification.EMPTY;
		}
		Map<SetId, SetSpot> spots = facts.activeSetsOf(venueId).stream()
				.collect(Collectors.toMap(SetSpot::setId, Function.identity()));
		Instant now = clock.instant();
		FreeSets free = new FreeSets(venueId, disturbed);
		Map<StayId, List<LiveClaim>> releasedStays = new HashMap<>();
		while (true) {
			List<Classified> classified = classifyPass(withUnpaidStretchesOf(onSets, releasedStays.values()), spots, now,
					new FreePools(free), releasedStays.keySet());
			List<StayId> joining = classified.stream()
					.filter(each -> each.claim().outcome() == RemodelOutcome.Release.RELEASE && each.live().stayId() != null)
					.map(each -> each.live().stayId())
					.filter(stay -> !releasedStays.containsKey(stay))
					.distinct()
					.toList();
			if (joining.isEmpty()) {
				return Classification.of(classified, releasedStays);
			}
			joining.forEach(stay -> releasedStays.put(stay, bookings.findLiveStretchesOf(stay)));
		}
	}

	/** One pass over the claims in order: an unpaid stretch of a released stay is a release, every other claim is decided. */
	private List<Classified> classifyPass(List<LiveClaim> claims, Map<SetId, SetSpot> spots, Instant now, FreePools pools,
			Set<StayId> releasedStays) {
		List<Classified> classified = new ArrayList<>(claims.size());
		for (LiveClaim claim : claims) {
			SetSpot from = spots.get(claim.setId());
			if (from == null) {
				throw new IllegalStateException("live booking " + claim.bookingId() + " holds a set off the active map");
			}
			RemodelOutcome outcome = releasedStays.contains(claim.stayId()) && claim.status() == BookingStatus.AWAITING_PAYMENT
					? RemodelOutcome.Release.RELEASE
					: outcomeOf(claim, from, zones.zoneOf(claim.bookingDate(), now), pools);
			classified.add(new Classified(claim, new RemodelClaim(new BookingId(claim.bookingId()), refOf(from),
					claim.bookingDate(), claim.lastDate(), claim.remainingMinor(), claim.currency(), outcome)));
		}
		return classified;
	}

	/** The disturbed claims plus the unpaid stretches of the released stays, each once, in {@code (service date, id)} order. */
	private static List<LiveClaim> withUnpaidStretchesOf(List<LiveClaim> onSets, Collection<List<LiveClaim>> stays) {
		Map<Long, LiveClaim> byId = new LinkedHashMap<>();
		onSets.forEach(claim -> byId.put(claim.bookingId(), claim));
		stays.stream().flatMap(List::stream)
				.filter(stretch -> stretch.status() == BookingStatus.AWAITING_PAYMENT)
				.forEach(stretch -> byId.putIfAbsent(stretch.bookingId(), stretch));
		return byId.values().stream()
				.sorted(Comparator.comparing(LiveClaim::bookingDate).thenComparingLong(LiveClaim::bookingId))
				.toList();
	}

	/** One claim as read and as answered. */
	private record Classified(LiveClaim live, RemodelClaim claim) {
	}

	/**
	 * One classification: the claims in order, which stay each released stretch belongs to, and the stays every
	 * live stretch of which is released here, so the commit stamps their stretches and mails each stay once.
	 */
	private record Classification(List<RemodelClaim> claims, Map<BookingId, StayId> stayOf, Set<StayId> staysEndingWhole,
			Map<StayId, String> currencyOf) {

		static final Classification EMPTY = new Classification(List.of(), Map.of(), Set.of(), Map.of());

		static Classification of(List<Classified> classified, Map<StayId, List<LiveClaim>> releasedStays) {
			Map<BookingId, StayId> stayOf = new HashMap<>();
			Map<StayId, String> currencyOf = new HashMap<>();
			for (Classified each : classified) {
				if (each.claim().outcome() == RemodelOutcome.Release.RELEASE && each.live().stayId() != null) {
					stayOf.put(each.claim().bookingId(), each.live().stayId());
					currencyOf.putIfAbsent(each.live().stayId(), each.live().currency());
				}
			}
			Set<StayId> whole = releasedStays.entrySet().stream()
					.filter(entry -> entry.getValue().stream().allMatch(s -> s.status() == BookingStatus.AWAITING_PAYMENT))
					.map(Map.Entry::getKey)
					.collect(Collectors.toSet());
			return new Classification(classified.stream().map(Classified::claim).toList(), stayOf, whole, currencyOf);
		}

		/** The stay this released stretch ends with, or {@code null} when the stay goes on or the claim is no release. */
		StayId stayEndingWith(RemodelClaim claim) {
			StayId stay = stayOf.get(claim.bookingId());
			return stay != null && staysEndingWhole.contains(stay) ? stay : null;
		}
	}

	private static RemodelOutcome outcomeOf(LiveClaim claim, SetSpot from, RemodelZone zone, FreePools pools) {
		if (claim.status() == BookingStatus.PENDING_REQUEST) {
			return RemodelOutcome.Decline.DECLINE;
		}
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
			case PENDING_REQUEST, CANCELLED, COMPLETED, NO_SHOW, DECLINED, EXPIRED, WITHDRAWN ->
				throw new IllegalStateException("a settled booking is not a live claim: " + claim.status());
		};
	}

	/** Every day of an unpaid claim's span, one {@code (set, date)} row each (invariant #2). */
	private void releaseSpan(SetId setId, LocalDate firstDay, LocalDate lastDay) {
		for (LocalDate day : ServiceDays.between(firstDay, lastDay)) {
			availability.release(setId, day);
		}
	}

	/** Every day a live booking still holds: its span less the days the venue released (#2, ADR-0027). */
	private void releaseHeld(long bookingId, SetId setId, LocalDate firstDay, LocalDate lastDay) {
		for (LocalDate day : ServiceDays.held(firstDay, lastDay, bookings.findReleasedDays(bookingId))) {
			availability.release(setId, day);
		}
	}

	private static SpotRef refOf(SetSpot spot) {
		return new SpotRef(spot.setId(), spot.placement().rowLabel(), spot.placement().positionNo());
	}

	/** One classification's free online sets per date, less the disturbed ones, each date read once across its passes. */
	private final class FreeSets {

		private final VenueId venueId;
		private final Set<SetId> disturbed;
		private final Map<LocalDate, List<SetSpot>> byDate = new HashMap<>();

		FreeSets(VenueId venueId, Set<SetId> disturbed) {
			this.venueId = venueId;
			this.disturbed = disturbed;
		}

		List<SetSpot> on(LocalDate date) {
			return byDate.computeIfAbsent(date, day -> facts.freeOnlineSetsOn(venueId, day).stream()
					.filter(spot -> !disturbed.contains(spot.setId()))
					.toList());
		}
	}

	/**
	 * One pass's pools over {@link FreeSets}, read only when a claim's span reaches a date; a set an earlier
	 * claim takes leaves every day of that span.
	 */
	private static final class FreePools {

		private final FreeSets free;
		private final Map<LocalDate, Map<SetId, SetSpot>> byDate = new HashMap<>();

		FreePools(FreeSets free) {
			this.free = free;
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
			return byDate.computeIfAbsent(date, day -> free.on(day).stream()
					.collect(Collectors.toMap(SetSpot::setId, Function.identity(), (a, b) -> a, LinkedHashMap::new)));
		}
	}
}
