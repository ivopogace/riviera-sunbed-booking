package ai.riviera.platform.booking.application.request;

/**
 * The request-expiry sweep: each {@code PENDING_REQUEST} past its {@code request_expires_at} becomes
 * {@code EXPIRED} and frees its {@code (set, date)}. Idempotent; safe beside accept, decline and
 * withdraw because the <strong>row lock</strong>, not the predicates, makes them exclusive: decline
 * and withdraw guard on status alone, so an overdue request stays declinable and withdrawable
 * ({@code RequestReleaseService}). No gateway call: a pending request has no PaymentIntent <em>on
 * record</em>; a failed accept's stray intent is inert: no {@code payment} row for webhooks (#8).
 */
public interface ExpireRequests {

	/** @return the number of requests expired this run (for logging/observability) */
	int sweep();
}
