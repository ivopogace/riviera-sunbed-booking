package ai.riviera.connectfixture;

import com.stripe.net.RequestOptions;

/** Acts as a connected account through the per-request {@code Stripe-Account} header. */
public final class ConnectedAccountHeader {

	private ConnectedAccountHeader() {
	}

	public static RequestOptions onBehalfOf(String connectedAccountId) {
		return RequestOptions.builder().setStripeAccount(connectedAccountId).build();
	}
}
