package ai.riviera.platform.payment.adapter.out;

import java.util.List;

import com.stripe.StripeClient;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Wires the Stripe SDK for the {@code payment} module. The {@link StripeClient} bean, the mockable
 * entry point {@code StripePaymentGateway} uses, exists <strong>only under the {@code stripe}
 * profile</strong>, so dev/CI on the default profile run the in-process stub with no Stripe
 * credentials. Collection only, no Connect (ADR-0002).
 *
 * <p>{@link StripeProperties} is bound regardless of profile: the webhook controller needs the
 * signing secret in tests.
 */
@Configuration
@EnableConfigurationProperties(StripeProperties.class)
class StripeConfig {

	private static final List<String> TEST_KEY_PREFIXES = List.of("sk_test_", "rk_test_");

	/**
	 * The Stripe API client, built from the secret key; only active when collecting via Stripe. A blank key or
	 * webhook secret aborts the boot rather than failing the first PaymentIntent or webhook, and so does any
	 * key but a test key: this profile is the sandbox demo ({@code RESPONSIBILITIES.md} §payment, ADR-0029).
	 */
	@Bean
	@Profile("stripe")
	StripeClient stripeClient(StripeProperties properties) {
		requireConfigured("STRIPE_API_KEY", properties.apiKey());
		requireTestKey(properties.apiKey());
		requireConfigured("STRIPE_WEBHOOK_SECRET", properties.webhookSecret());
		return clientBuilder(properties).build();
	}

	private static void requireConfigured(String variable, String value) {
		if (value.isBlank()) {
			throw new IllegalStateException("The stripe profile requires " + variable + " to be set and non-blank");
		}
	}

	private static void requireTestKey(String apiKey) {
		if (TEST_KEY_PREFIXES.stream().noneMatch(apiKey::startsWith)) {
			throw new IllegalStateException("The stripe profile is sandbox-only (ADR-0029): STRIPE_API_KEY must be "
					+ "a test key starting with " + String.join(" or ", TEST_KEY_PREFIXES) + ", never a live key");
		}
	}

	/**
	 * The Stripe client builder, package-private so its timeout wiring is unit-testable. Sets explicit
	 * short connect/read timeouts so a hung Stripe call fails fast instead of pinning a request thread
	 * or pooled connection for the SDK's 30s/80s defaults.
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
