package ai.riviera.platform.booking.application.request;

/**
 * The request-expiry sweep use case: terminate every {@code PENDING_REQUEST} whose
 * stored {@code request_expires_at} deadline has passed ({@code EXPIRED}) and free its soft-held
 * {@code (set, date)}. Driven by a scheduled adapter; idempotent and safe to run repeatedly or
 * concurrently with accept, decline, and the guest's own withdraw.
 *
 * <p>What makes those legs exclusive is the <strong>row lock, not the predicates</strong>. Only
 * <em>accept</em> is disjoint from this sweep by predicate ({@code request_expires_at > now} vs
 * {@code <= now}); decline and withdraw are guarded on {@code status} alone — deliberately, so an
 * overdue-but-unswept request can still be declined or retracted — so on such a row their
 * {@code WHERE} clauses and this sweep's all match, and whichever {@code UPDATE} reaches the row
 * first is the only one that transitions it. {@code RequestReleaseService} carries the full
 * argument.
 *
 * <p>No payment is involved: a pending request has no PaymentIntent <strong>on record</strong>
 * (payment-request-on-accept), so unlike the abandoned-payment sweep there is no gateway call and
 * no profile gate. <em>On record</em> is load-bearing rather than pedantic: an accept whose
 * PaymentIntent issuance failed reverts the booking to {@code PENDING_REQUEST} and can leave an
 * unregistered intent at Stripe. That intent has no {@code payment} row — which is what webhooks
 * correlate against (invariant #8) — so it is inert and can never confirm a booking, but it is not
 * absent.
 */
public interface ExpireRequests {

	/** @return the number of requests expired this run (for logging/observability) */
	int sweep();
}
