package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;

import ai.riviera.platform.venue.api.SetBookingFacts;

import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.classFileOf;
import static ai.riviera.platform.ArchitectureTestSupport.stringConstants;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A retired set is gone from every read but the one that serves its bookings (ADR-0019,
 * {@code RESPONSIBILITIES.md} §venue). The exclusion is a forever tax on every future query, so it
 * is enforced, not described: every production SQL string that names the {@code set_position}
 * table must either read it through the {@code active_set_position} view or name the
 * {@code retired_at} marker itself — a retire, a delete or a lock that says {@code retired_at IS
 * NULL}. Two allowances, each stated here because a reader would otherwise look for them in the
 * rule: an {@code INSERT INTO set_position} passes, since a new row is active by construction; and
 * the class implementing {@link SetBookingFacts} — the deliberately unfenced facts port behind
 * cancel, the booking view, the mails and the staff lookup — passes whatever it reads, because a
 * booking on a retired set must still resolve to the spot the guest was told.
 *
 * <p>Keys on {@code CONSTANT_String} entries, one statement at a time
 * ({@link ArchitectureTestSupport#stringConstants}), so a class that holds both an excluding read
 * and a marker-naming write is judged per statement, not per class. The whole-word match keeps
 * {@code active_set_position} and the {@code set_position_*} constraint names from counting as
 * the table. Context-free like its siblings; the negative and positive cases are proven against
 * {@code ai.riviera.retirefixture}, never by breaking production code, and the two vacuity guards
 * assert that the exemption and the view path are both exercised by the production tree.
 *
 * <p>This test names its table and its exempt port, which {@code CLAUDE.md}'s structural-net
 * membership rule otherwise excludes; it is the net's one admitted-by-decision member, because a
 * new JDBC adapter anywhere in the tree can break the rule it holds.
 */
class RetiredSetExclusionArchitectureTests {

	private static final String SET_TABLE = "set_position";
	private static final String ACTIVE_VIEW = "active_set_position";
	private static final String RETIRED_MARKER = "retired_at";

	/** The table as a whole word: not {@code active_set_position}, not {@code set_position_grid_uniq}. */
	private static final Pattern BARE_SET_TABLE =
			Pattern.compile("(?<![_\\p{Alnum}])" + SET_TABLE + "(?![_\\p{Alnum}])");

	/** The text before an occurrence when that occurrence is an insert target. */
	private static final Pattern ENDS_WITH_INSERT_INTO = Pattern.compile("(?is).*\\binsert\\s+into\\s+$");

	private static final Pattern WHOLE_WORD_MARKER =
			Pattern.compile("(?<![_\\p{Alnum}])" + RETIRED_MARKER + "(?![_\\p{Alnum}])");

	private static final Pattern WHOLE_WORD_VIEW =
			Pattern.compile("(?<![_\\p{Alnum}])" + ACTIVE_VIEW + "(?![_\\p{Alnum}])");

	private static final String FIXTURE_BASE = "ai.riviera.retirefixture";

	private static final JavaClasses PRODUCTION_CLASSES = ArchitectureTestSupport.PRODUCTION_CLASSES;

	private static final JavaClasses FIXTURE_CLASSES = ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE);

	@Test
	void everySetTableReadOutsideTheFactsPortExcludesRetiredSets() {
		assertNoViolations("ADR-0019 retired-set exclusion violations", violations(PRODUCTION_CLASSES));
	}

	/**
	 * Guards against a vacuously-green rule: the production tree must hold a facts adapter that reads
	 * the bare table (so the exemption is real) and at least one other class reading the view (so the
	 * sanctioned path is what the excluding reads actually take).
	 */
	@Test
	void theExemptionAndTheViewPathAreBothExercised() {
		boolean exemptBareRead = false;
		boolean viewRead = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			List<String> strings = stringConstantsOf(type);
			if (isExempt(type)) {
				exemptBareRead |= strings.stream().anyMatch(sql -> !bareOccurrences(sql).isEmpty());
			}
			else {
				viewRead |= strings.stream().anyMatch(sql -> WHOLE_WORD_VIEW.matcher(sql).find());
			}
		}
		assertTrue(exemptBareRead, "expected the SetBookingFacts adapter to read '" + SET_TABLE
				+ "' bare — otherwise the exemption proves nothing");
		assertTrue(viewRead, "expected at least one non-exempt production class to read '" + ACTIVE_VIEW
				+ "' — otherwise the sanctioned path is not the one the reads take");
	}

	/** The negative proof (red run): a bare read outside the facts port is rejected. */
	@Test
	void rogueSetTableReaderFixtureIsRejected() {
		List<String> violations = violations(FIXTURE_CLASSES);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueSetTableReader")),
				"Expected the exclusion scan to reject the fixture bare reader, but got: " + violations);
	}

	/** The allow paths: the view, the marker, an insert, and the exempt port's bare read all pass. */
	@Test
	void theFactsPortAdapterIsExemptAndTheViewReadersPass() {
		List<String> violations = violations(FIXTURE_CLASSES);
		for (String passing : List.of("FixtureActiveSetReader", "FixtureSetRetirer", "FixtureSetInserter",
				"FixtureSetFacts")) {
			assertFalse(violations.stream().anyMatch(v -> v.contains(passing)),
					passing + " must not be flagged, but got: " + violations);
		}
	}

	private static List<String> violations(JavaClasses classes) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (isExempt(type)) {
				continue;
			}
			for (String sql : stringConstantsOf(type)) {
				if (!bareOccurrences(sql).isEmpty() && !WHOLE_WORD_MARKER.matcher(sql).find()) {
					violations.add(type.getName() + " names the '" + SET_TABLE + "' table without the '"
							+ RETIRED_MARKER + "' marker: \"" + oneLine(sql) + "\" — a read selects from "
							+ ACTIVE_VIEW + ", a write or lock says " + RETIRED_MARKER
							+ " IS NULL; only the SetBookingFacts adapter reads the table bare (ADR-0019)");
				}
			}
		}
		return violations;
	}

	/** The facts port's adapter — the one reader every retired set must still answer. */
	private static boolean isExempt(JavaClass type) {
		return !type.isInterface() && type.isAssignableTo(SetBookingFacts.class);
	}

	/** Start offsets of every whole-word occurrence of the table that is not an insert target. */
	private static List<Integer> bareOccurrences(String sql) {
		List<Integer> offsets = new ArrayList<>();
		Matcher table = BARE_SET_TABLE.matcher(sql);
		while (table.find()) {
			if (!ENDS_WITH_INSERT_INTO.matcher(sql.substring(0, table.start())).matches()) {
				offsets.add(table.start());
			}
		}
		return offsets;
	}

	private static List<String> stringConstantsOf(JavaClass type) {
		return classFileOf(type).map(ArchitectureTestSupport::stringConstants).orElse(List.of());
	}

	private static String oneLine(String sql) {
		return sql.strip().replaceAll("\\s+", " ");
	}
}
