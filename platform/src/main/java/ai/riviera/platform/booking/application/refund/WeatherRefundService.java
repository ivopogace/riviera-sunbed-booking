package ai.riviera.platform.booking.application.refund;

import java.time.Clock;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.api.BookingCancelled;
import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.booking.api.RefundReason;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.api.VenueRef;
import ai.riviera.platform.venue.api.VenueId;

/**
 * The admin weather-refund use case (U9, issue #12). In one transaction it loads every
 * {@code CONFIRMED} booking for {@code (venue, date)} and, per booking, transitions
 * {@code CONFIRMED → CANCELLED} with a <strong>full</strong> refund (the gross amount, ignoring the
 * cutoff — invariant #10) and reason {@code WEATHER}, frees the {@code (set, date)} via
 * {@link AvailabilityClaim#release} (invariant #2), and publishes {@link BookingCancelled}. It reuses
 * the U6 spine exactly (ADR-0005): after commit, {@code BookingRefundListener} issues the
 * idempotency-keyed refund (invariant #8) and the {@code payout} listener posts a full {@code REVERSAL}
 * carrying the weather reason (invariant #9).
 *
 * <p><strong>The refund is not issued here</strong> — same reasoning as {@code CancelBookingService}:
 * no Stripe round-trip inside the transaction. The per-booking transition is the guarded
 * {@link Bookings#cancelConfirmed} ({@code WHERE status='CONFIRMED'}), so a concurrent cancel (tourist
 * or a second weather run) makes the losing call a 0-row no-op — each booking is refunded and reversed
 * exactly once. Package-private behind the {@link RefundForWeather} port (invariant #11).
 */
@Service
class WeatherRefundService implements RefundForWeather {

	private static final Logger log = LoggerFactory.getLogger(WeatherRefundService.class);

	private final Bookings bookings;
	private final AvailabilityClaim availability;
	private final ApplicationEventPublisher events;
	private final Clock clock;
	private final VenueOwnership ownership;

	WeatherRefundService(Bookings bookings, AvailabilityClaim availability,
			ApplicationEventPublisher events, Clock clock, VenueOwnership ownership) {
		this.bookings = bookings;
		this.availability = availability;
		this.events = events;
		this.clock = clock;
		this.ownership = ownership;
	}

	@Override
	@Transactional
	public WeatherRefundOutcome refundForWeather(OperatorId operator, VenueId venueId,
			java.time.LocalDate date) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		List<RefundableBooking> candidates = bookings.findConfirmedForWeatherRefund(venueId, date);

		int refundedCount = 0;
		long totalRefundedMinor = 0;
		String currency = "EUR"; // v1 collection currency (invariant #5); overwritten per cancelled row
		for (RefundableBooking candidate : candidates) {
			// Full refund regardless of cutoff (invariant #10): the refund is the gross amount paid.
			long refundMinor = candidate.amountMinor();
			var transitioned = bookings.cancelConfirmed(
					candidate.bookingId(), clock.instant(), refundMinor, RefundReason.WEATHER);
			if (transitioned.isEmpty()) {
				// Lost a concurrent cancel race for this booking — already cancelled, nothing to do.
				continue;
			}
			CancelledBooking cancelled = transitioned.get();
			availability.release(cancelled.setId(), cancelled.bookingDate());
			events.publishEvent(new BookingCancelled(new BookingId(cancelled.id()), cancelled.venueId(),
					cancelled.setId(), cancelled.bookingDate(), refundMinor, cancelled.currency(),
					RefundReason.WEATHER));
			refundedCount++;
			totalRefundedMinor += refundMinor;
			currency = cancelled.currency();
		}

		log.info("weather refund for venue {} on {}: cancelled {} booking(s), refunded {} {}",
				venueId.value(), date, refundedCount, totalRefundedMinor, currency);
		return new WeatherRefundOutcome(refundedCount, totalRefundedMinor, currency);
	}
}
