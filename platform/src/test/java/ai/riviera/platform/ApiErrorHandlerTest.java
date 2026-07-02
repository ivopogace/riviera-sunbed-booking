package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pins the one advice's exception-to-ProblemDetail mapping (issue #97) without a Spring context:
 * every thrown failure — domain authorization, validation, the constraint-race backstop, and a
 * framework-raised type mismatch — lands as {@code application/problem+json} with a stable
 * {@code code}. The constraint-race case matters here because no controller IT can trigger it
 * (the pre-checks win the race in a sequential test); this is its only wire-level pin.
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
	void illegalArgumentIs400InvalidRequestWithoutEchoingTheMessage() throws Exception {
		mvc.perform(get("/throw/invalid"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				// The exception message may echo internals or user input — it must not reach the wire.
				.andExpect(jsonPath("$.detail").value("Request validation failed."));
	}

	@Test
	void dataIntegrityViolationIs409Conflict() throws Exception {
		mvc.perform(get("/throw/race"))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("CONFLICT"));
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
			throw new IllegalArgumentException("internal message that must not leak");
		}

		@GetMapping("/throw/race")
		void race() {
			throw new DataIntegrityViolationException("duplicate key value violates unique constraint");
		}

		@GetMapping("/throw/typed/{id}")
		void typed(@PathVariable long id) {
		}
	}
}
