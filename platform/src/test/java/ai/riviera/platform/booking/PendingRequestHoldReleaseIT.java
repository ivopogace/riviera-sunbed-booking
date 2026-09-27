package ai.riviera.platform.booking;

import java.time.LocalDate;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * V67 against a database that stopped at V66: the rows a pending request held under the old model
 * are gone once V67 runs, while a confirmed booking's row on another day and a staff mark on the same
 * set survive, and every pre-existing DECLINED row reads {@code VENUE} (ADR-0025).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "spring.flyway.target=66")
class PendingRequestHoldReleaseIT {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Flyway flyway;

	@Test
	void pendingRequestsLoseTheirRowsAndNobodyElseDoes() {
		long venue = jdbc.sql("SELECT id FROM venue ORDER BY id LIMIT 1").query(Long.class).single();
		long set = jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES ('nohold@example.com', 'Guest', '+355600000') RETURNING id")
				.query(Long.class).single();
		LocalDate pendingFirst = LocalDate.of(2026, 9, 1);
		LocalDate pendingLast = pendingFirst.plusDays(2);
		LocalDate confirmedDay = LocalDate.of(2026, 9, 5);
		LocalDate staffDay = LocalDate.of(2026, 9, 6);
		insertBooking(venue, set, customer, "NOHOLD0001", pendingFirst, pendingLast, "PENDING_REQUEST");
		insertBooking(venue, set, customer, "NOHOLD0002", confirmedDay, confirmedDay, "CONFIRMED");
		insertBooking(venue, set, customer, "NOHOLD0003", LocalDate.of(2026, 9, 7), LocalDate.of(2026, 9, 7),
				"DECLINED");
		for (LocalDate day = pendingFirst; !day.isAfter(pendingLast); day = day.plusDays(1)) {
			claim(set, day, "BOOKED_ONLINE");
		}
		claim(set, confirmedDay, "BOOKED_ONLINE");
		claim(set, staffDay, "STAFF_MARKED");

		Flyway.configure().configuration(flyway.getConfiguration()).target(MigrationVersion.LATEST)
				.load().migrate();

		assertEquals(0L, count("set_id = :set AND booking_date BETWEEN :from AND :to", set, pendingFirst, pendingLast),
				"the pending request's rows are released by the migration");
		assertEquals(1L, count("set_id = :set AND booking_date BETWEEN :from AND :to", set, confirmedDay, confirmedDay),
				"a confirmed booking's row survives");
		assertEquals(1L, count("set_id = :set AND booking_date BETWEEN :from AND :to", set, staffDay, staffDay),
				"a staff mark survives");
		assertEquals("VENUE", jdbc.sql("SELECT decline_reason FROM booking WHERE code = 'NOHOLD0003'")
				.query(String.class).single(), "a pre-V67 DECLINED row is the venue's own decline");
		assertEquals(0L, jdbc.sql("SELECT COUNT(*) FROM booking WHERE status <> 'DECLINED' AND decline_reason IS NOT NULL")
				.query(Long.class).single());
	}

	private void insertBooking(long venue, long set, long customer, String code, LocalDate first, LocalDate last,
			String status) {
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :first, :last, 4500, 'EUR', :status)
				""")
				.param("code", code).param("venue", venue).param("set", set).param("cust", customer)
				.param("first", first).param("last", last).param("status", status)
				.update();
	}

	private void claim(long set, LocalDate day, String state) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :day, :state)")
				.param("set", set).param("day", day).param("state", state).update();
	}

	private long count(String where, long set, LocalDate from, LocalDate to) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE " + where)
				.param("set", set).param("from", from).param("to", to).query(Long.class).single();
	}
}
