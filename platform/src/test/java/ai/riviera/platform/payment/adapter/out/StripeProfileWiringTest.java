package ai.riviera.platform.payment.adapter.out;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;

import com.stripe.StripeClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.util.Throwables.getStackTrace;

/**
 * Pins the shipped {@code stripe}-profile boot posture: a missing or empty {@code STRIPE_API_KEY} or
 * {@code STRIPE_WEBHOOK_SECRET} aborts the boot naming the variable, never the first PaymentIntent or
 * webhook, and so does any key but a test key, without printing it; the default profile builds no
 * {@link StripeClient}. The credentials flow through the real {@code application.properties} placeholders;
 * the machine's own environment is removed so it never leaks in.
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

	@ParameterizedTest
	@ValueSource(strings = {"sk_live_abc123", "rk_live_abc123", "sk_org_abc123"})
	void stripeProfileRefusesAnyKeyButATestKeyWithoutPrintingIt(String key) {
		runner.withPropertyValues("spring.profiles.active=stripe")
				.withSystemProperties("STRIPE_API_KEY=" + key, "STRIPE_WEBHOOK_SECRET=whsec_test")
				.run(context -> {
					assertThat(context).getFailure().rootCause()
							.hasMessageContaining("sandbox-only")
							.hasMessageContaining("STRIPE_API_KEY");
					assertThat(getStackTrace(context.getStartupFailure())).doesNotContain(key);
				});
	}

	@Test
	void stripeProfileWithARestrictedTestKeyBootsTheClient() {
		runner.withPropertyValues("spring.profiles.active=stripe")
				.withSystemProperties("STRIPE_API_KEY=rk_test_123", "STRIPE_WEBHOOK_SECRET=whsec_test")
				.run(context -> assertThat(context).hasSingleBean(StripeClient.class));
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
