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
 * Adapter answering {@link ReviewErasure} from the {@code booking} table — the {@code booking} module
 * owns that table, so "which bookings are this subject's?" is its fact — and handing the ids on to
 * {@code review}'s {@link ReviewTombstones}, which strips the texts from its own rows. Invariant #1:
 * explicit SQL via {@link JdbcClient}, no JPA.
 *
 * <p>The implementing side of a dependency-inverted <strong>driven (SPI) port</strong> declared in
 * {@code customer.spi}: the legal {@code booking → customer} and {@code booking → review} edges are
 * what let one adapter bridge the two leaves without either importing the other ({@code ModularityTests}).
 * The same shape as {@code JdbcGuestBookingHistory}, one call deeper.
 *
 * <p>Both reads sit on existing indexes ({@code booking_customer_id_idx}, the partial
 * {@code booking_account_id_idx}) and run on the shared, unbounded client: they are scrub steps
 * inside the erasure's own transaction, on the request path as well as the sweep's, so the
 * {@code JdbcAccountErasure} rule applies — a half-applied erasure is worth less than a slow one.
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
