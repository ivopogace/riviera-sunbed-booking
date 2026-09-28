package ai.riviera.platform.booking.application.refund;

import java.time.LocalDate;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The operator weather-refund use case for a washed-out venue+date (invariant #10: weather → the
 * day's money back <strong>regardless of the cutoff</strong>). A lone one-day booking is cancelled
 * with reason {@code WEATHER}, freeing the set (#2), its refund and reversal on the cancellation
 * spine; a stay has the day refunded on its own and goes on (ADR-0026). The caller supplies only
 * {@code venueId} + {@code date}; every amount is computed server-side. Internal to {@code booking},
 * not cross-module {@code api/}.
 */
public interface RefundForWeather {

	/**
	 * Refunds {@code date} for every booking that happened and covers it: a lone one-day booking cancelled
	 * whole, a stay's day refunded and the stay kept, a checked-in day kept and named on the {@link
	 * WeatherRefundOutcome}. Idempotent per booking and day. Venue-scoped (#13): {@code 403} before any refund.
	 */
	WeatherRefundOutcome refundForWeather(OperatorId operator, VenueId venueId, LocalDate date);
}
