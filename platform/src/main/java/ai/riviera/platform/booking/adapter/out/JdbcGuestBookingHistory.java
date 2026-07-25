package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.spi.GuestBookingHistory;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * JDBC adapter answering {@link GuestBookingHistory} from the {@code booking} table — the {@code booking}
 * module owns that table, so the "does this guest still have a recent booking?" probe lives here while the
 * retention window and the scrub it authorizes stay in {@code customer} (#101 Slice 2). Invariant #1:
 * explicit SQL via {@link JdbcClient}, no JPA.
 *
 * <p>This is the implementing side of a dependency-inverted <strong>driven (SPI) port</strong> (declared in
 * {@code customer.spi}). The legal {@code booking → customer} edge (granted as {@code customer::vocabulary}
 * for {@link CustomerId} and {@code customer::spi} for {@link GuestBookingHistory}) lets us reference these
 * here; {@code customer} never imports {@code booking}, so {@code ModularityTests} stays cycle-free. The
 * adapter depends only on {@link JdbcClient}, so the Spring bean graph is acyclic too.
 *
 * <p>Any booking row — any status, incl. terminal — counts as a retention basis, so the query filters on
 * {@code customer_id} and {@code booking_date} only. The predicate is served by the existing
 * {@code booking_customer_id_idx} (V5); no new index and no migration are needed.
 */
@Repository
class JdbcGuestBookingHistory implements GuestBookingHistory {

	private static final String GUESTS = "guests";
	private static final String CUTOFF = "cutoff";

	private final JdbcClient jdbc;

	JdbcGuestBookingHistory(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Set<CustomerId> withBookingOnOrAfter(Collection<CustomerId> guests, LocalDate cutoff) {
		if (guests.isEmpty()) {
			return Set.of(); // an empty IN (...) list is invalid SQL
		}
		return Set.copyOf(jdbc.sql("""
				SELECT DISTINCT customer_id FROM booking
				WHERE customer_id IN (:guests) AND booking_date >= :cutoff
				""")
				.param(GUESTS, guests.stream().map(CustomerId::value).toList())
				.param(CUTOFF, cutoff)
				.query((rs, rowNum) -> new CustomerId(rs.getLong("customer_id")))
				.list());
	}
}
