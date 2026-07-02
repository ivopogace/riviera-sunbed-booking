package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A {@code PENDING_REQUEST} booking row as persisted — the driven-port shape behind
 * {@link PendingRequests}. Carries the {@code customerId} for the service to resolve into a
 * guest name via {@code customer::api} (the booking module never reads customer tables,
 * invariant #11).
 */
public record PendingRequestRow(long bookingId, SetId setId, LocalDate bookingDate,
		CustomerId customerId, long amountMinor, String currency, Instant requestedAt,
		Instant requestExpiresAt) {
}
