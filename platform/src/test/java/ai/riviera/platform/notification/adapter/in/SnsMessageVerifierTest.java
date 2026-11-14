package ai.riviera.platform.notification.adapter.in;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SnsMessageVerifierTest {

	private static final SnsTestPki PKI = SnsTestPki.get();
	private static final ObjectMapper JSON = JsonMapper.builder().build();
	/** The real clock: the PKI is minted at test time, so its certs start now. */
	private static final Clock NOW = Clock.systemUTC();
	private static final String BOUNCE = "{\"type\":\"email_dropped\",\"email_to\":\"gone@example.com\"}";

	private final List<URI> fetched = new ArrayList<>();
	private final SigningCertificateSource servedByScaleway = uri -> {
		fetched.add(uri);
		byte[] served = PKI.servedCertificates().get(uri.toString());
		if (served == null) {
			throw new IOException("404");
		}
		return served;
	};

	private SnsMessageVerifier verifier(SigningCertificateSource source) {
		return new SnsMessageVerifier(SnsTrustAnchors.parse(PKI.caPem()), SnsTestPki.TOPIC_ARN,
				SnsEndpointPolicy.defaults(), source, NOW);
	}

	private static SnsMessage parsed(String body) {
		return SnsMessage.parse(body.getBytes(StandardCharsets.UTF_8), JSON).orElseThrow();
	}

	@Test
	void aNotificationSignedByTheCaIssuedCertVerifies() {
		assertTrue(verifier(servedByScaleway).verify(parsed(PKI.notification(BOUNCE))));
	}

	@Test
	void aSubscriptionConfirmationSignedByTheCaIssuedCertVerifies() {
		String body = PKI.signed(PKI.subscriptionFields("https://sns.mnq.fr-par.scaleway.com/?Action=Confirm"));

		assertTrue(verifier(servedByScaleway).verify(parsed(body)));
	}

	@Test
	void aMessageAlteredAfterSigningFails() {
		String body = PKI.notification(BOUNCE).replace("gone@example.com", "victim@example.com");

		assertFalse(verifier(servedByScaleway).verify(parsed(body)));
	}

	@Test
	void aCertNotIssuedByTheConfiguredCaFails() {
		String body = PKI.signedByRogue(PKI.notificationFields(BOUNCE));

		assertFalse(verifier(servedByScaleway).verify(parsed(body)),
				"a self-signed cert proves nothing, however good its signature");
	}

	@Test
	void aValidlySignedMessageFromAnotherTopicFails() {
		Map<String, String> fields = PKI.notificationFields(BOUNCE);
		fields.put("TopicArn", "arn:scw:sns:fr-par:someone-else:their-topic");

		assertFalse(verifier(servedByScaleway).verify(parsed(PKI.signed(fields))),
				"Scaleway signs every account's topics: the signature alone does not make it ours");
	}

	@Test
	void anUnsupportedSignatureVersionFails() {
		Map<String, String> fields = PKI.notificationFields(BOUNCE);
		fields.put("SignatureVersion", "2");

		assertFalse(verifier(servedByScaleway).verify(parsed(PKI.signed(fields))));
	}

	@Test
	void aSignatureThatIsNotBase64Fails() {
		Map<String, String> fields = PKI.notificationFields(BOUNCE);
		fields.put("Signature", "not base64 !!");

		assertFalse(verifier(servedByScaleway).verify(parsed(SnsTestPki.json(fields))));
	}

	@Test
	void aCertUrlOffTheAllowlistIsNeverFetched() {
		Map<String, String> fields = PKI.notificationFields(BOUNCE);
		fields.put("SigningCertURL", "http://169.254.169.254/latest/meta-data/x.crt");

		assertFalse(verifier(servedByScaleway).verify(parsed(PKI.signed(fields))));
		assertEquals(List.of(), fetched, "an unverified message must not steer an outbound request");
	}

	@Test
	void anotherTopicIsRefusedBeforeAnyFetch() {
		Map<String, String> fields = PKI.notificationFields(BOUNCE);
		fields.put("TopicArn", "arn:scw:sns:fr-par:someone-else:their-topic");

		verifier(servedByScaleway).verify(parsed(PKI.signed(fields)));

		assertEquals(List.of(), fetched);
	}

	@Test
	void aVerifiedCertIsFetchedOnce() {
		SnsMessageVerifier verifier = verifier(servedByScaleway);

		verifier.verify(parsed(PKI.notification(BOUNCE)));
		verifier.verify(parsed(PKI.notification(BOUNCE)));

		assertEquals(1, fetched.size(), "cache by URL: the cert rotates yearly, not per message");
	}

	@Test
	void anUnreachableCertFails() {
		assertFalse(verifier(uri -> {
			throw new IOException("connect timed out");
		}).verify(parsed(PKI.notification(BOUNCE))));
	}

	@Test
	void anExpiredSigningCertFails() {
		Clock in2040 = Clock.fixed(Instant.parse("2040-01-01T00:00:00Z"), ZoneOffset.UTC);
		SnsMessageVerifier verifier = new SnsMessageVerifier(SnsTrustAnchors.parse(PKI.caPem()),
				SnsTestPki.TOPIC_ARN, SnsEndpointPolicy.defaults(), servedByScaleway, in2040);

		assertFalse(verifier.verify(parsed(PKI.notification(BOUNCE))));
	}

	/**
	 * One time source: the injected clock decides validity for the whole chain, never the JVM's wall time.
	 * The cert lapsed two days ago in real time but is inside its window on this clock, so only a verifier
	 * that judges the chain by the clock accepts it.
	 */
	@Test
	void theInjectedClockAloneJudgesCertValidity() {
		Clock insideTheLapsedWindow = Clock.fixed(Instant.now().minus(Duration.ofHours(60)), ZoneOffset.UTC);
		SnsMessageVerifier onThatClock = new SnsMessageVerifier(SnsTrustAnchors.parse(PKI.caPem()),
				SnsTestPki.TOPIC_ARN, SnsEndpointPolicy.defaults(), servedByScaleway, insideTheLapsedWindow);
		String body = PKI.notificationUnderLapsedCert(BOUNCE);

		assertTrue(onThatClock.verify(parsed(body)), "valid at the injected clock's instant");
		assertFalse(verifier(servedByScaleway).verify(parsed(body)), "lapsed at the real clock's instant");
	}

	@Test
	void aCachedCertIsRefusedOnceTheClockPassesItsExpiry() {
		AtomicReference<Instant> now = new AtomicReference<>(Instant.now());
		Clock movable = new Clock() {
			@Override
			public ZoneOffset getZone() {
				return ZoneOffset.UTC;
			}

			@Override
			public Clock withZone(java.time.ZoneId zone) {
				return this;
			}

			@Override
			public Instant instant() {
				return now.get();
			}
		};
		SnsMessageVerifier verifier = new SnsMessageVerifier(SnsTrustAnchors.parse(PKI.caPem()),
				SnsTestPki.TOPIC_ARN, SnsEndpointPolicy.defaults(), servedByScaleway, movable);
		assertTrue(verifier.verify(parsed(PKI.notification(BOUNCE))));

		now.set(Instant.parse("2040-01-01T00:00:00Z"));

		assertFalse(verifier.verify(parsed(PKI.notification(BOUNCE))), "the cache never outlives the cert");
		assertEquals(1, fetched.size());
	}

	@Test
	void withNoTrustChainNothingVerifies() {
		SnsMessageVerifier unconfigured = new SnsMessageVerifier(SnsTrustAnchors.none(), SnsTestPki.TOPIC_ARN,
				SnsEndpointPolicy.defaults(), servedByScaleway, NOW);

		assertFalse(unconfigured.verify(parsed(PKI.notification(BOUNCE))));
		assertEquals(List.of(), fetched);
	}

	@Test
	void withNoTopicConfiguredNothingVerifies() {
		SnsMessageVerifier unconfigured = new SnsMessageVerifier(SnsTrustAnchors.parse(PKI.caPem()), "",
				SnsEndpointPolicy.defaults(), servedByScaleway, NOW);

		assertFalse(unconfigured.verify(parsed(PKI.notification(BOUNCE))));
	}

	@Test
	void aBodyThatIsNotAnSnsEnvelopeDoesNotParse() {
		assertEquals(Optional.empty(), SnsMessage.parse("not json".getBytes(StandardCharsets.UTF_8), JSON));
		assertEquals(Optional.empty(), SnsMessage.parse("[1,2]".getBytes(StandardCharsets.UTF_8), JSON));
		assertEquals(Optional.empty(), SnsMessage.parse("{\"Type\":\"Notification\"}".getBytes(StandardCharsets.UTF_8),
				JSON), "an envelope missing the signed fields is not a message");
	}
}
