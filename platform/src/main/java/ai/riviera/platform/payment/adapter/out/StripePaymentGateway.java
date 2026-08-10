package ai.riviera.platform.payment.adapter.out;

import java.util.List;
import java.util.Locale;

import java.util.Optional;

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
import ai.riviera.platform.payment.domain.RefundLifecycle;

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

	/** Far above any real count — a booking gets one refund, so page one is always decisive. */
	private static final long REFUND_PAGE_LIMIT = 100L;

	/** The gateway holds refunds for this booking that are not the one asked for; a human must settle it. */
	private static final String REFUND_MISMATCH = "refund_mismatch";

	/** The create replayed a dead refund under an unexpired key, so nothing new was issued. */
	private static final String REFUND_KEY_REPLAY = "refund_key_replay";

	/** The gateway answered the create with a refund that had already returned nothing. */
	private static final String REFUND_BORN_DEAD = "refund_returned_nothing";

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
			PaymentIntent intent = withLostResponseReplay(booking, "PaymentIntent",
					() -> stripe.v1().paymentIntents().create(params, options));
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
			List<Refund> held = refundsOn(intentId.get());
			List<Refund> live = held.stream().filter(StripePaymentGateway::isLive).toList();
			if (!live.isEmpty()) {
				return adoptOrRefuse(booking, live, amount);
			}
			RefundCreateParams params = RefundCreateParams.builder()
					.setPaymentIntent(intentId.get())
					.setAmount(amount.minor())                               // integer minor units (#5)
					.build();
			RequestOptions options = RequestOptions.builder()
					.setIdempotencyKey(refundIdempotencyKey(booking))        // derived from booking id (#8)
					.build();
			Refund refund = withLostResponseReplay(booking, "refund",
					() -> stripe.v1().refunds().create(params, options));
			if (isAlreadyKnownDead(held, refund)) {
				return new RefundResult.Failed(REFUND_KEY_REPLAY);
			}
			if (!isLive(refund)) {
				log.warn("Stripe answered booking {}'s refund with {}, already {} — no money left the "
						+ "account, so it is not recorded", booking.value(), refund.getId(),
						refund.getStatus());
				return new RefundResult.Failed(REFUND_BORN_DEAD);
			}
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
	 * Every refund Stripe holds against the intent. The caller splits them: a {@code failed} or
	 * {@code canceled} one returned no money, so it must not stop a fresh attempt; everything else —
	 * including {@code pending}, which is where a refund normally starts — is live, because creating a
	 * second one alongside it is the outcome this read exists to prevent.
	 *
	 * <p>A {@code pending} refund counted live can still flip to {@code failed} later. That is not
	 * something this read can close, and it does not have to: the refund-lifecycle webhook un-records
	 * such a refund, after which this read sees a dead one and a fresh attempt proceeds.
	 *
	 * <p>One page suffices: more than one live refund is refused rather than reconciled, so the split
	 * only ever needs to answer "none", "exactly one", or "more than one".
	 */
	private List<Refund> refundsOn(String intentId) throws StripeException {
		RefundListParams params = RefundListParams.builder()
				.setPaymentIntent(intentId)
				.setLimit(REFUND_PAGE_LIMIT)
				.build();
		return stripe.v1().refunds().list(params).getData();
	}

	/**
	 * Whether the "created" refund is one Stripe already held and this call already judged dead.
	 *
	 * <p>That happens when a fresh attempt follows an un-recorded failure <em>inside</em> the
	 * idempotency key's lifetime: the key is stable per booking, so Stripe replays the original
	 * response — the dead refund, carrying the status it had when it was made — instead of creating
	 * anything. Recording it would report a guest as refunded by money that came back to us. The
	 * refund is still owed, so the answer is {@link RefundResult.Failed}: the publication stays
	 * outstanding and a retry past the key window creates the real one.
	 */
	private static boolean isAlreadyKnownDead(List<Refund> held, Refund created) {
		boolean replayed = held.stream().anyMatch(refund -> refund.getId() != null
				&& refund.getId().equals(created.getId()));
		if (replayed) {
			log.warn("refund create replayed the dead refund {} under an unexpired idempotency key — "
					+ "not recording it; a retry past the key window will create a fresh one",
					created.getId());
		}
		return replayed;
	}

	private static boolean isLive(Refund refund) {
		return !RefundLifecycle.returnedNoMoney(refund.getStatus());
	}

	/**
	 * Adopt the refund the gateway already holds, or refuse when what it holds is not the refund that
	 * was asked for.
	 *
	 * <p>Adoption is deliberately narrow — <strong>exactly one</strong> live refund, for
	 * <strong>exactly</strong> the requested amount. That is the shape a lost response leaves behind,
	 * and nothing else is. Both ways of "handling" anything else are worse than refusing: topping up a
	 * shortfall would be a refund <em>decision</em>, which belongs to {@code booking}, while reporting
	 * success would complete the event publication and strand a tourist still owed money, leaving a log
	 * line as the only trace. {@link RefundResult.Failed} instead keeps the publication outstanding and
	 * lights {@code riviera.refunds.failed} — the money-path signal that already means "a refund the
	 * platform owes could not be issued", which is exactly true here.
	 */
	private RefundResult adoptOrRefuse(BookingRef booking, List<Refund> live, Money requested) {
		Refund held = live.getFirst();
		Long heldMinor = held.getAmount();
		if (live.size() > 1 || heldMinor == null || heldMinor != requested.minor()) {
			log.warn("booking {} carries {} live refund(s) at the gateway totalling an amount that is "
					+ "not the {} minor units requested — refusing to act", booking.value(), live.size(),
					requested.minor());
			return new RefundResult.Failed(REFUND_MISMATCH);
		}
		payments.markRefunded(booking, heldMinor, held.getId());
		adoptedRefunds.increment();
		log.info("adopted refund {} already held for booking {} — no second refund created",
				held.getId(), booking.value());
		return new RefundResult.Refunded(held.getId());
	}

	/** A Stripe call that may be replayed under the same idempotency key. */
	@FunctionalInterface
	private interface StripeCall<T> {
		T execute() throws StripeException;
	}

	/**
	 * Run a keyed create, recovering from one whose response was lost to a timeout. A read/connect
	 * timeout throws {@link ApiConnectionException} <em>after</em> Stripe may already have done the
	 * work, leaving it untracked because the recording call never ran. The key is deterministic and
	 * still valid this instant, so replaying <strong>once</strong> returns whatever Stripe made rather
	 * than making a second. A non-connection {@link StripeException} is a definitive answer and is not
	 * replayed. A second consecutive timeout propagates to the caller's {@code Failed} mapping.
	 */
	private <T> T withLostResponseReplay(BookingRef booking, String what, StripeCall<T> call)
			throws StripeException {
		try {
			return call.execute();
		}
		catch (ApiConnectionException e) {
			log.warn("Stripe {} create timed out for booking {} — replaying with the same idempotency "
					+ "key to recover anything created (code={})", what, booking.value(), e.getCode());
			return call.execute();
		}
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
