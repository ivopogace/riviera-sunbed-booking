package ai.riviera.platform.booking.application.reserve;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A stay every stretch of which is confirmed, with its first stretch's birth facts: the window a stay
 * is judged on is its first day's (ADR-0024), so {@code StayConfirmed} discloses that one.
 */
public record ConfirmedStay(StayId stayId, SetId firstSetId, LocalDate firstDate, Instant createdAt) {
}
