package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentOperator;
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
import org.springframework.http.MediaType;
import jakarta.servlet.http.Cookie;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The per-operator login proof (AC-3/AC-4/AC-5) — the reference deliverable that the
 * shared {@code OPERATOR} password is gone and each operator authenticates as <strong>itself</strong>.
 * Unlike {@code CrossVenueDenialIT} (which mocks the principal→id seam), this runs the <em>real</em>
 * login path end to end: distinct DB-backed credentials are provisioned for two operators, and the
 * ownership resolution ({@code CurrentOperator} + the real {@code operator} tables) is left intact —
 * so a request is attributed purely by which password authenticated.
 *
 * <p>Two synthetic per-venue operators are provisioned via the real {@link OperatorProvisioning}
 * port with edge-encoded hashes: <strong>A</strong> ({@code op-a}) and <strong>B</strong>
 * ({@code op-b}) each own their own fresh venue. The seeded bootstrap {@code operator} is
 * credentialled at startup from {@code riviera.operator.password} by
 * {@link OperatorCredentialInitializer}; with owns-all retired it owns only its backfilled
 * venue (Miramar, venue 1). The login is the SESSION flow: each
 * operator logs in once ({@code SessionLoginSupport}) and the staff daily-bookings read
 * ({@code GET /api/venues/{id}/bookings}) probes the resulting cookie: 200 for the owning
 * operator and 403 for any other, so the response encodes <em>which principal</em> the session
 * resolved to. Credential-rejection cases now assert the login endpoint itself (generic 401).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=bootstrap-pw")
@AutoConfigureMockMvc
class PerOperatorLoginIT {

	private static final long MIRAMAR = 1L; // seeded venue, backfilled to the bootstrap admin (V29)
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
	private long venueOwnedByB;

	@BeforeEach
	void provisionTwoOperators() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username IN ('op-a', 'op-b', 'op-c'))").update();
		jdbc.sql("DELETE FROM operator WHERE username IN ('op-a', 'op-b', 'op-c')").update();

		venueOwnedByA = newVenue("Operator A Venue");
		venueOwnedByB = newVenue("Operator B Venue");

		grant(provisioning.provision("op-a", encoder.encode("pw-a")), venueOwnedByA);
		grant(provisioning.provision("op-b", encoder.encode("pw-b")), venueOwnedByB);
	}

	private long newVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).query(Long.class).single();
	}

	private void grant(OperatorId operator, long venueId) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator.value()).update();
	}

	// ---- AC-3: each operator's session resolves to ITS OWN principal ----

	@Test
	void operatorAReachesItsOwnVenueButNotAnothers() throws Exception {
		Cookie sessionA = SessionLoginSupport.operatorSession(mvc, "op-a", "pw-a");
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).cookie(sessionA))
				.andExpect(status().isOk());
		// A's own session must NOT resolve to any other principal → B's venue is forbidden.
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByB).cookie(sessionA))
				.andExpect(status().isForbidden());
	}

	@Test
	void operatorBReachesItsOwnVenueButNotAnothers() throws Exception {
		Cookie sessionB = SessionLoginSupport.operatorSession(mvc, "op-b", "pw-b");
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByB).cookie(sessionB))
				.andExpect(status().isOk());
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).cookie(sessionB))
				.andExpect(status().isForbidden());
	}

	// ---- AC-4: there is NO shared/universal password ----

	@Test
	void anotherOperatorsPasswordDoesNotAuthenticate() throws Exception {
		// B's password used with A's username → 401 at the login endpoint (credentials are
		// per-operator, not interchangeable).
		expectLoginRejected("op-a", "pw-b");
	}

	@Test
	void theBootstrapPasswordDoesNotAuthenticateAnotherOperator() throws Exception {
		// The bootstrap operator's password is not a master key — it must not log in as op-a.
		expectLoginRejected("op-a", BOOTSTRAP_PW);
	}

	@Test
	void aWrongPasswordIsRejected() throws Exception {
		expectLoginRejected("op-a", "not-the-password");
	}

	@Test
	void anUnknownUsernameIsRejected() throws Exception {
		// No operator row → the UserDetailsService finds no credential → generic 401 (not 403/500).
		expectLoginRejected("ghost", "whatever");
	}

	// ---- AC-8: the bootstrap admin is credentialled at startup and owns only backfilled Miramar ----

	@Test
	void bootstrapIsProvisionedAndOwnsBackfilledMiramarOnly() throws Exception {
		Cookie bootstrap = SessionLoginSupport.operatorSession(mvc, "operator", BOOTSTRAP_PW);
		// Owns Miramar via the V29 backfill (its previously-implicit ownership made explicit)…
		mvc.perform(get("/api/venues/{v}/bookings", MIRAMAR).cookie(bootstrap))
				.andExpect(status().isOk());
		// …but no longer owns every venue: another operator's venue is now forbidden (owns-all retired).
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).cookie(bootstrap))
				.andExpect(status().isForbidden());
	}

	// ---- The may-authenticate set (#694): PENDING signs in; SUSPENDED/REJECTED cannot ----

	@Test
	void aSuspendedOperatorCannotLogIn() throws Exception {
		provisioning.provision("op-c", encoder.encode("pw-c"));
		jdbc.sql("UPDATE operator SET status = 'SUSPENDED' WHERE username = 'op-c'").update();

		expectLoginRejected("op-c", "pw-c");
	}

	@Test
	void aPendingOperatorCanLogIn() throws Exception {
		provisioning.provision("op-c", encoder.encode("pw-c"));
		jdbc.sql("UPDATE operator SET status = 'PENDING' WHERE username = 'op-c'").update();

		SessionLoginSupport.operatorSession(mvc, "op-c", "pw-c");
	}

	@Test
	void aRejectedOperatorCannotLogIn() throws Exception {
		provisioning.provision("op-c", encoder.encode("pw-c"));
		jdbc.sql("UPDATE operator SET status = 'REJECTED' WHERE username = 'op-c'").update();

		expectLoginRejected("op-c", "pw-c");
	}

	/** The session login must reject these credentials with the generic 401 (AuthSessionIT pins the body). */
	private void expectLoginRejected(String username, String password) throws Exception {
		mvc.perform(post("/api/auth/operator/login").with(csrf())
						.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"username": "%s", "password": "%s"}""".formatted(username, password)))
				.andExpect(status().isUnauthorized());
	}
}
