package ai.riviera.platform.notification.adapter.in;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * The two outbound calls the SNS protocol makes, over the JDK client: finite timeouts, redirects never
 * followed (an allowlisted host must not bounce us elsewhere), and a capped certificate body.
 */
final class SnsHttpClient implements SigningCertificateSource, SubscriptionConfirmer {

	private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
	private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
	/** A PEM certificate is ~2 KiB; anything near this is not one. */
	private static final int MAX_CERT_BYTES = 16 * 1024;
	private static final int HTTP_OK = 200;

	private final HttpClient http = HttpClient.newBuilder()
			.connectTimeout(CONNECT_TIMEOUT)
			.followRedirects(HttpClient.Redirect.NEVER)
			.build();

	@Override
	public byte[] fetch(URI certificateUrl) throws IOException {
		HttpResponse<InputStream> response = send(certificateUrl, HttpResponse.BodyHandlers.ofInputStream());
		try (InputStream body = response.body()) {
			if (response.statusCode() != HTTP_OK) {
				throw new IOException("certificate fetch answered " + response.statusCode());
			}
			byte[] cert = body.readNBytes(MAX_CERT_BYTES + 1);
			if (cert.length > MAX_CERT_BYTES) {
				throw new IOException("certificate body exceeds " + MAX_CERT_BYTES + " bytes");
			}
			return cert;
		}
	}

	@Override
	public void confirm(URI subscribeUrl) throws IOException {
		int status = send(subscribeUrl, HttpResponse.BodyHandlers.discarding()).statusCode();
		if (status / 100 != 2) {
			throw new IOException("subscription confirmation answered " + status);
		}
	}

	private <T> HttpResponse<T> send(URI uri, HttpResponse.BodyHandler<T> handler) throws IOException {
		try {
			return http.send(HttpRequest.newBuilder(uri).timeout(REQUEST_TIMEOUT).GET().build(), handler);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IOException("interrupted", e);
		}
	}
}
