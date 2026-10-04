package ai.riviera.platform.web.adapter.in;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import java.io.IOException;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Requests that end on the container's {@code /error} dispatch, against the shipped Tomcat (#1443): the body is the
 * app's problem shape with the status kept, and the request URI (on {@code /api/bookings/{code}} the bearer
 * credential, invariant #7) appears nowhere in it.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ErrorDispatchProblemIT {

	private static final String CODE = "K7QX2MPV9R";
	private static final String THROW_HEADER = "X-Test-Filter-Throws";
	/** {@code type} is optional: Spring omits its {@code about:blank} default, as on every MVC-written body. */
	private static final Set<String> CONTRACT_MEMBERS = Set.of("type", "title", "status", "detail", "code");
	private static final Set<String> REQUIRED_MEMBERS = Set.of("title", "status", "detail", "code");

	private final HttpClient client = HttpClient.newHttpClient();
	private final JsonMapper json = JsonMapper.builder().build();

	@LocalServerPort
	int port;

	@Test
	void aFilterThrownExceptionOnACodePathAnswersA500ProblemWithoutTheCode() throws Exception {
		HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/api/bookings/" + CODE))
				.header(THROW_HEADER, "1").GET());

		assertProblem(response, 500, "INTERNAL_SERVER_ERROR");
	}

	@Test
	void aFilterThrownExceptionOnACodeWriteAnswersA500ProblemWithoutTheCode() throws Exception {
		HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/api/bookings/" + CODE + "/cancel"))
				.header(THROW_HEADER, "1").POST(HttpRequest.BodyPublishers.noBody()));

		assertProblem(response, 500, "INTERNAL_SERVER_ERROR");
	}

	@Test
	void aSendErrorOnACodePathAnswersItsStatusAsAProblemWithoutTheCode() throws Exception {
		// StrictHttpFirewall refuses the ';' with response.sendError(400), before any of our filters.
		HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/api/bookings/" + CODE + ";x=1")).GET());

		assertProblem(response, 400, "INVALID_REQUEST");
	}

	@Test
	void aSendErrorOnAnSpaPathAnswersTheSameProblemShape() throws Exception {
		HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/booking/" + CODE + ";x=1"))
				.header("Accept", MediaType.TEXT_HTML_VALUE).GET());

		assertProblem(response, 400, "INVALID_REQUEST");
	}

	/** Tomcat refuses a raw '{' before any servlet runs, so no {@code /error}: its own page must not echo it either. */
	@Test
	void aRequestTomcatRefusesItselfNeverEchoesTheCode() throws IOException {
		try (Socket socket = new Socket("localhost", port)) {
			socket.getOutputStream().write(("GET /api/bookings/" + CODE + "/{x} HTTP/1.1\r\n"
					+ "Host: localhost\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
			String response = new String(socket.getInputStream().readAllBytes(), StandardCharsets.US_ASCII);

			assertTrue(response.startsWith("HTTP/1.1 400"), () -> "expected Tomcat's 400, got: " + response);
			assertFalse(response.contains(CODE), () -> "the booking code leaked into: " + response);
		}
	}

	private void assertProblem(HttpResponse<String> response, int status, String code) throws IOException {
		String body = response.body();
		assertEquals(status, response.statusCode(), body);
		assertTrue(response.headers().firstValue("Content-Type").orElse("")
				.startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE), () -> "not problem+json: " + response.headers() + " " + body);
		assertFalse(body.contains(CODE), () -> "the booking code leaked into: " + body);
		JsonNode problem = json.readTree(body);
		Set<String> members = Set.copyOf(problem.propertyNames());
		assertTrue(CONTRACT_MEMBERS.containsAll(members), () -> "a member beyond the contract in: " + body);
		assertTrue(members.containsAll(REQUIRED_MEMBERS), () -> "a contract member missing from: " + body);
		assertEquals(status, problem.get("status").asInt());
		assertEquals(code, problem.get("code").asString());
	}

	private URI uri(String path) {
		return URI.create("http://localhost:" + port + path);
	}

	private HttpResponse<String> send(HttpRequest.Builder request) throws IOException, InterruptedException {
		return client.send(request.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()).build(),
				HttpResponse.BodyHandlers.ofString());
	}

	/** A container filter ahead of the security chain that throws on demand, as a crashing edge filter would. */
	@TestConfiguration
	static class ThrowingFilterConfig {

		@Bean
		FilterRegistrationBean<OncePerRequestFilter> throwingFilter() {
			FilterRegistrationBean<OncePerRequestFilter> registration = new FilterRegistrationBean<>(
					new OncePerRequestFilter() {
						@Override
						protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
								FilterChain chain) throws jakarta.servlet.ServletException, IOException {
							if (request.getHeader(THROW_HEADER) != null) {
								throw new IllegalStateException("filter failed on " + request.getRequestURI());
							}
							chain.doFilter(request, response);
						}
					});
			registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
			return registration;
		}
	}
}
