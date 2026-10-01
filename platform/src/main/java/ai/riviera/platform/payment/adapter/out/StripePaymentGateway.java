package ai.riviera.platform.payment.adapter.out;

import java.util.List;
import java.util.Locale;

import java.util.Optional;
import java.util.stream.Collectors;

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

import ai.riviera.platform.monitoring.vocabulary.ObservabilityMetrics;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.payment.vocabulary.RefundResult;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.application.PaymentGateway;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.domain.RefundLifecycle;
import ai.riviera.platform.payment.domain.RefundScope;

/**
 * The real Stripe adapter ({@code stripe} profile) for {@link PaymentGateway}: creates a
 * PaymentIntent — collection only, no Connect (ADR-0002) — under an idempotency key derived from the
 * booking id, amount in integer minor units + lowercase ISO currency (invariant #5), booking id in
 * metadata. Returns {@link PaymentOutcome.Pending}; only a signature-verified webhook confirms the
 * booking, never the client (invariant #8). A Stripe error is returned as a typed {@code Failed},
 * never thrown, and only its code is logged.
 */
@Component
@Profile("stripe")
class StripePaymentGateway implements PaymentGateway {

	private static final Logger log = LoggerFactory.getLogger(StripePaymentGateway.class);
	private static final String METADATA_BOOKING_REF = "bookingRef";
	/** Every booking a shared intent collects for, comma-separated, beside the first in {@link #METADATA_BOOKING_REF}. */
	private static final String METADATA_BOOKING_REFS = "bookingRefs";

	/** Non-PII fallback reason when a Stripe error carries no code (logged + returned to the caller). */
	private static final String STRIPE_ERROR = "stripe_error";

	// Stripe PaymentIntent statuses we branch on when cancelling.
	private static final String STATUS_SUCCEEDED = "succeeded";
	private static final String STATUS_CANCELED = "canceled";

	/** Far above any real count — a booking gets one refund per scope, so page one is always decisive. */
	private static final long REFUND_PAGE_LIMIT = 100L;

	/** The gateway holds a live refund that is not the one asked for, or one nobody can attribute; a human must settle it. */
	private static final String REFUND_MISMATCH = "refund_mismatch";

	/** The create replayed a dead refund under an unexpired key, so nothing new was issued. */
	private static final String REFUND_KEY_REPLAY = "refund_key_replay";

	/** The gateway answered the create with a refund that had already returned nothing. */
	private static final String REFUND_BORN_DEAD = "refund_returned_nothing";

	/** The refund died — and its failure webhook landed — before this call could record it. */
	private static final String REFUND_DIED_BEFORE_RECORD = "refund_died_before_record";

	private final StripeClient stripe;
	private final Payments payments;
	private final Counter adoptedRefunds;

	StripePaymentGateway(StripeClient stripe, Payments payments, MeterRegistry meters) {
		this.stripe = stripe;
		this.payments = payments;
		this.adoptedRefunds = meters.counter(ObservabilityMetrics.REFUNDS_ADOPTED);
	}

	@Override
	public PaymentOutcome initiate(List<CollectionShare> shares) {
		BookingRef booking = shares.getFirst().booking();
		String currency = oneCurrencyOf(shares);
		long amountMinor = shares.stream().mapToLong(share -> share.amount().minor()).reduce(0L, Math::addExact);
		PaymentIntentCreateParams.Builder params = PaymentIntentCreateParams.builder()
				.setAmount(amountMinor)                                      // integer minor units (#5)
				.setCurrency(currency.toLowerCase(Locale.ROOT))              // Stripe wants lowercase ISO
				.putMetadata(METADATA_BOOKING_REF, Long.toString(booking.value()))
				.setAutomaticPaymentMethods(PaymentIntentCreateParams.AutomaticPaymentMethods.builder()
						.setEnabled(true)
						.build());
		if (shares.size() > 1) {
			params.putMetadata(METADATA_BOOKING_REFS, shares.stream()
					.map(share -> Long.toString(share.booking().value())).collect(Collectors.joining(",")));
		}
		RequestOptions options = RequestOptions.builder()
				.setIdempotencyKey(idempotencyKey(booking))                  // derived from the first booking id (ADR-0002)
				.build();
		try {
			PaymentIntent intent = withLostResponseReplay(booking, "PaymentIntent",
					() -> stripe.v1().paymentIntents().create(params.build(), options));
			payments.register(new NewPayment(intent.getId(), currency, intent.getClientSecret(), shares.stream()
					.map(share -> new NewPayment.Share(share.booking(), share.amount().minor())).toList()));
			return new PaymentOutcome.Pending(intent.getClientSecret(), intent.getId());
		}
		catch (StripeException e) {
			// Code only — never the message, the key, or any PII (log discipline).
			log.warn("Stripe PaymentIntent creation failed for booking {}: code={}",
					booking.value(), e.getCode());
			return new PaymentOutcome.Failed(e.getCode() == null ? STRIPE_ERROR : e.getCode());
		}
	}

	/**
	 * Refund a booking's share within {@code scope} <strong>at most once</strong>, even after Stripe prunes
	 * the key: a live refund it already holds ({@link StripeRefundTag}) is adopted, never re-created, and
	 * an unreadable list fails closed. Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	@Override
	public RefundResult refund(BookingRef booking, RefundScope scope, Money amount) {
		Optional<String> intentId = payments.findIntentByBookingRef(booking);
		if (intentId.isEmpty()) {
			log.warn("no PaymentIntent on record for booking {} — cannot refund", booking.value());
			return new RefundResult.Failed("no_collection");
		}
		try {
			List<Refund> held = refundsOn(intentId.get());
			List<Refund> live = held.stream().filter(StripePaymentGateway::isLive).toList();
			if (!live.isEmpty()) {
				Optional<List<Refund>> candidates = candidatesFor(booking, scope, intentId.get(), live);
				if (candidates.isEmpty()) {
					return new RefundResult.Failed(REFUND_MISMATCH);
				}
				if (!candidates.get().isEmpty()) {
					return adoptOrRefuse(booking, scope, candidates.get(), amount);
				}
			}
			RefundCreateParams.Builder params = RefundCreateParams.builder()
					.setPaymentIntent(intentId.get())
					.setAmount(amount.minor())                               // integer minor units (#5)
					.putMetadata(StripeRefundTag.KEY, StripeRefundTag.of(booking));
			StripeRefundTag.dayOf(scope).ifPresent(day -> params.putMetadata(StripeRefundTag.DAY_KEY, day));
			RequestOptions options = RequestOptions.builder()
					.setIdempotencyKey(refundIdempotencyKey(booking, scope))  // derived from booking id + scope (ADR-0002)
					.build();
			Refund refund = withLostResponseReplay(booking, "refund",
					() -> stripe.v1().refunds().create(params.build(), options));
			if (isAlreadyKnownDead(held, refund)) {
				return new RefundResult.Failed(REFUND_KEY_REPLAY);
			}
			if (!isLive(refund)) {
				log.warn("Stripe answered booking {}'s refund with {}, already {} — no money left the "
						+ "account, so it is not recorded", booking.value(), refund.getId(),
						refund.getStatus());
				return new RefundResult.Failed(REFUND_BORN_DEAD);
			}
			if (!payments.markRefunded(booking, scope, amount.minor(), refund.getId())) {
				return unrecordable(booking, refund.getId());
			}
			return new RefundResult.Refunded(refund.getId());
		}
		catch (StripeException e) {
			// Code only — never the message, the key, or any PII (log discipline).
			log.warn("Stripe refund failed for booking {}: code={}", booking.value(), e.getCode());
			return new RefundResult.Failed(e.getCode() == null ? STRIPE_ERROR : e.getCode());
		}
	}

	/**
	 * Every refund Stripe holds against the intent. {@code pending} counts as live (a later flip to
	 * {@code failed} is un-recorded by the webhook). One page suffices: more than one live refund is
	 * refused, not reconciled.
	 */
	private List<Refund> refundsOn(String intentId) throws StripeException {
		RefundListParams params = RefundListParams.builder()
				.setPaymentIntent(intentId)
				.setLimit(REFUND_PAGE_LIMIT)
				.build();
		return stripe.v1().refunds().list(params).getData();
	}

	/**
	 * The live refunds that may be this booking's within {@code scope}: those tagged with this booking and scope, plus
	 * untagged ones on a single-booking intent for the whole share (a manual refund). An untagged live refund on a
	 * shared intent, or met by a day (the webhook matches its failure to the whole share, #1310), empties the answer.
	 */
	private Optional<List<Refund>> candidatesFor(BookingRef booking, RefundScope scope, String intentId,
			List<Refund> live) {
		boolean shared = payments.findBookingRefsByIntent(intentId).size() > 1;
		if ((shared || scope.isDay()) && live.stream().anyMatch(refund -> StripeRefundTag.bookingOf(refund).isEmpty())) {
			log.warn("booking {}'s PaymentIntent carries a live refund naming no booking, and it is shared or this is a "
					+ "day refund — refusing to act until a human attributes it", booking.value());
			return Optional.empty();
		}
		return Optional.of(live.stream()
				.filter(refund -> StripeRefundTag.bookingOf(refund)
						.map(tagged -> tagged.equals(booking)
								&& StripeRefundTag.scopeOf(refund).filter(scope::equals).isPresent())
						.orElse(!shared))
				.toList());
	}

	/**
	 * Whether the "created" refund is a dead one Stripe replayed under the unexpired per-booking key.
	 * Recording it would report a guest refunded by money that came back to us, so the caller returns
	 * {@link RefundResult.Failed} and the publication stays outstanding.
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
	 * Adopt the held refund only when it is <strong>exactly one</strong> live refund for
	 * <strong>exactly</strong> the requested amount — the shape a lost response leaves; anything else is
	 * {@code refund_mismatch}. Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	private RefundResult adoptOrRefuse(BookingRef booking, RefundScope scope, List<Refund> live, Money requested) {
		Refund held = live.getFirst();
		Long heldMinor = held.getAmount();
		if (live.size() > 1 || heldMinor == null || heldMinor != requested.minor()) {
			log.warn("booking {} carries {} live refund(s) at the gateway totalling an amount that is "
					+ "not the {} minor units requested — refusing to act", booking.value(), live.size(),
					requested.minor());
			return new RefundResult.Failed(REFUND_MISMATCH);
		}
		if (!payments.markRefunded(booking, scope, heldMinor, held.getId())) {
			return unrecordable(booking, held.getId());
		}
		adoptedRefunds.increment();
		log.info("adopted refund {} already held for booking {} — no second refund created",
				held.getId(), booking.value());
		return new RefundResult.Refunded(held.getId());
	}

	/**
	 * The refund's own failure webhook won the race to the row, so success would promise a guest money
	 * the gateway already killed; {@link RefundResult.Failed} keeps the publication outstanding for a
	 * re-drive past the key window. Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	private static RefundResult unrecordable(BookingRef booking, String refundId) {
		log.warn("booking {}'s refund {} could not be recorded — the gateway reported it dead first, "
				+ "so the refund is still owed", booking.value(), refundId);
		return new RefundResult.Failed(REFUND_DIED_BEFORE_RECORD);
	}

	/** A Stripe call that may be replayed under the same idempotency key. */
	@FunctionalInterface
	private interface StripeCall<T> {
		T execute() throws StripeException;
	}

	/**
	 * Run a keyed create, replaying it <strong>once</strong> with the same key on an
	 * {@link ApiConnectionException}, whose timeout may hide work Stripe already did; any other
	 * {@link StripeException} is definitive. A second timeout propagates to the caller's {@code Failed}.
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
			// No PaymentIntent on record — nothing to cancel at Stripe (a pay() that threw after
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
			// Code only — never the message, the key, or any PII (log discipline).
			log.warn("Stripe PaymentIntent cancel failed for booking {}: code={}",
					booking.value(), e.getCode());
			return new PaymentCancellation.Failed(e.getCode() == null ? STRIPE_ERROR : e.getCode());
		}
	}

	/**
	 * One PaymentIntent per collection, keyed on its first booking (unique to the group): a stable key
	 * so a retried create reuses the same intent (ADR-0002).
	 */
	private static String idempotencyKey(BookingRef booking) {
		return "booking-" + booking.value() + "-pi";
	}

	private static String oneCurrencyOf(List<CollectionShare> shares) {
		String currency = shares.getFirst().amount().currency();
		if (shares.stream().anyMatch(share -> !currency.equals(share.amount().currency()))) {
			throw new IllegalArgumentException("one PaymentIntent collects in one currency");
		}
		return currency;
	}

	/**
	 * One key per booking and scope ({@code booking-<id>-refund}, {@code booking-<id>-day-<date>-refund}), so
	 * a replay inside Stripe's key window returns the original refund; beyond it {@link #refund}'s
	 * existence read prevents a second one (ADR-0002; invariant #10).
	 */
	private static String refundIdempotencyKey(BookingRef booking, RefundScope scope) {
		return "booking-" + booking.value() + "-" + scope.keySuffix();
	}
}
