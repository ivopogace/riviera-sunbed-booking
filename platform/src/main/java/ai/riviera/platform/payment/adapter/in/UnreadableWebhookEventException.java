package ai.riviera.platform.payment.adapter.in;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * A signature-verified Stripe event this app acts on, whose {@code data.object} yielded no
 * PaymentIntent id — so its payment fact cannot be applied. Thrown rather than logged-and-ignored:
 * it rolls back the handler transaction (including the event-id dedup insert), so Stripe re-delivers
 * instead of the event being consumed and locally blacklisted (invariant #8, at-least-once).
 *
 * <p>The {@code 503} is what Stripe reads; no body contract applies here (the endpoint's only client
 * is Stripe), so this is not mapped in {@code ApiErrorHandler}.
 */
@ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
class UnreadableWebhookEventException extends RuntimeException {

	UnreadableWebhookEventException(String eventId, String eventType) {
		super("could not read a PaymentIntent from verified event " + eventId + " (" + eventType + ")");
	}
}
