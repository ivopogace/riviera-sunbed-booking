package ai.riviera.platform.booking.application.refund;

import java.time.LocalDate;

import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.venue.api.VenueId;

/**
 * The admin weather-refund use case (U9, issue #12) — the inbound port the operator-gated web adapter
 * calls to issue full refunds for a washed-out venue+date (invariant #10: weather → full refund
 * <strong>regardless of the cutoff</strong>, admin-triggered in v1). Every {@code CONFIRMED} booking
 * for the day is cancelled with reason {@code WEATHER}; the set is freed (invariant #2) and the refund
 * + payout reversal flow through the existing cancellation spine. The caller supplies only the
 * {@code venueId} + {@code date}; the (full) refund amount is computed server-side. Internal to
 * {@code booking} ({@code application.in}), not cross-module {@code api/}.
 */
public interface RefundForWeather {

	/**
	 * Cancel and fully refund every {@code CONFIRMED} booking for {@code venueId} on {@code date};
	 * returns the {@link WeatherRefundOutcome} (count + total). Idempotent at the booking level — a
	 * re-run refunds nothing already cancelled (the guarded transition is a no-op).
	 *
	 * <p>Moves real money, so it is venue-scoped: the implementation asserts {@code operator} owns
	 * {@code venueId} first (invariant #13) and returns {@code 403} on a mismatch, before any refund.
	 */
	WeatherRefundOutcome refundForWeather(OperatorId operator, VenueId venueId, LocalDate date);
}
