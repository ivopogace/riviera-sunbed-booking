package ai.riviera.platform.booking.application.request;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.events.BookingPaymentDue;
import ai.riviera.platform.booking.events.StayPaymentDue;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;
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
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue's accept/decline on a pending request; both commands check ownership first
 * (invariant #13 → 403). Accept commits {@link RequestClaimService}'s claim-and-transition (the request
 * holds nothing until then, ADR-0025; no row past the deadline, invariant #4), then issues the
 * PaymentIntent outside any transaction — no lock across Stripe. A failed issuance reverts to
 * {@code PENDING_REQUEST} and gives the claim back, replay-safe on {@code booking-<id>-pi}.
 */
@Service
class RespondToRequestService implements RespondToRequest {

	private static final Logger log = LoggerFactory.getLogger(RespondToRequestService.class);

	private final VenueOwnership ownership;
	private final Bookings bookings;
	private final RequestTerminationService termination;
	private final RequestClaimService claims;
	private final CheckoutPort checkout;
	private final ConfirmBooking confirmBooking;
	private final ReleaseAbandonedBooking releaseAbandoned;
	private final PaymentDueAnnouncer paymentDue;
	private final RequestWindows windows;
	private final BookingCutoff cutoff;
	private final CancellationPolicy cancellationPolicy;
	private final Clock clock;

	RespondToRequestService(VenueOwnership ownership, Bookings bookings,
			RequestTerminationService termination, RequestClaimService claims, CheckoutPort checkout,
			ConfirmBooking confirmBooking,
			ReleaseAbandonedBooking releaseAbandoned, PaymentDueAnnouncer paymentDue,
			RequestWindows windows, BookingCutoff cutoff, CancellationPolicy cancellationPolicy,
			Clock clock) {
		this.ownership = ownership;
		this.bookings = bookings;
		this.termination = termination;
		this.claims = claims;
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
		return switch (claims.accept(bookingId, venueId, now)) {
			case AcceptClaim.Accepted(AcceptedRequest accepted) -> collect(accepted);
			case AcceptClaim.SetUnavailable ignored -> AcceptOutcome.Rejected.SET_UNAVAILABLE;
			case AcceptClaim.Missed ignored -> classifyAcceptMiss(bookingId, venueId);
		};
	}

	@Override
	public AcceptOutcome acceptStay(OperatorId operator, VenueId venueId, StayId stayId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		return switch (claims.acceptStay(stayId, venueId, clock.instant())) {
			case StayAcceptClaim.Accepted(List<AcceptedRequest> stretches) -> collectStay(stayId, stretches);
			case StayAcceptClaim.SetUnavailable ignored -> AcceptOutcome.Rejected.SET_UNAVAILABLE;
			case StayAcceptClaim.Missed ignored -> classifyMiss(bookings.stayRequestSnapshot(stayId, venueId));
		};
	}

	/** The transition matched no row — read the snapshot to say why, without leaking foreigners. */
	private AcceptOutcome classifyAcceptMiss(BookingId bookingId, VenueId venueId) {
		return classifyMiss(bookings.requestSnapshot(bookingId.value(), venueId));
	}

	private static AcceptOutcome classifyMiss(Optional<RequestSnapshot> request) {
		return request
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
			// An unexpected throw would strand the booking AWAITING_PAYMENT with no payment row: unpayable and unsweepable.
			claims.revert(accepted);
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
				// Back to pending, claim given back; an accept retry replays the Stripe idempotency key.
				boolean reverted = claims.revert(accepted);
				log.warn("payment request for accepted booking {} failed ({}); reverted={}",
						accepted.bookingId(), failed.reason(), reverted);
				yield AcceptOutcome.Rejected.PAYMENT_INIT_FAILED;
			}
		};
	}

	/** {@link #collect} for a stay: one payment request for every stretch; a failure reverts them all. */
	private AcceptOutcome collectStay(StayId stayId, List<AcceptedRequest> stretches) {
		String currency = stretches.getFirst().currency();
		PaymentOutcome payment;
		try {
			payment = checkout.pay(stretches.stream()
					.map(stretch -> new CollectionShare(new BookingRef(stretch.bookingId()),
							new Money(stretch.amountMinor(), currency)))
					.toList());
		}
		catch (RuntimeException paymentBlewUp) {
			claims.revertStay(stayId, stretches);
			throw paymentBlewUp;
		}
		return switch (payment) {
			case PaymentOutcome.Succeeded ignored -> {
				List<Long> ids = stretches.stream().map(AcceptedRequest::bookingId).toList();
				try {
					confirmBooking.confirmAll(ids, clock.instant());
				}
				catch (RuntimeException confirmFailed) {
					ids.forEach(id -> releaseAbandoned.release(new BookingId(id)));
					throw confirmFailed;
				}
				log.info("stay request {} accepted and collected synchronously (stub)", stayId.value());
				yield new AcceptOutcome.Accepted(BookingStatus.CONFIRMED);
			}
			case PaymentOutcome.Pending ignored -> {
				log.info("stay request {} accepted, payment request issued", stayId.value());
				announceStayPaymentDue(stayId, stretches);
				yield new AcceptOutcome.Accepted(BookingStatus.AWAITING_PAYMENT);
			}
			case PaymentOutcome.Failed failed -> {
				boolean reverted = claims.revertStay(stayId, stretches);
				log.warn("payment request for accepted stay {} failed ({}); reverted={}", stayId.value(),
						failed.reason(), reverted);
				yield AcceptOutcome.Rejected.PAYMENT_INIT_FAILED;
			}
		};
	}

	/** {@link #announcePaymentDue} for a stay: its total, judged on its first stretch (ADR-0024); never fails the accept. */
	private void announceStayPaymentDue(StayId stayId, List<AcceptedRequest> stretches) {
		try {
			AcceptedRequest first = stretches.getFirst();
			long total = stretches.stream().mapToLong(AcceptedRequest::amountMinor).reduce(0L, Math::addExact);
			var birth = cancellationPolicy.windowAtBirth(first.setId(), first.bookingDate(), first.createdAt());
			paymentDue.announce(new StayPaymentDue(stayId,
					windows.payDeadline(first.acceptedAt(), cutoff.serviceDayEndsAt(first.bookingDate())),
					total, first.currency(),
					birth.map(CancellationPolicy.BirthTerms::window).orElse(null),
					birth.map(CancellationPolicy.BirthTerms::lateCancelRefundBps).orElse(0)));
		}
		catch (RuntimeException notAnnounced) {
			log.warn("payment-due fact not published for accepted stay {} — the accept and its payment request "
					+ "stand, but no mail will tell the guest their deadline", stayId.value(), notAnnounced);
		}
	}

	/**
	 * Publishes {@link BookingPaymentDue} with the {@link RequestWindows#payDeadline} the sweep enforces.
	 * Must never fail the accept (committed, intent registered): failures are caught and logged at WARN,
	 * ids only (invariant #7) — no publication row exists for any re-drive to find.
	 */
	private void announcePaymentDue(AcceptedRequest accepted) {
		try {
			// Birth-keyed disclosure: classified from created_at, never the accept instant.
			var birth = cancellationPolicy.windowAtBirth(accepted.setId(), accepted.bookingDate(),
					accepted.createdAt());
			paymentDue.announce(new BookingPaymentDue(new BookingId(accepted.bookingId()),
					accepted.venueId(), accepted.setId(), accepted.bookingDate(), accepted.lastDate(),
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
		if (termination.decline(bookingId, venueId)) {
			log.info("request {} declined by venue {}", bookingId.value(), venueId.value());
			return new DeclineOutcome.Declined();
		}
		return bookings.requestSnapshot(bookingId.value(), venueId)
				.<DeclineOutcome>map(snapshot -> DeclineOutcome.Rejected.NOT_PENDING)
				.orElse(DeclineOutcome.Rejected.NO_SUCH_REQUEST);
	}

	@Override
	public DeclineOutcome declineStay(OperatorId operator, VenueId venueId, StayId stayId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (termination.declineStay(stayId, venueId)) {
			log.info("stay request {} declined by venue {}", stayId.value(), venueId.value());
			return new DeclineOutcome.Declined();
		}
		return bookings.stayRequestSnapshot(stayId, venueId)
				.<DeclineOutcome>map(snapshot -> DeclineOutcome.Rejected.NOT_PENDING)
				.orElse(DeclineOutcome.Rejected.NO_SUCH_REQUEST);
	}
}
