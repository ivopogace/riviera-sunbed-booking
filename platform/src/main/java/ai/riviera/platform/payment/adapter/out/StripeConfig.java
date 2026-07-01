package ai.riviera.platform.payment.adapter.out;

import com.stripe.StripeClient;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Wires the Stripe SDK for the {@code payment} module. The {@link StripeClient} bean — the
 * instance-based, mockable Stripe entry point used by {@code StripePaymentGateway} to create
 * PaymentIntents — exists <strong>only under the {@code stripe} profile</strong>, so dev/CI on
 * the default profile run the in-process stub with no Stripe credentials (D-2). The Stripe SDK
 * is collection-only — no Connect (ADR-0002 / invariant #8).
 *
 * <p>{@link StripeProperties} is enabled here but bound regardless of profile (the webhook
 * controller needs the signing secret in tests). Package-private config inside the module
 * (invariant #11).
 */
@Configuration
@EnableConfigurationProperties(StripeProperties.class)
class StripeConfig {

	/** The Stripe API client, built from the secret key. Only active when collecting via Stripe. */
	@Bean
	@Profile("stripe")
	StripeClient stripeClient(StripeProperties properties) {
		return clientBuilder(properties).build();
	}

	/**
	 * The configured Stripe client builder — package-private so the timeout wiring is unit-testable
	 * (the builder exposes {@code getConnectTimeout()}/{@code getReadTimeout()}). Sets explicit short
	 * connect/read timeouts (issue #52, risk R-3) so a hung Stripe call fails fast instead of pinning
	 * a request thread / pooled connection for the SDK's 30s/80s defaults.
	 */
	static StripeClient.StripeClientBuilder clientBuilder(StripeProperties properties) {
		return StripeClient.builder()
				.setApiKey(properties.apiKey())
				// toIntExact fails fast on a misconfigured > ~24.8-day timeout rather than silently
				// wrapping to a negative millisecond value.
				.setConnectTimeout(Math.toIntExact(properties.connectTimeout().toMillis()))
				.setReadTimeout(Math.toIntExact(properties.readTimeout().toMillis()));
	}
}
