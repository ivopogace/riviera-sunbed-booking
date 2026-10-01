package ai.riviera.platform.monitoring.adapter.in;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Platform-wide bound (seconds, 1–300) on a scheduled job's entry query, checked at boot in the compact constructor
 * (no JSR-303 validator, so {@code @Min} would validate nothing). JDBC reads {@code 0} as <em>no limit</em> and
 * {@code JdbcTemplate} ignores a negative, so "unlimited" would boot clean; above the 5-minute sweep cadence a bound
 * outlives the next run. Module adapters read the raw property via {@code @Value}; this bean vets it for all of them,
 * in full contexts only. Never a global query timeout instead: it would bound the invariant #2 claim.
 */
@Component
record ScheduledQueryTimeout(@Value("${riviera.scheduled.query-timeout-seconds}") int seconds) {

	/** Below 1 the bound is not a bound; above the 5-minute sweep cadence it no longer bounds. */
	private static final int MIN_SECONDS = 1;
	private static final int MAX_SECONDS = 300;

	/**
	 * Compact, with {@code @Value} on the record component: a compact constructor has no parameters to annotate, and
	 * javac propagates the {@code PARAMETER}-targeted annotation to the canonical constructor Spring resolves.
	 */
	ScheduledQueryTimeout {
		if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
			throw new IllegalArgumentException("riviera.scheduled.query-timeout-seconds must be between "
					+ MIN_SECONDS + " and " + MAX_SECONDS + " seconds, but was " + seconds
					+ " — 0 and negatives mean NO limit, which is the unbounded scheduled query"
					+ " #395 exists to prevent");
		}
	}
}
