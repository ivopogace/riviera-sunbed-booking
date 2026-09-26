package ai.riviera.platform.shared;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

/**
 * The one factory for the RFC-7807 {@link ProblemDetail} error shape plus its stable {@code code} extension,
 * the token clients switch on ({@code type} stays {@code about:blank}). {@code detail} states the condition,
 * never a remedy, and never carries a booking code (invariant #7), an exception message or internal echo.
 * {@code instance} starts at {@link #REDACTED_INSTANCE}: Spring would auto-fill the request URI, which on
 * {@code /api/bookings/{code}} is the bearer credential. Nothing else hand-rolls an error body
 * ({@code ErrorContractArchitectureTests}). Rules: riviera-java-conventions references/error-contract.md.
 */
public final class ApiProblem {

	/** The extension property carrying the stable machine-readable error code. */
	public static final String CODE_PROPERTY = "code";

	/**
	 * The default {@code instance}: a non-null placeholder (mirroring the v1 {@code type}) that
	 * stops Spring's auto-fill from echoing the request URI — which can carry a booking code
	 * (invariant #7) — into the error body.
	 */
	public static final URI REDACTED_INSTANCE = URI.create("about:blank");

	private ApiProblem() {
	}

	public static ProblemDetail of(HttpStatus status, String code, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setProperty(CODE_PROPERTY, code);
		problem.setInstance(REDACTED_INSTANCE);
		return problem;
	}

	/** The common controller shape: the problem body wrapped in a {@link ResponseEntity}. */
	public static ResponseEntity<ProblemDetail> response(HttpStatus status, String code, String detail) {
		return ResponseEntity.status(status).body(of(status, code, detail));
	}

	/**
	 * The same response with {@code instance} set to {@code at} instead of {@link #REDACTED_INSTANCE}, so the
	 * code-scoped controllers of every module share one redaction rule (invariant #7). Pass a
	 * <strong>constant</strong> URI — never one derived from the request.
	 */
	public static ResponseEntity<ProblemDetail> responseAt(HttpStatus status, String code, String detail,
			URI at) {
		ProblemDetail problem = of(status, code, detail);
		problem.setInstance(at);
		return ResponseEntity.status(status).body(problem);
	}
}
