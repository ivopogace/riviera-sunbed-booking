package ai.riviera.platform.notification.adapter.in;

import java.time.Duration;
import java.util.List;

import ai.riviera.platform.notification.application.MailTransportBudget;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.Environment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The SMTP socket budget as <em>one</em> bound, validated knob (#410 Part 2), and the proof that the
 * three relay timeouts and the pools' shutdown drain all read it rather than restating it.
 *
 * <p><strong>Why the interpolation test is the important one.</strong> #368 gave the transport finite
 * timeouts because Jakarta Mail's defaults are <em>infinite</em> — long enough for a degraded relay to
 * pin a sending thread forever. Those three values living as literals in
 * {@code application-mailer.properties} while the drain window lived as a literal in two Java classes is
 * exactly the disagreement #410 is about; resolving all three through the environment is what shows the
 * relationship holds by construction and not by two people remembering the same number.
 *
 * <p><strong>Why a compact constructor and not {@code @Validated} + {@code @Min}</strong> — the same
 * reason as {@link RegistryMailProperties}: there is no JSR-303 implementation on the runtime classpath
 * (#97 declined {@code spring-boot-starter-validation} deliberately), so Boot would bind and validate
 * nothing. The context-level tests earn their place beside the direct-construction ones because only
 * they show Boot's binder <em>propagating</em> the record's exception into a startup failure instead of
 * swallowing it and falling back to a default.
 */
class MailTransportPropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(MailTransportConfig.class);

	private static final List<String> RELAY_TIMEOUT_KEYS = List.of(
			"spring.mail.properties.mail.smtp.connectiontimeout",
			"spring.mail.properties.mail.smtp.timeout",
			"spring.mail.properties.mail.smtp.writetimeout");

	@Test
	void bindsTheShippedDefault() {
		runner.run(context -> assertThat(context.getBean(MailTransportBudget.class).socketTimeout())
				.as("unset config must reproduce #368's value exactly — this slice makes it tunable, "
						+ "not different")
				.isEqualTo(Duration.ofMillis(10_000)));
	}

	@Test
	void theEnvironmentOverridesTheBudget() {
		runner.withSystemProperties("RIVIERA_SMTP_SOCKET_TIMEOUT_MS=4000")
				.run(context -> assertThat(context.getBean(MailTransportBudget.class).socketTimeout())
						.as("#370 must be able to retune the relay budget from the deploy environment")
						.isEqualTo(Duration.ofMillis(4_000)));
	}

	@Test
	void theDrainWindowIsTheBudget() {
		runner.withPropertyValues("riviera.notification.mail.socket-timeout-ms=6000")
				.run(context -> assertThat(context.getBean(MailTransportBudget.class).shutdownDrain())
						.as("the pools drain for the window this bean derives; a literal anywhere is the bug")
						.isEqualTo(Duration.ofMillis(6_000)));
	}

	/**
	 * AC-8, for <strong>every</strong> profile that drives the real {@code SmtpMailer} — {@code mailer}
	 * (the deployment posture) and {@code smtp4dev} (the local sink). Both are parameterized because the
	 * #410 generalization audit found the second still restating the literal after the first was fixed,
	 * and a local profile is precisely where a divergence hides until it reproduces deployed.
	 *
	 * <p>The {@code mailer} profile's other placeholders ({@code RIVIERA_SMTP_HOST} and friends) have no
	 * defaults on purpose — activating it without the environment set must abort at boot — but resolving
	 * one key does not resolve them, so this reads the three timeouts without any relay secret.
	 */
	@ParameterizedTest
	@ValueSource(strings = {"mailer", "smtp4dev"})
	void theRelayTimeoutsAreTheSameKnobTheDrainIsDerivedFrom(String profile) {
		runner.withPropertyValues("spring.profiles.active=" + profile,
						"riviera.notification.mail.socket-timeout-ms=7000")
				.run(context -> {
					Environment env = context.getEnvironment();

					assertThat(RELAY_TIMEOUT_KEYS)
							.allSatisfy(key -> assertThat(env.getProperty(key))
									.as("%s must interpolate the knob under the %s profile: a restated "
											+ "literal is how the drain and the relay budget drifted "
											+ "apart, and an unresolved placeholder puts Jakarta Mail's "
											+ "INFINITE default one typo away (#368)", key, profile)
									.isEqualTo("7000"));
					assertThat(context.getBean(MailTransportBudget.class).socketTimeout())
							.isEqualTo(Duration.ofMillis(7_000));
				});
	}

	@Test
	void aNonPositiveSocketTimeoutFailsTheContext() {
		runner.withPropertyValues("riviera.notification.mail.socket-timeout-ms=0")
				.run(context -> assertThat(context)
						.as("a typo must fail the boot, not restore the infinite transport timeouts #368 closed")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("socket-timeout-ms")
						.hasMessageContaining("infinite"));
	}

	@Test
	void anOversizedSocketTimeoutFailsTheContext() {
		runner.withPropertyValues("riviera.notification.mail.socket-timeout-ms=60000")
				.run(context -> assertThat(context)
						.as("the drain is derived from this, so an oversized value would outlast the "
								+ "platform's SIGTERM grace and get the process killed mid-shutdown")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("socket-timeout-ms")
						.hasMessageContaining("SIGTERM"));
	}

	/**
	 * The stacking check that used to live here is gone, and its absence is the point (#456).
	 *
	 * <p>It asserted {@code SHUTDOWN_BUDGET_MS * DRAINING_POOLS <= MAIL_SHUTDOWN_BUDGET_MS} where the
	 * left operand was <em>defined</em> as the right divided by the same factor — {@code (a / b) * b <= a}
	 * for every positive integer pair, so it could not fail. Its only live assertion was
	 * {@code DRAINING_POOLS == 2}, a change-detector that fires when someone edits the very constant they
	 * would have had to remember to edit; #404 landed a third draining pool in {@code booking} and it did
	 * not fire, because a mail-scoped count cannot see a {@code booking} pool and invariant #11 rightly
	 * stops it trying.
	 *
	 * <p>The replacement is {@code ShutdownDrainArchitectureTest} in the root test package, which
	 * <em>discovers</em> draining pools from bytecode and sums their claims against
	 * {@code ShutdownBudget.SIGTERM_GRACE_MS}. What survives here is the half this module can honestly
	 * own: its own knob stays inside its own claim, enforced at boot, pinned below.
	 */
	@Test
	void acceptsTheWholeTuningRangeButNotBeyondIt() {
		assertThat(new MailTransportProperties(1).socketTimeoutMs()).isEqualTo(1);
		assertThat(new MailTransportProperties(MailTransportProperties.SHUTDOWN_BUDGET_MS).socketTimeoutMs())
				.as("the ceiling bounds the typo, not the operator — it is reachable")
				.isEqualTo(MailTransportProperties.SHUTDOWN_BUDGET_MS);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> new MailTransportProperties(MailTransportProperties.SHUTDOWN_BUDGET_MS + 1));
		assertThatIllegalArgumentException().isThrownBy(() -> new MailTransportProperties(0));
		assertThatIllegalArgumentException().isThrownBy(() -> new MailTransportProperties(-1));
	}
}
