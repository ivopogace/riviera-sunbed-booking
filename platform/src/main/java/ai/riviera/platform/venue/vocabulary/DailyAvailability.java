package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;

/**
 * One day of a venue's calendar: the civil day (a {@code LocalDate} in {@code Europe/Tirane},
 * invariant #6) and how many of its sets are free that day. The count carries the meaning
 * {@link AvailabilitySummary} already defines, rather than a second pair of ints that would have
 * to redefine it.
 *
 * <p>A snapshot, not a hold — see {@code VenueCatalog#availabilityBetween}.
 */
public record DailyAvailability(LocalDate date, AvailabilitySummary sets) {
}
