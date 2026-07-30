package ai.riviera.platform;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * {@code riviera.scheduled.query-timeout-seconds} is <strong>range-checked at boot</strong>, because the
 * degenerate value does not look degenerate (#395, review gate).
 *
 * <p>The trap is a JDBC contract detail: {@code Statement#setQueryTimeout(0)} means <em>no limit</em>,
 * and {@code JdbcTemplate} treats a negative as "leave the driver's default alone" — so
 * {@code riviera.scheduled.query-timeout-seconds=0} would boot clean, log nothing, and silently restore
 * the exact unbounded scheduled query this slice exists to remove. A knob whose failure mode is "the
 * feature quietly turns itself off" is the #414/#426 house pattern's whole subject, and its answer is a
 * floor and a ceiling checked in a constructor — there is no JSR-303 validator on this classpath, so
 * {@code @Min}/{@code @Validated} would validate nothing at all.
 *
 * <p>The four bounded clients carry the identical guard; this exercises the root's, which is the one
 * whose class is reachable from this package. Any of the four failing is enough to fail the boot, which
 * is the property that matters — the value is one property read by all of them.
 */
class ScheduledQueryTimeoutBoundsTest {

	private static final int COMMITTED_DEFAULT = 10;

	private final ObservabilityConfig config = new ObservabilityConfig();

	@Test
	void rejectsZeroBecauseZeroMeansNoLimitToJdbc() {
		assertThatThrownBy(() -> config.outboxBacklogMetric(mock(DataSource.class), 0))
				.isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("riviera.scheduled.query-timeout-seconds")
				.hasMessageContaining("0 and negatives mean NO limit");
	}

	@Test
	void rejectsANegativeBecauseJdbcTemplateReadsItAsTheDriverDefault() {
		assertThatThrownBy(() -> config.outboxBacklogMetric(mock(DataSource.class), -1))
				.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void rejectsABoundLongerThanTheSweepCadenceBecauseItNoLongerBounds() {
		assertThatThrownBy(() -> config.outboxBacklogMetric(mock(DataSource.class), 301))
				.isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("must be between 1 and 300");
	}

	/**
	 * Asserts the guard admits the value {@code application.properties} ships, without reading the file:
	 * a committed value outside the range fails every context boot, so CI is what pins that, and
	 * duplicating the file read here would only add a second thing to keep in step.
	 */
	@Test
	void acceptsTheCommittedDefault() {
		assertThat(config.outboxBacklogMetric(mock(DataSource.class), COMMITTED_DEFAULT))
				.as("a healthy in-range bound is wired, not rejected")
				.isNotNull();
	}
}
