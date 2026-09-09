package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;

/**
 * One day of a venue's calendar: the civil day (a {@code LocalDate} in {@code Europe/Tirane},
 * invariant #6), how many of its sets are free that day, and whether online sales for it are open
 * right now — booking's sales-window verdict (invariant #4), the on-day sales close and the season
 * closure together, the same projection the list and map carry. The count carries the meaning
 * {@link AvailabilitySummary} already defines, rather than a second pair of ints that would have
 * to redefine it.
 *
 * <p>A snapshot, not a hold — see {@code VenueCatalog#availabilityBetween}. {@code salesOpen} is
 * display only; the reserve path enforces the fence independently.
 */
public record DailyAvailability(LocalDate date, AvailabilitySummary sets, boolean salesOpen) {
}
