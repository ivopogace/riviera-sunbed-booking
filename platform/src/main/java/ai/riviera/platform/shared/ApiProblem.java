package ai.riviera.platform.shared;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

/**
 * The one factory for the RFC-7807 {@link ProblemDetail} error shape plus its stable {@code code} extension,
 * the token clients switch on ({@code type} stays {@code about:blank}). {@code detail} states the condition,
 * never a remedy, and never carries a booking code (invariant #7), an exception message or internal echo.
 * Never an {@code instance}: {@code web}'s {@code ProblemInstanceConfig} clears Spring's request-URI fill (#7).
 * Nothing else hand-rolls an error body ({@code ErrorContractArchitectureTests}). Rules:
 * riviera-java-conventions references/error-contract.md.
 */
public final class ApiProblem {

	/** The extension property carrying the stable machine-readable error code. */
	public static final String CODE_PROPERTY = "code";

	private ApiProblem() {
	}

	public static ProblemDetail of(HttpStatus status, String code, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setProperty(CODE_PROPERTY, code);
		return problem;
	}

	/** The common controller shape: the problem body wrapped in a {@link ResponseEntity}. */
	public static ResponseEntity<ProblemDetail> response(HttpStatus status, String code, String detail) {
		return ResponseEntity.status(status).body(of(status, code, detail));
	}
}
