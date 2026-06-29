package ai.riviera.platform.payment.infrastructure.out;

import java.util.Optional;

import com.stripe.StripeClient;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;
import com.stripe.model.Refund;
import com.stripe.net.RequestOptions;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.RefundCreateParams;
import com.stripe.service.PaymentIntentService;
import com.stripe.service.RefundService;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.payment.api.RefundResult;
import ai.riviera.platform.payment.application.out.NewPayment;
import ai.riviera.platform.payment.application.out.Payments;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit test of the Stripe collection adapter (issue #8, AC-1/AC-10) with a mocked
 * {@link StripeClient} — no live Stripe call. Pins the boundary contract: the PaymentIntent is
 * created with the amount in <strong>integer minor units</strong> and lowercase ISO currency
 * (invariant #5), an <strong>idempotency key derived from the booking id</strong> (invariant
 * #8), and the booking id in metadata; the record is persisted and a {@link PaymentOutcome.Pending}
 * carrying the client secret is returned; a Stripe failure maps to {@code Failed} (narrow catch,
 * never throws to the caller). In the adapter's own package so the package-private class is the
 * test surface.
 */
class StripePaymentGatewayTest {

	@Test
	void createsIntentWithIdempotencyKeyAndMinorUnits() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		com.stripe.service.V1Services v1 = mock(com.stripe.service.V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);

		PaymentIntent created = mock(PaymentIntent.class);
		when(created.getId()).thenReturn("pi_abc");
		when(created.getClientSecret()).thenReturn("pi_abc_secret_xyz");
		when(intents.create(any(PaymentIntentCreateParams.class), any(RequestOptions.class)))
				.thenReturn(created);

		StripePaymentGateway gateway = new StripePaymentGateway(stripe, payments);
		PaymentOutcome outcome = gateway.initiate(new BookingRef(42L), new Money(4500L, "EUR"));

		PaymentOutcome.Pending pending = assertInstanceOf(PaymentOutcome.Pending.class, outcome,
				"a created PaymentIntent yields Pending — the booking confirms only on the webhook");
		assertEquals("pi_abc_secret_xyz", pending.clientSecret());
		assertEquals("pi_abc", pending.paymentIntentId());

		ArgumentCaptor<PaymentIntentCreateParams> params =
				ArgumentCaptor.forClass(PaymentIntentCreateParams.class);
		ArgumentCaptor<RequestOptions> options = ArgumentCaptor.forClass(RequestOptions.class);
		verify(intents).create(params.capture(), options.capture());
		assertEquals(4500L, params.getValue().getAmount(), "amount is integer minor units (invariant #5)");
		assertEquals("eur", params.getValue().getCurrency(), "currency is lowercase ISO at the Stripe edge");
		assertEquals("42", params.getValue().getMetadata().get("bookingRef"),
				"booking id travels in metadata for correlation");
		assertEquals("booking-42-pi", options.getValue().getIdempotencyKey(),
				"idempotency key is derived from the booking id (invariant #8)");

		verify(payments).register(new NewPayment(new BookingRef(42L), "pi_abc", 4500L, "EUR"));
	}

	@Test
	void stripeFailureMapsToFailed() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		com.stripe.service.V1Services v1 = mock(com.stripe.service.V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);

		StripeException boom = mock(StripeException.class);
		when(boom.getCode()).thenReturn("card_declined");
		when(intents.create(any(PaymentIntentCreateParams.class), any(RequestOptions.class)))
				.thenThrow(boom);

		StripePaymentGateway gateway = new StripePaymentGateway(stripe, payments);
		PaymentOutcome outcome = gateway.initiate(new BookingRef(7L), new Money(3000L, "EUR"));

		PaymentOutcome.Failed failed = assertInstanceOf(PaymentOutcome.Failed.class, outcome,
				"a Stripe error is a typed Failed outcome, never a thrown exception to the caller");
		assertEquals("card_declined", failed.reason());
	}

	@Test
	void refundUsesIdempotencyKeyAndRecordsTheRefund() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		RefundService refunds = mock(RefundService.class);
		com.stripe.service.V1Services v1 = mock(com.stripe.service.V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.refunds()).thenReturn(refunds);
		when(payments.findIntentByBookingRef(new BookingRef(42L))).thenReturn(Optional.of("pi_abc"));

		Refund created = mock(Refund.class);
		when(created.getId()).thenReturn("re_xyz");
		when(refunds.create(any(RefundCreateParams.class), any(RequestOptions.class))).thenReturn(created);

		StripePaymentGateway gateway = new StripePaymentGateway(stripe, payments);
		RefundResult result = gateway.refund(new BookingRef(42L), new Money(2250L, "EUR"));

		RefundResult.Refunded refunded = assertInstanceOf(RefundResult.Refunded.class, result);
		assertEquals("re_xyz", refunded.refundId());

		ArgumentCaptor<RefundCreateParams> params = ArgumentCaptor.forClass(RefundCreateParams.class);
		ArgumentCaptor<RequestOptions> options = ArgumentCaptor.forClass(RequestOptions.class);
		verify(refunds).create(params.capture(), options.capture());
		assertEquals("pi_abc", params.getValue().getPaymentIntent(), "refund targets the booking's PaymentIntent");
		assertEquals(2250L, params.getValue().getAmount(), "amount is integer minor units (invariant #5)");
		assertEquals("booking-42-refund", options.getValue().getIdempotencyKey(),
				"refund idempotency key is derived from the booking id (invariant #8/#10)");
		verify(payments).markRefunded(new BookingRef(42L), 2250L, "re_xyz");
	}

	@Test
	void refundWithoutAKnownCollectionFails() {
		StripeClient stripe = mock(StripeClient.class);
		Payments payments = mock(Payments.class);
		when(payments.findIntentByBookingRef(new BookingRef(99L))).thenReturn(Optional.empty());

		StripePaymentGateway gateway = new StripePaymentGateway(stripe, payments);
		RefundResult result = gateway.refund(new BookingRef(99L), new Money(1000L, "EUR"));

		RefundResult.Failed failed = assertInstanceOf(RefundResult.Failed.class, result,
				"with no recorded PaymentIntent there is nothing to refund");
		assertEquals("no_collection", failed.reason());
	}
}
