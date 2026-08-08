package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentOperator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import jakarta.servlet.http.Cookie;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /api/venues/mine} against the real schema (AC-1/AC-2) — the half
 * {@code MyVenuesControllerTest} cannot prove on a stubbed port: that the {@code operator_venue} join
 * really scopes the rows to the session operator, and that {@code ORDER BY name} really orders them.
 *
 * <p>Two synthetic operators are seeded, mirroring {@code CrossVenueDenialIT}: <strong>M</strong> owns
 * two venues, <strong>N</strong> owns one, and the backfilled Miramar (venue 1) is owned by neither.
 * The venues are inserted in <em>reverse</em> name order so a pass-through of insertion order would
 * fail the ordering assertion. Only the edge {@link CurrentOperator} (principal → operator id) is
 * mocked; the ownership mapping and the SQL are the real beans.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class MyVenuesIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final String MINE = "/api/venues/mine";
	/** Distinctive names so a shared-container run cannot collide with another test's venues. */
	private static final String M_FIRST_BY_NAME = "S9 Alpha Cove";
	private static final String M_LAST_BY_NAME = "S9 Zeta Beach Club";
	private static final String N_VENUE = "S9 Midway Bay";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	/** Mock only the identity seam; the ownership mapping and the venue read are the real beans. */
	@MockitoBean
	CurrentOperator currentOperator;

	private OperatorId operatorM;
	private OperatorId operatorN;
	private long mAlpha;
	private long mZeta;
	private Cookie operatorSession;

	@BeforeEach
	void seedTwoOperatorsWithVenues() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username IN ('s9-op-m', 's9-op-n'))").update();
		jdbc.sql("DELETE FROM operator WHERE username IN ('s9-op-m', 's9-op-n')").update();
		jdbc.sql("DELETE FROM venue WHERE name IN (:a, :z, :n)")
				.param("a", M_FIRST_BY_NAME).param("z", M_LAST_BY_NAME).param("n", N_VENUE).update();

		// Inserted last-by-name FIRST, so ids run counter to alphabetical order (see the ORDER BY assert).
		mZeta = newVenue(M_LAST_BY_NAME, "Jal");
		mAlpha = newVenue(M_FIRST_BY_NAME, "Dhërmi");
		long nVenue = newVenue(N_VENUE, "Borsh");
		operatorM = insertOperator("s9-op-m");
		operatorN = insertOperator("s9-op-n");
		grant(operatorM, mZeta);
		grant(operatorM, mAlpha);
		grant(operatorN, nVenue);
	}

	@Test
	void returnsOnlyOwnVenuesAgainstRealSchema() throws Exception {
		actingAs(operatorM);

		mvc.perform(get(MINE).cookie(operatorSession))
				.andExpect(status().isOk())
				// Exactly M's two venues — never N's, never the bootstrap admin's backfilled Miramar.
				.andExpect(jsonPath("$.length()").value(2))
				// ...ordered by name, not by id: Alpha (inserted second, higher id) comes first.
				.andExpect(jsonPath("$[0].id").value(mAlpha))
				.andExpect(jsonPath("$[0].name").value(M_FIRST_BY_NAME))
				.andExpect(jsonPath("$[0].beach").value("Dhërmi"))
				.andExpect(jsonPath("$[1].id").value(mZeta))
				.andExpect(jsonPath("$[1].name").value(M_LAST_BY_NAME));
	}

	@Test
	void anotherOperatorSeesOnlyItsOwnVenue() throws Exception {
		// Turns the assertion above into a real isolation proof, not a "it returned something" check.
		actingAs(operatorN);

		mvc.perform(get(MINE).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value(N_VENUE));
	}

	@Test
	void anOperatorOwningNothingGetsAnEmptyArray() throws Exception {
		// A freshly-approved operator owns nothing: 200 [] — never 404, never someone else's rows.
		actingAs(insertOperator("s9-op-empty"));

		mvc.perform(get(MINE).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	private long newVenue(String name, String beach) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, :beach, 'Test Region', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).param("beach", beach).query(Long.class).single();
	}

	private OperatorId insertOperator(String username) {
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", username).update();
		long id = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", username).query(Long.class).single();
		return new OperatorId(id);
	}

	private void grant(OperatorId operator, long venueId) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator.value()).update();
	}

	/** Attribute every subsequent request in the test to this operator (bypassing the interim resolver). */
	private void actingAs(OperatorId operator) {
		when(currentOperator.require(any())).thenReturn(operator);
	}
}
