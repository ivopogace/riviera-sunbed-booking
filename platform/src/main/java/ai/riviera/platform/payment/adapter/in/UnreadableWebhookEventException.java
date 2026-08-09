package ai.riviera.platform.payment.adapter.in;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

/**
 * A signature-verified Stripe event this app acts on, whose {@code data.object} yielded no
 * PaymentIntent id — so its payment fact cannot be applied. Thrown rather than logged-and-ignored:
 * it rolls back the handler transaction (including the event-id dedup insert), so Stripe re-delivers
 * instead of the event being consumed and locally blacklisted (invariant #8, at-least-once).
 *
 * <p>Extends {@link ErrorResponseException} so the {@code 503} still leaves through the one
 * {@code ApiErrorHandler} advice as an RFC-7807 problem ({@code riviera-java-conventions} §6b) —
 * the base {@code ResponseEntityExceptionHandler} already handles this type, so no second mapping
 * path and no forbidden per-controller handler is introduced. The event id and type are logged at
 * the throw site, never put on the wire.
 */
class UnreadableWebhookEventException extends ErrorResponseException {

	UnreadableWebhookEventException() {
		super(HttpStatus.SERVICE_UNAVAILABLE);
	}
}
