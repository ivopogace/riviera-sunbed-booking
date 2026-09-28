package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A {@code PENDING_REQUEST} booking row as persisted — the driven-port shape behind
 * {@link PendingRequests}. Carries the {@code customerId} for the service to resolve into a
 * guest name via {@code customer::api} (the booking module never reads customer tables,
 * invariant #11). {@code stayId} is the stay the row is a stretch of, null for a lone request;
 * {@code stayCompetingRequests} counts the distinct requests competing with any of that stay's stretches.
 */
public record PendingRequestRow(long bookingId, SetId setId, LocalDate bookingDate, LocalDate lastDate,
		CustomerId customerId, long amountMinor, String currency, Instant requestedAt,
		Instant requestExpiresAt, int competingRequests, StayId stayId, int stayCompetingRequests) {
}
