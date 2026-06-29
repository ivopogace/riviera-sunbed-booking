package ai.riviera.platform.payment.infrastructure;

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
		return new StripeClient(properties.apiKey());
	}
}
