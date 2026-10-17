package ai.riviera.platform.payment.adapter.out;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import org.springframework.core.env.StandardEnvironment;

import com.stripe.StripeClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the SHIPPED {@code stripe}-profile boot posture: the credentials come from
 * {@code application-stripe.properties} and {@link StripeConfig} rejects blank values, so activating the
 * profile with either unset or empty aborts at boot, naming the variable, never on the first PaymentIntent
 * or webhook. The default profile builds no {@link StripeClient} and binds empty credentials. Real
 * properties files via {@link ConfigDataApplicationContextInitializer}; no web layer, no Docker.
 */
class StripeProfileWiringTest {

	/** The ambient {@code STRIPE_*} variables of the machine running the tests must not leak in. */
	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(context -> context.getEnvironment().getPropertySources()
					.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(StripeConfig.class);

	@Test
	void stripeProfileWithoutApiKeyFailsAtBoot() {
		runner.withPropertyValues("spring.profiles.active=stripe")
				.withSystemProperties("STRIPE_WEBHOOK_SECRET=whsec_test")
				.run(context -> assertThat(context).getFailure().rootCause().hasMessageContaining("STRIPE_API_KEY"));
	}

	@Test
	void stripeProfileWithoutWebhookSecretFailsAtBoot() {
		runner.withPropertyValues("spring.profiles.active=stripe")
				.withSystemProperties("STRIPE_API_KEY=sk_test_123")
				.run(context -> assertThat(context).getFailure().rootCause()
						.hasMessageContaining("STRIPE_WEBHOOK_SECRET"));
	}

	@Test
	void stripeProfileWithEmptyCredentialsFailsAtBootWithAClearCause() {
		runner.withPropertyValues("spring.profiles.active=stripe")
				.withSystemProperties("STRIPE_API_KEY=", "STRIPE_WEBHOOK_SECRET=whsec_test")
				.run(context -> assertThat(context).getFailure().rootCause()
						.hasMessageContaining("STRIPE_API_KEY"));
		runner.withPropertyValues("spring.profiles.active=stripe")
				.withSystemProperties("STRIPE_API_KEY=sk_test_123", "STRIPE_WEBHOOK_SECRET=")
				.run(context -> assertThat(context).getFailure().rootCause()
						.hasMessageContaining("STRIPE_WEBHOOK_SECRET"));
	}

	@Test
	void stripeProfileWithBothSetBootsTheClient() {
		runner.withPropertyValues("spring.profiles.active=stripe")
				.withSystemProperties("STRIPE_API_KEY=sk_test_123", "STRIPE_WEBHOOK_SECRET=whsec_test")
				.run(context -> {
					assertThat(context).hasSingleBean(StripeClient.class);
					StripeProperties props = context.getBean(StripeProperties.class);
					assertThat(props.apiKey()).isEqualTo("sk_test_123");
					assertThat(props.webhookSecret()).isEqualTo("whsec_test");
				});
	}

	@Test
	void defaultProfileBuildsNoClientAndBindsEmptyCredentials() {
		runner.run(context -> {
			assertThat(context).hasNotFailed().doesNotHaveBean(StripeClient.class);
			StripeProperties props = context.getBean(StripeProperties.class);
			assertThat(props.apiKey()).isEmpty();
			assertThat(props.webhookSecret()).isEmpty();
		});
	}
}
