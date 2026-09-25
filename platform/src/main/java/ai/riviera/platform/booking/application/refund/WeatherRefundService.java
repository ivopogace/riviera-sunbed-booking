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
 * The admin weather-refund use case (U9). In one transaction it loads every booking whose span
 * covers {@code (venue, date)} — {@code CONFIRMED}, plus the {@code NO_SHOW}s the sweep made of
 * guests who stayed home — and, per one-day booking, transitions it to {@code CANCELLED} with a
 * <strong>full</strong> refund (the gross amount, ignoring the cutoff — invariant #10) and reason
 * {@code WEATHER}, frees the {@code (set, date)} via {@link AvailabilityClaim#release} (invariant
 * #2), and publishes {@link BookingCancelled}. A booking spanning several days is <em>named</em> on
 * the outcome instead: the storm is one day of a live stay, and a partial refund of a live booking
 * is what neither the single reversal per booking (invariant #9) nor {@code payment}'s one refund
 * can express, so the operator settles it by hand rather than the run skipping it silently. It reuses
 * the U6 spine exactly (ADR-0005): after commit, {@code BookingRefundListener} issues the
 * idempotency-keyed refund (invariant #8) and the {@code payout} listener posts a full {@code REVERSAL}
 * carrying the weather reason (invariant #9).
 *
 * <p><strong>Deliberately outside the guest-cancel fence.</strong> A guest may not cancel once the
 * service day has opened, but an operator may still weather-refund a past date: the storm is only
 * known afterwards, the refund is full rather than a reclaimed share, and it returns the venue's own
 * money behind an {@code assertOwns} check (invariant #13). Pinned by
 * {@code WeatherRefundServiceIT.fullRefundRegardlessOfCutoff}, which seeds on a past date, and by
 * {@code refundsSweptNoShowsOnAPastDate}, which proves the no-show sweep does not close that window.
 *
 * <p><strong>The refund is not issued here</strong> — same reasoning as {@code CancelBookingService}:
 * no Stripe round-trip inside the transaction. The per-booking transition is the guarded
 * {@link Bookings#cancelForWeather} ({@code WHERE status IN ('CONFIRMED','NO_SHOW')}), so a
 * concurrent cancel (tourist or a second weather run) makes the losing call a 0-row no-op — each booking is refunded and reversed
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
