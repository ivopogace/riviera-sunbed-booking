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
 * Verifies the {@code review} table's constraints: V45's two invariants — at most one review
 * per booking (the DB half of AC-2) and stars bounded 1..5 — plus the demo-seed supersede (AC-7), and
 * V46's length bounds on the free-text comment and display name.
 *
 * <p>The supersede is checked on the <strong>seeded</strong> row, the only one that carried a
 * fabricated rating, rather than as a count over the whole table: sibling ITs share this container
 * and legitimately recompute their own venues to nonzero scores, so a table-wide assertion would
 * pass or fail on class ordering. Runs only when Docker is available (Testcontainers Postgres),
 * against the full Flyway chain incl. the seed.
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
	void commentAndDisplayNameCarryLengthChecks() {
		long venueId = seedVenue("Review Migration Text Bounds");

		assertThat(assertThrows(DataIntegrityViolationException.class,
				() -> insertReview(seedCompletedBooking(venueId), venueId, 4, "x".repeat(1001), "Ana"))
				.getMessage()).contains("review_comment_length_check");
		assertThat(assertThrows(DataIntegrityViolationException.class,
				() -> insertReview(seedCompletedBooking(venueId), venueId, 4, "Great sunbeds", "y".repeat(61)))
				.getMessage()).contains("review_display_name_length_check");
	}

	@Test
	void acceptsTheLongestAllowedCommentAndDisplayName() {
		long venueId = seedVenue("Review Migration Text At Bound");

		insertReview(seedCompletedBooking(venueId), venueId, 4, "x".repeat(1000), "y".repeat(60));

		assertThat(jdbc.sql("SELECT count(*) FROM review WHERE venue_id = :v")
				.param("v", venueId).query(Long.class).single()).isEqualTo(1L);
	}

	@Test
	void requiresAStayDate() {
		long venueId = seedVenue("Review Migration Stay Date");
		long bookingId = seedCompletedBooking(venueId);

		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.sql("""
						INSERT INTO review (booking_id, venue_id, stars, created_at)
						VALUES (:booking, :venue, 4, :createdAt)
						""")
						.param("booking", bookingId).param("venue", venueId)
						.param("createdAt", Timestamp.from(Instant.parse("2026-07-02T08:00:00Z")))
						.update());
		assertThat(rejected.getMessage()).contains("stay_date");
	}

	@Test
	void resetsTheSeededRatingToZero() {
		// Scoped to the seeded row, not the table: sibling ITs recompute venues in this container.
		int[] miramar = jdbc.sql(
				"SELECT rating_tenths, reviews_count FROM venue WHERE name = 'Miramar Beach Club'")
				.query((rs, n) -> new int[] {rs.getInt(1), rs.getInt(2)}).single();
		assertThat(miramar).containsExactly(0, 0);
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
		insertReview(bookingId, venueId, stars, null, null);
	}

	private void insertReview(long bookingId, long venueId, int stars, String comment,
			String displayName) {
		jdbc.sql("""
				INSERT INTO review (booking_id, venue_id, stay_date, stars, comment, display_name,
				                    created_at)
				VALUES (:booking, :venue, :stayDate, :stars, :comment, :displayName, :createdAt)
				""")
				.param("booking", bookingId).param("venue", venueId)
				.param("stayDate", LocalDate.of(2026, 7, 1)).param("stars", stars)
				.param("comment", comment).param("displayName", displayName)
				.param("createdAt", Timestamp.from(Instant.parse("2026-07-02T08:00:00Z")))
				.update();
	}
}
