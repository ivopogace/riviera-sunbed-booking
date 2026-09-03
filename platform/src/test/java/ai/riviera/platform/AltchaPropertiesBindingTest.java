package ai.riviera.platform;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * Pins the SHIPPED proof-of-work configuration as <em>bound, validated</em> values, the
 * {@code RateLimitPropertiesBindingTest} idiom: the real {@code application.properties} is loaded
 * without a Boot context, the secret placeholder is env-overridable, and the tuning knobs are
 * bounded in the compact constructor because no JSR-303 implementation is on the classpath.
 *
 * <p>The bounds guard the two degenerate directions. A {@code cost} of zero is a fence that costs
 * nothing; one past the ceiling makes the widget's own 90-second timeout fail honest tourists. An
 * {@code expiry} under a minute expires challenges before a slow phone can solve them; one over an
 * hour keeps a captured solution alive longer than ALTCHA's own guidance allows.
 */
class AltchaPropertiesBindingTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(AltchaProperties.class)
	static class BindOnly {
	}

	@Test
	void bindsTheShippedDefaults() {
		runner.run(context -> {
			AltchaProperties props = context.getBean(AltchaProperties.class);
			assertThat(props.enabled()).isTrue();
			assertThat(props.cost()).isEqualTo(5000);
			assertThat(props.expiry()).isEqualTo(Duration.ofMinutes(10));
			assertThat(props.clockSkew()).isEqualTo(Duration.ofSeconds(30));
			assertThat(props.hmacSecret()).as("no secret ships in the repo").isEmpty();
		});
	}

	@Test
	void theEnvironmentSuppliesTheSecret() {
		runner.withSystemProperties("RIVIERA_ALTCHA_HMAC_SECRET=from-the-environment")
				.run(context -> assertThat(context.getBean(AltchaProperties.class).hmacSecret())
						.isEqualTo("from-the-environment"));
	}

	@Test
	void theKillSwitchBinds() {
		runner.withPropertyValues("riviera.altcha.enabled=false")
				.run(context -> assertThat(context.getBean(AltchaProperties.class).enabled()).isFalse());
	}

	@Test
	void aZeroCostFailsTheContext() {
		runner.withPropertyValues("riviera.altcha.cost=0")
				.run(context -> assertThat(context)
						.as("a cost of zero is a fence that costs nothing")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.altcha.cost"));
	}

	@Test
	void anOversizedCostFailsTheContext() {
		runner.withPropertyValues("riviera.altcha.cost=" + (AltchaProperties.MAX_COST + 1))
				.run(context -> assertThat(context)
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.altcha.cost"));
	}

	@Test
	void anExpiryOutsideItsRangeFailsTheContext() {
		runner.withPropertyValues("riviera.altcha.expiry=PT30S")
				.run(context -> assertThat(context)
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.altcha.expiry"));
		runner.withPropertyValues("riviera.altcha.expiry=PT2H")
				.run(context -> assertThat(context)
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.altcha.expiry"));
	}

	@Test
	void aNegativeOrOversizedSkewFailsTheContext() {
		runner.withPropertyValues("riviera.altcha.clock-skew=PT-1S")
				.run(context -> assertThat(context)
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.altcha.clock-skew"));
		runner.withPropertyValues("riviera.altcha.clock-skew=PT10M")
				.run(context -> assertThat(context)
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.altcha.clock-skew"));
	}

	@Test
	void acceptsTheWholeTuningRangeButNotBeyondIt() {
		assertThat(cost(AltchaProperties.MIN_COST)).isEqualTo(AltchaProperties.MIN_COST);
		assertThat(cost(AltchaProperties.MAX_COST)).isEqualTo(AltchaProperties.MAX_COST);
		assertThatIllegalArgumentException().isThrownBy(() -> cost(AltchaProperties.MIN_COST - 1));
		assertThatIllegalArgumentException().isThrownBy(() -> cost(AltchaProperties.MAX_COST + 1));

		assertThat(expiry(AltchaProperties.MIN_EXPIRY)).isEqualTo(AltchaProperties.MIN_EXPIRY);
		assertThat(expiry(AltchaProperties.MAX_EXPIRY)).isEqualTo(AltchaProperties.MAX_EXPIRY);
		assertThatIllegalArgumentException()
				.isThrownBy(() -> expiry(AltchaProperties.MIN_EXPIRY.minusSeconds(1)));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> expiry(AltchaProperties.MAX_EXPIRY.plusSeconds(1)));
	}

	/** Constructs the record around the one knob under test, so the bound is asserted rather than the binder. */
	private static int cost(int cost) {
		return new AltchaProperties(true, cost, Duration.ofMinutes(10), Duration.ofSeconds(30), "").cost();
	}

	private static Duration expiry(Duration expiry) {
		return new AltchaProperties(true, 5000, expiry, Duration.ofSeconds(30), "").expiry();
	}
}
