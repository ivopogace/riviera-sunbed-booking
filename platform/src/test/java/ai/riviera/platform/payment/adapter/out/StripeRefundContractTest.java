package ai.riviera.platform.payment.adapter.out;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import com.stripe.StripeClient;
import com.stripe.exception.StripeException;
import com.stripe.model.Refund;
import com.stripe.model.StripeCollection;
import com.stripe.net.RequestOptions;
import com.stripe.param.RefundCreateParams;
import com.stripe.param.RefundListParams;
import com.stripe.service.RefundService;
import com.stripe.service.V1Services;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import ai.riviera.platform.payment.application.PaymentGateway;
import ai.riviera.platform.payment.application.PaymentGatewayRefundContract;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Binds the collecting Stripe adapter to {@link PaymentGatewayRefundContract}.
 *
 * <p>The fake Stripe deliberately <strong>never dedupes on the idempotency key</strong> — every
 * {@code create} mints a fresh refund id and appends it to what the account holds. That is the whole
 * point: it puts the adapter beyond the key's ~24h window, where only its own read of what the
 * gateway already holds can keep the guest from being refunded twice. An adapter that leaned on the
 * key alone fails here with two distinct ids.
 *
 * <p>In the adapter's package so the package-private gateway is constructible.
 */
class StripeRefundContractTest extends PaymentGatewayRefundContract {

	private final List<Refund> heldAtGateway = new ArrayList<>();

	private long createdThroughThePort;

	private StripePaymentGateway gateway;

	@Override
	protected PaymentGateway gateway() {
		return gateway;
	}

	@Override
	protected void gatewayCollected(BookingRef booking, Money amount) {
		arrangeStripe(booking, amount);
	}

	@Override
	protected void gatewayHoldsADeadRefund(BookingRef booking, Money amount, String refundId) {
		arrangeStripe(booking, amount);
		heldAtGateway.add(StripeRefunds.refund(refundId, "failed", amount.minor()));
	}

	@Override
	protected long refundsCreatedThroughThePort() {
		return createdThroughThePort;
	}

	/** A Stripe account holding one collection for the booking, and whatever refunds the test seeds. */
	private void arrangeStripe(BookingRef booking, Money amount) {
		heldAtGateway.clear();
		createdThroughThePort = 0L;
		String intentId = "pi_contract_" + booking.value();
		StripeClient stripe = mock(StripeClient.class);
		V1Services v1 = mock(V1Services.class);
		RefundService refunds = mock(RefundService.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.refunds()).thenReturn(refunds);
		when(payments.findIntentByBookingRef(booking)).thenReturn(Optional.of(intentId));
		// The record accepts; refusing it is the racing-failure case, which is not this contract's.
		when(payments.markRefunded(any(), anyLong(), any())).thenReturn(true);
		try {
			when(refunds.list(any(RefundListParams.class))).thenAnswer(_ -> heldRefundPage());
			when(refunds.create(any(RefundCreateParams.class), any(RequestOptions.class)))
					.thenAnswer(_ -> mintRefund(amount.minor()));
		}
		catch (StripeException e) {
			throw new IllegalStateException("stubbing a mock cannot call Stripe", e);
		}
		gateway = new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
	}

	private StripeCollection<Refund> heldRefundPage() {
		return StripeRefunds.page(heldAtGateway.toArray(new Refund[0]));
	}

	private Refund mintRefund(long amountMinor) {
		createdThroughThePort++;
		Refund minted = StripeRefunds.refund("re_contract_" + createdThroughThePort, "pending", amountMinor);
		heldAtGateway.add(minted);
		return minted;
	}
}
