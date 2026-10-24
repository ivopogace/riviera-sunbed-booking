package ai.riviera.platform;

import java.util.List;
import java.util.Map;

import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.test.context.ContextConfigurationAttributes;
import org.springframework.test.context.ContextCustomizer;
import org.springframework.test.context.ContextCustomizerFactory;
import org.springframework.test.context.MergedContextConfiguration;

/**
 * The properties every Spring test context starts from, so the common case is one cached context (#1599):
 * the bootstrap admin's password, a build commit id, the no-show sweep off, the request and abandoned-payment
 * sweeps held outside the test window. Registered in {@code META-INF/spring.factories}, so it reaches every test
 * class under any profile; placed above the application's configuration and below a class's own
 * {@code @SpringBootTest(properties)} / {@code @TestPropertySource}, so a class declares one of these
 * keys only to opt out ({@code TestContextDriftArchitectureTests} fails a restated shared value).
 */
public final class SharedTestProperties implements ContextCustomizerFactory {

	/** The bootstrap admin's credential the suite starts from; the literal the ITs log in with. */
	public static final String OPERATOR_PASSWORD = "test-operator-pw";

	/** The commit id every context publishes on {@code /actuator/info}, so one context pins the public body. */
	public static final String BUILD_COMMIT = "0123456789abcdef0123456789abcdef01234567";

	static final Map<String, Object> VALUES = Map.of(
			"riviera.operator.password", OPERATOR_PASSWORD,
			"riviera.observability.build-commit", BUILD_COMMIT,
			"booking.no-show.enabled", "false",
			"booking.request.initial-delay", "PT2H",
			"booking.awaiting-payment.initial-delay", "PT2H");

	static final String SOURCE_NAME = "sharedTestProperties";

	@Override
	public ContextCustomizer createContextCustomizer(Class<?> testClass,
			List<ContextConfigurationAttributes> configAttributes) {
		return Customizer.INSTANCE;
	}

	/** An enum, so every context shares one equal customizer and the cache key stays the class's own. */
	enum Customizer implements ContextCustomizer {
		INSTANCE;

		@Override
		public void customizeContext(ConfigurableApplicationContext context, MergedContextConfiguration mergedConfig) {
			MutablePropertySources sources = context.getEnvironment().getPropertySources();
			MapPropertySource shared = new MapPropertySource(SOURCE_NAME, VALUES);
			if (sources.contains(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME)) {
				sources.addAfter(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME, shared);
			} else {
				sources.addLast(shared);
			}
		}
	}
}
