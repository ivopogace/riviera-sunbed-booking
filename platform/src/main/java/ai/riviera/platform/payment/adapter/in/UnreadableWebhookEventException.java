package ai.riviera.platform.payment.adapter.in;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

/**
 * A signature-verified Stripe event this app acts on whose {@code data.object} yielded no
 * PaymentIntent or refund to apply. Thrown, never logged-and-ignored: the rollback undoes the
 * event-id dedup insert, so Stripe re-delivers (#8). Rationale: RESPONSIBILITIES.md §payment.
 *
 * <p>Extends {@link ErrorResponseException} so the {@code 503} leaves through the one
 * {@code ApiErrorHandler} advice as RFC-7807 ({@code riviera-java-conventions} §6b), never a
 * per-controller handler. Log the event id and type at the throw site, never put them on the wire.
 */
class UnreadableWebhookEventException extends ErrorResponseException {

	UnreadableWebhookEventException() {
		super(HttpStatus.SERVICE_UNAVAILABLE);
	}
}
