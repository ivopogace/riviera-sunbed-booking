package ai.riviera.platform.payment.adapter.out;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.stripe.StripeClient;
import com.stripe.exception.ApiConnectionException;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;
import com.stripe.model.StripeSearchResult;
import com.stripe.param.PaymentIntentSearchParams;
import com.stripe.service.PaymentIntentService;
import com.stripe.service.V1Services;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import ai.riviera.platform.payment.application.CollectingGatewayLookupContract;
import ai.riviera.platform.payment.application.PaymentGateway;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.application.ProviderPaymentState;
import ai.riviera.platform.payment.application.UnpaidTransactions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Binds the Stripe demo adapter to {@link CollectingGatewayLookupContract}, and pins its one listing: a search of
 * the unpaid intents in the window, read to the last page, re-judged on each object's current status because the
 * search filter runs on a cached one. In the adapter's package so the package-private gateway is constructible.
 */
class StripePaymentGatewayLookupContractTest extends CollectingGatewayLookupContract {

	private static final Instant FROM = Instant.parse("2026-10-01T00:00:00Z");

	private static final Instant BEFORE = Instant.parse("2026-10-31T00:00:00Z");

	private final PaymentIntentService intents = mock(PaymentIntentService.class);

	private final PaymentIntent intent = mock(PaymentIntent.class);

	private StripePaymentGateway adapter() {
		StripeClient stripe = mock(StripeClient.class);
		V1Services v1 = mock(V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		when(payments.findIntentByBookingRef(BOOKING)).thenReturn(Optional.of(REFERENCE));
		return new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
	}

	@Override
	protected PaymentGateway gatewayHolding(Held held) {
		when(intent.getStatus()).thenReturn(switch (held) {
			case PAID -> "succeeded";
			case CANCELED -> "canceled";
			case WAITING -> "requires_payment_method";
		});
		StripeSearchResult<PaymentIntent> empty = page(false, null);
		try {
			when(intents.retrieve(anyString())).thenReturn(intent);
			when(intents.search(any(PaymentIntentSearchParams.class))).thenReturn(empty);
		}
		catch (StripeException e) {
			throw new IllegalStateException("stubbing a mock cannot call Stripe", e);
		}
		return adapter();
	}

	@Override
	protected PaymentGateway gatewayThatCannotRead() {
		try {
			when(intents.retrieve(anyString())).thenThrow(new ApiConnectionException("unreachable"));
		}
		catch (StripeException e) {
			throw new IllegalStateException("stubbing a mock cannot call Stripe", e);
		}
		return adapter();
	}

	@Override
	protected void assertNothingWasVoided() {
		try {
			verify(intent, never()).cancel();
		}
		catch (StripeException e) {
			throw new IllegalStateException("verifying a mock cannot call Stripe", e);
		}
	}

	@Test
	void aStatusThisAdapterDoesNotKnowIsNotReadAsWaiting() throws StripeException {
		when(intent.getStatus()).thenReturn("a_future_status");
		when(intents.retrieve(anyString())).thenReturn(intent);

		assertInstanceOf(ProviderPaymentState.Unavailable.class, adapter().lookup(PAYEE, REFERENCE),
				"an answer nobody mapped must surface, never pass as clean");
	}

	@Test
	void theListingAsksOnlyForTheWindowAndSkipsPaidOnes() throws StripeException {
		PaymentIntent unpaid = intentOf("pi_unpaid", "requires_payment_method");
		PaymentIntent cachedAsUnpaid = intentOf("pi_paid_since", "succeeded");
		StripeSearchResult<PaymentIntent> only = page(false, null, unpaid, cachedAsUnpaid);
		when(intents.search(any(PaymentIntentSearchParams.class))).thenReturn(only);

		UnpaidTransactions listing = adapter().unpaidCreatedBetween(FROM, BEFORE);

		assertEquals(new UnpaidTransactions.Listed(List.of("pi_unpaid")), listing,
				"the object's current status decides, not the search's cached filter");
		ArgumentCaptor<PaymentIntentSearchParams> asked = ArgumentCaptor.forClass(PaymentIntentSearchParams.class);
		verify(intents).search(asked.capture());
		assertEquals(Map.of("query", "-status:'succeeded' AND -status:'canceled' AND created>=" + FROM.getEpochSecond()
				+ " AND created<" + BEFORE.getEpochSecond(), "limit", 100L), asked.getValue().toMap());
	}

	@Test
	void theListingReadsToTheLastPage() throws StripeException {
		StripeSearchResult<PaymentIntent> first = page(true, "page-2", intentOf("pi_one", "requires_action"));
		StripeSearchResult<PaymentIntent> second = page(false, null, intentOf("pi_two", "processing"));
		when(intents.search(any(PaymentIntentSearchParams.class))).thenReturn(first, second);

		assertEquals(new UnpaidTransactions.Listed(List.of("pi_one", "pi_two")),
				adapter().unpaidCreatedBetween(FROM, BEFORE));
		ArgumentCaptor<PaymentIntentSearchParams> asked = ArgumentCaptor.forClass(PaymentIntentSearchParams.class);
		verify(intents, org.mockito.Mockito.times(2)).search(asked.capture());
		assertEquals("page-2", asked.getAllValues().get(1).toMap().get("page"));
	}

	@Test
	void aPageThatFailsDiscardsThePartialListing() throws StripeException {
		StripeSearchResult<PaymentIntent> first = page(true, "page-2", intentOf("pi_one", "requires_action"));
		when(intents.search(any(PaymentIntentSearchParams.class)))
				.thenReturn(first)
				.thenThrow(new ApiConnectionException("unreachable"));

		assertInstanceOf(UnpaidTransactions.Unavailable.class, adapter().unpaidCreatedBetween(FROM, BEFORE),
				"half a listing would report the second half as nothing at all");
	}

	@SuppressWarnings("unchecked")
	private static StripeSearchResult<PaymentIntent> page(boolean hasMore, String nextPage, PaymentIntent... data) {
		StripeSearchResult<PaymentIntent> result = mock(StripeSearchResult.class);
		when(result.getData()).thenReturn(List.of(data));
		when(result.getHasMore()).thenReturn(hasMore);
		when(result.getNextPage()).thenReturn(nextPage);
		return result;
	}

	private static PaymentIntent intentOf(String id, String status) {
		PaymentIntent found = mock(PaymentIntent.class);
		when(found.getId()).thenReturn(id);
		when(found.getStatus()).thenReturn(status);
		return found;
	}
}
