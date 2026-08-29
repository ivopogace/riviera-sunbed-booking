package ai.riviera.platform.review.adapter.out;

import java.sql.Timestamp;
import java.time.Instant;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.review.application.ReviewTotals;
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
 *
 * <p>The aggregate read is the counterpart: one grouped scan of a venue's rows, served by
 * {@code review_venue_id_idx}. It returns raw totals — the mean and its rounding stay in the domain.
 */
@Repository
class JdbcReviews implements Reviews {

	private final JdbcClient jdbc;

	JdbcReviews(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean claim(BookingRef booking, VenueRef venue, int stars, Instant at) {
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

	@Override
	public ReviewTotals totalsFor(VenueRef venue) {
		return jdbc.sql("""
				SELECT count(*) AS review_count, COALESCE(sum(stars), 0) AS star_total
				FROM review WHERE venue_id = :venue
				""")
				.param("venue", venue.value())
				.query((rs, rowNum) -> new ReviewTotals(rs.getInt("review_count"),
						rs.getLong("star_total")))
				.single();
	}

	@Override
	public boolean existsFor(BookingRef booking) {
		return Boolean.TRUE.equals(jdbc.sql(
				"SELECT EXISTS (SELECT 1 FROM review WHERE booking_id = :booking)")
				.param("booking", booking.value())
				.query(Boolean.class)
				.single());
	}
}
