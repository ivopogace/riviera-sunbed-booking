package ai.riviera.platform.booking.application;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.api.BookingCancelled;
import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.booking.application.in.CancelBooking;
import ai.riviera.platform.booking.application.in.CancelOutcome;
import ai.riviera.platform.booking.application.out.BookingRecord;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.application.out.CancelledBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.RefundPolicy;
import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.RefundPort;
import ai.riviera.platform.payment.api.RefundResult;
import ai.riviera.platform.venue.api.SetBookingInfo;
import ai.riviera.platform.venue.api.VenueCatalog;

import java.time.Clock;

/**
 * The cancel-a-booking use case (U6, issue #11). Orchestrates the cancellation through sibling
 * modules' {@code api/} ports (invariant #11), all in one transaction: it loads the booking by code,
 * computes the refund <strong>server-side</strong> from the cutoff ({@link BookingCutoff},
 * {@code Europe/Tirane}) and the venue's late-cancel policy (invariant #10), transitions
 * {@code CONFIRMED → CANCELLED} (guarded), frees the {@code (set, date)} via
 * {@link AvailabilityClaim#release} (invariant #2), issues the refund via {@link RefundPort}
 * (idempotency-keyed; invariant #8/#10), and publishes {@link BookingCancelled} for {@code payout} to
 * reverse the accrual proportionally (invariant #9).
 *
 * <p>Why synchronous calls to {@code availability}/{@code payment} (not events): {@code booking}
 * already depends on both modules' {@code api/}, so a {@code BookingCancelled} they consumed would
 * cycle (the U4 release precedent). Only {@code payout} — which already depends on
 * {@code booking::api} — listens. Package-private behind the {@link CancelBooking} port.
 */
@Service
class CancelBookingService implements CancelBooking {

	private static final Logger log = LoggerFactory.getLogger(CancelBookingService.class);

	private final Bookings bookings;
	private final VenueCatalog venueCatalog;
	private final AvailabilityClaim availability;
	private final RefundPort refundPort;
	private final BookingCutoff cutoff;
	private final ApplicationEventPublisher events;
	private final Clock clock;

	CancelBookingService(Bookings bookings, VenueCatalog venueCatalog, AvailabilityClaim availability,
			RefundPort refundPort, BookingCutoff cutoff, ApplicationEventPublisher events, Clock clock) {
		this.bookings = bookings;
		this.venueCatalog = venueCatalog;
		this.availability = availability;
		this.refundPort = refundPort;
		this.cutoff = cutoff;
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

		// Refund computed server-side (invariant #10) — the caller supplies no amount.
		SetBookingInfo set = venueCatalog.setBookingInfo(booking.setId()).orElseThrow(() ->
				new IllegalStateException("no set info for set " + booking.setId().value()));
		boolean beforeCutoff = cutoff.freeCancellationOpen(set.bookingCutoff(), booking.bookingDate());
		int lateBps = beforeCutoff ? 0 : venueCatalog.lateCancelRefundBps(booking.venueId()).orElse(0);
		long refundMinor = RefundPolicy.refundMinor(booking.amountMinor(), beforeCutoff, lateBps);

		Optional<CancelledBooking> transitioned =
				bookings.cancelConfirmed(booking.id(), clock.instant(), refundMinor);
		if (transitioned.isEmpty()) {
			// Lost a concurrent cancel race — the other cancel already released/refunded/published.
			return new CancelOutcome.NotCancellable(BookingStatus.CANCELLED);
		}
		CancelledBooking cancelled = transitioned.get();

		// Free the set (invariant #2) — synchronous, the existing booking -> availability direction.
		availability.release(cancelled.setId(), cancelled.bookingDate());

		// Issue the refund server-side (invariant #8/#10), only if anything is owed. A gateway failure
		// does not abort the cancellation — the idempotency-keyed call is retried, ops follows up.
		if (refundMinor > 0) {
			RefundResult result = refundPort.refund(new BookingRef(cancelled.id()),
					new Money(refundMinor, cancelled.currency()));
			if (result instanceof RefundResult.Failed failed) {
				log.warn("refund failed for booking {} (reason={}); cancellation stands, retry is idempotent",
						cancelled.id(), failed.reason());
			}
		}

		// Announce the cancellation → payout reverses the accrual proportionally (invariant #9).
		events.publishEvent(new BookingCancelled(new BookingId(cancelled.id()), cancelled.venueId(),
				cancelled.setId(), cancelled.bookingDate(), refundMinor, cancelled.currency()));
		log.info("cancelled booking {} and released set {} on {} (refund {} minor)", cancelled.id(),
				cancelled.setId().value(), cancelled.bookingDate(), refundMinor);

		CancelOutcome.Tier tier = beforeCutoff ? CancelOutcome.Tier.FULL
				: (refundMinor > 0 ? CancelOutcome.Tier.PARTIAL : CancelOutcome.Tier.NONE);
		return new CancelOutcome.Cancelled(refundMinor, cancelled.currency(), tier);
	}
}
