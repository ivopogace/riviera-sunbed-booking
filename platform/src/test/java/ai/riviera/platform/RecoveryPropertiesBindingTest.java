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
 * Pins the S8 recovery configuration: the {@code riviera.recovery.link-base-url} binding (#368 AC:
 * mailed links point at the real deployed origin, not {@code localhost:4200}) and, since #426, the two
 * <em>bound, validated</em> token TTLs — split out of {@code MailerProfileWiringTest} when that class
 * moved into the {@code notification} module (#382): recovery is <em>edge</em> config
 * ({@code RecoveryProperties} stays root-package-private with {@code CustomerRecovery}, which builds the
 * links and stamps {@code expiresAt}), so its binding test stays at the root. Same harness posture as
 * its former host: {@link ApplicationContextRunner} + {@link ConfigDataApplicationContextInitializer},
 * real properties files, no Spring Boot context, no Docker.
 *
 * <p><strong>Why the TTLs are bounded.</strong> {@code CustomerRecovery} issues a token as
 * {@code clock.instant().plus(ttl)}, so {@code PT0S} makes {@code expiresAt == issuedAt}: every token is
 * born expired. Nothing fails — the mail is still built, still queued, still delivered (real SMTP since
 * #368, off the request thread since #369) — and the symptom reaching support is "the emails arrive and
 * every link says expired", with the reset flow, the one route back into an account, dead for everyone.
 * The ceilings answer the opposite risk: these tokens are unguessable bearer credentials sitting in a
 * mailbox, and a leaked reset link <em>is</em> account takeover, which is why this record ships the reset
 * TTL 24× shorter than the verification one.
 *
 * <p>Boot supplies both TTLs via {@code @DefaultValue}, so the guards need no null-defaulting — unlike
 * the three records in {@code booking}/{@code payment} that default inside their constructors. The
 * context tests are what show Boot's binder <em>propagates</em> the record's exception into a startup
 * failure rather than swallowing it; each asserts the root cause and message, not merely
 * {@code hasFailed()}.
 */
class RecoveryPropertiesBindingTest {

	@Test
	void linkBaseUrlDefaultsToLocalDevSpa() {
		recoveryRunner().run(context -> assertThat(context.getBean(RecoveryProperties.class).linkBaseUrl())
				.isEqualTo("http://localhost:4200"));
	}

	@Test
	void theEnvironmentOverridesTheLinkBaseUrl() {
		recoveryRunner().withSystemProperties("RIVIERA_RECOVERY_LINK_BASE_URL=https://app.example")
				.run(context -> assertThat(context.getBean(RecoveryProperties.class).linkBaseUrl())
						.isEqualTo("https://app.example"));
	}

	@Test
	void bindsTheShippedTokenTtls() {
		recoveryRunner().run(context -> {
			RecoveryProperties props = context.getBean(RecoveryProperties.class);

			assertThat(props.verificationTokenTtl())
					.as("unset config must reproduce today's behaviour exactly")
					.isEqualTo(Duration.ofHours(24));
			assertThat(props.resetTokenTtl()).isEqualTo(Duration.ofHours(1));
		});
	}

	@Test
	void aNonPositiveVerificationTokenTtlFailsTheContext() {
		recoveryRunner().withPropertyValues("riviera.recovery.verification-token-ttl=PT0S")
				.run(context -> assertThat(context)
						.as("expiresAt would equal issuedAt, so every verification link is dead on arrival "
								+ "and nothing anywhere reports a fault")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.recovery.verification-token-ttl"));
	}

	@Test
	void aNonPositiveResetTokenTtlFailsTheContext() {
		recoveryRunner().withPropertyValues("riviera.recovery.reset-token-ttl=PT0S")
				.run(context -> assertThat(context)
						.as("the reset flow is the one route back into an account — a born-expired token "
								+ "locks every user out of self-service recovery")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.recovery.reset-token-ttl"));
	}

	@Test
	void anOversizedVerificationTokenTtlFailsTheContext() {
		recoveryRunner().withPropertyValues("riviera.recovery.verification-token-ttl=P30D")
				.run(context -> assertThat(context)
						.as("a bearer credential nobody is prompted to spend, sitting in a mailbox for a "
								+ "month — verification is soft/non-blocking, so nothing forces its use")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.recovery.verification-token-ttl"));
	}

	@Test
	void anOversizedResetTokenTtlFailsTheContext() {
		recoveryRunner().withPropertyValues("riviera.recovery.reset-token-ttl=P30D")
				.run(context -> assertThat(context)
						.as("a leaked reset link IS account takeover; the ceiling holds the intent this "
								+ "record states — the reset TTL is the more sensitive of the two")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.recovery.reset-token-ttl"));
	}

	@Test
	void acceptsTheWholeTokenTtlRangeButNotBeyondIt() {
		assertThat(ttls(RecoveryProperties.MIN_TOKEN_TTL, RecoveryProperties.MIN_TOKEN_TTL)
				.resetTokenTtl())
				.as("the bounds bound the typo, not the operator — both ends are reachable")
				.isEqualTo(RecoveryProperties.MIN_TOKEN_TTL);
		assertThat(ttls(RecoveryProperties.MAX_VERIFICATION_TOKEN_TTL,
				RecoveryProperties.MAX_RESET_TOKEN_TTL).verificationTokenTtl())
				.isEqualTo(RecoveryProperties.MAX_VERIFICATION_TOKEN_TTL);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> ttls(RecoveryProperties.MIN_TOKEN_TTL.minusSeconds(1),
						Duration.ofHours(1)))
				.withMessageContaining("riviera.recovery.verification-token-ttl");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> ttls(Duration.ofHours(24),
						RecoveryProperties.MIN_TOKEN_TTL.minusSeconds(1)))
				.withMessageContaining("riviera.recovery.reset-token-ttl");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> ttls(RecoveryProperties.MAX_VERIFICATION_TOKEN_TTL.plusSeconds(1),
						Duration.ofHours(1)));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> ttls(Duration.ofHours(24),
						RecoveryProperties.MAX_RESET_TOKEN_TTL.plusSeconds(1)));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> ttls(Duration.ofHours(-24), Duration.ofHours(1)));
	}

	private static RecoveryProperties ttls(Duration verificationTokenTtl, Duration resetTokenTtl) {
		return new RecoveryProperties(verificationTokenTtl, resetTokenTtl, "http://localhost:4200");
	}

	private static ApplicationContextRunner recoveryRunner() {
		return new ApplicationContextRunner()
				.withInitializer(new ConfigDataApplicationContextInitializer())
				.withUserConfiguration(RecoveryBindOnly.class);
	}

	@Configuration
	@EnableConfigurationProperties(RecoveryProperties.class)
	static class RecoveryBindOnly {
	}
}
