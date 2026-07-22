package ai.riviera.platform;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.application.ListOwnedVenues;
import ai.riviera.platform.venue.application.OwnedVenueView;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the operator's own-venues read (S9 #277, AC-2) through the real filter chain —
 * the three things a unit test of the service cannot prove:
 *
 * <ol>
 * <li><strong>The literal route resolves</strong> (R-2): {@code /api/venues/mine} must reach
 * {@code MyVenuesController}, not {@code VenueReadController}'s {@code /api/venues/{venueId}}, where
 * {@code "mine"} would be a {@code 400} number-format failure.</li>
 * <li><strong>The security matcher sits above the public venue GET</strong> (R-3): anonymous is
 * {@code 401}, not a {@code permitAll} fall-through that would hand the ownership map to anyone.</li>
 * <li><strong>Role separation</strong> (AC-9): a signed-in CUSTOMER is {@code 403} — authenticated,
 * wrong role — so a tourist session grants no operator surface.</li>
 * </ol>
 *
 * <p>Lives in the root test package because the web slice imports the package-private edge config
 * ({@code SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs}), like every other web-slice
 * test here. Runs without Docker or a DB, so it also guards the shared slice against the missing-bean
 * breakage a new controller causes (R-4). The real-schema behaviour — that the rows are genuinely
 * only this operator's — is {@code MyVenuesIT}'s job.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class MyVenuesControllerTest {

	private static final String MINE = "/api/venues/mine";

	@Autowired
	MockMvc mvc;

	/** Replaces the inert {@link WebSliceStubs} bean so this test can drive the payload. */
	@MockitoBean
	ListOwnedVenues listOwnedVenues;

	@Test
	void returnsTheSessionOperatorsVenuesAsJson() throws Exception {
		// WebSliceStubs' OperatorDirectory resolves any principal to operator 1.
		when(listOwnedVenues.ownedBy(new OperatorId(1))).thenReturn(List.of(
				new OwnedVenueView(12, "Miramar Beach Club", "Dhërmi"),
				new OwnedVenueView(15, "Sereno", "Jal")));

		mvc.perform(get(MINE).with(user("op").roles("OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].id").value(12))
				.andExpect(jsonPath("$[0].name").value("Miramar Beach Club"))
				.andExpect(jsonPath("$[0].beach").value("Dhërmi"))
				.andExpect(jsonPath("$[1].id").value(15));
	}

	@Test
	void ownedNothingIsAnEmptyArrayNotANotFound() throws Exception {
		when(listOwnedVenues.ownedBy(new OperatorId(1))).thenReturn(List.of());

		mvc.perform(get(MINE).with(user("op").roles("OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void deniesAnonymousAndCustomerSessions() throws Exception {
		// R-3: if the hasRole(OPERATOR) matcher were placed BELOW the public "GET /api/venues/**"
		// permitAll rule, this would be a 200 and the ownership map would be public.
		mvc.perform(get(MINE)).andExpect(status().isUnauthorized());
		// AC-9: a tourist session is authenticated but carries no ROLE_OPERATOR → 403, never 401/200.
		mvc.perform(get(MINE).with(user("tourist@example.com").roles("CUSTOMER")))
				.andExpect(status().isForbidden());

		// Neither reached the application service — the filter chain rejected both before the controller.
		verify(listOwnedVenues, never()).ownedBy(any());
	}

	@Test
	void theLiteralMineSegmentOutranksTheVenueIdPattern() throws Exception {
		// R-2: "mine" must never bind as a {venueId} path variable. Were VenueReadController to win,
		// the response would be 400 (NumberFormatException on "mine"), not 200 with an array.
		when(listOwnedVenues.ownedBy(new OperatorId(1))).thenReturn(List.of());

		mvc.perform(get(MINE).with(user("op").roles("OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$").isArray());
		verify(listOwnedVenues).ownedBy(new OperatorId(1));
	}
}
