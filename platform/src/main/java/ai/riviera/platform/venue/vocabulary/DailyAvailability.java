package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;

/**
 * One day of a venue's calendar: the civil day ({@code Europe/Tirane}, invariant #6), its free-set
 * count (meaning as in {@link AvailabilitySummary}), and whether online sales for it are open right
 * now — booking's sales-window verdict (invariant #4): the on-day sales close and the season
 * closure together, the same projection the list and map carry.
 *
 * <p>A snapshot, not a hold — see {@code VenueCatalog#availabilityBetween}. {@code salesOpen} is
 * display only; the reserve path enforces the fence independently.
 */
public record DailyAvailability(LocalDate date, AvailabilitySummary sets, boolean salesOpen) {
}
