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

	JdbcGuestBookingHistory(DataSource dataSource,
			@Value("${riviera.scheduled.query-timeout-seconds}") int scheduledQueryTimeoutSeconds) {
		this.jdbc = boundedClient(dataSource, scheduledQueryTimeoutSeconds);
	}

	/**
	 * This adapter's <em>only</em> client, bounded outright (#395) — unlike its sibling bounded
	 * clients, which sit beside an unbounded one, because every call that reaches this port is
	 * scheduled work: {@code ExpireGuestContactsService.sweep()} is {@code GuestBookingHistory}'s
	 * sole consumer, and it is driven by {@code GuestContactRetentionScheduler}. There is no request
	 * path here to leave unbounded.
	 *
	 * <p>It is the retention sweep's <strong>second</strong> entry read, and the one that is easy to
	 * miss: the sweep asks {@code customer} for candidates and then asks {@code booking} whether each
	 * still has a retention basis, both before it writes anything. Bounding only the first would have
	 * left the sweep able to wedge on the second — and this one reads {@code booking}, the table the
	 * other two sweeps also read, so a lock that stalls them stalls this too. Found by #395's
	 * phase-1 generalization audit rather than by the issue, which named four jobs and four queries.
	 *
	 * <p>Scoped, never {@code spring.jdbc.template.query-timeout}: that global would also bound
	 * {@code availability}'s claim (invariant #2), which {@code ScheduledWorkArchitectureTest} now
	 * fails the build over.
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
				WHERE customer_id IN (:guests) AND booking_date >= :cutoff
				""")
				.param(GUESTS, guests.stream().map(CustomerId::value).toList())
				.param(CUTOFF, cutoff)
				.query((rs, rowNum) -> new CustomerId(rs.getLong("customer_id")))
				.list());
	}
}
