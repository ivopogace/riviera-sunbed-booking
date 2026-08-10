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
 *       reported dead → un-record it, so the guest is owed again rather than recorded as paid.</li>
 * </ol>
 *
 * <p>Every outcome goes through a <strong>guarded</strong> transition, never a read-then-write, so a
 * late or out-of-order delivery is a no-op rather than an overwrite and Stripe's lack of ordering
 * guarantees costs nothing. The three payment outcomes use {@code Payments#markStatus}, which moves
 * only an <em>open</em> record and publishes its event only when one moved. The refund un-record's
 * guard is the mirror image — it moves only a row that still records that refund, or one whose refund
 * this app has begun but not yet written down — and publishes nothing: no other module's state
 * depends on it.
 *
 * <p>The whole handler is one transaction: if it fails after the dedup insert, the transaction
 * (including that insert) rolls back and Stripe re-delivers — at-least-once without a broker. That
 * is what an unreadable payload leans on, for the types where losing the fact is the greater harm:
 * it raises {@link UnreadableWebhookEventException} rather than logging a warning and answering
 * {@code 200}, which would consume a verified fact Stripe would then never re-deliver. The
 * every-transition refund types are the deliberate exception, and fail open instead — see
 * {@link #advisoryRefund}.
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

	// The one type that only ever reports a failure, and the two that report every transition.
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
			case EVENT_REFUND_FAILED -> onRefundDied(requiredRefund(event));
			case EVENT_REFUND_UPDATED, EVENT_CHARGE_REFUND_UPDATED ->
					advisoryRefund(event).ifPresent(this::onRefundDied);
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
	private void onRefundDied(Refund refund) {
		if (!RefundLifecycle.returnedNoMoney(refund.getStatus())) {
			return;
		}
		if (!markOwedAgain(refund)) {
			// Already un-recorded by the sibling type's delivery, or a refund this app never issued.
			log.debug("refund {} moved no row — nothing to un-record", refund.getId());
			return;
		}
		failedRefunds.increment();
		log.warn("refund {} for booking {} returned no money ({}) — the platform still owes it",
				refund.getId(), bookingOf(refund).map(BookingRef::value).orElse(null), refund.getStatus());
	}

	/**
	 * Put the booking back to owed, whether or not its refund had been written down yet, and report
	 * whether this delivery is the one that did it.
	 *
	 * <p>The second arm is the narrower case and the reason this is not a single call: a refund id is
	 * recorded <em>after</em> the gateway already knows about the refund, so a failure can arrive
	 * while the recording call is still in flight and find nothing to un-record. Matching by
	 * PaymentIntent covers that window; the guards behind it are what keep a manual gateway refund —
	 * money the platform never promised — from moving anything.
	 *
	 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	private boolean markOwedAgain(Refund refund) {
		if (payments.markRefundFailed(refund.getId())) {
			return true;
		}
		String intentId = refund.getPaymentIntent();
		return intentId != null && payments.markUnrecordedRefundFailed(intentId, refund.getId());
	}

	/** The booking behind a refund, for the incident log line only — never to decide anything. */
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
	 * The refund of {@code refund.failed}, or {@link UnreadableWebhookEventException} — fail-closed,
	 * because that type reports nothing but failures, so an unreadable one is a lost failure.
	 *
	 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	private Refund requiredRefund(Event event) {
		return refundOf(event)
				.filter(StripeWebhookController::isActionable)
				.orElseThrow(() -> unreadable(event, "refund with an id and a status"));
	}

	/**
	 * The refund of an every-transition type, if there is one — fail-<strong>open</strong>, unlike
	 * {@link #requiredRefund}: these types fire for every refund on the account, so a permanent retry
	 * loop would get this endpoint disabled and stop payment delivery with it.
	 *
	 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	private Optional<Refund> advisoryRefund(Event event) {
		Refund refund = refundOf(event).orElse(null);
		if (refund != null && isActionable(refund)) {
			return Optional.of(refund);
		}
		log.warn("no actionable refund in verified event {} ({}, refund {}) — consumed rather than "
				+ "retried; if it carried a failure, only a re-announcement can recover it",
				event.getId(), event.getType(), refund == null ? null : refund.getId());
		return Optional.empty();
	}

	/** The verified event's refund, whatever state its fields are in. */
	private Optional<Refund> refundOf(Event event) {
		return dataObject(event).filter(Refund.class::isInstance).map(Refund.class::cast);
	}

	/** Both fields the refund branch reads: the row to move, and the status that decides whether to. */
	private static boolean isActionable(Refund refund) {
		return refund.getId() != null && refund.getStatus() != null;
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
