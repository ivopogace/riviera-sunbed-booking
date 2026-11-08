package ai.riviera.platform.payment.adapter.out;

import ai.riviera.platform.payment.application.PaymentGateway;
import ai.riviera.platform.payment.application.PaymentGatewayPayeeContract;
import ai.riviera.platform.payment.vocabulary.PayeeRef;

/** Binds the in-process stub to {@link PaymentGatewayPayeeContract}: its outcome is what the provider would be asked. */
class StubPaymentGatewayPayeeContractTest extends PaymentGatewayPayeeContract {

	private final StubPaymentGateway gateway = new StubPaymentGateway();

	@Override
	protected PaymentGateway gateway() {
		return gateway;
	}

	@Override
	protected Object providerRequestPaying(PayeeRef payee) {
		return gateway.initiate(payee, BOOKING, AMOUNT);
	}
}
