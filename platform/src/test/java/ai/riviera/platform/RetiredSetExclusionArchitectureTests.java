package ai.riviera.platform;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
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
 * A retired set is gone from every read but the ones that serve its bookings (ADR-0019,
 * {@code RESPONSIBILITIES.md} §venue), enforced per statement: every production SQL string naming
 * {@code set_position} reads {@code active_set_position} or says {@code retired_at IS NULL}. An
 * {@code INSERT INTO} passes (a new row is active by construction), and inside a {@link SetBookingFacts}
 * implementor only the values of the constants named in {@link #EXEMPT_FACTS_CONSTANTS} pass bare.
 * Context-free; proven against {@code ai.riviera.retirefixture}; the net's one admitted-by-decision member.
 */
class RetiredSetExclusionArchitectureTests {

	private static final String SET_TABLE = "set_position";
	private static final String ACTIVE_VIEW = "active_set_position";
	private static final String RETIRED_MARKER = "retired_at";

	/**
	 * The facts port's bare reads: the booking-info select that still answers for a retired set, and the
	 * ForReserve twins' venue lock, which hands out no set. Exempt are these fields' {@code ConstantValue}s;
	 * javac pools a same-text inline literal with them, so review, not this scan, catches that literal.
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
	 * Guards against a vacuously-green rule: every exempt name must be a facts implementor's constant
	 * reading the bare table (no allow-list entry is stale), a non-exempt statement in the facts adapter
	 * must read the view (the per-statement check inside it holds something), and so must one elsewhere.
	 */
	@Test
	void theExemptionThePerStatementCheckAndTheViewPathAreAllExercised() {
		Set<String> exemptNamesReadingBare = new HashSet<>();
		boolean checkedFactsViewRead = false;
		boolean viewReadElsewhere = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			Map<String, String> exemptFields = exemptFieldsOf(type);
			exemptFields.forEach((name, sql) -> {
				if (!bareOccurrences(sql).isEmpty()) {
					exemptNamesReadingBare.add(name);
				}
			});
			for (String sql : stringConstantsOf(type)) {
				boolean readsView = WHOLE_WORD_VIEW.matcher(sql).find();
				if (exemptFields.containsValue(sql)) {
					continue;
				}
				if (implementsFactsPort(type)) {
					checkedFactsViewRead |= readsView;
				}
				else {
					viewReadElsewhere |= readsView;
				}
			}
		}
		Set<String> staleNames = new TreeSet<>(EXEMPT_FACTS_CONSTANTS);
		staleNames.removeAll(exemptNamesReadingBare);
		assertTrue(staleNames.isEmpty(), "expected every EXEMPT_FACTS_CONSTANTS name to be a constant of a "
				+ "production SetBookingFacts implementor reading '" + SET_TABLE + "' bare — these exempt nothing: "
				+ staleNames);
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
			Map<String, String> exempt = exemptFieldsOf(type);
			for (String sql : stringConstantsOf(type)) {
				if (!exempt.containsValue(sql) && !bareOccurrences(sql).isEmpty() && !excludesRetiredSets(sql)) {
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

	/** The facts port's named bare reads in {@code type}, name to statement; empty for any other class. */
	private static Map<String, String> exemptFieldsOf(JavaClass type) {
		if (!implementsFactsPort(type)) {
			return Map.of();
		}
		return classFileOf(type).map(ArchitectureTestSupport::stringConstantFields).orElse(Map.of())
				.entrySet().stream()
				.filter(field -> EXEMPT_FACTS_CONSTANTS.contains(field.getKey()))
				.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
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
