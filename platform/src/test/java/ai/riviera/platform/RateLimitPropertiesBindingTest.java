package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the SHIPPED rate-limit client-IP configuration (issue #286): the defaults live in
 * {@code application.properties} and nowhere else, each is env-overridable through an explicit
 * {@code ${VAR:default}} placeholder, and the colon-bearing IPv6 CIDRs survive placeholder parsing —
 * Spring splits a placeholder's name from its default on the FIRST colon, and a silent mis-parse
 * there would ship a weakened security control. Uses {@link ApplicationContextRunner} plus
 * {@link ConfigDataApplicationContextInitializer} so the real properties file is loaded without a
 * Spring Boot context, no web layer and no Docker (sibling to {@code MockMailerProdGuardTest}).
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
}
