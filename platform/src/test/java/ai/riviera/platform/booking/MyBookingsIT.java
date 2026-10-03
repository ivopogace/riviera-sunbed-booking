package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;

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
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.remodel.NewReceipt;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcome;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcomeKind;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /api/me/bookings} lists only the authenticated customer's account-linked
 * bookings, and is CUSTOMER-only. Proves AC-3 (cross-customer denial — customer A never sees B's
 * bookings, enforced by the {@code WHERE account_id = :account} scope, not a request param) and AC-4
 * (anonymous → 401, an operator session → 403, a customer → 200). Real security + Testcontainers;
 * skipped where Docker is absent. Each login rides a unique {@code X-Forwarded-For}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class MyBookingsIT {

	private static final String SESSION_COOKIE = "SESSION";
	private static final String EMAIL_A = "mybk-a@example.com";
	private static final String EMAIL_B = "mybk-b@example.com";
	private static final String PASSWORD = "password123";
	private static final String OPERATOR_USERNAME = "mybk-op";
	private static final String OPERATOR_PASSWORD = "op-password";
	private static final String CODE_A = "MYBKMINEA01";
	private static final String CODE_B = "MYBKOTHERB1";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	CustomerAccountProvisioning customerProvisioning;
	@Autowired
	OperatorProvisioning operatorProvisioning;
	@Autowired
	PasswordEncoder encoder;

	private record SetRef(long setId, long venueId) {
	}

	@Autowired
	Bookings bookings;
	@Autowired
	RemodelReceipts receipts;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanupNow(jdbc, venue));
	}

	@BeforeEach
	void seed() {
		jdbc.sql("DELETE FROM booking WHERE code IN (:a, :b)").param("a", CODE_A).param("b", CODE_B).update();
		// The guest-contact rows insertBooking creates (FK from booking) — remove before the booking's
		// gone so a re-seed doesn't collide on customer_email_uniq. Bookings are deleted first (above).
		jdbc.sql("DELETE FROM customer WHERE email IN (:a, :b)")
				.param("a", CODE_A + "@example.com").param("b", CODE_B + "@example.com").update();
		jdbc.sql("DELETE FROM customer_account WHERE email IN (:a, :b)").param("a", EMAIL_A).param("b", EMAIL_B).update();
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", OPERATOR_USERNAME).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", OPERATOR_USERNAME).update();

		customerProvisioning.register(EMAIL_A, encoder.encode(PASSWORD));
		customerProvisioning.register(EMAIL_B, encoder.encode(PASSWORD));
		operatorProvisioning.provision(OPERATOR_USERNAME, encoder.encode(OPERATOR_PASSWORD));

		SetRef set = onlineSet();
		insertBooking(CODE_A, set, accountId(EMAIL_A));
		insertBooking(CODE_B, set, accountId(EMAIL_B));
	}

	@Test
	void listsOnlyTheAuthenticatedCustomersBookings() throws Exception {
		Cookie session = customerLogin(EMAIL_A);

		// AC-3 + AC-4 (customer): A's own booking is listed; B's booking (same set, other account) is not.
		mvc.perform(get("/api/me/bookings").cookie(session))
				.andExpect(status().isOk())
				.andExpect(content().string(containsString(CODE_A)))
				.andExpect(content().string(not(containsString(CODE_B))));
	}

	@Test
	void aMovedBookingCarriesWhenItMoved() throws Exception {
		jdbc.sql("UPDATE booking SET moved_at = TIMESTAMPTZ '2026-09-09T13:00:00Z' WHERE code = :c").param("c", CODE_A).update();
		Cookie session = customerLogin(EMAIL_A);

		mvc.perform(get("/api/me/bookings").cookie(session))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].movedAt").value("2026-09-09T13:00:00Z"));
		jdbc.sql("UPDATE booking SET moved_at = NULL WHERE code = :c").param("c", CODE_A).update();
	}

	/** ADR-0026 §7 (#1425): the row says what the detail page says — a lone booking with every day refunded has nothing left. */
	@Test
	void aLoneBookingWithEveryDayRefundedHasNothingLeft() throws Exception {
		Venue venue = venue();
		LocalDate first = StayFixtures.firstDay();
		String code = "MBNL" + System.nanoTime() % 100_000_000L;
		long booking = insertLone(venue, code, first, first.plusDays(1), 2 * StayFixtures.PRICE);
		refundDays(booking, first, first.plusDays(1));

		expectNothingLeft(code, true);
	}

	/** Nothing left is "no day unrefunded", never "nothing left to refund": the first day's refund took the whole amount. */
	@Test
	void aLoneBookingWithAnUnrefundedZeroShareDayHasSomethingLeft() throws Exception {
		Venue venue = venue();
		LocalDate first = StayFixtures.firstDay();
		String code = "MBZS" + System.nanoTime() % 100_000_000L;
		long booking = insertLone(venue, code, first, first.plusDays(1), StayFixtures.PRICE / 2);
		refundDays(booking, first, first);

		expectNothingLeft(code, false);
	}

	/** The stay's rule is the detail page's split, not a fold over the stretches: a remodel-ended stretch is set aside. */
	@Test
	void aStayARemodelEndedOnOneStretchAndRefundedOnTheOtherHasNothingLeft() throws Exception {
		Venue venue = venue();
		LocalDate first = StayFixtures.firstDay();
		String code = "MBRS" + System.nanoTime() % 100_000_000L;
		StayFixtures.SeededStay stay = StayFixtures.insertStay(jdbc, venue, code, first, venue.online().get(0), 2,
				"CONFIRMED", venue.online().get(1), 2, "CONFIRMED");
		linkToAccount(stay);
		endAsARemodelRefund(venue, stay.stretches().get(0), venue.online().get(0), first);
		refundDays(stay.stretches().get(1), first.plusDays(2), first.plusDays(3));

		expectNothingLeft(code, true);
	}

	@Test
	void anOrdinaryStayHasSomethingLeft() throws Exception {
		Venue venue = venue();
		LocalDate first = StayFixtures.firstDay();
		String code = "MBOS" + System.nanoTime() % 100_000_000L;
		linkToAccount(StayFixtures.insertStay(jdbc, venue, code, first, venue.online().get(0), 2, "CONFIRMED",
				venue.online().get(1), 2, "CONFIRMED"));

		expectNothingLeft(code, false);
	}

	@Test
	void anonymousIsUnauthorized() throws Exception {
		mvc.perform(get("/api/me/bookings")).andExpect(status().isUnauthorized());
	}

	@Test
	void operatorSessionIsForbidden() throws Exception {
		Cookie operator = SessionLoginSupport.operatorSession(mvc, OPERATOR_USERNAME, OPERATOR_PASSWORD);
		mvc.perform(get("/api/me/bookings").cookie(operator)).andExpect(status().isForbidden());
	}

	private void expectNothingLeft(String code, boolean nothingLeft) throws Exception {
		mvc.perform(get("/api/me/bookings").cookie(customerLogin(EMAIL_A)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.code == '%s')].nothingLeft".formatted(code)).value(contains(nothingLeft)))
				.andExpect(jsonPath("$[?(@.code == '%s')].status".formatted(code)).value(contains("CONFIRMED")));
	}

	private Venue venue() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		return venue;
	}

	/** A lone {@code CONFIRMED} booking on account A over {@code first..last}; the trigger writes its service days. */
	private long insertLone(Venue venue, String code, LocalDate first, LocalDate last, long amountMinor) {
		long guest = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, account_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :account, :first, :last, :amount, 'EUR', 'CONFIRMED', now())
				RETURNING id
				""").param("code", code).param("venue", venue.id()).param("set", venue.online().get(2).value())
				.param("cust", guest).param("account", accountId(EMAIL_A)).param("first", first).param("last", last)
				.param("amount", amountMinor).query(Long.class).single();
	}

	private void linkToAccount(StayFixtures.SeededStay stay) {
		jdbc.sql("UPDATE booking SET account_id = :a WHERE stay_id = :s").param("a", accountId(EMAIL_A))
				.param("s", stay.id()).update();
	}

	/** Weather-refunds a booking's service days {@code from..to}, as the storm would. */
	private void refundDays(long booking, LocalDate from, LocalDate to) {
		jdbc.sql("""
				UPDATE booking_day SET refunded_at = now(), refund_minor = :minor, refund_reason = 'WEATHER'
				WHERE booking_id = :b AND service_date BETWEEN :from AND :to
				""").param("minor", StayFixtures.PRICE / 2).param("b", booking).param("from", from).param("to", to)
				.update();
	}

	/** Leaves a stretch as a remodel refund does: {@code CANCELLED} as {@code VENUE_CHANGE} with the receipt's outcome line. */
	private void endAsARemodelRefund(Venue venue, long stretch, SetId set, LocalDate day) {
		long amount = jdbc.sql("SELECT amount_minor FROM booking WHERE id = :id").param("id", stretch)
				.query(Long.class).single();
		bookings.cancelConfirmed(stretch, Instant.now(), amount, RefundReason.VENUE_CHANGE, amount).orElseThrow();
		receipts.store(new NewReceipt(new VenueId(venue.id()), StayFixtures.ownerOf(jdbc, venue), Instant.now(),
				List.of(), List.of(new ReceiptOutcome(new BookingId(stretch), day, new SpotRef(set, "A", 1),
						ReceiptOutcomeKind.REFUND, amount, "EUR", 0L)), "row A rebuilt", List.of()));
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long accountId(String email) {
		return jdbc.sql("SELECT id FROM customer_account WHERE email = :e").param("e", email)
				.query(Long.class).single();
	}

	private void insertBooking(String code, SetRef set, long accountId) {
		long guest = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, account_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :account, :date, 4500, 'EUR', 'CONFIRMED')
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", guest).param("account", accountId).param("date", LocalDate.of(2027, 8, 20))
				.update();
	}

	private Cookie customerLogin(String email) throws Exception {
		Cookie session = mvc.perform(post("/api/auth/customer/login").with(csrf())
						.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"email": "%s", "password": "%s"}""".formatted(email, PASSWORD)))
				.andExpect(status().isOk())
				.andReturn().getResponse().getCookie(SESSION_COOKIE);
		if (session == null) {
			throw new IllegalStateException("customer login must establish a session cookie");
		}
		return session;
	}
}
