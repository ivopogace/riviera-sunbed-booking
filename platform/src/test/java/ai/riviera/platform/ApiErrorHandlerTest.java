package ai.riviera.platform;

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.InvalidApiRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;

import jakarta.servlet.ServletException;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pins the one advice's exception-to-ProblemDetail mapping (issue #97, narrowed by #118) without a
 * Spring context: every thrown failure — domain authorization, typed edge validation, the
 * unique-constraint-race backstop, and a framework-raised type mismatch — lands as
 * {@code application/problem+json} with a stable {@code code}. The constraint-race case matters here
 * because no controller IT can trigger it (the pre-checks win the race in a sequential test); this is
 * its only wire-level pin.
 *
 * <p>Since #118 the advice deliberately does NOT map raw {@link IllegalArgumentException} or a
 * non-duplicate {@link DataIntegrityViolationException}: both signal a server-side defect (a domain
 * invariant tripping on stored data, a schema/FK/NOT-NULL bug), and mapping them to 4xx blamed the
 * caller and dropped the failure out of 5xx monitoring and the logs. The propagation tests below are
 * the pin that keeps a bug looking like a bug.
 */
class ApiErrorHandlerTest {

	private MockMvc mvc;

	@BeforeEach
	void setUp() {
		mvc = MockMvcBuilders.standaloneSetup(new ThrowingController())
				.setControllerAdvice(new ApiErrorHandler())
				.build();
	}

	@Test
	void notVenueOwnerIs403WithCode() throws Exception {
		mvc.perform(get("/throw/not-owner"))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"))
				.andExpect(jsonPath("$.status").value(403));
	}

	@Test
	void accessDeniedIs403WithCode() throws Exception {
		mvc.perform(get("/throw/denied"))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
	}

	@Test
	void invalidApiRequestIs400WithoutEchoingTheMessage() throws Exception {
		mvc.perform(get("/throw/invalid"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				// The exception message may echo internals or user input — it must not reach the wire.
				.andExpect(jsonPath("$.detail").value("Request validation failed."));
	}

	/**
	 * Issue #118: a raw {@code IllegalArgumentException} is a server bug (e.g. a {@code Money} or
	 * {@code PayoutLedgerEntry} invariant tripping on corrupt stored data), not client input — it must
	 * propagate to the framework's 500 (which logs it with a stack trace), never be mapped to a 400
	 * blamed on the caller.
	 */
	@Test
	void aDeepBugIllegalArgumentIsNotMaskedAsA400() {
		assertPropagates(IllegalArgumentException.class, () -> mvc.perform(get("/throw/deep-bug")));
	}

	@Test
	void duplicateKeyRaceIs409Conflict() throws Exception {
		mvc.perform(get("/throw/race"))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("CONFLICT"));
	}

	/**
	 * Issue #118's DIVE half: only a unique-index race ({@link DuplicateKeyException}) is the designed
	 * 409; any other integrity violation (FK, NOT-NULL, CHECK) is a schema-level bug and must surface
	 * as a 500, not be presented as a normal conflict.
	 */
	@Test
	void aNonRaceDataIntegrityViolationIsNotMaskedAsA409() {
		assertPropagates(DataIntegrityViolationException.class, () -> mvc.perform(get("/throw/schema-bug")));
	}

	@Test
	void frameworkTypeMismatchIs400WithStampedCode() throws Exception {
		mvc.perform(get("/throw/typed/not-a-number"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	/**
	 * Invariant #7: without the {@code ApiProblem} redaction, Spring auto-fills a null
	 * {@code instance} with the raw request URI — which on {@code /api/bookings/{code}} paths is
	 * the bearer credential. Every advice-built body must carry the redaction placeholder, never
	 * the request path.
	 */
	@Test
	void handlerBuiltProblemNeverEchoesTheRequestUriInInstance() throws Exception {
		mvc.perform(get("/throw/invalid"))
				.andExpect(jsonPath("$.instance").value("about:blank"))
				.andExpect(content().string(not(containsString("/throw/invalid"))));
	}

	/**
	 * The multipart max-size backstop (#142): {@code MaxUploadSizeExceededException} is handled by
	 * the {@code ResponseEntityExceptionHandler} base class (its handler is {@code final}, so a
	 * same-advice {@code @ExceptionHandler} would be an ambiguous duplicate), and the advice stamps
	 * the pinned wire code — stable even if the 413 {@code HttpStatus} constant is renamed.
	 */
	@Test
	void uploadBeyondTheMultipartLimitIs413WithStableCode() throws Exception {
		mvc.perform(get("/throw/too-large"))
				.andExpect(status().is(413))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"))
				.andExpect(jsonPath("$.instance").value("about:blank"));
	}

	/**
	 * Framework-raised errors (here: 405) bypass {@code ApiProblem}, so the advice re-applies both
	 * the {@code code} stamp — the HTTP status name, part of the documented vocabulary (§6b) — and
	 * the instance redaction.
	 */
	@Test
	void frameworkErrorCarriesStatusNameCodeAndRedactedInstance() throws Exception {
		mvc.perform(post("/throw/invalid"))
				.andExpect(status().isMethodNotAllowed())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"))
				.andExpect(jsonPath("$.instance").value("about:blank"))
				.andExpect(content().string(not(containsString("/throw/invalid"))));
	}

	/** MockMvc rethrows an unresolved exception, possibly wrapped in a {@link ServletException}. */
	private static void assertPropagates(Class<? extends Exception> expected, Executable request) {
		Exception thrown = assertThrows(Exception.class, request);
		Throwable unwrapped = thrown instanceof ServletException wrapper ? wrapper.getCause() : thrown;
		assertInstanceOf(expected, unwrapped);
	}

	@RestController
	static class ThrowingController {

		@GetMapping("/throw/not-owner")
		void notOwner() {
			throw new NotVenueOwnerException(new OperatorId(1L), new VenueRef(2L));
		}

		@GetMapping("/throw/denied")
		void denied() {
			throw new AccessDeniedException("no active operator");
		}

		@GetMapping("/throw/invalid")
		void invalid() {
			throw new InvalidApiRequestException("internal message that must not leak");
		}

		@GetMapping("/throw/deep-bug")
		void deepBug() {
			throw new IllegalArgumentException("a domain invariant tripped on stored data");
		}

		@GetMapping("/throw/race")
		void race() {
			throw new DuplicateKeyException("duplicate key value violates unique constraint");
		}

		@GetMapping("/throw/schema-bug")
		void schemaBug() {
			throw new DataIntegrityViolationException("null value in column violates not-null constraint");
		}

		@GetMapping("/throw/too-large")
		void tooLarge() {
			throw new MaxUploadSizeExceededException(30L * 1024 * 1024);
		}

		@GetMapping("/throw/typed/{id}")
		void typed(@PathVariable long id) {
		}
	}
}
