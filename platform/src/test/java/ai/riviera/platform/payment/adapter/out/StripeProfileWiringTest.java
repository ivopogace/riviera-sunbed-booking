package ai.riviera.platform.payment.adapter.out;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.stripe.StripeClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the SHIPPED {@code stripe}-profile boot posture (#378): activating the profile without
 * {@code STRIPE_API_KEY} or {@code STRIPE_WEBHOOK_SECRET} (unset or blank) aborts at boot naming the
 * variable, never on the first PaymentIntent; the default profile stays hermetic with the properties bound
 * and no {@link StripeClient}. Real properties files, no web layer, no Docker. Each test pins both bound
 * {@code stripe.*} values, so a {@code STRIPE_API_KEY} in the process environment never leaks in.
 */
class StripeProfileWiringTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(StripeConfig.class);

	@Test
	void stripeProfileWithoutApiKeyFailsAtBootNamingIt() {
		runner.withPropertyValues("spring.profiles.active=stripe",
					"stripe.api-key=", "stripe.webhook-secret=whsec_test")
				.run(context -> assertThat(context).hasFailed().getFailure()
						.rootCause().hasMessageContaining("STRIPE_API_KEY"));
	}

	@Test
	void stripeProfileWithoutWebhookSecretFailsAtBootNamingIt() {
		runner.withPropertyValues("spring.profiles.active=stripe",
					"stripe.api-key=sk_test_123", "stripe.webhook-secret=")
				.run(context -> assertThat(context).hasFailed().getFailure()
						.rootCause().hasMessageContaining("STRIPE_WEBHOOK_SECRET"));
	}

	@Test
	void stripeProfileWithBlankCredentialsFailsAtBoot() {
		runner.withPropertyValues("spring.profiles.active=stripe",
					"stripe.api-key= ", "stripe.webhook-secret=")
				.run(context -> assertThat(context).hasFailed());
	}

	@Test
	void stripeProfileWithBothCredentialsBootsTheClient() {
		runner.withPropertyValues("spring.profiles.active=stripe",
					"stripe.api-key=sk_test_123", "stripe.webhook-secret=whsec_test")
				.run(context -> assertThat(context).hasSingleBean(StripeClient.class));
	}

	@Test
	void defaultProfileBindsPropertiesWithoutCredentialsAndBuildsNoClient() {
		runner.withPropertyValues("stripe.api-key=", "stripe.webhook-secret=").run(context -> {
			assertThat(context).doesNotHaveBean(StripeClient.class);
			assertThat(context.getBean(StripeProperties.class).apiKey()).isEmpty();
		});
	}
}
