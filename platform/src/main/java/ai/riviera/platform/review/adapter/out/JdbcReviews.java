package ai.riviera.platform.review.adapter.out;

import java.sql.Timestamp;
import java.time.Instant;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.review.application.Reviews;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * JDBC adapter over the {@code review} table (invariant #1: explicit SQL via {@link JdbcClient}, no
 * JPA). Package-private — only the {@link Reviews} port is visible outside this package.
 *
 * <p>The claim is a single atomic {@code INSERT ... ON CONFLICT (booking_id) DO NOTHING} against the
 * table's {@code review_once_per_booking} constraint, and the rows-affected count is the outcome:
 * {@code 1} recorded it, {@code 0} means another submit already holds this booking's slot. Because
 * the row's creation <em>is</em> the claim there is no read-then-write window between the two
 * (the {@code JdbcAvailabilityClaim} discipline).
 */
@Repository
class JdbcReviews implements Reviews {

	private final JdbcClient jdbc;

	JdbcReviews(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean record(BookingRef booking, VenueRef venue, int stars, Instant at) {
		int inserted = jdbc.sql("""
				INSERT INTO review (booking_id, venue_id, stars, created_at)
				VALUES (:booking, :venue, :stars, :createdAt)
				ON CONFLICT (booking_id) DO NOTHING
				""")
				.param("booking", booking.value())
				.param("venue", venue.value())
				.param("stars", stars)
				.param("createdAt", Timestamp.from(at))
				.update();
		return inserted == 1;
	}
}
