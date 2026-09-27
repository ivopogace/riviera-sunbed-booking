package ai.riviera.platform.itinerary.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.itinerary.domain.ItinerarySearch;
import ai.riviera.platform.itinerary.domain.ItinerarySearch.Anchored;
import ai.riviera.platform.itinerary.domain.ItinerarySearch.Anchoring;
import ai.riviera.platform.itinerary.domain.ItinerarySearch.Itinerary;
import ai.riviera.platform.itinerary.domain.ItinerarySearch.Stretch;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.SetView;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.Tier;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;

/**
 * One tourist map read ({@link VenueCatalog#findVenueMap}: the visibility fence, every online set's
 * placement, price and taken days for the span, the maximum stay), then {@link ItinerarySearch} under
 * the venue's {@link MoveBudget#forVenue} budget, priced per stretch (invariant #5).
 */
@Service
class PlanItineraryService implements PlanItinerary {

	private final VenueCatalog catalog;
	private final MoveBudget budget;

	PlanItineraryService(VenueCatalog catalog, MoveBudget budget) {
		this.catalog = catalog;
		this.budget = budget;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<StayItinerary> plan(VenueId venue, StaySpan span, Optional<SetId> anchor) {
		return catalog.findVenueMap(venue, span).map(map -> plan(map, span, anchor));
	}

	private StayItinerary plan(VenueMapView map, StaySpan span, Optional<SetId> anchor) {
		Map<SetId, SetView> online = map.sets().stream().filter(set -> set.pool() == Pool.ONLINE)
				.collect(Collectors.toMap(set -> new SetId(set.id()), Function.identity()));
		anchor.filter(set -> !online.containsKey(set)).ifPresent(set -> {
			throw new IllegalArgumentException("anchorSetId " + set.value() + " is not an online set of the venue");
		});
		int maxMoves = budget.forVenue(BookingMode.valueOf(map.bookingMode()));
		if (maxMoves == 0 || map.maxStayDays() != null && span.days() > map.maxStayDays()) {
			return new StayItinerary(maxMoves, Anchoring.NONE, Optional.empty());
		}
		List<SetId> sets = List.copyOf(online.keySet());
		Map<SetId, SetPlacement> placements = online.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey,
				entry -> placementOf(entry.getValue())));
		var taken = online.entrySet().stream()
				.collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().takenDates()));
		Anchored found = anchor
				.map(set -> ItinerarySearch.planAround(span, sets, placements, taken, maxMoves, set))
				.orElseGet(() -> new Anchored(ItinerarySearch.plan(span, sets, placements, taken, maxMoves),
						Anchoring.NONE));
		// A plan with no move is one set covering the stay: booked as itself, never stitched.
		Optional<Itinerary> stitched = found.itinerary().filter(plan -> plan.moves() > 0);
		return new StayItinerary(maxMoves, stitched.isPresent() ? found.anchoring() : Anchoring.NONE,
				stitched.map(plan -> price(plan, online)));
	}

	private static StayPlan price(Itinerary itinerary, Map<SetId, SetView> sets) {
		List<PlannedStretch> stretches = new ArrayList<>();
		List<PlannedMove> moves = new ArrayList<>();
		long total = 0;
		String currency = null;
		for (Stretch stretch : itinerary.stretches()) {
			SetView set = sets.get(stretch.setId());
			int days = new StaySpan(stretch.firstDay(), stretch.lastDay()).days();
			long amount = Math.multiplyExact(set.price().minorUnits(), (long) days);
			if (currency != null && !currency.equals(set.price().currency())) {
				throw new IllegalStateException("a venue's sets are priced in one currency; found " + currency
						+ " and " + set.price().currency());
			}
			currency = set.price().currency();
			total = Math.addExact(total, amount);
			if (!stretches.isEmpty()) {
				SetPlacement from = stretches.getLast().placement();
				SetPlacement to = placementOf(set);
				moves.add(new PlannedMove(stretch.firstDay(), Math.abs(to.gridY() - from.gridY()),
						Math.abs(to.positionNo() - from.positionNo()), to.gridY() < from.gridY()));
			}
			stretches.add(new PlannedStretch(stretch.setId(), placementOf(set), Tier.valueOf(set.tier()),
					stretch.firstDay(), stretch.lastDay(), days, set.price(), new MoneyView(amount, currency)));
		}
		return new StayPlan(stretches, moves, new MoneyView(total, currency));
	}

	private static SetPlacement placementOf(SetView set) {
		return new SetPlacement(set.rowLabel(), set.positionNo(), set.gridX(), set.gridY());
	}
}
