package ai.riviera.platform;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The platform-wide bound on a scheduled job's entry query (#395), validated once at boot — the
 * #414/#426 house pattern (a compact canonical constructor that throws), because there is no JSR-303
 * validator on this classpath and {@code @Min} would therefore validate nothing at all.
 *
 * <p><strong>The value it guards against looks harmless.</strong> {@code Statement#setQueryTimeout(0)}
 * means <em>no limit</em> to JDBC, and {@code JdbcTemplate} reads a negative as "leave the driver's
 * default alone" — so {@code riviera.scheduled.query-timeout-seconds=0}, which is what an operator
 * reaching for "unlimited" would write, would boot clean, log nothing, and restore in every adapter at
 * once the unbounded scheduled query this slice exists to remove. The ceiling is the sweep cadence
 * rather than an arbitrary large number: a bound longer than the interval between runs is still
 * holding when the next run is due, so past that it no longer bounds anything operationally.
 *
 * <p><strong>Why one guard and not one per adapter.</strong> The four bounded clients each carried an
 * identical copy of this check for one commit, and Sonar's duplication gate failed the PR at 36.1% on
 * new code — the four copies of the constants plus the check were a large enough block to clone-match,
 * where the bare three-line {@code boundedClient} helpers had not been. De-duplicating by extracting a
 * shared helper was not available: the four consumers span the composition root, {@code booking} and
 * {@code customer}, so their only common home is the {@code shared} kernel, whose admission rule
 * (CLAUDE.md) explicitly excludes "code used in more than one place". Validating a single
 * platform-wide knob at the platform edge is the honest reading anyway — it is one number owned by
 * {@code application.properties}, not four module-local settings — and it loses nothing, because a
 * throw here fails the boot for every consumer of that number regardless of which bean was built first.
 *
 * <p>Consequence worth knowing: the three module adapters still read the raw property via
 * {@code @Value} (they cannot depend on the root — nothing may). They receive a value this bean has
 * vetted, and a context that somehow excluded this bean would fall back to the committed default
 * rather than an operator's typo.
 */
@Component
record ScheduledQueryTimeout(int seconds) {

	/** Below 1 the bound is not a bound; above the 5-minute sweep cadence it no longer bounds. */
	private static final int MIN_SECONDS = 1;
	private static final int MAX_SECONDS = 300;

	ScheduledQueryTimeout(@Value("${riviera.scheduled.query-timeout-seconds}") int seconds) {
		if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
			throw new IllegalArgumentException("riviera.scheduled.query-timeout-seconds must be between "
					+ MIN_SECONDS + " and " + MAX_SECONDS + " seconds, but was " + seconds
					+ " — 0 and negatives mean NO limit, which is the unbounded scheduled query"
					+ " #395 exists to prevent");
		}
		this.seconds = seconds;
	}
}
