package ai.riviera.platform.booking.application.refund;

import java.time.LocalDate;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue day refund (ADR-0027): the venue's own refund of one guest's one day, at the day's own rate
 * ({@code DayShare}, invariant #10: nothing is typed), with the day released unless it is past; a lone
 * one-day booking is cancelled whole with reason {@code VENUE}. The operator acts under the venue they
 * own (#13) on the booking behind {@code code} at that venue — a stay's code names the stretch covering
 * {@code day}. Internal to {@code booking}, not cross-module {@code api/}.
 */
public interface RefundVenueDay {

	/**
	 * Refunds {@code day} of the booking behind {@code code} at {@code venueId} as {@code actor}. Venue-scoped:
	 * {@code 403} before any read; a foreign code is {@link VenueDayRefundOutcome.NotFound}. Idempotent per
	 * booking and day: a replay is {@link VenueDayRefundOutcome.DayAlreadyRefunded}.
	 */
	VenueDayRefundOutcome refundDay(OperatorId actor, VenueId venueId, String code, LocalDate day);
}
