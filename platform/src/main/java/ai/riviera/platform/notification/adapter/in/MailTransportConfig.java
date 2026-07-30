package ai.riviera.platform.notification.adapter.in;

import java.time.Duration;

import ai.riviera.platform.notification.application.MailTransportBudget;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Binds {@link MailTransportProperties} and maps it to the application-layer {@link MailTransportBudget},
 * keeping the configuration type at the adapter edge and the inner hexagon framework-light (the
 * {@code CustomerRetentionProperties → RetentionWindow} pattern).
 *
 * <p>Deliberately <strong>unconditional</strong> and not gated on the {@code mailer} profile. The budget
 * is the drain window for <em>both</em> mail pools, and both exist in every profile — the recovery
 * dispatcher is a plain {@code @Component} and the registry executor is what the confirmation listener's
 * {@code @Async} names — so a profile-gated bean would leave them unconstructible wherever the mock
 * transport runs, which is everywhere except production.
 */
@Configuration
@EnableConfigurationProperties(MailTransportProperties.class)
class MailTransportConfig {

	@Bean
	MailTransportBudget mailTransportBudget(MailTransportProperties properties) {
		return new MailTransportBudget(Duration.ofMillis(properties.socketTimeoutMs()));
	}
}
