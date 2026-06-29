package ai.riviera.platform.payment.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Stripe credentials, bound from configuration — <strong>never committed</strong> (invariant
 * #8 / AC-9). Both values come from the environment: {@code STRIPE_API_KEY} (the secret key
 * used to create PaymentIntents) and {@code STRIPE_WEBHOOK_SECRET} (the signing secret used to
 * verify inbound webhooks, {@code whsec_...}).
 *
 * <p>Always bound (not profile-gated) so the webhook controller can read the signing secret in
 * tests with a fixture secret; the live {@code StripeClient} bean that uses {@code apiKey} is
 * gated to the {@code stripe} profile in {@link StripeConfig}. Empty strings are the default
 * when unset, which is correct for the default (stub) profile where Stripe is dormant.
 */
@ConfigurationProperties("stripe")
public record StripeProperties(String apiKey, String webhookSecret) {

	public StripeProperties {
		apiKey = apiKey == null ? "" : apiKey;
		webhookSecret = webhookSecret == null ? "" : webhookSecret;
	}
}
