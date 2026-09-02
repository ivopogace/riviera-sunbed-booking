package ai.riviera.platform.review.adapter.out;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.review.application.ReviewSubmission;
import ai.riviera.platform.review.application.ReviewTotals;
import ai.riviera.platform.review.application.Reviews;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.ReviewRef;
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
 * <p>The aggregate read is the counterpart: one grouped scan of a venue's rows, served by the
 * prefix of {@code review_venue_listing_idx}. It returns raw totals — the mean and its rounding stay
 * in the domain. The listing read seeks the same index newest-first and keeps a row only when it
 * carries a comment. Both are public reads, and both — and only they — carry the visibility
 * predicate {@code hidden_at IS NULL}: a hidden review counts for nothing on the venue page, while
 * its author's own read-back and the admin's moderation list still see it.
 *
 * <p>Edit and delete address the row by {@code booking_id} and answer with their rows-affected count
 * for the same reason: two amends racing each other resolve in the database, and the loser reads as
 * "no such review" rather than throwing.
 */
@Repository
class JdbcReviews implements Reviews {

	/** Named once, per the {@code JdbcBookings} bind-parameter convention — five call sites bind it. */
	private static final String PARAM_BOOKING = "booking";
	private static final String PARAM_VENUE = "venue";
	private static final String PARAM_STARS = "stars";
	private static final String PARAM_COMMENT = "comment";

	/** The columns, kept apart from the bind parameters above: the two coincide by name, not by rule. */
	private static final String COL_STARS = "stars";
	private static final String COL_COMMENT = "comment";
	private static final String COL_DISPLAY_NAME = "display_name";

	private final JdbcClient jdbc;

	JdbcReviews(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean claim(CompletedStay stay, ReviewSubmission submission, Instant at) {
		int inserted = jdbc.sql("""
				INSERT INTO review (booking_id, venue_id, stay_date, stars, comment, display_name,
				                    created_at)
				VALUES (:booking, :venue, :stayDate, :stars, :comment, :displayName, :createdAt)
				ON CONFLICT (booking_id) DO NOTHING
				""")
				.param(PARAM_BOOKING, stay.booking().value())
				.param(PARAM_VENUE, stay.venue().value())
				.param("stayDate", stay.stayedOn())
				.param(PARAM_STARS, submission.stars())
				.param(PARAM_COMMENT, submission.comment())
				.param("displayName", submission.displayName())
				.param("createdAt", Timestamp.from(at))
				.update();
		return inserted == 1;
	}

	@Override
	public boolean update(BookingRef booking, ReviewSubmission submission, Instant at) {
		int updated = jdbc.sql("""
				UPDATE review
				SET stars = :stars, comment = :comment, display_name = :displayName,
				    updated_at = :updatedAt
				WHERE booking_id = :booking
				""")
				.param(PARAM_BOOKING, booking.value())
				.param(PARAM_STARS, submission.stars())
				.param(PARAM_COMMENT, submission.comment())
				.param("displayName", submission.displayName())
				.param("updatedAt", Timestamp.from(at))
				.update();
		return updated == 1;
	}

	@Override
	public boolean delete(BookingRef booking) {
		return jdbc.sql("DELETE FROM review WHERE booking_id = :booking")
				.param(PARAM_BOOKING, booking.value())
				.update() == 1;
	}

	@Override
	public Optional<OwnReview> findFor(BookingRef booking) {
		return jdbc.sql("""
				SELECT stars, comment, display_name FROM review WHERE booking_id = :booking
				""")
				.param(PARAM_BOOKING, booking.value())
				.query((rs, rowNum) -> new OwnReview(rs.getInt(COL_STARS), rs.getString(COL_COMMENT),
						rs.getString(COL_DISPLAY_NAME)))
				.optional();
	}

	@Override
	public ReviewTotals totalsFor(VenueRef venue) {
		return jdbc.sql("""
				SELECT count(*) AS review_count, COALESCE(sum(stars), 0) AS star_total
				FROM review WHERE venue_id = :venue AND hidden_at IS NULL
				""")
				.param(PARAM_VENUE, venue.value())
				.query((rs, rowNum) -> new ReviewTotals(rs.getInt("review_count"),
						rs.getLong("star_total")))
				.single();
	}

	@Override
	public boolean existsFor(BookingRef booking) {
		return Boolean.TRUE.equals(jdbc.sql(
				"SELECT EXISTS (SELECT 1 FROM review WHERE booking_id = :booking)")
				.param(PARAM_BOOKING, booking.value())
				.query(Boolean.class)
				.single());
	}

	@Override
	public List<ListedReview> newestListedBefore(VenueRef venue, long beforeId, int limit) {
		return jdbc.sql("""
				SELECT id, stars, display_name, stay_date, comment
				FROM review
				WHERE venue_id = :venue AND hidden_at IS NULL AND comment IS NOT NULL AND id < :before
				ORDER BY id DESC
				LIMIT :limit
				""")
				.param(PARAM_VENUE, venue.value())
				.param("before", beforeId)
				.param("limit", limit)
				.query((rs, rowNum) -> new ListedReview(new ReviewRef(rs.getLong("id")),
						rs.getInt(COL_STARS), rs.getString(COL_DISPLAY_NAME),
						YearMonth.from(rs.getObject("stay_date", LocalDate.class)),
						rs.getString(COL_COMMENT)))
				.list();
	}
}
