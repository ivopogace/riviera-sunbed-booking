package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.OperatorProvisioning;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The per-operator login proof (issue #74, AC-3/AC-4/AC-5) — the reference deliverable that the
 * shared {@code OPERATOR} password is gone and each operator authenticates as <strong>itself</strong>.
 * Unlike {@code CrossVenueDenialIT} (which mocks the principal→id seam), this runs the <em>real</em>
 * login path end to end: distinct DB-backed credentials are provisioned for two operators, and the
 * ownership resolution ({@code CurrentOperator} + the real {@code operator} tables) is left intact —
 * so a request is attributed purely by which password authenticated.
 *
 * <p>Two synthetic per-venue operators are provisioned via the real {@link OperatorProvisioning}
 * port with edge-encoded hashes: <strong>A</strong> ({@code op-a}) owns a fresh venue,
 * <strong>B</strong> ({@code op-b}) owns Miramar (venue 1). The seeded bootstrap {@code operator}
 * (owns-all) is credentialled at startup from {@code riviera.operator.password} by
 * {@link OperatorCredentialInitializer}. The staff daily-bookings read
 * ({@code GET /api/venues/{id}/bookings}) is the probe: it returns 200 for the owning operator and
 * 403 for any other, so the response encodes <em>which principal</em> the login resolved to.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=bootstrap-pw")
@AutoConfigureMockMvc
class PerOperatorLoginIT {

	private static final long MIRAMAR = 1L; // seeded venue, owned by B here
	private static final String BOOTSTRAP_PW = "bootstrap-pw";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	private long venueOwnedByA;

	@BeforeEach
	void provisionTwoOperators() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username IN ('op-a', 'op-b', 'op-c'))").update();
		jdbc.sql("DELETE FROM operator WHERE username IN ('op-a', 'op-b', 'op-c')").update();

		venueOwnedByA = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Operator A Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();

		grant(provisioning.provision("op-a", encoder.encode("pw-a")), venueOwnedByA);
		grant(provisioning.provision("op-b", encoder.encode("pw-b")), MIRAMAR);
	}

	private void grant(OperatorId operator, long venueId) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator.value()).update();
	}

	// ---- AC-3: each operator's login resolves to ITS OWN principal ----

	@Test
	void operatorAReachesItsOwnVenueButNotAnothers() throws Exception {
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).with(httpBasic("op-a", "pw-a")))
				.andExpect(status().isOk());
		// A's own login must NOT resolve to any other principal → Miramar (B's) is forbidden.
		mvc.perform(get("/api/venues/{v}/bookings", MIRAMAR).with(httpBasic("op-a", "pw-a")))
				.andExpect(status().isForbidden());
	}

	@Test
	void operatorBReachesItsOwnVenueButNotAnothers() throws Exception {
		mvc.perform(get("/api/venues/{v}/bookings", MIRAMAR).with(httpBasic("op-b", "pw-b")))
				.andExpect(status().isOk());
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).with(httpBasic("op-b", "pw-b")))
				.andExpect(status().isForbidden());
	}

	// ---- AC-4: there is NO shared/universal password ----

	@Test
	void anotherOperatorsPasswordDoesNotAuthenticate() throws Exception {
		// B's password used with A's username → 401 (credentials are per-operator, not interchangeable).
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).with(httpBasic("op-a", "pw-b")))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void theBootstrapPasswordDoesNotAuthenticateAnotherOperator() throws Exception {
		// The bootstrap operator's password is not a master key — it must not log in as op-a.
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).with(httpBasic("op-a", BOOTSTRAP_PW)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void aWrongPasswordIsRejected() throws Exception {
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).with(httpBasic("op-a", "not-the-password")))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void anUnknownUsernameIsRejected() throws Exception {
		// No operator row → the UserDetailsService finds no credential → 401 (not a 403/500).
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).with(httpBasic("ghost", "whatever")))
				.andExpect(status().isUnauthorized());
	}

	// ---- AC-5: the bootstrap operator is credentialled at startup and still owns-all ----

	@Test
	void bootstrapOperatorLoginIsProvisionedAndOwnsEveryVenue() throws Exception {
		mvc.perform(get("/api/venues/{v}/bookings", MIRAMAR).with(httpBasic("operator", BOOTSTRAP_PW)))
				.andExpect(status().isOk());
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).with(httpBasic("operator", BOOTSTRAP_PW)))
				.andExpect(status().isOk());
	}

	// ---- A suspended operator cannot authenticate at all ----

	@Test
	void aSuspendedOperatorCannotLogIn() throws Exception {
		provisioning.provision("op-c", encoder.encode("pw-c"));
		jdbc.sql("UPDATE operator SET status = 'SUSPENDED' WHERE username = 'op-c'").update();

		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).with(httpBasic("op-c", "pw-c")))
				.andExpect(status().isUnauthorized());
	}
}
