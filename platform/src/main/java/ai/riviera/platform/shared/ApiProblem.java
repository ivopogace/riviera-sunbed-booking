package ai.riviera.platform.shared;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

/**
 * The one factory for the RFC-7807 {@link ProblemDetail} error shape plus its stable {@code code} extension,
 * the token clients switch on ({@code type} stays {@code about:blank}). {@code detail} states the condition,
 * never a remedy, and never carries a booking code (invariant #7), an exception message or internal echo.
 * Never an {@code instance}: {@code web}'s {@code ProblemInstanceConfig} clears Spring's request-URI fill (#7).
 * Past it, only the filter chain hand-rolls a body, before MVC; no other {@code @ExceptionHandler}
 * ({@code ErrorContractArchitectureTests}). Rules: riviera-java-conventions references/error-contract.md.
 */
public final class ApiProblem {

	/** The extension property carrying the stable machine-readable error code. */
	public static final String CODE_PROPERTY = "code";

	private ApiProblem() {
	}

	/** Any status code, a non-standard one included ({@code web}'s {@code /error} keeps a dispatched {@code 499}). */
	public static ProblemDetail of(HttpStatusCode status, String code, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setProperty(CODE_PROPERTY, code);
		return problem;
	}

	/** The common controller shape: the problem body wrapped in a {@link ResponseEntity}. */
	public static ResponseEntity<ProblemDetail> response(HttpStatus status, String code, String detail) {
		return ResponseEntity.status(status).body(of(status, code, detail));
	}
}
