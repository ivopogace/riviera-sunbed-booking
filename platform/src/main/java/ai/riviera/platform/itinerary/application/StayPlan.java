package ai.riviera.platform.itinerary.application;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.MoneyView;

/** A priced plan covering a stay: its stretches in order, the move between each pair, and the total (invariant #5). */
public record StayPlan(List<PlannedStretch> stretches, List<PlannedMove> moves, MoneyView total) {

	public StayPlan {
		stretches = List.copyOf(stretches);
		moves = List.copyOf(moves);
	}

	public int moveCount() {
		return moves.size();
	}
}
