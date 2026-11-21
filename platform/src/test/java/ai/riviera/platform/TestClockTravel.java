package ai.riviera.platform;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.test.context.ContextConfigurationAttributes;
import org.springframework.test.context.ContextCustomizer;
import org.springframework.test.context.ContextCustomizerFactory;
import org.springframework.test.context.MergedContextConfiguration;

/**
 * Moves every test context's application clock to the instant in {@code RIVIERA_TEST_TRAVEL_TO}, so a test
 * whose literal date will one day meet "today" is shown failing without waiting for it (#1827):
 * {@code RIVIERA_TEST_TRAVEL_TO=2027-03-02T10:00:00Z ./gradlew test --rerun --tests "*SomeIT*"}. Unset, it
 * does nothing. A test that reads the wall for "today" goes red under travel for that reason alone.
 */
public final class TestClockTravel implements ContextCustomizerFactory {

	static final String ENV = "RIVIERA_TEST_TRAVEL_TO";

	@Override
	public ContextCustomizer createContextCustomizer(Class<?> testClass,
			List<ContextConfigurationAttributes> configAttributes) {
		return System.getenv(ENV) == null ? null : Customizer.INSTANCE;
	}

	/** Offsets the production {@code clock} bean and a shared {@link MovableClock}; a test's own fixed clock stays. */
	enum Customizer implements ContextCustomizer {
		INSTANCE;

		@Override
		public void customizeContext(ConfigurableApplicationContext context, MergedContextConfiguration mergedConfig) {
			Instant target = Instant.parse(System.getenv(ENV));
			Duration ahead = Duration.between(Instant.now(), target);
			context.getBeanFactory().addBeanPostProcessor(new BeanPostProcessor() {
				@Override
				public Object postProcessAfterInitialization(Object bean, String beanName) {
					if (bean instanceof MovableClock movable) {
						movable.set(movable.instant().plus(ahead));
						return bean;
					}
					return "clock".equals(beanName) && bean instanceof Clock clock ? Clock.offset(clock, ahead) : bean;
				}
			});
		}
	}
}
