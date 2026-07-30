package ai.riviera.platform.notification.adapter.in;

import java.time.Duration;

import ai.riviera.platform.notification.application.MailResubmissionWindow;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Binds {@link MailResubmissionProperties} and maps it to the application-layer
 * {@link MailResubmissionWindow} (#405) — the same edge-binding / framework-light-hexagon split as
 * {@link MailTransportConfig}.
 *
 * <p>Unconditional, for the same reason that config is: the resubmission guard is not a property of
 * the real transport. Under the mock mailer a resubmission still re-invokes the listener and still
 * must not do so twice, and the ITs that prove the scope run in exactly that profile.
 */
@Configuration
@EnableConfigurationProperties(MailResubmissionProperties.class)
class MailResubmissionConfig {

	@Bean
	MailResubmissionWindow mailResubmissionWindow(MailResubmissionProperties properties) {
		return new MailResubmissionWindow(Duration.ofMillis(properties.cooldownMs()));
	}
}
