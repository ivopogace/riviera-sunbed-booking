package ai.riviera.platform.booking.application.refund;

import java.time.Clock;
import java.time.Instant;
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
import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.domain.DayShare;
import ai.riviera.platform.booking.domain.ServiceDays;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The admin weather refund, owner-asserted (invariant #13), in one transaction over every booking that
 * happened and covers {@code (venue, date)}: a checked-in day is named, not refunded; a lone one-day
 * booking is cancelled and refunded in full whatever the cutoff (#10), its day freed (#2); any other
 * row's day is refunded at its own rate ({@link DayShare}) while the booking keeps its set (ADR-0026).
 * A past date still refunds; a lost race is a 0-row no-op; the refunds run after commit.
 * Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
@Service
class WeatherRefundService implements RefundForWeather {

	private static final Logger log = LoggerFactory.getLogger(WeatherRefundService.class);
	private static final String DEFAULT_CURRENCY = "EUR"; // v1 collection currency (invariant #5)

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
		Instant now = clock.instant();

		int refundedCount = 0;
		long totalRefundedMinor = 0;
		int dayRefundCount = 0;
		long dayRefundedMinor = 0;
		String currency = DEFAULT_CURRENCY;
		List<BookingId> notRefunded = new ArrayList<>();
		for (RefundableBooking candidate : candidates) {
			if (candidate.dayRefunded()) {
				continue;
			}
			if (candidate.dayAttended()) {
				notRefunded.add(new BookingId(candidate.bookingId()));
			}
			else if (candidate.isLoneOneDay()) {
				Optional<CancelledBooking> cancelled = refundInFull(candidate, now);
				if (cancelled.isPresent()) {
					refundedCount++;
					totalRefundedMinor += candidate.amountMinor();
					currency = cancelled.get().currency();
				}
			}
			else {
				Optional<Long> refunded = refundDay(candidate, date, now);
				if (refunded.isPresent()) {
					dayRefundCount++;
					dayRefundedMinor += refunded.get();
					currency = candidate.currency();
				}
			}
		}

		log.info("weather refund for venue {} on {}: cancelled {} booking(s) refunding {} {}, refunded the day of "
				+ "{} stay(s) for {} {}, {} checked in and not refunded", venueId.value(), date, refundedCount,
				totalRefundedMinor, currency, dayRefundCount, dayRefundedMinor, currency, notRefunded.size());
		return new WeatherRefundOutcome(refundedCount, totalRefundedMinor, currency, dayRefundCount,
				dayRefundedMinor, notRefunded);
	}

	/**
	 * The lone one-day leg: the gross amount refunded regardless of the cutoff (#10) through the guarded
	 * transition, the day released and the fact published; empty when a concurrent cancel won.
	 */
	private Optional<CancelledBooking> refundInFull(RefundableBooking candidate, Instant now) {
		// A lone one-day booking has no refunded day (it never takes the day leg), so the whole amount remains.
		long refundMinor = candidate.amountMinor();
		Optional<CancelledBooking> transitioned =
				bookings.cancelForWeather(candidate.bookingId(), now, refundMinor, candidate.amountMinor());
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

	/**
	 * The day leg: the day's own rate stamped on its service-day row under the guard (unattended, not yet
	 * refunded), nothing released, the fact published; empty when a scan or an earlier refund got there first.
	 */
	private Optional<Long> refundDay(RefundableBooking candidate, LocalDate date, Instant now) {
		long refundMinor = DayShare.on(candidate.amountMinor(), candidate.bookingDate(), candidate.lastDate(), date);
		Optional<DayRefundedBooking> stamped = bookings.refundDay(candidate.bookingId(), date, refundMinor, now);
		stamped.ifPresent(refunded -> events.publishEvent(new BookingDayRefunded(new BookingId(refunded.id()),
				refunded.venueId(), refunded.setId(), date, refundMinor, refunded.currency(), refunded.stayId())));
		return stamped.map(refunded -> refundMinor);
	}
}
