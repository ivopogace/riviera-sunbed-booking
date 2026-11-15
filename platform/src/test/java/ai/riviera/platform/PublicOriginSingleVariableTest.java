package ai.riviera.platform;

import java.util.Map;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.Environment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The shipped properties files bind every key built on the deployed origin from {@code RIVIERA_PUBLIC_ORIGIN} alone:
 * {@code web}'s crawl origin and both emailed-link keys, under every profile; a blank value reaches the mail keys
 * blank (their records then abort the boot), never their local default. Rationale: RESPONSIBILITIES.md §notification.
 */
class PublicOriginSingleVariableTest {

	private static final String ORIGIN = "https://riviera.example";

	private static final String WEB_KEY = "riviera.web.public-origin";

	private static final String RECOVERY_KEY = "riviera.recovery.link-base-url";

	private static final String BOOKING_KEY = "riviera.notification.booking-link.base-url";

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(context -> context.getEnvironment().getPropertySources()
					.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
			.withInitializer(new ConfigDataApplicationContextInitializer());

	@Test
	void theOneVariableReachesEveryOriginKey() {
		runner.withSystemProperties("RIVIERA_PUBLIC_ORIGIN=" + ORIGIN).run(context -> allEqual(context.getEnvironment()));
	}

	@Test
	void theOneVariableReachesEveryOriginKeyUnderTheMailerProfile() {
		runner.withSystemProperties("RIVIERA_PUBLIC_ORIGIN=" + ORIGIN)
				.withPropertyValues("spring.profiles.active=prod,mailer")
				.run(context -> allEqual(context.getEnvironment()));
	}

	@Test
	void unsetLeavesTheCrawlOriginEmptyAndTheMailLinksOnTheLocalDevSpa() {
		runner.run(context -> {
			Environment environment = context.getEnvironment();
			assertEquals("", environment.getProperty(WEB_KEY));
			assertEquals("http://localhost:4200", environment.getProperty(RECOVERY_KEY));
			assertEquals("http://localhost:4200", environment.getProperty(BOOKING_KEY));
		});
	}

	@Test
	void aBlankVariableReachesTheMailKeysBlankRatherThanTheirDefault() {
		runner.withInitializer(context -> context.getEnvironment().getPropertySources()
				.addFirst(new MapPropertySource("blank-origin", Map.of("RIVIERA_PUBLIC_ORIGIN", "")))).run(context -> {
			Environment environment = context.getEnvironment();
			assertEquals("", environment.getProperty(RECOVERY_KEY));
			assertEquals("", environment.getProperty(BOOKING_KEY));
		});
	}

	private static void allEqual(Environment environment) {
		Consumer<String> isTheOrigin = key -> assertEquals(ORIGIN, environment.getProperty(key), key);
		isTheOrigin.accept(WEB_KEY);
		isTheOrigin.accept(RECOVERY_KEY);
		isTheOrigin.accept(BOOKING_KEY);
	}
}
