package ai.riviera.platform.notification.adapter.in;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.Signature;
import java.security.cert.CertPathValidator;
import java.security.cert.CertificateFactory;
import java.security.cert.PKIXParameters;
import java.security.cert.X509Certificate;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Accepts an {@link SnsMessage} only if it is for our topic and carries a signature version 1 (SHA1withRSA,
 * the only version Scaleway sends) by a certificate that chains to the configured CA. Cheap checks run before
 * the one fetch; a validated cert is cached by URL. Never logs the body, token or URLs.
 */
final class SnsMessageVerifier {

	private static final Logger log = LoggerFactory.getLogger(SnsMessageVerifier.class);

	private static final String SIGNATURE_VERSION_1 = "1";
	// Protocol-mandated: Topics & Events signs with SHA1withRSA only (version 2 is unsupported).
	private static final String SIGNATURE_V1_ALGORITHM = "SHA1withRSA";
	/** Certs rotate yearly; a bound keeps an attacker cycling allowlisted URLs from growing the map. */
	private static final int MAX_CACHED_CERTS = 16;

	private final SnsTrustAnchors trustAnchors;
	private final String topicArn;
	private final SnsEndpointPolicy policy;
	private final SigningCertificateSource source;
	private final Clock clock;
	private final Map<URI, X509Certificate> validatedCerts = new ConcurrentHashMap<>();

	SnsMessageVerifier(SnsTrustAnchors trustAnchors, String topicArn, SnsEndpointPolicy policy,
			SigningCertificateSource source, Clock clock) {
		this.trustAnchors = trustAnchors;
		this.topicArn = topicArn == null ? "" : topicArn.strip();
		this.policy = policy;
		this.source = source;
		this.clock = clock;
	}

	/** Whether verification is possible at all: a topic and a trust chain are both configured. */
	boolean isConfigured() {
		return !topicArn.isEmpty() && !trustAnchors.isEmpty();
	}

	boolean verify(SnsMessage message) {
		if (!isConfigured() || !topicArn.equals(message.topicArn())
				|| !SIGNATURE_VERSION_1.equals(message.signatureVersion())) {
			return false;
		}
		Optional<URI> certUrl = policy.signingCertUri(message.signingCertUrl());
		if (certUrl.isEmpty()) {
			return false;
		}
		return certificate(certUrl.get()).filter(cert -> signatureHolds(message, cert)).isPresent();
	}

	private Optional<X509Certificate> certificate(URI url) {
		X509Certificate cached = validatedCerts.get(url);
		if (cached != null) {
			return currentlyValid(cached) ? Optional.of(cached) : Optional.empty();
		}
		try {
			X509Certificate cert = (X509Certificate) CertificateFactory.getInstance("X.509")
					.generateCertificate(new ByteArrayInputStream(source.fetch(url)));
			validateChain(cert);
			if (!currentlyValid(cert)) {
				log.warn("the SNS signing certificate is outside its validity window");
				return Optional.empty();
			}
			if (validatedCerts.size() >= MAX_CACHED_CERTS) {
				validatedCerts.clear();
			}
			validatedCerts.put(url, cert);
			return Optional.of(cert);
		}
		catch (IOException e) {
			log.warn("could not fetch the SNS signing certificate ({})", e.getClass().getSimpleName());
			return Optional.empty();
		}
		catch (GeneralSecurityException | ClassCastException e) {
			log.warn("the SNS signing certificate does not chain to the configured CA ({})",
					e.getClass().getSimpleName());
			return Optional.empty();
		}
	}

	/** Issuer and signature against the anchors; the leaf's validity window is {@link #currentlyValid}'s, on the clock. */
	private void validateChain(X509Certificate cert) throws GeneralSecurityException {
		PKIXParameters parameters = new PKIXParameters(trustAnchors.anchors());
		parameters.setRevocationEnabled(false);
		CertPathValidator.getInstance("PKIX")
				.validate(CertificateFactory.getInstance("X.509").generateCertPath(List.of(cert)), parameters);
	}

	private boolean currentlyValid(X509Certificate cert) {
		Instant now = clock.instant();
		return !now.isBefore(cert.getNotBefore().toInstant()) && !now.isAfter(cert.getNotAfter().toInstant());
	}

	private static boolean signatureHolds(SnsMessage message, X509Certificate cert) {
		try {
			Signature verifier = Signature.getInstance(SIGNATURE_V1_ALGORITHM);
			verifier.initVerify(cert.getPublicKey());
			verifier.update(message.stringToSign().getBytes(StandardCharsets.UTF_8));
			return verifier.verify(Base64.getDecoder().decode(message.signature()));
		}
		catch (IllegalArgumentException | GeneralSecurityException e) {
			return false;
		}
	}
}
