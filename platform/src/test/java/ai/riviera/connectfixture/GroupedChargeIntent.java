package ai.riviera.connectfixture;

import com.stripe.param.PaymentIntentCreateParams;

/** Tags the charge for later Connect transfers split across connected accounts. */
public final class GroupedChargeIntent {

	private GroupedChargeIntent() {
	}

	public static PaymentIntentCreateParams build(long amountMinor, String group) {
		return PaymentIntentCreateParams.builder()
				.setAmount(amountMinor)
				.setCurrency("eur")
				.setTransferGroup(group)
				.build();
	}
}
