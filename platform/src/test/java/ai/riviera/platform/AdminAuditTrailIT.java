package ai.riviera.platform;

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

import ai.riviera.platform.operator.api.OperatorProvisioning;
import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The platform-admin audit trail end-to-end (#507, required by ADR-0013): a mutating
 * {@code /api/admin/**} action past the gate writes an {@code admin_audit_record} row with the
 * actor, method, path, outcome status, UTC instant and optional sanitized grounds (AC-1/AC-2);
 * requests the security chain rejects — and all reads — leave no row (AC-3); the ADMIN-gated
 * {@code GET /api/admin/audit} lists newest-first and refuses a plain OPERATOR (AC-4).
 *
 * <p>The audited action throughout is {@code POST /api/admin/erasure} on a never-registered email —
 * a harmless no-op that still answers {@code 204} (non-enumerating, D-8). Real Postgres via
 * Testcontainers (full Flyway chain incl. V38); logins carry unique {@code X-Forwarded-For}
 * addresses so suite traffic never shares a rate bucket (#127).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=admin-pw")
@AutoConfigureMockMvc
class AdminAuditTrailIT {

	private static final String ADMIN = "operator";
	private static final String ADMIN_PW = "admin-pw";
	private static final String ERASURE_PATH = "/api/admin/erasure";
	private static final String ERASURE_BODY = """
			{"email":"audit-ghost@example.com"}""";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM admin_audit_record").update();
		jdbc.sql("DELETE FROM operator WHERE username LIKE 'audit-%'").update();
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW);
	}

	private long auditRows() {
		return jdbc.sql("SELECT COUNT(*) FROM admin_audit_record").query(Long.class).single();
	}

	@Test
	void recordsMutatingAdminActionWithOutcome() throws Exception {
		Cookie admin = adminSession();

		mvc.perform(post(ERASURE_PATH).cookie(admin).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(ERASURE_BODY))
				.andExpect(status().isNoContent());
		// An application-level failure is still an attempted action — recorded with its status.
		mvc.perform(post(ERASURE_PATH).cookie(admin).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("""
						{"email":""}"""))
				.andExpect(status().isBadRequest());

		List<Map<String, Object>> rows = jdbc.sql(
				"SELECT actor, method, path, status, reason FROM admin_audit_record ORDER BY id")
				.query().listOfRows();
		assertEquals(2, rows.size());
		assertEquals(ADMIN, rows.getFirst().get("actor"));
		assertEquals("POST", rows.getFirst().get("method"));
		assertEquals(ERASURE_PATH, rows.getFirst().get("path"));
		assertEquals(204, rows.getFirst().get("status"));
		assertNull(rows.getFirst().get("reason"), "no header offered → no reason recorded");
		assertEquals(400, rows.get(1).get("status"));
		long stamped = jdbc.sql("SELECT COUNT(*) FROM admin_audit_record WHERE occurred_at IS NOT NULL")
				.query(Long.class).single();
		assertEquals(2, stamped);
	}

	@Test
	void recordsSanitizedReason() throws Exception {
		Cookie admin = adminSession();

		// A raw CRLF never arrives (StrictHttpFirewall rejects it pre-app); a tab is the control
		// character a real request CAN carry, and the sanitizer flattens it the same way.
		mvc.perform(post(ERASURE_PATH).cookie(admin).with(csrf())
				.header(AdminAuditReasons.HEADER, "reported\tby guest")
				.contentType(MediaType.APPLICATION_JSON).content(ERASURE_BODY))
				.andExpect(status().isNoContent());
		mvc.perform(post(ERASURE_PATH).cookie(admin).with(csrf())
				.header(AdminAuditReasons.HEADER, "   ")
				.contentType(MediaType.APPLICATION_JSON).content(ERASURE_BODY))
				.andExpect(status().isNoContent());

		List<String> reasons = jdbc.sql("SELECT reason FROM admin_audit_record ORDER BY id")
				.query(String.class).list();
		assertEquals("reported by guest", reasons.getFirst(), "CRLF collapsed to a single space");
		assertNull(reasons.get(1), "a blank reason is recorded as absent, not as whitespace");
	}

	@Test
	void doesNotRecordAnonymousOrReadRequests() throws Exception {
		// Anonymous mutating request — rejected at the gate, never reaches the audit filter.
		mvc.perform(post(ERASURE_PATH).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(ERASURE_BODY))
				.andExpect(status().isUnauthorized());

		// A plain OPERATOR (authenticated, wrong role) — likewise rejected upstream, no row.
		provisioning.provision("audit-op", encoder.encode("audit-op-pw-123"));
		Cookie operator = SessionLoginSupport.operatorSession(mvc, "audit-op", "audit-op-pw-123");
		mvc.perform(post(ERASURE_PATH).cookie(operator).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(ERASURE_BODY))
				.andExpect(status().isForbidden());

		// Admin reads — including the audit read itself — are not audited.
		mvc.perform(get("/api/admin/audit").cookie(adminSession())).andExpect(status().isOk());

		assertEquals(0, auditRows());
	}

	@Test
	void adminReadsAuditNewestFirst() throws Exception {
		Cookie admin = adminSession();
		mvc.perform(post(ERASURE_PATH).cookie(admin).with(csrf())
				.header(AdminAuditReasons.HEADER, "first")
				.contentType(MediaType.APPLICATION_JSON).content(ERASURE_BODY))
				.andExpect(status().isNoContent());
		mvc.perform(post(ERASURE_PATH).cookie(admin).with(csrf())
				.header(AdminAuditReasons.HEADER, "second")
				.contentType(MediaType.APPLICATION_JSON).content(ERASURE_BODY))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/admin/audit").cookie(admin))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].reason").value("second"))
				.andExpect(jsonPath("$[1].reason").value("first"))
				.andExpect(jsonPath("$[0].actor").value(ADMIN))
				.andExpect(jsonPath("$[0].method").value("POST"))
				.andExpect(jsonPath("$[0].path").value(ERASURE_PATH))
				.andExpect(jsonPath("$[0].status").value(204))
				.andExpect(jsonPath("$[0].occurredAt").value(notNullValue()));

		mvc.perform(get("/api/admin/audit").param("limit", "1").cookie(admin))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].reason").value("second"));

		// A plain OPERATOR cannot browse the trail.
		provisioning.provision("audit-reader", encoder.encode("audit-reader-pw-1"));
		Cookie operator = SessionLoginSupport.operatorSession(mvc, "audit-reader", "audit-reader-pw-1");
		mvc.perform(get("/api/admin/audit").cookie(operator)).andExpect(status().isForbidden());
	}
}
