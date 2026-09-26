package ai.riviera.platform.notification.adapter.in;

import java.time.Duration;

import ai.riviera.platform.notification.application.MailTransportBudget;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Binds {@link MailTransportProperties} and maps it to the application-layer
 * {@link MailTransportBudget}, keeping the configuration type at the adapter edge.
 *
 * <p>Never gate this on the {@code mailer} profile: the budget is the drain window for
 * <em>both</em> mail pools, which exist in every profile, so a profile-gated bean would leave them
 * unconstructible wherever the mock transport runs (everywhere except production).
 */
@Configuration
@EnableConfigurationProperties(MailTransportProperties.class)
class MailTransportConfig {

	@Bean
	MailTransportBudget mailTransportBudget(MailTransportProperties properties) {
		return new MailTransportBudget(Duration.ofMillis(properties.socketTimeoutMs()));
	}
}
