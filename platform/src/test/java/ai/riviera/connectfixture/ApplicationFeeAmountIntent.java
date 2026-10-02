package ai.riviera.connectfixture;

import com.stripe.param.PaymentIntentCreateParams;

/** Takes the commission as a PaymentIntent application fee instead of in the payout ledger. */
public final class ApplicationFeeAmountIntent {

	private ApplicationFeeAmountIntent() {
	}

	public static PaymentIntentCreateParams withFee(long amountMinor, long feeMinor) {
		return PaymentIntentCreateParams.builder()
				.setAmount(amountMinor)
				.setCurrency("eur")
				.setApplicationFeeAmount(feeMinor)
				.build();
	}
}
