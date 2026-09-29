package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;
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
import org.springframework.test.web.servlet.MvcResult;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorProvisioning;

import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract of the admin venue day refund (#1276, ADR-0027 decision 1): the guest lookup answers ids,
 * venue, span, status and per-day state and never a code (AC-4); the refund on the booking id at a venue
 * the admin does not own takes the operator entry's legs and refusals (AC-1, AC-5); every call leaves one audit row
 * naming the id and the sanitized grounds, never a code (AC-3); a plain operator is {@code 403} and anonymous
 * {@code 401} (AC-2). The bootstrap operator is the platform admin (V29) and owns none of the venues seeded here.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = { "riviera.operator.password=adr-admin-pw", "booking.no-show.enabled=false" })
@AutoConfigureMockMvc
class AdminDayRefundControllerIT {

	private static final String ADMIN = "operator";
	private static final String ADMIN_PW = "adr-admin-pw";
	private static final String PLAIN_OPERATOR = "adr-plain-op";
	private static final String PLAIN_OPERATOR_PW = "adr-plain-op-pw";
	private static final String LOOKUP_PATH = "/api/admin/bookings/lookup";
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void provisionAPlainOperator() {
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", PLAIN_OPERATOR).update();
		provisioning.provision(PLAIN_OPERATOR, encoder.encode(PLAIN_OPERATOR_PW));
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW);
	}

	private Cookie plainOperatorSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, PLAIN_OPERATOR, PLAIN_OPERATOR_PW);
	}

	/** A venue the bootstrap admin does not own, with one online set. */
	private long unownedVenue(String name) {
		long venue = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).query(Long.class).single();
		jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				""").param("venue", venue).update();
		return venue;
	}

	private long insertSpan(String code, String email, long venueId, LocalDate first, int days, long amountMinor,
			String status) {
		long customer = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600')
				ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id
				""").param("e", email).query(Long.class).single();
		long set = jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT 1")
				.param("v", venueId).query(Long.class).single();
		long id = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :first, :last, :amount, 'EUR', :status,
				        CASE WHEN :status = 'CONFIRMED' THEN now() END)
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", set).param("cust", customer)
				.param("first", first).param("last", first.plusDays(days - 1)).param("amount", amountMinor)
				.param("status", status)
				.query(Long.class).single();
		if ("CONFIRMED".equals(status)) {
			for (int i = 0; i < days; i++) {
				jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :date, 'BOOKED_ONLINE')")
						.param("set", set).param("date", first.plusDays(i)).update();
			}
		}
		return id;
	}

	private static String refundPath(long bookingId, LocalDate date) {
		return "/api/admin/bookings/" + bookingId + "/days/" + date + "/refund";
	}

	private static String lookupBody(String email) {
		return "{\"email\":\"" + email + "\"}";
	}

	private static String uniqueCode(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	private static LocalDate today() {
		return LocalDate.now(TIRANE);
	}

	private List<Map<String, Object>> auditRows(String path) {
		return jdbc.sql("SELECT actor, method, path, status, reason FROM admin_audit_record WHERE path = :path ORDER BY id")
				.param("path", path).query().listOfRows();
	}

	/** Invariant #7: no body may echo the bearer credential. */
	private static void assertNoCodeLeak(MvcResult result, String code) throws Exception {
		String body = result.getResponse().getContentAsString();
		assertFalse(body.contains(code), "the body must not carry the booking code: " + body);
	}

	/** AC-4: the lookup keys on the canonical email and answers what the admin needs to choose, never a code. */
	@Test
	void theLookupAnswersIdsVenueSpanAndDayStateNeverCodes() throws Exception {
		long venue = unownedVenue("ADR Lookup Club");
		String code = uniqueCode("ADRLOOK");
		String email = ("adr-lookup-" + code + "@example.com").toLowerCase(java.util.Locale.ROOT);
		LocalDate first = today().plusDays(40);
		long id = insertSpan(code, email, venue, first, 3, 9000L, "CONFIRMED");
		jdbc.sql("UPDATE booking_day SET attended_at = now() WHERE booking_id = :id AND service_date = :d")
				.param("id", id).param("d", first).update();
		long pending = insertSpan(uniqueCode("ADRPEND"), email, venue, first.plusDays(10), 1, 4500L, "AWAITING_PAYMENT");

		MvcResult result = mvc.perform(post(LOOKUP_PATH).cookie(adminSession()).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(lookupBody("  " + email.toUpperCase() + " ")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.bookings", hasSize(2)))
				.andExpect(jsonPath("$.bookings[0].bookingId").value(pending))
				.andExpect(jsonPath("$.bookings[0].status").value("AWAITING_PAYMENT"))
				.andExpect(jsonPath("$.bookings[0].refundable").value(false))
				.andExpect(jsonPath("$.bookings[0].days", hasSize(0)))
				.andExpect(jsonPath("$.bookings[1].bookingId").value(id))
				.andExpect(jsonPath("$.bookings[1].venueName").value("ADR Lookup Club"))
				.andExpect(jsonPath("$.bookings[1].firstDate").value(first.toString()))
				.andExpect(jsonPath("$.bookings[1].lastDate").value(first.plusDays(2).toString()))
				.andExpect(jsonPath("$.bookings[1].status").value("CONFIRMED"))
				.andExpect(jsonPath("$.bookings[1].refundable").value(true))
				.andExpect(jsonPath("$.bookings[1].days[0].state").value("ATTENDED"))
				.andExpect(jsonPath("$.bookings[1].days[1].state").value("OPEN"))
				.andExpect(jsonPath("$.bookings[1].days[2].date").value(first.plusDays(2).toString()))
				.andReturn();
		assertNoCodeLeak(result, code);
		assertFalse(result.getResponse().getContentAsString().contains("@"), "no address comes back either");

		mvc.perform(post(LOOKUP_PATH).cookie(adminSession()).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(lookupBody("nobody-" + code + "@example.com")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.bookings", hasSize(0)));
		mvc.perform(post(LOOKUP_PATH).cookie(adminSession()).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(lookupBody("not-an-address")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	/** AC-1 + AC-3: the day at an unowned venue is refunded as the operator's entry does it, and each call leaves one audit row naming the id. */
	@Test
	void refundsADayAtAnUnownedVenueAndEveryCallLeavesOneAuditRowNamingTheIdNeverTheCode() throws Exception {
		long venue = unownedVenue("ADR Refund Club");
		String code = uniqueCode("ADRREF");
		LocalDate first = today().plusDays(50);
		long id = insertSpan(code, "adr-refund-" + code + "@example.com", venue, first, 5, 25000L, "CONFIRMED");
		String path = refundPath(id, first.plusDays(2));

		MvcResult result = mvc.perform(post(path).cookie(adminSession()).with(csrf())
						.header("X-Audit-Reason", "pool closed\tfor repair"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.kind").value("DAY_REFUNDED"))
				.andExpect(jsonPath("$.serviceDate").value(first.plusDays(2).toString()))
				.andExpect(jsonPath("$.refundMinor").value(5000))
				.andExpect(jsonPath("$.currency").value("EUR"))
				.andExpect(jsonPath("$.released").value(true))
				.andReturn();
		assertNoCodeLeak(result, code);
		assertEquals(ADMIN, jdbc.sql("SELECT o.username FROM booking_day d JOIN operator o ON o.id = d.refunded_by_operator_id "
				+ "WHERE d.booking_id = :id AND d.service_date = :d").param("id", id).param("d", first.plusDays(2))
				.query(String.class).single(), "the admin is the recorded actor");
		assertEquals(0L, jdbc.sql("SELECT COUNT(*) FROM operator_venue ov JOIN operator o ON o.id = ov.operator_id "
				+ "WHERE o.username = :u AND ov.venue_id = :v").param("u", ADMIN).param("v", venue).query(Long.class).single(),
				"no ownership was needed");

		MvcResult replay = mvc.perform(post(path).cookie(adminSession()).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("DAY_ALREADY_REFUNDED"))
				.andReturn();
		assertNoCodeLeak(replay, code);

		List<Map<String, Object>> rows = auditRows(path);
		assertEquals(2, rows.size(), "one row per call, the refused replay included");
		assertEquals(ADMIN, rows.getFirst().get("actor"));
		assertEquals("POST", rows.getFirst().get("method"));
		assertEquals(200, rows.getFirst().get("status"));
		assertEquals("pool closed for repair", rows.getFirst().get("reason"), "sanitized grounds");
		assertEquals(409, rows.get(1).get("status"));
		assertNull(rows.get(1).get("reason"));
		assertFalse(path.contains(code), "the audited path carries the id, never the code (#7)");
	}

	/** AC-5: an attended day, a booking that did not happen and an unknown id answer as the operator entry's refusals. */
	@Test
	void refusalsMatchTheOperatorsEntry() throws Exception {
		long venue = unownedVenue("ADR Refusal Club");
		String code = uniqueCode("ADRATT");
		LocalDate first = today().minusDays(2);
		long attended = insertSpan(code, "adr-att-" + code + "@example.com", venue, first, 3, 9000L, "CONFIRMED");
		jdbc.sql("UPDATE booking_day SET attended_at = now() WHERE booking_id = :id AND service_date = :d")
				.param("id", attended).param("d", first).update();
		long unpaid = insertSpan(uniqueCode("ADRUNP"), "adr-unp-" + code + "@example.com", venue, first.plusDays(10), 2,
				9000L, "AWAITING_PAYMENT");

		MvcResult result = mvc.perform(post(refundPath(attended, first)).cookie(adminSession()).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("DAY_ATTENDED"))
				.andReturn();
		assertNoCodeLeak(result, code);
		mvc.perform(post(refundPath(unpaid, first.plusDays(10))).cookie(adminSession()).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_FOUND"));
		mvc.perform(post(refundPath(999_999_999L, first)).cookie(adminSession()).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_FOUND"));
		mvc.perform(post("/api/admin/bookings/" + attended + "/days/not-a-date/refund").cookie(adminSession()).with(csrf()))
				.andExpect(status().isBadRequest());
	}

	/** AC-2 on the real chain: a plain operator is {@code 403}, anonymous {@code 401}, and neither leaves an audit row. */
	@Test
	void aPlainOperatorIsForbiddenAndAnonymousUnauthorized() throws Exception {
		long venue = unownedVenue("ADR Gate Club");
		String code = uniqueCode("ADRGATE");
		LocalDate first = today().plusDays(60);
		long id = insertSpan(code, "adr-gate-" + code + "@example.com", venue, first, 2, 9000L, "CONFIRMED");
		String path = refundPath(id, first);
		int lookupRowsBefore = auditRows(LOOKUP_PATH).size();

		mvc.perform(post(path).cookie(plainOperatorSession()).with(csrf())).andExpect(status().isForbidden());
		mvc.perform(post(LOOKUP_PATH).cookie(plainOperatorSession()).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(lookupBody("x@example.com")))
				.andExpect(status().isForbidden());
		mvc.perform(post(path).with(csrf())).andExpect(status().isUnauthorized());
		mvc.perform(post(LOOKUP_PATH).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(lookupBody("x@example.com")))
				.andExpect(status().isUnauthorized());

		assertEquals(0, auditRows(path).size(), "a request the gate refused leaves no row");
		assertEquals(lookupRowsBefore, auditRows(LOOKUP_PATH).size(), "nor does a refused lookup");
		assertEquals("CONFIRMED", jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", id).query(String.class).single());
		assertNull(jdbc.sql("SELECT refunded_at FROM booking_day WHERE booking_id = :id AND service_date = :d")
				.param("id", id).param("d", first).query(java.time.OffsetDateTime.class).optional().orElse(null));
	}
}
