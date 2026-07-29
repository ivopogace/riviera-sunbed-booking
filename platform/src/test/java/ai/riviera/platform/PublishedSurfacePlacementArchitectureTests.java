package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.transaction.event.TransactionalEventListener;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;

import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.isPackageInfo;
import static ai.riviera.platform.ArchitectureTestSupport.moduleOf;
import static ai.riviera.platform.ArchitectureTestSupport.surfaceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Locks the <strong>published-surface placement</strong> convention (issue #95, improvement-plan
 * C1) — the machine-checkable half of {@code riviera-review-overlay} <strong>RV-BE-3c</strong>.
 * The published surface of a module is split by kind into distinct {@code @NamedInterface}
 * packages, and each kind of type may live only in its surface:
 * <ul>
 *   <li><strong>{@code api} / {@code spi}</strong> — ports only: plain (non-sealed) interfaces.
 *       A record, enum, class, or sealed outcome hierarchy here is the "{@code api} is becoming
 *       a domain package" drift this rule exists to stop;</li>
 *   <li><strong>{@code events}</strong> — published domain events only: records;</li>
 *   <li><strong>{@code vocabulary}</strong> — typed ids, value records, enums, sealed outcome
 *       hierarchies (+ their nested implementations) and published exceptions — but never a
 *       plain interface (a port hiding in the vocabulary surface).</li>
 * </ul>
 * Additionally, every <strong>transactional event listener</strong>'s parameter type owned by
 * <em>another</em> module must reside in that module's {@code events} surface — the semantic check
 * that a published event cannot creep back into {@code api}/{@code vocabulary}. "Transactional event
 * listener" means either spelling: the {@code @ApplicationModuleListener} composite, or the
 * {@code @Async} + {@code @TransactionalEventListener} expansion a listener must use when it needs to
 * name its own executor (#383). Keying on the composite alone left a hole — decomposing a listener
 * removed it from this rule with nothing going red.
 *
 * <p>There is no annotation taxonomy to match on, so the rules key off the package convention
 * (ADR-0007 + issue #95) and the class <em>kind</em>. Like its siblings
 * ({@link PackageShapeArchitectureTests}, {@link JdbcOnlyArchitectureTests}) this is fast,
 * context-free ArchUnit — no Spring, no DB.
 *
 * <p><strong>Deliberately stricter than {@code @NamedInterface} semantics:</strong> a named
 * interface covers only the annotated package, but these rules police the surface's whole
 * <em>subtree</em> ({@code surfaceOf} keys on the first segment below the module). A published
 * surface may not grow unpublished sub-packages of a different kind ({@code booking.events.support}
 * holding helpers would pass Modulith yet fail here) — if a type isn't the surface's kind, it
 * doesn't belong under that package at all.
 *
 * <p>The violation collectors are parameterized by base package so the negative cases (AC-4/AC-5)
 * are proven against the deliberately mis-shaped fixtures under
 * {@code ai.riviera.placementfixture} — never by breaking production code.
 */
class PublishedSurfacePlacementArchitectureTests {

	private static final String PRODUCTION_BASE = ArchitectureTestSupport.PRODUCTION_BASE;
	private static final String FIXTURE_BASE = "ai.riviera.placementfixture";

	private static final Set<String> PORT_SURFACES = Set.of("api", "spi");
	private static final String EVENTS_SURFACE = "events";
	private static final String VOCABULARY_SURFACE = "vocabulary";

	private static final JavaClasses PRODUCTION_CLASSES = ArchitectureTestSupport.PRODUCTION_CLASSES;

	/** The fixtures are test classes, so this import deliberately includes test code. */
	private static final JavaClasses FIXTURE_CLASSES = ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE);

	// ---- the production gates -------------------------------------------------------------

	@Test
	void portsSurfacesHoldOnlyNonSealedInterfaces() {
		List<String> violations = portsSurfaceViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations("Published-surface placement violations (ports surfaces (api/spi) hold only non-sealed interfaces)", violations);
	}

	@Test
	void eventsSurfacesHoldOnlyRecords() {
		List<String> violations = eventsSurfaceViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations("Published-surface placement violations (events surfaces hold only records)", violations);
	}

	@Test
	void vocabularySurfacesHoldNoPorts() {
		List<String> violations = vocabularySurfaceViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations("Published-surface placement violations (vocabulary surfaces hold no ports)", violations);
	}

	@Test
	void crossModuleListenedEventsResideInEventsSurfaces() {
		List<String> violations = listenerPlacementViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations("Published-surface placement violations (cross-module listened events reside in events surfaces)", violations);
	}

	/** Guards against a vacuously-green rule: the import must actually see all three surface kinds. */
	@Test
	void productionSurfacesWereInspected() {
		boolean sawPorts = false, sawEvents = false, sawVocabulary = false, sawListener = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			String surface = surfaceOf(type, PRODUCTION_BASE);
			sawPorts |= PORT_SURFACES.contains(surface);
			sawEvents |= EVENTS_SURFACE.equals(surface);
			sawVocabulary |= VOCABULARY_SURFACE.equals(surface);
			for (JavaMethod method : type.getMethods()) {
				sawListener |= isTransactionalEventListener(method);
			}
		}
		assertTrue(sawPorts && sawEvents && sawVocabulary && sawListener,
				"Expected the production import to contain api/spi, events and vocabulary surfaces and at "
						+ "least one transactional event listener (either spelling) — otherwise these rules "
						+ "are vacuously green.");
	}

	// ---- the negative proof (AC-4/AC-5), against fixtures ---------------------------------

	@Test
	void recordInPortsSurfaceIsRejected() {
		List<String> violations = portsSurfaceViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream()
						.anyMatch(v -> v.contains("EventRecordInPorts") && v.contains("is not an interface")),
				"Expected the ports-surface rule to reject a record placed in api/, but got: " + violations);
	}

	@Test
	void sealedInterfaceInPortsSurfaceIsRejected() {
		// Matches the sealed-specific message so the nested fixture record (SealedOutcomeInPorts.Ok,
		// caught by the not-an-interface branch) cannot make this negative proof vacuously green.
		List<String> violations = portsSurfaceViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream()
						.anyMatch(v -> v.contains("SealedOutcomeInPorts") && v.contains("is a sealed interface")),
				"Expected the ports-surface rule to reject a sealed outcome hierarchy in api/, but got: "
						+ violations);
	}

	@Test
	void nonRecordInEventsSurfaceIsRejected() {
		List<String> violations = eventsSurfaceViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("NotARecordEvent")),
				"Expected the events-surface rule to reject a non-record event, but got: " + violations);
	}

	@Test
	void portInVocabularySurfaceIsRejected() {
		List<String> violations = vocabularySurfaceViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("PortInVocabulary")),
				"Expected the vocabulary-surface rule to reject a plain interface (port), but got: "
						+ violations);
	}

	@Test
	void eventListenedFromOutsideEventsSurfaceIsRejected() {
		List<String> violations = listenerPlacementViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("BadListener")),
				"Expected the listener rule to reject a cross-module event living outside events/, but got: "
						+ violations);
	}

	/**
	 * The same rejection for a listener written as {@code @Async} + {@code @TransactionalEventListener}
	 * rather than the {@code @ApplicationModuleListener} composite. A listener takes that form when it
	 * must name its own executor — the composite accepts no qualifier — which is how #383 kept mail off
	 * the money-path pool. Until then this rule matched the composite alone, so decomposing a listener
	 * silently removed it from the rule's reach: nothing went red, the check simply stopped applying.
	 */
	@Test
	void eventListenedFromOutsideEventsSurfaceIsRejectedForADecomposedListenerToo() {
		List<String> violations = listenerPlacementViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("BadDecomposedListener")),
				"Expected the listener rule to reach a decomposed @Async + @TransactionalEventListener "
						+ "listener, not just the @ApplicationModuleListener composite, but got: " + violations);
	}

	// ---- violation collectors (pure functions of the imported classes) --------------------

	private static List<String> portsSurfaceViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (!PORT_SURFACES.contains(surfaceOf(type, base)) || isPackageInfo(type)) {
				continue;
			}
			if (!type.isInterface()) {
				violations.add(type.getName() + " is not an interface — a ports surface (api/spi) holds "
						+ "\"call-me\"/\"implement-me\" interfaces only; typed ids and value records belong in "
						+ "vocabulary/, published events in events/ (issue #95)");
			}
			else if (type.reflect().isSealed()) {
				violations.add(type.getName() + " is a sealed interface — sealed outcome hierarchies are "
						+ "published vocabulary, not ports; move it to vocabulary/ (issue #95)");
			}
		}
		return violations;
	}

	private static List<String> eventsSurfaceViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (!EVENTS_SURFACE.equals(surfaceOf(type, base)) || isPackageInfo(type)) {
				continue;
			}
			if (!type.isRecord()) {
				violations.add(type.getName() + " is not a record — an events surface holds published "
						+ "domain-event records only (id-based payloads, invariant #11 / issue #95)");
			}
		}
		return violations;
	}

	private static List<String> vocabularySurfaceViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (!VOCABULARY_SURFACE.equals(surfaceOf(type, base)) || isPackageInfo(type)) {
				continue;
			}
			if (type.isInterface() && !type.isAnnotation() && !type.reflect().isSealed()) {
				violations.add(type.getName() + " is a plain interface — a port must not hide in the "
						+ "vocabulary surface; \"call-me\" ports live in api/, cross-module driven ports in "
						+ "spi/ (issue #95)");
			}
		}
		return violations;
	}

	/**
	 * Both spellings of the same thing: the {@code @ApplicationModuleListener} composite and its
	 * {@code @TransactionalEventListener} expansion. ArchUnit's meta-annotation lookup does not include
	 * directly-declared annotations, so both checks are needed.
	 */
	private static boolean isTransactionalEventListener(JavaMethod method) {
		return method.isAnnotatedWith(ApplicationModuleListener.class)
				|| method.isAnnotatedWith(TransactionalEventListener.class)
				|| method.isMetaAnnotatedWith(TransactionalEventListener.class);
	}

	private static List<String> listenerPlacementViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			for (JavaMethod method : type.getMethods()) {
				if (!isTransactionalEventListener(method)) {
					continue;
				}
				for (JavaClass parameter : method.getRawParameterTypes()) {
					String listenerModule = moduleOf(type, base);
					String ownerModule = moduleOf(parameter, base);
					if (ownerModule == null || ownerModule.equals(listenerModule)) {
						continue; // foreign or intra-module event — not this rule's concern
					}
					if (!EVENTS_SURFACE.equals(surfaceOf(parameter, base))) {
						violations.add(method.getFullName() + " listens to " + parameter.getName()
								+ ", which lives outside its owner module's events surface — a published "
								+ "event consumed cross-module belongs in <module>/events (issue #95)");
					}
				}
			}
		}
		return violations;
	}

}
