package ai.riviera.platform.payment.adapter.out;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;

import com.stripe.StripeClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the shipped {@code stripe}-profile boot posture: a missing or empty {@code STRIPE_API_KEY} or
 * {@code STRIPE_WEBHOOK_SECRET} aborts the boot naming the variable, never the first PaymentIntent or
 * webhook; the default profile builds no {@link StripeClient}. The credentials flow through the real
 * {@code application.properties} placeholders; the machine's own environment is removed so it never leaks in.
 */
class StripeProfileWiringTest {

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
	void stripeProfileWithEmptyApiKeyFailsAtBootNamingIt() {
		runner.withPropertyValues("spring.profiles.active=stripe")
				.withSystemProperties("STRIPE_API_KEY=", "STRIPE_WEBHOOK_SECRET=whsec_test")
				.run(context -> assertThat(context).getFailure().rootCause().hasMessageContaining("STRIPE_API_KEY"));
	}

	@Test
	void stripeProfileWithEmptyWebhookSecretFailsAtBootNamingIt() {
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
