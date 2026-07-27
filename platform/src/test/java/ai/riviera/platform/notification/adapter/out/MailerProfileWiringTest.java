package ai.riviera.platform.notification.adapter.out;

import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.mail.autoconfigure.MailSenderAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import ai.riviera.platform.notification.application.Mailer;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the SHIPPED {@code mailer}-profile boot posture (#368, AC-3/AC-4): the SMTP config lives in
 * {@code application-mailer.properties} as env placeholders WITHOUT defaults, so activating the profile
 * with the environment unset aborts at boot (unresolved placeholder) — never on first send — while the
 * default profile keeps the recording {@link MockMailer} and creates no mail session at all (the
 * empty-default trap: a {@code spring.mail.host} with an empty default in the main properties file would
 * satisfy the mail auto-configuration's condition in every profile). Uses {@link ApplicationContextRunner}
 * + {@link ConfigDataApplicationContextInitializer} so the real properties files are loaded without a
 * Spring Boot context, no web layer and no Docker (sibling to {@code RateLimitPropertiesBindingTest}).
 */
class MailerProfileWiringTest {

	private static final String[] SMTP_ENV = {
			"RIVIERA_SMTP_HOST=smtp.test.local",
			"RIVIERA_SMTP_USERNAME=smtp-user",
			"RIVIERA_SMTP_PASSWORD=smtp-pass",
			"RIVIERA_MAIL_FROM=noreply@test.local"};

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withConfiguration(AutoConfigurations.of(MailSenderAutoConfiguration.class))
			.withUserConfiguration(SmtpMailer.class, MockMailer.class);

	@Test
	void mailerProfileWithoutSmtpConfigFailsAtBoot() {
		runner.withPropertyValues("spring.profiles.active=mailer")
				.run(context -> assertThat(context).hasFailed());
	}

	@Test
	void mailerProfileWithSmtpConfigBootsSmtpMailer() {
		runner.withPropertyValues("spring.profiles.active=mailer").withSystemProperties(SMTP_ENV)
				.run(context -> {
					assertThat(context).hasSingleBean(Mailer.class);
					assertThat(context.getBean(Mailer.class)).isInstanceOf(SmtpMailer.class);
				});
	}

	@Test
	void smtpPostureIsAuthedStarttlsWithFiniteTimeouts() {
		runner.withPropertyValues("spring.profiles.active=mailer").withSystemProperties(SMTP_ENV)
				.run(context -> {
					JavaMailSenderImpl sender = (JavaMailSenderImpl) context.getBean(JavaMailSender.class);
					assertThat(sender.getPort()).isEqualTo(587);
					Properties props = sender.getJavaMailProperties();
					assertThat(props.getProperty("mail.smtp.auth")).isEqualTo("true");
					assertThat(props.getProperty("mail.smtp.starttls.enable")).isEqualTo("true");
					assertThat(props.getProperty("mail.smtp.starttls.required")).isEqualTo("true");
					// Jakarta Mail's defaults are INFINITE — each timeout must be an explicit finite value.
					assertThat(props.getProperty("mail.smtp.connectiontimeout")).satisfies(finiteMillis());
					assertThat(props.getProperty("mail.smtp.timeout")).satisfies(finiteMillis());
					assertThat(props.getProperty("mail.smtp.writetimeout")).satisfies(finiteMillis());
				});
	}

	@Test
	void theEnvironmentCanRelaxStarttlsRequiredForLocalSinks() {
		runner.withPropertyValues("spring.profiles.active=mailer")
				.withSystemProperties(SMTP_ENV)
				.withSystemProperties("RIVIERA_SMTP_STARTTLS_REQUIRED=false")
				.run(context -> {
					JavaMailSenderImpl sender = (JavaMailSenderImpl) context.getBean(JavaMailSender.class);
					// enable stays on (opportunistic upgrade); only the hard requirement is relaxed.
					assertThat(sender.getJavaMailProperties().getProperty("mail.smtp.starttls.enable")).isEqualTo("true");
					assertThat(sender.getJavaMailProperties().getProperty("mail.smtp.starttls.required")).isEqualTo("false");
				});
	}

	@Test
	void smtp4devProfileBootsTheRealMailerOnLocalDefaultsWithoutEnv() {
		runner.withPropertyValues("spring.profiles.active=smtp4dev")
				.run(context -> {
					assertThat(context).hasSingleBean(Mailer.class);
					assertThat(context.getBean(Mailer.class)).isInstanceOf(SmtpMailer.class);
					JavaMailSenderImpl sender = (JavaMailSenderImpl) context.getBean(JavaMailSender.class);
					assertThat(sender.getHost()).isEqualTo("localhost");
					assertThat(sender.getPort()).isEqualTo(2525);
				});
	}

	@Test
	void defaultProfileKeepsTheRecordingMockAndNoMailSession() {
		runner.run(context -> {
			assertThat(context).hasSingleBean(Mailer.class);
			assertThat(context.getBean(Mailer.class)).isInstanceOf(MockMailer.class);
			assertThat(context).doesNotHaveBean(JavaMailSender.class);
		});
	}

	private static org.assertj.core.api.ThrowingConsumer<String> finiteMillis() {
		return value -> assertThat(Integer.parseInt(value)).isPositive();
	}
}
