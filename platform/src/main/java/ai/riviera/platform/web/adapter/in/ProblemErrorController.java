package ai.riviera.platform.web.adapter.in;

import ai.riviera.platform.shared.ApiProblem;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;

/**
 * The container's {@code /error} dispatch (a filter-thrown exception, a {@code sendError}, an exception no handler
 * mapped), on every path: the app's problem body with the status kept, replacing Boot's {@code BasicErrorController},
 * whose {@code path} echoes the request URI, on {@code /api/bookings/{code}} and the SPA's {@code /booking/{code}}
 * the bearer credential (invariant #7). Never {@code instance}, {@code timestamp} or an exception message.
 */
@RestController
class ProblemErrorController implements ErrorController {

	private static final String CLIENT_ERROR_DETAIL = "The request was rejected.";
	private static final String SERVER_ERROR_DETAIL = "The server failed to process the request.";
	private static final int MIN_ERROR_CODE = 400;
	private static final int MAX_ERROR_CODE = 599;

	@RequestMapping("${spring.web.error.path:${error.path:/error}}")
	ResponseEntity<ProblemDetail> error(HttpServletRequest request) {
		HttpStatusCode status = statusOf(request);
		String detail = status.is4xxClientError() ? CLIENT_ERROR_DETAIL : SERVER_ERROR_DETAIL;
		return ResponseEntity.status(status)
				.contentType(MediaType.APPLICATION_PROBLEM_JSON)
				.body(ApiProblem.of(status, ApiErrorHandler.defaultCode(status), detail));
	}

	/** The dispatched error status, a non-standard one kept; a direct request, or a non-error code, answers 500. */
	private static HttpStatusCode statusOf(HttpServletRequest request) {
		if (request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE) instanceof Integer code
				&& code >= MIN_ERROR_CODE && code <= MAX_ERROR_CODE) {
			return HttpStatusCode.valueOf(code);
		}
		return HttpStatus.INTERNAL_SERVER_ERROR;
	}
}
