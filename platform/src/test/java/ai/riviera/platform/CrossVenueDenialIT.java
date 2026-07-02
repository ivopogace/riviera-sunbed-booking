package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.operator.vocabulary.OperatorId;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The cross-venue denial matrix (issue #73, AC-4/AC-5) — the reference deliverable proving the BOLA
 * fix (invariant #13, OWASP API #1). For <strong>every</strong> venue-scoped endpoint, an operator
 * that does not own the target venue gets {@code 403}; the owning operator does not; and the
 * platform-wide {@code /api/admin/**} surface plus {@code POST /api/venues} (no path {@code venueId})
 * stay role-gated only.
 *
 * <p>Two synthetic per-venue operators are seeded: <strong>A</strong> owns a fresh venue, <strong>B</strong>
 * owns Miramar (venue 1). The real {@code VenueOwnership} runs against the real {@code operator} tables;
 * only the edge {@link CurrentOperator} (principal → operator id — the seam #74 completes) is mocked, so
 * each request is attributed to A or B independently of the interim single shared login. httpBasic still
 * satisfies the role gate. The staff-availability case is the spoofing test: A uses <em>its own</em>
 * venue in the URL path but a Miramar {@code setId}, and is still denied because the service resolves the
 * owning venue from the set, never the path.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class CrossVenueDenialIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final long MIRAMAR = 1L; // seeded venue, owned by B in this test

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	/** Mock only the identity seam; the ownership check itself is the real DB-backed bean. */
	@MockitoBean
	CurrentOperator currentOperator;

	private OperatorId operatorA;
	private OperatorId operatorB;
	private long venueOwnedByA;
	private long miramarSetId;

	@BeforeEach
	void seedTwoOperators() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username IN ('op-a', 'op-b'))").update();
		jdbc.sql("DELETE FROM operator WHERE username IN ('op-a', 'op-b')").update();

		venueOwnedByA = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Operator A Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		operatorA = insertOperator("op-a");
		operatorB = insertOperator("op-b");
		grant(operatorA, venueOwnedByA);
		grant(operatorB, MIRAMAR);
		miramarSetId = jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT 1")
				.param("v", MIRAMAR).query(Long.class).single();
	}

	private OperatorId insertOperator(String username) {
		long id = jdbc.sql("INSERT INTO operator (username, status, owns_all_venues) "
						+ "VALUES (:u, 'ACTIVE', FALSE) RETURNING id")
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

	// ---- Denials: operator A (does NOT own Miramar) is 403 on every venue-scoped surface ----

	@Test
	void beachMapEditByNonOwnerIs403() throws Exception {
		actingAs(operatorA);
		String setBody = """
				{"rowLabel":"Row A","positionNo":1,"tier":"STANDARD","pool":"ONLINE",
				 "price":{"minorUnits":3000,"currency":"EUR"},"gridX":1,"gridY":1}
				""";
		// The 403 shape is the one error contract (issue #97): ProblemDetail + stable code.
		mvc.perform(post("/api/venues/{v}/sets", MIRAMAR).with(httpBasic(OPERATOR, PASSWORD))
						.contentType(MediaType.APPLICATION_JSON).content(setBody))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void staffBookingsReadByNonOwnerIs403() throws Exception {
		actingAs(operatorA);
		mvc.perform(get("/api/venues/{v}/bookings", MIRAMAR).with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isForbidden());
	}

	@Test
	void weatherRefundByNonOwnerIs403() throws Exception {
		actingAs(operatorA);
		mvc.perform(post("/api/venues/{v}/weather-refund", MIRAMAR).with(httpBasic(OPERATOR, PASSWORD))
						.param("date", "2020-01-01"))
				.andExpect(status().isForbidden());
	}

	@Test
	void payoutLedgerReadByNonOwnerIs403() throws Exception {
		actingAs(operatorA);
		mvc.perform(get("/api/venues/{v}/payout-ledger", MIRAMAR).with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isForbidden());
	}

	@Test
	void staffAvailabilityMarkByNonOwnerIs403_evenWhenSpoofingThePathVenue() throws Exception {
		// A owns venueOwnedByA and puts it in the PATH, but targets a Miramar setId. The check must
		// resolve the venue from the set (Miramar → owned by B), not the path → 403 (invariant #13, R-2).
		actingAs(operatorA);
		mvc.perform(post("/api/venues/{v}/sets/{s}/availability", venueOwnedByA, miramarSetId)
						.with(httpBasic(OPERATOR, PASSWORD))
						.contentType(MediaType.APPLICATION_JSON).content("{\"date\":\"2035-07-01\"}"))
				.andExpect(status().isForbidden());

		mvc.perform(delete("/api/venues/{v}/sets/{s}/availability", venueOwnedByA, miramarSetId)
						.with(httpBasic(OPERATOR, PASSWORD)).param("date", "2035-07-01"))
				.andExpect(status().isForbidden());
	}

	// ---- The owner (B) is NOT forbidden on the same surfaces ----

	@Test
	void ownerReadsAreNotForbidden() throws Exception {
		actingAs(operatorB);
		mvc.perform(get("/api/venues/{v}/bookings", MIRAMAR).with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isOk());
		mvc.perform(get("/api/venues/{v}/payout-ledger", MIRAMAR).with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isOk());
		// A weather refund on a day with no bookings is a no-op (200), not a 403 — the check passed.
		mvc.perform(post("/api/venues/{v}/weather-refund", MIRAMAR).with(httpBasic(OPERATOR, PASSWORD))
						.param("date", "2019-02-02"))
				.andExpect(status().isOk());
	}

	@Test
	void ownerCanMarkItsOwnSet_venueResolvedFromTheSet() throws Exception {
		// The positive counterpart to the spoof denial: B owns Miramar (via an explicit operator_venue
		// mapping, not owns-all), so marking a Miramar set — whose owning venue is resolved from the
		// setId, not the path — succeeds. Proves the venue-from-set happy path lets the real owner
		// through, so the spoof denial's 403 is genuinely from ownership, not an always-deny bug.
		actingAs(operatorB);
		mvc.perform(post("/api/venues/{v}/sets/{s}/availability", MIRAMAR, miramarSetId)
						.with(httpBasic(OPERATOR, PASSWORD))
						.contentType(MediaType.APPLICATION_JSON).content("{\"date\":\"2036-03-03\"}"))
				.andExpect(status().isOk());
	}

	// ---- Exemptions: platform-wide admin + venue creation are role-gated only (no ownership) ----

	@Test
	void adminPayoutBatchesIsNotOwnershipChecked() throws Exception {
		actingAs(operatorA); // A owns no Miramar data, yet the platform-wide admin report is reachable
		mvc.perform(get("/api/admin/payout-batches").with(httpBasic(OPERATOR, PASSWORD))
						.param("period", "2026-W01"))
				.andExpect(status().isOk());
	}

	@Test
	void venueCreationIsNotOwnershipChecked() throws Exception {
		actingAs(operatorA);
		String venueBody = """
				{"name":"A New Venue","beach":"Ksamil","region":"Riviera","description":"x",
				 "bookingMode":"INSTANT","commissionBps":1500,"payoutCurrency":"EUR","bookingCutoff":"18:00"}
				""";
		mvc.perform(post("/api/venues").with(httpBasic(OPERATOR, PASSWORD))
						.contentType(MediaType.APPLICATION_JSON).content(venueBody))
				.andExpect(status().isCreated());
	}
}
