package ai.riviera.platform.booking.application.request;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.events.BookingPaymentDue;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.reserve.ConfirmBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue's accept/decline on a pending request; both commands check ownership first
 * (invariant #13 → 403). Accept commits the guarded {@code PENDING_REQUEST → AWAITING_PAYMENT}
 * transition (stamps {@code accepted_at}; matches no row past the deadline, capped at sales close,
 * invariant #4), then issues the PaymentIntent outside any transaction — no lock across Stripe. A
 * failed issuance reverts to {@code PENDING_REQUEST} for a retry, replay-safe on {@code booking-<id>-pi}.
 * Decline never leaves a {@code DECLINED} booking holding its set claimed (invariant #2).
 */
@Service
class RespondToRequestService implements RespondToRequest {

	private static final Logger log = LoggerFactory.getLogger(RespondToRequestService.class);

	private final VenueOwnership ownership;
	private final Bookings bookings;
	private final RequestReleaseService declineRelease;
	private final CheckoutPort checkout;
	private final ConfirmBooking confirmBooking;
	private final ReleaseAbandonedBooking releaseAbandoned;
	private final PaymentDueAnnouncer paymentDue;
	private final RequestWindows windows;
	private final BookingCutoff cutoff;
	private final CancellationPolicy cancellationPolicy;
	private final Clock clock;

	RespondToRequestService(VenueOwnership ownership, Bookings bookings,
			RequestReleaseService declineRelease, CheckoutPort checkout, ConfirmBooking confirmBooking,
			ReleaseAbandonedBooking releaseAbandoned, PaymentDueAnnouncer paymentDue,
			RequestWindows windows, BookingCutoff cutoff, CancellationPolicy cancellationPolicy,
			Clock clock) {
		this.ownership = ownership;
		this.bookings = bookings;
		this.declineRelease = declineRelease;
		this.checkout = checkout;
		this.confirmBooking = confirmBooking;
		this.releaseAbandoned = releaseAbandoned;
		this.paymentDue = paymentDue;
		this.windows = windows;
		this.cutoff = cutoff;
		this.cancellationPolicy = cancellationPolicy;
		this.clock = clock;
	}

	@Override
	public AcceptOutcome accept(OperatorId operator, VenueId venueId, BookingId bookingId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		Instant now = clock.instant();
		Optional<AcceptedRequest> accepted =
				bookings.acceptPendingRequest(bookingId.value(), venueId, now);
		if (accepted.isEmpty()) {
			return classifyAcceptMiss(bookingId, venueId);
		}
		return collect(accepted.get());
	}

	/** The transition matched no row — read the snapshot to say why, without leaking foreigners. */
	private AcceptOutcome classifyAcceptMiss(BookingId bookingId, VenueId venueId) {
		return bookings.requestSnapshot(bookingId.value(), venueId)
				.<AcceptOutcome>map(snapshot -> {
					if (snapshot.status() != BookingStatus.PENDING_REQUEST) {
						return AcceptOutcome.Rejected.NOT_PENDING;
					}
					return AcceptOutcome.Rejected.EXPIRED;
				})
				.orElse(AcceptOutcome.Rejected.NO_SUCH_REQUEST);
	}

	/**
	 * Issue the payment request for the already-committed accept. Runs outside any transaction —
	 * the Stripe call holds no lock. Logs ids only, never the booking code (invariant #7).
	 */
	private AcceptOutcome collect(AcceptedRequest accepted) {
		PaymentOutcome payment;
		try {
			payment = checkout.pay(new BookingRef(accepted.bookingId()),
					new Money(accepted.amountMinor(), accepted.currency()));
		}
		catch (RuntimeException paymentBlewUp) {
			// Not just the typed Failed: an unexpected throw (e.g. the payment-row insert failing
			// after Stripe created the intent) would otherwise strand the booking AWAITING_PAYMENT
			// with no payment row — unpayable by the guest AND unsweepable (the abandoned sweep
			// skips bookings with no collection on record). Revert so the operator can retry; the
			// Stripe idempotency key replays the same intent, which then registers normally.
			bookings.revertAcceptToPending(accepted.bookingId());
			throw paymentBlewUp;
		}
		return switch (payment) {
			case PaymentOutcome.Succeeded ignored -> {
				// In-process stub: collected synchronously — confirm now (publishes BookingConfirmed
				// once). A confirm failure compensates like the instant flow: release, then rethrow.
				try {
					confirmBooking.confirm(accepted.bookingId(), clock.instant());
				}
				catch (RuntimeException confirmFailed) {
					releaseAbandoned.release(new BookingId(accepted.bookingId()));
					throw confirmFailed;
				}
				log.info("request {} accepted and collected synchronously (stub)", accepted.bookingId());
				yield new AcceptOutcome.Accepted(BookingStatus.CONFIRMED);
			}
			case PaymentOutcome.Pending ignored -> {
				// Real Stripe: the payment request is issued; the guest pays via the code-gated view
				// and the verified webhook confirms (invariant #8) — never this response.
				log.info("request {} accepted, payment request issued", accepted.bookingId());
				announcePaymentDue(accepted);
				yield new AcceptOutcome.Accepted(BookingStatus.AWAITING_PAYMENT);
			}
			case PaymentOutcome.Failed failed -> {
				// PI creation failed after the transition committed — revert to PENDING_REQUEST so
				// the hold survives and the operator can retry (idempotency key makes it safe).
				// Residual: after a double timeout (withLostResponseReplay) an UNREGISTERED intent may
				// exist at Stripe — inert here, because webhooks correlate via the payment table
				// and an accept retry replays the same idempotency key, registering that intent.
				boolean reverted = bookings.revertAcceptToPending(accepted.bookingId());
				log.warn("payment request for accepted booking {} failed ({}); reverted={}",
						accepted.bookingId(), failed.reason(), reverted);
				yield AcceptOutcome.Rejected.PAYMENT_INIT_FAILED;
			}
		};
	}

	/**
	 * Publishes {@link BookingPaymentDue} with the {@link RequestWindows#payDeadline} the sweep enforces.
	 * Must never fail the accept (committed, intent registered): failures are caught and logged at WARN,
	 * ids only (invariant #7) — no publication row exists for any re-drive to find.
	 */
	private void announcePaymentDue(AcceptedRequest accepted) {
		try {
			// Birth-keyed disclosure (#795): classified from created_at, never the accept instant.
			var birth = cancellationPolicy.windowAtBirth(accepted.setId(), accepted.bookingDate(),
					accepted.createdAt());
			paymentDue.announce(new BookingPaymentDue(new BookingId(accepted.bookingId()),
					accepted.venueId(), accepted.setId(), accepted.bookingDate(),
					windows.payDeadline(accepted.acceptedAt(),
							cutoff.serviceDayEndsAt(accepted.bookingDate())),
					accepted.amountMinor(), accepted.currency(),
					birth.map(CancellationPolicy.BirthTerms::window).orElse(null),
					birth.map(CancellationPolicy.BirthTerms::lateCancelRefundBps).orElse(0)));
		}
		catch (RuntimeException notAnnounced) {
			log.warn("payment-due fact not published for accepted booking {} — the accept and its payment "
					+ "request stand, but no mail will tell the guest their deadline", accepted.bookingId(),
					notAnnounced);
		}
	}

	@Override
	public DeclineOutcome decline(OperatorId operator, VenueId venueId, BookingId bookingId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (declineRelease.decline(bookingId, venueId)) {
			log.info("request {} declined by venue {}", bookingId.value(), venueId.value());
			return new DeclineOutcome.Declined();
		}
		return bookings.requestSnapshot(bookingId.value(), venueId)
				.<DeclineOutcome>map(snapshot -> DeclineOutcome.Rejected.NOT_PENDING)
				.orElse(DeclineOutcome.Rejected.NO_SUCH_REQUEST);
	}
}
