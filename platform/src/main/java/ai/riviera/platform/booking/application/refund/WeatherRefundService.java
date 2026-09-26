package ai.riviera.platform.booking.application.refund;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.domain.ServiceDays;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The admin weather refund, owner-asserted (invariant #13), in one transaction: each one-day
 * booking on {@code (venue, date)}, {@code CONFIRMED} or a swept {@code NO_SHOW}, is cancelled with a
 * full refund whatever the cutoff (invariant #10), its {@code (set, date)} freed (invariant #2) and
 * {@link BookingCancelled} published; a multi-day stay is only named on the outcome for a manual
 * refund (invariant #9). Outside the guest-cancel fence on purpose: a past date still refunds. A lost
 * race is a 0-row no-op; the refund runs after commit. Rationale: {@code RESPONSIBILITIES.md} §booking.
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
	public WeatherRefundOutcome refundForWeather(OperatorId operator, VenueId venueId, LocalDate date) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		List<RefundableBooking> candidates = bookings.findRefundableForWeather(venueId, date);

		int refundedCount = 0;
		long totalRefundedMinor = 0;
		String currency = "EUR"; // v1 collection currency (invariant #5); overwritten per cancelled row
		List<BookingId> manualRefunds = new ArrayList<>();
		for (RefundableBooking candidate : candidates) {
			if (candidate.spansSeveralDays()) {
				manualRefunds.add(new BookingId(candidate.bookingId()));
			} else {
				Optional<CancelledBooking> cancelled = refundInFull(candidate);
				if (cancelled.isPresent()) {
					refundedCount++;
					totalRefundedMinor += candidate.amountMinor();
					currency = cancelled.get().currency();
				}
			}
		}

		log.info("weather refund for venue {} on {}: cancelled {} booking(s), refunded {} {}, {} stay(s) left for a manual refund",
				venueId.value(), date, refundedCount, totalRefundedMinor, currency, manualRefunds.size());
		return new WeatherRefundOutcome(refundedCount, totalRefundedMinor, currency, manualRefunds);
	}

	/**
	 * The one-day leg: the gross amount refunded regardless of the cutoff (invariant #10) through the
	 * guarded transition, then every day of the span released and the fact published. Empty when a
	 * concurrent cancel won the race — already cancelled, so nothing is released or published.
	 */
	private Optional<CancelledBooking> refundInFull(RefundableBooking candidate) {
		long refundMinor = candidate.amountMinor();
		Optional<CancelledBooking> transitioned = bookings.cancelForWeather(
				candidate.bookingId(), clock.instant(), refundMinor);
		transitioned.ifPresent(cancelled -> {
			for (LocalDate day : ServiceDays.between(cancelled.bookingDate(), cancelled.lastDate())) {
				availability.release(cancelled.setId(), day);
			}
			events.publishEvent(new BookingCancelled(new BookingId(cancelled.id()), cancelled.venueId(),
					cancelled.setId(), cancelled.bookingDate(), refundMinor, cancelled.currency(),
					RefundReason.WEATHER, cancelled.lastDate()));
		});
		return transitioned;
	}
}
