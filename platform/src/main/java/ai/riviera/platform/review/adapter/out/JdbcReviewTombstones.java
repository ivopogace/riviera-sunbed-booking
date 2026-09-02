package ai.riviera.platform.review.adapter.out;

import java.util.Collection;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.review.api.ReviewTombstones;
import ai.riviera.platform.review.vocabulary.BookingRef;

/**
 * JDBC adapter behind {@link ReviewTombstones} (invariant #1: explicit SQL via {@link JdbcClient}, no
 * JPA). Package-private; it implements the published port directly because the tombstone is one
 * statement with no policy in front of it — the {@code JdbcCustomerDirectory} shape.
 *
 * <p>One conditional {@code UPDATE} by {@code booking_id} (served by the table's one-per-booking
 * unique index): only a row still carrying a name or a comment matches, so the rows-affected count
 * is the number of reviews that actually changed and a repeat is {@code 0}. No visibility predicate
 * — erasure must reach a hidden review too. {@code updated_at} is left alone: it records the
 * author's own edits, and this is not one.
 */
@Repository
class JdbcReviewTombstones implements ReviewTombstones {

	private static final String PARAM_BOOKINGS = "bookings";

	private final JdbcClient jdbc;

	JdbcReviewTombstones(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public int tombstone(Collection<BookingRef> bookings) {
		if (bookings.isEmpty()) {
			return 0; // an empty IN (...) list is invalid SQL
		}
		return jdbc.sql("""
				UPDATE review SET display_name = NULL, comment = NULL
				WHERE booking_id IN (:bookings)
				  AND (display_name IS NOT NULL OR comment IS NOT NULL)
				""")
				.param(PARAM_BOOKINGS, bookings.stream().map(BookingRef::value).toList())
				.update();
	}
}
