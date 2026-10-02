package ai.riviera.connectfixture;

import com.stripe.param.PaymentIntentCreateParams;

/** Routes the charge to a connected account as a destination charge. */
public final class DestinationChargeIntent {

	private DestinationChargeIntent() {
	}

	public static PaymentIntentCreateParams build(long amountMinor, String connectedAccountId) {
		return PaymentIntentCreateParams.builder()
				.setAmount(amountMinor)
				.setCurrency("eur")
				.setTransferData(PaymentIntentCreateParams.TransferData.builder()
						.setDestination(connectedAccountId)
						.build())
				.build();
	}
}
