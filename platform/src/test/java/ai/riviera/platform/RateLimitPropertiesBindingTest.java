package ai.riviera.platform;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * Pins the SHIPPED rate-limit configuration as <em>bound, validated</em> values.
 *
 * <p><strong>The client-IP half:</strong> the defaults live in
 * {@code application.properties} and nowhere else, each is env-overridable through an explicit
 * {@code ${VAR:default}} placeholder, and the colon-bearing IPv6 CIDRs survive placeholder parsing —
 * Spring splits a placeholder's name from its default on the FIRST colon, and a silent mis-parse
 * there would ship a weakened security control. Uses {@link ApplicationContextRunner} plus
 * {@link ConfigDataApplicationContextInitializer} so the real properties file is loaded without a
 * Spring Boot context, no web layer and no Docker (sibling to {@code MockMailerProdGuardTest}).
 *
 * <p><strong>The key-cap half:</strong> {@code max-tracked-keys} is bounded on both
 * ends, because the map-bounding check in {@code RateLimitFilter#bucketFor} is {@code size() >= cap}.
 * A non-positive cap therefore fires on <em>every</em> new key and, since {@code removeIf} cannot
 * bring the size below zero, falls through to {@code buckets.clear()} — so each new key wipes every
 * other key's spent tokens and the limiter throttles nobody, having booted
 * cleanly with only a {@code DEBUG} line as evidence. A small-but-positive cap degrades the same way,
 * just less completely, which is why the floor is not {@code 1}. The ceiling closes the hole from the
 * other end: the cap is the only thing bounding eleven independent dimension maps.
 *
 * <p><strong>Why a compact constructor and not {@code @Validated} + {@code @Min}.</strong> There is
 * no JSR-303 implementation on the runtime classpath — the project declined
 * {@code spring-boot-starter-validation} deliberately, in favour of explicit checks in records — and
 * Boot only validates {@code @ConfigurationProperties} when an implementation is present. An
 * annotation here would therefore bind and validate <em>nothing</em>: the same silent degradation,
 * arrived at from the other side.
 *
 * <p>The context-level cap tests earn their place alongside the direct-construction one because only
 * they show that Boot's binder <em>propagates</em> the record's exception into a startup failure
 * instead of swallowing it and falling back to a default — the half the guard's usefulness actually
 * rests on. Each asserts the root cause and message, not merely {@code hasFailed()}: any bind or
 * bean-creation error satisfies the weaker assertion, so it would stay green with the guard gone.
 */
class RateLimitPropertiesBindingTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(RateLimitProperties.class)
	static class BindOnly {
	}

	@Test
	void bindsTheShippedTrustedProxyDefaultsIncludingTheIpv6Ranges() {
		runner.run(context -> assertThat(context.getBean(RateLimitProperties.class).trustedProxies())
				.containsExactly("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
						"169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10"));
	}

	@Test
	void bindsTheShippedClientIpHeaderDefault() {
		runner.run(context -> assertThat(context.getBean(RateLimitProperties.class).clientIpHeader())
				.isEqualTo("CF-Connecting-IP"));
	}

	@Test
	void bindsTheShippedPerUsernameLoginBudgetDefault() {
		runner.run(context -> {
			RateLimitProperties.Limit username = context.getBean(RateLimitProperties.class).username();
			assertThat(username.capacity()).isEqualTo(15);
			assertThat(username.refillPeriod()).isEqualTo(Duration.ofMinutes(15));
		});
	}

	@Test
	void theEnvironmentOverridesThePerUsernameBudget() {
		runner.withSystemProperties(
				"RIVIERA_RATELIMIT_USERNAME_CAPACITY=3",
				"RIVIERA_RATELIMIT_USERNAME_REFILL=PT30S")
				.run(context -> {
					RateLimitProperties.Limit username = context.getBean(RateLimitProperties.class).username();
					assertThat(username.capacity()).isEqualTo(3);
					assertThat(username.refillPeriod()).isEqualTo(Duration.ofSeconds(30));
				});
	}

	@Test
	void theEnvironmentOverridesBothPlaceholders() {
		runner.withSystemProperties(
				"RIVIERA_RATELIMIT_TRUSTED_PROXIES=203.0.113.0/24",
				"RIVIERA_RATELIMIT_CLIENT_IP_HEADER=True-Client-IP")
				.run(context -> {
					RateLimitProperties props = context.getBean(RateLimitProperties.class);
					assertThat(props.trustedProxies()).containsExactly("203.0.113.0/24");
					assertThat(props.clientIpHeader()).isEqualTo("True-Client-IP");
				});
	}

	/**
	 * An empty override is the documented "trust no proxy" posture — the one-config kill switch that
	 * makes the resolver ignore every forwarding header, the client-IP one included, and key on the
	 * socket address. Supplied as an inlined property rather than via
	 * {@link ApplicationContextRunner#withSystemProperties} because that helper <em>clears</em> a
	 * property given an empty value, which is the opposite of the case under test.
	 */
	@Test
	void anEmptyTrustedProxyOverrideYieldsNoTrustedProxies() {
		runner.withPropertyValues("RIVIERA_RATELIMIT_TRUSTED_PROXIES=")
				.run(context -> assertThat(context.getBean(RateLimitProperties.class).trustedProxies())
						.isEmpty());
	}

	@Test
	void bindsTheShippedKeyCapDefault() {
		runner.run(context -> assertThat(context.getBean(RateLimitProperties.class).maxTrackedKeys())
				.as("unset config must reproduce today's behaviour exactly")
				.isEqualTo(100_000));
	}

	@Test
	void aNonPositiveKeyCapFailsTheContext() {
		runner.withPropertyValues("riviera.ratelimit.max-tracked-keys=0")
				.run(context -> assertThat(context)
						.as("size() >= 0 holds for every new key, so each one would clear every other "
								+ "key's spent tokens — a limiter that boots clean and throttles nobody")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("max-tracked-keys"));
	}

	@Test
	void aKeyCapBelowTheFloorFailsTheContext() {
		runner.withPropertyValues("riviera.ratelimit.max-tracked-keys=2")
				.run(context -> assertThat(context)
						.as("a small-but-positive cap degrades the same way, just less completely")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("max-tracked-keys"));
	}

	@Test
	void anOversizedKeyCapFailsTheContext() {
		runner.withPropertyValues("riviera.ratelimit.max-tracked-keys=1000000")
				.run(context -> assertThat(context)
						.as("the shipped value with one extra digit restores the unbounded growth the cap "
								+ "exists to prevent, across eleven dimension maps")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("max-tracked-keys"));
	}

	@Test
	void acceptsTheWholeKeyCapTuningRangeButNotBeyondIt() {
		assertThat(keyCap(RateLimitProperties.MIN_TRACKED_KEY_CAP))
				.as("the bounds bound the typo, not the operator — both ends are reachable")
				.isEqualTo(RateLimitProperties.MIN_TRACKED_KEY_CAP);
		assertThat(keyCap(RateLimitProperties.MAX_TRACKED_KEY_CAP))
				.isEqualTo(RateLimitProperties.MAX_TRACKED_KEY_CAP);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> keyCap(RateLimitProperties.MIN_TRACKED_KEY_CAP - 1));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> keyCap(RateLimitProperties.MAX_TRACKED_KEY_CAP + 1));
		assertThatIllegalArgumentException().isThrownBy(() -> keyCap(-1));
	}

	/** Constructs the record around the one knob under test, so the bound is asserted rather than the binder. */
	private static int keyCap(int maxTrackedKeys) {
		RateLimitProperties.Limit limit = new RateLimitProperties.Limit(60, Duration.ofMinutes(1));
		return new RateLimitProperties(true, limit, limit, limit, limit, limit, maxTrackedKeys, List.of(), "")
				.maxTrackedKeys();
	}
}
