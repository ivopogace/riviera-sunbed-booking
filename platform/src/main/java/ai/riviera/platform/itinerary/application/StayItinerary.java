package ai.riviera.platform.itinerary.application;

import java.util.Optional;

import ai.riviera.platform.itinerary.domain.ItinerarySearch.Anchoring;

/**
 * The itinerary read's answer for a visible venue: the move budget it was judged under, the anchor's
 * role, and the plan — empty when no plan within the budget covers the stay or the stay is longer
 * than the venue's maximum.
 */
public record StayItinerary(int maxMoves, Anchoring anchoring, Optional<StayPlan> plan) {
}
