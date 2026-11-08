package ai.riviera.platform.payment.adapter.out;

import java.util.List;

import com.stripe.StripeClient;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;
import com.stripe.net.RequestOptions;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.service.PaymentIntentService;
import com.stripe.service.V1Services;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.mockito.ArgumentCaptor;

import ai.riviera.platform.payment.application.PaymentGateway;
import ai.riviera.platform.payment.application.PaymentGatewayPayeeContract;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.vocabulary.PayeeRef;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Binds the Stripe demo adapter to {@link PaymentGatewayPayeeContract}: the PaymentIntent parameters and
 * the idempotency key are the whole of what Stripe is asked. In the adapter's package so the
 * package-private gateway is constructible.
 */
class StripePaymentGatewayPayeeContractTest extends PaymentGatewayPayeeContract {

	private PaymentIntentService intents;

	private StripePaymentGateway arrange() {
		StripeClient stripe = mock(StripeClient.class);
		V1Services v1 = mock(V1Services.class);
		intents = mock(PaymentIntentService.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		PaymentIntent created = mock(PaymentIntent.class);
		when(created.getId()).thenReturn("pi_contract");
		when(created.getClientSecret()).thenReturn("pi_contract_secret");
		try {
			when(intents.create(any(PaymentIntentCreateParams.class), any(RequestOptions.class))).thenReturn(created);
		}
		catch (StripeException e) {
			throw new IllegalStateException("stubbing a mock cannot call Stripe", e);
		}
		return new StripePaymentGateway(stripe, mock(Payments.class), new SimpleMeterRegistry());
	}

	@Override
	protected PaymentGateway gateway() {
		return arrange();
	}

	@Override
	protected Object providerRequestPaying(PayeeRef payee) {
		StripePaymentGateway gateway = arrange();
		gateway.initiate(payee, BOOKING, AMOUNT);
		ArgumentCaptor<PaymentIntentCreateParams> params = ArgumentCaptor.forClass(PaymentIntentCreateParams.class);
		ArgumentCaptor<RequestOptions> options = ArgumentCaptor.forClass(RequestOptions.class);
		try {
			verify(intents).create(params.capture(), options.capture());
		}
		catch (StripeException e) {
			throw new IllegalStateException("verifying a mock cannot call Stripe", e);
		}
		return List.of(params.getValue().toMap(), options.getValue().getIdempotencyKey());
	}
}
