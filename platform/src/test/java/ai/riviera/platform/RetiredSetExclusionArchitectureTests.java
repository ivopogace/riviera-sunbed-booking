package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;

import ai.riviera.platform.venue.api.SetBookingFacts;

import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.classFileOf;
import static ai.riviera.platform.ArchitectureTestSupport.stringConstantFields;
import static ai.riviera.platform.ArchitectureTestSupport.stringConstants;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A retired set is gone from every read but the one that serves its bookings (ADR-0019,
 * {@code RESPONSIBILITIES.md} §venue). The exclusion is a forever tax on every future query, so it
 * is enforced, not described: every production SQL string that names the {@code set_position}
 * table must either read it through the {@code active_set_position} view or say {@code retired_at
 * IS NULL} — a retire, a delete or a lock on the active rows. A bare mention of the marker (a column
 * in a select list) excludes nothing and does not pass. Two allowances, each stated here because a
 * reader would otherwise look for them in the rule: an {@code INSERT INTO set_position} passes,
 * since a new row is active by construction; and in a class implementing {@link SetBookingFacts}
 * the constants named in {@link #EXEMPT_FACTS_CONSTANTS} pass whatever they read, because a booking
 * on a retired set must still resolve to the spot the guest was told. Every other statement of that
 * class — the claim's pool read, the reserve's fence, the spot reads — is held like any other
 * class's.
 *
 * <p>Keys on {@code CONSTANT_String} entries, one statement at a time
 * ({@link ArchitectureTestSupport#stringConstants}); the exemption keys on the field's
 * {@code ConstantValue} ({@link ArchitectureTestSupport#stringConstantFields}), so an exempt
 * statement is a named {@code static final String}, never an inline literal, and the name alone
 * buys nothing outside the facts port's implementor. The whole-word match keeps
 * {@code active_set_position} and the {@code set_position_*} constraint names from counting as
 * the table. Context-free like its siblings; the negative and positive cases are proven against
 * {@code ai.riviera.retirefixture}, never by breaking production code, and the vacuity guard
 * asserts that the exemption, the per-statement check inside the facts adapter and the view path
 * are all exercised by the production tree.
 *
 * <p>This test names its table and its exempt constants, which the {@code riviera-modulith}
 * skill's structural-net membership rule otherwise excludes; it is the net's one
 * admitted-by-decision member, because a new JDBC adapter anywhere in the tree can break the rule
 * it holds.
 */
class RetiredSetExclusionArchitectureTests {

	private static final String SET_TABLE = "set_position";
	private static final String ACTIVE_VIEW = "active_set_position";
	private static final String RETIRED_MARKER = "retired_at";

	/**
	 * The facts port's deliberate bare reads, by constant name: the booking-info select that still
	 * answers for a retired set, and the ForReserve twins' venue lock, which hands out no set. Nothing
	 * else in an implementor is exempt.
	 */
	private static final Set<String> EXEMPT_FACTS_CONSTANTS = Set.of("SET_BOOKING_INFO_SELECT",
			"VENUES_OF_SETS_LOCK");

	/** The table as a whole word: not {@code active_set_position}, not {@code set_position_grid_uniq}. */
	private static final Pattern BARE_SET_TABLE =
			Pattern.compile("(?<![_\\p{Alnum}])" + SET_TABLE + "(?![_\\p{Alnum}])");

	/** The text before an occurrence when that occurrence is an insert target. */
	private static final Pattern ENDS_WITH_INSERT_INTO = Pattern.compile("(?is).*\\binsert\\s+into\\s+$");

	/** The exclusion a write or lock states: the marker tested for null, in any case and spacing. */
	private static final Pattern MARKER_IS_NULL = Pattern.compile(
			"(?i)(?<![_\\p{Alnum}])" + RETIRED_MARKER + "\\s+is\\s+null(?![_\\p{Alnum}])");

	private static final Pattern WHOLE_WORD_VIEW =
			Pattern.compile("(?<![_\\p{Alnum}])" + ACTIVE_VIEW + "(?![_\\p{Alnum}])");

	private static final String FIXTURE_BASE = "ai.riviera.retirefixture";

	private static final JavaClasses PRODUCTION_CLASSES = ArchitectureTestSupport.PRODUCTION_CLASSES;

	private static final JavaClasses FIXTURE_CLASSES = ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE);

	@Test
	void everySetTableStatementOutsideTheExemptConstantsExcludesRetiredSets() {
		assertNoViolations("ADR-0019 retired-set exclusion violations", violations(PRODUCTION_CLASSES));
	}

	/**
	 * Guards against a vacuously-green rule: the production tree must hold a facts adapter whose
	 * exempt constants read the bare table (so the exemption is real), a non-exempt statement in that
	 * adapter reading the view (so the per-statement check inside it holds something) and a view read
	 * elsewhere (so the sanctioned path is what the excluding reads actually take).
	 */
	@Test
	void theExemptionThePerStatementCheckAndTheViewPathAreAllExercised() {
		boolean exemptBareRead = false;
		boolean checkedFactsViewRead = false;
		boolean viewReadElsewhere = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			Set<String> exempt = exemptStatementsOf(type);
			for (String sql : stringConstantsOf(type)) {
				boolean readsView = WHOLE_WORD_VIEW.matcher(sql).find();
				if (exempt.contains(sql)) {
					exemptBareRead |= !bareOccurrences(sql).isEmpty();
				}
				else if (implementsFactsPort(type)) {
					checkedFactsViewRead |= readsView;
				}
				else {
					viewReadElsewhere |= readsView;
				}
			}
		}
		assertTrue(exemptBareRead, "expected an exempt constant of the SetBookingFacts adapter to read '"
				+ SET_TABLE + "' bare — otherwise the exemption proves nothing");
		assertTrue(checkedFactsViewRead, "expected a non-exempt statement of the SetBookingFacts adapter to read '"
				+ ACTIVE_VIEW + "' — otherwise the per-statement check inside it holds nothing");
		assertTrue(viewReadElsewhere, "expected at least one other production class to read '" + ACTIVE_VIEW
				+ "' — otherwise the sanctioned path is not the one the reads take");
	}

	/** The negative proof (red run): a bare read outside the facts port is rejected. */
	@Test
	void rogueSetTableReaderFixtureIsRejected() {
		assertRejected("RogueSetTableReader");
	}

	/** A statement that merely mentions the marker — a column in a select list — excludes nothing. */
	@Test
	void aStatementThatOnlyMentionsTheMarkerIsRejected() {
		assertRejected("RogueMarkerMentioner");
	}

	/** A copy of a facts-port spot read with the view dropped: the implementor is checked per statement. */
	@Test
	void aBareReadInsideAFactsImplementorIsRejected() {
		assertRejected("RogueSetFacts");
	}

	/** The exempt name on a class outside the facts port buys nothing. */
	@Test
	void theExemptNameOutsideAFactsImplementorIsRejected() {
		assertRejected("RogueBorrowedNameReader");
	}

	/** The allow paths: the view, the marker tested for null, an insert, and the facts port's exempt constants. */
	@Test
	void theExemptConstantsAndTheViewReadersPass() {
		List<String> violations = violations(FIXTURE_CLASSES);
		for (String passing : List.of("FixtureActiveSetReader", "FixtureSetRetirer", "FixtureSetInserter",
				"FixtureSetFacts")) {
			assertFalse(violations.stream().anyMatch(v -> v.contains(passing)),
					passing + " must not be flagged, but got: " + violations);
		}
	}

	private static void assertRejected(String fixture) {
		List<String> violations = violations(FIXTURE_CLASSES);
		assertTrue(violations.stream().anyMatch(v -> v.contains(fixture)),
				"Expected the exclusion scan to reject " + fixture + ", but got: " + violations);
	}

	private static List<String> violations(JavaClasses classes) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			Set<String> exempt = exemptStatementsOf(type);
			for (String sql : stringConstantsOf(type)) {
				if (!exempt.contains(sql) && !bareOccurrences(sql).isEmpty() && !excludesRetiredSets(sql)) {
					violations.add(type.getName() + " names the '" + SET_TABLE + "' table without excluding "
							+ "retired sets: \"" + oneLine(sql) + "\" — a read selects from " + ACTIVE_VIEW
							+ ", a write or lock says " + RETIRED_MARKER + " IS NULL; only the SetBookingFacts "
							+ "adapter's " + EXEMPT_FACTS_CONSTANTS + " read the table bare (ADR-0019)");
				}
			}
		}
		return violations;
	}

	private static boolean excludesRetiredSets(String sql) {
		return WHOLE_WORD_VIEW.matcher(sql).find() || MARKER_IS_NULL.matcher(sql).find();
	}

	/** The facts port's adapter — the one reader every retired set must still answer. */
	private static boolean implementsFactsPort(JavaClass type) {
		return !type.isInterface() && type.isAssignableTo(SetBookingFacts.class);
	}

	/** The values of the facts port's named bare reads in {@code type}; empty for any other class. */
	private static Set<String> exemptStatementsOf(JavaClass type) {
		if (!implementsFactsPort(type)) {
			return Set.of();
		}
		return classFileOf(type).map(ArchitectureTestSupport::stringConstantFields).orElse(Map.of())
				.entrySet().stream()
				.filter(field -> EXEMPT_FACTS_CONSTANTS.contains(field.getKey()))
				.map(Map.Entry::getValue)
				.collect(Collectors.toSet());
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
