package ai.riviera.platform.booking.application.request;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.Bookings;
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
 * The venue's accept/decline decision on a pending request (issue #98). The ownership check is
 * the first act of both commands — in the application service, so no driving adapter can bypass
 * it (invariant #13).
 *
 * <p><strong>Accept = payment-request-on-accept</strong> (riviera-stripe-payments; NOT
 * auth-and-capture): the guarded {@code PENDING_REQUEST → AWAITING_PAYMENT} transition commits
 * first (its own atomic statement, stamping {@code accepted_at} — the guest pay-window clock),
 * then the PaymentIntent is created OUTSIDE any transaction (the same no-lock-across-Stripe
 * ordering as {@code CreateBookingService}, risk R-3). From {@code AWAITING_PAYMENT} onward the
 * flow is byte-for-byte the Instant spine: verified webhook → confirm → {@code BookingConfirmed}.
 * The transition's {@code request_expires_at > now} guard means an accept after the deadline
 * (or after bookings closed — the deadline is capped at the cutoff, invariant #4) matches no row.
 *
 * <p><strong>Failure compensation:</strong> a failed (or thrown) PaymentIntent issuance reverts
 * the booking to {@code PENDING_REQUEST} rather than releasing the hold: the venue said yes, so
 * the operator retries; the Stripe idempotency key ({@code booking-<id>-pi}) makes the retry
 * replay-safe. No webhook can race the revert — only a REGISTERED intent is correlatable (a
 * double-timeout residual at Stripe stays unregistered and inert until the retry re-adopts it). A confirm failure on the stub path
 * compensates like the instant flow (release, rethrow).
 *
 * <p><strong>Decline</strong> delegates transition + hold release to {@link Bookings} and
 * {@code AvailabilityClaim} via the transactional {@link RequestReleaseService} seam, mirroring
 * {@code ClaimReleaseService} — a booking is never left {@code DECLINED} with its set claimed
 * (invariant #2). Package-private; the public seam is {@link RespondToRequest} (invariant #11).
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
	private final Clock clock;

	RespondToRequestService(VenueOwnership ownership, Bookings bookings,
			RequestReleaseService declineRelease, CheckoutPort checkout, ConfirmBooking confirmBooking,
			ReleaseAbandonedBooking releaseAbandoned, Clock clock) {
		this.ownership = ownership;
		this.bookings = bookings;
		this.declineRelease = declineRelease;
		this.checkout = checkout;
		this.confirmBooking = confirmBooking;
		this.releaseAbandoned = releaseAbandoned;
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
				yield new AcceptOutcome.Accepted(BookingStatus.AWAITING_PAYMENT);
			}
			case PaymentOutcome.Failed failed -> {
				// PI creation failed after the transition committed — revert to PENDING_REQUEST so
				// the hold survives and the operator can retry (idempotency key makes it safe).
				// Residual: after a double timeout (createWithRecovery) an UNREGISTERED intent may
				// exist at Stripe — inert here, because webhooks correlate via the payment table
				// and an accept retry replays the same idempotency key, registering that intent.
				boolean reverted = bookings.revertAcceptToPending(accepted.bookingId());
				log.warn("payment request for accepted booking {} failed ({}); reverted={}",
						accepted.bookingId(), failed.reason(), reverted);
				yield AcceptOutcome.Rejected.PAYMENT_INIT_FAILED;
			}
		};
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
