package ai.riviera.platform.booking.application;

import java.time.Clock;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.api.BookingCancelled;
import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.booking.application.CancellationPolicy.RefundQuote;
import ai.riviera.platform.booking.application.in.CancelBooking;
import ai.riviera.platform.booking.application.in.CancelOutcome;
import ai.riviera.platform.booking.application.out.BookingRecord;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.application.out.CancelledBooking;
import ai.riviera.platform.booking.domain.BookingStatus;

/**
 * The cancel-a-booking use case (U6, issue #11). In one transaction it loads the booking by code,
 * computes the refund <strong>server-side</strong> via the shared {@link CancellationPolicy}
 * (invariant #10), transitions {@code CONFIRMED → CANCELLED} (guarded), frees the {@code (set, date)}
 * via {@link AvailabilityClaim#release} (invariant #2), and publishes {@link BookingCancelled}.
 *
 * <p><strong>The refund is not issued here.</strong> Moving real money is a side effect that must not
 * sit inside this transaction (a post-refund commit failure would diverge money from state, and a
 * Stripe round-trip would hold the booking row lock). Instead {@code BookingCancelled} carries the
 * server-computed {@code refundMinor}, and a booking-module {@code @ApplicationModuleListener}
 * ({@code BookingRefundListener}) issues the idempotency-keyed refund <em>after commit</em>,
 * registry-backed and retryable — the same reliability posture as the {@code payout} reversal
 * (invariant #8/#9). Package-private behind the {@link CancelBooking} port (invariant #11).
 */
@Service
class CancelBookingService implements CancelBooking {

	private static final Logger log = LoggerFactory.getLogger(CancelBookingService.class);

	private final Bookings bookings;
	private final CancellationPolicy cancellationPolicy;
	private final AvailabilityClaim availability;
	private final ApplicationEventPublisher events;
	private final Clock clock;

	CancelBookingService(Bookings bookings, CancellationPolicy cancellationPolicy,
			AvailabilityClaim availability, ApplicationEventPublisher events, Clock clock) {
		this.bookings = bookings;
		this.cancellationPolicy = cancellationPolicy;
		this.availability = availability;
		this.events = events;
		this.clock = clock;
	}

	@Override
	@Transactional
	public CancelOutcome cancel(String code) {
		Optional<BookingRecord> found = bookings.findByCode(code);
		if (found.isEmpty()) {
			return new CancelOutcome.NotFound();
		}
		BookingRecord booking = found.get();
		if (booking.status() != BookingStatus.CONFIRMED) {
			return new CancelOutcome.NotCancellable(booking.status());
		}

		RefundQuote quote = cancellationPolicy.quote(booking);
		long refundMinor = quote.refundMinor();

		Optional<CancelledBooking> transitioned =
				bookings.cancelConfirmed(booking.id(), clock.instant(), refundMinor);
		if (transitioned.isEmpty()) {
			// Lost a concurrent cancel race — the other cancel already released and published.
			return new CancelOutcome.NotCancellable(BookingStatus.CANCELLED);
		}
		CancelledBooking cancelled = transitioned.get();

		// Free the set (invariant #2) — synchronous, the existing booking -> availability direction.
		availability.release(cancelled.setId(), cancelled.bookingDate());

		// Announce the cancellation. After commit: BookingRefundListener issues the refund (booking
		// module) and the payout listener reverses the accrual proportionally (invariant #9).
		events.publishEvent(new BookingCancelled(new BookingId(cancelled.id()), cancelled.venueId(),
				cancelled.setId(), cancelled.bookingDate(), refundMinor, cancelled.currency()));
		log.info("cancelled booking {} and released set {} on {} (refund {} minor)", cancelled.id(),
				cancelled.setId().value(), cancelled.bookingDate(), refundMinor);

		CancelOutcome.Tier tier = quote.beforeCutoff() ? CancelOutcome.Tier.FULL
				: (refundMinor > 0 ? CancelOutcome.Tier.PARTIAL : CancelOutcome.Tier.NONE);
		return new CancelOutcome.Cancelled(refundMinor, cancelled.currency(), tier);
	}
}
