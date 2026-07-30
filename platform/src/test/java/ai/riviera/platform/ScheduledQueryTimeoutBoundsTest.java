package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
 * <p>One guard, at the platform edge: {@link ScheduledQueryTimeout}'s Javadoc records why it is not
 * four (a duplication gate, and no legal shared home for a helper spanning the root and two modules).
 */
class ScheduledQueryTimeoutBoundsTest {

	/** The value shipped in application.properties. */
	private static final int COMMITTED_DEFAULT = 10;

	@Test
	void rejectsZeroBecauseZeroMeansNoLimitToJdbc() {
		assertThatThrownBy(() -> new ScheduledQueryTimeout(0))
				.isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("riviera.scheduled.query-timeout-seconds")
				.hasMessageContaining("0 and negatives mean NO limit");
	}

	@Test
	void rejectsANegativeBecauseJdbcTemplateReadsItAsTheDriverDefault() {
		assertThatThrownBy(() -> new ScheduledQueryTimeout(-1))
				.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void rejectsABoundLongerThanTheSweepCadenceBecauseItNoLongerBounds() {
		assertThatThrownBy(() -> new ScheduledQueryTimeout(301))
				.isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("must be between 1 and 300");
	}

	@Test
	void acceptsTheCommittedDefaultAndTheBoundsThemselves() {
		assertThat(new ScheduledQueryTimeout(COMMITTED_DEFAULT).seconds()).isEqualTo(COMMITTED_DEFAULT);
		assertThat(new ScheduledQueryTimeout(1).seconds()).isEqualTo(1);
		assertThat(new ScheduledQueryTimeout(300).seconds()).isEqualTo(300);
	}
}
