package ai.riviera.platform.booking.application.refund;

import java.time.LocalDate;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The admin weather-refund use case (U9): full refunds for a washed-out venue+date (invariant #10:
 * weather → full refund <strong>regardless of the cutoff</strong>, admin-triggered in v1). Every
 * refundable booking for the day is cancelled with reason {@code WEATHER}, freeing the set
 * (invariant #2); refund and payout reversal flow through the cancellation spine. The caller
 * supplies only {@code venueId} + {@code date}; the amount is computed server-side. Internal to
 * {@code booking}, not cross-module {@code api/}.
 */
public interface RefundForWeather {

	/**
	 * Cancels and fully refunds every one-day {@code CONFIRMED}/{@code NO_SHOW} booking on
	 * {@code date}; multi-day stays are left alone, named on the {@link WeatherRefundOutcome}.
	 * Idempotent per booking. Venue-scoped (#13): {@code 403} before any refund on a mismatch.
	 */
	WeatherRefundOutcome refundForWeather(OperatorId operator, VenueId venueId, LocalDate date);
}
