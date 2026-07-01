package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * The {@code 200} response body for {@code POST /api/bookings/{code}/cancel} (U6) — the new status
 * and the server-computed refund the Angular app shows. Money travels as {@link MoneyView} (integer
 * minor units + ISO currency, invariant #5); {@code tier} is {@code FULL}/{@code PARTIAL}/{@code NONE}
 * for the refund-terms copy. Mirrors the FE {@code Cancellation} type.
 */
record CancellationView(String code, String status, MoneyView refund, String tier) {

	static CancellationView of(String code, CancelOutcome.Cancelled cancelled) {
		return new CancellationView(code, "CANCELLED",
				new MoneyView(cancelled.refundMinor(), cancelled.currency()), cancelled.tier().name());
	}
}
