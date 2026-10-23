package ai.riviera.platform.venue.vocabulary;

/**
 * A venue's set availability on a chosen day, as a count: {@code free} of {@code total} sets are
 * not yet taken. Carried on {@link VenueSummaryView} for the discovery card's "{free} of {total}
 * free", and one per day on {@link DailyAvailability}. {@code free = total − taken}, derived from
 * the authoritative {@code set_availability} table (invariant #2). {@code total} counts both pools
 * (a coarse "how busy" signal); invariant #3 applies at map/claim and in {@code sellsOnline}.
 */
public record AvailabilitySummary(int free, int total) {
}
