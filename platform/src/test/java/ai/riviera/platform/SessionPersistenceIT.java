package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import ai.riviera.platform.operator.api.OperatorProvisioning;
import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pins that sessions live in <strong>Postgres</strong>, not the servlet container (issue #109
 * AC-4, design D-1): Spring Session JDBC ({@link JdbcIndexedSessionRepository} — injected here so
 * a silent fallback to the in-memory store cannot pass) writes every session to the Flyway-managed
 * {@code SPRING_SESSION} tables (V19). Restart survival follows: the JVM holds no session state, so
 * a Render restart/redeploy only changes the process reading the same rows — exactly like the Event
 * Publication Registry (V8). Each MockMvc request is an independent exchange authenticated purely
 * by the {@code SESSION} cookie → every authenticated request after login IS a DB round-trip.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class SessionPersistenceIT {

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;
	@Autowired
	JdbcIndexedSessionRepository sessions; // fails wiring if the session store is not Spring Session JDBC

	@BeforeEach
	void provisionOperator() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = 'op-persist')").update();
		jdbc.sql("DELETE FROM operator WHERE username = 'op-persist'").update();
		provisioning.provision("op-persist", encoder.encode("pw-persist"));
	}

	@Test
	void sessionIsStoredInPostgresAndAuthenticatesSubsequentRequests() throws Exception {
		MvcResult result = mvc.perform(post("/api/auth/operator/login").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "op-persist", "password": "pw-persist"}"""))
				.andExpect(status().isOk())
				.andReturn();
		Cookie session = result.getResponse().getCookie("SESSION");
		assertNotNull(session);

		// The session row is in Postgres, indexed by principal (the restart-survival substrate).
		long rows = jdbc.sql("SELECT count(*) FROM spring_session WHERE principal_name = 'op-persist'")
				.query(Long.class).single();
		assertEquals(1, rows);

		// And a fresh request authenticated ONLY by the cookie reads it back from the DB.
		mvc.perform(get("/api/auth/me").cookie(session))
				.andExpect(status().isOk());
	}
}
