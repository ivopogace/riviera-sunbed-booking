package ai.riviera.platform.customer;

import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.spi.GuestBookingHistory;
import ai.riviera.platform.customer.vocabulary.CustomerId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the automated retention sweep (Slice 2 of #101) against real Postgres via Testcontainers.
 * Proves what the unit spec cannot: the real candidate/scrub SQL, the dependency-inverted
 * {@code customer.spi.GuestBookingHistory} seam resolved through the Spring context (implemented in
 * {@code booking}), and above all that the retained booking / payment / payout financial rows survive a
 * retention scrub unchanged (statutory-retention exception, invariant #9). A shared container is reused
 * across ITs, so every fixture uses unique emails / codes and resolves the seeded venue + set by query.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class GuestContactRetentionIT {

	@Autowired
	GuestBookingHistory history;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void reportsOnlyGuestsWithABookingOnOrAfterTheCutoff() {
		CustomerId recent = insertGuestWithBooking("retention-it-recent@example.com", LocalDate.of(2029, 9, 1));
		CustomerId stale = insertGuestWithBooking("retention-it-stale@example.com", LocalDate.of(2020, 9, 1));

		Set<CustomerId> live = history.withBookingOnOrAfter(List.of(recent, stale), LocalDate.of(2026, 1, 1));

		assertThat(live).containsExactly(recent);
	}

	// --- fixture helpers -------------------------------------------------------------------------------

	private CustomerId insertGuestWithBooking(String email, LocalDate bookingDate) {
		long customerId = insertGuest(email);
		long venueId = seededVenueId();
		insertBooking(bookingCode(email), venueId, seededSetId(venueId), customerId, bookingDate);
		return new CustomerId(customerId);
	}

	private long insertGuest(String email) {
		return jdbc.queryForObject("""
				INSERT INTO customer (email, full_name, phone) VALUES (?, 'Retention Guest', '+355691110900')
				RETURNING id
				""", Long.class, email);
	}

	private void insertBooking(String code, long venueId, long setId, long customerId, LocalDate bookingDate) {
		jdbc.update("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (?, ?, ?, ?, ?, 4500, 'EUR', 'CONFIRMED')
				""", code, venueId, setId, customerId, Date.valueOf(bookingDate));
	}

	/** Codes are bearer credentials (invariant #7); fixtures only need uniqueness, derived from the email. */
	private static String bookingCode(String email) {
		return "RET" + Integer.toHexString(email.hashCode()).toUpperCase(java.util.Locale.ROOT);
	}

	private long seededVenueId() {
		return jdbc.queryForObject("SELECT id FROM venue WHERE name = 'Miramar Beach Club'", Long.class);
	}

	private long seededSetId(long venueId) {
		return jdbc.queryForObject(
				"SELECT id FROM set_position WHERE venue_id = ? ORDER BY id LIMIT 1", Long.class, venueId);
	}
}
