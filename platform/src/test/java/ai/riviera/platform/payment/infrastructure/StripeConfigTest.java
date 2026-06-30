package ai.riviera.platform.payment.infrastructure;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.mock.env.MockEnvironment;

import com.stripe.StripeClient;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies the Stripe credentials are sourced from configuration (AC-9 / invariant #8) — never
 * hard-coded — and default to empty when unset (the default/stub profile, where Stripe is
 * dormant). Binds {@link StripeProperties} from a property source via {@link Binder}; no Spring
 * context, no network. The same {@code stripe.*} keys are wired from {@code STRIPE_API_KEY} /
 * {@code STRIPE_WEBHOOK_SECRET} env placeholders in {@code application.properties}.
 *
 * <p>Also pins the explicit short {@link StripeClient} connect/read timeouts (issue #52, R-3):
 * the bound defaults (5s / 20s) and the wiring into the client builder.
 */
class StripeConfigTest {

	private StripeProperties bind(Map<String, Object> props) {
		MockEnvironment env = new MockEnvironment();
		props.forEach(env::setProperty);
		Binder binder = new Binder(ConfigurationPropertySources.get(env));
		return binder.bind("stripe", StripeProperties.class)
				.orElse(new StripeProperties(null, null, null, null));
	}

	@Test
	void bindsApiKeyAndWebhookSecretFromConfig() {
		StripeProperties props = bind(Map.of(
				"stripe.api-key", "sk_test_123",
				"stripe.webhook-secret", "whsec_abc"));

		assertEquals("sk_test_123", props.apiKey());
		assertEquals("whsec_abc", props.webhookSecret());
	}

	@Test
	void defaultsToEmptyWhenUnset() {
		StripeProperties props = bind(Map.of());

		assertEquals("", props.apiKey(), "api key defaults empty (stub profile — Stripe dormant)");
		assertEquals("", props.webhookSecret(), "webhook secret defaults empty when unset");
	}

	@Test
	void bindsTimeoutsFromConfigWithDefaults() {
		StripeProperties defaults = bind(Map.of());
		assertEquals(Duration.ofSeconds(5), defaults.connectTimeout(),
				"connect timeout defaults to 5s (well under the SDK's 30s)");
		assertEquals(Duration.ofSeconds(20), defaults.readTimeout(),
				"read timeout defaults to 20s (well under the SDK's 80s)");

		StripeProperties overridden = bind(Map.of(
				"stripe.connect-timeout", "PT2S",
				"stripe.read-timeout", "PT10S"));
		assertEquals(Duration.ofSeconds(2), overridden.connectTimeout());
		assertEquals(Duration.ofSeconds(10), overridden.readTimeout());
	}

	@Test
	void buildsClientWithConfiguredTimeouts() {
		StripeClient.StripeClientBuilder builder = StripeConfig.clientBuilder(new StripeProperties(
				"sk_test_123", "whsec_abc", Duration.ofSeconds(5), Duration.ofSeconds(20)));

		assertEquals(5000, builder.getConnectTimeout(), "connect timeout wired in milliseconds");
		assertEquals(20000, builder.getReadTimeout(), "read timeout wired in milliseconds");
	}
}
