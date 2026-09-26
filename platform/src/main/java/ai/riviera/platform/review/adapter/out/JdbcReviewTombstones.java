package ai.riviera.platform.review.adapter.out;

import java.util.Collection;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.review.api.ReviewTombstones;
import ai.riviera.platform.review.vocabulary.BookingRef;

/**
 * JDBC adapter behind {@link ReviewTombstones} (invariant #1, {@link JdbcClient}); it implements
 * the published port directly, as the tombstone is one policy-free statement.
 *
 * <p>One conditional {@code UPDATE} by {@code booking_id}: only a row still carrying a name or a
 * comment matches, so rows-affected counts real changes and a repeat is {@code 0}. No visibility
 * predicate — erasure must reach a hidden review too. {@code updated_at} stays: it is author edits.
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
