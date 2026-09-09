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

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.domain.FreeSpot;
import ai.riviera.platform.booking.domain.MoveRanking;
import ai.riviera.platform.booking.domain.RemodelZone;
import ai.riviera.platform.booking.vocabulary.BlockReason;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
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
 * distinct date and only when a claim needs it. Read-only, unlocked: advisory by contract.
 */
@Service
class RemodelClaimsService implements RemodelClaims {

	private final VenueOwnership ownership;
	private final Bookings bookings;
	private final SetBookingFacts facts;
	private final RemodelZones zones;
	private final Clock clock;

	RemodelClaimsService(VenueOwnership ownership, Bookings bookings, SetBookingFacts facts,
			RemodelZones zones, Clock clock) {
		this.ownership = ownership;
		this.bookings = bookings;
		this.facts = facts;
		this.zones = zones;
		this.clock = clock;
	}

	@Override
	@Transactional(readOnly = true)
	public List<RemodelClaim> classify(OperatorId operator, VenueId venueId, Collection<SetId> disturbedSets) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
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
