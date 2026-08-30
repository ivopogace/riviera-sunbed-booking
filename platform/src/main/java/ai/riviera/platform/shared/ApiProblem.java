package ai.riviera.platform.shared;

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
 * the root {@code ApiErrorHandler} advice never sees them); that advice uses it for everything thrown.
 * Nothing else may hand-roll an error body — pinned by {@code ErrorContractArchitectureTests}
 * and the controller ITs.
 *
 * <p>{@code detail} must be safe for any caller: never a booking code (invariant #7),
 * an exception message, or another internal echo. It also states the condition, not the remedy —
 * user-facing wording belongs to the client, which switches on {@code code}
 * ({@code riviera-java-conventions} §6b). The safety rule forces {@code instance} to be
 * pinned here: Spring auto-fills a null {@code instance} with the raw request URI at
 * serialization, and on the code-scoped paths ({@code /api/bookings/{code}…}) that URI IS the
 * bearer credential. Every factory-built problem therefore starts at {@link #REDACTED_INSTANCE};
 * a caller may override it with a known-safe, more informative URI via {@link #responseAt} (as the
 * code-gated controllers do with the {@code /api/bookings} collection path).
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
	 * The same response, with {@code instance} set to a known-safe {@code at} instead of
	 * {@link #REDACTED_INSTANCE} — more informative than the placeholder, and still never the
	 * request URI.
	 *
	 * <p>This is the override the class doc describes, kept here rather than in each controller: the
	 * <strong>code-scoped</strong> paths are served from two modules now ({@code booking}'s
	 * view/cancel/withdraw and {@code review}'s submit), and a redaction rule copied per module is one
	 * a later change can fix in one place and miss in the other — re-opening the invariant-#7 leak the
	 * pinning exists to close. Pass a <strong>constant</strong> URI: deriving one from the request is
	 * what this exists to stop.
	 *
	 * <p>It does not yet serve every {@code instance} override in the codebase —
	 * {@code StaffBookingController} builds a venue-scoped path and adds an extension property, which
	 * this signature cannot carry. That path is operator-authenticated and its {@code venueId} is not
	 * a credential, so it is out of scope here rather than an oversight.
	 */
	public static ResponseEntity<ProblemDetail> responseAt(HttpStatus status, String code, String detail,
			URI at) {
		ProblemDetail problem = of(status, code, detail);
		problem.setInstance(at);
		return ResponseEntity.status(status).body(problem);
	}
}
