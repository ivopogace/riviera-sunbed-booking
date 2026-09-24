package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies the U3 migration (issue #6) creates {@code customer} and {@code booking} with the
 * constraints that enforce invariants (invariant #12): {@code UNIQUE(code)} (the bearer
 * credential, #7), the {@code status} CHECK, {@code UNIQUE(customer.email)} (the guest key),
 * and — critically — that {@code booking} does <em>not</em> enforce
 * {@code (set_id, booking_date)} uniqueness (that is the availability table's job, #2).
 * Testcontainers Postgres + real Flyway; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class BookingMigrationIT {

	@Autowired
	JdbcClient jdbc;

	private long anyOnlineSetId() {
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single();
	}

	private long anyVenueId() {
		return jdbc.sql("SELECT id FROM venue ORDER BY id LIMIT 1").query(Long.class).single();
	}

	private long insertCustomer(String email) {
		return jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:email, 'Guest', '+355600000') RETURNING id")
				.param("email", email).query(Long.class).single();
	}

	private void insertBooking(long venueId, long setId, long customerId, String code,
			LocalDate date, String status) {
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', :status)
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customerId).param("date", date).param("status", status)
				.update();
	}

	@Test
	void duplicateCodeRejected() {
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("dup-code@example.com");
		LocalDate date = LocalDate.of(2026, 9, 10);
		insertBooking(venue, set, cust, "CODE000001", date, "CONFIRMED");

		assertThrows(DataIntegrityViolationException.class,
				() -> insertBooking(venue, set, cust, "CODE000001", date.plusDays(1), "CONFIRMED"),
				"UNIQUE(code) must reject a reused booking code (invariant #7).");
	}

	@Test
	void everyEnumStatusAccepted() {
		// #98 (V19): the enum and the CHECK stay in lockstep — every BookingStatus value must be a
		// valid status token, incl. the Request-to-Book states PENDING_REQUEST/DECLINED/EXPIRED/WITHDRAWN.
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("lockstep@example.com");
		LocalDate date = LocalDate.of(2026, 9, 20);

		int i = 0;
		for (ai.riviera.platform.booking.domain.BookingStatus status
				: ai.riviera.platform.booking.domain.BookingStatus.values()) {
			String code = "LOCKSTEP0%02d".formatted(i++);
			assertDoesNotThrow(() -> insertBooking(venue, set, cust, code, date, status.name()),
					"CHECK must accept enum value " + status + " (enum/schema lockstep, invariant #12).");
		}
	}

	@Test
	void unknownStatusRejected() {
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("bad-status@example.com");

		assertThrows(DataIntegrityViolationException.class,
				() -> insertBooking(venue, set, cust, "CODE000002", LocalDate.of(2026, 9, 11), "PENDING"),
				"status CHECK must reject an unknown lifecycle value.");
	}

	@Test
	void duplicateEmailRejected() {
		insertCustomer("returning@example.com");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertCustomer("returning@example.com"),
				"UNIQUE(customer.email) is the guest find-or-create key.");
	}

	@Test
	void sameSetAndDateAllowedAcrossBookings() {
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("history@example.com");
		LocalDate date = LocalDate.of(2026, 9, 12);
		insertBooking(venue, set, cust, "CODE000003", date, "CANCELLED");

		assertDoesNotThrow(
				() -> insertBooking(venue, set, cust, "CODE000004", date, "CONFIRMED"),
				"booking must NOT enforce (set_id, booking_date) uniqueness — that is the "
						+ "availability table's guard (invariant #2); historical rows are expected.");
	}

	@Test
	void cancellationColumnsAcceptAValidRefund() {
		// U6 (V10): cancelled_at + refund_minor record the cancellation audit (invariants #5/#6/#10).
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("cancel-ok@example.com");
		insertBooking(venue, set, cust, "CODE000010", LocalDate.of(2026, 9, 13), "CONFIRMED");

		assertDoesNotThrow(() -> jdbc.sql("""
				UPDATE booking SET status = 'CANCELLED', cancelled_at = NOW(), refund_minor = 4500
				WHERE code = 'CODE000010'
				""").update(), "a refund within the gross amount must be accepted (V10).");
	}

	@Test
	void refundExceedingAmountRejected() {
		// refund_minor <= amount_minor (no over-refund); amount is 4500 from insertBooking.
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("over-refund@example.com");
		insertBooking(venue, set, cust, "CODE000011", LocalDate.of(2026, 9, 14), "CONFIRMED");

		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.sql("UPDATE booking SET refund_minor = 9999 WHERE code = 'CODE000011'").update(),
				"booking_refund_check must reject a refund greater than the gross amount (V10).");
	}

	private List<LocalDate> serviceDaysOf(String code) {
		return jdbc.sql("""
				SELECT service_date FROM booking_day
				WHERE booking_id = (SELECT id FROM booking WHERE code = :code)
				ORDER BY service_date
				""").param("code", code).query(LocalDate.class).list();
	}

	@Test
	void confirmedBookingCarriesOneServiceDayRow() {
		// V60: the service day is written when a row becomes CONFIRMED, by insert or by a later transition.
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("service day-row@example.com");
		LocalDate date = LocalDate.of(2026, 9, 21);
		insertBooking(venue, set, cust, "SDAY000001", date, "CONFIRMED");
		insertBooking(venue, set, cust, "SDAY000002", date, "AWAITING_PAYMENT");

		assertEquals(List.of(date), serviceDaysOf("SDAY000001"));
		assertEquals(1L, jdbc.sql("""
				SELECT COUNT(*) FROM booking_day
				WHERE booking_id = (SELECT id FROM booking WHERE code = 'SDAY000001')
				  AND attended_at IS NULL AND missed_at IS NULL
				""").query(Long.class).single(), "a fresh service day is unresolved");
		assertEquals(List.of(), serviceDaysOf("SDAY000002"), "no service day before the booking confirms");

		jdbc.sql("UPDATE booking SET status = 'CONFIRMED', confirmed_at = NOW() WHERE code = 'SDAY000002'")
				.update();
		assertEquals(List.of(date), serviceDaysOf("SDAY000002"));
	}

	@Test
	void serviceDayIsUniquePerBooking() {
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("service day-unique@example.com");
		LocalDate date = LocalDate.of(2026, 9, 22);
		insertBooking(venue, set, cust, "SDAY000003", date, "CONFIRMED");

		assertThrows(DataIntegrityViolationException.class, () -> insertServiceDay("SDAY000003", date),
				"UNIQUE (booking_id, service_date): one attendance fact per service day");
		assertDoesNotThrow(() -> insertServiceDay("SDAY000003", date.plusDays(1)),
				"a further service day of the same booking is the multi-day shape");
		assertEquals(List.of(date, date.plusDays(1)), serviceDaysOf("SDAY000003"));
	}

	@Test
	void serviceDayIsNeverBothAttendedAndMissed() {
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("service day-outcome@example.com");
		insertBooking(venue, set, cust, "SDAY000004", LocalDate.of(2026, 9, 23), "CONFIRMED");

		assertThrows(DataIntegrityViolationException.class, () -> stampServiceDay("SDAY000004", "NOW()", "NOW()"),
				"a service day is attended or missed, never both");
		assertDoesNotThrow(() -> stampServiceDay("SDAY000004", "NOW()", "NULL"));
	}

	@Test
	void deletingABookingTakesItsServiceDays() {
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("service day-cascade@example.com");
		insertBooking(venue, set, cust, "SDAY000005", LocalDate.of(2026, 9, 24), "CONFIRMED");
		assertEquals(1, serviceDaysOf("SDAY000005").size());

		jdbc.sql("DELETE FROM booking WHERE code = 'SDAY000005'").update();

		assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM booking_day WHERE booking_id NOT IN (SELECT id FROM booking)")
				.query(Long.class).single(), "a service day never outlives its booking");
	}

	@Test
	void lastDateDefaultsToTheFirstDay() {
		// V61: a legacy-shaped insert (no last_date) is a one-day booking, the backfill's own rule.
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("last-date-default@example.com");
		LocalDate date = LocalDate.of(2026, 9, 25);
		insertBooking(venue, set, cust, "SPAN000001", date, "AWAITING_PAYMENT");

		assertEquals(date, lastDateOf("SPAN000001"), "last_date defaults to booking_date");
	}

	@Test
	void lastDateBeforeTheFirstDayIsRefused() {
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("last-date-order@example.com");
		LocalDate date = LocalDate.of(2026, 9, 26);
		insertBooking(venue, set, cust, "SPAN000002", date, "AWAITING_PAYMENT");

		assertThrows(DataIntegrityViolationException.class,
				() -> setLastDate("SPAN000002", date.minusDays(1)),
				"booking_span_check: the last day is never before the first");
		assertDoesNotThrow(() -> setLastDate("SPAN000002", date.plusDays(2)));
	}

	@Test
	void aConfirmedStayCarriesOneServiceDayPerDay() {
		// V61 widens V60's confirm trigger to the span: three days, three service days, all unresolved.
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("stay-service-days@example.com");
		LocalDate first = LocalDate.of(2026, 9, 27);
		insertBooking(venue, set, cust, "SPAN000003", first, "AWAITING_PAYMENT");
		setLastDate("SPAN000003", first.plusDays(2));

		jdbc.sql("UPDATE booking SET status = 'CONFIRMED', confirmed_at = NOW() WHERE code = 'SPAN000003'")
				.update();

		assertEquals(List.of(first, first.plusDays(1), first.plusDays(2)), serviceDaysOf("SPAN000003"));
		assertEquals(3L, jdbc.sql("""
				SELECT COUNT(*) FROM booking_day
				WHERE booking_id = (SELECT id FROM booking WHERE code = 'SPAN000003')
				  AND attended_at IS NULL AND missed_at IS NULL
				""").query(Long.class).single(), "every service day of a fresh stay is unresolved");
	}

	private LocalDate lastDateOf(String code) {
		return jdbc.sql("SELECT last_date FROM booking WHERE code = :code").param("code", code)
				.query(LocalDate.class).single();
	}

	private void setLastDate(String code, LocalDate lastDate) {
		jdbc.sql("UPDATE booking SET last_date = :last WHERE code = :code")
				.param("last", lastDate).param("code", code).update();
	}

	private void insertServiceDay(String code, LocalDate serviceDate) {
		jdbc.sql("""
				INSERT INTO booking_day (booking_id, service_date)
				SELECT id, :serviceDate FROM booking WHERE code = :code
				""").param("code", code).param("serviceDate", serviceDate).update();
	}

	/** Column values are SQL literals from this file, never caller input. */
	private void stampServiceDay(String code, String attendedAt, String missedAt) {
		jdbc.sql("UPDATE booking_day SET attended_at = " + attendedAt + ", missed_at = " + missedAt
				+ " WHERE booking_id = (SELECT id FROM booking WHERE code = :code)")
				.param("code", code).update();
	}
}
