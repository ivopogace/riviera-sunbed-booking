package ai.riviera.platform;

import java.lang.reflect.Array;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.ApplicationModule;
import org.springframework.modulith.Modulithic;
import org.springframework.modulith.NamedInterface;

import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.lang.ArchRule;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.isPackageInfo;
import static ai.riviera.platform.ArchitectureTestSupport.moduleOf;
import static ai.riviera.platform.ArchitectureTestSupport.moduleRelativeSegments;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Locks the two-template package layout so the shape cannot regress — the machine-checkable
 * (structural) half of {@code riviera-review-overlay} <strong>RV-BE-12</strong>. The templates
 * themselves are invariant #11 and ADR-0007; which modules are full or thin <em>today</em> is a
 * census that goes stale, so it is deliberately not restated here — {@code riviera-modulith} keeps
 * it. A fast, context-free ArchUnit test (sibling to {@link JdbcOnlyArchitectureTests} /
 * {@link ModularityTests} — no Spring context, no DB, runs anywhere).
 *
 * <p><strong>{@code domain} is optional, and that is not a loophole.</strong> A module may own
 * table-backed state without owning an aggregate, so it has no {@code domain} package — full is
 * defined by <em>having an application service</em>, not by using every package. This is the one
 * reconciliation between the allowed-set below and invariant #11's unqualified spelling.
 *
 * <p>The <em>thin-vs-full judgment</em> (whether a serviceless module should stay thin or graduate)
 * and the <em>use-case-slicing</em> call (booking's {@code application/{reserve,request,cancel,checkin,refund,view,remodel}})
 * are deliberately <strong>review-only</strong>, so this rule keys on the module-agnostic
 * <strong>union</strong> allowed-set {@code {api, spi, vocabulary, events, application, domain,
 * adapter}}, never on a per-module classification. Which <em>kind</em> of type may live in which
 * published surface is {@link PublishedSurfacePlacementArchitectureTests}' job.
 *
 * <p>Root-level platform config ({@code PlatformApplication} and its configuration) sits directly under
 * {@code ai.riviera.platform} and is <strong>not</strong> a module — it is excluded from the package-shape
 * assertions. What the root may <em>reach</em> is {@link CompositionRootDisciplineTests}' job. The
 * {@code shared} kernel matches neither template deliberately — flat classes at the module root, no
 * published surface — so it is the one module whose root may hold types: a module registered in
 * {@code @Modulithic(sharedModules)} is exempt from the module-root rule, every other module is not.
 *
 * <p>Every collector takes its base package as a parameter, so each rule is proven to fail against the
 * deliberately mis-shaped fixtures under {@code ai.riviera.packageshapefixture} — never by breaking
 * production code.
 */
class PackageShapeArchitectureTests {

	private static final String FIXTURE_BASE = "ai.riviera.packageshapefixture";

	/**
	 * The top-level package set any module may use; a thin module uses the subset
	 * {@code {api, vocabulary, adapter}}. Which kind of type belongs in which published surface is
	 * enforced by {@link PublishedSurfacePlacementArchitectureTests}.
	 */
	private static final Set<String> ALLOWED_TOP_LEVEL =
			Set.of("api", "spi", "vocabulary", "events", "application", "domain", "adapter");

	/** The immediate children the adapter layer may have — direction, never technology (ADR-0007 sub-decision 1). */
	private static final Set<String> ALLOWED_ADAPTER_CHILDREN = Set.of("in", "out");

	/** The {@code @NamedInterface} packages, which must appear only as a direct child of a module. */
	private static final Set<String> NAMED_INTERFACE_PACKAGES = Set.of("api", "spi", "vocabulary", "events");

	/** The one shared kernel ADR-0007 admits. */
	private static final String SHARED_KERNEL = "shared";

	/** The module roots that may hold types: what the application registers in {@code @Modulithic(sharedModules)}. */
	private static final Set<String> PRODUCTION_SHARED_MODULES =
			Set.of(PlatformApplication.class.getAnnotation(Modulithic.class).sharedModules());

	private static final Set<String> FIXTURE_SHARED_MODULES = Set.of("shared");

	private static final JavaClasses PRODUCTION_CLASSES = ArchitectureTestSupport.PRODUCTION_CLASSES;

	/** The fixtures are test classes, so this import deliberately includes test code. */
	private static final JavaClasses FIXTURE_CLASSES = ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE);

	// ---- the production gates -------------------------------------------------------------

	/**
	 * Assertion 1 — allowed top-level package set (ADR-0007). Each module's top-level packages (the
	 * segment directly under {@code ai.riviera.platform.<module>}) must be in
	 * {@code {api, spi, vocabulary, events, application, domain, adapter}} — fails a lingering {@code infrastructure/} — AND
	 * no class may sit in {@code <module>.application.in} / {@code .application.out}: the application-layer
	 * {@code in}/{@code out} split was folded away (sub-decision 2), direction now lives at the adapter layer.
	 */
	@Test
	void moduleTopLevelPackagesAreInTheAllowedSet() {
		assertInspected("modules", modulesOf(PRODUCTION_CLASSES, PRODUCTION_BASE));
		assertNoViolations("ADR-0007 package-shape violations (allowed top-level package set)",
				topLevelPackageViolations(PRODUCTION_CLASSES, PRODUCTION_BASE));
	}

	/**
	 * Assertion 2 — the adapter layer is split by <em>direction</em>, not technology (ADR-0007
	 * sub-decision 1). Under {@code <module>.adapter} the immediate child must be {@code in} or
	 * {@code out}; technology, if ever needed, nests <em>below</em> ({@code adapter/in/rest}). Fails a
	 * top-level {@code adapter/rest} | {@code adapter/jdbc} | {@code adapter/event}, or a class placed
	 * directly in {@code adapter}.
	 */
	@Test
	void adapterLayerIsSplitByDirectionNotTechnology() {
		assertInspected("adapter layers", topLevelPackages(PRODUCTION_CLASSES, PRODUCTION_BASE, Set.of("adapter")));
		assertNoViolations("ADR-0007 package-shape violations (adapter direction split)",
				adapterDirectionViolations(PRODUCTION_CLASSES, PRODUCTION_BASE));
	}

	/**
	 * Assertion 3 — the {@code @NamedInterface} packages ({@code api} / {@code spi} /
	 * {@code vocabulary} / {@code events}) are top-level (ADR-0007).
	 * Each must be a direct child of the module, never nested (no {@code application.api},
	 * {@code adapter.in.events}, …) — Spring Modulith would still find a nested one, but the placement and
	 * purity rules key on the segment under the module and would not check it; and the four names are
	 * reserved for published surfaces even as internal package names.
	 */
	@Test
	void namedInterfacePackagesAreTopLevel() {
		assertInspected("modules", modulesOf(PRODUCTION_CLASSES, PRODUCTION_BASE));
		assertNoViolations("ADR-0007 package-shape violations (api/spi/vocabulary/events are top-level)",
				nestedNamedInterfaceViolations(PRODUCTION_CLASSES, PRODUCTION_BASE));
	}

	/**
	 * Assertion 4 — hexagon direction. The inside ({@code application} + {@code domain}) must not depend
	 * on the outside ({@code adapter.*}); adapters depend inward on the application/domain, never the
	 * reverse (Cockburn's inside/outside asymmetry, ADR-0007).
	 */
	@Test
	void applicationAndDomainDoNotDependOnAdapters() {
		hexagonDirection(PRODUCTION_BASE).check(PRODUCTION_CLASSES);
	}

	/**
	 * Assertion 5 — only a registered shared module has types directly in its module root (ADR-0007's
	 * {@code shared} allowance). Any other module keeps its types in its template packages; a
	 * {@code package-info} at the root is the module's declaration, not a type.
	 */
	@Test
	void onlySharedKernelsHaveTypesAtTheModuleRoot() {
		assertInspected("modules", modulesOf(PRODUCTION_CLASSES, PRODUCTION_BASE));
		assertInspected("shared modules registered in @Modulithic(sharedModules)", PRODUCTION_SHARED_MODULES);
		assertNoViolations("ADR-0007 package-shape violations (types at a module root)",
				moduleRootTypeViolations(PRODUCTION_CLASSES, PRODUCTION_BASE, PRODUCTION_SHARED_MODULES));
	}

	/**
	 * Assertion 5a — {@code shared} is the only module registered in {@code @Modulithic(sharedModules)}:
	 * a second registration would escape assertion 5 and every grant (ADR-0007, amended 2026-10-02 by PR #1351).
	 */
	@Test
	void sharedIsTheOnlyRegisteredSharedModule() {
		assertNoViolations("ADR-0007 shared-kernel violations (@Modulithic(sharedModules))",
				sharedModuleRegistrationViolations(PRODUCTION_SHARED_MODULES));
	}

	/**
	 * Assertion 6 — every top-level {@code api}/{@code spi}/{@code vocabulary}/{@code events} package
	 * declares itself with {@code @NamedInterface("<its simple name>")}, so the grant
	 * {@code <module>::<name>} means the package of that name (ADR-0007).
	 */
	@Test
	void publishedSurfacesDeclareTheirOwnNamedInterface() {
		assertInspected("published surfaces",
				topLevelPackages(PRODUCTION_CLASSES, PRODUCTION_BASE, NAMED_INTERFACE_PACKAGES));
		assertNoViolations("ADR-0007 package-shape violations (@NamedInterface declarations)",
				namedInterfaceDeclarationViolations(PRODUCTION_CLASSES, PRODUCTION_BASE));
	}

	/**
	 * Assertion 7 — every module declares {@code @ApplicationModule(allowedDependencies = ...)}
	 * explicitly. Left out, the attribute's default allows every dependency and {@code verify()} checks
	 * no grant; {@code {}} is an explicit declaration.
	 */
	@Test
	void everyModuleDeclaresItsAllowedDependencies() {
		assertInspected("modules", modulesOf(PRODUCTION_CLASSES, PRODUCTION_BASE));
		assertNoViolations("Modulith grant violations (allowedDependencies left at its allow-all default)",
				allowedDependenciesViolations(PRODUCTION_CLASSES, PRODUCTION_BASE));
	}

	// ---- the negative proof, against fixtures ---------------------------------------------

	@Test
	void topLevelPackageOutsideTheAllowedSetIsRejected() {
		List<String> violations = topLevelPackageViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertReported(violations, "LingeringInfrastructure", "outside the allowed set");
		assertReported(violations, "FoldedInPort", "folded application/in split");
		assertCleanModulesUnreported(violations);
	}

	@Test
	void adapterLayerSplitByTechnologyIsRejected() {
		List<String> violations = adapterDirectionViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertReported(violations, "AdapterAtLayerRoot", "sits directly in adapter/");
		assertReported(violations, "TechnologySplitController", "sits in adapter/rest");
		assertCleanModulesUnreported(violations);
	}

	@Test
	void nestedNamedInterfacePackageIsRejected() {
		List<String> violations = nestedNamedInterfaceViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertReported(violations, "NestedEvent", "nests a 'events' package");
		assertCleanModulesUnreported(violations);
	}

	@Test
	void applicationDependingOnAnAdapterIsRejected() {
		List<String> violations = hexagonDirection(FIXTURE_BASE).evaluate(FIXTURE_CLASSES)
				.getFailureReport().getDetails();
		assertReported(violations, "ServiceReachingOut", "DrivenAdapter");
		assertCleanModulesUnreported(violations);
	}

	@Test
	void typeAtANonSharedModuleRootIsRejected() {
		List<String> violations = moduleRootTypeViolations(FIXTURE_CLASSES, FIXTURE_BASE, FIXTURE_SHARED_MODULES);
		assertReported(violations, "RootLevelHelper", "directly in the module root");
		assertTrue(violations.stream().noneMatch(v -> v.contains("KernelType")),
				"Expected the registered shared module's root type to pass, but got: " + violations);
		assertCleanModulesUnreported(violations);
	}

	@Test
	void aSecondRegisteredSharedModuleIsRejected() {
		assertReported(sharedModuleRegistrationViolations(Set.of("shared", "booking")),
				"[booking, shared]", "must be exactly [shared]");
		assertReported(sharedModuleRegistrationViolations(Set.of()), "[]", "must be exactly [shared]");
		assertTrue(sharedModuleRegistrationViolations(Set.of("shared")).isEmpty(),
				"Expected the registration {\"shared\"} to pass");
	}

	@Test
	void publishedSurfaceWithoutItsNamedInterfaceIsRejected() {
		List<String> violations = namedInterfaceDeclarationViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertReported(violations, "unnamed.api", "no @NamedInterface");
		assertReported(violations, "misnamed.spi", "@NamedInterface named [api]");
		assertCleanModulesUnreported(violations);
	}

	@Test
	void moduleLeftAtTheAllowAllDefaultIsRejected() {
		List<String> violations = allowedDependenciesViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertReported(violations, "openmodule", "does not declare allowedDependencies");
		assertReported(violations, "unannotated", "no @ApplicationModule");
		assertCleanModulesUnreported(violations);
	}

	// ---- the collectors, parameterised by base package ------------------------------------

	private static List<String> topLevelPackageViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			String[] sub = moduleRelativeSegments(type, base);
			if (sub == null || sub.length == 0) {
				continue;
			}
			if (!ALLOWED_TOP_LEVEL.contains(sub[0])) {
				violations.add(type.getName() + " sits in top-level package '" + sub[0]
						+ "', outside the allowed set " + new TreeSet<>(ALLOWED_TOP_LEVEL));
			}
			if (sub.length >= 2 && "application".equals(sub[0]) && ALLOWED_ADAPTER_CHILDREN.contains(sub[1])) {
				violations.add(type.getName() + " reintroduces the folded application/" + sub[1]
						+ " split — internal ports live in application/ next to their service; "
						+ "direction lives at the adapter layer (ADR-0007 sub-decision 2)");
			}
		}
		return violations;
	}

	private static List<String> adapterDirectionViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			String[] sub = moduleRelativeSegments(type, base);
			if (sub == null || sub.length == 0 || !"adapter".equals(sub[0])) {
				continue;
			}
			if (sub.length < 2) {
				violations.add(type.getName() + " sits directly in adapter/ — a driving/driven adapter "
						+ "belongs in adapter/in or adapter/out (ADR-0007)");
			}
			else if (!ALLOWED_ADAPTER_CHILDREN.contains(sub[1])) {
				violations.add(type.getName() + " sits in adapter/" + sub[1]
						+ " — the adapter layer splits by direction (in/out), not technology; "
						+ "technology nests below, e.g. adapter/in/rest (ADR-0007 sub-decision 1)");
			}
		}
		return violations;
	}

	private static List<String> nestedNamedInterfaceViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			String[] sub = moduleRelativeSegments(type, base);
			if (sub == null) {
				continue;
			}
			for (int i = 1; i < sub.length; i++) { // i == 0 is the legitimate top-level position
				if (NAMED_INTERFACE_PACKAGES.contains(sub[i])) {
					violations.add(type.getName() + " nests a '" + sub[i] + "' package below the module root — "
							+ "api/spi/vocabulary/events are reserved top-level @NamedInterface package names, "
							+ "never nested (ADR-0007 + issue #95)");
				}
			}
		}
		return violations;
	}

	private static ArchRule hexagonDirection(String base) {
		return noClasses()
				.that().resideInAnyPackage(base + "..application..", base + "..domain..")
				.should().dependOnClassesThat().resideInAnyPackage(base + "..adapter..")
				.because("the hexagon runs adapter -> application/domain, never back: the inside "
						+ "(application + domain) must not depend on the outside (adapter.*) (ADR-0007).");
	}

	private static List<String> moduleRootTypeViolations(JavaClasses classes, String base, Set<String> sharedModules) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			String[] sub = moduleRelativeSegments(type, base);
			if (sub == null || sub.length != 0 || isPackageInfo(type)
					|| sharedModules.contains(moduleOf(type, base))) {
				continue;
			}
			violations.add(type.getName() + " sits directly in the module root — only a shared kernel registered in "
					+ "@Modulithic(sharedModules) " + new TreeSet<>(sharedModules) + " keeps types there; "
					+ "everything else lives in the template packages (ADR-0007)");
		}
		return violations;
	}

	private static List<String> namedInterfaceDeclarationViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (String surface : topLevelPackages(classes, base, NAMED_INTERFACE_PACKAGES)) {
			String simpleName = surface.substring(surface.lastIndexOf('.') + 1);
			Optional<JavaAnnotation<JavaClass>> namedInterface =
					packageAnnotation(classes, surface, NamedInterface.class);
			if (namedInterface.isEmpty()) {
				violations.add(surface + " has no @NamedInterface package-info — a published surface declares "
						+ "@NamedInterface(\"" + simpleName + "\") (ADR-0007)");
				continue;
			}
			Set<String> names = new TreeSet<>(stringValues(namedInterface.get(), "value"));
			names.addAll(stringValues(namedInterface.get(), "name"));
			if (!names.equals(Set.of(simpleName))) {
				violations.add(surface + " carries a @NamedInterface named " + names + " — it must be exactly ["
						+ simpleName + "], the package's simple name (ADR-0007)");
			}
		}
		return violations;
	}

	private static List<String> sharedModuleRegistrationViolations(Set<String> registered) {
		List<String> violations = new ArrayList<>();
		if (!registered.equals(Set.of(SHARED_KERNEL))) {
			violations.add("@Modulithic(sharedModules) registers " + new TreeSet<>(registered) + " — it must be exactly ["
					+ SHARED_KERNEL + "]: a registered module escapes the module-root rule and every allowedDependencies "
					+ "grant, and the flat, surface-less shape is shared's alone (ADR-0007, amended 2026-10-02 by PR #1351); a "
					+ "second shared kernel needs an ADR amendment, not a silent registration");
		}
		return violations;
	}

	private static List<String> allowedDependenciesViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (String module : modulesOf(classes, base)) {
			String modulePackage = base + "." + module;
			Optional<JavaAnnotation<JavaClass>> applicationModule =
					packageAnnotation(classes, modulePackage, ApplicationModule.class);
			if (applicationModule.isEmpty()) {
				violations.add(modulePackage + " has no @ApplicationModule package-info — its allowedDependencies "
						+ "default to allow-all, so verify() checks no grant");
			}
			else if (!applicationModule.get().hasExplicitlyDeclaredProperty("allowedDependencies")) {
				violations.add(modulePackage + " does not declare allowedDependencies — the default allows every "
						+ "dependency; declare its grants, or {} for none");
			}
		}
		return violations;
	}

	// ---- helpers ---------------------------------------------------------------------------

	private static Set<String> modulesOf(JavaClasses classes, String base) {
		Set<String> modules = new TreeSet<>();
		for (JavaClass type : classes) {
			String module = moduleOf(type, base);
			if (module != null) {
				modules.add(module);
			}
		}
		return modules;
	}

	/** The {@code <base>.<module>.<name>} packages, for each top-level package whose simple name is in {@code names}. */
	private static Set<String> topLevelPackages(JavaClasses classes, String base, Set<String> names) {
		Set<String> packages = new TreeSet<>();
		for (JavaClass type : classes) {
			String[] sub = moduleRelativeSegments(type, base);
			if (sub != null && sub.length >= 1 && names.contains(sub[0])) {
				packages.add(base + "." + moduleOf(type, base) + "." + sub[0]);
			}
		}
		return packages;
	}

	/** Guards a production gate against a vacuously-green run: the import must have fed it candidates. */
	private static void assertInspected(String what, Set<String> seen) {
		assertFalse(seen.isEmpty(), "No " + what + " found under " + PRODUCTION_BASE
				+ " — the rule would be vacuously green; check the ClassFileImporter package/import options.");
	}

	/** The annotation on {@code pkg}'s {@code package-info}; empty when javac emitted none (an unannotated package). */
	private static Optional<JavaAnnotation<JavaClass>> packageAnnotation(
			JavaClasses classes, String pkg, Class<?> annotationType) {
		String packageInfo = pkg + ".package-info";
		if (!classes.contain(packageInfo)) {
			return Optional.empty();
		}
		return classes.get(packageInfo).tryGetAnnotationOfType(annotationType.getName());
	}

	/** An annotation property's explicit string value(s), single or array; empty when not declared. */
	private static List<String> stringValues(JavaAnnotation<?> annotation, String property) {
		List<String> values = new ArrayList<>();
		if (!annotation.hasExplicitlyDeclaredProperty(property)) {
			return values;
		}
		Object value = annotation.get(property).orElseThrow();
		if (value.getClass().isArray()) {
			for (int i = 0; i < Array.getLength(value); i++) {
				values.add(String.valueOf(Array.get(value, i)));
			}
		}
		else {
			values.add(String.valueOf(value));
		}
		return values;
	}

	private static void assertReported(List<String> violations, String subject, String reason) {
		assertTrue(violations.stream().anyMatch(v -> v.contains(subject) && v.contains(reason)),
				"Expected a violation naming " + subject + " (" + reason + "), but got: " + violations);
	}

	/** The fixture controls: {@code clean} and the registered {@code shared} break no rule and are never reported. */
	private static void assertCleanModulesUnreported(List<String> violations) {
		assertTrue(violations.stream().noneMatch(v -> v.contains(FIXTURE_BASE + ".clean")
						|| v.contains(FIXTURE_BASE + ".shared")),
				"Expected the well-shaped fixture modules to pass, but got: " + violations);
	}
}
