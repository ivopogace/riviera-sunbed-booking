package ai.riviera.platform.payout;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorProvisioning;

import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin venue-change-fee surface at the HTTP seam: what it answers, what it stores, who is
 * refused, and what it records.
 *
 * <p>The write is a platform-wide commercial term, so it is role-gated and not venue-scoped —
 * invariant #13 exempts {@code /api/admin/**}, which makes the {@code ADMIN} gate the whole
 * authorization and these tests its only proof. A plain {@code ACTIVE} operator is provisioned to
 * demonstrate the {@code 403}: the bootstrap account carries both roles and could never show it.
 *
 * <p>The audit row is written by the edge's filter, not by the controller, so asserting it here is
 * what proves the surface actually sits inside the audited namespace.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=fee-admin-pw")
@AutoConfigureMockMvc
class AdminVenueChangeFeeIT {

	private static final String ADMIN = "operator";
	private static final String ADMIN_PW = "fee-admin-pw";
	private static final String PLAIN_OPERATOR = "fee-plain-op";
	private static final String PLAIN_OPERATOR_PW = "fee-plain-op-pw";
	private static final String FEE_PATH = "/api/admin/venue-change-fee";
	private static final long SEEDED_MINOR = 500L;

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void resetTheFeeAndProvisionAPlainOperator() {
		jdbc.sql("""
				INSERT INTO platform_setting (setting_key, amount_minor, currency)
				VALUES ('VENUE_CHANGE_FEE', :amount, 'EUR')
				ON CONFLICT (setting_key) DO UPDATE SET amount_minor = EXCLUDED.amount_minor
				""").param("amount", SEEDED_MINOR).update();
		jdbc.sql("DELETE FROM admin_audit_record WHERE path = :path").param("path", FEE_PATH).update();
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", PLAIN_OPERATOR).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", PLAIN_OPERATOR).update();
		provisioning.provision(PLAIN_OPERATOR, encoder.encode(PLAIN_OPERATOR_PW));
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW);
	}

	private Cookie plainOperatorSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, PLAIN_OPERATOR, PLAIN_OPERATOR_PW);
	}

	private long storedMinor() {
		return jdbc.sql("SELECT amount_minor FROM platform_setting WHERE setting_key = 'VENUE_CHANGE_FEE'")
				.query(Long.class).single();
	}

	private static String body(String amount) {
		return "{\"amountMinor\":" + amount + "}";
	}

	@Test
	void readsTheStoredFee() throws Exception {
		mvc.perform(get(FEE_PATH).cookie(adminSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.amountMinor").value((int) SEEDED_MINOR))
				.andExpect(jsonPath("$.currency").value("EUR"));
	}

	@Test
	void writesTheFeeAndLeavesAnAuditRow() throws Exception {
		mvc.perform(put(FEE_PATH).cookie(adminSession()).with(csrf())
						.header("X-Audit-Reason", "Board approved a higher change fee")
						.contentType(MediaType.APPLICATION_JSON).content(body("700")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.amountMinor").value(700))
				.andExpect(jsonPath("$.currency").value("EUR"));

		assertEquals(700L, storedMinor());

		List<Map<String, Object>> rows = jdbc.sql("""
				SELECT actor, method, path, status, reason FROM admin_audit_record
				WHERE path = :path ORDER BY id
				""").param("path", FEE_PATH).query().listOfRows();
		assertEquals(1, rows.size(), "one mutating admin action, one audit row");
		assertEquals(ADMIN, rows.getFirst().get("actor"));
		assertEquals("PUT", rows.getFirst().get("method"));
		assertEquals(200, rows.getFirst().get("status"));
		assertEquals("Board approved a higher change fee", rows.getFirst().get("reason"));
	}

	@Test
	void theNextChargeReadsTheWrittenFee() throws Exception {
		mvc.perform(put(FEE_PATH).cookie(adminSession()).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body("1250")))
				.andExpect(status().isOk());

		mvc.perform(get(FEE_PATH).cookie(adminSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.amountMinor").value(1250));
	}

	@Test
	void refusesANonAdmin() throws Exception {
		mvc.perform(put(FEE_PATH).cookie(plainOperatorSession()).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body("700")))
				.andExpect(status().isForbidden());

		assertEquals(SEEDED_MINOR, storedMinor(), "a refused write stores nothing");
	}

	@Test
	void refusesAnAnonymousCaller() throws Exception {
		mvc.perform(get(FEE_PATH)).andExpect(status().isUnauthorized());
		mvc.perform(put(FEE_PATH).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body("700")))
				.andExpect(status().isUnauthorized());

		assertEquals(SEEDED_MINOR, storedMinor());
	}

	@Test
	void rejectsAnOutOfRangeAmount() throws Exception {
		Cookie admin = adminSession();
		for (String amount : List.of("-1", "100001", "null")) {
			mvc.perform(put(FEE_PATH).cookie(admin).with(csrf())
							.contentType(MediaType.APPLICATION_JSON).content(body(amount)))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		}

		assertEquals(SEEDED_MINOR, storedMinor(), "a rejected write stores nothing");
	}
}
