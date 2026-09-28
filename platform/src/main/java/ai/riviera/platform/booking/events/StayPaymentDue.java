package ai.riviera.platform.booking.events;

import java.time.Instant;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * {@link BookingPaymentDue} for an accepted stay request (#1267): the guest owes the whole stay under
 * one PaymentIntent. Id-based, never the code (invariant #7). {@code payBy} is the UTC pay deadline
 * from {@code RequestWindows}; money is the stay's total in minor units + ISO currency (#5); the birth
 * window is the first stretch's, the day a stay is judged on (ADR-0024).
 */
public record StayPaymentDue(StayId stayId, Instant payBy, long amountMinor, String currency,
		CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {
}
