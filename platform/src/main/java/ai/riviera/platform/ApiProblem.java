package ai.riviera.platform;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

/**
 * The single place the API error wire shape is built (issue #97): RFC-7807
 * {@link ProblemDetail} plus the {@code code} extension — the stable, machine-readable
 * token clients switch on ({@code type} stays {@code about:blank} in v1; the contract's
 * identity lives in {@code code}). Controllers use this factory when an exhaustive
 * typed-outcome {@code switch} rejects (typed outcomes are returned, not thrown, so
 * {@link ApiErrorHandler} never sees them); the advice uses it for everything thrown.
 * Nothing else may hand-roll an error body — pinned by {@code ErrorContractArchitectureTests}
 * and the controller ITs.
 *
 * <p>{@code detail} must be safe for any caller: never a booking code (invariant #7),
 * an exception message, or another internal echo.
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
}
