package ai.riviera.platform.notification.adapter.in;

import java.io.ByteArrayInputStream;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.TrustAnchor;
import java.security.cert.X509Certificate;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The CAs a Topics &amp; Events signing cert must chain to: every certificate in Scaleway's published trust
 * chain PEM. {@link #none()} (nothing configured) makes every message unverifiable, never trusted.
 */
record SnsTrustAnchors(Set<TrustAnchor> anchors) {

	SnsTrustAnchors {
		anchors = Set.copyOf(anchors);
	}

	static SnsTrustAnchors none() {
		return new SnsTrustAnchors(Set.of());
	}

	/** Every certificate in {@code pem}; throws {@link IllegalArgumentException} when it holds none or is not PEM. */
	static SnsTrustAnchors parse(byte[] pem) {
		try {
			Set<TrustAnchor> anchors = CertificateFactory.getInstance("X.509")
					.generateCertificates(new ByteArrayInputStream(pem)).stream()
					.map(cert -> new TrustAnchor((X509Certificate) cert, null))
					.collect(Collectors.toUnmodifiableSet());
			if (anchors.isEmpty()) {
				throw new IllegalArgumentException("the SNS trust chain holds no certificate");
			}
			return new SnsTrustAnchors(anchors);
		}
		catch (CertificateException e) {
			throw new IllegalArgumentException("the SNS trust chain is not a PEM certificate bundle", e);
		}
	}

	boolean isEmpty() {
		return anchors.isEmpty();
	}
}
