package ai.riviera.platform.notification.adapter.in;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** The outbound half of the SNS protocol against an in-JVM server: status, body cap and no redirects. */
class SnsHttpClientTest {

	private static final byte[] CERT = "-----BEGIN CERTIFICATE-----".getBytes();

	private final SnsHttpClient client = new SnsHttpClient();
	private final List<String> requested = new CopyOnWriteArrayList<>();
	private HttpServer server;

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
		server.createContext("/cert.crt", exchange -> respond(exchange, 200, CERT));
		server.createContext("/huge.crt", exchange -> respond(exchange, 200, new byte[16 * 1024 + 1]));
		server.createContext("/missing.crt", exchange -> respond(exchange, 404, new byte[0]));
		server.createContext("/moved.crt", exchange -> {
			exchange.getResponseHeaders().add("Location", url("/cert.crt").toString());
			respond(exchange, 302, new byte[0]);
		});
		server.createContext("/confirm", exchange -> respond(exchange, 200, new byte[0]));
		server.createContext("/refuse", exchange -> respond(exchange, 403, new byte[0]));
		server.start();
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	@Test
	void aServedCertificateIsReturned() throws IOException {
		assertArrayEquals(CERT, client.fetch(url("/cert.crt")));
	}

	@Test
	void aCertificateBodyPastTheCapIsRefused() {
		assertThrows(IOException.class, () -> client.fetch(url("/huge.crt")));
	}

	@Test
	void aNonOkCertificateAnswerIsRefused() {
		assertThrows(IOException.class, () -> client.fetch(url("/missing.crt")));
	}

	@Test
	void aRedirectIsNeverFollowed() {
		assertThrows(IOException.class, () -> client.fetch(url("/moved.crt")));
		assertEquals(List.of("/moved.crt"), requested, "an allowlisted host must not bounce the fetch elsewhere");
	}

	@Test
	void aSuccessfulConfirmationReturns() {
		assertDoesNotThrow(() -> client.confirm(url("/confirm")));
	}

	@Test
	void aRefusedConfirmationThrows() {
		assertThrows(IOException.class, () -> client.confirm(url("/refuse")));
	}

	private URI url(String path) {
		return URI.create("http://" + server.getAddress().getHostString() + ":" + server.getAddress().getPort() + path);
	}

	private void respond(HttpExchange exchange, int status, byte[] body) throws IOException {
		requested.add(exchange.getRequestURI().getPath());
		exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
		try (OutputStream out = exchange.getResponseBody()) {
			out.write(body);
		}
	}
}
