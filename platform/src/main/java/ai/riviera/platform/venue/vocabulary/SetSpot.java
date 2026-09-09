package ai.riviera.platform.venue.vocabulary;

/**
 * An active set as a spot a booking could hold or move to: its id, where it sits, its tier and its
 * pool. The remodel move rule ranks spots by placement and refuses a worse tier or a walk-in
 * spot; answered by {@code SetBookingFacts} for a venue's active map and for its free online
 * sets on a date.
 */
public record SetSpot(SetId setId, SetPlacement placement, Tier tier, Pool pool) {
}
