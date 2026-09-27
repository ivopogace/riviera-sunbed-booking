package ai.riviera.platform.itinerary.application;

/**
 * The move budget (design D13): the most moves a stitched plan may ask of a guest, from
 * {@code riviera.itinerary.max-switches}; three is the default and the ceiling, past it a venue
 * cannot host the stay. Bound by {@code ItineraryProperties}.
 */
public record MoveBudget(int maxMoves) {
}
