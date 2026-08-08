package ai.riviera.platform.notification.application;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The one relationship this test class pins: the shutdown drain window is <em>derived from</em> the
 * relay's socket budget, not a second constant that happens to disagree with it.
 *
 * <p>Before this record, {@code AsyncMailDispatcher} and {@code RegistryMailExecutorConfig} each carried
 * {@code SHUTDOWN_DRAIN_SECONDS = 5} while {@code application-mailer.properties} gave the transport
 * three 10-second timeouts, so a single degraded send could legitimately outlast the drain — Spring then
 * gives up without interrupting, context shutdown proceeds, and {@code HikariDataSource} closes
 * underneath threads still doing real work. Nothing tied the two numbers, so tuning either silently
 * invalidated the other. These tests are what makes that impossible to reintroduce: they assert the
 * derivation, so a literal reappearing anywhere goes red.
 */
class MailTransportBudgetTest {

	@Test
	void derivesTheDrainFromTheSocketBudget() {
		MailTransportBudget budget = new MailTransportBudget(Duration.ofMillis(10_000));

		assertThat(budget.shutdownDrain())
				.as("one decision, not two constants that happen to disagree")
				.isEqualTo(Duration.ofMillis(10_000));
	}

	@Test
	void aRetunedRelayBudgetMovesTheDrainWithIt() {
		assertThat(new MailTransportBudget(Duration.ofMillis(4_000)).shutdownDrain())
				.as("#370 retunes the relay budget against a real relay; the drain must follow "
						+ "without a second edit")
				.isEqualTo(Duration.ofMillis(4_000));
		assertThat(new MailTransportBudget(Duration.ofMillis(250)).shutdownDrain())
				.isEqualTo(Duration.ofMillis(250));
	}

	@Test
	void rejectsAnAbsentOrNonPositiveBudget() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new MailTransportBudget(null))
				.withMessageContaining("socketTimeout");
		assertThatIllegalArgumentException()
				.as("a zero budget drains for no time at all — the gap #410 closes, reopened")
				.isThrownBy(() -> new MailTransportBudget(Duration.ZERO))
				.withMessageContaining("socketTimeout");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new MailTransportBudget(Duration.ofMillis(-1)));
	}
}
