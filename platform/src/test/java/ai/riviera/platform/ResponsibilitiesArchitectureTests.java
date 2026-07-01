package ai.riviera.platform;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaModifier;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Encodes the <strong>machine-checkable half of {@code RESPONSIBILITIES.md}</strong> as fitness
 * functions (issue #96, improvement-plan C4) — the structural subset of the Job / Not-My-Job
 * boundaries that an illegal import or a stray SQL string would betray:
 * <ol>
 *   <li><strong>Sole-writer:</strong> no class outside the {@code availability} module touches
 *       the {@code set_availability} table — the mechanical form of "availability is the only
 *       writer of that table" (invariant #2). Detected by scanning compiled bytecode for the
 *       table name (the {@code NoStripeConnectArchitectureTest} mechanism), because a
 *       class-location convention cannot see SQL. Deliberately stronger than "writer": ANY
 *       reference (read or write) outside the module fails — cross-module reads go through
 *       availability's published ports too (invariant #11), never straight at its table.</li>
 *   <li><strong>No forbidden reach:</strong> the Stripe SDK ({@code com.stripe..}) is importable
 *       only inside {@code payment}. {@code ApplicationModules.verify()} polices module-internal
 *       package reach; this adds the third-party-SDK boundary it cannot see. (Which Stripe APIs
 *       payment itself may use — no Connect — stays {@code NoStripeConnectArchitectureTest}'s job.)</li>
 *   <li><strong>Id-based events:</strong> every record in an {@code events} named interface
 *       carries only id/value payloads — each non-static field is a primitive, a {@code java.*}
 *       type, or a published {@code vocabulary} type; never an aggregate from any {@code domain}
 *       package (the Need-To-Know half of invariant #11).</li>
 * </ol>
 *
 * <p><strong>Necessary, not sufficient.</strong> These rules encode only the <em>structural</em>
 * half of {@code RESPONSIBILITIES.md}. The <em>semantic</em> half — a refund <em>policy</em>
 * reimplemented inside {@code payment}, commission <em>math</em> inside {@code venue} — needs no
 * illegal import or stray table name and <em>cannot</em> be machine-checked; it remains the job
 * of the plan-time Module-ownership table and review item RV-BE-11. A green run here must never
 * be read as "boundaries fully enforced." (Known scan limitation, same trade-off as
 * {@code NoStripeConnectArchitectureTest}: rule 1 keys on the contiguous table name in the
 * constant pool — SQL assembled by concatenation that splits the name would evade it; the
 * project's text-block-SQL idiom keeps names contiguous.)
 *
 * <p>The violation collectors are parameterized by class-tree root / base package so the negative
 * cases are proven against the deliberately-violating fixtures under
 * {@code ai.riviera.responsibilityfixture} — never by breaking production code. Fast and
 * context-free like its siblings ({@link PackageShapeArchitectureTests},
 * {@link PublishedSurfacePlacementArchitectureTests}): no Spring, no DB.
 */
class ResponsibilitiesArchitectureTests {

	/** The per-(set, date) source-of-truth table owned by {@code availability} (invariant #2). */
	private static final String AVAILABILITY_TABLE = "set_availability";

	/** The module directory that owns {@link #AVAILABILITY_TABLE} within a scanned class tree. */
	private static final String AVAILABILITY_MODULE_DIR = "availability";

	private static final Path PRODUCTION_CLASS_ROOT =
			Path.of("build/classes/java/main/ai/riviera/platform");

	private static final Path FIXTURE_CLASS_ROOT =
			Path.of("build/classes/java/test/ai/riviera/responsibilityfixture");

	private static final String FIXTURE_BASE = "ai.riviera.responsibilityfixture";

	/** The one module that may touch the Stripe SDK (RESPONSIBILITIES.md / ADR-0002). */
	private static final String PAYMENT_MODULE = "payment";

	private static final String STRIPE_SDK_PACKAGE_PREFIX = "com.stripe";

	private static final String EVENTS_SURFACE = "events";
	private static final String VOCABULARY_SURFACE = "vocabulary";
	private static final String JDK_PACKAGE_PREFIX = "java.";

	private static final JavaClasses PRODUCTION_CLASSES = ArchitectureTestSupport.PRODUCTION_CLASSES;

	private static final JavaClasses FIXTURE_CLASSES =
			ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE);

	// ---- rule 1: availability is the sole writer (sole toucher) of set_availability ---------

	@Test
	void availabilityTableIsTouchedOnlyInsideTheAvailabilityModule() throws IOException {
		List<String> violations = availabilityTableReferencesOutsideOwner(PRODUCTION_CLASS_ROOT);
		assertNoViolations("availability sole-writer (invariant #2)", violations);
	}

	/** Guards against a vacuously-green scan: availability's own classes DO carry the table name. */
	@Test
	void theAvailabilityModuleItselfWritesTheTable() throws IOException {
		Path owner = PRODUCTION_CLASS_ROOT.resolve(AVAILABILITY_MODULE_DIR);
		assertTrue(Files.isDirectory(owner), "availability module classes not found at "
				+ owner.toAbsolutePath() + " — run the test task so compileJava runs first");
		try (Stream<Path> classes = Files.walk(owner)) {
			assertTrue(classes.filter(p -> p.toString().endsWith(".class"))
							.anyMatch(p -> bytecode(p).contains(AVAILABILITY_TABLE)),
					"expected at least one availability class to reference '" + AVAILABILITY_TABLE
							+ "' — otherwise the sole-writer scan proves nothing");
		}
	}

	/** The negative proof (red run): an outside class carrying the table's SQL is rejected. */
	@Test
	void outsideWriterFixtureIsRejected() throws IOException {
		List<String> violations = availabilityTableReferencesOutsideOwner(FIXTURE_CLASS_ROOT);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueAvailabilityWriter")),
				"Expected the sole-writer scan to reject the fixture outside writer, but got: "
						+ violations);
	}

	// ---- rule 2: the Stripe SDK is reachable only inside the payment module ----------------

	@Test
	void stripeSdkIsReachableOnlyInsideThePaymentModule() {
		List<String> violations =
				stripeReachViolations(PRODUCTION_CLASSES, ArchitectureTestSupport.PRODUCTION_BASE);
		assertNoViolations("Stripe SDK only inside payment (RESPONSIBILITIES.md)", violations);
	}

	/** Guards against a vacuously-green rule: payment's own adapters DO depend on Stripe. */
	@Test
	void thePaymentModuleItselfUsesStripe() {
		boolean paymentUsesStripe = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (PAYMENT_MODULE.equals(
					ArchitectureTestSupport.moduleOf(type, ArchitectureTestSupport.PRODUCTION_BASE))
					&& dependsOnStripe(type)) {
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
		List<String> violations =
				eventPayloadViolations(PRODUCTION_CLASSES, ArchitectureTestSupport.PRODUCTION_BASE);
		assertNoViolations("id-based event payloads (invariant #11)", violations);
	}

	/** Guards against a vacuously-green rule: the import must see event records exercising
	 * every allowed payload kind (primitive, {@code java.*}, vocabulary). */
	@Test
	void eventSurfacesWereInspected() {
		boolean sawEventRecord = false, sawPrimitive = false, sawJdkType = false, sawVocabulary = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (!EVENTS_SURFACE.equals(
					ArchitectureTestSupport.surfaceOf(type, ArchitectureTestSupport.PRODUCTION_BASE))
					|| !type.isRecord()) {
				continue;
			}
			sawEventRecord = true;
			for (JavaField field : payloadFields(type)) {
				JavaClass raw = field.getRawType();
				sawPrimitive |= raw.isPrimitive();
				sawJdkType |= raw.getPackageName().startsWith(JDK_PACKAGE_PREFIX);
				sawVocabulary |= VOCABULARY_SURFACE.equals(ArchitectureTestSupport.surfaceOf(
						raw, ArchitectureTestSupport.PRODUCTION_BASE));
			}
		}
		assertTrue(sawEventRecord && sawPrimitive && sawJdkType && sawVocabulary,
				"Expected the production import to contain event records with primitive, java.* "
						+ "and vocabulary payload components — otherwise the id-based-events rule "
						+ "is vacuously green.");
	}

	/** The negative proof (red run): an event record carrying a domain aggregate is rejected —
	 * and its legitimate id/primitive components are NOT (the allow path works). */
	@Test
	void aggregateCarryingEventFixtureIsRejected() {
		List<String> violations = eventPayloadViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream()
						.anyMatch(v -> v.contains("AggregateCarryingEvent") && v.contains("FakeAggregate")),
				"Expected the id-based-events rule to reject the aggregate-carrying fixture event, "
						+ "but got: " + violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureId")),
				"The fixture event's legitimate vocabulary-typed id must not be flagged, but got: "
						+ violations);
	}

	// ---- violation collectors (parameterized so fixtures prove the red case) ---------------

	private static List<String> availabilityTableReferencesOutsideOwner(Path classRoot) throws IOException {
		assertTrue(Files.isDirectory(classRoot), "compiled classes not found at "
				+ classRoot.toAbsolutePath() + " — run the test task so compilation runs first");
		Path owner = classRoot.resolve(AVAILABILITY_MODULE_DIR);
		List<String> violations = new ArrayList<>();
		try (Stream<Path> classes = Files.walk(classRoot)) {
			classes.filter(p -> p.toString().endsWith(".class"))
					.filter(p -> !p.startsWith(owner))
					.filter(p -> bytecode(p).contains(AVAILABILITY_TABLE))
					.forEach(p -> violations.add(classRoot.relativize(p) + " references the '"
							+ AVAILABILITY_TABLE + "' table — the availability module is its only "
							+ "writer AND reader (invariant #2 / RESPONSIBILITIES.md); other modules "
							+ "go through availability's published ports (api/spi), never at the table"));
		}
		return violations;
	}

	private static List<String> stripeReachViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (PAYMENT_MODULE.equals(ArchitectureTestSupport.moduleOf(type, base))) {
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
			if (dependency.getTargetClass().getPackageName().startsWith(STRIPE_SDK_PACKAGE_PREFIX)) {
				return true;
			}
		}
		return false;
	}

	private static List<String> eventPayloadViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (!EVENTS_SURFACE.equals(ArchitectureTestSupport.surfaceOf(type, base))
					|| !type.isRecord()) {
				continue; // non-records in events/ are PublishedSurfacePlacement's concern
			}
			for (JavaField field : payloadFields(type)) {
				JavaClass raw = field.getRawType();
				if (!isIdOrValuePayload(raw, base)) {
					violations.add(type.getName() + "." + field.getName() + " is a " + raw.getName()
							+ " — an event payload carries only technical ids and values (a primitive, "
							+ "a java.* type, or a published vocabulary type), never an aggregate or "
							+ "other internal type from domain/application/adapter (Need-To-Know, "
							+ "invariant #11 / RESPONSIBILITIES.md)");
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

	private static boolean isIdOrValuePayload(JavaClass raw, String base) {
		if (raw.isPrimitive() || raw.getPackageName().startsWith(JDK_PACKAGE_PREFIX)) {
			return true;
		}
		return VOCABULARY_SURFACE.equals(ArchitectureTestSupport.surfaceOf(raw, base));
	}

	/** ISO-8859-1: read raw bytes 1:1 so constant-pool UTF-8 symbols match as substrings. */
	private static String bytecode(Path classFile) {
		try {
			return new String(Files.readAllBytes(classFile), StandardCharsets.ISO_8859_1);
		}
		catch (IOException e) {
			throw new IllegalStateException("could not read " + classFile, e);
		}
	}

	private static void assertNoViolations(String ruleName, List<String> violations) {
		assertTrue(violations.isEmpty(),
				"RESPONSIBILITIES.md fitness-function violations (" + ruleName + "):\n  "
						+ String.join("\n  ", violations));
	}
}
