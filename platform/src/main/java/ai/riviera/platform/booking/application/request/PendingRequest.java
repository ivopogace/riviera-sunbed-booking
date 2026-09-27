package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One row of the operator's pending-requests queue: the booking's technical id and <strong>no booking
 * code</strong> (the guest's bearer credential, invariant #7; accept/decline act by id). {@code guestName}
 * comes from {@code customer::api}; the set is a typed id (invariant #11); money in integer minor units
 * (invariant #5). {@code competingRequests}: other pending requests on the same set with an overlapping
 * day, which accepting this one declines (ADR-0025).
 */
public record PendingRequest(long bookingId, SetId setId, LocalDate bookingDate, String guestName,
		long amountMinor, String currency, Instant requestedAt, Instant requestExpiresAt,
		int competingRequests) {
}
