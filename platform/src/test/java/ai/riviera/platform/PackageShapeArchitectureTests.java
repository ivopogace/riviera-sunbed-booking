package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Locks the <strong>ADR-0007 two-template package layout</strong> so the shape cannot regress —
 * the machine-checkable (structural) half of {@code riviera-review-overlay} <strong>RV-BE-12</strong>.
 * A fast, context-free ArchUnit test (sibling to {@link JdbcOnlyArchitectureTests} / {@link
 * ModularityTests} — no Spring context, no DB, runs anywhere), added once all six modules were
 * migrated to the new shape (#72, item 10/10).
 *
 * <p>Each bounded-context module under {@code ai.riviera.platform} uses one of two templates
 * (published surfaces optional per kind — ADR-0007 Amendment 1 / issue #95):
 * <ul>
 *   <li><strong>full</strong> — {@code api?} / {@code spi?} / {@code vocabulary?} / {@code events?} /
 *       {@code application} / {@code domain} / {@code adapter/{in,out}} (today: booking, venue,
 *       payment, payout, availability, operator);</li>
 *   <li><strong>thin</strong> — {@code api} / {@code vocabulary?} / {@code adapter/out} only
 *       (today: customer).</li>
 * </ul>
 * The four assertions below are the structural rules ADR-0007's "Enforcement" section calls out.
 * The <em>thin-vs-full judgment</em> (whether a serviceless module should stay thin or graduate)
 * and the <em>use-case-slicing</em> call (booking's {@code application/{reserve,cancel,refund,view}})
 * are deliberately <strong>review-only</strong> — so this rule keys on the module-agnostic
 * <strong>union</strong> allowed-set {@code {api, spi, vocabulary, events, application, domain,
 * adapter}}, never on a per-module classification. Which <em>kind</em> of type may live in which
 * published surface is {@link PublishedSurfacePlacementArchitectureTests}' job.
 *
 * <p>Root-level platform config ({@code PlatformApplication}, {@code SecurityConfig},
 * {@code WebCorsConfig}, {@code TimeConfig}, …) sits directly under {@code ai.riviera.platform} and is
 * <strong>not</strong> a module — it is excluded from the package-shape assertions.
 */
class PackageShapeArchitectureTests {

	private static final String BASE = "ai.riviera.platform";

	/**
	 * The top-level package set any module may use; a thin module uses the subset
	 * {@code {api, vocabulary, adapter}}.
	 * {@code vocabulary} and {@code events} joined the set with issue #95 (improvement-plan B2): the
	 * published surface is split by kind — {@code api} = ports only, {@code vocabulary} = published typed
	 * ids / value types, {@code events} = published domain events — each its own top-level
	 * {@code @NamedInterface}, following the {@code spi} precedent that published surfaces are top-level
	 * siblings. Placement (which kind of type belongs in which surface) is enforced by
	 * {@link PublishedSurfacePlacementArchitectureTests}.
	 */
	private static final Set<String> ALLOWED_TOP_LEVEL =
			Set.of("api", "spi", "vocabulary", "events", "application", "domain", "adapter");

	/** The immediate children the adapter layer may have — direction, never technology (ADR-0007 sub-decision 1). */
	private static final Set<String> ALLOWED_ADAPTER_CHILDREN = Set.of("in", "out");

	/** The {@code @NamedInterface} packages, which must appear only as a direct child of a module. */
	private static final Set<String> NAMED_INTERFACE_PACKAGES = Set.of("api", "spi", "vocabulary", "events");

	private static final JavaClasses PRODUCTION_CLASSES = new ClassFileImporter()
			.withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
			.importPackages(BASE);

	/**
	 * Assertion 1 — allowed top-level package set (ADR-0007). Each module's top-level packages (the
	 * segment directly under {@code ai.riviera.platform.<module>}) must be in
	 * {@code {api, spi, application, domain, adapter}} — fails a lingering {@code infrastructure/} — AND
	 * no class may sit in {@code <module>.application.in} / {@code .application.out}: the application-layer
	 * {@code in}/{@code out} split was folded away (sub-decision 2), direction now lives at the adapter layer.
	 */
	@Test
	void moduleTopLevelPackagesAreInTheAllowedSet() {
		List<String> violations = new ArrayList<>();
		Set<String> modules = new TreeSet<>();

		for (JavaClass type : PRODUCTION_CLASSES) {
			String[] sub = moduleRelativeSegments(type);
			if (sub == null) {
				continue; // root-level platform config, not a module
			}
			modules.add(moduleOf(type));
			if (sub.length == 0) {
				continue; // the module root itself (e.g. package-info)
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

		assertModulesWereInspected(modules);
		assertNoViolations("allowed top-level package set", violations);
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
		List<String> violations = new ArrayList<>();
		Set<String> modules = new TreeSet<>();

		for (JavaClass type : PRODUCTION_CLASSES) {
			String[] sub = moduleRelativeSegments(type);
			if (sub == null || sub.length == 0 || !"adapter".equals(sub[0])) {
				continue;
			}
			modules.add(moduleOf(type));
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

		assertModulesWereInspected(modules);
		assertNoViolations("adapter direction split", violations);
	}

	/**
	 * Assertion 3 — the {@code @NamedInterface} packages ({@code api} / {@code spi} /
	 * {@code vocabulary} / {@code events}, the last two since issue #95) are top-level (ADR-0007).
	 * Each must be a direct child of the module, never nested (no {@code application.api},
	 * {@code adapter.in.events}, …) — nesting would hide the published surface from Spring Modulith,
	 * and the four names are reserved for published surfaces even as internal package names.
	 */
	@Test
	void namedInterfacePackagesAreTopLevel() {
		List<String> violations = new ArrayList<>();
		Set<String> modules = new TreeSet<>();

		for (JavaClass type : PRODUCTION_CLASSES) {
			String[] sub = moduleRelativeSegments(type);
			if (sub == null) {
				continue;
			}
			modules.add(moduleOf(type));
			for (int i = 1; i < sub.length; i++) { // i == 0 is the legitimate top-level position
				if (NAMED_INTERFACE_PACKAGES.contains(sub[i])) {
					violations.add(type.getName() + " nests a '" + sub[i] + "' package below the module root — "
							+ "api/spi/vocabulary/events are reserved top-level @NamedInterface package names, "
							+ "never nested (ADR-0007 + issue #95)");
				}
			}
		}

		assertModulesWereInspected(modules);
		assertNoViolations("api/spi are top-level", violations);
	}

	/**
	 * Assertion 4 — hexagon direction. The inside ({@code application} + {@code domain}) must not depend
	 * on the outside ({@code adapter.*}); adapters depend inward on the application/domain, never the
	 * reverse (Cockburn's inside/outside asymmetry, ADR-0007).
	 */
	@Test
	void applicationAndDomainDoNotDependOnAdapters() {
		ArchRule rule = noClasses()
				.that().resideInAnyPackage(BASE + "..application..", BASE + "..domain..")
				.should().dependOnClassesThat().resideInAnyPackage(BASE + "..adapter..")
				.because("the hexagon runs adapter -> application/domain, never back: the inside "
						+ "(application + domain) must not depend on the outside (adapter.*) (ADR-0007).");
		rule.check(PRODUCTION_CLASSES);
	}

	/**
	 * The module-relative package segments of a production type — the part after
	 * {@code ai.riviera.platform.<module>}. Returns {@code null} for a root-level platform class (package
	 * == {@code ai.riviera.platform}), which is app-wide config, not a module. An empty array means the
	 * class sits in the module root package itself.
	 */
	private static String[] moduleRelativeSegments(JavaClass type) {
		String pkg = type.getPackageName();
		if (!pkg.startsWith(BASE + ".")) {
			return null; // the root package (== BASE) or anything outside it
		}
		String[] all = pkg.substring(BASE.length() + 1).split("\\.");
		String[] sub = new String[all.length - 1];
		System.arraycopy(all, 1, sub, 0, sub.length);
		return sub;
	}

	private static String moduleOf(JavaClass type) {
		String pkg = type.getPackageName();
		String rest = pkg.substring(BASE.length() + 1);
		int dot = rest.indexOf('.');
		return dot < 0 ? rest : rest.substring(0, dot);
	}

	/** Guards against a vacuously-green rule: prove the import actually saw the modules. */
	private static void assertModulesWereInspected(Set<String> modules) {
		assertFalse(modules.isEmpty(),
				"No modules found under " + BASE + " — the rule would be vacuously green; "
						+ "check the ClassFileImporter package/import options.");
	}

	private static void assertNoViolations(String ruleName, List<String> violations) {
		assertTrue(violations.isEmpty(),
				"ADR-0007 package-shape violations (" + ruleName + "):\n  " + String.join("\n  ", violations));
	}
}
