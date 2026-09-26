package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Set;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.spi.GuestBookingHistory;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * Answers {@code customer}'s {@link GuestBookingHistory} probe from the {@code booking} table this
 * module owns; the retention window and the scrub stay in {@code customer}. Invariant #1: explicit
 * {@link JdbcClient} SQL. Any booking of any status is a retention basis, so the query filters only on
 * {@code customer_id} and the stay's last day: one ending on or after the cutoff keeps its guest.
 * Served by {@code booking_customer_id_idx} (V5); no new index.
 */
@Repository
class JdbcGuestBookingHistory implements GuestBookingHistory {

	private static final String GUESTS = "guests";
	private static final String CUTOFF = "cutoff";

	private final JdbcClient jdbc;

	JdbcGuestBookingHistory(DataSource dataSource,
			@Value("${riviera.scheduled.query-timeout-seconds}") int scheduledQueryTimeoutSeconds) {
		this.jdbc = boundedClient(dataSource, scheduledQueryTimeoutSeconds);
	}

	/**
	 * The adapter's only client, bounded outright: its sole caller is the retention sweep. Scoped here,
	 * never {@code spring.jdbc.template.query-timeout}: that global would also bound the
	 * {@code availability} claim (invariant #2), and {@code ScheduledWorkArchitectureTest} fails on it.
	 */
	private static JdbcClient boundedClient(DataSource dataSource, int queryTimeoutSeconds) {
		JdbcTemplate bounded = new JdbcTemplate(dataSource);
		bounded.setQueryTimeout(queryTimeoutSeconds);
		return JdbcClient.create(bounded);
	}

	@Override
	public Set<CustomerId> withBookingOnOrAfter(Collection<CustomerId> guests, LocalDate cutoff) {
		if (guests.isEmpty()) {
			return Set.of(); // an empty IN (...) list is invalid SQL
		}
		return Set.copyOf(jdbc.sql("""
				SELECT DISTINCT customer_id FROM booking
				WHERE customer_id IN (:guests) AND last_date >= :cutoff
				""")
				.param(GUESTS, guests.stream().map(CustomerId::value).toList())
				.param(CUTOFF, cutoff)
				.query((rs, rowNum) -> new CustomerId(rs.getLong("customer_id")))
				.list());
	}
}
