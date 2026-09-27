package ai.riviera.platform.itinerary.application;

import java.time.LocalDate;

/**
 * A move between two stretches: the morning it happens and how far, in rows and positions as the
 * remodel move rule counts them; {@code towardSea} when the new row is nearer the water (a lower grid row).
 */
public record PlannedMove(LocalDate onDay, int rowsAway, int positionsAway, boolean towardSea) {
}
