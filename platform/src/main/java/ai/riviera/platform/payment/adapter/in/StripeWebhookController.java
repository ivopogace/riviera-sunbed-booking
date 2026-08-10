package ai.riviera.platform.payment.adapter.in;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import com.stripe.exception.EventDataObjectDeserializationException;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.PaymentIntent;
import com.stripe.model.Refund;
import com.stripe.model.StripeObject;
import com.stripe.net.Webhook;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.events.PaymentCanceled;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.application.StripeWebhookEvents;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.domain.RefundLifecycle;
import ai.riviera.platform.payment.adapter.out.StripeProperties;

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
 *       in Stripe — the intent may be retried, so the claim is <em>not</em> released); a refund
 *       lifecycle event reporting that the refund returned nothing → un-record it, so the guest is
 *       owed again rather than recorded as paid.</li>
 * </ol>
 *
 * <p>Every outcome goes through the <strong>guarded</strong> transition ({@code Payments#markStatus}):
 * only an open record moves, and the event is published only when one did — so a late or out-of-order
 * delivery is a no-op rather than an overwrite, and Stripe's lack of ordering guarantees costs nothing.
 *
 * <p>The whole handler is one transaction: if it fails after the dedup insert, the transaction
 * (including that insert) rolls back and Stripe re-delivers — at-least-once without a broker. That
 * is what an unreadable payload on a handled type leans on: it raises
 * {@link UnreadableWebhookEventException} rather than logging a warning and answering {@code 200},
 * which would consume a verified fact Stripe would then never re-deliver.
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
	private static final String CODE_INVALID_SIGNATURE = "INVALID_SIGNATURE";

	// The refund lifecycle under both the charge-scoped legacy type and the current refund-scoped ones.
	private static final String EVENT_REFUND_FAILED = "refund.failed";
	private static final String EVENT_REFUND_UPDATED = "refund.updated";
	private static final String EVENT_CHARGE_REFUND_UPDATED = "charge.refund.updated";

	private final StripeProperties properties;
	private final StripeWebhookEvents webhookEvents;
	private final Payments payments;
	private final ApplicationEventPublisher publisher;
	private final Counter failedRefunds;

	StripeWebhookController(StripeProperties properties, StripeWebhookEvents webhookEvents,
			Payments payments, ApplicationEventPublisher publisher, MeterRegistry meters) {
		this.properties = properties;
		this.webhookEvents = webhookEvents;
		this.payments = payments;
		this.publisher = publisher;
		this.failedRefunds = meters.counter(ObservabilityMetrics.REFUNDS_FAILED);
	}

	@PostMapping("/webhook")
	@Transactional
	ResponseEntity<?> handle(@RequestBody byte[] payload,
			@RequestHeader(name = "Stripe-Signature", required = false) String signature) {
		if (signature == null || signature.isBlank()) {
			return unverifiedSignature(); // absent header: reject before parsing (no NPE, no stack trace)
		}
		Event event;
		try {
			event = Webhook.constructEvent(new String(payload, StandardCharsets.UTF_8), signature,
					properties.webhookSecret());
		}
		catch (SignatureVerificationException e) {
			return unverifiedSignature();
		}

		if (!webhookEvents.firstSeen(event.getId(), event.getType())) {
			return ResponseEntity.ok("duplicate"); // already processed — idempotent
		}

		switch (event.getType()) {
			case EVENT_SUCCEEDED -> onSucceeded(requiredPaymentIntentId(event));
			case EVENT_CANCELED -> onCanceled(requiredPaymentIntentId(event));
			case EVENT_PAYMENT_FAILED -> applied(requiredPaymentIntentId(event), PaymentStatus.FAILED);
			case EVENT_REFUND_FAILED, EVENT_REFUND_UPDATED, EVENT_CHARGE_REFUND_UPDATED ->
					onRefundLifecycle(requiredRefund(event));
			default -> log.debug("ignoring Stripe event type {}", event.getType());
		}
		return ResponseEntity.ok("ok");
	}

	/**
	 * A {@code 400} RFC-7807 problem for an unverifiable webhook — a <em>missing</em> or an
	 * <em>invalid</em> signature, deliberately indistinguishable (invariant #8: no state change,
	 * and no oracle telling an attacker which failure they hit). The standard error shape (#97),
	 * not an ad-hoc string body.
	 */
	private static ResponseEntity<ProblemDetail> unverifiedSignature() {
		return ApiProblem.response(HttpStatus.BAD_REQUEST, CODE_INVALID_SIGNATURE,
				"The Stripe webhook signature is missing or could not be verified.");
	}

	private void onSucceeded(String paymentIntentId) {
		if (!applied(paymentIntentId, PaymentStatus.SUCCEEDED)) {
			return;
		}
		bookingRef(paymentIntentId).ifPresent(
				ref -> publisher.publishEvent(new PaymentConfirmed(ref, paymentIntentId)));
	}

	private void onCanceled(String paymentIntentId) {
		if (!applied(paymentIntentId, PaymentStatus.CANCELED)) {
			return;
		}
		bookingRef(paymentIntentId).ifPresent(
				ref -> publisher.publishEvent(new PaymentCanceled(ref)));
	}

	/**
	 * Apply what a refund lifecycle event says about a refund already on record.
	 *
	 * <p>Only a definitively dead refund acts — a {@code pending} one is where a refund normally
	 * lives, and {@code succeeded} is the happy path this module already recorded. A dead one is
	 * un-recorded, which is what puts the guest back to owed and lights the money-path counter, whose
	 * meaning — a refund the platform owes could not be issued — is exactly this. Nothing re-drives it
	 * automatically: an issuer rejection is not a transient error
	 * ({@code RESPONSIBILITIES.md} §{@code payment}).
	 */
	private void onRefundLifecycle(Refund refund) {
		if (!RefundLifecycle.returnedNoMoney(refund.getStatus())) {
			return;
		}
		Optional<BookingRef> booking = bookingOf(refund);
		if (!payments.markRefundFailed(refund.getId())) {
			unmatchedRefundFailure(refund, booking);
			return;
		}
		failedRefunds.increment();
		log.warn("refund {} for booking {} returned no money ({}) — the platform still owes it",
				refund.getId(), booking.map(BookingRef::value).orElse(null), refund.getStatus());
	}

	/**
	 * A dead-refund event that moved no row. Two shapes share it and the log must not conflate them:
	 * the lifecycle's later deliveries for a refund already un-recorded (the common one — Stripe
	 * announces the same transition under more than one type, and each carries its own event id), and
	 * a refund this app never issued, such as a manual dashboard one.
	 */
	private static void unmatchedRefundFailure(Refund refund, Optional<BookingRef> booking) {
		booking.ifPresentOrElse(
				known -> log.debug("refund {} on booking {} is already un-recorded, or was not issued "
						+ "by this app — nothing to do", refund.getId(), known.value()),
				() -> log.debug("refund {} is for a PaymentIntent this app never recorded — ignoring",
						refund.getId()));
	}

	private Optional<BookingRef> bookingOf(Refund refund) {
		return refund.getPaymentIntent() == null ? Optional.empty()
				: payments.findBookingRefByIntent(refund.getPaymentIntent());
	}

	/**
	 * Whether the outcome moved the payment record. A terminal record does not move, and its event
	 * is then <strong>not</strong> published: a late {@code canceled} must not ask {@code booking} to
	 * release the claim of a booking whose payment went through (invariant #2), and a late
	 * {@code succeeded} must not announce a confirmation for a refunded collection.
	 */
	private boolean applied(String paymentIntentId, PaymentStatus status) {
		boolean applied = payments.markStatus(paymentIntentId, status);
		if (!applied) {
			log.warn("no open payment record for PaymentIntent {} — {} not applied",
					paymentIntentId, status);
		}
		return applied;
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
	 * The PaymentIntent id of an event this handler acts on, or {@link UnreadableWebhookEventException}
	 * — a verified payment fact is never discarded by answering {@code 200} to a payload we could not
	 * read, which would consume the event and blacklist its id (invariant #8).
	 */
	private String requiredPaymentIntentId(Event event) {
		String id = required(event, PaymentIntent.class).getId();
		if (id == null) {
			throw unreadable(event, "PaymentIntent id");
		}
		return id;
	}

	/**
	 * The refund of an event this handler acts on, or {@link UnreadableWebhookEventException}.
	 *
	 * <p>Both the id and the <strong>status</strong> are required, because the status is what the
	 * branch decides on: a payload that yields none would be read as "still live" and consumed as a
	 * {@code 200} no-op, which is the unapplied-fact case this exception exists to prevent.
	 */
	private Refund requiredRefund(Event event) {
		Refund refund = required(event, Refund.class);
		if (refund.getId() == null) {
			throw unreadable(event, "refund id");
		}
		if (refund.getStatus() == null) {
			throw unreadable(event, "refund status");
		}
		return refund;
	}

	/** The verified event's data object as {@code type}, or {@link UnreadableWebhookEventException}. */
	private <T extends StripeObject> T required(Event event, Class<T> type) {
		return dataObject(event)
				.filter(type::isInstance)
				.map(type::cast)
				.orElseThrow(() -> unreadable(event, type.getSimpleName()));
	}

	private UnreadableWebhookEventException unreadable(Event event, String missing) {
		log.error("no {} in verified event {} ({}) — not applying it, asking Stripe to re-deliver",
				missing, event.getId(), event.getType());
		return new UnreadableWebhookEventException();
	}

	/**
	 * The data object of the verified event. Falls back to {@code deserializeUnsafe} when the event's
	 * API version differs from the SDK's (only the stable fields this handler reads are needed).
	 */
	private Optional<StripeObject> dataObject(Event event) {
		EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
		Optional<StripeObject> object = deserializer.getObject();
		if (object.isPresent()) {
			return object;
		}
		try {
			return Optional.ofNullable(deserializer.deserializeUnsafe());
		}
		catch (EventDataObjectDeserializationException e) {
			log.warn("could not deserialize event {} ({})", event.getId(), event.getType());
			return Optional.empty();
		}
	}
}
