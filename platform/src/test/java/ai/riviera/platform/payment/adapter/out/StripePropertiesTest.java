package ai.riviera.platform.payment.adapter.out;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The two {@code StripeClient} timeouts as <em>bound, validated</em> configuration (#426).
 *
 * <p>These exist because of issue #52 (risk R-3): the SDK's own defaults — 30s connect, 80s read — are
 * long enough that a degraded Stripe pins a request thread and its pooled connection, on the money path.
 * {@code 0} re-opens exactly that risk in the most deceptive way available, because it reads as "no
 * limit" to the operator who types it and means <em>infinite</em> to the JDK HTTP stack the SDK builds
 * on ({@code java.net.URLConnection#setConnectTimeout}: "A timeout of zero is interpreted as an infinite
 * timeout"). It is the same read-as-unbounded / means-degenerate inversion that made #408's
 * {@code queue-capacity=0} worth failing the boot over, with the sign flipped.
 *
 * <p>A negative duration is worse still at binding time and better at runtime: it survives
 * {@code Math.toIntExact} in {@code StripeConfig#clientBuilder} and is rejected only when a request is
 * actually made — i.e. the first PaymentIntent create of the deploy, mid-checkout.
 *
 * <p>The ceilings are the floors' argument run backwards: at or above the SDK default this knob exists
 * to <em>shorten</em>, configuring it explicitly is strictly worse than leaving it unset, so the value
 * that looks like extra tolerance is the one that gives back the pin.
 *
 * <p><strong>Why a compact constructor and not {@code @Validated} + {@code @Min}.</strong> There is no
 * JSR-303 implementation on the runtime classpath (#97 declined {@code spring-boot-starter-validation}),
 * and Boot validates {@code @ConfigurationProperties} only when one is present — an annotation would
 * bind and validate nothing.
 *
 * <p>Separate from {@code StripeConfigTest}, which is a {@code Binder}-based wiring spec for
 * {@code clientBuilder}: only an {@link ApplicationContextRunner} can show that Boot's binder
 * <em>propagates</em> the record's exception into a startup failure instead of falling back to a
 * default.
 */
class StripePropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(StripeProperties.class)
	static class BindOnly {
	}

	@Test
	void bindsTheShippedTimeouts() {
		runner.run(context -> {
			StripeProperties props = context.getBean(StripeProperties.class);

			assertThat(props.connectTimeout())
					.as("unset config must reproduce today's behaviour exactly")
					.isEqualTo(Duration.ofSeconds(5));
			assertThat(props.readTimeout()).isEqualTo(Duration.ofSeconds(20));
		});
	}

	@Test
	void aNonPositiveConnectTimeoutFailsTheContext() {
		runner.withPropertyValues("stripe.connect-timeout=PT0S")
				.run(context -> assertThat(context)
						.as("zero is the JDK HTTP stack's infinite timeout — the pinned request thread "
								+ "#52 R-3 closed, reached by a value that reads as 'no limit'")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("stripe.connect-timeout")
						.hasMessageContaining("infinite"));
	}

	@Test
	void aNonPositiveReadTimeoutFailsTheContext() {
		runner.withPropertyValues("stripe.read-timeout=PT0S")
				.run(context -> assertThat(context)
						.as("the read timeout waits on a Stripe that accepted the connection and stalled — "
								+ "the longer-lived and therefore worse of the two pins")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("stripe.read-timeout")
						.hasMessageContaining("infinite"));
	}

	@Test
	void aConnectTimeoutBelowTheFloorFailsTheContext() {
		runner.withPropertyValues("stripe.connect-timeout=PT0.2S")
				.run(context -> assertThat(context)
						.as("below a second the timeout fires on a normal sub-second PaymentIntent create, "
								+ "turning ordinary Stripe latency into failed checkouts")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("stripe.connect-timeout"));
	}

	@Test
	void anOversizedConnectTimeoutFailsTheContext() {
		runner.withPropertyValues("stripe.connect-timeout=PT60S")
				.run(context -> assertThat(context)
						.as("at or above the SDK's own 30s default, configuring the timeout explicitly is "
								+ "strictly worse than not configuring it")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("stripe.connect-timeout"));
	}

	@Test
	void anOversizedReadTimeoutFailsTheContext() {
		runner.withPropertyValues("stripe.read-timeout=PT120S")
				.run(context -> assertThat(context)
						.as("same argument against the SDK's own 80s read default")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("stripe.read-timeout"));
	}

	@Test
	void acceptsTheWholeTimeoutRangeButNotBeyondIt() {
		assertThat(timeouts(StripeProperties.MIN_TIMEOUT, StripeProperties.MIN_TIMEOUT).connectTimeout())
				.as("the bounds bound the typo, not the operator — both ends are reachable")
				.isEqualTo(StripeProperties.MIN_TIMEOUT);
		assertThat(timeouts(StripeProperties.MAX_CONNECT_TIMEOUT, StripeProperties.MAX_READ_TIMEOUT)
				.readTimeout())
				.isEqualTo(StripeProperties.MAX_READ_TIMEOUT);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> timeouts(StripeProperties.MIN_TIMEOUT.minusMillis(1),
						Duration.ofSeconds(20)))
				.withMessageContaining("stripe.connect-timeout");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> timeouts(Duration.ofSeconds(5),
						StripeProperties.MIN_TIMEOUT.minusMillis(1)))
				.withMessageContaining("stripe.read-timeout");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> timeouts(StripeProperties.MAX_CONNECT_TIMEOUT.plusMillis(1),
						Duration.ofSeconds(20)));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> timeouts(Duration.ofSeconds(5),
						StripeProperties.MAX_READ_TIMEOUT.plusMillis(1)));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> timeouts(Duration.ofSeconds(-5), Duration.ofSeconds(20)));
	}

	/** Unset config binds both timeouts as null — the guards must run AFTER the defaulting. */
	@Test
	void unsetTimeoutsStillDefault() {
		assertThat(new StripeProperties("", "whsec_test", null, null))
				.isEqualTo(new StripeProperties("", "whsec_test", Duration.ofSeconds(5),
						Duration.ofSeconds(20)));
	}

	private static StripeProperties timeouts(Duration connectTimeout, Duration readTimeout) {
		return new StripeProperties("", "whsec_test", connectTimeout, readTimeout);
	}
}
