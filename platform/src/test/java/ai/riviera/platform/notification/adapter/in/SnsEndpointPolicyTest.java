package ai.riviera.platform.notification.adapter.in;

import java.util.List;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SnsEndpointPolicyTest {

	private final SnsEndpointPolicy policy = SnsEndpointPolicy.defaults();

	@Test
	void scalewaysCertificateUrlIsTrusted() {
		assertTrue(policy.signingCertUri(SnsTestPki.CERT_URL).isPresent());
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"http://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns_certificate_1.crt",
			"https://evil.example.com/fr-par/sns/sns_certificate_1.crt",
			"https://messaging.s3.fr-par.scw.cloud@evil.example.com/sns_certificate_1.crt",
			"https://messaging.s3.fr-par.scw.cloud.evil.example.com/sns_certificate_1.crt",
			"https://messaging.s3.fr-par.scw.cloud:8443/fr-par/sns/sns_certificate_1.crt",
			"https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns_certificate_1.pem",
			"https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns_certificate_1.crt?x=1",
			"https://user@messaging.s3.fr-par.scw.cloud/fr-par/sns/sns_certificate_1.crt",
			"not a url at all",
			""
	})
	void anyOtherCertificateUrlIsRefused(String url) {
		assertFalse(policy.signingCertUri(url).isPresent(), url);
	}

	@Test
	void scalewaysSubscribeUrlIsTrusted() {
		assertTrue(policy.subscribeUri(
				"https://sns.mnq.fr-par.scaleway.com/?Action=ConfirmSubscription&TopicArn=arn&Token=t").isPresent());
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"http://sns.mnq.fr-par.scaleway.com/?Action=ConfirmSubscription",
			"https://sns.mnq.fr-par.scaleway.com.evil.example.com/?Action=ConfirmSubscription",
			"https://localhost:8080/actuator",
			"https://user@sns.mnq.fr-par.scaleway.com/?Action=ConfirmSubscription"
	})
	void anyOtherSubscribeUrlIsRefused(String url) {
		assertFalse(policy.subscribeUri(url).isPresent(), url);
	}

	@Test
	void hostsComeFromConfigurationCaseInsensitively() {
		SnsEndpointPolicy amsterdam = new SnsEndpointPolicy(List.of("Messaging.S3.nl-ams.scw.cloud"),
				List.of("sns.mnq.nl-ams.scaleway.com"));

		assertTrue(amsterdam.signingCertUri("https://messaging.s3.nl-ams.scw.cloud/nl-ams/sns/c.crt").isPresent());
		assertFalse(amsterdam.signingCertUri(SnsTestPki.CERT_URL).isPresent());
		assertEquals(List.of("messaging.s3.nl-ams.scw.cloud"), amsterdam.signingCertHosts());
	}
}
