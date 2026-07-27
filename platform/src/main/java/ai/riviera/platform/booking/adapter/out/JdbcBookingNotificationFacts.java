package ai.riviera.platform.booking.adapter.out;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * JDBC adapter for {@link BookingNotificationFacts} — two columns by primary key via
 * {@link JdbcClient} (invariant #1, no JPA). Package-private; only the {@code api/} port is
 * referenced cross-module (invariant #11). Read-only.
 */
@Repository
class JdbcBookingNotificationFacts implements BookingNotificationFacts {

	private final JdbcClient jdbc;

	JdbcBookingNotificationFacts(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<BookingNotificationInfo> notificationInfo(BookingId bookingId) {
		// No status predicate on purpose — the caller reacts to a published confirmation fact, and a
		// booking cancelled in the interim must still resolve (the port's contract).
		return jdbc.sql("SELECT code, customer_id FROM booking WHERE id = :id")
				.param("id", bookingId.value())
				.query((rs, rowNum) -> new BookingNotificationInfo(
						rs.getString("code"), new CustomerId(rs.getLong("customer_id"))))
				.optional();
	}
}
