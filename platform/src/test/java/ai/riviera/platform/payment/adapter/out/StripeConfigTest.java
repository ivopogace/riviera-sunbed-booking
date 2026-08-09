package ai.riviera.platform.payment.adapter.out;

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
 * <p>Also pins the explicit short {@link StripeClient} connect/read timeouts:
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

	/**
	 * The worst case one refund may occupy a worker, pinned rather than asserted in prose (AC-1).
	 *
	 * <p>The bounds of {@code booking}'s refund executor are sized against a budget, and that budget is
	 * a derivation over three facts this method fixes:
	 * {@code (connectTimeout + readTimeout) × (1 + maxNetworkRetries)}. Today that is
	 * {@code (5s + 20s) × 1 = 25s}, and {@link StripeProperties}' ceilings put the absolute worst case
	 * at {@code (30s + 80s) × 1 = 110s}. A number written only in a Javadoc rots the first time someone
	 * tunes a timeout; a failing test is what makes the executor's sizing argument re-examined instead.
	 *
	 * <p><strong>The retry factor is the one that surprises</strong>, which is why it is asserted rather
	 * than assumed. {@code Stripe.maxNetworkRetries} is {@code 2}, and reading that constant is the easy
	 * way to conclude a refund can take three round-trips — but it belongs to the SDK's <em>legacy
	 * static</em> API and never reaches a {@link StripeClient}. The builder's own field is a bare
	 * {@code int} defaulting to {@code 0}, {@link StripeConfig} never sets it, and
	 * {@code RequestOptions.merge} falls back to the client value because
	 * {@code StripePaymentGateway#refund} sets only an idempotency key. So each Stripe <em>call</em> is
	 * exactly one round-trip. Raising this would multiply the occupancy budget <em>and</em> add the SDK's
	 * exponential backoff sleeps (500ms doubling, capped at 5s) on top — invisible to the pool, which
	 * only sees a worker that will not come back.
	 *
	 * <p><strong>A refund is up to three of those calls</strong> — the existence read that makes a
	 * replay safe past the idempotency key's lifetime, the create, and the create's same-key replay —
	 * so the worst-case worker occupancy is 3 x 25s, not 25s. That multiplier lives in the adapter, not
	 * in this client config, which is why this test still pins 25s: it is the per-call budget every
	 * other number is derived from.
	 *
	 * <p><strong>This test is deliberately gateway-specific and deliberately fragile to ADR-0009.</strong>
	 * The migration epic removes {@link StripeConfig} outright, so this method stops compiling on the P1 slice.
	 * That is the intended failure: the bulkhead's sizing must be re-derived from Paysera's client
	 * timeouts and retry policy rather than inheriting a stale 25s.
	 */
	@Test
	void theRefundBudgetIsOneRoundTripWithNoSdkRetries() {
		StripeClient.StripeClientBuilder builder = StripeConfig.clientBuilder(new StripeProperties(
				"sk_test_123", "whsec_abc", null, null));

		assertEquals(0, builder.getMaxNetworkRetries(),
				"each Stripe call must be ONE round-trip: the client's retry count multiplies the "
						+ "worst-case occupancy the booking refund executor's bounds are sized against, on "
						+ "top of the adapter's own 3-calls-per-refund, and adds the SDK's backoff sleeps "
						+ "besides. Stripe.maxNetworkRetries=2 is the legacy static API's default and does "
						+ "not reach a StripeClient");
		assertEquals(25_000, builder.getConnectTimeout() + builder.getReadTimeout(),
				"the shipped per-call budget is 5s connect + 20s read = 25s, and a refund is up to three "
						+ "calls (existence read, create, same-key replay) = 75s worst case; if either "
						+ "moves, re-derive riviera.booking.refund.queue-capacity against the new number");
	}
}
