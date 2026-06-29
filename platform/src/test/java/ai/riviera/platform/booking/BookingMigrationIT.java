package ai.riviera.platform.booking;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
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
}
