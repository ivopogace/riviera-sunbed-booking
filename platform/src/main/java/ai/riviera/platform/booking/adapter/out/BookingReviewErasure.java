package ai.riviera.platform.booking.adapter.out;

import java.util.Collection;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.spi.ReviewErasure;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.review.api.ReviewTombstones;
import ai.riviera.platform.review.vocabulary.BookingRef;

/**
 * Answers {@link ReviewErasure} from the {@code booking} table in explicit SQL (invariant #1) and
 * hands the booking ids to {@code review}'s {@link ReviewTombstones}, which strips the texts: the
 * legal {@code booking → customer} and {@code booking → review} edges bridge the two leaves. Both
 * reads stay on the shared, unbounded client, like {@code JdbcAccountErasure}'s scrubs: they run
 * inside the erasure's transaction, and a slow erasure beats a failed one. Rationale:
 * RESPONSIBILITIES.md §booking, §customer.
 */
@Repository
class BookingReviewErasure implements ReviewErasure {

	private static final String GUESTS = "guests";
	private static final String ACCOUNT = "account";

	private final JdbcClient jdbc;
	private final ReviewTombstones tombstones;

	BookingReviewErasure(JdbcClient jdbc, ReviewTombstones tombstones) {
		this.jdbc = jdbc;
		this.tombstones = tombstones;
	}

	@Override
	public int eraseForGuests(Collection<CustomerId> guests) {
		if (guests.isEmpty()) {
			return 0; // an empty IN (...) list is invalid SQL
		}
		List<BookingRef> bookings = jdbc.sql("SELECT id FROM booking WHERE customer_id IN (:guests)")
				.param(GUESTS, guests.stream().map(CustomerId::value).toList())
				.query((rs, rowNum) -> new BookingRef(rs.getLong("id")))
				.list();
		return tombstones.tombstone(bookings);
	}

	@Override
	public int eraseForAccount(CustomerAccountId account) {
		List<BookingRef> bookings = jdbc.sql("SELECT id FROM booking WHERE account_id = :account")
				.param(ACCOUNT, account.value())
				.query((rs, rowNum) -> new BookingRef(rs.getLong("id")))
				.list();
		return tombstones.tombstone(bookings);
	}
}
