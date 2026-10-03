package ai.riviera.platform.web.adapter.in;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import jakarta.servlet.RequestDispatcher;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** The status {@code /error} answers (#1443): the dispatched one when it is an error, else {@code 500}. */
class ProblemErrorControllerTest {

	private final ProblemErrorController controller = new ProblemErrorController();

	@Test
	void aDispatchedClientErrorKeepsItsStatusAndCode() {
		ResponseEntity<ProblemDetail> response = controller.error(dispatched(405));

		assertEquals(405, response.getStatusCode().value());
		assertEquals(MediaType.APPLICATION_PROBLEM_JSON, response.getHeaders().getContentType());
		ProblemDetail problem = response.getBody();
		assertEquals("METHOD_NOT_ALLOWED", problem.getProperties().get("code"));
		assertEquals("The request was rejected.", problem.getDetail());
		assertNull(problem.getInstance());
	}

	@Test
	void aDispatchedPayloadTooLargeCarriesThePinnedCode() {
		assertEquals("PAYLOAD_TOO_LARGE", controller.error(dispatched(413)).getBody().getProperties().get("code"));
	}

	@Test
	void aDirectRequestWithNoDispatchedStatusIs500() {
		assertServerError(controller.error(new MockHttpServletRequest("GET", "/error")));
	}

	@Test
	void aDispatchedStatusThatIsNoErrorIs500() {
		assertServerError(controller.error(dispatched(200)));
	}

	@Test
	void anUnknownDispatchedStatusIs500() {
		assertServerError(controller.error(dispatched(599)));
	}

	private static void assertServerError(ResponseEntity<ProblemDetail> response) {
		assertEquals(500, response.getStatusCode().value());
		assertEquals("INTERNAL_SERVER_ERROR", response.getBody().getProperties().get("code"));
		assertEquals("The server failed to process the request.", response.getBody().getDetail());
	}

	private static MockHttpServletRequest dispatched(int status) {
		MockHttpServletRequest request = new MockHttpServletRequest("GET", "/error");
		request.setAttribute(RequestDispatcher.ERROR_STATUS_CODE, status);
		return request;
	}
}
