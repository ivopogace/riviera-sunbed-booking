package ai.riviera.platform.payment.adapter.out;

import java.util.List;
import java.util.Locale;

import java.util.Optional;
import java.util.Set;

import com.stripe.StripeClient;
import com.stripe.exception.ApiConnectionException;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;
import com.stripe.model.Refund;
import com.stripe.net.RequestOptions;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.RefundCreateParams;
import com.stripe.param.RefundListParams;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.payment.vocabulary.RefundResult;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.application.PaymentGateway;
import ai.riviera.platform.payment.domain.PaymentStatus;

/**
 * The real Stripe collection adapter ({@code stripe} profile) for the outbound
 * {@link PaymentGateway}. Creates a <strong>PaymentIntent</strong> — collection only, no Connect
 * (ADR-0002 / invariant #8) — with an idempotency key derived from the booking id (so a retried
 * create never double-charges), the amount in integer minor units + lowercase ISO currency
 * (invariant #5; converted only here at the Stripe edge), and the booking id in metadata for
 * correlation. Records the PaymentIntent ({@code REQUIRES_PAYMENT}) and returns
 * {@link PaymentOutcome.Pending}: the booking stays {@code AWAITING_PAYMENT} and is confirmed
 * only by a signature-verified webhook, never the client.
 *
 * <p>Package-private; selected over {@code StubPaymentGateway} only when the {@code stripe}
 * profile is active. A Stripe error is returned as a typed {@code Failed}, never thrown.
 */
@Component
@Profile("stripe")
class StripePaymentGateway implements PaymentGateway {

	private static final Logger log = LoggerFactory.getLogger(StripePaymentGateway.class);
	private static final String METADATA_BOOKING_REF = "bookingRef";

	/** Non-PII fallback reason when a Stripe error carries no code (logged + returned to the caller). */
	private static final String STRIPE_ERROR = "stripe_error";

	// Stripe PaymentIntent statuses we branch on when cancelling (issue #51).
	private static final String STATUS_SUCCEEDED = "succeeded";
	private static final String STATUS_CANCELED = "canceled";

	/** Stripe Refund statuses in which no money reached the tourist, so the refund is still owed. */
	private static final Set<String> DEAD_REFUND_STATUSES = Set.of("failed", "canceled");

	/** Far above any real count — a booking gets one refund, so page one is always decisive. */
	private static final long REFUND_PAGE_LIMIT = 100L;

	private final StripeClient stripe;
	private final Payments payments;
	private final Counter adoptedRefunds;

	StripePaymentGateway(StripeClient stripe, Payments payments, MeterRegistry meters) {
		this.stripe = stripe;
		this.payments = payments;
		this.adoptedRefunds = meters.counter(ObservabilityMetrics.REFUNDS_ADOPTED);
	}

	@Override
	public PaymentOutcome initiate(BookingRef booking, Money amount) {
		PaymentIntentCreateParams params = PaymentIntentCreateParams.builder()
				.setAmount(amount.minor())                                   // integer minor units (#5)
				.setCurrency(amount.currency().toLowerCase(Locale.ROOT))     // Stripe wants lowercase ISO
				.putMetadata(METADATA_BOOKING_REF, Long.toString(booking.value()))
				.setAutomaticPaymentMethods(PaymentIntentCreateParams.AutomaticPaymentMethods.builder()
						.setEnabled(true)
						.build())
				.build();
		RequestOptions options = RequestOptions.builder()
				.setIdempotencyKey(idempotencyKey(booking))                  // derived from booking id (#8)
				.build();
		try {
			PaymentIntent intent = createWithRecovery(params, options, booking);
			payments.register(new NewPayment(booking, intent.getId(), amount.minor(), amount.currency(),
					intent.getClientSecret()));
			return new PaymentOutcome.Pending(intent.getClientSecret(), intent.getId());
		}
		catch (StripeException e) {
			// Code only — never the message, the key, or any PII (invariant #8 / log discipline).
			log.warn("Stripe PaymentIntent creation failed for booking {}: code={}",
					booking.value(), e.getCode());
			return new PaymentOutcome.Failed(e.getCode() == null ? STRIPE_ERROR : e.getCode());
		}
	}

	/**
	 * Create the PaymentIntent, recovering from a create whose response was lost to a timeout
	 * (issue #66). A read/connect timeout throws {@link ApiConnectionException} <em>after</em> Stripe
	 * may already have created the intent — leaving it orphaned-and-untracked, because
	 * {@code register} (which runs only on a successful return) never executed. Since the idempotency
	 * key is deterministic ({@code booking-<id>-pi}), replaying the create <strong>once</strong> with
	 * the same key returns the <strong>same</strong> intent Stripe created (or creates it fresh if the
	 * first request never landed) — so the id is recovered and recorded by the caller, never lost. A
	 * non-connection {@link StripeException} (a decline, an invalid request) is a definitive Stripe
	 * response, carries no orphan risk, and is <strong>not</strong> replayed — it propagates to the
	 * caller's {@code Failed} mapping. A second consecutive timeout also propagates: Stripe
	 * auto-expires the unconfirmed intent (no charge), the documented low-impact residual.
	 */
	private PaymentIntent createWithRecovery(PaymentIntentCreateParams params, RequestOptions options,
			BookingRef booking) throws StripeException {
		try {
			return stripe.v1().paymentIntents().create(params, options);
		}
		catch (ApiConnectionException e) {
			// The response was lost to a timeout; the intent may exist at Stripe. Replay once with the
			// same idempotency key to recover it (never double-create). Code-only log (invariant #8).
			log.warn("Stripe PaymentIntent create timed out for booking {} — replaying with the same "
					+ "idempotency key to recover any created intent (code={})", booking.value(), e.getCode());
			return stripe.v1().paymentIntents().create(params, options);
		}
	}

	/**
	 * Refund a booking's collection <strong>at most once</strong>, whatever the caller's replay
	 * distance in time.
	 *
	 * <p>The idempotency key alone cannot carry that promise: Stripe prunes keys after roughly a
	 * day, and the replay vehicles behind this call — the restart republish and the admin re-drive —
	 * routinely fire later than that. So the gateway is asked what it already holds against the
	 * PaymentIntent, and a refund that already returned money is <em>adopted</em>: recorded locally
	 * and reported as success, never created a second time. Reading the gateway rather than
	 * {@code payment.refunded_minor} is invariant #8 applied to refunds — the local row is written
	 * only after a call returns, so it is silent about exactly the lost-response case this guards.
	 *
	 * <p>Fail-closed: if the read itself fails, the answer is {@link RefundResult.Failed} and no
	 * refund is created, leaving the event publication outstanding to retry.
	 *
	 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	@Override
	public RefundResult refund(BookingRef booking, Money amount) {
		Optional<String> intentId = payments.findIntentByBookingRef(booking);
		if (intentId.isEmpty()) {
			log.warn("no PaymentIntent on record for booking {} — cannot refund", booking.value());
			return new RefundResult.Failed("no_collection");
		}
		try {
			List<Refund> alreadyPaid = refundsThatReturnedMoney(intentId.get());
			if (!alreadyPaid.isEmpty()) {
				return adopt(booking, alreadyPaid, amount);
			}
			Refund refund = stripe.v1().refunds().create(refundParams(intentId.get(), amount),
					refundOptions(booking));
			payments.markRefunded(booking, amount.minor(), refund.getId());
			return new RefundResult.Refunded(refund.getId());
		}
		catch (StripeException e) {
			// Code only — never the message, the key, or any PII (invariant #8 / log discipline).
			log.warn("Stripe refund failed for booking {}: code={}", booking.value(), e.getCode());
			return new RefundResult.Failed(e.getCode() == null ? STRIPE_ERROR : e.getCode());
		}
	}

	/**
	 * The refunds Stripe holds against the intent that actually returned money. A {@code failed} or
	 * {@code canceled} refund returned none, so it is not one of these and must not stop a fresh
	 * attempt. One page suffices: the platform issues at most one refund per booking, and any single
	 * live refund is already decisive.
	 */
	private List<Refund> refundsThatReturnedMoney(String intentId) throws StripeException {
		RefundListParams params = RefundListParams.builder()
				.setPaymentIntent(intentId)
				.setLimit(REFUND_PAGE_LIMIT)
				.build();
		return stripe.v1().refunds().list(params).getData().stream()
				.filter(StripePaymentGateway::returnedMoney)
				.toList();
	}

	private static boolean returnedMoney(Refund refund) {
		String status = refund.getStatus();
		// An unrecognised status counts as live — never create a second refund on a guess.
		return status == null || !DEAD_REFUND_STATUSES.contains(status);
	}

	/**
	 * Record what Stripe already refunded and report success. The amount recorded is
	 * <strong>Stripe's</strong>, not the requested one: money that has already moved is the truth,
	 * and paying the difference would be a refund <em>decision</em>, which belongs to
	 * {@code booking}. A mismatch is therefore logged rather than corrected.
	 */
	private RefundResult adopt(BookingRef booking, List<Refund> alreadyPaid, Money requested) {
		long refunded = alreadyPaid.stream().mapToLong(Refund::getAmount).sum();
		String refundId = alreadyPaid.getFirst().getId();
		if (refunded != requested.minor()) {
			log.warn("booking {} already carries a refund of {} minor units at Stripe, but {} was "
					+ "requested — recording what Stripe holds", booking.value(), refunded, requested.minor());
		}
		payments.markRefunded(booking, refunded, refundId);
		adoptedRefunds.increment();
		log.info("adopted the refund Stripe already holds for booking {} — no second refund created",
				booking.value());
		return new RefundResult.Refunded(refundId);
	}

	private static RefundCreateParams refundParams(String intentId, Money amount) {
		return RefundCreateParams.builder()
				.setPaymentIntent(intentId)
				.setAmount(amount.minor())                                   // integer minor units (#5)
				.build();
	}

	private static RequestOptions refundOptions(BookingRef booking) {
		return RequestOptions.builder()
				.setIdempotencyKey(refundIdempotencyKey(booking))            // derived from booking id (#8)
				.build();
	}

	@Override
	public PaymentCancellation cancel(BookingRef booking) {
		Optional<String> intentId = payments.findIntentByBookingRef(booking);
		if (intentId.isEmpty()) {
			// No PaymentIntent on record — nothing to cancel at Stripe (#125: a pay() that threw after
			// the reserve commit never registered one). A distinct outcome from a succeeded intent: the
			// sweep may release a stale row on it, but never a fresh one.
			log.warn("no PaymentIntent on record for booking {} — nothing to cancel", booking.value());
			return new PaymentCancellation.NoCollection();
		}
		String id = intentId.get();
		try {
			// Read the authoritative state from Stripe (never the client) before acting (invariant #8).
			PaymentIntent intent = stripe.v1().paymentIntents().retrieve(id);
			String status = intent.getStatus();
			if (STATUS_SUCCEEDED.equals(status)) {
				// The payment went through; the confirm webhook will/has confirmed the booking. Leave it.
				return new PaymentCancellation.NotCancellable(STATUS_SUCCEEDED);
			}
			if (!STATUS_CANCELED.equals(status)) {
				// Cancelable state (requires_payment_method / _confirmation / _action / processing) — void it.
				intent.cancel();
			}
			// Canceled now, or already canceled: either way the payment can no longer succeed.
			// A guarded no-op here means the record was already terminal — Stripe's answer still stands.
			payments.markStatus(id, PaymentStatus.CANCELED);
			return new PaymentCancellation.Canceled();
		}
		catch (StripeException e) {
			// Code only — never the message, the key, or any PII (invariant #8 / log discipline).
			log.warn("Stripe PaymentIntent cancel failed for booking {}: code={}",
					booking.value(), e.getCode());
			return new PaymentCancellation.Failed(e.getCode() == null ? STRIPE_ERROR : e.getCode());
		}
	}

	/** One PaymentIntent per booking: a stable key so a retried create reuses the same intent (#8). */
	private static String idempotencyKey(BookingRef booking) {
		return "booking-" + booking.value() + "-pi";
	}

	/**
	 * One refund per booking: a stable key so a replay <em>inside</em> Stripe's key window returns
	 * the original refund. Beyond that window the key is pruned and {@link #refund}'s existence read
	 * is what prevents a second one (invariant #8/#10).
	 */
	private static String refundIdempotencyKey(BookingRef booking) {
		return "booking-" + booking.value() + "-refund";
	}
}
