package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;

import ai.riviera.platform.booking.application.cancel.CancellationPolicy;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;

/**
 * Wire shape of the pre-reserve terms read (#795): the window a booking created now would be born
 * in, the free-cancellation deadline as a UTC instant (formatted client-side in
 * {@code Europe/Tirane}, invariant #6), and the venue's late share in basis points.
 */
record CancellationTermsView(CancellationWindow window, Instant freeCancellationEndsAt,
		int lateCancelRefundBps) {

	static CancellationTermsView of(CancellationPolicy.CancellationTerms terms) {
		return new CancellationTermsView(terms.window(), terms.freeCancellationEndsAt(),
				terms.lateCancelRefundBps());
	}
}
