package ai.riviera.platform.notification.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Binds {@link TemWebhookProperties} and serves the SNS protocol's two outbound calls from one client. */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(TemWebhookProperties.class)
class TemWebhookConfig {

	private final SnsHttpClient snsHttp = new SnsHttpClient();

	/** A method reference, not the client itself: it implements both seams, which would make each bean ambiguous. */
	@Bean
	SigningCertificateSource signingCertificateSource() {
		return snsHttp::fetch;
	}

	@Bean
	SubscriptionConfirmer subscriptionConfirmer() {
		return snsHttp::confirm;
	}
}
