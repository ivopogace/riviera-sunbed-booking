package ai.riviera.platform.payment.infrastructure.in;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import com.stripe.exception.EventDataObjectDeserializationException;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.PaymentIntent;
import com.stripe.model.StripeObject;
import com.stripe.net.Webhook;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.PaymentCanceled;
import ai.riviera.platform.payment.api.PaymentConfirmed;
import ai.riviera.platform.payment.application.out.Payments;
import ai.riviera.platform.payment.application.out.StripeWebhookEvents;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.infrastructure.StripeProperties;

/**
 * Stripe webhook endpoint — the <strong>source of truth</strong> for payment state (invariant
 * #8). A booking is confirmed (or its claim released) only from here, never from the client
 * redirect. The handler:
 *
 * <ol>
 *   <li><strong>verifies the signature</strong> on the <em>raw</em> body with the webhook
 *       secret ({@link Webhook#constructEvent}); a bad/absent signature is {@code 400} with no
 *       state change;</li>
 *   <li><strong>dedupes</strong> on the Stripe event id ({@link StripeWebhookEvents#firstSeen})
 *       — a re-delivered event is a {@code 200} no-op (idempotent);</li>
 *   <li>applies the outcome: {@code payment_intent.succeeded} → mark {@code SUCCEEDED} +
 *       publish {@link PaymentConfirmed}; {@code .canceled} → mark {@code CANCELED} + publish
 *       {@link PaymentCanceled}; {@code .payment_failed} → mark {@code FAILED} only (non-terminal
 *       in Stripe — the intent may be retried, so the claim is <em>not</em> released).</li>
 * </ol>
 *
 * <p>The whole handler is one transaction: if it fails after the dedup insert, the transaction
 * (including that insert) rolls back and Stripe re-delivers — at-least-once without a broker.
 * The {@code booking} module reacts to the published events; this controller never imports
 * {@code booking} (invariant #11). The raw body, signature, and secret are never logged.
 */
@RestController
@RequestMapping("/api/payments/stripe")
class StripeWebhookController {

	private static final Logger log = LoggerFactory.getLogger(StripeWebhookController.class);

	private static final String EVENT_SUCCEEDED = "payment_intent.succeeded";
	private static final String EVENT_CANCELED = "payment_intent.canceled";
	private static final String EVENT_PAYMENT_FAILED = "payment_intent.payment_failed";

	private final StripeProperties properties;
	private final StripeWebhookEvents webhookEvents;
	private final Payments payments;
	private final ApplicationEventPublisher publisher;

	StripeWebhookController(StripeProperties properties, StripeWebhookEvents webhookEvents,
			Payments payments, ApplicationEventPublisher publisher) {
		this.properties = properties;
		this.webhookEvents = webhookEvents;
		this.payments = payments;
		this.publisher = publisher;
	}

	@PostMapping("/webhook")
	@Transactional
	ResponseEntity<String> handle(@RequestBody byte[] payload,
			@RequestHeader(name = "Stripe-Signature", required = false) String signature) {
		Event event;
		try {
			event = Webhook.constructEvent(new String(payload, StandardCharsets.UTF_8), signature,
					properties.webhookSecret());
		}
		catch (SignatureVerificationException e) {
			// Unverified — never trust it (invariant #8). No state change.
			return ResponseEntity.badRequest().body("invalid signature");
		}

		if (!webhookEvents.firstSeen(event.getId(), event.getType())) {
			return ResponseEntity.ok("duplicate"); // already processed — idempotent
		}

		switch (event.getType()) {
			case EVENT_SUCCEEDED -> paymentIntentId(event).ifPresent(this::onSucceeded);
			case EVENT_CANCELED -> paymentIntentId(event).ifPresent(this::onCanceled);
			case EVENT_PAYMENT_FAILED -> paymentIntentId(event)
					.ifPresent(id -> payments.markStatus(id, PaymentStatus.FAILED));
			default -> log.debug("ignoring Stripe event type {}", event.getType());
		}
		return ResponseEntity.ok("ok");
	}

	private void onSucceeded(String paymentIntentId) {
		payments.markStatus(paymentIntentId, PaymentStatus.SUCCEEDED);
		bookingRef(paymentIntentId).ifPresent(
				ref -> publisher.publishEvent(new PaymentConfirmed(ref, paymentIntentId)));
	}

	private void onCanceled(String paymentIntentId) {
		payments.markStatus(paymentIntentId, PaymentStatus.CANCELED);
		bookingRef(paymentIntentId).ifPresent(
				ref -> publisher.publishEvent(new PaymentCanceled(ref)));
	}

	private Optional<BookingRef> bookingRef(String paymentIntentId) {
		Optional<BookingRef> ref = payments.findBookingRefByIntent(paymentIntentId);
		if (ref.isEmpty()) {
			// An event for a PaymentIntent this app didn't record — ignore (don't act on it).
			log.warn("no booking for PaymentIntent {} — ignoring webhook", paymentIntentId);
		}
		return ref;
	}

	/**
	 * The PaymentIntent id from the verified event. Falls back to {@code deserializeUnsafe} when
	 * the event's API version differs from the SDK's (only the stable {@code id} is needed).
	 */
	private Optional<String> paymentIntentId(Event event) {
		EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
		StripeObject object = deserializer.getObject().orElse(null);
		if (object == null) {
			try {
				object = deserializer.deserializeUnsafe();
			}
			catch (EventDataObjectDeserializationException e) {
				log.warn("could not deserialize event {} ({})", event.getId(), event.getType());
				return Optional.empty();
			}
		}
		if (object instanceof PaymentIntent paymentIntent) {
			return Optional.ofNullable(paymentIntent.getId());
		}
		return Optional.empty();
	}
}
