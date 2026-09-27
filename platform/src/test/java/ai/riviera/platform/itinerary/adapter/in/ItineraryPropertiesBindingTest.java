package ai.riviera.platform.itinerary.adapter.in;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The move budget binds from {@code riviera.itinerary.max-switches}, defaults to three, and refuses
 * a value outside 1..3 at startup (design D13) — through Boot's binder, so the record's guard is
 * proven to fail the context rather than fall back to a default.
 */
class ItineraryPropertiesBindingTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(ItineraryProperties.class)
	static class BindOnly {
	}

	@Test
	void defaultsToThreeMoves() {
		runner.run(context -> assertThat(context.getBean(ItineraryProperties.class).maxSwitches()).isEqualTo(3));
	}

	@Test
	void bindsASmallerBudget() {
		runner.withPropertyValues("riviera.itinerary.max-switches=2")
				.run(context -> assertThat(context.getBean(ItineraryProperties.class).maxSwitches()).isEqualTo(2));
	}

	@Test
	void refusesABudgetPastTheCeilingAtStartup() {
		runner.withPropertyValues("riviera.itinerary.max-switches=4").run(context -> {
			assertThat(context).hasFailed();
			assertThat(context.getStartupFailure()).rootCause().isInstanceOf(IllegalArgumentException.class)
					.hasMessageContaining("between 1 and 3");
		});
	}

	@Test
	void refusesZeroDirectly() {
		assertThatIllegalArgumentException().isThrownBy(() -> new ItineraryProperties(0))
				.withMessageContaining("riviera.itinerary.max-switches");
	}
}
