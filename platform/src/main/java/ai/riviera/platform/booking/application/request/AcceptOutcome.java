package ai.riviera.platform.booking.application.request;

import ai.riviera.platform.booking.domain.BookingStatus;

/**
 * The closed set of outcomes of {@link RespondToRequest#accept} — typed values for expected
 * flows (riviera-java-conventions §6), switched exhaustively by the REST adapter. An ownership
 * mismatch is not here: it throws {@code NotVenueOwnerException} → {@code 403} (invariant #13).
 */
public sealed interface AcceptOutcome {

	/**
	 * The request was accepted. {@code status} is {@link BookingStatus#AWAITING_PAYMENT} once the
	 * payment request (PaymentIntent) is issued — or {@link BookingStatus#CONFIRMED} under the
	 * in-process stub profile, which collects synchronously.
	 */
	record Accepted(BookingStatus status) implements AcceptOutcome {
	}

	/** The request was not accepted; each reason maps to one HTTP status in the controller. */
	enum Rejected implements AcceptOutcome {
		/** No pending request with this id at this venue (unknown id or foreign venue's booking). */
		NO_SUCH_REQUEST,
		/** The booking exists but is not {@code PENDING_REQUEST} (already decided/paid/cancelled). */
		NOT_PENDING,
		/** The response deadline has passed — the expiry sweep will (or did) release the hold. */
		EXPIRED,
		/**
		 * The PaymentIntent could not be created; the request was reverted to
		 * {@code PENDING_REQUEST} so the operator can retry (the Stripe idempotency key makes the
		 * retry safe).
		 */
		PAYMENT_INIT_FAILED
	}
}
