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

	/** Below 1 the bound is not a bound; above the 5-minute sweep cadence it no longer bounds. */
	private static final int MIN_QUERY_TIMEOUT_SECONDS = 1;
	private static final int MAX_QUERY_TIMEOUT_SECONDS = 300;

	private static final String GUESTS = "guests";
	private static final String CUTOFF = "cutoff";

	private final JdbcClient jdbc;

	JdbcGuestBookingHistory(DataSource dataSource,
			@Value("${riviera.scheduled.query-timeout-seconds}") int scheduledQueryTimeoutSeconds) {
		this.jdbc = boundedClient(dataSource, scheduledQueryTimeoutSeconds);
	}

	/**
	 * The floor is 1, not 0: {@code setQueryTimeout(0)} means <strong>no limit</strong> to JDBC, and
	 * {@code JdbcTemplate} reads a negative as "use the driver default" — both silently restore the
	 * unbounded behaviour #395 removed, on a clean boot. The ceiling is the sweep cadence: a bound
	 * longer than the interval between runs is still holding when the next run is due, so it no longer
	 * bounds anything operationally. Guarded here because there is no JSR-303 validator on the
	 * classpath, so {@code @Min} would validate nothing (the #414/#426 house pattern).
	 */
	private static int validated(int queryTimeoutSeconds) {
		if (queryTimeoutSeconds < MIN_QUERY_TIMEOUT_SECONDS || queryTimeoutSeconds > MAX_QUERY_TIMEOUT_SECONDS) {
			throw new IllegalArgumentException("riviera.scheduled.query-timeout-seconds must be between "
					+ MIN_QUERY_TIMEOUT_SECONDS + " and " + MAX_QUERY_TIMEOUT_SECONDS + " seconds, but was "
					+ queryTimeoutSeconds + " — 0 and negatives mean NO limit, which is the unbounded"
					+ " scheduled query #395 exists to prevent");
		}
		return queryTimeoutSeconds;
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
		bounded.setQueryTimeout(validated(queryTimeoutSeconds));
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
