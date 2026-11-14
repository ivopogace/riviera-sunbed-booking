package ai.riviera.platform.notification.adapter.in;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The TEM delivery-event feed's trust config: our Topics &amp; Events {@code topicArn}, the location of Scaleway's
 * CA {@code trustChain} PEM (a Spring resource, e.g. {@code file:/etc/secrets/sns-trust-chain.pem}), and the
 * hosts a cert or subscribe URL may name. A blank ARN or chain rejects every delivery, so an unregistered
 * deployment boots and stores nothing (runbook: {@code docs/runbooks/mailer-profile-smoke-test.md}).
 */
@ConfigurationProperties("riviera.notification.tem-webhook")
public record TemWebhookProperties(String topicArn, String trustChain, List<String> signingCertHosts,
		List<String> subscribeHosts) {

	public TemWebhookProperties {
		topicArn = topicArn == null ? "" : topicArn.strip();
		trustChain = trustChain == null ? "" : trustChain.strip();
		signingCertHosts = signingCertHosts == null || signingCertHosts.isEmpty()
				? List.of(SnsEndpointPolicy.SCALEWAY_FR_PAR_CERT_HOST) : List.copyOf(signingCertHosts);
		subscribeHosts = subscribeHosts == null || subscribeHosts.isEmpty()
				? List.of(SnsEndpointPolicy.SCALEWAY_FR_PAR_SUBSCRIBE_HOST) : List.copyOf(subscribeHosts);
	}

	SnsEndpointPolicy endpointPolicy() {
		return new SnsEndpointPolicy(signingCertHosts, subscribeHosts);
	}
}
