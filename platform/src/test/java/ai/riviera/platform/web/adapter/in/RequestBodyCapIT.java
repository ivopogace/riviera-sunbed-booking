package ai.riviera.platform.web.adapter.in;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The body cap against the shipped Tomcat (#1414), over a raw socket so the body really is chunked: past the cap
 * it is refused {@code 413} before the challenge fence, and within it the controller binds the replayed body.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RequestBodyCapIT {

	private static final Duration READ_TIMEOUT = Duration.ofSeconds(10);
	private static final int CHUNK = 8 * 1024;

	@LocalServerPort
	int port;

	@Test
	void aChunkedCreatePastTheCapIs413NotChallengeRequired() throws IOException {
		String response = sendChunked("/api/bookings", RequestBodyCapFilterTest.padded("{\"pad\":\"",
				RequestBodyCapFilter.MAX_BODY_BYTES + CHUNK));

		assertTrue(response.startsWith("HTTP/1.1 413"), () -> "expected a 413, got: " + head(response));
		assertTrue(response.contains("\"code\":\"PAYLOAD_TOO_LARGE\""), () -> "no 413 problem body in: " + head(response));
	}

	@Test
	void aChunkedWebhookWithinItsCapReachesTheControllerWithItsBody() throws IOException {
		String response = sendChunked("/api/payments/stripe/webhook", RequestBodyCapFilterTest.padded("{\"pad\":\"",
				RequestBodyCapFilter.MAX_BODY_BYTES * 2));

		assertTrue(response.startsWith("HTTP/1.1 400"), () -> "expected a 400, got: " + head(response));
		assertTrue(response.contains("\"code\":\"INVALID_SIGNATURE\""), () -> "body not bound: " + head(response));
	}

	/** POSTs {@code body} in {@link #CHUNK}-sized chunks and returns what the server answers. */
	private String sendChunked(String path, String body) throws IOException {
		try (Socket socket = new Socket("localhost", port)) {
			socket.setSoTimeout((int) READ_TIMEOUT.toMillis());
			OutputStream out = socket.getOutputStream();
			out.write(("POST " + path + " HTTP/1.1\r\n"
					+ "Host: localhost\r\n"
					+ "Content-Type: application/json\r\n"
					+ "X-Forwarded-For: " + SessionLoginSupport.uniqueClientIp() + "\r\n"
					+ "Transfer-Encoding: chunked\r\n"
					+ "Connection: close\r\n"
					+ "\r\n").getBytes(StandardCharsets.US_ASCII));
			try {
				byte[] bytes = body.getBytes(StandardCharsets.US_ASCII);
				for (int offset = 0; offset < bytes.length; offset += CHUNK) {
					int length = Math.min(CHUNK, bytes.length - offset);
					out.write((Integer.toHexString(length) + "\r\n").getBytes(StandardCharsets.US_ASCII));
					out.write(bytes, offset, length);
					out.write("\r\n".getBytes(StandardCharsets.US_ASCII));
				}
				out.write("0\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
				out.flush();
			}
			catch (SocketException abortedMidBody) {
				// A 413 aborts the connection (OversizedBodyConfig); the answer is still readable below.
			}
			return readUntilClosed(socket.getInputStream());
		}
	}

	private static String readUntilClosed(InputStream in) throws IOException {
		ByteArrayOutputStream received = new ByteArrayOutputStream();
		byte[] chunk = new byte[1024];
		try {
			for (int n = in.read(chunk); n != -1; n = in.read(chunk)) {
				received.write(chunk, 0, n);
			}
		}
		catch (SocketException reset) {
			// The server may reset after its answer; what arrived before it is the response.
		}
		return received.toString(StandardCharsets.US_ASCII);
	}

	private static String head(String response) {
		return response.length() > 400 ? response.substring(0, 400) : response;
	}
}
