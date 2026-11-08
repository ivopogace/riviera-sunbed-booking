package ai.riviera.platform.payment.adapter.out;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import ai.riviera.platform.payment.application.PaymentGateway;
import ai.riviera.platform.payment.application.PaymentGatewayLookupContract;
import ai.riviera.platform.payment.application.ProviderPaymentState;
import ai.riviera.platform.payment.application.UnpaidTransactions;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Binds the in-process stub to {@link PaymentGatewayLookupContract}: it collects at once and lists nothing. */
class StubPaymentGatewayLookupContractTest extends PaymentGatewayLookupContract {

	private final StubPaymentGateway gateway = new StubPaymentGateway();

	@Override
	protected PaymentGateway gateway() {
		return gateway;
	}

	@Test
	void everyStubPaymentIsPaidAndNothingIsListed() {
		Instant now = Instant.parse("2026-11-01T00:00:00Z");

		assertEquals(new ProviderPaymentState.Paid(), gateway.lookup(PAYEE, REFERENCE));
		assertEquals(new UnpaidTransactions.NotOffered(), gateway.unpaidCreatedBetween(now.minusSeconds(60L), now));
	}
}
