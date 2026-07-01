package ai.riviera.platform.payment.adapter.out;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Stripe credentials + client tuning, bound from configuration — credentials are
 * <strong>never committed</strong> (invariant #8 / AC-9). {@code STRIPE_API_KEY} (the secret key
 * used to create PaymentIntents) and {@code STRIPE_WEBHOOK_SECRET} (the signing secret used to
 * verify inbound webhooks, {@code whsec_...}) come from the environment.
 *
 * <p>Always bound (not profile-gated) so the webhook controller can read the signing secret in
 * tests with a fixture secret; the live {@code StripeClient} bean that uses {@code apiKey} is
 * gated to the {@code stripe} profile in {@link StripeConfig}. Empty strings are the default
 * when unset, which is correct for the default (stub) profile where Stripe is dormant.
 *
 * <p>{@code connectTimeout} / {@code readTimeout} are explicit, short {@code StripeClient}
 * timeouts (issue #52, risk R-3): the Stripe SDK defaults to 30s connect / 80s read, long enough
 * that a degraded Stripe could pin a request thread (and a pooled connection) — these fail fast
 * instead. Defaults (5s / 20s) comfortably exceed a normal sub-second PaymentIntent create;
 * tune per environment via {@code stripe.connect-timeout} / {@code stripe.read-timeout}.
 */
@ConfigurationProperties("stripe")
public record StripeProperties(String apiKey, String webhookSecret, Duration connectTimeout,
		Duration readTimeout) {

	private static final Duration DEFAULT_CONNECT_TIMEOUT = Duration.ofSeconds(5);
	private static final Duration DEFAULT_READ_TIMEOUT = Duration.ofSeconds(20);

	public StripeProperties {
		apiKey = apiKey == null ? "" : apiKey;
		webhookSecret = webhookSecret == null ? "" : webhookSecret;
		connectTimeout = connectTimeout == null ? DEFAULT_CONNECT_TIMEOUT : connectTimeout;
		readTimeout = readTimeout == null ? DEFAULT_READ_TIMEOUT : readTimeout;
	}
}
