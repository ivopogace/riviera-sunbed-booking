package ai.riviera.platform.web.adapter.in;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The login {@code 413} against the shipped Tomcat (#1409): with {@code max-swallow-size=33MB}, the server must
 * close the connection instead of draining a declared-oversized body at the client's pace. Raw socket, so the
 * client sends a few bytes of a body declared at 32 MB and then nothing.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LoginBodyTooLargeSwallowIT {

	private static final long DECLARED_LENGTH = 32L * 1024 * 1024;

	/** Far below Tomcat's connection timeout, which is what would end a drain the client never feeds. */
	private static final Duration CLOSE_WITHIN = Duration.ofSeconds(5);

	@LocalServerPort
	int port;

	@Test
	void declaredOversizedLoginBodyGets413AndTheConnectionClosesWithoutDrainingTheBody() throws IOException {
		try (Socket socket = new Socket("localhost", port)) {
			socket.setSoTimeout((int) CLOSE_WITHIN.toMillis());
			OutputStream out = socket.getOutputStream();
			out.write(("POST /api/auth/operator/login HTTP/1.1\r\n"
					+ "Host: localhost\r\n"
					+ "Content-Type: application/json\r\n"
					+ "X-Forwarded-For: " + SessionLoginSupport.uniqueClientIp() + "\r\n"
					+ "Content-Length: " + DECLARED_LENGTH + "\r\n"
					+ "\r\n"
					+ "{\"username\":\"swallow-probe\",").getBytes(StandardCharsets.US_ASCII));
			out.flush();

			String received = readUntilClosed(socket.getInputStream());

			assertTrue(received.startsWith("HTTP/1.1 413"), () -> "expected a 413, got: " + received);
			assertTrue(received.toLowerCase().contains("connection: close"), () -> "no Connection: close in: " + received);
		}
	}

	/** Everything the server sends until it closes; a read timeout means it is still waiting on the body. */
	private static String readUntilClosed(InputStream in) throws IOException {
		ByteArrayOutputStream received = new ByteArrayOutputStream();
		byte[] chunk = new byte[1024];
		try {
			for (int n = in.read(chunk); n != -1; n = in.read(chunk)) {
				received.write(chunk, 0, n);
			}
		}
		catch (SocketTimeoutException stillOpen) {
			throw new AssertionError("the connection stayed open " + CLOSE_WITHIN.toSeconds()
					+ "s after the 413, so Tomcat is draining the body; received: "
					+ received.toString(StandardCharsets.US_ASCII), stillOpen);
		}
		return received.toString(StandardCharsets.US_ASCII);
	}
}
