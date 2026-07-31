package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.domain.BookingStatus;

/**
 * The {@code 200} response body for {@code POST /api/bookings/{code}/withdraw} (issue #123) — the
 * new terminal status, and nothing else.
 *
 * <p>Deliberately narrower than its cancel sibling {@link CancellationView}: a withdrawn request
 * never had a PaymentIntent (payment-request-on-accept), so there is no refund amount and no tier to
 * report. Mirrors the FE {@code Withdrawal} type.
 */
record WithdrawalView(String code, String status) {

	static WithdrawalView of(String code) {
		return new WithdrawalView(code, BookingStatus.WITHDRAWN.name());
	}
}
