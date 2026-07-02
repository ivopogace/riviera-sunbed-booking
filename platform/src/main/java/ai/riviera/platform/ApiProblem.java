package ai.riviera.platform;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

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
 * an exception message, or another internal echo. The same rule forces {@code instance} to be
 * pinned here: Spring auto-fills a null {@code instance} with the raw request URI at
 * serialization, and on the code-scoped paths ({@code /api/bookings/{code}…}) that URI IS the
 * bearer credential. Every factory-built problem therefore starts at {@link #REDACTED_INSTANCE};
 * a caller may override it with a known-safe, more informative URI (as {@code BookingController}
 * does with its collection path).
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
}
