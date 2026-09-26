package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy.RefundQuote;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.BookingTransition;
import ai.riviera.platform.booking.domain.ServiceDays;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;

/**
 * The guest cancel (U6), in one transaction: quote the refund server-side ({@link CancellationPolicy},
 * invariant #10), guarded {@code CONFIRMED → CANCELLED}, free every {@code (set, date)} of the span
 * (invariant #2), publish {@link BookingCancelled}. Never refund in here; {@code BookingRefundListener}
 * refunds after commit. Who may cancel is {@link BookingTransition#CANCEL_BY_GUEST}, never restated;
 * a spent day ({@code NO_SHOW}, {@code COMPLETED}, a closed quote window) answers {@code WindowClosed}
 * before any write. Rationale: {@code RESPONSIBILITIES.md} §booking.
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
		if (booking.status() == BookingStatus.NO_SHOW || booking.status() == BookingStatus.COMPLETED) {
			return new CancelOutcome.WindowClosed();
		}
		if (!BookingTransition.CANCEL_BY_GUEST.admits(booking.status())) {
			return new CancelOutcome.NotCancellable(booking.status());
		}

		RefundQuote quote = cancellationPolicy.quote(booking);
		if (!quote.cancellationOpen()) {
			return new CancelOutcome.WindowClosed();
		}
		long refundMinor = quote.refundMinor();

		Optional<CancelledBooking> transitioned = bookings.cancelConfirmed(
				booking.id(), clock.instant(), refundMinor, quote.reason());
		if (transitioned.isEmpty()) {
			// Lost a concurrent cancel race — the other cancel already released and published.
			return new CancelOutcome.NotCancellable(BookingStatus.CANCELLED);
		}
		CancelledBooking cancelled = transitioned.get();

		// Free every day of the span (invariant #2) — synchronous, the existing booking -> availability direction.
		for (var day : ServiceDays.between(cancelled.bookingDate(), cancelled.lastDate())) {
			availability.release(cancelled.setId(), day);
		}

		// Announce the cancellation. After commit: BookingRefundListener issues the refund (booking
		// module) and the payout listener reverses the accrual proportionally (invariant #9).
		events.publishEvent(new BookingCancelled(new BookingId(cancelled.id()), cancelled.venueId(),
				cancelled.setId(), cancelled.bookingDate(), refundMinor, cancelled.currency(),
				quote.reason(), cancelled.lastDate()));
		log.info("cancelled booking {} and released set {} from {} to {} (refund {} minor)", cancelled.id(),
				cancelled.setId().value(), cancelled.bookingDate(), cancelled.lastDate(), refundMinor);

		CancelOutcome.Tier tier = tierFor(quote.window(), refundMinor, cancelled.amountMinor());
		return new CancelOutcome.Cancelled(refundMinor, cancelled.currency(), tier);
	}

	/**
	 * The tier reported for a cancellation that happened (ADR-0005): {@code FULL} in the {@code FREE}
	 * window; in {@code LATE}, whatever the refund implies (the free exit refunds it all). {@code CLOSED}
	 * is fenced out before the transition, so reaching it is a bug and throws.
	 */
	private static CancelOutcome.Tier tierFor(CancellationWindow window, long refundMinor, long amountMinor) {
		return switch (window) {
			case FREE -> CancelOutcome.Tier.FULL;
			case LATE -> lateTier(refundMinor, amountMinor);
			case CLOSED -> throw new IllegalStateException("a closed window cannot be cancelled");
		};
	}

	/** The LATE tier the refund amount implies: the whole amount is FULL (the free exit), part is PARTIAL, nothing is NONE. */
	private static CancelOutcome.Tier lateTier(long refundMinor, long amountMinor) {
		if (refundMinor >= amountMinor) {
			return CancelOutcome.Tier.FULL;
		}
		return refundMinor > 0 ? CancelOutcome.Tier.PARTIAL : CancelOutcome.Tier.NONE;
	}
}
