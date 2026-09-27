package ai.riviera.platform.itinerary.adapter.in;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import ai.riviera.platform.itinerary.application.PlannedMove;
import ai.riviera.platform.itinerary.application.PlannedStretch;
import ai.riviera.platform.itinerary.application.StayItinerary;
import ai.riviera.platform.itinerary.application.StayPlan;
import ai.riviera.platform.itinerary.domain.ItinerarySearch.Anchoring;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * The itinerary read on the wire: the move budget, the anchor's role ({@code START}, {@code END},
 * {@code UNANCHORABLE}; absent when none was asked or no plan exists) and the plan, {@code null} when
 * none within the budget covers the stay. Dates are ISO days, money minor units + currency (#5).
 */
record ItineraryView(int maxMoves, @JsonInclude(JsonInclude.Include.NON_NULL) String anchor, PlanView plan) {

	record PlanView(int moves, List<StretchView> stretches, List<MoveView> movesBetween, MoneyView total) {
	}

	record StretchView(long setId, String rowLabel, int positionNo, int gridX, int gridY, String tier,
			String firstDate, String lastDate, int days, MoneyView pricePerDay, MoneyView amount) {
	}

	record MoveView(String onDate, int rowsAway, int positionsAway, boolean towardSea) {
	}

	static ItineraryView of(StayItinerary itinerary) {
		return new ItineraryView(itinerary.maxMoves(),
				itinerary.anchoring() == Anchoring.NONE ? null : itinerary.anchoring().name(),
				itinerary.plan().map(ItineraryView::planOf).orElse(null));
	}

	private static PlanView planOf(StayPlan plan) {
		return new PlanView(plan.moveCount(), plan.stretches().stream().map(ItineraryView::stretchOf).toList(),
				plan.moves().stream().map(ItineraryView::moveOf).toList(), plan.total());
	}

	private static StretchView stretchOf(PlannedStretch stretch) {
		return new StretchView(stretch.setId().value(), stretch.placement().rowLabel(), stretch.placement().positionNo(),
				stretch.placement().gridX(), stretch.placement().gridY(), stretch.tier().name(),
				stretch.firstDay().toString(), stretch.lastDay().toString(), stretch.days(), stretch.pricePerDay(),
				stretch.amount());
	}

	private static MoveView moveOf(PlannedMove move) {
		return new MoveView(move.onDay().toString(), move.rowsAway(), move.positionsAway(), move.towardSea());
	}
}
