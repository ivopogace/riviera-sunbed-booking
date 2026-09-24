package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.List;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.domain.BookingStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * V61's backfill against a database that stopped at V60: a booking in every status, inserted
 * without a last day because the column does not exist yet, is a one-day booking once V61 runs —
 * {@code last_date = booking_date} on every row — and a stay confirmed after it carries a service
 * day per day. Its own Spring context (the Flyway target) gives it its own container, so the
 * pre-V61 shape is real rather than assumed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "spring.flyway.target=60")
class BookingLastDateBackfillIT {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Flyway flyway;

	@Test
	void everyExistingRowIsBackfilledToItsFirstDay() {
		long venue = jdbc.sql("SELECT id FROM venue ORDER BY id LIMIT 1").query(Long.class).single();
		long set = jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES ('backfill@example.com', 'Guest', '+355600000') RETURNING id")
				.query(Long.class).single();
		LocalDate first = LocalDate.of(2026, 9, 1);
		int i = 0;
		for (BookingStatus status : BookingStatus.values()) {
			jdbc.sql("""
					INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
					                     amount_minor, amount_currency, status)
					VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', :status)
					""")
					.param("code", "BACKFILL%02d".formatted(i)).param("venue", venue).param("set", set)
					.param("cust", customer).param("date", first.plusDays(i++)).param("status", status.name())
					.update();
		}

		Flyway.configure().configuration(flyway.getConfiguration()).target(MigrationVersion.LATEST)
				.load().migrate();

		assertEquals(0L, jdbc.sql("SELECT COUNT(*) FROM booking WHERE last_date <> booking_date")
				.query(Long.class).single(), "every pre-V61 row is a one-day booking");
		assertEquals((long) BookingStatus.values().length,
				jdbc.sql("SELECT COUNT(*) FROM booking WHERE code LIKE 'BACKFILL%' AND last_date = booking_date")
						.query(Long.class).single());
		int confirmed = BookingStatus.CONFIRMED.ordinal();
		assertEquals(List.of(first.plusDays(confirmed)), jdbc.sql("""
				SELECT service_date FROM booking_day
				WHERE booking_id = (SELECT id FROM booking WHERE code = :code)
				""").param("code", "BACKFILL%02d".formatted(confirmed)).query(LocalDate.class).list(),
				"the confirmed row keeps V60's one service day, now the whole of its one-day span");
	}
}
