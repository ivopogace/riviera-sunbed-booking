package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.ReplaceLayoutOutcome;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The {@code OPERATOR} role gate over the two venue-write {@code PUT}s (#328) — specifically that it
 * holds <em>at the security filter layer</em>, not only inside the controller.
 *
 * <p><strong>The gap this pins.</strong> {@code SecurityConfig}'s {@code authorizeHttpRequests} block
 * gated {@code GET}/{@code POST}/{@code PATCH}/{@code DELETE} and {@code PUT} <em>zero</em> times,
 * while the app maps two operator-only {@code PUT}s. Both fell through to
 * {@code anyRequest().authenticated()}, so at the filter layer any authenticated principal — including
 * a signed-in tourist ({@code ROLE_CUSTOMER}) — passed. The same class of gap as #316 and #317, found
 * by #317's generalization audit.
 *
 * <p><strong>Why a status assertion would pin nothing.</strong> Both handlers open with
 * {@link CurrentOperator#require}, which throws {@code AccessDeniedException} for a principal that
 * resolves to no operator. That reaches {@link ApiErrorHandler#onAccessDenied} and produces
 * {@code 403 ACCESS_DENIED} — <em>byte-identical</em> to what
 * {@link SecurityProblemResponses#writeAccessDenied} emits from inside the filter chain. So neither
 * the status code nor the body can tell the two layers apart, and a test asserting only
 * {@code isForbidden()} passes just as happily against a {@code SecurityConfig} with no matcher.
 *
 * <p><strong>The discriminator</strong> is therefore structural — {@link MvcResult#getHandler()},
 * {@code null} exactly when the chain short-circuited before {@code DispatcherServlet} dispatched.
 * {@link #operatorPutToBeachMapDoesReachTheController} is the positive control proving the assertion
 * varies. Note the slice's {@code OperatorDirectory} stub resolves <em>any</em> principal to an
 * operator id, so the controller would happily accept the customer's write if the filter let it
 * through — which is precisely the layer under test.
 *
 * <p>Lives in the root test package because the web slice imports the package-private edge config
 * ({@code SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs}), like every other web-slice
 * test here. Docker-free; the real-schema behaviour of these endpoints stays {@code BeachMapReplaceIT}'s
 * and {@code VenueRepriceIT}'s job, and the per-venue ownership layer (invariant #13) stays
 * {@code CrossVenueDenialIT}'s.
 *
 * <p>Unlike {@code MeSurfaceRoleGateTest}, no per-request {@code X-Forwarded-For} isolation is needed:
 * {@code RateLimitFilter} buckets only the booking, login, operator-register, recovery and SSO paths —
 * {@code /api/venues/**} draws on none of them, so these requests spend no token and cannot recreate
 * the #127 full-suite lockout.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class VenueWriteRoleGateTest {

	private static final String BEACH_MAP = "/api/venues/1/beach-map";
	private static final String ROW_PRICE = "/api/venues/1/rows/A/price";
	private static final String PUBLIC_VENUE_READ = "/api/venues/1";
	private static final String LAYOUT_BODY = """
			{"sets": [], "expectedVersion": 3}""";
	private static final String PRICE_BODY = """
			{"price": {"minorUnits": 2500, "currency": "EUR"}, "expectedVersion": 3}""";

	@Autowired
	MockMvc mvc;

	/** Replaces the {@link WebSliceStubs} instance so "the controller never ran" is observable. */
	@MockitoBean
	EditBeachMap editBeachMap;

	/**
	 * Both writes succeed if they are ever reached. Without this, an unmatched {@code PUT} reaches the
	 * controller, the mock returns {@code null}, and the exhaustive {@code switch} throws an NPE out of
	 * {@code perform} — so the red would report a Mockito artefact instead of the defect. Stubbed, an
	 * unfixed {@code SecurityConfig} yields a clean {@code 204} and {@link #assertNeverDispatched} is
	 * what speaks.
	 */
	@BeforeEach
	void writesSucceedIfReached() {
		when(editBeachMap.replaceLayout(any(), any(), anyLong(), any()))
				.thenReturn(ReplaceLayoutOutcome.Replaced.REPLACED);
		when(editBeachMap.repriceRow(any(), any(), anyLong(), any()))
				.thenReturn(ChangeOutcome.Applied.APPLIED);
	}

	@Test
	void customerPutToBeachMapIsRejectedBeforeTheController() throws Exception {
		MvcResult result = mvc.perform(put(BEACH_MAP).with(csrf()).with(user("tourist@example.com").roles("CUSTOMER"))
						.contentType(MediaType.APPLICATION_JSON).content(LAYOUT_BODY))
				.andReturn();

		assertNeverDispatched(result);
		assertThat(result.getResponse().getStatus()).isEqualTo(403);
		verify(editBeachMap, never()).replaceLayout(any(), any(), anyLong(), any());
	}

	@Test
	void customerPutToRowPriceIsRejectedBeforeTheController() throws Exception {
		MvcResult result = mvc.perform(put(ROW_PRICE).with(csrf()).with(user("tourist@example.com").roles("CUSTOMER"))
						.contentType(MediaType.APPLICATION_JSON).content(PRICE_BODY))
				.andReturn();

		assertNeverDispatched(result);
		assertThat(result.getResponse().getStatus()).isEqualTo(403);
		verify(editBeachMap, never()).repriceRow(any(), any(), anyLong(), any());
	}

	@Test
	void anonymousPutsAreUnauthorizedBeforeTheController() throws Exception {
		MvcResult layout = mvc.perform(put(BEACH_MAP).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(LAYOUT_BODY)).andReturn();
		MvcResult price = mvc.perform(put(ROW_PRICE).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(PRICE_BODY)).andReturn();

		assertNeverDispatched(layout);
		assertNeverDispatched(price);
		assertThat(layout.getResponse().getStatus()).isEqualTo(401);
		assertThat(price.getResponse().getStatus()).isEqualTo(401);
		verify(editBeachMap, never()).replaceLayout(any(), any(), anyLong(), any());
		verify(editBeachMap, never()).repriceRow(any(), any(), anyLong(), any());
	}

	/**
	 * The positive control for the tests above, and the guarantee that a genuine operator sees no
	 * change: the identical request under an {@code OPERATOR} principal <em>does</em> resolve a handler
	 * and reach the application service.
	 */
	@Test
	void operatorPutToBeachMapDoesReachTheController() throws Exception {
		MvcResult result = mvc.perform(put(BEACH_MAP).with(csrf()).with(user("op").roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON).content(LAYOUT_BODY))
				.andExpect(status().isNoContent())
				.andReturn();

		assertThat(result.getHandler())
				.as("an OPERATOR request must still be dispatched — otherwise the assertions above are vacuous")
				.isNotNull();
		verify(editBeachMap).replaceLayout(any(), any(), eq(3L), any());
	}

	/** The public tourist read must stay {@code permitAll} — the new rules are {@code PUT}-scoped. */
	@Test
	void anonymousVenueReadIsStillPublic() throws Exception {
		MvcResult result = mvc.perform(get(PUBLIC_VENUE_READ)).andReturn();

		assertThat(result.getHandler())
				.as("GET /api/venues/{id} is permitAll — an anonymous read must still be dispatched")
				.isNotNull();
		assertThat(result.getResponse().getStatus())
				.as("the stubbed catalogue has no venue 1, so a dispatched read is a 404 — never a 401/403")
				.isEqualTo(404);
	}

	private static void assertNeverDispatched(MvcResult result) {
		assertThat(result.getHandler())
				.as("the rejection must come from the security filter chain — a non-null handler means "
						+ "the request reached the controller and CurrentOperator produced the 403 instead")
				.isNull();
	}
}
