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
import static org.junit.jupiter.api.Assertions.assertNull;
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

	private List<LocalDate> nightsOf(String code) {
		return jdbc.sql("""
				SELECT night FROM booking_night
				WHERE booking_id = (SELECT id FROM booking WHERE code = :code)
				ORDER BY night
				""").param("code", code).query(LocalDate.class).list();
	}

	@Test
	void confirmedBookingCarriesOneNightRow() {
		// V60: the night is written when a row becomes CONFIRMED, by insert or by a later transition.
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("night-row@example.com");
		LocalDate date = LocalDate.of(2026, 9, 21);
		insertBooking(venue, set, cust, "NIGHT000001", date, "CONFIRMED");
		insertBooking(venue, set, cust, "NIGHT000002", date, "AWAITING_PAYMENT");

		assertEquals(List.of(date), nightsOf("NIGHT000001"));
		assertNull(jdbc.sql("""
				SELECT COALESCE(attended_at, missed_at) FROM booking_night
				WHERE booking_id = (SELECT id FROM booking WHERE code = 'NIGHT000001')
				""").query(java.time.Instant.class).single(), "a fresh night is unresolved");
		assertEquals(List.of(), nightsOf("NIGHT000002"), "no night before the booking confirms");

		jdbc.sql("UPDATE booking SET status = 'CONFIRMED', confirmed_at = NOW() WHERE code = 'NIGHT000002'")
				.update();
		assertEquals(List.of(date), nightsOf("NIGHT000002"));
	}

	@Test
	void nightIsUniquePerBooking() {
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("night-unique@example.com");
		LocalDate date = LocalDate.of(2026, 9, 22);
		insertBooking(venue, set, cust, "NIGHT000003", date, "CONFIRMED");

		assertThrows(DataIntegrityViolationException.class, () -> insertNight("NIGHT000003", date),
				"UNIQUE (booking_id, night): one attendance fact per night");
		assertDoesNotThrow(() -> insertNight("NIGHT000003", date.plusDays(1)),
				"a further night of the same booking is the multi-night shape");
		assertEquals(List.of(date, date.plusDays(1)), nightsOf("NIGHT000003"));
	}

	@Test
	void nightIsNeverBothAttendedAndMissed() {
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("night-outcome@example.com");
		insertBooking(venue, set, cust, "NIGHT000004", LocalDate.of(2026, 9, 23), "CONFIRMED");

		assertThrows(DataIntegrityViolationException.class, () -> stampNight("NIGHT000004", "NOW()", "NOW()"),
				"a night is attended or missed, never both");
		assertDoesNotThrow(() -> stampNight("NIGHT000004", "NOW()", "NULL"));
	}

	@Test
	void deletingABookingTakesItsNights() {
		long venue = anyVenueId();
		long set = anyOnlineSetId();
		long cust = insertCustomer("night-cascade@example.com");
		insertBooking(venue, set, cust, "NIGHT000005", LocalDate.of(2026, 9, 24), "CONFIRMED");
		assertEquals(1, nightsOf("NIGHT000005").size());

		jdbc.sql("DELETE FROM booking WHERE code = 'NIGHT000005'").update();

		assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM booking_night WHERE booking_id NOT IN (SELECT id FROM booking)")
				.query(Long.class).single(), "a night never outlives its booking");
	}

	private void insertNight(String code, LocalDate night) {
		jdbc.sql("""
				INSERT INTO booking_night (booking_id, night)
				SELECT id, :night FROM booking WHERE code = :code
				""").param("code", code).param("night", night).update();
	}

	/** Column values are SQL literals from this file, never caller input. */
	private void stampNight(String code, String attendedAt, String missedAt) {
		jdbc.sql("UPDATE booking_night SET attended_at = " + attendedAt + ", missed_at = " + missedAt
				+ " WHERE booking_id = (SELECT id FROM booking WHERE code = :code)")
				.param("code", code).update();
	}
}
