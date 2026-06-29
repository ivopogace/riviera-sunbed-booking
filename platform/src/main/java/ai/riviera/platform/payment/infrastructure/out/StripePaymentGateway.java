package ai.riviera.platform.payment.infrastructure.out;

import java.util.Locale;

import com.stripe.StripeClient;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;
import com.stripe.net.RequestOptions;
import com.stripe.param.PaymentIntentCreateParams;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.payment.application.out.NewPayment;
import ai.riviera.platform.payment.application.out.Payments;
import ai.riviera.platform.payment.application.out.PaymentGateway;

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

	private final StripeClient stripe;
	private final Payments payments;

	StripePaymentGateway(StripeClient stripe, Payments payments) {
		this.stripe = stripe;
		this.payments = payments;
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
			PaymentIntent intent = stripe.v1().paymentIntents().create(params, options);
			payments.register(new NewPayment(booking, intent.getId(), amount.minor(), amount.currency()));
			return new PaymentOutcome.Pending(intent.getClientSecret(), intent.getId());
		}
		catch (StripeException e) {
			// Code only — never the message, the key, or any PII (invariant #8 / log discipline).
			log.warn("Stripe PaymentIntent creation failed for booking {}: code={}",
					booking.value(), e.getCode());
			return new PaymentOutcome.Failed(e.getCode() == null ? "stripe_error" : e.getCode());
		}
	}

	/** One PaymentIntent per booking: a stable key so a retried create reuses the same intent (#8). */
	private static String idempotencyKey(BookingRef booking) {
		return "booking-" + booking.value() + "-pi";
	}
}
