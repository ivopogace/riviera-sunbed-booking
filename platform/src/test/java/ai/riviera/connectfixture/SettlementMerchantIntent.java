package ai.riviera.connectfixture;

import com.stripe.param.PaymentIntentCreateParams;

/** Settles the charge on a connected account as the merchant of record. */
public final class SettlementMerchantIntent {

	private SettlementMerchantIntent() {
	}

	public static PaymentIntentCreateParams build(long amountMinor, String connectedAccountId) {
		return PaymentIntentCreateParams.builder()
				.setAmount(amountMinor)
				.setCurrency("eur")
				.setOnBehalfOf(connectedAccountId)
				.build();
	}
}
