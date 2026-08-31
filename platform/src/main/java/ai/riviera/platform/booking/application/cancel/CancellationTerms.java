package ai.riviera.platform.booking.application.cancel;

import java.time.Instant;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;

/**
 * The pre-reserve cancellation-terms quote (#795): the {@link CancellationWindow} a booking created
 * now would be born in, the free-cancellation deadline as a UTC {@link Instant} (invariant #6), and
 * the venue's late share in basis points (0 outside LATE). Returned by
 * {@link QuoteCancellationTerms}; module-internal value, public for the module's own adapters.
 */
public record CancellationTerms(CancellationWindow window, Instant freeCancellationEndsAt,
		int lateCancelRefundBps) {
}
