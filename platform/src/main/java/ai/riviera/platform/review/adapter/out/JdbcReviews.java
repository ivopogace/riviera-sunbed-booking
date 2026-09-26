package ai.riviera.platform.review.adapter.out;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.review.application.ModeratedReview;
import ai.riviera.platform.review.application.ReviewSubmission;
import ai.riviera.platform.review.application.StoredReview;
import ai.riviera.platform.review.application.ReviewTotals;
import ai.riviera.platform.review.application.Reviews;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * JDBC adapter over the {@code review} table (invariant #1). Races resolve in the database: the claim
 * is one atomic {@code INSERT ... ON CONFLICT (booking_id) DO NOTHING} whose row count is the outcome
 * (never read-then-write), edit and delete by {@code booking_id} lose a race as "no such review", and
 * hide/un-hide return the venue only when the row flipped. Only the aggregate and listing reads carry
 * {@code hidden_at IS NULL}; the mean and its rounding stay in the domain.
 * Rationale: {@code RESPONSIBILITIES.md} §{@code review}.
 */
@Repository
class JdbcReviews implements Reviews {

	/** Named once, per the {@code JdbcBookings} bind-parameter convention — four call sites bind it. */
	private static final String PARAM_BOOKING = "booking";
	private static final String PARAM_VENUE = "venue";
	private static final String PARAM_STARS = "stars";
	private static final String PARAM_COMMENT = "comment";
	private static final String PARAM_ID = "id";
	private static final String PARAM_BEFORE = "before";
	private static final String PARAM_LIMIT = "limit";

	/** The columns, kept apart from the bind parameters above: the two coincide by name, not by rule. */
	private static final String COL_STARS = "stars";
	private static final String COL_COMMENT = "comment";
	private static final String COL_DISPLAY_NAME = "display_name";
	private static final String COL_STAY_DATE = "stay_date";

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
	public Optional<StoredReview> findFor(BookingRef booking) {
		return jdbc.sql("""
				SELECT stars, comment, display_name, hidden_at FROM review WHERE booking_id = :booking
				""")
				.param(PARAM_BOOKING, booking.value())
				.query((rs, rowNum) -> new StoredReview(new OwnReview(rs.getInt(COL_STARS),
						rs.getString(COL_COMMENT), rs.getString(COL_DISPLAY_NAME)),
						rs.getTimestamp("hidden_at") != null))
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
	public Optional<VenueRef> hide(ReviewRef review, Instant at) {
		return jdbc.sql("""
				UPDATE review SET hidden_at = :hiddenAt
				WHERE id = :id AND hidden_at IS NULL
				RETURNING venue_id
				""")
				.param(PARAM_ID, review.value())
				.param("hiddenAt", Timestamp.from(at))
				.query(Long.class).optional().map(VenueRef::new);
	}

	@Override
	public Optional<VenueRef> unhide(ReviewRef review) {
		return jdbc.sql("""
				UPDATE review SET hidden_at = NULL
				WHERE id = :id AND hidden_at IS NOT NULL
				RETURNING venue_id
				""")
				.param(PARAM_ID, review.value())
				.query(Long.class).optional().map(VenueRef::new);
	}

	@Override
	public boolean existsById(ReviewRef review) {
		return Boolean.TRUE.equals(jdbc.sql("SELECT EXISTS (SELECT 1 FROM review WHERE id = :id)")
				.param(PARAM_ID, review.value())
				.query(Boolean.class)
				.single());
	}

	@Override
	public List<ModeratedReview> newestForModerationBefore(VenueRef venue, long beforeId, int limit) {
		return jdbc.sql("""
				SELECT id, stars, display_name, stay_date, comment, created_at, hidden_at
				FROM review
				WHERE venue_id = :venue AND id < :before
				ORDER BY id DESC
				LIMIT :limit
				""")
				.param(PARAM_VENUE, venue.value())
				.param(PARAM_BEFORE, beforeId)
				.param(PARAM_LIMIT, limit)
				.query((rs, rowNum) -> new ModeratedReview(new ReviewRef(rs.getLong("id")),
						rs.getInt(COL_STARS), rs.getString(COL_DISPLAY_NAME),
						YearMonth.from(rs.getObject(COL_STAY_DATE, LocalDate.class)),
						rs.getString(COL_COMMENT), rs.getTimestamp("created_at").toInstant(),
						instantOrNull(rs.getTimestamp("hidden_at"))))
				.list();
	}

	private static Instant instantOrNull(Timestamp timestamp) {
		return timestamp == null ? null : timestamp.toInstant();
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
				.param(PARAM_BEFORE, beforeId)
				.param(PARAM_LIMIT, limit)
				.query((rs, rowNum) -> new ListedReview(new ReviewRef(rs.getLong("id")),
						rs.getInt(COL_STARS), rs.getString(COL_DISPLAY_NAME),
						YearMonth.from(rs.getObject(COL_STAY_DATE, LocalDate.class)),
						rs.getString(COL_COMMENT)))
				.list();
	}
}
