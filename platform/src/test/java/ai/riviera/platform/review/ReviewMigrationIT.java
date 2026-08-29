package ai.riviera.platform.review;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies Flyway V45: the {@code review} table's two invariants — one review per booking, ever
 * (the DB half of AC-2) and stars bounded 1..5 — plus the demo-seed supersede (AC-7), which resets
 * every venue's rating columns so no fabricated value is ever served again. Runs only when Docker
 * is available (Testcontainers Postgres), against the full Flyway chain incl. the seed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ReviewMigrationIT {

	/** Keeps each fixture's set position, guest email and booking code distinct across the class. */
	private static final AtomicLong FIXTURE_SEQ = new AtomicLong();

	@Autowired
	JdbcClient jdbc;

	@Test
	void allowsOnlyOneReviewPerBooking() {
		long venueId = seedVenue("Review Migration One-Per-Booking");
		long bookingId = seedCompletedBooking(venueId);
		insertReview(bookingId, venueId, 4);

		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> insertReview(bookingId, venueId, 5));
		assertThat(rejected.getMessage()).contains("review_once_per_booking");
	}

	@Test
	void rejectsStarsOutsideOneToFive() {
		long venueId = seedVenue("Review Migration Star Range");

		assertThat(assertThrows(DataIntegrityViolationException.class,
				() -> insertReview(seedCompletedBooking(venueId), venueId, 0)).getMessage())
				.contains("review_stars_check");
		assertThat(assertThrows(DataIntegrityViolationException.class,
				() -> insertReview(seedCompletedBooking(venueId), venueId, 6)).getMessage())
				.contains("review_stars_check");
	}

	@Test
	void resetsEverySeededRatingToZero() {
		Integer fabricated = jdbc.sql(
				"SELECT count(*) FROM venue WHERE rating_tenths <> 0 OR reviews_count <> 0")
				.query(Integer.class).single();
		assertThat(fabricated).isZero();
	}

	private long seedVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Ksamil', 'Review Migration IT', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""")
				.param("name", name).query(Long.class).single();
	}

	private long seedCompletedBooking(long venueId) {
		long seq = FIXTURE_SEQ.incrementAndGet();
		long setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :seq, 'STANDARD', 'ONLINE', 2500, 'EUR', :seq, 1)
				RETURNING id
				""")
				.param("v", venueId).param("seq", seq).query(Long.class).single();
		long customerId = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:email, 'Review Migration', '+355690000000')
				RETURNING id
				""")
				.param("email", "review-migration-" + seq + "@example.test")
				.query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor,
				                     amount_currency, status, completed_at)
				VALUES (:code, :v, :s, :c, :date, 2500, 'EUR', 'COMPLETED', :completedAt)
				RETURNING id
				""")
				.param("code", "RVMIG" + seq)
				.param("v", venueId).param("s", setId).param("c", customerId)
				.param("date", LocalDate.of(2026, 7, 1))
				.param("completedAt", Timestamp.from(Instant.parse("2026-07-01T16:00:00Z")))
				.query(Long.class).single();
	}

	private void insertReview(long bookingId, long venueId, int stars) {
		jdbc.sql("""
				INSERT INTO review (booking_id, venue_id, stars, created_at)
				VALUES (:booking, :venue, :stars, :createdAt)
				""")
				.param("booking", bookingId).param("venue", venueId).param("stars", stars)
				.param("createdAt", Timestamp.from(Instant.parse("2026-07-02T08:00:00Z")))
				.update();
	}
}
