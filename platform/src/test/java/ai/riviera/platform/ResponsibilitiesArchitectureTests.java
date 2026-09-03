package ai.riviera.platform;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.Source;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.bytecode;
import static ai.riviera.platform.ArchitectureTestSupport.moduleOf;
import static ai.riviera.platform.ArchitectureTestSupport.surfaceOf;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Encodes the <strong>machine-checkable half of {@code RESPONSIBILITIES.md}</strong> as fitness
 * functions (issue #96, improvement-plan C4) — the structural subset of the Job / Not-My-Job
 * boundaries that an illegal import or a stray SQL string would betray:
 * <ol>
 *   <li><strong>Sole-writer:</strong> no class outside the {@code availability} module touches
 *       the {@code set_availability} table — the mechanical form of "availability is the only
 *       writer of that table" (invariant #2). Detected by scanning each class's compiled
 *       bytecode (via its ArchUnit source URI) for the whole-word table name — the
 *       {@code NoStripeConnectArchitectureTest} mechanism, because a class-location convention
 *       cannot see SQL. Deliberately stronger than "writer": ANY reference (read or write)
 *       outside the module fails — cross-module reads go through availability's published
 *       ports too (invariant #11), never straight at its table.</li>
 *   <li><strong>No forbidden reach:</strong> the Stripe SDK ({@code com.stripe..}) is importable
 *       only inside {@code payment}. {@code ApplicationModules.verify()} polices module-internal
 *       package reach; this adds the third-party-SDK boundary it cannot see. (Which Stripe APIs
 *       payment itself may use — no Connect — stays {@code NoStripeConnectArchitectureTest}'s job.)</li>
 *   <li><strong>Id-based events:</strong> every record in an {@code events} named interface
 *       carries only id/value payloads — every raw type involved in a component's declared type
 *       (generics and arrays unwrapped) is a primitive, a {@code java.*} type, or a published
 *       {@code vocabulary} type; never an aggregate from any {@code domain} package (the
 *       Need-To-Know half of invariant #11).</li>
 *   <li><strong>Sole-writer, review table (#811):</strong> no class outside the {@code review}
 *       module carries SQL against the {@code review} table. The bare table name is useless as a
 *       token — every legitimate consumer of review's published surfaces has the module's package
 *       name in its constant pool — so this rule keys on <em>SQL-shaped</em> references instead:
 *       an SQL keyword ({@code FROM}/{@code INTO}/{@code UPDATE}/{@code JOIN}/{@code TABLE})
 *       followed by the whole-word table name.</li>
 *   <li><strong>Sole-writer, venue rating columns (#811):</strong> {@code rating_tenths} /
 *       {@code reviews_count} are referenced only inside {@code venue} — the mechanical form of
 *       §venue's "I store the rating aggregate; {@code review} computes it": {@code review}
 *       announces via {@code ReviewsChanged} and answers via its aggregate port; only {@code venue}
 *       names its columns. Same whole-word constant-pool scan as rule 1.</li>
 *   <li><strong>Sole-writer, challenge registry:</strong> no class outside the {@code challenge}
 *       module touches {@code challenge_registry} — the mechanical form of §{@code challenge}'s
 *       "only writer of {@code challenge_registry}". A claim written anywhere else is a second
 *       opinion on whether a solved challenge has been spent, which is the one thing the table
 *       exists to settle. Same whole-word constant-pool scan as rule 1; the bare token is safe
 *       here because the module's package name is {@code challenge}, not {@code challenge_registry}.</li>
 * </ol>
 *
 * <p><strong>Necessary, not sufficient.</strong> These rules encode only the <em>structural</em>
 * half of {@code RESPONSIBILITIES.md}. The <em>semantic</em> half — a refund <em>policy</em>
 * reimplemented inside {@code payment}, commission <em>math</em> inside {@code venue} — needs no
 * illegal import or stray table name and <em>cannot</em> be machine-checked; it remains the job
 * of the plan-time Module-ownership table and review item RV-BE-11. A green run here must never
 * be read as "boundaries fully enforced." (Known scan limits, same trade-off as
 * {@code NoStripeConnectArchitectureTest}: rule 1 keys on the contiguous whole-word table name in
 * the constant pool — SQL assembled by concatenation that splits the name would evade it (the
 * project's text-block-SQL idiom keeps names contiguous), and a match at the very start of a pool
 * string can hide behind an alphanumeric length byte. The word-boundary check means a
 * <em>different</em> identifier merely containing the name ({@code reset_availability}) does not
 * false-positive; a class that inlines availability's table-name constant still matches — that
 * coupling is exactly what the rule exists to surface.)
 *
 * <p>The violation collectors are parameterized by {@code (JavaClasses, base)} so the negative
 * cases are proven against the deliberately-violating fixtures under
 * {@code ai.riviera.responsibilityfixture} — never by breaking production code. Fast and
 * context-free like its siblings ({@link PackageShapeArchitectureTests},
 * {@link PublishedSurfacePlacementArchitectureTests}): no Spring, no DB.
 */
class ResponsibilitiesArchitectureTests {

	/** The per-(set, date) source-of-truth table owned by {@code availability} (invariant #2). */
	private static final String AVAILABILITY_TABLE = "set_availability";

	/** The one module that may reference {@link #AVAILABILITY_TABLE} (invariant #2). */
	private static final String AVAILABILITY_MODULE = "availability";

	/** The one module that may touch the Stripe SDK (RESPONSIBILITIES.md / ADR-0002). */
	private static final String PAYMENT_MODULE = "payment";

	/** The Stripe SDK's root package — matched with a package boundary, so {@code com.stripefoo} is not it. */
	private static final String STRIPE_SDK_ROOT = "com.stripe";

	/** The one module that may run SQL against the {@code review} table (#811, ADR-0015). */
	private static final String REVIEW_MODULE = "review";

	/** SQL-shaped reference to the {@code review} table: keyword + whole-word table name.
	 * The bare name would false-positive on the module's own package string in every consumer. */
	private static final Pattern REVIEW_TABLE_SQL =
			Pattern.compile("(?i)\\b(?:from|into|update|join|table)\\s+review(?![_\\p{Alnum}])");

	/** The one module that may name its rating columns (§venue: it stores, {@code review} computes). */
	private static final String VENUE_MODULE = "venue";

	/** The venue-owned aggregate columns no other module may reference (#811). */
	private static final List<String> RATING_COLUMNS = List.of("rating_tenths", "reviews_count");

	/** The single-use registry table owned by {@code challenge} (ADR-0016, ADR-0017). */
	private static final String CHALLENGE_REGISTRY_TABLE = "challenge_registry";

	/** The one module that may reference {@link #CHALLENGE_REGISTRY_TABLE}. */
	private static final String CHALLENGE_MODULE = "challenge";

	private static final String EVENTS_SURFACE = "events";
	private static final String VOCABULARY_SURFACE = "vocabulary";
	private static final String JDK_PACKAGE_PREFIX = "java.";

	private static final String FIXTURE_BASE = "ai.riviera.responsibilityfixture";

	private static final JavaClasses PRODUCTION_CLASSES = ArchitectureTestSupport.PRODUCTION_CLASSES;

	private static final JavaClasses FIXTURE_CLASSES =
			ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE);

	// ---- rule 1: availability is the sole writer (sole toucher) of set_availability ---------

	@Test
	void availabilityTableIsTouchedOnlyInsideTheAvailabilityModule() {
		List<String> violations = availabilityTableViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (availability sole-writer, invariant #2)",
				violations);
	}

	/** Guards against a vacuously-green scan: availability's own classes DO carry the table name. */
	@Test
	void theAvailabilityModuleItselfWritesTheTable() {
		boolean availabilityReferencesTable = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (AVAILABILITY_MODULE.equals(moduleOf(type, PRODUCTION_BASE))
					&& referencesAvailabilityTable(type)) {
				availabilityReferencesTable = true;
				break;
			}
		}
		assertTrue(availabilityReferencesTable,
				"expected at least one availability class to reference '" + AVAILABILITY_TABLE
						+ "' — otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): an outside class carrying the table's SQL is rejected. */
	@Test
	void outsideWriterFixtureIsRejected() {
		List<String> violations = availabilityTableViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueAvailabilityWriter")),
				"Expected the sole-writer scan to reject the fixture outside writer, but got: "
						+ violations);
	}

	// ---- rule 2: the Stripe SDK is reachable only inside the payment module ----------------

	@Test
	void stripeSdkIsReachableOnlyInsideThePaymentModule() {
		List<String> violations = stripeReachViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (Stripe SDK only inside payment)",
				violations);
	}

	/** Guards against a vacuously-green rule: payment's own adapters DO depend on Stripe. */
	@Test
	void thePaymentModuleItselfUsesStripe() {
		boolean paymentUsesStripe = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (PAYMENT_MODULE.equals(moduleOf(type, PRODUCTION_BASE)) && dependsOnStripe(type)) {
				paymentUsesStripe = true;
				break;
			}
		}
		assertTrue(paymentUsesStripe, "expected the payment module to depend on com.stripe.. "
				+ "(the collection gateway) — otherwise the Stripe-reach rule proves nothing");
	}

	/** The negative proof (red run): a Stripe import outside payment is rejected — and the
	 * fixture payment module's own Stripe use is NOT (the exclusion path works). */
	@Test
	void stripeOutsidePaymentFixtureIsRejected() {
		List<String> violations = stripeReachViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueStripeCaller")),
				"Expected the Stripe-reach rule to reject the fixture caller outside payment, "
						+ "but got: " + violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureStripeGateway")),
				"The fixture payment module's own Stripe use must not be flagged, but got: "
						+ violations);
	}

	// ---- rule 3: event records carry only ids and values (Need-To-Know, invariant #11) -----

	@Test
	void eventRecordsCarryOnlyIdsAndValues() {
		List<String> violations = eventPayloadViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (id-based event payloads, invariant #11)",
				violations);
	}

	/** Guards against a vacuously-green rule: the import must see event records, and at least
	 * one id/value payload the classifier recognizes as vocabulary. (Deliberately no stronger:
	 * requiring e.g. a primitive component would couple this guard to the incidental payload
	 * mix of today's events.) */
	@Test
	void eventSurfacesWereInspected() {
		boolean sawEventRecord = false, sawVocabulary = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (!EVENTS_SURFACE.equals(surfaceOf(type, PRODUCTION_BASE)) || !type.isRecord()) {
				continue;
			}
			sawEventRecord = true;
			for (JavaField field : payloadFields(type)) {
				for (JavaClass involved : field.getType().getAllInvolvedRawTypes()) {
					sawVocabulary |= VOCABULARY_SURFACE.equals(surfaceOf(involved, PRODUCTION_BASE));
				}
			}
		}
		assertTrue(sawEventRecord && sawVocabulary,
				"Expected the production import to contain event records carrying at least one "
						+ "vocabulary-typed component — otherwise the id-based-events rule is "
						+ "vacuously green.");
	}

	/** The negative proof (red run): an event record carrying a domain aggregate — bare or
	 * wrapped in a generic container — is rejected, and its legitimate id/primitive components
	 * are NOT (the allow path works). */
	@Test
	void aggregateCarryingEventFixtureIsRejected() {
		List<String> violations = eventPayloadViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream()
						.anyMatch(v -> v.contains(".aggregate ") && v.contains("FakeAggregate")),
				"Expected the id-based-events rule to reject the bare aggregate component, but got: "
						+ violations);
		assertTrue(violations.stream()
						.anyMatch(v -> v.contains(".aggregates ") && v.contains("FakeAggregate")),
				"Expected the id-based-events rule to reject the aggregate hidden in List<...> "
						+ "(generics unwrapped), but got: " + violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureId")),
				"The fixture event's legitimate vocabulary-typed id must not be flagged, but got: "
						+ violations);
	}

	// ---- rule 4: review is the sole toucher of the review table (#811) ---------------------

	@Test
	void reviewTableIsTouchedOnlyInsideTheReviewModule() {
		List<String> violations = reviewTableViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (review sole-writer, #811)",
				violations);
	}

	/** Guards against a vacuously-green scan: review's own adapter DOES carry the table's SQL. */
	@Test
	void theReviewModuleItselfTouchesItsTable() {
		boolean reviewReferencesTable = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (REVIEW_MODULE.equals(moduleOf(type, PRODUCTION_BASE)) && referencesReviewTableSql(type)) {
				reviewReferencesTable = true;
				break;
			}
		}
		assertTrue(reviewReferencesTable,
				"expected at least one review class to carry SQL against the review table — "
						+ "otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): outside SQL against the table is rejected — and the
	 * fixture review module's own SQL is NOT (the exclusion path works). */
	@Test
	void outsideReviewTableFixtureIsRejected() {
		List<String> violations = reviewTableViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueReviewTableReader")),
				"Expected the review sole-writer scan to reject the fixture outside reader, but got: "
						+ violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureJdbcReviews")),
				"The fixture review module's own SQL must not be flagged, but got: " + violations);
	}

	// ---- rule 5: venue is the sole toucher of its rating columns (#811) ---------------------

	@Test
	void ratingColumnsAreTouchedOnlyInsideTheVenueModule() {
		List<String> violations = ratingColumnViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (venue rating-columns sole-writer, #811)",
				violations);
	}

	/** Guards against a vacuously-green scan: venue's own adapters DO name the columns. */
	@Test
	void theVenueModuleItselfWritesTheRatingColumns() {
		boolean venueReferencesColumns = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (VENUE_MODULE.equals(moduleOf(type, PRODUCTION_BASE))
					&& !ratingColumnsIn(type).isEmpty()) {
				venueReferencesColumns = true;
				break;
			}
		}
		assertTrue(venueReferencesColumns,
				"expected at least one venue class to reference the rating columns — "
						+ "otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): an outside writer of the columns is rejected — and the
	 * fixture venue module's own write is NOT (the exclusion path works). */
	@Test
	void outsideRatingColumnFixtureIsRejected() {
		List<String> violations = ratingColumnViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueRatingColumnWriter")),
				"Expected the rating-columns scan to reject the fixture outside writer, but got: "
						+ violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureVenueRatingWriter")),
				"The fixture venue module's own column write must not be flagged, but got: "
						+ violations);
	}

	// ---- rule 6: challenge is the sole toucher of its single-use registry -------------------

	@Test
	void challengeRegistryTableIsTouchedOnlyInsideTheChallengeModule() {
		List<String> violations = challengeRegistryViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (challenge sole-writer, ADR-0017)",
				violations);
	}

	/** Guards against a vacuously-green scan: the module's own adapter DOES carry the table's SQL. */
	@Test
	void theChallengeModuleItselfWritesTheTable() {
		boolean challengeReferencesTable = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (CHALLENGE_MODULE.equals(moduleOf(type, PRODUCTION_BASE))
					&& referencesChallengeRegistryTable(type)) {
				challengeReferencesTable = true;
				break;
			}
		}
		assertTrue(challengeReferencesTable,
				"expected at least one challenge class to reference '" + CHALLENGE_REGISTRY_TABLE
						+ "' — otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): an outside writer is rejected — and the fixture module's
	 * own writer is NOT (the exclusion path works). */
	@Test
	void outsideChallengeRegistryWriterFixtureIsRejected() {
		List<String> violations = challengeRegistryViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueChallengeRegistryWriter")),
				"Expected the challenge sole-writer scan to reject the fixture outside writer, but got: "
						+ violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureJdbcChallengeRegistry")),
				"The fixture challenge module's own SQL must not be flagged, but got: " + violations);
	}

	// ---- violation collectors (parameterized so fixtures prove the red case) ---------------

	private static List<String> availabilityTableViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (AVAILABILITY_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			if (referencesAvailabilityTable(type)) {
				violations.add(type.getName() + " references the '" + AVAILABILITY_TABLE
						+ "' table — the availability module is its only writer AND reader "
						+ "(invariant #2 / RESPONSIBILITIES.md); other modules go through "
						+ "availability's published ports (api/spi), never at the table");
			}
		}
		return violations;
	}

	private static boolean referencesAvailabilityTable(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> containsWholeWord(bytecode, AVAILABILITY_TABLE))
				.orElse(false);
	}

	private static List<String> challengeRegistryViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (CHALLENGE_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			if (referencesChallengeRegistryTable(type)) {
				violations.add(type.getName() + " references the '" + CHALLENGE_REGISTRY_TABLE
						+ "' table — the challenge module is its only writer AND reader "
						+ "(ADR-0017 / RESPONSIBILITIES.md §challenge); the platform edge asks the "
						+ "module through challenge::api, never at the table");
			}
		}
		return violations;
	}

	private static boolean referencesChallengeRegistryTable(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> containsWholeWord(bytecode, CHALLENGE_REGISTRY_TABLE))
				.orElse(false);
	}

	private static List<String> reviewTableViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (REVIEW_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			if (referencesReviewTableSql(type)) {
				violations.add(type.getName() + " carries SQL against the 'review' table — the "
						+ "review module is its only writer AND reader (#811 / RESPONSIBILITIES.md); "
						+ "other modules go through review's published ports (api/spi) or its "
						+ "ReviewsChanged event, never at the table");
			}
		}
		return violations;
	}

	private static boolean referencesReviewTableSql(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> REVIEW_TABLE_SQL.matcher(bytecode).find())
				.orElse(false);
	}

	private static List<String> ratingColumnViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (VENUE_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			for (String column : ratingColumnsIn(type)) {
				violations.add(type.getName() + " references the venue column '" + column
						+ "' — venue stores the rating aggregate and stays its columns' only "
						+ "writer; review computes the values and announces them via "
						+ "ReviewsChanged (#811 / RESPONSIBILITIES.md §venue)");
			}
		}
		return violations;
	}

	private static List<String> ratingColumnsIn(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> RATING_COLUMNS.stream()
						.filter(column -> containsWholeWord(bytecode, column))
						.toList())
				.orElse(List.of());
	}

	/** The class's compiled bytes via its ArchUnit source URI — no hardcoded build paths; the
	 * same class set the other rules iterate. Empty for a class without a file source. */
	private static Optional<String> compiledBytecodeOf(JavaClass type) {
		return type.getSource()
				.map(Source::getUri)
				.filter(uri -> "file".equals(uri.getScheme()))
				.map(uri -> bytecode(Path.of(uri)));
	}

	/** Whole-word match: the token bounded by non-identifier characters, so a different
	 * identifier merely containing it (reset_availability, set_availability_audit) is not hit. */
	private static boolean containsWholeWord(String bytecode, String token) {
		int index = bytecode.indexOf(token);
		while (index >= 0) {
			char before = index == 0 ? '\0' : bytecode.charAt(index - 1);
			int end = index + token.length();
			char after = end >= bytecode.length() ? '\0' : bytecode.charAt(end);
			if (!isIdentifierChar(before) && !isIdentifierChar(after)) {
				return true;
			}
			index = bytecode.indexOf(token, index + 1);
		}
		return false;
	}

	private static boolean isIdentifierChar(char c) {
		return c == '_' || Character.isLetterOrDigit(c);
	}

	private static List<String> stripeReachViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (PAYMENT_MODULE.equals(moduleOf(type, base))) {
				continue; // payment's own Stripe use is the point; NoStripeConnect fences its shape
			}
			if (dependsOnStripe(type)) {
				violations.add(type.getName() + " depends on the Stripe SDK — com.stripe.. is "
						+ "importable only inside the payment module (RESPONSIBILITIES.md); other "
						+ "modules ask payment via its published ports/events, never Stripe directly");
			}
		}
		return violations;
	}

	private static boolean dependsOnStripe(JavaClass type) {
		for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
			String pkg = dependency.getTargetClass().getPackageName();
			if (pkg.equals(STRIPE_SDK_ROOT) || pkg.startsWith(STRIPE_SDK_ROOT + ".")) {
				return true;
			}
		}
		return false;
	}

	private static List<String> eventPayloadViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (!EVENTS_SURFACE.equals(surfaceOf(type, base)) || !type.isRecord()) {
				continue; // non-records in events/ are PublishedSurfacePlacement's concern
			}
			for (JavaField field : payloadFields(type)) {
				for (JavaClass involved : field.getType().getAllInvolvedRawTypes()) {
					if (!isIdOrValuePayload(involved, base)) {
						violations.add(type.getName() + "." + field.getName() + " involves "
								+ involved.getName() + " — an event payload carries only technical "
								+ "ids and values (primitives, java.* types, published vocabulary "
								+ "types — generics and arrays are unwrapped), never an aggregate or "
								+ "other internal type from domain/application/adapter (Need-To-Know, "
								+ "invariant #11 / RESPONSIBILITIES.md)");
					}
				}
			}
		}
		return violations;
	}

	/** A record's non-static fields are exactly its components; constants are not payload. */
	private static List<JavaField> payloadFields(JavaClass record) {
		return record.getFields().stream()
				.filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
				.toList();
	}

	private static boolean isIdOrValuePayload(JavaClass involved, String base) {
		if (involved.isPrimitive() || involved.getPackageName().startsWith(JDK_PACKAGE_PREFIX)) {
			return true;
		}
		return VOCABULARY_SURFACE.equals(surfaceOf(involved, base));
	}
}
