package ai.riviera.platform.venue.vocabulary;

/**
 * A venue's set availability on a chosen day, as a count: {@code free} of {@code total} sets are
 * not yet taken. Carried on {@link VenueSummaryView} so the discovery card can show "{free} of
 * {total} free" without the per-set layout. {@code free} is derived from the authoritative
 * {@code set_availability} table for the date (invariant #2): {@code free = total − taken}.
 * {@code total} counts all of the venue's sets across both pools (a coarse "how busy is it"
 * signal); the online-pool booking restriction (invariant #3) is applied later at the map/claim.
 */
public record AvailabilitySummary(int free, int total) {
}
