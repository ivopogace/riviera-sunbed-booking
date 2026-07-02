package ai.riviera.platform.booking.application.request;

/**
 * The request-expiry sweep use case (issue #98): terminate every {@code PENDING_REQUEST} whose
 * stored {@code request_expires_at} deadline has passed ({@code EXPIRED}) and free its soft-held
 * {@code (set, date)}. Driven by a scheduled adapter; idempotent and safe to run repeatedly or
 * concurrently with accept/decline — the guarded transitions are mutually exclusive by predicate.
 * No payment is involved: a pending request has no PaymentIntent (payment-request-on-accept), so
 * unlike the abandoned-payment sweep there is no gateway call and no profile gate.
 */
public interface ExpireRequests {

	/** @return the number of requests expired this run (for logging/observability) */
	int sweep();
}
